"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Cookie-backed client so middleware SSR and /admin share the same session. */
export function getSupabaseBrowser() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.warn("Supabase env vars missing. Running in UI mode (no backend).");
    return createBrowserClient("http://localhost", "public-anon-key");
  }

  client = createBrowserClient(url, anonKey);
  return client;
}

/** Fresh access token for admin API routes (`Authorization: Bearer`). */
export async function getBrowserAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    return data.session.access_token;
  }
  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session?.access_token ?? null;
}
