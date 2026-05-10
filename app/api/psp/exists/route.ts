import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const { searchParams } = new URL(request.url);
  const chainage = Number(searchParams.get("chainage"));
  const unifiedSectionId = searchParams.get("unifiedSectionId")?.trim() || null;
  const subsectionId = searchParams.get("subsectionId")?.trim() || null;

  if (!unifiedSectionId || Number.isNaN(chainage)) {
    return NextResponse.json(
      { error: "Missing unifiedSectionId or chainage" },
      { status: 400 },
    );
  }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  let q = supabase
    .from("psp_records")
    .select("id,sign_off_by,sign_off_at,signature_strokes,layers_required,completed_at,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,l4_150,l4_450,l4_750,l5_150,l5_450,l5_750")
    .eq("unified_section_id", unifiedSectionId)
    .eq("chainage", chainage);

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
    layersRequired: data?.layers_required ?? 3,
    completedAt: data?.completed_at ?? null,
    layers: data
      ? {
          l1_150: data.l1_150,
          l1_450: data.l1_450,
          l1_750: data.l1_750,
          l2_150: data.l2_150,
          l2_450: data.l2_450,
          l2_750: data.l2_750,
          l3_150: data.l3_150,
          l3_450: data.l3_450,
          l3_750: data.l3_750,
          l4_150: data.l4_150,
          l4_450: data.l4_450,
          l4_750: data.l4_750,
          l5_150: data.l5_150,
          l5_450: data.l5_450,
          l5_750: data.l5_750,
        }
      : null,
  });
}
