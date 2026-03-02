 import { NextRequest, NextResponse } from "next/server";
 import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  getNextChainageFromSet,
  resolveLocationId,
} from "@/lib/psp-logic";

 export async function GET(request: NextRequest) {
   const { user, token } = await getUserFromRequest(request);
   if (!user || !token) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const locationName = searchParams.get("location");
  const resolvedLocationId = await resolveLocationId({
    locationId,
    locationName,
    accessToken: token,
  });

  if (!resolvedLocationId) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }

   const supabase = getSupabaseServer({ accessToken: token });
   const { data, error } = await supabase
     .from("psp_records")
     .select("chainage")
    .eq("location_id", resolvedLocationId)
     .order("chainage", { ascending: false })
    .limit(5000);

   if (error) {
     return NextResponse.json({ error: error.message }, { status: 500 });
   }

  const chainageList = (data ?? []).map((row) => Number(row.chainage));
  const chainage = getNextChainageFromSet(chainageList);
   return NextResponse.json({ chainage });
 }
