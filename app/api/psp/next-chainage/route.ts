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
  const locationId = searchParams.get("locationId");
  const locationName = searchParams.get("location");
  const unifiedSectionId = searchParams.get("unifiedSectionId")?.trim() || null;
  const subsectionId = searchParams.get("subsectionId")?.trim() || null;

  const resolvedLocationId = await resolveLocationId({
    locationId,
    locationName,
    accessToken: token ?? undefined,
  });

  if (!resolvedLocationId) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }

  if (!unifiedSectionId) {
    return NextResponse.json(
      { error: "Missing unifiedSectionId" },
      { status: 400 },
    );
  }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  let q = supabase
     .from("psp_records")
     .select("chainage")
     .eq("location_id", resolvedLocationId)
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

  const { data: locationRow } = await supabase
    .from("locations")
    .select("direction,start_chainage")
    .eq("location_type", "psp")
    .eq("id", resolvedLocationId)
    .maybeSingle();

  const direction =
    locationRow?.direction === "onwards" ? "onwards" : "backwards";
  const startChainage =
    typeof locationRow?.start_chainage === "number"
      ? locationRow.start_chainage
      : null;
  const chainageList = (data ?? []).map((row) => Number(row.chainage));
  const chainage = getNextChainageFromSet(
    chainageList,
    direction,
    startChainage,
  );
   return NextResponse.json({ chainage });
 }
