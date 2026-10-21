import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getUserFromRequest } from "@/lib/api-auth";
import { getSupabaseServer } from "@/lib/supabase/server";

export type ResolvedQrScope =
  | {
      type: "section";
      unifiedSectionId: string;
      subsectionId: null;
      section: {
        id: string;
        name: string;
        start_ch: number | null;
        end_ch: number | null;
        direction: string | null;
        app_config: unknown;
        scope: string | null;
      };
    }
  | {
      type: "subsection";
      unifiedSectionId: string;
      subsectionId: string;
      subsection: {
        id: string;
        name: string;
        start_ch: number | null;
        end_ch: number | null;
        direction: string | null;
        app_config: unknown;
        section_id: string;
      };
      section: { id: string; name: string };
    };

function normalizeSubId(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim();
  return t || null;
}

/**
 * Resolve an active section/subsection QR token (same rules as /api/psp/enter).
 */
export async function resolveQrScope(
  token: string,
): Promise<
  | { ok: true; scope: ResolvedQrScope }
  | { ok: false; status: 404 | 500; error: string }
> {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false, status: 404, error: "token_not_found" };
  }

  const supabase = getSupabaseServer({ useServiceRole: true });

  const { data: section, error: secErr } = await supabase
    .from("sections")
    .select("id, name, start_ch, end_ch, direction, app_config, scope")
    .eq("qr_token", trimmed)
    .eq("is_active", true)
    .maybeSingle();

  if (secErr) {
    return { ok: false, status: 500, error: secErr.message };
  }

  if (section) {
    return {
      ok: true,
      scope: {
        type: "section",
        unifiedSectionId: section.id as string,
        subsectionId: null,
        section: {
          id: section.id as string,
          name: section.name as string,
          start_ch:
            section.start_ch != null ? Number(section.start_ch) : null,
          end_ch: section.end_ch != null ? Number(section.end_ch) : null,
          direction: (section.direction as string | null) ?? null,
          app_config: section.app_config ?? {},
          scope: (section.scope as string | null) ?? null,
        },
      },
    };
  }

  const { data: subsection, error: subErr } = await supabase
    .from("subsections")
    .select(
      "id, name, start_ch, end_ch, direction, app_config, section_id, sections(id, name)",
    )
    .eq("qr_token", trimmed)
    .eq("is_active", true)
    .maybeSingle();

  if (subErr) {
    return { ok: false, status: 500, error: subErr.message };
  }

  if (!subsection) {
    return { ok: false, status: 404, error: "token_not_found" };
  }

  const parent = subsection.sections as
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  const parentRow = Array.isArray(parent) ? parent[0] : parent;
  const unifiedSectionId = String(
    parentRow?.id ?? subsection.section_id ?? "",
  );

  return {
    ok: true,
    scope: {
      type: "subsection",
      unifiedSectionId,
      subsectionId: subsection.id as string,
      subsection: {
        id: subsection.id as string,
        name: subsection.name as string,
        start_ch:
          subsection.start_ch != null ? Number(subsection.start_ch) : null,
        end_ch: subsection.end_ch != null ? Number(subsection.end_ch) : null,
        direction: (subsection.direction as string | null) ?? null,
        app_config: subsection.app_config ?? {},
        section_id: String(subsection.section_id),
      },
      section: {
        id: unifiedSectionId,
        name: String(parentRow?.name ?? ""),
      },
    },
  };
}

export type QrScopeGateOk = {
  ok: true;
  user: User | null;
  accessToken: string | null;
  /** Set when unauthenticated QR path forced the scope. */
  forced: { unifiedSectionId: string; subsectionId: string | null } | null;
  scope: ResolvedQrScope | null;
};

/**
 * Authenticated admin → pass through.
 * Unauthenticated → require qrToken; force scope; 403 if body/query claims differ.
 */
export async function requireQrScopeOrAuth(
  request: NextRequest,
  claimed: {
    unifiedSectionId?: string | null;
    subsectionId?: string | null;
  },
  qrToken: string | null | undefined,
): Promise<QrScopeGateOk | { ok: false; response: NextResponse }> {
  const { user, token: accessToken } = await getUserFromRequest(request);
  if (user) {
    return {
      ok: true,
      user,
      accessToken,
      forced: null,
      scope: null,
    };
  }

  const qr = String(qrToken ?? "").trim();
  if (!qr) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const resolved = await resolveQrScope(qr);
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: resolved.error },
        { status: resolved.status },
      ),
    };
  }

  const scope = resolved.scope;
  const claimedSec = String(claimed.unifiedSectionId ?? "").trim();
  const claimedSub = normalizeSubId(claimed.subsectionId);

  if (claimedSec && claimedSec !== scope.unifiedSectionId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "qr_scope_mismatch" },
        { status: 403 },
      ),
    };
  }

  if (scope.type === "section") {
    if (claimedSub != null) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "qr_scope_mismatch" },
          { status: 403 },
        ),
      };
    }
  } else if (claimedSub != null && claimedSub !== scope.subsectionId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "qr_scope_mismatch" },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true,
    user: null,
    accessToken: null,
    forced: {
      unifiedSectionId: scope.unifiedSectionId,
      subsectionId: scope.subsectionId,
    },
    scope,
  };
}

/** Read qrToken from query string or JSON body field. */
export function readQrToken(
  request: NextRequest,
  body?: Record<string, unknown> | null,
): string | null {
  const fromQuery = new URL(request.url).searchParams.get("qrToken")?.trim();
  if (fromQuery) return fromQuery;
  const fromBody = body?.qrToken;
  if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  return null;
}
