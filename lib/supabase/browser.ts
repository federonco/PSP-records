 "use client";

 import { createClient, SupabaseClient } from "@supabase/supabase-js";

 let client: SupabaseClient | null = null;

 export function getSupabaseBrowser() {
   if (client) return client;

   const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
   const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

   if (!url || !anonKey) {
    console.warn("Supabase env vars missing. Running in UI mode (no backend).");
    return createClient("http://localhost", "public-anon-key");
  }

   client = createClient(url, anonKey, {
     auth: {
       persistSession: true,
       autoRefreshToken: true,
     },
   });

   return client;
 }
