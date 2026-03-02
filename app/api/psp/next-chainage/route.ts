 import { NextRequest, NextResponse } from "next/server";
 import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getNextChainageFromSet,
  resolveLocationId,
} from "@/lib/psp-logic";

export async function GET(request: NextRequest) {
  const { user, token } = await getUserFromRequest(request);

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const locationName = searchParams.get("location");
  const resolvedLocationId = await resolveLocationId({
    locationId,
    locationName,
    accessToken: token ?? undefined,
  });

  if (!resolvedLocationId) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
     .from("psp_records")
     .select("chainage")
    .eq("location_id", resolvedLocationId)
     .order("chainage", { ascending: false })
    .limit(5000);

   if (error) {
     return NextResponse.json({ error: error.message }, { status: 500 });
   }

  const { data: locationRow } = await supabase
    .from("psp_locations")
    .select("direction,start_chainage")
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
