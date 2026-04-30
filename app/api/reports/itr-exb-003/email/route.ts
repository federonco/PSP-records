import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  sendEmail,
  getSenderAddress,
  buildHtmlBody,
} from "@/lib/email";
import { isAdminEmail } from "@/lib/admin";
import { generateITRExb003Pdf, resolvePspLocation } from "@/lib/reporting/itr-exb-003";

export const runtime = "nodejs";
export const maxDuration = 60;


function extractErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const anyError = error as { message?: string };
    return anyError.message ?? "Email failed";
  }
  return "Email failed";
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

  const resolved = await resolvePspLocation(locationId, locationName);
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
      penetrometerSn: resolved.penetrometerSn,
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
