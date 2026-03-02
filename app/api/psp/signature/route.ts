import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";

type SignaturePayload = {
  version: number;
  canvas: { w: number; h: number };
  strokes: Array<Array<{ x: number; y: number; t: number }>>;
};

export async function POST(request: NextRequest) {
  const { user } = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { locationId, chainage, inspectorName, signatureStrokes } = body;

  if (!locationId || Number.isNaN(Number(chainage)) || !inspectorName) {
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

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: record, error } = await supabase
    .from("psp_records")
    .select("id")
    .eq("location_id", locationId)
    .eq("chainage", Number(chainage))
    .maybeSingle();

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
