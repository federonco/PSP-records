import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { BLOCK_SIZE, CHAINAGE_STEP, getBlockChainages } from "@/lib/psp";
import { type CompactionTemplateData } from "@/lib/reporting/compaction";
import { generateCompactionPdf } from "@/lib/reporting/compaction-pdf";

export const runtime = "nodejs";

type RecordRow = {
  chainage: number;
  recorded_at: string;
  l1_150: number;
  l1_450: number;
  l1_750: number;
  l2_150: number;
  l2_450: number;
  l2_750: number;
  l3_150: number;
  l3_450: number;
  l3_750: number;
  site_inspector: string;
};

type ReportRow = {
  id: string;
  block_key: string;
  pdf_path: string | null;
};

type BlockInfo = {
  index: number;
  blockKey: string;
  start: number;
  end: number;
  expected: number[];
  recordCount: number;
  pending: number[];
  status: "READY" | "OPEN";
};

function computeBlocks(chainages: number[]) {
  if (!chainages.length) return [];
  const sorted = [...chainages].sort((a, b) => b - a);
  const max = sorted[0];
  const totalBlocks = Math.ceil(sorted.length / BLOCK_SIZE);
  const set = new Set(sorted);
  const blocks: BlockInfo[] = [];

  for (let index = 0; index < totalBlocks; index += 1) {
    const blockMax = max - index * BLOCK_SIZE * CHAINAGE_STEP;
    const expected = getBlockChainages(blockMax);
    const start = expected[expected.length - 1];
    const end = expected[0];
    const recordCount = expected.filter((value) => set.has(value)).length;
    const pending = expected.filter((value) => !set.has(value));
    blocks.push({
      index: index + 1,
      blockKey: `${blockMax}-${start}`,
      start,
      end,
      expected,
      recordCount,
      pending,
      status: recordCount === expected.length ? "READY" : "OPEN",
    });
  }
  return blocks;
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
  const locationId = body?.locationId as string | undefined;
  const locationName = body?.locationName as string | undefined;

  if (!locationId) {
    return NextResponse.json({ error: "Missing locationId" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  const { data: locationRow } = locationName
    ? { data: null }
    : await supabase
        .from("psp_locations")
        .select("name")
        .eq("id", locationId)
        .maybeSingle();

  const resolvedLocationName =
    locationName ?? locationRow?.name ?? locationId;

  const { data: records, error } = await supabase
    .from("psp_records")
    .select(
      "recorded_at,chainage,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector",
    )
    .eq("location_id", locationId)
    .order("chainage", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const recordList = (records ?? []) as RecordRow[];
  const blocks = computeBlocks(recordList.map((row) => row.chainage));

  const { data: existingReports } = await supabase
    .from("psp_reports")
    .select("id,block_key,pdf_path,block_index")
    .eq("location_id", locationId)
    .eq("report_type", "compaction");

  const reportMap = new Map(
    (existingReports ?? []).map((row) => [row.block_key, row as ReportRow]),
  );
  const reportIndexMap = new Map<number, ReportRow>();
  (existingReports ?? []).forEach((row: ReportRow & { block_index?: number }) => {
    if (typeof row.block_index === "number") {
      reportIndexMap.set(row.block_index, row as ReportRow);
    }
  });

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Perth",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const reportDate = formatter.format(new Date());
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "psp-reports";
  const safeLocation = resolvedLocationName.replace(/\s+/g, "-");

  let generated = 0;
  let open = 0;

  const recordMap = new Map(
    recordList.map((row) => [row.chainage, row] as const),
  );

  for (const block of blocks) {
    const existing =
      reportMap.get(block.blockKey) ?? reportIndexMap.get(block.index);
    const basePayload = {
      location_id: locationId,
      report_type: "compaction",
      block_key: block.blockKey,
      status: block.status,
      pending_chainages: block.pending,
      start_chainage: block.start,
      end_chainage: block.end,
      block_index: block.index,
      record_count: block.recordCount,
      created_by: user.id,
    };

    if (block.status === "OPEN") {
      open += 1;
      if (existing) {
        const { error: updateError } = await supabase
          .from("psp_reports")
          .update({ ...basePayload, pdf_path: null })
          .eq("id", existing.id);
        if (updateError) {
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 },
          );
        }
      } else {
        const { error: insertError } = await supabase
          .from("psp_reports")
          .insert({
          ...basePayload,
          pdf_path: null,
          });
        if (insertError) {
          return NextResponse.json(
            { error: insertError.message },
            { status: 500 },
          );
        }
      }
      continue;
    }

    const templateRecords = block.expected.map((chainage) => {
      const record = recordMap.get(chainage);
      return {
        date: record ? formatter.format(new Date(record.recorded_at)) : "",
        ch: chainage,
        l1_a: record?.l1_150 ?? "",
        l1_b: record?.l1_450 ?? "",
        l1_c: record?.l1_750 ?? "",
        l2_a: record?.l2_150 ?? "",
        l2_b: record?.l2_450 ?? "",
        l2_c: record?.l2_750 ?? "",
        l3_a: record?.l3_150 ?? "",
        l3_b: record?.l3_450 ?? "",
        l3_c: record?.l3_750 ?? "",
      };
    });

    const blockRecords = block.expected
      .map((chainage) => recordMap.get(chainage))
      .filter((row): row is RecordRow => Boolean(row));
    const supervisorName = blockRecords[0]?.site_inspector ?? "";

    let pdfPath = existing?.pdf_path ?? null;

    if (!pdfPath) {
      const templateData: CompactionTemplateData = {
        REPORT_DATE: reportDate,
        SUPERVISOR_NAME: supervisorName,
        WORK_LOCATION: resolvedLocationName,
        records: templateRecords,
      };
      const result = await generateCompactionPdf(templateData);
      const filePath = `compaction-reports/${safeLocation}/${block.blockKey}-${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, result.buffer, {
          contentType: result.contentType,
          upsert: true,
        });
      if (uploadError) {
        return NextResponse.json(
          { error: uploadError.message },
          { status: 500 },
        );
      }
      pdfPath = filePath;
      generated += 1;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("psp_reports")
        .update({ ...basePayload, pdf_path: pdfPath })
        .eq("id", existing.id);
      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }
    } else {
      const { error: insertError } = await supabase
        .from("psp_reports")
        .insert({
        ...basePayload,
        pdf_path: pdfPath,
        });
      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 },
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    open,
    total: blocks.length,
  });
}
