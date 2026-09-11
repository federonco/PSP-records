import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { CHAINAGE_STEP } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveLocationId, validateSaveData } from "@/lib/psp-logic";
import {
  getLayerFieldKeysForLayerCount,
  PSP_RECORD_DB_LAYER_COUNT,
} from "@/lib/psp-depth";
import { resolveLayersRequired } from "@/lib/psp-layers";
import { isRecordComplete, nextCompletedAt } from "@/lib/psp-status";

function buildRecordPayload(validation: {
  clean: {
    chainage: number;
    siteInspector: string;
    compactorSn?: string | null;
    layers: Partial<Record<string, number | null>>;
    layersRequired: number;
    unifiedSectionId: string | null;
    subsectionId: string | null;
    legacySectionId: string | null;
  };
  locationIdDb: string | null;
}) {
  const { clean, locationIdDb } = validation;
  return {
    unified_section_id: clean.unifiedSectionId,
    subsection_id: clean.subsectionId || null,
    location_id: locationIdDb,
    section_id: clean.legacySectionId || null,
    chainage: clean.chainage,
    site_inspector: clean.siteInspector,
    compactor_sn: clean.compactorSn ?? null,
    // Always write explicitly — never rely on the column default.
    layers_required: clean.layersRequired,
    ...clean.layers,
  };
}

export async function POST(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const body = await request.json();
  const sectionIdFromBody =
    String(body?.unifiedSectionId ?? body?.sectionId ?? "").trim() || null;
  if (!sectionIdFromBody) {
    return NextResponse.json({ error: "unifiedSectionId is required" }, { status: 400 });
  }
  const chainageRaw = Number(body?.chainage);
  if (!Number.isFinite(chainageRaw)) {
    return NextResponse.json({ error: "Invalid chainage" }, { status: 400 });
  }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  const { data: secRow, error: secErr } = await supabase
    .from("sections")
    .select("id,app_config")
    .eq("id", sectionIdFromBody)
    .eq("is_active", true)
    .maybeSingle();

  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }
  if (!secRow) {
    return NextResponse.json(
      { error: "unified_section_id not found or inactive" },
      { status: 400 },
    );
  }

  const subsectionIdRaw =
    String(body?.subsectionId ?? "").trim() || null;

  let subsectionAppConfig: unknown = null;
  if (subsectionIdRaw) {
    const { data: subRow, error: subErr } = await supabase
      .from("subsections")
      .select("id,section_id,app_config")
      .eq("id", subsectionIdRaw)
      .eq("is_active", true)
      .maybeSingle();
    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }
    if (!subRow || subRow.section_id !== sectionIdFromBody) {
      return NextResponse.json(
        { error: "subsection_id does not belong to this section" },
        { status: 400 },
      );
    }
    subsectionAppConfig = subRow.app_config;
  }

  // Resolve layers for NEW inserts only. Existing rows keep frozen layers_required.
  const resolvedLayers = resolveLayersRequired({
    subsectionAppConfig,
    sectionAppConfig: secRow.app_config,
    chainage: chainageRaw,
  });

  const validation = validateSaveData(body, resolvedLayers);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const { clean } = validation;
  const unifiedSectionId = clean.unifiedSectionId!;
  const subsectionId = clean.subsectionId || null;

  const resolvedLocationId =
    clean.locationId || clean.locationName
      ? await resolveLocationId({
          locationId: clean.locationId || null,
          locationName: clean.locationName,
          accessToken: token ?? undefined,
        })
      : null;

  const dbLayerKeys = new Set(
    getLayerFieldKeysForLayerCount(PSP_RECORD_DB_LAYER_COUNT),
  );
  const toMerge = Object.fromEntries(
    Object.entries(clean.layers).filter(
      ([k, v]) => dbLayerKeys.has(k) && v !== undefined,
    ),
  );

  let recordId: string | null = null;

  let find = supabase
    .from("psp_records")
    .select("id,layers_required,completed_at,*")
    .eq("unified_section_id", unifiedSectionId)
    .eq("chainage", clean.chainage);
  if (subsectionId) {
    find = find.eq("subsection_id", subsectionId);
  } else {
    find = find.is("subsection_id", null);
  }
  const { data: existing, error: findErr } = await find.maybeSingle();
  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  if (!existing?.id && resolvedLocationId) {
    const { data: locationClash, error: clashErr } = await supabase
      .from("psp_records")
      .select("id")
      .eq("location_id", resolvedLocationId)
      .eq("chainage", clean.chainage)
      .maybeSingle();
    if (clashErr) {
      return NextResponse.json({ error: clashErr.message }, { status: 500 });
    }
    if (locationClash?.id) {
      return NextResponse.json(
        {
          error:
            "This chainage already has a record lodged (possibly legacy). Contact an admin before continuing.",
        },
        { status: 409 },
      );
    }
  }

  if (existing?.id) {
    const existingRow = existing as Record<string, unknown>;
    // Frozen at insert — do not overwrite with newly resolved config.
    const frozenLayers =
      Number.isFinite(Number(existingRow.layers_required)) &&
      Number(existingRow.layers_required) >= 1
        ? Math.floor(Number(existingRow.layers_required))
        : resolvedLayers;
    const mergedRecord = {
      ...existingRow,
      ...toMerge,
      layers_required: frozenLayers,
    };
    const completedAt = nextCompletedAt(existingRow, mergedRecord);
    const { data: updated, error: upErr } = await supabase
      .from("psp_records")
      .update({
        site_inspector: clean.siteInspector,
        compactor_sn: clean.compactorSn ?? null,
        unified_section_id: unifiedSectionId,
        subsection_id: subsectionId,
        section_id: clean.legacySectionId || null,
        location_id: resolvedLocationId,
        layers_required: frozenLayers,
        updated_at: new Date().toISOString(),
        completed_at: completedAt,
        ...toMerge,
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    recordId = updated?.id ?? existing.id;
  } else {
    const rowPayload = buildRecordPayload({
      clean: {
        chainage: clean.chainage,
        siteInspector: clean.siteInspector,
        compactorSn: clean.compactorSn ?? null,
        layers: clean.layers,
        layersRequired: resolvedLayers,
        unifiedSectionId,
        subsectionId: clean.subsectionId ?? null,
        legacySectionId: clean.legacySectionId ?? null,
      },
      locationIdDb: resolvedLocationId,
    });
    const insertLayers = Object.fromEntries(
      Object.entries(rowPayload).filter(([k]) => dbLayerKeys.has(k)),
    ) as Record<string, number | null>;
    const insertRecord = {
      ...insertLayers,
      layers_required: resolvedLayers,
    } as Record<string, unknown>;
    const insertedPayload = {
      unified_section_id: rowPayload.unified_section_id,
      subsection_id: rowPayload.subsection_id,
      location_id: rowPayload.location_id,
      section_id: rowPayload.section_id,
      chainage: rowPayload.chainage,
      site_inspector: rowPayload.site_inspector,
      compactor_sn: rowPayload.compactor_sn,
      layers_required: resolvedLayers,
      updated_at: null,
      completed_at: isRecordComplete(insertRecord)
        ? new Date().toISOString()
        : null,
      ...insertLayers,
    };
    const { data: inserted, error: insErr } = await supabase
      .from("psp_records")
      .insert(insertedPayload)
      .select("id")
      .single();
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    recordId = inserted?.id ?? null;
  }

  return NextResponse.json({
    ok: true,
    message: "Lodgement Success!",
    nextCh: clean.chainage - CHAINAGE_STEP,
    recordId,
  });
}
