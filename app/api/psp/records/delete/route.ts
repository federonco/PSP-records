import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/api-auth";
import { isAdminEmail } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const { user, token } = await getUserFromRequest(request);
  if (!user || !token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json();
  const { locationId, chainage } = body ?? {};
  const chainageNumber = Number(chainage);
  if (!locationId || !Number.isFinite(chainageNumber)) {
    return NextResponse.json(
      { error: "Missing locationId or chainage" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { error } = await supabase
    .from("psp_records")
    .delete()
    .eq("location_id", locationId)
    .eq("chainage", chainageNumber);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
