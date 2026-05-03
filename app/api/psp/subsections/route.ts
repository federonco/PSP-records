import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

const ONSITE_B = "onsite-b";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;
  const supabase = getSupabaseServer({ useServiceRole: true });
  const sectionId = new URL(request.url).searchParams.get("sectionId");

  let q = supabase
    .from("subsections")
    .select(
      "id,section_id,name,start_ch,end_ch,direction,app_config,qr_token,app_id",
    )
    .eq("app_id", ONSITE_B);

  if (sectionId) {
    q = q.eq("section_id", sectionId);
  }

  const { data, error } = await q.order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subsections: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  let body: {
    section_id?: string;
    name?: string;
    start_ch?: number;
    end_ch?: number;
    direction?: string;
    app_config?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const section_id = body.section_id?.trim();
  const name = body.name?.trim();
  if (!section_id || !name) {
    return NextResponse.json(
      { error: "Missing section_id or name" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("subsections")
    .insert({
      section_id,
      name,
      start_ch: body.start_ch ?? null,
      end_ch: body.end_ch ?? null,
      direction: body.direction ?? null,
      app_id: ONSITE_B,
      app_config: body.app_config ?? {},
    })
    .select(
      "id,section_id,name,start_ch,end_ch,direction,app_config,qr_token",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subsection: data });
}
