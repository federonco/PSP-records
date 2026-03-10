// DEPRECATED: use renderCompactionHTML() + Puppeteer instead (lib/reports/compaction-html.ts)
import path from "path";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import type { CompactionTemplateData, CompactionRecord } from "./compaction";

const DOC_NO = "9823-PW-QAT-ITC-0005";
const EFFECTIVE_DATE = "19/06/2025";
const REVISION_NO = "0";
const MIN_BLOWS = "6";
const AREA_SUBLOT = "SECA-";

// Portrait A4: 595pt wide, 842pt tall; margins 18pt each side
const PAGE_WIDTH = 595;
const PAGE_PADDING = 18;
const USABLE_WIDTH = PAGE_WIDTH - PAGE_PADDING * 2; // 559pt

const LABEL_COL_W = Math.round(USABLE_WIDTH * 0.2); // ~112pt
const DATA_COL_W = Math.floor((USABLE_WIDTH - LABEL_COL_W) / 10); // ~44pt each
const DATA_COLS_TOTAL = 10 * DATA_COL_W;
const RECORD_TABLE_WIDTH = LABEL_COL_W + DATA_COLS_TOTAL;

const HEADER_LABEL_W = 85;
const HEADER_VAL_W = 115;
const HEADER_TITLE_W = 170;
const HEADER_LOGO_W = USABLE_WIDTH - HEADER_LABEL_W - HEADER_VAL_W * 2 - HEADER_TITLE_W;

const DETAILS_TABLE_WIDTH = USABLE_WIDTH;

const styles = StyleSheet.create({
  page: {
    padding: PAGE_PADDING,
    fontSize: 6,
    fontFamily: "Helvetica",
  },
  table: {
    display: "flex",
    width: "auto",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#000",
  },
  row: { flexDirection: "row" },
  cell: {
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#000",
    paddingVertical: 1.5,
    paddingHorizontal: 3,
    flexGrow: 0,
    flexShrink: 0,
  },
  cellLabel: {
    backgroundColor: "#D6E4F0",
    fontWeight: 700,
    fontSize: 6,
  },
  cellLayerHeader: {
    backgroundColor: "#2E5E8E",
    fontWeight: 700,
    fontSize: 7,
    color: "#FFFFFF",
  },
  headerTitleBg: { backgroundColor: "#1F3864" },
  headerItrBg: { backgroundColor: "#1F3864" },
  sectionHeaderBg: { backgroundColor: "#1F3864" },
  headerTitleText: { color: "#FFFFFF", fontWeight: 700, fontSize: 9 },
  headerItrText: { color: "#FFFFFF", fontWeight: 700, fontSize: 11 },
  sectionHeaderText: { color: "#FFFFFF", fontWeight: 700, fontSize: 7 },
  docLabelCell: {
    backgroundColor: "#D6E4F0",
    fontWeight: 700,
  },
  minBlows: { fontSize: 9, fontWeight: 700 },
  logo: { width: 120, height: 38 },
  areaLocationLabel: { backgroundColor: "#4472C4", color: "#FFFFFF", fontWeight: 700 },
});

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

function TableCell({
  children = "",
  width,
  label,
  layerHeader,
}: {
  children?: React.ReactNode;
  width: number;
  label?: boolean;
  layerHeader?: boolean;
}) {
  const viewStyle = [
    styles.cell,
    { width },
    ...(label ? [styles.cellLabel] : []),
    ...(layerHeader ? [styles.cellLayerHeader] : []),
  ];
  return (
    <View style={viewStyle}>
        <Text style={label ? { fontWeight: 700, fontSize: 6 } : layerHeader ? { fontWeight: 700, color: "#FFFFFF", fontSize: 7 } : { fontSize: 6 }}>
        {children != null && children !== "" ? String(children) : ""}
      </Text>
    </View>
  );
}

