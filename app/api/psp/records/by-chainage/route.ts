import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const unifiedSectionId = searchParams.get("unifiedSectionId")?.trim() || null;
  const subsectionId = searchParams.get("subsectionId")?.trim() || null;
  const chainage = Number(searchParams.get("chainage"));

  const hasLocation = Boolean(locationId && locationId.trim());
  if ((!hasLocation && !unifiedSectionId) || Number.isNaN(chainage)) {
    return NextResponse.json(
      {
        error:
          "Provide (locationId and chainage) or (unifiedSectionId, chainage, optional subsectionId)",
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  let q = supabase
    .from("psp_records")
    .select(
      "location_id,unified_section_id,subsection_id,chainage,site_inspector,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,signature_strokes,sign_off_by,sign_off_at",
    )
    .eq("chainage", chainage);

  if (hasLocation) {
    q = q.eq("location_id", locationId!.trim());
  } else {
    q = q.eq("unified_section_id", unifiedSectionId!);
    if (subsectionId) {
      q = q.eq("subsection_id", subsectionId);
    } else {
      q = q.is("subsection_id", null);
    }
  }

  const { data, error } = await q.maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  return NextResponse.json({ record: data });
}
