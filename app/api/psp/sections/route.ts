import { NextRequest, NextResponse } from "next/server";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { getSupabaseServer } from "@/lib/supabase/server";

const ONSITE_B = "onsite-b";

type SubsectionRow = {
  id: string;
  name: string;
  start_ch: number | null;
  end_ch: number | null;
  direction: string | null;
  qr_token: string | null;
  app_config: Record<string, unknown>;
  location_id: string | null;
};

/** Service role client for sections / subsections (RLS). */
function sr() {
  return getSupabaseServer({ useServiceRole: true });
}

export async function GET(request: NextRequest) {
  void request;
  const supabase = sr();

  const { data: subLinks, error: subErr } = await supabase
    .from("subsections")
    .select("section_id")
    .eq("app_id", ONSITE_B);

  if (subErr) {
    return NextResponse.json({ error: subErr.message }, { status: 500 });
  }

  const idsFromSubs = [
    ...new Set(
      (subLinks ?? []).map((r: { section_id: string }) => r.section_id),
    ),
  ];

  const { data: sharedRows, error: sharedErr } = await supabase
    .from("sections")
    .select("*")
    .eq("scope", "shared");

  if (sharedErr) {
    return NextResponse.json({ error: sharedErr.message }, { status: 500 });
  }

  let fromSubs: Record<string, unknown>[] = [];
  if (idsFromSubs.length) {
    const { data: fs, error: fsErr } = await supabase
      .from("sections")
      .select("*")
      .in("id", idsFromSubs);
    if (fsErr) {
      return NextResponse.json({ error: fsErr.message }, { status: 500 });
    }
    fromSubs = fs ?? [];
  }

  const merged = new Map<string, Record<string, unknown>>();
  for (const r of [...(sharedRows ?? []), ...fromSubs]) {
    merged.set(r.id as string, r as Record<string, unknown>);
  }

  const sectionList = Array.from(merged.values()).sort((a, b) =>
    String(a.name ?? "").localeCompare(String(b.name ?? "")),
  );

  const sections = await Promise.all(
    sectionList.map(async (row) => {
      const sid = row.id as string;
      const { data: subs, error: subsErr } = await supabase
        .from("subsections")
        .select("id,name,start_ch,end_ch,direction,qr_token,app_config,location_id")
        .eq("section_id", sid)
        .eq("app_id", ONSITE_B)
        .order("name");

      if (subsErr) {
        throw new Error(subsErr.message);
      }

      const subsections: SubsectionRow[] = (subs ?? []).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        start_ch: s.start_ch as number | null,
        end_ch: s.end_ch as number | null,
        direction: s.direction as string | null,
        qr_token: (s.qr_token as string | null) ?? null,
        app_config: (s.app_config as Record<string, unknown>) ?? {},
        location_id: (s.location_id as string | null) ?? null,
      }));

      return {
        id: sid,
        name: row.name as string,
        start_ch: row.start_ch as number,
        end_ch: row.end_ch as number,
        direction: String(row.direction ?? ""),
        scope: String(row.scope ?? ""),
        app_config: (row.app_config as object) ?? {},
        qr_token: (row.qr_token as string | null) ?? null,
        location_id: (row.location_id as string | null) ?? null,
        subsections,
      };
    }),
  );

  return NextResponse.json({ sections });
}

export async function POST(request: NextRequest) {
  const auth = await requireOnSiteBAdmin(request);
  if (!auth.ok) return auth.response;

  return NextResponse.json(
    { error: "Creating unified sections via API is not supported." },
    { status: 400 },
  );
}
