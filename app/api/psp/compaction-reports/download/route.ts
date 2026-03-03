import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { CHAINAGE_STEP } from "@/lib/psp";
import { type CompactionTemplateData } from "@/lib/reporting/compaction";
import { generateCompactionPdf } from "@/lib/reporting/compaction-pdf";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const reportId = body?.reportId as string | undefined;

  if (!reportId) {
    return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: report, error } = await supabase
    .from("psp_reports")
    .select("pdf_path,report_type,block_key,location_id")
    .eq("id", reportId)
    .maybeSingle();

  if (error || !report) {
    return NextResponse.json(
      { error: error?.message ?? "Report not found" },
      { status: 404 },
    );
  }

  if (report.report_type !== "compaction") {
    return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "psp-reports";

  try {
    if (!report.block_key) {
      return NextResponse.json({ error: "Missing block key" }, { status: 400 });
    }
    const parts = report.block_key.split("-");
    if (parts.length < 2) {
      return NextResponse.json({ error: "Invalid block key" }, { status: 400 });
    }
    const max = Number(parts[0]);
    const start = Number(parts[1]);
    if (!Number.isFinite(max) || !Number.isFinite(start)) {
      return NextResponse.json({ error: "Invalid block key" }, { status: 400 });
    }
    const chainages: number[] = [];
    for (let value = max; value >= start; value -= CHAINAGE_STEP) {
      chainages.push(value);
    }
    const { data: records, error: recordsError } = await supabase
      .from("psp_records")
      .select(
        "recorded_at,chainage,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector",
      )
      .eq("location_id", report.location_id)
      .in("chainage", chainages)
      .order("chainage", { ascending: false });
    if (recordsError) {
      return NextResponse.json({ error: recordsError.message }, { status: 500 });
    }
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Perth",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const reportDate = formatter.format(new Date());
    const { data: loc } = await supabase
      .from("psp_locations")
      .select("name,penetrometer_sn")
      .eq("id", report.location_id)
      .maybeSingle();
    const templateData: CompactionTemplateData = {
      REPORT_DATE: reportDate,
      SUPERVISOR_NAME: records?.[0]?.site_inspector ?? "",
      WORK_LOCATION: loc?.name ?? report.location_id,
      PENETROMETER_SN: loc?.penetrometer_sn ?? "#3059-0325",
      records: (records ?? []).map((record) => ({
        date: formatter.format(new Date(record.recorded_at)),
        ch: record.chainage,
        l1_a: record.l1_150,
        l1_b: record.l1_450,
        l1_c: record.l1_750,
        l2_a: record.l2_150,
        l2_b: record.l2_450,
        l2_c: record.l2_750,
        l3_a: record.l3_150,
        l3_b: record.l3_450,
        l3_c: record.l3_750,
      })),
    };
    const result = await generateCompactionPdf(templateData);
    const filePath = `compaction-reports/${report.location_id}/${report.block_key}-${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, result.buffer, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    const { error: updateError } = await supabase
      .from("psp_reports")
      .update({ pdf_path: filePath })
      .eq("id", reportId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    report.pdf_path = filePath;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to generate PDF";
    return NextResponse.json(
      {
        error:
          message.includes("soffice") || message.includes("LibreOffice")
            ? "LibreOffice not found. Install LibreOffice (soffice) and add it to PATH."
            : message,
      },
      { status: 500 },
    );
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(report.pdf_path, 60 * 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signedError?.message ?? "Failed to create download link" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
