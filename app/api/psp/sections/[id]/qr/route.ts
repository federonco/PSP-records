import { NextRequest, NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/admin";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  buildEnterQrUrl,
  ensureUnifiedSectionQrToken,
} from "@/lib/psp/unified-qr";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  const { user, token } = await getUserFromRequest(request);
  if (!user || !token) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isAdminEmail(user.email)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, user, token };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: sectionId } = await params;
  const supabase = getSupabaseServer({ useServiceRole: true });
  const { data: row, error } = await supabase
    .from("sections")
    .select("qr_token,qr_token_issued_at")
    .eq("id", sectionId)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? "Section not found" }, { status: 404 });
  }

  const qrToken = row.qr_token as string | null;
  if (!qrToken) {
    return NextResponse.json({
      qr_token: null,
      qr_token_issued_at: null,
      url: null,
    });
  }

  return NextResponse.json({
    qr_token: qrToken,
    qr_token_issued_at: row.qr_token_issued_at
      ? new Date(row.qr_token_issued_at as string).toISOString()
      : null,
    url: buildEnterQrUrl(qrToken),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return auth.response;

  const { id: sectionId } = await params;
  try {
    const supabase = getSupabaseServer({ useServiceRole: true });
    const result = await ensureUnifiedSectionQrToken(supabase, sectionId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to ensure QR token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
