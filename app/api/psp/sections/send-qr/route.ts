import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getUserFromRequest } from "@/lib/api-auth";
import { buildHtmlBody, getSenderAddress, sendEmail } from "@/lib/email";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ensureUnifiedSectionQrToken } from "@/lib/psp/unified-qr";
import { generateSectionQrPdf } from "@/lib/reporting/section-qr-pdf";

export const runtime = "nodejs";

function safePdfFilename(sectionName: string) {
  const cleaned = sectionName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Section";
  return `QR-${cleaned}.pdf`;
}

export async function POST(request: NextRequest) {
  const { user, token } = await getUserFromRequest(request);
  if (!user || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { sectionId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sectionId = body.sectionId?.trim();
  const email = body.email?.trim();
  if (!sectionId || !email) {
    return NextResponse.json({ error: "Missing sectionId or email" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: sectionRow, error: secErr } = await supabase
    .from("sections")
    .select("id,name")
    .eq("id", sectionId)
    .single();

  if (secErr || !sectionRow) {
    return NextResponse.json({ error: secErr?.message ?? "Section not found" }, { status: 404 });
  }

  const sectionName = sectionRow.name as string;

  try {
    const { url } = await ensureUnifiedSectionQrToken(supabase, sectionId);
    const pdfBuffer = await generateSectionQrPdf(sectionName, url);
    const filename = safePdfFilename(sectionName);

    await sendEmail({
      from: getSenderAddress(),
      to: email,
      subject: `QR Code — ${sectionName}`,
      text: `Please find the QR code for ${sectionName} attached.`,
      html: buildHtmlBody(`Please find the QR code for ${sectionName} attached.`),
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
