import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getNextChainageFromSet,
  resolveLocationId,
} from "@/lib/psp-logic";

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
    .order("chainage", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let direction: "backwards" | "onwards" = "backwards";
  let startChainage: number | null = null;

  if (resolvedLocationId) {
    const { data: locationRow } = await supabase
      .from("locations")
      .select("direction,start_chainage")
      .eq("location_type", "psp")
      .eq("id", resolvedLocationId)
      .maybeSingle();

    direction =
      locationRow?.direction === "onwards" ? "onwards" : "backwards";
    startChainage =
      typeof locationRow?.start_chainage === "number"
        ? Number(locationRow.start_chainage)
        : locationRow?.start_chainage != null
          ? Number(locationRow.start_chainage)
          : null;
  } else if (subsectionId) {
    const { data: subRow } = await supabase
      .from("subsections")
      .select("direction, start_ch")
      .eq("id", subsectionId)
      .maybeSingle();
    direction = subRow?.direction === "onwards" ? "onwards" : "backwards";
    startChainage =
      subRow?.start_ch != null ? Number(subRow.start_ch) : null;
  } else {
    const { data: secRow } = await supabase
      .from("sections")
      .select("direction, start_ch")
      .eq("id", unifiedSectionId)
      .maybeSingle();
    direction = secRow?.direction === "onwards" ? "onwards" : "backwards";
    startChainage =
      secRow?.start_ch != null ? Number(secRow.start_ch) : null;
  }

  const chainageList = (data ?? []).map((row) => Number(row.chainage));
  const chainage = getNextChainageFromSet(
    chainageList,
    direction,
    startChainage,
  );
  return NextResponse.json({ chainage });
}
