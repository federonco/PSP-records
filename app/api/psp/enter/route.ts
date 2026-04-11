import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  const { data: section, error: secErr } = await supabase
    .from("sections")
    .select("id,name,location_id")
    .eq("qr_token", token)
    .maybeSingle();

  if (secErr) {
    return NextResponse.json({ error: secErr.message }, { status: 500 });
  }

  if (section) {
    const locationId = section.location_id as string | null;
    if (!locationId) {
      return NextResponse.json(
        { error: "Section has no location_id" },
        { status: 500 },
      );
    }
    const { data: loc, error: locErr } = await supabase
      .from("locations")
      .select("id,name")
      .eq("id", locationId)
      .eq("location_type", "psp")
      .maybeSingle();

    if (locErr) {
      return NextResponse.json({ error: locErr.message }, { status: 500 });
    }
    if (!loc) {
      return NextResponse.json(
        { error: "Location not found for section" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      locationId,
      locationName: (loc.name as string) ?? "",
      unifiedSectionId: section.id as string,
      subsectionId: null,
      sectionName: section.name as string,
      subsectionName: null,
    });
  }

  const { data: sub, error: subErr } = await supabase
    .from("subsections")
    .select("id,name,section_id,location_id,sections(id,name)")
    .eq("qr_token", token)
    .maybeSingle();

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  if (!sub) {
    return NextResponse.json({ error: "invalid_token" }, { status: 404 });
  }

  const locationId = sub.location_id as string | null;
  if (!locationId) {
    return NextResponse.json(
      { error: "Subsection has no location_id" },
      { status: 500 },
    );
  }

  const { data: loc, error: locErr2 } = await supabase
    .from("locations")
    .select("id,name")
    .eq("id", locationId)
    .eq("location_type", "psp")
    .maybeSingle();

  if (locErr2) {
    return NextResponse.json({ error: locErr2.message }, { status: 500 });
  }
  if (!loc) {
    return NextResponse.json(
      { error: "Location not found for subsection" },
      { status: 500 },
    );
  }

  const parent = sub.sections as
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  const parentRow = Array.isArray(parent) ? parent[0] : parent;

  return NextResponse.json({
    locationId,
    locationName: (loc.name as string) ?? "",
    unifiedSectionId: (parentRow?.id ?? sub.section_id) as string,
    subsectionId: sub.id as string,
    sectionName: (parentRow?.name as string) ?? "",
    subsectionName: sub.name as string,
  });
}
