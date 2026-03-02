 import { createClient, SupabaseClient } from "@supabase/supabase-js";

 type ServerClientOptions = {
   accessToken?: string | null;
   useServiceRole?: boolean;
 };

 export function getSupabaseServer({
   accessToken,
   useServiceRole = false,
 }: ServerClientOptions = {}): SupabaseClient {
   const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
   const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
   const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

   if (!url || !anonKey) {
     throw new Error("Missing Supabase environment variables");
   }

   const key = useServiceRole && serviceRoleKey ? serviceRoleKey : anonKey;

   return createClient(url, key, {
     auth: {
       persistSession: false,
       autoRefreshToken: false,
     },
     global: accessToken
       ? {
           headers: {
             Authorization: `Bearer ${accessToken}`,
           },
         }
       : undefined,
   });
 }
