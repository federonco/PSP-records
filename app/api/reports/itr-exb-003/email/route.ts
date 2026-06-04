import { NextRequest, NextResponse } from "next/server";
import {
  sendEmail,
  getSenderAddress,
  buildHtmlBody,
} from "@/lib/email";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  generateITRExb003Pdf,
  generateITRExb003PdfForCompactionReport,
  resolvePspLocation,
} from "@/lib/reporting/itr-exb-003";

export const runtime = "nodejs";
export const maxDuration = 60;


function extractErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const anyError = error as { message?: string };
    return anyError.message ?? "Email failed";
  }
  return "Email failed";
}

async function resolveReportDisplayName(params: {
  unifiedSectionId?: string | null;
  subsectionId?: string | null;
  locationId?: string | null;
  fallbackName?: string | null;
}) {
  const supabase = getSupabaseServer({ useServiceRole: true });
  let displayName = params.fallbackName?.trim() ?? "";
  let penetrometerSn: string | null = null;

  if (params.locationId) {
    const resolved = await resolvePspLocation(params.locationId, null);
    if (resolved) {
      displayName = resolved.locationName;
      penetrometerSn = resolved.penetrometerSn;
    }
  }

  if (!displayName && params.subsectionId) {
    const { data: subsection } = await supabase
      .from("subsections")
      .select("name")
      .eq("id", params.subsectionId)
      .maybeSingle();
    displayName = subsection?.name ?? "";
  }

  if (!displayName && params.unifiedSectionId) {
    const { data: section } = await supabase
      .from("sections")
      .select("name")
      .eq("id", params.unifiedSectionId)
      .maybeSingle();
    displayName = section?.name ?? "";
  }

  return {
    displayName: displayName || "PSP Section",
    penetrometerSn,
  };
}


export async function POST(request: NextRequest) {
  const gate = await requireOnSiteBAdmin(request);
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const reportId = (body.report_id ?? body.reportId ?? null) as string | null;
  const reportNum = Number.parseInt(String(body.reportNum ?? ""), 10);
  const includeOpen = Boolean(body.includeOpen);
  const locationId = (body.location_id ?? body.locationId ?? null) as string | null;
  const locationName = (body.location_name ?? body.locationName ?? null) as string | null;
  const recipientEmail = (body.recipientEmail ?? body.toEmail ?? null) as string | null;
  const recipient = recipientEmail?.trim() || process.env.REPORT_DEFAULT_EMAIL?.trim() || null;

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is required" },
      { status: 500 },
    );
  }

  if (!recipient) {
    return NextResponse.json(
      { error: "Missing email recipient. Provide recipientEmail in the request body or set REPORT_DEFAULT_EMAIL." },
      { status: 400 },
    );
  }

  try {
    const supabase = getSupabaseServer({ useServiceRole: true });
    let buffer: Buffer;
    let block: { status: "OPEN" | "READY"; pending: number[]; index: number };
    let resolvedLocationName = locationName?.trim() ?? "";

    if (reportId) {
      const { data: report, error: reportError } = await supabase
        .from("psp_reports")
        .select(
          "id,block_key,block_index,pending_chainages,status,location_id,unified_section_id,subsection_id,report_type",
        )
        .eq("id", reportId)
        .maybeSingle();

      if (reportError || !report) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      if (report.report_type !== "compaction" || !report.block_key) {
        return NextResponse.json({ error: "Invalid compaction report" }, { status: 400 });
      }

      const meta = await resolveReportDisplayName({
        unifiedSectionId: report.unified_section_id,
        subsectionId: report.subsection_id,
        locationId: report.location_id,
        fallbackName: locationName,
      });
      resolvedLocationName = meta.displayName;

      const result = await generateITRExb003PdfForCompactionReport({
        blockKey: report.block_key,
        blockIndex: report.block_index,
        pendingChainages: report.pending_chainages,
        reportStatus: report.status,
        unifiedSectionId: report.unified_section_id,
        subsectionId: report.subsection_id,
        locationId: report.location_id,
        locationName: meta.displayName,
        includeOpen,
        penetrometerSn: meta.penetrometerSn,
      });
      buffer = result.buffer;
      block = result.block;
    } else {
      if (Number.isNaN(reportNum)) {
        return NextResponse.json({ error: "Missing reportNum" }, { status: 400 });
      }
      if (!locationId && !locationName) {
        return NextResponse.json(
          { error: "Missing location_id or location_name" },
          { status: 400 },
        );
      }

      const resolved = await resolvePspLocation(locationId, locationName);
      if (!resolved) {
        return NextResponse.json({ error: "Location not found" }, { status: 404 });
      }
      resolvedLocationName = resolved.locationName;

      const result = await generateITRExb003Pdf({
        locationId: resolved.locationId,
        locationName: resolved.locationName,
        reportNum,
        includeOpen,
        penetrometerSn: resolved.penetrometerSn,
      });
      buffer = result.buffer;
      block = result.block;
    }

    const safeLocation = resolvedLocationName.replace(/\s+/g, "-");
    const reportLabel = reportId ? block.index : reportNum;
    const pending = block.status === "OPEN" ? block.pending.join(", ") : "";
    const textBody = `Location: ${resolvedLocationName}\nReport #: ${reportLabel}\n${
      pending ? `Pending CH: ${pending}\n` : ""
    }`;
    await sendEmail({
      from: getSenderAddress(),
      to: recipient,
      subject: `PSP Record - ${resolvedLocationName} - Rep #${reportLabel}`,
      text: textBody,
      html: buildHtmlBody(textBody),
      attachments: [
        {
          filename: `ITR-EXB-003_${safeLocation}_Rep${reportLabel}.pdf`,
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
