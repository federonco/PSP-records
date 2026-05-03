import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json();
  const { name } = body;
  if (!name) {
    return NextResponse.json({ error: "Missing section name" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("sections")
    .update({ name })
    .eq("id", id)
    .select("id,name")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ section: data });
}
