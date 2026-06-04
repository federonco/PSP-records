import { getSupabaseServer } from "@/lib/supabase/server";
import { CHAINAGE_STEP } from "@/lib/psp";
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

const RECORD_SELECT =
  "recorded_at,updated_at,completed_at,chainage,layers_required,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,l4_150,l4_450,l4_750,l5_150,l5_450,l5_750,site_inspector";

type PspRecordRow = {
  recorded_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
  chainage: number;
  layers_required: number | null;
  l1_150: number | null;
  l1_450: number | null;
  l1_750: number | null;
  l2_150: number | null;
  l2_450: number | null;
  l2_750: number | null;
  l3_150: number | null;
  l3_450: number | null;
  l3_750: number | null;
  l4_150: number | null;
  l4_450: number | null;
  l4_750: number | null;
  l5_150: number | null;
  l5_450: number | null;
  l5_750: number | null;
  site_inspector: string | null;
};

export function chainagesFromBlockKey(blockKey: string): number[] {
  const parts = blockKey.split("-");
  if (parts.length < 2) {
    throw new Error("Invalid block key");
  }
  const max = Number(parts[0]);
  const start = Number(parts[1]);
  if (!Number.isFinite(max) || !Number.isFinite(start)) {
    throw new Error("Invalid block key");
  }
  const chainages: number[] = [];
  for (let value = max; value >= start; value -= CHAINAGE_STEP) {
    chainages.push(value);
  }
  return chainages;
}

function buildCompactionBlockInfo(params: {
  expected: number[];
  blockIndex?: number | null;
  pendingChainages?: number[] | null;
  reportStatus?: string | null;
  records: PspRecordRow[];
}) {
  const recordMap = new Map<number, PspRecordRow>();
  params.records.forEach((record) => {
    recordMap.set(record.chainage, record);
  });
  const pending =
    params.pendingChainages ??
    params.expected.filter((chainage) => {
      const record = recordMap.get(chainage);
      return !record?.completed_at;
    });
  const status =
    params.reportStatus === "OPEN" || pending.length > 0 ? "OPEN" : "READY";
  return {
    index: params.blockIndex ?? 0,
    expected: params.expected,
    status: status as "OPEN" | "READY",
    pending,
    recordMap,
  };
}

async function buildITRExb003PdfFromRecords(params: {
  locationName: string;
  penetrometerSn: string | null;
  expected: number[];
  blockIndex?: number | null;
  pendingChainages?: number[] | null;
  reportStatus?: string | null;
  includeOpen: boolean;
  records: PspRecordRow[];
}) {
  const block = buildCompactionBlockInfo({
    expected: params.expected,
    blockIndex: params.blockIndex,
    pendingChainages: params.pendingChainages,
    reportStatus: params.reportStatus,
    records: params.records,
  });
  if (block.status === "OPEN" && !params.includeOpen) {
    throw new Error("Report is open and includeOpen=false");
  }

  const reportDate = formatDatePerth(new Date().toISOString());
  const recordsPayload = block.expected.map((chainage) => {
    const record = block.recordMap.get(chainage);
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
    const record = block.recordMap.get(block.expected[idx]);
    if (record?.site_inspector) {
      supervisorName = record.site_inspector;
      break;
    }
  }

  const templateData: CompactionTemplateData = {
    REPORT_DATE: reportDate,
    SUPERVISOR_NAME: supervisorName,
    WORK_LOCATION: params.locationName,
    PENETROMETER_SN: params.penetrometerSn ?? "",
    records: recordsPayload,
  };

  const result = await generateCompactionPdfFromHTML(templateData);
  return {
    buffer: result.buffer,
    block: {
      index: block.index,
      expected: block.expected,
      status: block.status,
      pending: block.pending,
    },
  };
}

async function fetchScopedCompactionRecords(params: {
  expected: number[];
  unifiedSectionId?: string | null;
  subsectionId?: string | null;
  locationId?: string | null;
}) {
  const supabase = getSupabaseServer({ useServiceRole: true });
  let recordsQuery = supabase
    .from("psp_records")
    .select(RECORD_SELECT)
    .in("chainage", params.expected);

  if (params.unifiedSectionId) {
    recordsQuery = recordsQuery.eq("unified_section_id", params.unifiedSectionId);
    if (params.subsectionId) {
      recordsQuery = recordsQuery.eq("subsection_id", params.subsectionId);
    } else {
      recordsQuery = recordsQuery.is("subsection_id", null);
    }
  } else if (params.locationId) {
    recordsQuery = recordsQuery.eq("location_id", params.locationId);
  } else {
    throw new Error("Report scope missing unified section or location");
  }

  const { data: records, error: recordsError } = await recordsQuery.order(
    "chainage",
    { ascending: false },
  );
  if (recordsError) throw new Error(recordsError.message);
  return (records ?? []) as PspRecordRow[];
}

export async function generateITRExb003PdfForCompactionReport(params: {
  blockKey: string;
  blockIndex?: number | null;
  pendingChainages?: number[] | null;
  reportStatus?: string | null;
  unifiedSectionId?: string | null;
  subsectionId?: string | null;
  locationId?: string | null;
  locationName: string;
  includeOpen: boolean;
  penetrometerSn: string | null;
}) {
  const expected = chainagesFromBlockKey(params.blockKey);
  const records = await fetchScopedCompactionRecords({
    expected,
    unifiedSectionId: params.unifiedSectionId,
    subsectionId: params.subsectionId,
    locationId: params.locationId,
  });
  return buildITRExb003PdfFromRecords({
    locationName: params.locationName,
    penetrometerSn: params.penetrometerSn,
    expected,
    blockIndex: params.blockIndex,
    pendingChainages: params.pendingChainages,
    reportStatus: params.reportStatus,
    includeOpen: params.includeOpen,
    records,
  });
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

  const records = await fetchScopedCompactionRecords({
    expected: block.expected,
    locationId,
  });
  return buildITRExb003PdfFromRecords({
    locationName,
    penetrometerSn,
    expected: block.expected,
    blockIndex: block.index,
    pendingChainages: block.pending,
    reportStatus: block.status,
    includeOpen,
    records,
  });
}
