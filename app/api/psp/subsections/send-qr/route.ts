import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getUserFromRequest } from "@/lib/api-auth";
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
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Subsection";
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

  let body: { subsectionId?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subsectionId = body.subsectionId?.trim();
  const email = body.email?.trim();
  if (!subsectionId || !email) {
    return NextResponse.json({ error: "Missing subsectionId or email" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: row, error: secErr } = await supabase
    .from("subsections")
    .select("id,name")
    .eq("id", subsectionId)
    .single();

  if (secErr || !row) {
    return NextResponse.json({ error: secErr?.message ?? "Subsection not found" }, { status: 404 });
  }

  const name = row.name as string;

  try {
    const { url } = await ensureSubsectionQrToken(supabase, subsectionId);
    const pdfBuffer = await generateSectionQrPdf(name, url);
    const filename = safePdfFilename(name);

    await sendEmail({
      from: getSenderAddress(),
      to: email,
      subject: `QR Code — ${name}`,
      text: buildQrEmailText(name, url),
      html: buildQrEmailHtml(name, url),
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
