 import { NextRequest } from "next/server";
 import { getSupabaseServer } from "@/lib/supabase/server";

 export async function getUserFromRequest(request: NextRequest) {
   const authHeader = request.headers.get("authorization");
   const token = authHeader?.replace("Bearer ", "");
   if (!token) return { user: null, token: null };
   const supabase = getSupabaseServer({ accessToken: token });
   const { data } = await supabase.auth.getUser();
   return { user: data.user ?? null, token };
 }
