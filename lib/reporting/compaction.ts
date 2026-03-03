import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import libre from "libreoffice-convert";

export type CompactionRecord = {
  date?: string;
  ch?: string | number;
  l1_a?: string | number;
  l1_b?: string | number;
  l1_c?: string | number;
  l2_a?: string | number;
  l2_b?: string | number;
  l2_c?: string | number;
  l3_a?: string | number;
  l3_b?: string | number;
  l3_c?: string | number;
};

export type CompactionTemplateData = {
  REPORT_DATE?: string;
  SUPERVISOR_NAME?: string;
  WORK_LOCATION?: string;
  PENETROMETER_SN?: string;
  records?: CompactionRecord[];
};

type FilledTemplateResult = {
  buffer: Buffer;
  fileName: string;
};

const TEMPLATE_RELATIVE_PATH = path.join(
  process.cwd(),
  "templates",
  "ITR-EXB-003.docx",
);

function loadTemplateBuffer() {
  if (!fs.existsSync(TEMPLATE_RELATIVE_PATH)) {
    throw new Error(
      "Template not found at templates/ITR-EXB-003.docx. Add the DOCX file to the repo.",
    );
  }
  return fs.readFileSync(TEMPLATE_RELATIVE_PATH);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSplitTokenRegex(token: string) {
  const parts = token.split("").map(escapeRegExp);
  return new RegExp(parts.join("(?:<[^>]+>)*"), "g");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fillTemplateZip(zip: PizZip, payload: Record<string, string>) {
  const xmlFiles = Object.keys(zip.files).filter(
    (name) => name.startsWith("word/") && name.endsWith(".xml"),
  );

  const baseKeys = [
    "REPORT_DATE",
    "SUPERVISOR_NAME",
    "WORK_LOCATION",
    "PENETROMETER_SN",
    "DATE",
    "CH",
    "L1_A",
    "L1_B",
    "L1_C",
    "L2_A",
    "L2_B",
    "L2_C",
    "L3_A",
    "L3_B",
    "L3_C",
  ];
  const templateKeys = baseKeys.flatMap((key) => {
    if (key === "REPORT_DATE" || key === "SUPERVISOR_NAME" || key === "WORK_LOCATION" || key === "PENETROMETER_SN") {
      return [key];
    }
    return Array.from({ length: 10 }, (_, idx) => `${key}_${idx}`);
  });

  xmlFiles.forEach((name) => {
    const file = zip.file(name);
    const content = file?.asText();
    if (!content) return;
    let normalized = content
      .replace(/\{\{\{+/g, "{{")
      .replace(/\}\}\}+/g, "}}")
      .replace(/&#123;|&#125;/g, "")
      .replace(/[{}]/g, "");

    templateKeys.forEach((key) => {
      const regex = buildSplitTokenRegex(key);
      const value = payload[key] ?? "";
      normalized = normalized.replace(regex, escapeXml(value));
    });

    zip.file(name, normalized);
  });
}

function buildTemplatePayload(input: CompactionTemplateData) {
  const records = input.records ?? [];
  const padded = Array.from({ length: 10 }, (_, idx) => records[idx] ?? {});

  const payload: Record<string, string> = {
    REPORT_DATE: input.REPORT_DATE ?? "",
    SUPERVISOR_NAME: input.SUPERVISOR_NAME ?? "",
    WORK_LOCATION: input.WORK_LOCATION ?? "",
    PENETROMETER_SN: input.PENETROMETER_SN ?? "#3059-0325",
  };

  padded.forEach((rec, idx) => {
    payload[`DATE_${idx}`] = rec.date ? String(rec.date) : "";
    payload[`CH_${idx}`] = rec.ch !== undefined ? String(rec.ch) : "";
    payload[`L1_A_${idx}`] = rec.l1_a !== undefined ? String(rec.l1_a) : "";
    payload[`L1_B_${idx}`] = rec.l1_b !== undefined ? String(rec.l1_b) : "";
    payload[`L1_C_${idx}`] = rec.l1_c !== undefined ? String(rec.l1_c) : "";
    payload[`L2_A_${idx}`] = rec.l2_a !== undefined ? String(rec.l2_a) : "";
    payload[`L2_B_${idx}`] = rec.l2_b !== undefined ? String(rec.l2_b) : "";
    payload[`L2_C_${idx}`] = rec.l2_c !== undefined ? String(rec.l2_c) : "";
    payload[`L3_A_${idx}`] = rec.l3_a !== undefined ? String(rec.l3_a) : "";
    payload[`L3_B_${idx}`] = rec.l3_b !== undefined ? String(rec.l3_b) : "";
    payload[`L3_C_${idx}`] = rec.l3_c !== undefined ? String(rec.l3_c) : "";
  });

  return payload;
}

function renderDocx(data: CompactionTemplateData): FilledTemplateResult {
  const templateBuffer = loadTemplateBuffer();
  const zip = new PizZip(templateBuffer);
  const payload = buildTemplatePayload(data);
  fillTemplateZip(zip, payload);

  const buffer = zip.generate({ type: "nodebuffer" });
  const fileName = `ITR-EXB-003_${Date.now()}.docx`;
  return { buffer, fileName };
}

async function convertToPdf(docxBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    libre.convert(docxBuffer, ".pdf", undefined, (err, done) => {
      if (err || !done) {
        reject(err ?? new Error("PDF conversion failed"));
        return;
      }
      resolve(done);
    });
  });
}

export async function generateCompactionReport(
  data: CompactionTemplateData,
  format: "pdf" | "docx" = "pdf",
) {
  const docx = renderDocx(data);

  if (format === "docx") {
    return {
      buffer: docx.buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      fileName: docx.fileName,
    };
  }

  try {
    const pdfBuffer = await convertToPdf(docx.buffer);
    return {
      buffer: pdfBuffer,
      contentType: "application/pdf",
      fileName: docx.fileName.replace(".docx", ".pdf"),
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error("PDF conversion failed");
  }
}
