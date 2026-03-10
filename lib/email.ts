import nodemailer from "nodemailer";

/** SMTP config aligned with OnSite-W: Resend fallbacks */
export function getTransporterConfig() {
  const host = process.env.SMTP_HOST || "smtp.resend.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const user = process.env.SMTP_USER || "resend";
  const pass = process.env.SMTP_PASS || process.env.RESEND_API_KEY || "";
  const secure = port === 465;
  return { host, port, user, pass, secure };
}

/** Sender fallback: SMTP_FROM || ALERT_FROM_EMAIL || Water Cart */
export function getSenderAddress(): string {
  return (
    process.env.SMTP_FROM ||
    process.env.ALERT_FROM_EMAIL ||
    "Water Cart <info@readx.com.au>"
  );
}

/** readX HTML email signature — second line: Drainer - OnSite-B */
export function getReadxSignatureHtml(): string {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.readx.com.au";
  return `
<div style="font-family: Arial, sans-serif; color: #333; padding: 24px;">
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;" />
  <table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif;">
    <tr>
      <td style="padding-right: 16px; vertical-align: middle;">
        <a href="https://www.readx.com.au" target="_blank">
          <img src="${siteUrl}/readx-logo.png" alt="readX" width="80" />
        </a>
      </td>
      <td style="vertical-align: middle; border-left: 2px solid #1a5276; padding-left: 16px;">
        <p style="margin:0; font-size: 15px; font-weight: bold; color: #1a5276;">readX Team</p>
        <p style="margin:4px 0 0; font-size: 13px; color: #555;">Backfill - OnSite-B</p>
        <p style="margin:4px 0 0; font-size: 12px;">
          <a href="https://www.readx.com.au" target="_blank" style="color: #1a5276; text-decoration: none;">www.readX.com.au</a>
        </p>
      </td>
    </tr>
  </table>
</div>`;
}

/** Wrap plain text in minimal HTML and append readX signature */
export function buildHtmlBody(textBody: string): string {
  const escaped = textBody
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />");
  return `<div style="font-family: Arial, sans-serif; color: #333;">${escaped}${getReadxSignatureHtml()}</div>`;
}

/** Create nodemailer transporter using OnSite-W config pattern */
export function createTransporter() {
  const { host, port, user, pass, secure } = getTransporterConfig();
  if (!pass) {
    throw new Error("SMTP_PASS or RESEND_API_KEY is required");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}
