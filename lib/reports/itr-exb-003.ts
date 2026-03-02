type ITRColumn = {
  date: string;
  chainage: number | string;
  l1_150: string | number;
  l1_450: string | number;
  l1_750: string | number;
  l2_150: string | number;
  l2_450: string | number;
  l2_750: string | number;
  l3_150: string | number;
  l3_450: string | number;
  l3_750: string | number;
};

type ITRParams = {
  reportDate: string;
  reportNum: number;
  workLocation: string;
  supervisorName: string;
  columns: ITRColumn[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalize(value: string | number | undefined | null) {
  if (value === undefined || value === null) return "";
  return String(value);
}

export function renderITRExb003HTML(params: ITRParams) {
  const columns = params.columns.slice(0, 10);
  while (columns.length < 10) {
    columns.push({
      date: "",
      chainage: "",
      l1_150: "",
      l1_450: "",
      l1_750: "",
      l2_150: "",
      l2_450: "",
      l2_750: "",
      l3_150: "",
      l3_450: "",
      l3_750: "",
    });
  }

  const rows = [
    { label: "DATE", key: "date" },
    { label: "CH", key: "chainage" },
    { label: "L1 150", key: "l1_150" },
    { label: "L1 450", key: "l1_450" },
    { label: "L1 750", key: "l1_750" },
    { label: "L2 150", key: "l2_150" },
    { label: "L2 450", key: "l2_450" },
    { label: "L2 750", key: "l2_750" },
    { label: "L3 150", key: "l3_150" },
    { label: "L3 450", key: "l3_450" },
    { label: "L3 750", key: "l3_750" },
  ] as const;

  const headerCells = Array.from({ length: 10 }, (_, idx) => `<th>${idx + 1}</th>`).join("");

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((col) => {
          const value = normalize(col[row.key as keyof ITRColumn]);
          return `<td>${escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr><th>${row.label}</th>${cells}</tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 10mm; }
      * { box-sizing: border-box; font-family: Arial, sans-serif; }
      body { margin: 0; color: #111827; }
      h1 { font-size: 14px; margin: 0 0 6px 0; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 10px; margin-bottom: 10px; }
      .meta div { padding: 4px 6px; border: 1px solid #e5e7eb; }
      table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
      th, td { border: 1px solid #e5e7eb; padding: 4px; text-align: center; }
      th:first-child, td:first-child { text-align: left; font-weight: 600; width: 70px; }
      thead th { background: #f3f4f6; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>ITR-EXB-003 - Compaction Report</h1>
    <div class="meta">
      <div><strong>Report Date:</strong> ${escapeHtml(params.reportDate)}</div>
      <div><strong>Report #:</strong> ${params.reportNum}</div>
      <div><strong>Work Location:</strong> ${escapeHtml(params.workLocation)}</div>
      <div><strong>Supervisor:</strong> ${escapeHtml(params.supervisorName)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th></th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  </body>
</html>`;
}
