import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { createRouteHandlerSupabase } from "@/lib/supabase/route-handler";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  void request;
  const supabase = await createRouteHandlerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminSupabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await adminSupabase
    .from("psp_supervisors")
    .select("id,name,company,created_at")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ supervisors: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

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
    .insert({ name, company })
    .select("id,name,company,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ supervisor: data }, { status: 201 });
}
