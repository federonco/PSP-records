import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { createRouteHandlerSupabase } from "@/lib/supabase/route-handler";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createRouteHandlerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sectionId = searchParams.get("section_id")?.trim() || null;
  const subsectionId = searchParams.get("subsection_id")?.trim() || null;
  if (!sectionId && !subsectionId) {
    return NextResponse.json(
      { error: "Provide section_id or subsection_id" },
      { status: 400 },
    );
  }

  const adminSupabase = getSupabaseServer({ useServiceRole: true });
  let query = adminSupabase
    .from("psp_supervisor_assignments")
    .select("id,supervisor_id,section_id,subsection_id,psp_supervisors(id,name,company)")
    .order("created_at", { ascending: true });
  query = sectionId ? query.eq("section_id", sectionId) : query.eq("subsection_id", subsectionId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const supervisors = (data ?? [])
    .map((row: any) => row.psp_supervisors)
    .filter(Boolean)
    .sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  return NextResponse.json({ supervisors });
}

export async function POST(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const supervisorId = String(body?.supervisor_id ?? "").trim();
  const sectionId =
    typeof body?.section_id === "string" && body.section_id.trim()
      ? body.section_id.trim()
      : null;
  const subsectionId =
    typeof body?.subsection_id === "string" && body.subsection_id.trim()
      ? body.subsection_id.trim()
      : null;

  if (!supervisorId || (!sectionId && !subsectionId) || (sectionId && subsectionId)) {
    return NextResponse.json({ error: "Invalid assignment body" }, { status: 400 });
  }

  const adminSupabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await adminSupabase
    .from("psp_supervisor_assignments")
    .insert({
      supervisor_id: supervisorId,
      section_id: sectionId,
      subsection_id: subsectionId,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assignment: data }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const supervisorId = String(body?.supervisor_id ?? "").trim();
  const sectionId =
    typeof body?.section_id === "string" && body.section_id.trim()
      ? body.section_id.trim()
      : null;
  const subsectionId =
    typeof body?.subsection_id === "string" && body.subsection_id.trim()
      ? body.subsection_id.trim()
      : null;

  if (!supervisorId || (!sectionId && !subsectionId) || (sectionId && subsectionId)) {
    return NextResponse.json({ error: "Invalid assignment body" }, { status: 400 });
  }

  const adminSupabase = getSupabaseServer({ useServiceRole: true });
  let query = adminSupabase
    .from("psp_supervisor_assignments")
    .delete()
    .eq("supervisor_id", supervisorId);
  query = sectionId ? query.eq("section_id", sectionId) : query.eq("subsection_id", subsectionId);
  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
