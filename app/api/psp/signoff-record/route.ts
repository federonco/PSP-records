import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const gate = await requireOnSiteBAdmin(request);
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { locationId, chainage, siteInspector, forceOverwrite } = body;

  if (!locationId || Number.isNaN(Number(chainage)) || !siteInspector) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("psp_records")
    .select("id,sign_off_at")
    .eq("location_id", locationId)
    .eq("chainage", Number(chainage))
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  if (data.sign_off_at && !forceOverwrite) {
    return NextResponse.json(
      { error: "Already signed. Enable force overwrite to proceed." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("psp_records")
    .update({ sign_off_by: siteInspector, sign_off_at: now })
    .eq("id", data.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, signOffBy: siteInspector, signOffAt: now });
}
