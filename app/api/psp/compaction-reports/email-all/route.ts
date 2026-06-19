import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { sendEmail, getSenderAddress, buildHtmlBody } from "@/lib/email";
import {
  generateITRExb003PdfForCompactionReport,
  resolvePspLocation,
} from "@/lib/reporting/itr-exb-003";

export const runtime = "nodejs";
export const maxDuration = 60;

async function normalizePdfBuffer(buf: unknown): Promise<Buffer> {
  if (buf instanceof Promise) {
    const resolved = await buf;
    return normalizePdfBuffer(resolved);
  }
  if (Buffer.isBuffer(buf)) return buf;
  if (buf instanceof Uint8Array) return Buffer.from(buf);
  if (buf instanceof ArrayBuffer) return Buffer.from(new Uint8Array(buf));
  if (buf && typeof (buf as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
    const ab = await (buf as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(new Uint8Array(ab));
  }
  if (buf && typeof (buf as { pipe?: (...args: unknown[]) => unknown }).pipe === "function") {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      (buf as NodeJS.ReadableStream).on("data", (chunk: Buffer) => chunks.push(chunk));
      (buf as NodeJS.ReadableStream).on("end", () => resolve(Buffer.concat(chunks)));
      (buf as NodeJS.ReadableStream).on("error", reject);
    });
  }
  throw new Error(`Unsupported PDF buffer type: ${(buf as { constructor?: { name?: string } })?.constructor?.name ?? "unknown"}`);
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireOnSiteBAdmin(request);
    if (!gate.ok) return gate.response;

    const body = await request.json();
    const unifiedSectionId = body?.unified_section_id as string | undefined;
    const subsectionId = (body?.subsection_id as string | null | undefined) ?? null;
    const recipientEmail = body?.recipient_email as string | undefined;

    if (!unifiedSectionId || !recipientEmail) {
      return NextResponse.json(
        { error: "Missing required params" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServer({ useServiceRole: true });

    const { data: section, error: sectionError } = await supabase
      .from("sections")
      .select("id,name")
      .eq("id", unifiedSectionId)
      .single();
    if (sectionError || !section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    let subsectionName: string | null = null;
    if (subsectionId) {
      const { data: subsection } = await supabase
        .from("subsections")
        .select("name")
        .eq("id", subsectionId)
        .maybeSingle();
      subsectionName = subsection?.name ?? null;
    }

    let reportsQuery = supabase
      .from("psp_reports")
      .select("*")
      .eq("unified_section_id", unifiedSectionId)
      .eq("report_type", "compaction")
      .order("block_key", { ascending: false });

    if (subsectionId) {
      reportsQuery = reportsQuery.eq("subsection_id", subsectionId);
    } else {
      reportsQuery = reportsQuery.is("subsection_id", null);
    }

    const { data: reports, error: reportsError } = await reportsQuery;
    if (reportsError) {
      return NextResponse.json({ error: reportsError.message }, { status: 500 });
    }
    if (!reports || reports.length === 0) {
      return NextResponse.json({ error: "No ready reports found" }, { status: 404 });
    }

    const scopeDisplayName = subsectionName ?? section.name;
    const pdfBuffers: Buffer[] = [];
    const locationCache = new Map<string, { locationName: string; penetrometerSn: string | null }>();

    for (const report of reports) {
      if (!report.block_key) continue;

      let displayName = scopeDisplayName;
      let penetrometerSn: string | null = null;
      const locationId = report.location_id ? String(report.location_id).trim() : "";

      if (locationId) {
        let locationMeta = locationCache.get(locationId);
        if (!locationMeta) {
          const resolvedLocation = await resolvePspLocation(locationId, null);
          if (resolvedLocation) {
            locationMeta = {
              locationName: resolvedLocation.locationName,
              penetrometerSn: resolvedLocation.penetrometerSn,
            };
            locationCache.set(locationId, locationMeta);
          }
        }
        if (locationMeta) {
          displayName = locationMeta.locationName;
          penetrometerSn = locationMeta.penetrometerSn;
        }
      }

      try {
        const result = await generateITRExb003PdfForCompactionReport({
          blockKey: report.block_key,
          blockIndex: report.block_index,
          pendingChainages: report.pending_chainages,
          reportStatus: report.status,
          unifiedSectionId: report.unified_section_id,
          subsectionId: report.subsection_id,
          locationId: report.location_id,
          locationName: displayName,
          includeOpen: true,
          penetrometerSn,
        });
        const buffer = await normalizePdfBuffer(result.buffer ?? result);
        pdfBuffers.push(buffer);
      } catch (error) {
        console.error("[email-all] PDF generation failed for report", report.id, error);
      }
    }

    if (pdfBuffers.length === 0) {
      return NextResponse.json({ error: "No PDFs generated" }, { status: 500 });
    }

    const mergedPdf = await PDFDocument.create();
    const font = await mergedPdf.embedFont(StandardFonts.Helvetica);
    for (const buffer of pdfBuffers) {
      const pdf = await PDFDocument.load(new Uint8Array(buffer));
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }
    const pages = mergedPdf.getPages();
    const totalPages = pages.length;
    pages.forEach((page, i) => {
      const { width } = page.getSize();
      page.drawText(`${i + 1} of ${totalPages}`, {
        x: width / 2 - 20,
        y: 20,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
    });
    const mergedBytes = await mergedPdf.save();
    const mergedBuffer = Buffer.from(mergedBytes);

    const sectionLabel = section?.name ?? "Section";
    const subsectionLabel = subsectionId ? " - Subsection" : "";
    const safeSection = sectionLabel.replace(/\s+/g, "-");
    const textBody = `Please find attached all ready PSP compaction reports for ${sectionLabel}${subsectionLabel}.\nTotal reports: ${pdfBuffers.length}`;

    await sendEmail({
      from: getSenderAddress(),
      to: recipientEmail,
      subject: `PSP Compaction Reports — ${sectionLabel}${subsectionLabel}`,
      text: textBody,
      html: buildHtmlBody(textBody),
      attachments: [
        {
          filename: `PSP-Reports-${safeSection}.pdf`,
          content: mergedBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      reports_sent: pdfBuffers.length,
    });
  } catch (error) {
    console.error("[email-all] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
