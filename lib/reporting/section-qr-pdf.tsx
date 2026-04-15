import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

export async function generateSectionQrPdf(
  sectionName: string,
  qrUrl: string,
): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 300, margin: 2 });
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([420, 595]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const titleSize = 14;
  const titleWidth = font.widthOfTextAtSize(sectionName, titleSize);
  page.drawText(sectionName, {
    x: (width - titleWidth) / 2,
    y: height - 100,
    size: titleSize,
    font,
    color: rgb(0.1, 0.31, 0.47),
  });

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
