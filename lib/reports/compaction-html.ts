import fs from "fs";
import path from "path";
import type { CompactionTemplateData, CompactionRecord } from "@/lib/reporting/compaction";

const DOC_NO = "9823-PW-QAT-ITC-0005";
const EFFECTIVE_DATE = "19/06/2025";
const REVISION_NO = "0";
const MIN_BLOWS = "6";
const AREA_SUBLOT_DEFAULT = "SECA-";

function escapeHtml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function norm(v: string | number | undefined | null): string {
  if (v === undefined || v === null) return "";
  return String(v);
}

function getLogoBase64(): string {
  try {
    const logoPath = path.join(process.cwd(), "public", "alkimos-logo.png");
    const base64 = fs.readFileSync(logoPath).toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    return "";
  }
}

function padRecords(records: CompactionRecord[], count: number): CompactionRecord[] {
  const out = [...(records ?? [])];
  while (out.length < count) {
    out.push({
      date: "",
      ch: "",
      l1_a: "",
      l1_b: "",
      l1_c: "",
      l2_a: "",
      l2_b: "",
      l2_c: "",
      l3_a: "",
      l3_b: "",
      l3_c: "",
    });
  }
  return out.slice(0, count);
}

export function renderCompactionHTML(data: CompactionTemplateData): string {
  const logoSrc = getLogoBase64();
  const projectName = data.PROJECT_NAME ?? "Alkimos DN1600 Trunk Main";
  const projectNumber = data.PROJECT_NUMBER ?? "C1/1000004254";
  const reportDate = data.REPORT_DATE ?? "";
  const penetrometerSn = data.PENETROMETER_SN ?? "";
  const supervisor = data.SUPERVISOR_NAME ?? "";
  const location = data.WORK_LOCATION ?? "";
  const areaSublot = (data as { AREA_SUBLOT?: string }).AREA_SUBLOT ?? "";

  const records = data.records ?? [];
  const pageSize = 10;
  const chunks: CompactionRecord[][] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(records.length / pageSize)); i++) {
    chunks.push(records.slice(i * pageSize, (i + 1) * pageSize));
  }
  if (chunks.length === 0) chunks.push([]);
  const totalPages = chunks.length;

  const pageParts: string[] = [];

  const sectionBar = "background:#1F497D;color:#FFFFFF;font-weight:bold;font-size:7pt;text-align:center;padding:1px 3px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1";
  const metaLabel = "background:#E2EAF3;color:#000;font-weight:bold;font-size:7pt;padding:1px 2px;border:0.5pt solid #000;vertical-align:middle;white-space:nowrap;line-height:1.1";
  const metaValue = "background:#FFF;color:#000;font-size:7pt;padding:1px 2px;border:0.5pt solid #000;vertical-align:middle;text-align:right;line-height:1.1";
  const detailLabel = "background:#E2EAF3;color:#000;font-weight:bold;font-size:7pt;padding:3px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1";
  const detailValue = "background:#FFF;color:#000;font-size:7pt;padding:3px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1";

  for (let pageIndex = 0; pageIndex < chunks.length; pageIndex++) {
    const padded = padRecords(chunks[pageIndex], 10);
    const pageNum = pageIndex + 1;

    const tableA = `<table style="width:100%;border-collapse:collapse;margin:0;padding:0;font-family:Arial,sans-serif">
<tbody>
<tr>
  <td style="width:12%;${metaLabel}">Doc No:</td>
  <td style="width:13%;${metaValue}">${escapeHtml(DOC_NO)}</td>
  <td colspan="2" rowspan="2" style="text-align:center;vertical-align:middle;font-size:12pt;font-weight:bold;padding:1px 3px;border:0.5pt solid #000;line-height:1.15">PERTH SAND PENETROMETER<br>FIELD REPORT</td>
  <td rowspan="4" style="width:22%;text-align:center;vertical-align:middle;padding:1px 2px;border:0.5pt solid #000">${logoSrc ? `<img src="${logoSrc}" alt="" style="width:110px;height:35px;object-fit:contain;display:block;margin:0 auto" />` : ""}</td>
</tr>
<tr>
  <td style="${metaLabel}">Effective Date:</td>
  <td style="${metaValue}">${escapeHtml(EFFECTIVE_DATE)}</td>
</tr>
<tr>
  <td style="${metaLabel}">Revision No:</td>
  <td style="${metaValue}">${escapeHtml(REVISION_NO)}</td>
  <td colspan="2" rowspan="2" style="text-align:center;vertical-align:middle;font-size:10pt;font-weight:bold;padding:1px 3px;border:0.5pt solid #000;line-height:1.1">ITR-EXB-003</td>
</tr>
<tr>
  <td style="${metaLabel}">Page No:</td>
  <td style="${metaValue}">${pageNum} of ${totalPages}</td>
</tr>
<tr><td colspan="5" style="${sectionBar}">PROJECT DETAILS</td></tr>
<tr>
  <td style="width:20%;${detailLabel}">PROJECT NAME:</td>
  <td style="width:30%;${detailValue}">${escapeHtml(projectName)}</td>
  <td style="width:20%;${detailLabel};white-space:nowrap">PROJECT NO:</td>
  <td style="width:30%;${detailValue}">${escapeHtml(projectNumber)}</td>
  <td style="border:0.5pt solid #000;padding:0"></td>
</tr>
<tr>
  <td style="${detailLabel}">DATE OF TEST:</td>
  <td style="${detailValue}">${escapeHtml(reportDate)}</td>
  <td style="${detailLabel};white-space:nowrap">PENETROMETER ID:</td>
  <td style="${detailValue}">${escapeHtml(penetrometerSn)}</td>
  <td style="border:0.5pt solid #000;padding:0"></td>
</tr>
<tr>
  <td style="${detailLabel};white-space:nowrap">PERSON COMPLETING TEST:</td>
  <td style="${detailValue}">${escapeHtml(supervisor)}</td>
  <td style="${detailLabel};white-space:nowrap">CALIBRATION CERT:</td>
  <td colspan="2" style="${detailValue}"></td>
</tr>
<tr>
  <td style="width:20%;${detailLabel}">AREA-SUBLOT:</td>
  <td colspan="4" style="${detailValue}">${escapeHtml(areaSublot)}</td>
</tr>
<tr>
  <td style="${detailLabel}">LOCATION:</td>
  <td colspan="4" style="${detailValue}">${escapeHtml(location)}</td>
</tr>
<tr>
  <td colspan="3" style="${detailValue};font-size:6.5pt;text-align:left;line-height:1.1">Minimum Compaction Requirements – Enter number of Blows Per 300mm as per Specification or PSP Correlation: (See Reverse for Instructions / Risk Assessment)</td>
  <td colspan="2" style="${detailValue};text-align:center;font-size:11pt;font-weight:bold;vertical-align:middle">${MIN_BLOWS}</td>
</tr>
</tbody>
</table>`;

    const greyBg = "#F2F2F2";
    const chainageCell = `<td style="background:${greyBg};text-align:center;font-size:7pt;padding:1px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1">Chainage</td>`;
    const layerHeader = "background:#1F497D;color:#FFFFFF;font-weight:bold;font-size:7pt;padding:1px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1";
    const chCellStyle = `background:${greyBg};font-weight:bold;text-align:center;font-size:7pt;padding:1px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1`;
    const dateCellStyle = `font-size:7pt;padding:1px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1;background:${greyBg};text-align:center`;
    const dataCellStyle = "font-size:7pt;padding:5px 2px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1;background:#FFF;text-align:center";
    const depthLabel = "font-size:7pt;padding:5px 2px;border:0.5pt solid #000;vertical-align:middle;background:#FFF;line-height:1.1";

    const layerRows = (n: 1 | 2 | 3) => {
      const la: keyof CompactionRecord = n === 1 ? "l1_a" : n === 2 ? "l2_a" : "l3_a";
      const lb: keyof CompactionRecord = n === 1 ? "l1_b" : n === 2 ? "l2_b" : "l3_b";
      const lc: keyof CompactionRecord = n === 1 ? "l1_c" : n === 2 ? "l2_c" : "l3_c";
      return `
<tr><td style="${layerHeader}">Layer – ${n}</td>${Array.from({ length: 10 }, () => chainageCell).join("")}</tr>
<tr><td style="background:${greyBg};border:0.5pt solid #000;padding:1px 2px"></td>${padded.map((r) => `<td style="${dateCellStyle}">${escapeHtml(norm(r.date))}</td>`).join("")}</tr>
<tr><td style="background:${greyBg};border:0.5pt solid #000;padding:1px 2px"></td>${padded.map((r) => `<td style="${chCellStyle}">${escapeHtml(norm(r.ch))}</td>`).join("")}</tr>
<tr><td style="${depthLabel}">150-450mm</td>${padded.map((r) => `<td style="${dataCellStyle}">${escapeHtml(norm(r[la]))}</td>`).join("")}</tr>
<tr><td style="${depthLabel}">450-750mm</td>${padded.map((r) => `<td style="${dataCellStyle}">${escapeHtml(norm(r[lb]))}</td>`).join("")}</tr>
<tr><td style="${depthLabel}">750-1050mm</td>${padded.map((r) => `<td style="${dataCellStyle}">${escapeHtml(norm(r[lc]))}</td>`).join("")}</tr>`;
    };

    const footerLabel = "background:#E2EAF3;color:#000;font-weight:bold;font-size:7pt;padding:3px 4px;border:0.5pt solid #000;vertical-align:middle;line-height:1.1";

    const tableB = `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin:0;padding:0;font-family:Arial,sans-serif">
<colgroup>
  <col style="width:12%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
  <col style="width:8.7%">
</colgroup>
<tbody>
<tr><td colspan="11" style="${sectionBar}">PERTH SAND PENETROMETER RECORD</td></tr>
${layerRows(1)}${layerRows(2)}${layerRows(3)}
<tr><td colspan="11" style="${sectionBar}">COMMENTS AND CONFORMANCE</td></tr>
<tr><td style="${footerLabel}" colspan="1">Comments:</td><td colspan="10" style="padding:2px 4px;border:0.5pt solid #000;background:#FFF;vertical-align:middle"><div style="display:block;width:100%;height:32px;box-sizing:border-box;"></div></td></tr>
<tr><td colspan="3" style="${footerLabel}">AREA-SUBLOT CONFORMS: Yes/No</td><td colspan="2" style="padding:2px 4px;border:0.5pt solid #000;background:#FFF;vertical-align:middle"><div style="display:block;width:100%;height:26px;box-sizing:border-box;"></div></td><td colspan="3" style="${footerLabel}">DATE REVIEWED:</td><td colspan="3" style="padding:2px 4px;border:0.5pt solid #000;background:#FFF;vertical-align:middle"><div style="display:block;width:100%;height:26px;box-sizing:border-box;"></div></td></tr>
<tr><td colspan="3" style="${footerLabel}">NAME: APA Representative</td><td colspan="2" style="padding:2px 4px;border:0.5pt solid #000;background:#FFF;vertical-align:middle"><div style="display:block;width:100%;height:28px;box-sizing:border-box;"></div></td><td colspan="3" style="${footerLabel}">SIGNATURE: APA Representative</td><td colspan="3" style="padding:2px 4px;border:0.5pt solid #000;background:#FFF;vertical-align:middle"><div style="display:block;width:100%;height:40px;box-sizing:border-box;"></div></td></tr>
</tbody>
</table>`;

    pageParts.push(`<div class="page" style="margin:0;padding:0">${tableA}${tableB}</div>`);
    if (pageIndex < chunks.length - 1) {
      pageParts.push(`<div style="page-break-after: always;"></div>`);
    }
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    body { font-family: Arial, sans-serif; font-size: 7pt; margin: 0; padding: 0; line-height: 1.1; }
    .page { margin: 0; padding: 0; }
  </style>
</head>
<body>
  ${pageParts.join("\n  ")}
</body>
</html>`;
}
