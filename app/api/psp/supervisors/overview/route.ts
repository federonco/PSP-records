import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabase } from "@/lib/supabase/route-handler";
import { getSupabaseServer } from "@/lib/supabase/server";

export type SupervisorOverviewSection = {
  id: string;
  name: string;
  chainage_start?: number;
  chainage_end?: number;
};

export type SupervisorOverviewSubsection = {
  id: string;
  name: string;
  parent_section_name: string;
};

export type SupervisorOverviewRow = {
  id: string;
  name: string;
  company: string | null;
  sections: SupervisorOverviewSection[];
  subsections: SupervisorOverviewSubsection[];
};

type AssignmentJoinRow = {
  supervisor_id: string;
  section_id: string | null;
  subsection_id: string | null;
  sections:
    | {
        id: string;
        name: string;
        start_ch: number | null;
        end_ch: number | null;
      }
    | null
    | Array<{
        id: string;
        name: string;
        start_ch: number | null;
        end_ch: number | null;
      }>;
  subsections:
    | {
        id: string;
        name: string;
        sections: { name: string } | null | Array<{ name: string }>;
      }
    | null
    | Array<{
        id: string;
        name: string;
        sections: { name: string } | null | Array<{ name: string }>;
      }>;
};

function firstOrSelf<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export async function GET(request: NextRequest) {
  void request;
  const supabase = await createRouteHandlerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sr = getSupabaseServer({ useServiceRole: true });

  const { data: supervisorRows, error: supErr } = await sr
    .from("psp_supervisors")
    .select("id,name,company")
    .order("name", { ascending: true });

  if (supErr) {
    return NextResponse.json({ error: supErr.message }, { status: 500 });
  }

  const { data: assignmentRows, error: asnErr } = await sr
    .from("psp_supervisor_assignments")
    .select(
      `
      supervisor_id,
      section_id,
      subsection_id,
      sections ( id, name, start_ch, end_ch ),
      subsections ( id, name, sections ( name ) )
    `,
    );

  if (asnErr) {
    return NextResponse.json({ error: asnErr.message }, { status: 500 });
  }

  const bySupervisor = new Map<
    string,
    {
      sections: Map<string, SupervisorOverviewSection>;
      subsections: Map<string, SupervisorOverviewSubsection>;
    }
  >();

  for (const s of supervisorRows ?? []) {
    bySupervisor.set(s.id as string, {
      sections: new Map(),
      subsections: new Map(),
    });
  }

  for (const row of assignmentRows ?? []) {
    const r = row as AssignmentJoinRow;
    const bucket = bySupervisor.get(r.supervisor_id);
    if (!bucket) continue;

    const secEmbed = firstOrSelf(r.sections);
    if (r.section_id && secEmbed) {
      const sec = secEmbed;
      const start = sec.start_ch;
      const end = sec.end_ch;
      bucket.sections.set(sec.id, {
        id: sec.id,
        name: sec.name,
        ...(typeof start === "number" && Number.isFinite(start)
          ? { chainage_start: start }
          : {}),
        ...(typeof end === "number" && Number.isFinite(end)
          ? { chainage_end: end }
          : {}),
      });
    }

    const subEmbed = firstOrSelf(r.subsections);
    if (r.subsection_id && subEmbed) {
      const sub = subEmbed;
      const parentEmbed = firstOrSelf(sub.sections);
      const parentName =
        parentEmbed?.name?.trim() || "—";
      bucket.subsections.set(sub.id, {
        id: sub.id,
        name: sub.name,
        parent_section_name: parentName,
      });
    }
  }

  const result: SupervisorOverviewRow[] = (supervisorRows ?? []).map((s) => {
    const bucket = bySupervisor.get(s.id as string)!;
    return {
      id: s.id as string,
      name: s.name as string,
      company: (s.company as string | null) ?? null,
      sections: [...bucket.sections.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      subsections: [...bucket.subsections.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  });

  return NextResponse.json(result satisfies SupervisorOverviewRow[]);
}
