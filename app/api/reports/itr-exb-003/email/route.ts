import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  sendEmail,
  getSenderAddress,
  buildHtmlBody,
} from "@/lib/email";
import { getHistoricalBlocksFromChainages } from "@/lib/psp-logic";
import { renderCompactionHTML } from "@/lib/reports/compaction-html";
import type { CompactionTemplateData } from "@/lib/reporting/compaction";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  } else {
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
        "Chrome not found for local PDF generation. " +
          "Install Google Chrome or set CHROME_PATH env var to your Chrome executable path.",
      );
    }

    return puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1200, height: 900 },
      executablePath,
      headless: true,
    });
  }
}

async function generateCompactionPdfFromHTML(data: CompactionTemplateData) {
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

function extractErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const anyError = error as { message?: string };
    return anyError.message ?? "Email failed";
  }
  return "Email failed";
}

async function resolveLocation(locationId: string | null, locationName: string | null) {
  if (!locationId && !locationName) return null;
  const supabase = getSupabaseServer({ useServiceRole: true });
  let resolvedLocationId = locationId ?? "";
  let resolvedLocationName = locationName ?? "";

  if (!resolvedLocationId && locationName) {
    const { data: locationRow, error } = await supabase
      .from("locations")
      .select("id,name")
      .eq("location_type", "psp")
      .eq("name", locationName)
      .maybeSingle();
    if (error || !locationRow) return null;
    resolvedLocationId = locationRow.id;
    resolvedLocationName = locationRow.name;
  }

  if (resolvedLocationId && !resolvedLocationName) {
    const { data: locationRow } = await supabase
      .from("locations")
      .select("name")
      .eq("location_type", "psp")
      .eq("id", resolvedLocationId)
      .maybeSingle();
    resolvedLocationName = locationRow?.name ?? resolvedLocationId;
  }

  return { locationId: resolvedLocationId, locationName: resolvedLocationName };
}

async function getEmailFromToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!token) return null;
  const supabase = getSupabaseServer({ accessToken: token });
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.email ?? null;
}


async function generateITRExb003Pdf(params: {
  locationId: string;
  locationName: string;
  reportNum: number;
  includeOpen: boolean;
}) {
  const supabase = getSupabaseServer({ useServiceRole: true });
  const { locationId, locationName, reportNum, includeOpen } = params;

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
      "recorded_at,chainage,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector",
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
    return {
      date: record?.recorded_at ? formatDatePerth(record.recorded_at) : "",
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
    records: recordsPayload,
  };

  const result = await generateCompactionPdfFromHTML(templateData);
  const pdfBuffer = result.buffer;
  return { buffer: pdfBuffer, block };
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const reportNum = Number.parseInt(String(body.reportNum ?? ""), 10);
  const includeOpen = Boolean(body.includeOpen);
  const locationId = (body.location_id ?? body.locationId ?? null) as string | null;
  const locationName = (body.location_name ?? body.locationName ?? null) as string | null;
  const recipientEmail = (body.recipientEmail ?? body.toEmail ?? null) as string | null;
  const recipient = recipientEmail?.trim() || process.env.REPORT_DEFAULT_EMAIL?.trim() || null;

  if (Number.isNaN(reportNum)) {
    return NextResponse.json({ error: "Missing reportNum" }, { status: 400 });
  }
  if (!locationId && !locationName) {
    return NextResponse.json(
      { error: "Missing location_id or location_name" },
      { status: 400 },
    );
  }

  const resolved = await resolveLocation(locationId, locationName);
  if (!resolved) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const adminEmail = await getEmailFromToken(request);
  if (!adminEmail) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.ADMIN_EMAIL_ALLOWLIST && !isAdminEmail(adminEmail)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is required" },
      { status: 500 },
    );
  }

  try {
    const { buffer, block } = await generateITRExb003Pdf({
      locationId: resolved.locationId,
      locationName: resolved.locationName,
      reportNum,
      includeOpen,
    });
    const safeLocation = resolved.locationName.replace(/\s+/g, "-");
    if (!recipient) {
      return NextResponse.json(
        { error: "Missing email recipient. Provide recipientEmail in the request body or set REPORT_DEFAULT_EMAIL." },
        { status: 400 },
      );
    }

    const pending = block.status === "OPEN" ? block.pending.join(", ") : "";
    const textBody = `Location: ${resolved.locationName}\nReport #: ${reportNum}\n${
      pending ? `Pending CH: ${pending}\n` : ""
    }`;
    await sendEmail({
      from: getSenderAddress(),
      to: recipient,
      subject: `PSP Record - ${resolved.locationName} - Rep #${reportNum}`,
      text: textBody,
      html: buildHtmlBody(textBody),
      attachments: [
        {
          filename: `ITR-EXB-003_${safeLocation}_Rep${reportNum}.pdf`,
          content: buffer as unknown as Buffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ ok: true, message: "Email sent" });
  } catch (error) {
    console.error("ITR-EXB-003 email failed", error);
    return NextResponse.json(
      { error: extractErrorMessage(error) },
      { status: 500 },
    );
  }
}
