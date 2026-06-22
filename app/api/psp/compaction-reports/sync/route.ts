import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";
import { BLOCK_SIZE, CHAINAGE_STEP, getBlockChainages } from "@/lib/psp";
import { type CompactionTemplateData } from "@/lib/reporting/compaction";
import { generateCompactionPdf } from "@/lib/reporting/compaction-pdf";
import { getPenetrometerSnForTemplate } from "@/lib/location-app-config";

export const runtime = "nodejs";

const ONSITE_B_APP = "onsite-b";

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
  const gate = await requireOnSiteBAdmin(request);
  if (!gate.ok) return gate.response;
  const { user } = gate;

  const body = await request.json();
  const locationId = (body?.locationId as string | null | undefined)?.trim() || undefined;
  const locationName = body?.locationName as string | undefined;
  const sectionId = body?.sectionId as string | undefined;
  const subsectionId = body?.subsectionId as string | undefined;

  console.log("[SYNC] inputs:", { locationId, sectionId, subsectionId, locationName });

  if (!locationId && !sectionId && !subsectionId) {
    return NextResponse.json(
      { error: "Missing locationId, sectionId, or subsectionId" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  const { data: locationRow } =
    !locationId || locationName
      ? { data: null }
      : await supabase
          .from("locations")
          .select("name,app_config")
          .eq("location_type", "psp")
          .eq("id", locationId)
          .maybeSingle();

  const resolvedLocationName =
    locationName ?? locationRow?.name ?? locationId ?? sectionId ?? "location";

  let unified_section_id: string | null = null;
  let subsection_id: string | null = null;

  if (subsectionId) {
    const { data: subsectionRow, error: subsectionError } = await supabase
      .from("subsections")
      .select("id,section_id,app_config")
      .eq("id", subsectionId)
      .eq("app_id", ONSITE_B_APP)
      .maybeSingle();

    if (subsectionError) {
      return NextResponse.json({ error: subsectionError.message }, { status: 500 });
    }

    if (subsectionRow?.id) {
      if (sectionId && subsectionRow.section_id !== sectionId) {
        return NextResponse.json(
          { error: "subsectionId does not belong to sectionId" },
          { status: 400 },
        );
      }

      const cfg = subsectionRow.app_config as Record<string, unknown> | null | undefined;
      const cfgLocationId = cfg?.location_id;
      if (
        typeof cfgLocationId === "string" &&
        locationId &&
        cfgLocationId !== locationId
      ) {
        console.warn("compaction sync location mismatch", {
          locationId,
          cfgLocationId,
          subsectionId,
        });
      }

      unified_section_id = subsectionRow.section_id as string;
      subsection_id = subsectionRow.id as string;
    } else {
      // Dotted sections (e.g. "Section 4.1") are stored in `sections`, not `subsections`.
      const { data: dottedSection, error: dottedError } = await supabase
        .from("sections")
        .select("id")
        .eq("id", subsectionId)
        .maybeSingle();

      if (dottedError) {
        return NextResponse.json({ error: dottedError.message }, { status: 500 });
      }

      if (!dottedSection?.id) {
        return NextResponse.json(
          { error: "Invalid subsectionId for compaction sync scope" },
          { status: 400 },
        );
      }

      unified_section_id = dottedSection.id as string;
      subsection_id = null;
    }
  } else {
    if (sectionId) {
      unified_section_id = sectionId;
    } else if (locationId) {
      const { data: sampleRec } = await supabase
        .from("psp_records")
        .select("unified_section_id")
        .eq("location_id", locationId)
        .not("unified_section_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (sampleRec?.unified_section_id) {
        unified_section_id = sampleRec.unified_section_id as string;
      } else {
        const { data: sharedSec } = await supabase
          .from("sections")
          .select("id")
          .eq("scope", "shared")
          .order("name")
          .limit(1)
          .maybeSingle();
        unified_section_id = (sharedSec?.id as string) ?? null;
      }
    } else {
      unified_section_id = null;
    }
    subsection_id = null;
  }

  console.info("compaction sync payload", {
    locationId,
    sectionId: sectionId ?? null,
    subsectionId: subsectionId ?? null,
    resolvedSectionId: unified_section_id,
    resolvedSubsectionId: subsection_id,
    report_type: "compaction",
  });

  let recordsQuery = supabase.from("psp_records").select(
    "recorded_at,chainage,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector",
  );

  if (locationId) {
    recordsQuery = recordsQuery.eq("location_id", locationId);
    if (subsectionId) {
      recordsQuery = recordsQuery.eq("subsection_id", subsectionId);
    } else if (sectionId) {
      recordsQuery = recordsQuery
        .eq("unified_section_id", sectionId)
        .is("subsection_id", null);
    }
  } else if (subsectionId && unified_section_id && subsection_id) {
    recordsQuery = recordsQuery
      .eq("unified_section_id", unified_section_id)
      .eq("subsection_id", subsectionId);
  } else if (sectionId || unified_section_id) {
    const scopeSectionId =
      unified_section_id && subsection_id === null && subsectionId
        ? unified_section_id
        : (sectionId ?? unified_section_id);
    recordsQuery = recordsQuery
      .eq("unified_section_id", scopeSectionId)
      .is("subsection_id", null);
  } else {
    return NextResponse.json(
      { error: "Cannot resolve record scope without locationId or sectionId" },
      { status: 400 },
    );
  }

  const { data: records, error } = await recordsQuery.order("chainage", {
    ascending: false,
  });

  console.log("[SYNC] records fetched:", records?.length ?? 0, "error:", error?.message);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const recordList = (records ?? []) as RecordRow[];
  const blocks = computeBlocks(recordList.map((row) => row.chainage));

  console.log(
    "[SYNC] blocks computed:",
    blocks.length,
    "from chainages:",
    recordList.map((r) => r.chainage),
  );

  const { data: existingReports } = await supabase
    .from("psp_reports")
    .select("id,block_key,pdf_path,block_index,unified_section_id,subsection_id")
    .eq("report_type", "compaction")
    .eq("unified_section_id", unified_section_id)
    .eq("subsection_id", subsection_id);

  const reportMap = new Map(
    (existingReports ?? []).map((row) => [row.block_key, row as ReportRow]),
  );

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
    const existing = reportMap.get(block.blockKey);
    const basePayload = {
      location_id: locationId ?? null,
      unified_section_id: sectionId ?? unified_section_id,
      subsection_id,
      report_type: "compaction",
      block_key: block.blockKey,
      status: block.status,
      pending_chainages: block.pending,
      start_chainage: Math.round(block.start),
      end_chainage: Math.round(block.end),
      block_index: block.index,
      record_count: block.recordCount,
      created_by: user.id,
    };

    if (block.status === "OPEN") {
      open += 1;
      const { error: upsertError } = await supabase
        .from("psp_reports")
        .upsert(
          {
            ...basePayload,
            pdf_path: null,
          },
          {
            onConflict: "scope_key",
            ignoreDuplicates: false,
          },
        );
      if (upsertError) {
        console.error("[sync] upsert error:", upsertError);
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
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
        PENETROMETER_SN: getPenetrometerSnForTemplate(locationRow ?? undefined),
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

    const { error: upsertError } = await supabase
      .from("psp_reports")
      .upsert(
        {
          ...basePayload,
          pdf_path: pdfPath,
        },
        {
          onConflict: "scope_key",
          ignoreDuplicates: false,
        },
      );
    if (upsertError) {
      console.error("[sync] upsert error:", upsertError);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    generated,
    open,
    total: blocks.length,
    unified_section_id,
    subsection_id,
  });
}
