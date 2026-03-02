import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  const chainage = Number(searchParams.get("chainage"));

  if (!locationId || Number.isNaN(chainage)) {
    return NextResponse.json(
      { error: "Missing locationId or chainage" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("psp_records")
    .select(
      "location_id,location_name,section_id,chainage,site_inspector,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,signature_strokes,sign_off_by,sign_off_at",
    )
    .eq("location_id", locationId)
    .eq("chainage", chainage)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  return NextResponse.json({ record: data });
}
