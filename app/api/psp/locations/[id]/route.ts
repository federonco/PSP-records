import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { token } = await getUserFromRequest(request);
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await request.json();
  const { penetrometerSn } = body;

  if (penetrometerSn == null) {
    return NextResponse.json(
      { error: "Missing penetrometerSn" },
      { status: 400 },
    );
  }

  const sn = String(penetrometerSn).trim();

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  const { data, error } = await supabase
    .from("locations")
    .update({ penetrometer_sn: sn || null })
    .eq("location_type", "psp")
    .eq("id", id)
    .select("id,penetrometer_sn")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ location: data });
}
