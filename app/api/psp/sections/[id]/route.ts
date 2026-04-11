import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { user, token } = await getUserFromRequest(request);
  if (!user || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
