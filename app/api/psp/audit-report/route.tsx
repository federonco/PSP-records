import { NextRequest, NextResponse } from "next/server";
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 9 },
  heading: { fontSize: 12, marginBottom: 8 },
  rawBlock: { fontSize: 7, lineHeight: 1.2 },
  divider: { height: 6 },
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
    .select("*")
    .eq("location_id", locationId)
    .order("chainage", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pageSize = 3;
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
          <View style={styles.divider} />
          {chunk.map((record, recordIndex) => (
            <Text key={`${recordIndex}-${record.chainage ?? "row"}`} style={styles.rawBlock}>
              {JSON.stringify(record, null, 2)}
              {"\n\n"}
            </Text>
          ))}
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
