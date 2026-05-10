import { getSupabaseServer } from "@/lib/supabase/server";
import { getHistoricalBlocksFromChainages } from "@/lib/psp-logic";
import type { CompactionTemplateData } from "@/lib/reporting/compaction";
import { renderCompactionHTML } from "@/lib/reports/compaction-html";
import { getPenetrometerSnForTemplate } from "@/lib/location-app-config";
import fs from "fs";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

async function getBrowser() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 900 },
      executablePath,
      headless: true,
    });
  }

  const localChromePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.CHROME_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
  ].filter(Boolean) as string[];

  const executablePath = localChromePaths.find((p) => {
    try {
      fs.accessSync(p);
      return true;
    } catch {
      return false;
    }
  });

  if (!executablePath) {
    throw new Error(
      "Chrome not found for local PDF generation. Install Google Chrome or set CHROME_PATH env var.",
    );
  }

  return puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1200, height: 900 },
    executablePath,
    headless: true,
  });
}

function formatDatePerth(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Perth",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return formatter.format(date);
}

export async function resolvePspLocation(locationId: string | null, locationName: string | null) {
  if (!locationId && !locationName) return null;
  const supabase = getSupabaseServer({ useServiceRole: true });
  let resolvedLocationId = locationId ?? "";
  let resolvedLocationName = locationName ?? "";
  let penetrometerSn: string | null = null;

  if (!resolvedLocationId && locationName) {
    const { data: locationRow, error } = await supabase
      .from("locations")
      .select("id,name,app_config")
      .eq("location_type", "psp")
      .eq("name", locationName)
      .maybeSingle();
    if (error || !locationRow) return null;
    resolvedLocationId = locationRow.id;
    resolvedLocationName = locationRow.name;
    penetrometerSn = getPenetrometerSnForTemplate(locationRow) || null;
  }

  if (resolvedLocationId && !resolvedLocationName) {
    const { data: locationRow } = await supabase
      .from("locations")
      .select("name,app_config")
      .eq("location_type", "psp")
      .eq("id", resolvedLocationId)
      .maybeSingle();
    resolvedLocationName = locationRow?.name ?? resolvedLocationId;
    const fromRow = getPenetrometerSnForTemplate(locationRow ?? undefined);
    penetrometerSn = fromRow || penetrometerSn;
  }

  return { locationId: resolvedLocationId, locationName: resolvedLocationName, penetrometerSn };
}

export async function generateCompactionPdfFromHTML(data: CompactionTemplateData) {
  const html = renderCompactionHTML(data);
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
  });

  await browser.close();
  return {
    buffer: Buffer.from(pdfBuffer),
    contentType: "application/pdf",
    fileName: `ITR-EXB-003_${Date.now()}.pdf`,
  };
}

export async function generateITRExb003Pdf(params: {
  locationId: string;
  locationName: string;
  reportNum: number;
  includeOpen: boolean;
  penetrometerSn: string | null;
}) {
  const supabase = getSupabaseServer({ useServiceRole: true });
  const { locationId, locationName, reportNum, includeOpen, penetrometerSn } = params;

  const { data: chainageRows, error: chainageError } = await supabase
    .from("psp_records")
    .select("chainage")
    .eq("location_id", locationId);
  if (chainageError) throw new Error(chainageError.message);

  const chainages = (chainageRows ?? [])
    .map((row) => row.chainage)
    .filter((value) => Number.isFinite(value));
  const blocks = getHistoricalBlocksFromChainages(chainages);
  const block = blocks.find((item) => item.index === reportNum);
  if (!block) throw new Error("Report block not found");
  if (block.status === "OPEN" && !includeOpen) {
    throw new Error("Report is open and includeOpen=false");
  }

  const { data: records, error: recordsError } = await supabase
    .from("psp_records")
    .select(
      "recorded_at,updated_at,completed_at,chainage,layers_required,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,l4_150,l4_450,l4_750,l5_150,l5_450,l5_750,site_inspector",
    )
    .eq("location_id", locationId)
    .in("chainage", block.expected)
    .order("chainage", { ascending: false });
  if (recordsError) throw new Error(recordsError.message);

  const recordMap = new Map<number, (typeof records)[number]>();
  (records ?? []).forEach((record) => {
    recordMap.set(record.chainage, record);
  });

  const reportDate = formatDatePerth(new Date().toISOString());
  const recordsPayload = block.expected.map((chainage) => {
    const record = recordMap.get(chainage);
    const recordedAt = record?.recorded_at ?? null;
    const updatedAt = record?.updated_at ?? recordedAt;
    const initialFmt = recordedAt ? formatDatePerth(recordedAt) : "";
    const updatedFmt =
      updatedAt != null ? formatDatePerth(updatedAt as string) : initialFmt;
    return {
      date: initialFmt,
      date_initial: initialFmt,
      date_updated: updatedFmt,
      record_status: record
        ? record.completed_at
          ? "COMPLETE"
          : "INCOMPLETE"
        : "",
      layers_required: record?.layers_required ?? 3,
      ch: record ? chainage : "",
      l1_a: record?.l1_150 ?? "",
      l1_b: record?.l1_450 ?? "",
      l1_c: record?.l1_750 ?? "",
      l2_a: record?.l2_150 ?? "",
      l2_b: record?.l2_450 ?? "",
      l2_c: record?.l2_750 ?? "",
      l3_a: record?.l3_150 ?? "",
      l3_b: record?.l3_450 ?? "",
      l3_c: record?.l3_750 ?? "",
      l4_a: record?.l4_150 ?? "",
      l4_b: record?.l4_450 ?? "",
      l4_c: record?.l4_750 ?? "",
      l5_a: record?.l5_150 ?? "",
      l5_b: record?.l5_450 ?? "",
      l5_c: record?.l5_750 ?? "",
    };
  });

  let supervisorName = "";
  for (let idx = block.expected.length - 1; idx >= 0; idx -= 1) {
    const record = recordMap.get(block.expected[idx]);
    if (record?.site_inspector) {
      supervisorName = record.site_inspector;
      break;
    }
  }

  const templateData: CompactionTemplateData = {
    REPORT_DATE: reportDate,
    SUPERVISOR_NAME: supervisorName,
    WORK_LOCATION: locationName,
    PENETROMETER_SN: penetrometerSn ?? "",
    records: recordsPayload,
  };

  const result = await generateCompactionPdfFromHTML(templateData);
  return { buffer: result.buffer, block };
}
