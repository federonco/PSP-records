import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { CHAINAGE_STEP } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveLocationId, validateSaveData } from "@/lib/psp-logic";

function buildRecordPayload(validation: {
  clean: {
    chainage: number;
    siteInspector: string;
    compactorSn?: string | null;
    layers: Record<string, number>;
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
    ...clean.layers,
  };
}

export async function POST(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const body = await request.json();
  const validation = validateSaveData(body);
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

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  const { data: secRow, error: secErr } = await supabase
    .from("sections")
    .select("id")
    .eq("id", unifiedSectionId)
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

  if (subsectionId) {
    const { data: subRow, error: subErr } = await supabase
      .from("subsections")
      .select("id, section_id")
      .eq("id", subsectionId)
      .eq("is_active", true)
      .maybeSingle();
    if (subErr) {
      return NextResponse.json({ error: subErr.message }, { status: 500 });
    }
    if (!subRow || subRow.section_id !== unifiedSectionId) {
      return NextResponse.json(
        { error: "subsection_id does not belong to this section" },
        { status: 400 },
      );
    }
  }

  const rowPayload = buildRecordPayload({
    clean: {
      chainage: clean.chainage,
      siteInspector: clean.siteInspector,
      compactorSn: clean.compactorSn ?? null,
      layers: clean.layers,
      unifiedSectionId,
      subsectionId: clean.subsectionId ?? null,
      legacySectionId: clean.legacySectionId ?? null,
    },
    locationIdDb: resolvedLocationId,
  });

  let recordId: string | null = null;

  if (resolvedLocationId) {
    const { data, error } = await supabase
      .from("psp_records")
      .upsert(rowPayload, { onConflict: "location_id,chainage" })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    recordId = data?.id ?? null;
  } else {
    let find = supabase
      .from("psp_records")
      .select("id")
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

    if (existing?.id) {
      const { data: updated, error: upErr } = await supabase
        .from("psp_records")
        .update({
          site_inspector: rowPayload.site_inspector,
          compactor_sn: rowPayload.compactor_sn,
          unified_section_id: rowPayload.unified_section_id,
          subsection_id: rowPayload.subsection_id,
          section_id: rowPayload.section_id,
          ...clean.layers,
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
      recordId = updated?.id ?? existing.id;
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("psp_records")
        .insert(rowPayload)
        .select("id")
        .single();
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
      recordId = inserted?.id ?? null;
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Lodgement Success!",
    nextCh: clean.chainage - CHAINAGE_STEP,
    recordId,
  });
}
