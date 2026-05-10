import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await request.json();
  const depthRanges = Array.isArray(body?.depth_ranges) ? body.depth_ranges : null;
  if (!depthRanges) {
    return NextResponse.json({ error: "depth_ranges array is required" }, { status: 400 });
  }

  const normalized = depthRanges
    .map((r: unknown) => {
      const row =
        typeof r === "object" && r ? (r as Record<string, unknown>) : {};
      return {
        from_ch: Number(row.from_ch),
        to_ch: Number(row.to_ch),
        max_depth_mm: Number(row.max_depth_mm),
      };
    })
    .filter((r: { from_ch: number; to_ch: number; max_depth_mm: number }) =>
        Number.isFinite(r.from_ch) &&
        Number.isFinite(r.to_ch) &&
        Number.isFinite(r.max_depth_mm),
    );

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: current, error: fetchError } = await supabase
    .from("sections")
    .select("app_config")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const currentConfig =
    current.app_config && typeof current.app_config === "object" && !Array.isArray(current.app_config)
      ? (current.app_config as Record<string, unknown>)
      : {};
  const nextConfig = { ...currentConfig, depth_ranges: normalized };
  const { data, error } = await supabase
    .from("sections")
    .update({ app_config: nextConfig })
    .eq("id", id)
    .select("id,app_config")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ section: data });
}
