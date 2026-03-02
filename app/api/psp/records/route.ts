 import { NextRequest, NextResponse } from "next/server";
 import { getUserFromRequest } from "@/lib/api-auth";
import { CHAINAGE_STEP } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveLocationId, validateSaveData } from "@/lib/psp-logic";

 export async function POST(request: NextRequest) {
   const { user, token } = await getUserFromRequest(request);
   if (!user || !token) {
     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
   }

  const body = await request.json();
  const validation = validateSaveData(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const resolvedLocationId = await resolveLocationId({
    locationId: validation.clean.locationId,
    locationName: validation.clean.locationName,
    accessToken: token,
  });

  if (!resolvedLocationId) {
    return NextResponse.json({ error: "Missing location" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ accessToken: token });
  const { error } = await supabase.from("psp_records").upsert(
    {
      location_id: resolvedLocationId,
      location_name: validation.clean.locationName ?? null,
      section_id: validation.clean.sectionId ?? null,
      chainage: validation.clean.chainage,
      site_inspector: validation.clean.siteInspector,
      ...validation.clean.layers,
    },
    { onConflict: "location_id,chainage" },
  );

   if (error) {
     return NextResponse.json({ error: error.message }, { status: 500 });
   }

  return NextResponse.json({
    ok: true,
    message: "Lodgement Success!",
    nextCh: validation.clean.chainage - CHAINAGE_STEP,
  });
 }
