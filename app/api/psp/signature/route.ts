import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

type SignaturePayload = {
  version: number;
  canvas: { w: number; h: number };
  strokes: Array<Array<{ x: number; y: number; t: number }>>;
};

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    locationId,
    unifiedSectionId,
    subsectionId,
    chainage,
    inspectorName,
    signatureStrokes,
  } = body;

  if (Number.isNaN(Number(chainage)) || !inspectorName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const payload = signatureStrokes as SignaturePayload;
  if (
    !payload ||
    payload.version !== 1 ||
    !payload.canvas ||
    !Array.isArray(payload.strokes)
  ) {
    return NextResponse.json({ error: "Invalid signature payload" }, { status: 400 });
  }

  const hasLocation = Boolean(locationId && String(locationId).trim());
  const hasUnified = Boolean(
    unifiedSectionId && String(unifiedSectionId).trim(),
  );
  if (!hasLocation && !hasUnified) {
    return NextResponse.json(
      { error: "Provide locationId or unifiedSectionId" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  let q = supabase
    .from("psp_records")
    .select("id")
    .eq("chainage", Number(chainage));

  if (hasLocation) {
    q = q.eq("location_id", String(locationId).trim());
  } else {
    q = q.eq("unified_section_id", String(unifiedSectionId).trim());
    const sub = subsectionId != null && String(subsectionId).trim();
    if (sub) {
      q = q.eq("subsection_id", sub);
    } else {
      q = q.is("subsection_id", null);
    }
  }

  const { data: record, error } = await q.maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!record) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("psp_records")
    .update({
      signature_strokes: payload,
      sign_off_by: inspectorName,
      sign_off_at: now,
    })
    .eq("id", record.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, signOffAt: now });
}
