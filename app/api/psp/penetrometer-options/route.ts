import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  readQrToken,
  requireQrScopeOrAuth,
} from "@/lib/psp/resolve-qr-scope";

const DEFAULT_SN = "#3059-0325";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const locationId = searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "Missing locationId" }, { status: 400 });
  }

  const gate = await requireQrScopeOrAuth(
    request,
    {},
    readQrToken(request),
  );
  if (!gate.ok) return gate.response;

  const token = gate.accessToken;
  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });
  const { data, error } = await supabase
    .from("psp_penetrometer_options")
    .select("id,serial_text,sort_order")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const options = data ?? [];
  if (!options.some((o) => o.serial_text === DEFAULT_SN)) {
    options.unshift({
      id: "default",
      serial_text: DEFAULT_SN,
      sort_order: -1,
    } as (typeof options)[0]);
  }
  return NextResponse.json({ options });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { locationId, serialText } = body;

  const gate = await requireQrScopeOrAuth(
    request,
    {},
    readQrToken(request, body as Record<string, unknown>),
  );
  if (!gate.ok) return gate.response;

  if (!locationId || !serialText || typeof serialText !== "string") {
    return NextResponse.json(
      { error: "Missing locationId or serialText" },
      { status: 400 },
    );
  }

  const text = String(serialText).trim();
  if (!text) {
    return NextResponse.json(
      { error: "serialText cannot be empty" },
      { status: 400 },
    );
  }

  const token = gate.accessToken;
  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  const { data: maxRow } = await supabase
    .from("psp_penetrometer_options")
    .select("sort_order")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = maxRow?.sort_order != null ? maxRow.sort_order + 1 : 0;

  const { data, error } = await supabase
    .from("psp_penetrometer_options")
    .insert({
      location_id: locationId,
      serial_text: text,
      sort_order: nextOrder,
    })
    .select("id,serial_text,sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ option: data });
}
