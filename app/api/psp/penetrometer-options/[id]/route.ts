import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
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

  const { serialText } = body;
  if (!serialText || typeof serialText !== "string") {
    return NextResponse.json(
      { error: "Missing serialText" },
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

  const { data, error } = await supabase
    .from("psp_penetrometer_options")
    .update({ serial_text: text })
    .eq("id", id)
    .select("id,serial_text,sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ option: data });
}
