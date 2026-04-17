import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  const { data: section, error: secErr } = await supabase
    .from("sections")
    .select("id, name, start_ch, end_ch, direction, app_config, scope")
    .eq("qr_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (secErr) {
    console.error("[psp/enter] sections query error", {
      tokenPrefix: token.slice(0, 8),
      message: secErr.message,
    });
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }

  if (section) {
    return NextResponse.json({ type: "section", ...section });
  }

  const { data: subsection, error: subErr } = await supabase
    .from("subsections")
    .select(
      "id, name, start_ch, end_ch, direction, app_config, section_id, sections(id, name)",
    )
    .eq("qr_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (subErr) {
    console.error("[psp/enter] subsections query error", {
      tokenPrefix: token.slice(0, 8),
      message: subErr.message,
    });
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  if (subsection) {
    return NextResponse.json({ type: "subsection", ...subsection });
  }

  console.error("[psp/enter] token not found", { tokenPrefix: token.slice(0, 8) });
  return NextResponse.json({ error: "token_not_found" }, { status: 404 });
}
