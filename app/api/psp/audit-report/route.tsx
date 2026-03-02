import { NextRequest, NextResponse } from "next/server";
import { Document, Page, Path, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";
import nodemailer from "nodemailer";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 8 },
  heading: { fontSize: 12, marginBottom: 8 },
  table: { display: "flex", width: "auto", borderStyle: "solid", borderWidth: 1 },
  row: { flexDirection: "row" },
  headerRow: { flexDirection: "row", minHeight: 22 },
  dataRow: { flexDirection: "row", minHeight: 24 },
  cell: { borderStyle: "solid", borderWidth: 1, padding: 3, flexGrow: 1 },
  headerCell: { backgroundColor: "#1a1e2e", fontWeight: 700, color: "#fff" },
});

function formatDateOnly(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString();
}

function formatTimeOnly(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString();
}

function buildSignaturePath(
  strokes: { strokes?: Array<Array<{ x: number; y: number }>> } | null | undefined,
  width: number,
  height: number,
) {
  if (!strokes?.strokes?.length) return "";
  const segments = strokes.strokes
    .filter((stroke) => stroke.length)
    .map((stroke) => {
      return stroke
        .map((point, idx) => {
          const x = point.x * width;
          const y = point.y * height;
          return `${idx === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
        })
        .join(" ");
    });
  return segments.join(" ");
}

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
              <Text style={[styles.cell, styles.headerCell, { width: 46, flexGrow: 0, flexShrink: 0 }]}>
                Chainage
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 58, flexGrow: 0, flexShrink: 0 }]}>
                Date
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 52, flexGrow: 0, flexShrink: 0 }]}>
                Time
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L1 150
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L1 450
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L1 750
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L2 150
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L2 450
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L2 750
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L3 150
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L3 450
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                L3 750
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 60, flexGrow: 0, flexShrink: 0 }]}>
                Inspector
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 70, flexGrow: 0, flexShrink: 0 }]}>
                Sign-off
              </Text>
              <Text style={[styles.cell, styles.headerCell, { width: 78, flexGrow: 0, flexShrink: 0 }]}>
                Signature
              </Text>
            </View>
            {chunk.map((record) => (
              <View key={record.chainage ?? record.id} style={styles.dataRow}>
                <Text style={[styles.cell, { width: 46, flexGrow: 0, flexShrink: 0 }]}>
                  {record.chainage ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 58, flexGrow: 0, flexShrink: 0 }]}>
                  {formatDateOnly(record.recorded_at)}
                </Text>
                <Text style={[styles.cell, { width: 52, flexGrow: 0, flexShrink: 0 }]}>
                  {formatTimeOnly(record.recorded_at)}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l1_150 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l1_450 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l1_750 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l2_150 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l2_450 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l2_750 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l3_150 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l3_450 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 34, flexGrow: 0, flexShrink: 0 }]}>
                  {record.l3_750 ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 60, flexGrow: 0, flexShrink: 0 }]}>
                  {record.site_inspector ?? ""}
                </Text>
                <Text style={[styles.cell, { width: 70, flexGrow: 0, flexShrink: 0 }]}>
                  {record.sign_off_by
                    ? `${record.sign_off_by} @ ${
                        record.sign_off_at ? new Date(record.sign_off_at).toLocaleString() : ""
                      }`
                    : "—"}
                </Text>
                <View style={[styles.cell, { width: 78, flexGrow: 0, flexShrink: 0 }]}>
                  {record.signature_strokes ? (
                    <Svg width={72} height={26} viewBox="0 0 72 26">
                      <Path
                        d={buildSignaturePath(record.signature_strokes, 72, 26)}
                        stroke="#111827"
                        strokeWidth={1.4}
                        fill="none"
                      />
                    </Svg>
                  ) : (
                    <Text>—</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </Page>
        );
      })}
    </Document>
  );

  const buffer = await pdf(doc).toBuffer();
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;
  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) {
    return NextResponse.json(
      { error: "SMTP environment variables are missing" },
      { status: 500 },
    );
  }

  const recipients = process.env.ADMIN_EMAIL_ALLOWLIST?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const to = recipients?.length ? recipients.join(", ") : smtpUser;
  if (!to) {
    return NextResponse.json({ error: "Missing email recipient" }, { status: 400 });
  }

  const safeLocation = (locationName ?? "location").replace(/\s+/g, "-");
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number.parseInt(smtpPort, 10),
    secure: Number.parseInt(smtpPort, 10) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject: `PSP Audit - ${locationName ?? locationId}`,
    text: `Location: ${locationName ?? locationId}\nRecords: ${
      records?.length ?? 0
    }`,
    attachments: [
      {
        filename: `PSP-Audit_${safeLocation}.pdf`,
        content: buffer,
        contentType: "application/pdf",
      },
    ],
  });

  return NextResponse.json({ ok: true, message: "Email sent" });
}
