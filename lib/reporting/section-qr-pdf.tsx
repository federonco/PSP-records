import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";

function fitFontSize(
  text: string,
  font: PDFFont,
  maxWidth: number,
  preferred: number,
  minimum = 9,
): number {
  let size = preferred;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

export async function generateSectionQrPdf(opts: {
  title: string;
  subtitle?: string;
  qrUrl: string;
}): Promise<Buffer> {
  const { title, subtitle, qrUrl } = opts;
  const qrBuffer = await QRCode.toBuffer(qrUrl, {
    type: "png",
    width: 300,
    margin: 2,
    errorCorrectionLevel: "M",
  });
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([420, 595]);
  const { width, height } = page.getSize();
  const maxTextWidth = width - 60;

  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const titleSize = fitFontSize(title, titleFont, maxTextWidth, 14);
  const titleWidth = titleFont.widthOfTextAtSize(title, titleSize);
  const titleY = height - 100;
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: titleY,
    size: titleSize,
    font: titleFont,
    color: rgb(0.1, 0.31, 0.47),
  });

  if (subtitle?.trim()) {
    const subFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const subSize = fitFontSize(subtitle, subFont, maxTextWidth, 12);
    const subWidth = subFont.widthOfTextAtSize(subtitle, subSize);
    page.drawText(subtitle, {
      x: (width - subWidth) / 2,
      y: titleY - 22,
      size: subSize,
      font: subFont,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  const qrImage = await pdfDoc.embedPng(qrBuffer);
  const qrSize = 260;
  page.drawImage(qrImage, {
    x: (width - qrSize) / 2,
    y: (height - qrSize) / 2 - 20,
    width: qrSize,
    height: qrSize,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
