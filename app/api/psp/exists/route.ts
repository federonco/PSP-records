 import { NextRequest, NextResponse } from "next/server";
 import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveLocationId } from "@/lib/psp-logic";

export async function GET(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const locationName = searchParams.get("location");
  const chainage = Number(searchParams.get("chainage"));
  const unifiedSectionId = searchParams.get("unifiedSectionId")?.trim() || null;
  const subsectionId = searchParams.get("subsectionId")?.trim() || null;

  const resolvedLocationId = await resolveLocationId({
    locationId,
    locationName,
    accessToken: token ?? undefined,
  });

  if (!resolvedLocationId || Number.isNaN(chainage)) {
     return NextResponse.json(
      { error: "Missing location or chainage" },
       { status: 400 },
     );
   }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

   let q = supabase
     .from("psp_records")
    .select("id,sign_off_by,sign_off_at,signature_strokes")
    .eq("location_id", resolvedLocationId)
     .eq("chainage", chainage);

  if (unifiedSectionId) {
    q = q.eq("unified_section_id", unifiedSectionId);
  } else {
    q = q.is("unified_section_id", null);
  }
  if (subsectionId) {
    q = q.eq("subsection_id", subsectionId);
  } else {
    q = q.is("subsection_id", null);
  }

  const { data, error } = await q.maybeSingle();

   if (error) {
     return NextResponse.json({ error: error.message }, { status: 500 });
   }

   return NextResponse.json({
     exists: Boolean(data),
    recordId: data?.id ?? null,
     signOffBy: data?.sign_off_by ?? null,
     signOffAt: data?.sign_off_at ?? null,
    signatureStrokes: data?.signature_strokes ?? null,
   });
 }