function HeaderBlock({ pageNum, totalPages }: { pageNum: number; totalPages: number }) {
  const logoPath = path.join(process.cwd(), "public", "alkimos-logo.png");
  const rowHeight = 16;
  const logoMinHeight = rowHeight * 4;
  return (
    <View style={styles.table}>
      <View style={[styles.row, { minHeight: logoMinHeight }]}>
        <View style={[styles.cell, styles.docLabelCell, { width: HEADER_LABEL_W, flexShrink: 0 }]}>
          <Text style={{ fontWeight: 700, fontSize: 6.5 }}>Doc No:</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_VAL_W * 2, flexShrink: 0 }]}>
          <Text style={{ fontSize: 6.5 }}>{DOC_NO}</Text>
        </View>
        <View
          style={[
            styles.cell,
            styles.headerTitleBg,
            { width: HEADER_TITLE_W, flexShrink: 0, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Text style={[styles.headerTitleText, { textAlign: "center" }]}>PERTH SAND PENETROMETER</Text>
          <Text style={[styles.headerTitleText, { textAlign: "center" }]}>FIELD REPORT</Text>
        </View>
        <View
          style={[
            styles.cell,
            { width: HEADER_LOGO_W, flexShrink: 0, justifyContent: "center", alignItems: "flex-end", padding: 2 },
          ]}
        >
          <Image src={logoPath} style={styles.logo} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={[styles.cell, styles.docLabelCell, { width: HEADER_LABEL_W, flexShrink: 0 }]}>
          <Text style={{ fontWeight: 700, fontSize: 6.5 }}>Effective Date:</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_VAL_W * 2, flexShrink: 0 }]}>
          <Text style={{ fontSize: 6.5 }}>{EFFECTIVE_DATE}</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_TITLE_W, flexShrink: 0 }]} />
        <View style={[styles.cell, { width: HEADER_LOGO_W, flexShrink: 0 }]} />
      </View>
      <View style={styles.row}>
        <View style={[styles.cell, styles.docLabelCell, { width: HEADER_LABEL_W, flexShrink: 0 }]}>
          <Text style={{ fontWeight: 700, fontSize: 6.5 }}>Revision No:</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_VAL_W * 2, flexShrink: 0 }]}>
          <Text style={{ fontSize: 6.5 }}>{REVISION_NO}</Text>
        </View>
        <View
          style={[
            styles.cell,
            styles.headerItrBg,
            { width: HEADER_TITLE_W, flexShrink: 0, justifyContent: "center", alignItems: "center" },
          ]}
        >
          <Text style={[styles.headerItrText, { textAlign: "center" }]}>ITR-EXB-003</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_LOGO_W, flexShrink: 0 }]} />
      </View>
      <View style={styles.row}>
        <View style={[styles.cell, styles.docLabelCell, { width: HEADER_LABEL_W, flexShrink: 0 }]}>
          <Text style={{ fontWeight: 700, fontSize: 6.5 }}>Page No:</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_VAL_W * 2, flexShrink: 0 }]}>
          <Text style={{ fontSize: 6.5 }}>{`${pageNum} of ${totalPages}`}</Text>
        </View>
        <View style={[styles.cell, { width: HEADER_TITLE_W, flexShrink: 0 }]} />
        <View style={[styles.cell, { width: HEADER_LOGO_W, flexShrink: 0 }]} />
      </View>
    </View>
  );
}

