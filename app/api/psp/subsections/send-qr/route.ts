import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import {
  buildQrEmailHtml,
  buildQrEmailText,
  getSenderAddress,
  sendEmail,
} from "@/lib/email";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ensureSubsectionQrToken } from "@/lib/psp/unified-qr";
import { generateSectionQrPdf } from "@/lib/reporting/section-qr-pdf";

export const runtime = "nodejs";

function safePdfFilename(name: string) {
  const cleaned =
    name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Subsection";
  return `QR-${cleaned}.pdf`;
}

export async function POST(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  let body: { subsectionId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subsectionId = body.subsectionId?.trim();
  const email = body.email?.trim();
  if (!subsectionId || !email) {
    return NextResponse.json(
      { error: "Missing subsectionId or email" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: row, error: secErr } = await supabase
    .from("subsections")
    .select("id,name,section_id,sections(name)")
    .eq("id", subsectionId)
    .single();

  if (secErr || !row) {
    return NextResponse.json(
      { error: secErr?.message ?? "Subsection not found" },
      { status: 404 },
    );
  }

  const subsectionName = row.name as string;
  const parent = row.sections as
    | { name: string }
    | { name: string }[]
    | null
    | undefined;
  const parentRow = Array.isArray(parent) ? parent[0] : parent;
  const sectionName =
    parentRow?.name && String(parentRow.name).trim()
      ? String(parentRow.name).trim()
      : null;

  try {
    const { url } = await ensureSubsectionQrToken(supabase, subsectionId);
    const pdfTitle = sectionName ?? subsectionName;
    const pdfSubtitle = sectionName ? subsectionName : undefined;
    const pdfBuffer = await generateSectionQrPdf({
      title: pdfTitle,
      ...(pdfSubtitle ? { subtitle: pdfSubtitle } : {}),
      qrUrl: url,
    });
    const fileLabel = sectionName
      ? `${sectionName} - ${subsectionName}`
      : subsectionName;
    const filename = safePdfFilename(fileLabel);
    const mailLabel = sectionName
      ? `${sectionName} — ${subsectionName}`
      : subsectionName;

    await sendEmail({
      from: getSenderAddress(),
      to: email,
      subject: sectionName
        ? `QR Code — ${sectionName} — ${subsectionName}`
        : `QR Code — ${subsectionName}`,
      text: buildQrEmailText(mailLabel, url),
      html: buildQrEmailHtml(mailLabel, url),
      attachments: [
        {
          filename,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to send QR email";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
