import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

const ONSITE_B = "onsite-b";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.start_ch != null) patch.start_ch = Number(body.start_ch);
  if (body.end_ch != null) patch.end_ch = Number(body.end_ch);
  if (body.direction != null) patch.direction = String(body.direction);
  if (body.app_config != null) patch.app_config = body.app_config;

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("subsections")
    .update(patch)
    .eq("id", id)
    .eq("app_id", ONSITE_B)
    .select("id,section_id,name,start_ch,end_ch,direction,app_config")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subsection: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const supabase = getSupabaseServer({ useServiceRole: true });

  const { count, error: cntErr } = await supabase
    .from("psp_records")
    .select("id", { count: "exact", head: true })
    .eq("subsection_id", id);

  if (cntErr) {
    return NextResponse.json({ error: cntErr.message }, { status: 500 });
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Cannot delete subsection with existing records" },
      { status: 409 },
    );
  }

  const { error } = await supabase
    .from("subsections")
    .delete()
    .eq("id", id)
    .eq("app_id", ONSITE_B);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