function ProjectDetailsBlock({ data }: { data: CompactionTemplateData }) {
  const projectName = data.PROJECT_NAME ?? "Alkimos DN1600 Trunk Main";
  const projectNumber = data.PROJECT_NUMBER ?? "C1/1000004254";
  const reportDate = data.REPORT_DATE ?? "";
  const penetrometerSn = data.PENETROMETER_SN ?? "";
  const supervisor = data.SUPERVISOR_NAME ?? "";
  const location = data.WORK_LOCATION ?? "";
  const fullWidth = DETAILS_TABLE_WIDTH;
  const half = fullWidth / 2;
  return (
    <View style={[styles.table, { marginTop: 1 }]}>
      <View style={styles.row}>
        <View style={[styles.cell, styles.sectionHeaderBg, { width: fullWidth }]}>
          <Text style={[styles.sectionHeaderText, { textAlign: "center" }]}>PROJECT DETAILS</Text>
        </View>
      </View>
      <View style={styles.row}>
        <TableCell width={half / 2} label>PROJECT NAME:</TableCell>
        <TableCell width={half / 2}>{projectName}</TableCell>
        <TableCell width={half / 2} label>PROJECT NO:</TableCell>
        <TableCell width={half / 2}>{projectNumber}</TableCell>
      </View>
      <View style={styles.row}>
        <TableCell width={half / 2} label>DATE OF TEST:</TableCell>
        <TableCell width={half / 2}>{reportDate}</TableCell>
        <TableCell width={half / 2} label>PENETROMETER ID:</TableCell>
        <TableCell width={half / 2}>{penetrometerSn}</TableCell>
      </View>
      <View style={styles.row}>
        <TableCell width={half / 2} label>PERSON COMPLETING TEST:</TableCell>
        <TableCell width={half / 2}>{supervisor}</TableCell>
        <TableCell width={half / 2} label>CALIBRATION CERT:</TableCell>
        <TableCell width={half / 2}>{""}</TableCell>
      </View>
      <View style={styles.row}>
        <View style={[styles.cell, styles.areaLocationLabel, { width: LABEL_COL_W }]}>
          <Text style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 6 }}>AREA-SUBLOT:</Text>
        </View>
        <View style={[styles.cell, { width: fullWidth - LABEL_COL_W }]}>
          <Text style={{ fontSize: 6 }}>{(data as { AREA_SUBLOT?: string }).AREA_SUBLOT ?? AREA_SUBLOT}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View style={[styles.cell, styles.areaLocationLabel, { width: LABEL_COL_W }]}>
          <Text style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 6 }}>LOCATION:</Text>
        </View>
        <View style={[styles.cell, { width: fullWidth - LABEL_COL_W }]}>
          <Text style={{ fontSize: 6 }}>{location}</Text>
        </View>
      </View>
      <View style={styles.row}>
        <View
          style={[
            styles.cell,
            styles.cellLabel,
            { width: fullWidth - DATA_COL_W - 20, paddingVertical: 1.5, paddingHorizontal: 3 },
          ]}
        >
          <Text style={{ fontSize: 6 }}>
            Minimum Compaction Requirements – Enter number of Blows Per 300mm as per
            Specification or PSP Correlation: (See Reverse for Instructions / Risk Assessment)
          </Text>
        </View>
        <View style={[styles.cell, { width: DATA_COL_W + 20, justifyContent: "center", alignItems: "center" }]}>
          <Text style={styles.minBlows}>{MIN_BLOWS}</Text>
        </View>
      </View>
    </View>
  );
}

