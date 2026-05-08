import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

/** public.apps.id / user_app_roles.app_id for OnSite-B (PSP). Not "psp". */
export const APP_ID = "onsite-b" as const;

async function userHasRoles(
  userId: string,
  roles: readonly string[],
): Promise<boolean> {
  const sr = getSupabaseServer({ useServiceRole: true });
  const { data, error } = await sr
    .from("user_app_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("app_id", APP_ID)
    .in("role", [...roles])
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** Admin or super_admin for this app (service-role lookup by session user). */
export async function isAdmin(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return userHasRoles(user.id, ["admin", "super_admin"]);
}

export async function isSuperAdmin(supabase: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return userHasRoles(user.id, ["super_admin"]);
}

/** For middleware: no user JWT, only user id from cookie session. */
export async function userIdHasOnSiteBAdmin(userId: string): Promise<boolean> {
  return userHasRoles(userId, ["admin", "super_admin"]);
}

export async function userIdHasOnSiteBSuperAdmin(userId: string): Promise<boolean> {
  return userHasRoles(userId, ["super_admin"]);
}

export function isAdminEmail(email?: string | null) {
  const allowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!allowlist || !email) return false;
  const allowed = allowlist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

/**
 * API routes that use Authorization: Bearer &lt;access_token&gt;.
 * Returns 401 if missing session or no onsite-b admin role.
 */
export async function requireOnSiteBAdmin(request: NextRequest): Promise<
  | { ok: true; user: User }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const supabase = getSupabaseServer({ accessToken: token });
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!(await isAdmin(supabase))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true, user };
}
