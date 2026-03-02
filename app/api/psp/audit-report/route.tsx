import { NextRequest, NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9 },
  heading: { fontSize: 12, marginBottom: 8 },
  table: { display: "flex", width: "auto", borderStyle: "solid", borderWidth: 1 },
  row: { flexDirection: "row" },
  headerRow: { flexDirection: "row", minHeight: 26 },
  dataRow: { flexDirection: "row", minHeight: 28 },
  cell: { borderStyle: "solid", borderWidth: 1, padding: 3, flexGrow: 1 },
  headerCell: { backgroundColor: "#e5e7eb", fontWeight: 700 },
});

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { locationId, locationName, blockKey, blockIndex, status, pending } = body;

  if (!locationId) {
    return NextResponse.json({ error: "Missing report data" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: records, error } = await supabase
    .from("psp_records")
    .select(
      "chainage,recorded_at,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector,sign_off_by,sign_off_at",
    )
    .eq("location_id", locationId)
    .order("chainage", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "Chainage",
    "Recorded",
    "L1 150",
    "L1 450",
    "L1 750",
    "L2 150",
    "L2 450",
    "L2 750",
    "L3 150",
    "L3 450",
    "L3 750",
    "Inspector",
    "Sign-off",
  ];
  const columnWidths = [
    44, // Chainage
    70, // Recorded
    36, // L1 150
    36, // L1 450
    36, // L1 750
    36, // L2 150
    36, // L2 450
    36, // L2 750
    36, // L3 150
    36, // L3 450
    36, // L3 750
    60, // Inspector
    70, // Sign-off
  ];

  const pageSize = 10;
  const chunks: typeof records[] = [];
  for (let i = 0; i < (records?.length ?? 0); i += pageSize) {
    chunks.push((records ?? []).slice(i, i + pageSize));
  }
  if (!chunks.length) chunks.push([]);

  const doc = (
    <Document>
      {chunks.map((chunk, pageIndex) => {
        const rangeStart = chunk.length ? chunk[chunk.length - 1].chainage : "";
        const rangeEnd = chunk.length ? chunk[0].chainage : "";
        const rangeLabel =
          rangeStart !== "" && rangeEnd !== ""
            ? `${rangeStart} → ${rangeEnd}`
            : `Page ${pageIndex + 1}`;

        return (
        <Page key={`page-${pageIndex}`} size="A4" style={styles.page}>
          <Text style={styles.heading}>Audit Report</Text>
          <Text>Location: {locationName ?? locationId}</Text>
          <Text>Block: {blockKey ?? rangeLabel}</Text>
          {blockIndex ? <Text>Report #: {blockIndex}</Text> : null}
          {status ? <Text>Status: {status}</Text> : null}
          {pending?.length ? <Text>Pending: {pending.join(", ")}</Text> : null}
          <View style={{ height: 8 }} />
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
            {chunk.map((record) => (
              <View key={record.chainage} style={styles.dataRow}>
                <Text style={[styles.cell, { width: columnWidths[0], flexGrow: 0, flexShrink: 0 }]}>
                  {record.chainage}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[1], flexGrow: 0, flexShrink: 0 }]}>
                  {new Date(record.recorded_at).toLocaleDateString()}
                  {"\n"}
                  {new Date(record.recorded_at).toLocaleTimeString()}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[2], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l1_150}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[3], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l1_450}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[4], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l1_750}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[5], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l2_150}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[6], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l2_450}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[7], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l2_750}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[8], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l3_150}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[9], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l3_450}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[10], flexGrow: 0, flexShrink: 0 }]}>
                  {record.l3_750}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[11], flexGrow: 0, flexShrink: 0 }]}>
                  {record.site_inspector}
                  {"\n"}
                </Text>
                <Text style={[styles.cell, { width: columnWidths[12], flexGrow: 0, flexShrink: 0 }]}>
                  {record.sign_off_by
                    ? `${record.sign_off_by} @ ${
                        record.sign_off_at
                          ? new Date(record.sign_off_at).toLocaleString()
                          : ""
                      }`
                    : "—"}
                </Text>
              </View>
            ))}
          </View>
        </Page>
        );
      })}
    </Document>
  );

  const buffer = await pdf(doc).toBuffer();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "psp-reports";
  const safeLocation = (locationName ?? "location").replace(/\s+/g, "-");
  const filePath = `audit-reports/${safeLocation}/${blockKey ?? "all"}-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: reportError } = await supabase.from("psp_reports").insert({
    location_id: locationId,
    report_type: "audit",
    block_key: blockKey ?? "all",
    pdf_path: filePath,
    created_by: user.id,
  });

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, 60 * 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signedError?.message ?? "Failed to create download link" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
