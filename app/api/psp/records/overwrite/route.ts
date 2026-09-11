import { NextRequest, NextResponse } from "next/server";
import { CHAINAGE_STEP } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getLayerFieldKeysForLayerCount,
  PSP_RECORD_DB_LAYER_COUNT,
} from "@/lib/psp-depth";
import { nextCompletedAt } from "@/lib/psp-status";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    locationId,
    chainage,
    siteInspector,
    layers,
    unifiedSectionId,
    subsectionId,
    sectionId,
    compactorSn,
  } = body;

  const chainageNumber = Number(chainage);
  if (!siteInspector || Number.isNaN(chainageNumber)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const hasLocation = Boolean(locationId && String(locationId).trim());
  const unified =
    (unifiedSectionId != null && String(unifiedSectionId).trim()) ||
    (sectionId != null && String(sectionId).trim()) ||
    null;
  if (!hasLocation && !unified) {
    return NextResponse.json(
      { error: "Provide locationId or unifiedSectionId" },
      { status: 400 },
    );
  }

  if (chainageNumber % CHAINAGE_STEP !== 0) {
    return NextResponse.json(
      { error: "Chainage must be a multiple of 20" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const allLayerKeys = getLayerFieldKeysForLayerCount(
    PSP_RECORD_DB_LAYER_COUNT,
  );

  const layerPayload: Record<string, number | null> = {};
  for (const key of allLayerKeys) {
    const raw = layers?.[key];
    if (raw === "" || raw === null || raw === undefined) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 35) {
      return NextResponse.json(
        { error: `Layer ${key} must be between 0 and 35` },
        { status: 400 },
      );
    }
    layerPayload[key] = value;
  }

  let find = supabase
    .from("psp_records")
    .select("*")
    .eq("chainage", chainageNumber);

  if (hasLocation) {
    find = find.eq("location_id", String(locationId).trim());
  } else {
    find = find.eq("unified_section_id", unified!);
    const sub =
      subsectionId != null && String(subsectionId).trim()
        ? String(subsectionId).trim()
        : null;
    if (sub) {
      find = find.eq("subsection_id", sub);
    } else {
      find = find.is("subsection_id", null);
    }
  }

  const { data: existing, error: findError } = await find.maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const existingRow = existing as Record<string, unknown>;
  // layers_required frozen at insert — overwrite must not change the criterion.
  const frozenLayers =
    Number.isFinite(Number(existingRow.layers_required)) &&
    Number(existingRow.layers_required) >= 1
      ? Math.floor(Number(existingRow.layers_required))
      : 3;

  const compactorSnValue =
    compactorSn !== undefined && compactorSn !== null && compactorSn !== ""
      ? String(compactorSn).trim()
      : null;

  const sub =
    subsectionId != null && String(subsectionId).trim()
      ? String(subsectionId).trim()
      : null;

  const mergedRecord = {
    ...existingRow,
    ...layerPayload,
    layers_required: frozenLayers,
  };
  const completedAt = nextCompletedAt(existingRow, mergedRecord);

  const { error } = await supabase
    .from("psp_records")
    .update({
      unified_section_id: unified,
      subsection_id: sub,
      site_inspector: siteInspector,
      compactor_sn: compactorSnValue || null,
      layers_required: frozenLayers,
      updated_at: new Date().toISOString(),
      completed_at: completedAt,
      ...layerPayload,
    })
    .eq("id", existing.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
