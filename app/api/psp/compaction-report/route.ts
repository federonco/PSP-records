import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { type CompactionTemplateData } from "@/lib/reporting/compaction";
import { generateCompactionPdf } from "@/lib/reporting/compaction-pdf";
import { getSupabaseServer } from "@/lib/supabase/server";

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
  const data = body?.data as CompactionTemplateData | undefined;
  const format = (body?.format as "pdf" | "docx" | undefined) ?? "pdf";
  const locationId = body?.locationId as string | undefined;
  const locationName = body?.locationName as string | undefined;
  const chainages = body?.chainages as number[] | undefined;

  let templateData = data;

  if (!templateData) {
    if (!locationId || !Array.isArray(chainages)) {
      return NextResponse.json(
        { error: "Missing data payload or location/chainages" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServer({ useServiceRole: true });
    const { data: records, error } = await supabase
      .from("psp_records")
      .select(
        "recorded_at,chainage,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector",
      )
      .eq("location_id", locationId)
      .in("chainage", chainages)
      .order("chainage", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Australia/Perth",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const reportDate = formatter.format(new Date());
    const supervisorName =
      records && records.length
        ? records[0].site_inspector
        : "";

    templateData = {
      REPORT_DATE: reportDate,
      SUPERVISOR_NAME: supervisorName,
      WORK_LOCATION: locationName ?? locationId,
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
  }

  try {
    const result =
      format === "pdf"
        ? await generateCompactionPdf(templateData)
        : await import("@/lib/reporting/compaction").then((mod) =>
            mod.generateCompactionReport(templateData, "docx"),
          );
    const body =
      result.buffer instanceof ArrayBuffer
        ? result.buffer
        : result.buffer instanceof Uint8Array
          ? result.buffer.buffer.slice(
              result.buffer.byteOffset,
              result.buffer.byteOffset + result.buffer.byteLength,
            )
          : typeof (result.buffer as any)?.arrayBuffer === "function"
            ? await (result.buffer as any).arrayBuffer()
            : new Uint8Array(result.buffer as unknown as ArrayBuffer).buffer;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Report generation failed" },
      { status: 500 },
    );
  }
}
