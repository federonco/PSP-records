import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase environment variables." },
      { status: 500 },
    );
  }

  const results: {
    ok: boolean;
    anonOk: boolean;
    serviceRoleOk: boolean | null;
    anonError?: string;
    serviceRoleError?: string;
  } = {
    ok: true,
    anonOk: false,
    serviceRoleOk: service ? false : null,
  };

  try {
    const supabaseAnon = getSupabaseServer();
    const { error } = await supabaseAnon
      .from("psp_locations")
      .select("id")
      .limit(1);
    if (error) {
      results.anonError = error.message;
      results.anonOk = false;
    } else {
      results.anonOk = true;
    }
  } catch (error) {
    results.anonError = error instanceof Error ? error.message : "Unknown error";
    results.anonOk = false;
  }

  if (service) {
    try {
      const supabaseService = getSupabaseServer({ useServiceRole: true });
      const { error } = await supabaseService
        .from("psp_locations")
        .select("id")
        .limit(1);
      if (error) {
        results.serviceRoleError = error.message;
        results.serviceRoleOk = false;
      } else {
        results.serviceRoleOk = true;
      }
    } catch (error) {
      results.serviceRoleError =
        error instanceof Error ? error.message : "Unknown error";
      results.serviceRoleOk = false;
    }
  }

  results.ok = results.anonOk || Boolean(results.serviceRoleOk);

  return NextResponse.json(results);
}
