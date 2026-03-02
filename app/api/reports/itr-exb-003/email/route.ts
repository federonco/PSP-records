import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getHistoricalBlocksFromChainages } from "@/lib/psp-logic";
import { getGoogleDocsClient, getGoogleDriveClient } from "@/app/lib/google/auth";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

type ReportRecord = {
  date: string;
  ch: string | number;
  l1_a: string | number;
  l1_b: string | number;
  l1_c: string | number;
  l2_a: string | number;
  l2_b: string | number;
  l2_c: string | number;
  l3_a: string | number;
  l3_b: string | number;
  l3_c: string | number;
};

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

function extractGoogleErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const anyError = error as { message?: string; response?: { data?: any; status?: number } };
    const apiMessage =
      anyError.response?.data?.error?.message ||
      anyError.response?.data?.message ||
      anyError.message;
    const status = anyError.response?.status;
    if (apiMessage && status) {
      return `${apiMessage} (status ${status})`;
    }
    if (apiMessage) return apiMessage;
  }
  return "Email failed";
}

function buildMarkerMap(payload: {
  reportDate: string;
  reportNum: number;
  workLocation: string;
  supervisorName: string;
  records: ReportRecord[];
}) {
  const markers: Record<string, string> = {
    REPORT_DATE: payload.reportDate,
    REPORT_NUMBER: String(payload.reportNum),
    WORK_LOCATION: payload.workLocation,
    SUPERVISOR_NAME: payload.supervisorName,
  };

  const padded = Array.from({ length: 10 }, (_, idx) => payload.records[idx] ?? {});
  padded.forEach((rec, idx) => {
    markers[`DATE_${idx}`] = rec.date ? String(rec.date) : "";
    markers[`CH_${idx}`] = rec.ch !== undefined ? String(rec.ch) : "";
    markers[`L1_A_${idx}`] = rec.l1_a !== undefined ? String(rec.l1_a) : "";
    markers[`L1_B_${idx}`] = rec.l1_b !== undefined ? String(rec.l1_b) : "";
    markers[`L1_C_${idx}`] = rec.l1_c !== undefined ? String(rec.l1_c) : "";
    markers[`L2_A_${idx}`] = rec.l2_a !== undefined ? String(rec.l2_a) : "";
    markers[`L2_B_${idx}`] = rec.l2_b !== undefined ? String(rec.l2_b) : "";
    markers[`L2_C_${idx}`] = rec.l2_c !== undefined ? String(rec.l2_c) : "";
    markers[`L3_A_${idx}`] = rec.l3_a !== undefined ? String(rec.l3_a) : "";
    markers[`L3_B_${idx}`] = rec.l3_b !== undefined ? String(rec.l3_b) : "";
    markers[`L3_C_${idx}`] = rec.l3_c !== undefined ? String(rec.l3_c) : "";
  });

  return markers;
}

async function resolveLocation(locationId: string | null, locationName: string | null) {
  if (!locationId && !locationName) return null;
  const supabase = getSupabaseServer({ useServiceRole: true });
  let resolvedLocationId = locationId ?? "";
  let resolvedLocationName = locationName ?? "";

  if (!resolvedLocationId && locationName) {
    const { data: locationRow, error } = await supabase
      .from("psp_locations")
      .select("id,name")
      .eq("name", locationName)
      .maybeSingle();
    if (error || !locationRow) return null;
    resolvedLocationId = locationRow.id;
    resolvedLocationName = locationRow.name;
  }

  if (resolvedLocationId && !resolvedLocationName) {
    const { data: locationRow } = await supabase
      .from("psp_locations")
      .select("name")
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

function getDefaultRecipient() {
  const allowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  const recipients = allowlist
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (recipients && recipients.length > 0) {
    return recipients.join(", ");
  }
  return process.env.SMTP_USER || "";
}

async function generatePdfFromTemplate(params: {
  locationId: string;
  locationName: string;
  reportNum: number;
  includeOpen: boolean;
}) {
  const templateId = process.env.GOOGLE_DOC_TEMPLATE_ID;
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!templateId || !driveFolderId) {
    throw new Error("Missing Google template configuration");
  }

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
  const recordsPayload: ReportRecord[] = block.expected.map((chainage) => {
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

  const markers = buildMarkerMap({
    reportDate,
    reportNum,
    workLocation: locationName,
    supervisorName,
    records: recordsPayload,
  });

  const drive = getGoogleDriveClient();
  const docs = getGoogleDocsClient();
  let copiedFileId: string | null = null;

  try {
    console.log("ITR template ID", templateId);
    console.log("Drive folder ID", driveFolderId);
    const copyResponse = await drive.files.copy({
      fileId: templateId,
      requestBody: {
        name: `ITR-EXB-003_${locationName}_Rep${reportNum}_${Date.now()}`,
        parents: [driveFolderId],
      },
      supportsAllDrives: true,
    }).catch((err) => {
      console.log("Copy error full", JSON.stringify(err?.response?.data, null, 2));
      throw err;
    });
    copiedFileId = copyResponse.data.id ?? null;
    if (copiedFileId) {
      console.log("ITR template copy", {
        copiedFileId,
        url: `https://docs.google.com/document/d/${copiedFileId}/edit`,
      });
    }
    if (!copiedFileId) throw new Error("Failed to copy template");

    const requests = Object.entries(markers).map(([key, value]) => ({
      replaceAllText: {
        containsText: { text: `{{${key}}}`, matchCase: true },
        replaceText: value ?? "",
      },
    }));
    await docs.documents.batchUpdate({
      documentId: copiedFileId,
      requestBody: { requests },
    });

    const exportResponse = await drive.files.export(
      { fileId: copiedFileId, mimeType: "application/pdf" },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(exportResponse.data as ArrayBuffer);
    return { buffer, block };
  } finally {
    if (copiedFileId) {
      await drive.files
        .delete({ fileId: copiedFileId, supportsAllDrives: true })
        .catch(() => null);
    }
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const reportNum = Number.parseInt(String(body.reportNum ?? ""), 10);
  const includeOpen = Boolean(body.includeOpen);
  const locationId = (body.location_id ?? body.locationId ?? null) as string | null;
  const locationName = (body.location_name ?? body.locationName ?? null) as string | null;
  const toEmail = (body.toEmail ?? null) as string | null;

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

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
    return NextResponse.json(
      { error: "SMTP environment variables are missing" },
      { status: 500 },
    );
  }

  try {
    const { buffer, block } = await generatePdfFromTemplate({
      locationId: resolved.locationId,
      locationName: resolved.locationName,
      reportNum,
      includeOpen,
    });
    const safeLocation = resolved.locationName.replace(/\s+/g, "-");
    const recipient = toEmail || getDefaultRecipient();
    if (!recipient) {
      return NextResponse.json({ error: "Missing email recipient" }, { status: 400 });
    }

    const pending = block.status === "OPEN" ? block.pending.join(", ") : "";
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number.parseInt(smtpPort, 10),
      secure: Number.parseInt(smtpPort, 10) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: smtpFrom,
      to: recipient,
      subject: `PSP Record - ${resolved.locationName} - Rep #${reportNum}`,
      text: `Location: ${resolved.locationName}\nReport #: ${reportNum}\n${
        pending ? `Pending CH: ${pending}\n` : ""
      }`,
      attachments: [
        {
          filename: `ITR-EXB-003_${safeLocation}_Rep${reportNum}.pdf`,
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ ok: true, message: "Email sent" });
  } catch (error) {
    console.error("ITR Google template email failed", error);
    return NextResponse.json(
      { error: extractGoogleErrorMessage(error) },
      { status: 500 },
    );
  }
}
