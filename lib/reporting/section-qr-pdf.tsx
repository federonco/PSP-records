import QRCode from "qrcode";
import { getBrowserForPdf } from "@/lib/reporting/puppeteer-launch";

export async function generateSectionQrPdf(
  sectionName: string,
  qrUrl: string,
): Promise<Buffer> {
  const dataUrl = await QRCode.toDataURL(qrUrl, { width: 400, margin: 2 });
  const safeTitle = sectionName
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;">
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;min-height:100vh;padding:24px;box-sizing:border-box;">
    <h1 style="margin:0 0 24px;color:#1a5276;font-size:22px;font-weight:700;text-align:center;">${safeTitle}</h1>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;">
      <img src="${dataUrl}" alt="" width="400" height="400" style="display:block;" />
    </div>
  </div>
</body></html>`;

  const browser = await getBrowserForPdf();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A5",
      landscape: false,
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
