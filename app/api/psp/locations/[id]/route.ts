import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { mergeLocationAppConfig } from "@/lib/location-app-config";
import {
  readQrToken,
  requireQrScopeOrAuth,
} from "@/lib/psp/resolve-qr-scope";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const body = await request.json();
  const gate = await requireQrScopeOrAuth(
    request,
    {},
    readQrToken(request, body as Record<string, unknown>),
  );
  if (!gate.ok) return gate.response;

  const { penetrometerSn } = body;

  if (penetrometerSn == null) {
    return NextResponse.json(
      { error: "Missing penetrometerSn" },
      { status: 400 },
    );
  }

  const sn = String(penetrometerSn).trim();

  const token = gate.accessToken;
  const supabase = token
    ? getSupabaseServer({ accessToken: token })
    : getSupabaseServer({ useServiceRole: true });

  const { data: current, error: fetchError } = await supabase
    .from("locations")
    .select("app_config")
    .eq("location_type", "psp")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const merged = mergeLocationAppConfig(current?.app_config, {
    penetrometer_sn: sn || null,
  });

  const { data, error } = await supabase
    .from("locations")
    .update({ app_config: merged })
    .eq("location_type", "psp")
    .eq("id", id)
    .select("id,app_config")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ location: data });
}
