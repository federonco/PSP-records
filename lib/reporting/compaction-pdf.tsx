import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { CompactionTemplateData } from "./compaction";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9 },
  heading: { fontSize: 12, marginBottom: 6 },
  meta: { marginBottom: 8 },
  table: { display: "flex", width: "auto", borderStyle: "solid", borderWidth: 1 },
  row: { flexDirection: "row" },
  headerRow: { flexDirection: "row", minHeight: 22 },
  dataRow: { flexDirection: "row", minHeight: 20 },
  cell: { borderStyle: "solid", borderWidth: 1, padding: 3, flexGrow: 1 },
  headerCell: { backgroundColor: "#e5e7eb", fontWeight: 700 },
});

const headers = [
  "Date",
  "Ch",
  "L1 A",
  "L1 B",
  "L1 C",
  "L2 A",
  "L2 B",
  "L2 C",
  "L3 A",
  "L3 B",
  "L3 C",
];

const columnWidths = [54, 36, 32, 32, 32, 32, 32, 32, 32, 32, 32];

export async function generateCompactionPdf(data: CompactionTemplateData) {
  const records = data.records ?? [];
  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.heading}>PSP Compaction Report</Text>
        <View style={styles.meta}>
          <Text>Location: {data.WORK_LOCATION ?? ""}</Text>
          <Text>Supervisor: {data.SUPERVISOR_NAME ?? ""}</Text>
          <Text>Date: {data.REPORT_DATE ?? ""}</Text>
        </View>
        <View style={styles.table}>
          <View style={styles.headerRow}>
            {headers.map((label, idx) => (
              <Text
                key={label}
                style={[
                  styles.cell,
                  styles.headerCell,
                  { width: columnWidths[idx], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>
          {records.map((record, idx) => (
            <View key={`${record.ch}-${idx}`} style={styles.dataRow}>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[0], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.date ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[1], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.ch ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[2], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l1_a ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[3], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l1_b ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[4], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l1_c ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[5], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l2_a ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[6], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l2_b ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[7], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l2_c ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[8], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l3_a ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[9], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l3_b ?? ""}
              </Text>
              <Text
                style={[
                  styles.cell,
                  { width: columnWidths[10], flexGrow: 0, flexShrink: 0 },
                ]}
              >
                {record.l3_c ?? ""}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );

  const buffer = await pdf(doc).toBuffer();
  return {
    buffer,
    contentType: "application/pdf",
    fileName: `ITR-EXB-003_${Date.now()}.pdf`,
  };
}
