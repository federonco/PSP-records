import { Resend } from "resend";

/** Sender: use SMTP_FROM (set in Vercel). Fallback for local dev. */
export function getSenderAddress(): string {
  return (
    process.env.SMTP_FROM ||
    "OnSite-B <info@readx.com.au>"
  );
}

/** Base URL for public assets (emails need absolute URLs) */
function getPublicAssetUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (base) {
    return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/${path.replace(/^\//, "")}`;
  }
  return `https://apa-dashboard.readx.com.au/${path.replace(/^\//, "")}`;
}

/** readX HTML email signature — second line: Drainer - OnSite-B */
export function getReadxSignatureHtml(): string {
  const logoUrl = getPublicAssetUrl("readx-logo.png");
  return `
<div style="font-family: Arial, sans-serif; color: #333; padding: 24px;">
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;" />
  <table cellpadding="0" cellspacing="0" style="font-family: Arial, sans-serif;">
    <tr>
      <td style="padding-right: 16px; vertical-align: middle;">
        <a href="https://www.readx.com.au" target="_blank">
          <img src="${logoUrl}" alt="readX" width="80" />
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

export async function sendEmail(options: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required");
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });
  if (error) throw new Error(error.message);
}
