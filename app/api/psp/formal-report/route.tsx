import { NextRequest, NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 10 },
  heading: { fontSize: 14, marginBottom: 10 },
  table: { display: "flex", width: "auto", borderStyle: "solid", borderWidth: 1 },
  row: { flexDirection: "row" },
  cell: { borderStyle: "solid", borderWidth: 1, padding: 4, flexGrow: 1 },
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
  const { locationId, locationName, blockKey, blockIndex, status, pending, chainages } = body;

  if (!locationId || !blockKey || !Array.isArray(chainages)) {
    return NextResponse.json({ error: "Missing report data" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: records, error } = await supabase
    .from("psp_records")
    .select(
      "chainage,recorded_at,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector,sign_off_by,sign_off_at",
    )
    .eq("location_id", locationId)
    .in("chainage", chainages)
    .order("chainage", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.heading}>Formal Report</Text>
        <Text>Location: {locationName ?? locationId}</Text>
        <Text>Block: {blockKey}</Text>
        {blockIndex ? <Text>Report #: {blockIndex}</Text> : null}
        {status ? <Text>Status: {status}</Text> : null}
        {pending?.length ? <Text>Pending: {pending.join(", ")}</Text> : null}
        <View style={{ height: 8 }} />
        <View style={styles.table}>
          <View style={styles.row}>
            {[
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
            ].map((label) => (
              <Text key={label} style={[styles.cell, styles.headerCell]}>
                {label}
              </Text>
            ))}
          </View>
          {records?.map((record) => (
            <View key={record.chainage} style={styles.row}>
              <Text style={styles.cell}>{record.chainage}</Text>
              <Text style={styles.cell}>
                {new Date(record.recorded_at).toLocaleString()}
              </Text>
              <Text style={styles.cell}>{record.l1_150}</Text>
              <Text style={styles.cell}>{record.l1_450}</Text>
              <Text style={styles.cell}>{record.l1_750}</Text>
              <Text style={styles.cell}>{record.l2_150}</Text>
              <Text style={styles.cell}>{record.l2_450}</Text>
              <Text style={styles.cell}>{record.l2_750}</Text>
              <Text style={styles.cell}>{record.l3_150}</Text>
              <Text style={styles.cell}>{record.l3_450}</Text>
              <Text style={styles.cell}>{record.l3_750}</Text>
              <Text style={styles.cell}>{record.site_inspector}</Text>
              <Text style={styles.cell}>
                {record.sign_off_by
                  ? `${record.sign_off_by} @ ${
                      record.sign_off_at ? new Date(record.sign_off_at).toLocaleString() : ""
                    }`
                  : "—"}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );

  const buffer = await pdf(doc).toBuffer();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "psp-reports";
  const safeLocation = (locationName ?? "location").replace(/\s+/g, "-");
  const filePath = `formal-reports/${safeLocation}/${blockKey}-${Date.now()}.pdf`;

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
    report_type: "formal",
    block_key: blockKey,
    pdf_path: filePath,
    created_by: user.id,
  });

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(filePath);

  return NextResponse.json({ ok: true, url: publicUrl.publicUrl });
}
