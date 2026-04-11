import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

export function getEnsureQrSupabase(accessToken: string) {
  return getSupabaseServer({ accessToken });
}

export function buildEnterQrUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("NEXT_PUBLIC_SITE_URL is required for QR URLs");
  }
  return `${base}/enter?token=${encodeURIComponent(token)}`;
}

export async function ensureUnifiedSectionQrToken(
  supabase: SupabaseClient,
  sectionId: string,
): Promise<{
  qr_token: string;
  qr_token_issued_at: string;
  url: string;
}> {
  const { data: row, error: fetchError } = await supabase
    .from("sections")
    .select("id,qr_token,qr_token_issued_at")
    .eq("id", sectionId)
    .single();

  if (fetchError || !row) {
    throw new Error(fetchError?.message ?? "Section not found");
  }

  if (row.qr_token) {
    const issued = row.qr_token_issued_at
      ? new Date(row.qr_token_issued_at as string).toISOString()
      : new Date().toISOString();
    return {
      qr_token: row.qr_token as string,
      qr_token_issued_at: issued,
      url: buildEnterQrUrl(row.qr_token as string),
    };
  }

  const token = randomUUID();
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("sections")
    .update({ qr_token: token, qr_token_issued_at: now })
    .eq("id", sectionId)
    .select("qr_token,qr_token_issued_at")
    .single();

  if (updateError || !updated?.qr_token) {
    throw new Error(updateError?.message ?? "Failed to set QR token");
  }

  return {
    qr_token: updated.qr_token as string,
    qr_token_issued_at: (updated.qr_token_issued_at as string) ?? now,
    url: buildEnterQrUrl(updated.qr_token as string),
  };
}

export async function ensureSubsectionQrToken(
  supabase: SupabaseClient,
  subsectionId: string,
): Promise<{
  qr_token: string;
  qr_token_issued_at: string;
  url: string;
}> {
  const { data: row, error: fetchError } = await supabase
    .from("subsections")
    .select("id,qr_token,qr_token_issued_at")
    .eq("id", subsectionId)
    .single();

  if (fetchError || !row) {
    throw new Error(fetchError?.message ?? "Subsection not found");
  }

  if (row.qr_token) {
    const issued = row.qr_token_issued_at
      ? new Date(row.qr_token_issued_at as string).toISOString()
      : new Date().toISOString();
    return {
      qr_token: row.qr_token as string,
      qr_token_issued_at: issued,
      url: buildEnterQrUrl(row.qr_token as string),
    };
  }

  const token = randomUUID();
  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabase
    .from("subsections")
    .update({ qr_token: token, qr_token_issued_at: now })
    .eq("id", subsectionId)
    .select("qr_token,qr_token_issued_at")
    .single();

  if (updateError || !updated?.qr_token) {
    throw new Error(updateError?.message ?? "Failed to set QR token");
  }

  return {
    qr_token: updated.qr_token as string,
    qr_token_issued_at: (updated.qr_token_issued_at as string) ?? now,
    url: buildEnterQrUrl(updated.qr_token as string),
  };
}
