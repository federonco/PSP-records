import { Resend } from "resend";
import { resolvePublicSiteUrl } from "@/lib/psp/unified-qr";

/** Sender: use SMTP_FROM (set in Vercel). Fallback for local dev. */
export function getSenderAddress(): string {
  return (
    process.env.SMTP_FROM ||
    "OnSite-B <info@readx.com.au>"
  );
}

/** Absolute `https://` URL for `/public` files (email clients require public HTTPS URLs). */
function getPublicAssetUrl(path: string): string {
  const base = resolvePublicSiteUrl();
  return `${base}/${path.replace(/^\//, "")}`;
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

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Plain text + HTML for QR emails: PDF attachment + fallback link (Resend-safe HTML). */
export function buildQrEmailText(sectionTitle: string, enterUrl: string): string {
  return `Please find the QR code for ${sectionTitle} attached as a PDF.\n\nIf the attachment does not open, open this link in your browser:\n${enterUrl}`;
}

export function buildQrEmailHtml(sectionTitle: string, enterUrl: string): string {
  const title = escapeHtmlText(sectionTitle);
  const href = escapeHtmlAttr(enterUrl);
  const urlVisible = escapeHtmlText(enterUrl);
  return `<div style="font-family: Arial, sans-serif; color: #333;">
<p>Please find the QR code for <strong>${title}</strong> attached as a PDF.</p>
<p style="word-break:break-all;"><a href="${href}" style="color:#1a5276;">${urlVisible}</a></p>
<p style="font-size:12px;color:#666;">You can open this link directly if scanning the PDF fails.</p>
${getReadxSignatureHtml()}</div>`;
}

/**
 * Resend's client JSON.stringifies the request body. Raw Node Buffers become
 * `{ type: "Buffer", data: [...] }`, which corrupts PDFs. The API expects base64.
 */
function attachmentContentForResend(content: Buffer | string): string {
  if (typeof content === "string") return content;
  return Buffer.from(content).toString("base64");
}

export async function sendEmail(options: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: {
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }[];
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
    attachments: options.attachments?.map((a) => {
      const isPdfName = a.filename.toLowerCase().endsWith(".pdf");
      return {
        filename: a.filename,
        content: attachmentContentForResend(a.content),
        contentType:
          a.contentType ?? (isPdfName ? "application/pdf" : undefined),
      };
    }),
  });
  if (error) throw new Error(error.message);
}
