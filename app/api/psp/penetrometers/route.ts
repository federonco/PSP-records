import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "Missing locationId" }, { status: 400 });
  }

  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("psp_penetrometers")
    .select("id,serial_number,sort_order")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ penetrometers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { token } = await getUserFromRequest(request);

  const body = await request.json();
  const { locationId, serialNumber } = body;

  if (!locationId || serialNumber == null) {
    return NextResponse.json(
      { error: "Missing locationId or serialNumber" },
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

  const { data: maxRow } = await supabase
    .from("psp_penetrometers")
    .select("sort_order")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = maxRow?.sort_order != null ? maxRow.sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("psp_penetrometers")
    .insert({
      location_id: locationId,
      serial_number: sn,
      sort_order: nextOrder,
    })
    .select("id,serial_number,sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ penetrometer: data });
}
