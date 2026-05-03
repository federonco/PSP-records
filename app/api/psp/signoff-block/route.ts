import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { locationId, chainages } = body;

  if (!locationId || !Array.isArray(chainages) || chainages.length === 0) {
    return NextResponse.json({ error: "Missing block chainages" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("psp_records")
    .update({ sign_off_by: auth.user.email, sign_off_at: now })
    .eq("location_id", locationId)
    .in("chainage", chainages)
    .is("sign_off_at", null)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: data?.length ?? 0 });
}