function RecordTableBlock({ columns }: { columns: CompactionRecord[] }) {
  const padded = padRecords(columns, 10);
  const fullWidth = RECORD_TABLE_WIDTH;
  return (
    <View style={[styles.table, { marginTop: 1 }]}>
      <View style={styles.row}>
        <View style={[styles.cell, styles.sectionHeaderBg, { width: fullWidth }]}>
          <Text style={[styles.sectionHeaderText, { textAlign: "center" }]}>
            PERTH SAND PENETROMETER RECORD
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} layerHeader>Layer – 1</TableCell>
        {padded.map((_, i) => (
          <TableCell key={`l1-ch-h-${i}`} width={DATA_COL_W} label>Chainage</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W}>{""}</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l1-date-${i}`} width={DATA_COL_W}>
            {rec.date ?? ""}
          </TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W}>{""}</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l1-ch-${i}`} width={DATA_COL_W} label>
            {rec.ch !== undefined && rec.ch !== "" ? String(rec.ch) : ""}
          </TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>150-450mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l1a-${i}`} width={DATA_COL_W}>{rec.l1_a ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>450-750mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l1b-${i}`} width={DATA_COL_W}>{rec.l1_b ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>750-1050mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l1c-${i}`} width={DATA_COL_W}>{rec.l1_c ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} layerHeader>Layer – 2</TableCell>
        {padded.map((_, i) => (
          <TableCell key={`l2-ch-h-${i}`} width={DATA_COL_W} label>Chainage</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W}>{""}</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l2-date-${i}`} width={DATA_COL_W}>
            {rec.date ?? ""}
          </TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W}>{""}</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l2-ch-${i}`} width={DATA_COL_W} label>
            {rec.ch !== undefined && rec.ch !== "" ? String(rec.ch) : ""}
          </TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>150-450mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l2a-${i}`} width={DATA_COL_W}>{rec.l2_a ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>450-750mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l2b-${i}`} width={DATA_COL_W}>{rec.l2_b ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>750-1050mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l2c-${i}`} width={DATA_COL_W}>{rec.l2_c ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} layerHeader>Layer – 3</TableCell>
        {padded.map((_, i) => (
          <TableCell key={`l3-ch-h-${i}`} width={DATA_COL_W} label>Chainage</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W}>{""}</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l3-date-${i}`} width={DATA_COL_W}>
            {rec.date ?? ""}
          </TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W}>{""}</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l3-ch-${i}`} width={DATA_COL_W} label>
            {rec.ch !== undefined && rec.ch !== "" ? String(rec.ch) : ""}
          </TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>150-450mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l3a-${i}`} width={DATA_COL_W}>{rec.l3_a ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>450-750mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l3b-${i}`} width={DATA_COL_W}>{rec.l3_b ?? ""}</TableCell>
        ))}
      </View>
      <View style={styles.row}>
        <TableCell width={LABEL_COL_W} label>750-1050mm</TableCell>
        {padded.map((rec, i) => (
          <TableCell key={`l3c-${i}`} width={DATA_COL_W}>{rec.l3_c ?? ""}</TableCell>
        ))}
      </View>
    </View>
  );
}

function FooterBlock() {
  const fullWidth = RECORD_TABLE_WIDTH;
  const half = fullWidth / 2;
  return (
    <View style={[styles.table, { marginTop: 1 }]}>
      <View style={styles.row}>
        <View style={[styles.cell, styles.sectionHeaderBg, { width: fullWidth }]}>
          <Text style={[styles.sectionHeaderText, { textAlign: "center" }]}>
            COMMENTS AND CONFORMANCE
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <TableCell width={HEADER_LABEL_W} label>Comments:</TableCell>
        <View style={[styles.cell, { width: fullWidth - HEADER_LABEL_W, minHeight: 10 }]} />
      </View>
      <View style={styles.row}>
        <TableCell width={half / 2} label>AREA-SUBLOT CONFORMS: Yes/No</TableCell>
        <TableCell width={half / 2}>{""}</TableCell>
        <TableCell width={half / 2} label>DATE REVIEWED:</TableCell>
        <TableCell width={half / 2}>{""}</TableCell>
      </View>
      <View style={styles.row}>
        <TableCell width={half / 2} label>NAME: APA Representative</TableCell>
        <TableCell width={half / 2}>{""}</TableCell>
        <TableCell width={half / 2} label>SIGNATURE: APA Representative</TableCell>
        <TableCell width={half / 2}>{""}</TableCell>
      </View>
    </View>
  );
}

export async function generateCompactionPdf(data: CompactionTemplateData) {
  const records = data.records ?? [];
  const pageSize = 10;
  const chunks: CompactionRecord[][] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(records.length / pageSize)); i++) {
    chunks.push(records.slice(i * pageSize, (i + 1) * pageSize));
  }
  if (chunks.length === 0) chunks.push([]);

  const totalPages = chunks.length;

  const doc = (
    <Document>
      {chunks.map((columnChunk, pageIndex) => (
        <Page key={pageIndex} size="A4" style={styles.page}>
          <HeaderBlock pageNum={pageIndex + 1} totalPages={totalPages} />
          <ProjectDetailsBlock data={data} />
          <RecordTableBlock columns={columnChunk} />
          <FooterBlock />
        </Page>
      ))}
    </Document>
  );

  const buffer = await pdf(doc).toBuffer();
  return {
    buffer,
    contentType: "application/pdf",
    fileName: `ITR-EXB-003_${Date.now()}.pdf`,
  };
}
