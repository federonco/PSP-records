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
  const { serialNumber } = body;

  if (serialNumber == null) {
    return NextResponse.json(
      { error: "Missing serialNumber" },
      { status: 400 },
    );
  }

  const sn = Number(serialNumber);
  if (!Number.isInteger(sn) || sn < 1) {
    return NextResponse.json(
      { error: "serialNumber must be a positive integer" },
      { status: 400 },
    );
  }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  const { data, error } = await supabase
    .from("psp_penetrometers")
    .update({ serial_number: sn })
    .eq("id", id)
    .select("id,serial_number,sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ penetrometer: data });
}
