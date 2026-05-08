import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const body = await request.json();
  const name = String(body?.name ?? "").trim();
  const companyRaw = body?.company;
  const company =
    typeof companyRaw === "string" && companyRaw.trim()
      ? companyRaw.trim()
      : null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const adminSupabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await adminSupabase
    .from("psp_supervisors")
    .update({ name, company })
    .eq("id", id)
    .select("id,name,company,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ supervisor: data });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  const adminSupabase = getSupabaseServer({ useServiceRole: true });
  const { error } = await adminSupabase.from("psp_supervisors").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
