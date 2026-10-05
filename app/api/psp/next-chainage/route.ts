import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getNextChainageFromSet,
  resolveLocationId,
  resolveTravelDirection,
} from "@/lib/psp-logic";
import { CHAINAGE_STEP } from "@/lib/psp";

export async function GET(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const { searchParams } = new URL(request.url);
  const locationIdParam = searchParams.get("locationId");
  const locationName = searchParams.get("location");
  const unifiedSectionId = searchParams.get("unifiedSectionId")?.trim() || null;
  const subsectionId = searchParams.get("subsectionId")?.trim() || null;

  if (!unifiedSectionId) {
    return NextResponse.json(
      { error: "Missing unifiedSectionId" },
      { status: 400 },
    );
  }

  const resolvedLocationId = await resolveLocationId({
    locationId: locationIdParam,
    locationName,
    accessToken: token ?? undefined,
  });

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  let q = supabase
    .from("psp_records")
    .select("chainage")
    .eq("unified_section_id", unifiedSectionId);

  if (subsectionId) {
    q = q.eq("subsection_id", subsectionId);
  } else {
    q = q.is("subsection_id", null);
  }

  const { data, error } = await q
    .order("recorded_at", { ascending: false, nullsFirst: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let direction: "backwards" | "onwards" = "backwards";
  let startChainage: number | null = null;
  let endChainage: number | null = null;

  // Direction from subsection or section span (start_ch vs end_ch), not locations.
  if (subsectionId) {
    const { data: subRow } = await supabase
      .from("subsections")
      .select("direction, start_ch, end_ch")
      .eq("id", subsectionId)
      .maybeSingle();
    startChainage =
      subRow?.start_ch != null && Number.isFinite(Number(subRow.start_ch))
        ? Number(subRow.start_ch)
        : null;
    endChainage =
      subRow?.end_ch != null && Number.isFinite(Number(subRow.end_ch))
        ? Number(subRow.end_ch)
        : null;
    direction = resolveTravelDirection(
      subRow?.direction as string | null,
      startChainage,
      endChainage,
    );
  } else {
    const { data: secRow } = await supabase
      .from("sections")
      .select("direction, start_ch, end_ch")
      .eq("id", unifiedSectionId)
      .maybeSingle();
    startChainage =
      secRow?.start_ch != null && Number.isFinite(Number(secRow.start_ch))
        ? Number(secRow.start_ch)
        : null;
    endChainage =
      secRow?.end_ch != null && Number.isFinite(Number(secRow.end_ch))
        ? Number(secRow.end_ch)
        : null;
    direction = resolveTravelDirection(
      secRow?.direction as string | null,
      startChainage,
      endChainage,
    );
  }

  if (startChainage == null && resolvedLocationId) {
    const { data: locationRow } = await supabase
      .from("locations")
      .select("start_chainage")
      .eq("location_type", "psp")
      .eq("id", resolvedLocationId)
      .maybeSingle();
    startChainage =
      locationRow?.start_chainage != null &&
      Number.isFinite(Number(locationRow.start_chainage))
        ? Number(locationRow.start_chainage)
        : null;
  }

  const chainageList = (data ?? []).map((row) => Number(row.chainage));
  const chainage = getNextChainageFromSet(
    chainageList,
    direction,
    startChainage,
  );
  return NextResponse.json({
    chainage,
    direction,
    step: direction === "onwards" ? CHAINAGE_STEP : -CHAINAGE_STEP,
  });
}
