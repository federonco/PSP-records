import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { CHAINAGE_STEP } from "@/lib/psp";
import { getSupabaseServer } from "@/lib/supabase/server";

const layerKeys = [
  "l1_150",
  "l1_450",
  "l1_750",
  "l2_150",
  "l2_450",
  "l2_750",
  "l3_150",
  "l3_450",
  "l3_750",
] as const;

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const {
    locationId,
    locationName,
    chainage,
    siteInspector,
    layers,
    sectionId,
  } = body;

  if (!locationId || !siteInspector || Number.isNaN(Number(chainage))) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const chainageNumber = Number(chainage);
  if (chainageNumber % CHAINAGE_STEP !== 0) {
    return NextResponse.json(
      { error: "Chainage must be a multiple of 20" },
      { status: 400 },
    );
  }

  const layerPayload: Record<string, number> = {};
  for (const key of layerKeys) {
    const value = Number(layers?.[key]);
    if (Number.isNaN(value) || value < 0 || value > 30) {
      return NextResponse.json(
        { error: `Layer ${key} must be between 0 and 30` },
        { status: 400 },
      );
    }
    layerPayload[key] = value;
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: existing, error: findError } = await supabase
    .from("psp_records")
    .select("id")
    .eq("location_id", locationId)
    .eq("chainage", chainageNumber)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }

  if (!existing) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("psp_records")
    .update({
      location_name: locationName ?? null,
      section_id: sectionId ?? null,
      site_inspector: siteInspector,
      ...layerPayload,
    })
    .eq("id", existing.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
