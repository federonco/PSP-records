import { NextRequest, NextResponse } from "next/server";
import { POST as syncCompactionReports } from "@/app/api/psp/compaction-reports/sync/route";
import { requireOnSiteBAdmin } from "@/lib/admin";
import { validatePspRecordEdit, timestampsConflict } from "@/lib/psp-record-edit";
import { getSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

const RECORD_COLUMNS =
  "id,location_id,unified_section_id,subsection_id,chainage,layers_required,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,l4_150,l4_450,l4_750,l5_150,l5_450,l5_750,completed_at,updated_at,sign_off_by,sign_off_at,site_inspector,compactor_sn";

type RecordRow = Record<string, unknown> & {
  id: string;
  layers_required: number | null;
  updated_at: string;
  sign_off_at: string | null;
  unified_section_id: string | null;
  subsection_id: string | null;
};

function readingsFromRow(row: RecordRow) {
  const readings: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!/^l[1-5]_(150|450|750)$/.test(key)) continue;
    readings[key] = value == null ? null : Number(value);
  }
  return readings;
}

async function loadRecord(id: string) {
  const supabase = getSupabaseServer({ useServiceRole: true });
  return supabase.from("psp_records").select(RECORD_COLUMNS).eq("id", id).maybeSingle();
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireOnSiteBAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const { data, error } = await loadRecord(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Record not found" }, { status: 404 });

  const supabase = getSupabaseServer({ useServiceRole: true });
  const audit = await supabase
    .from("psp_record_audit")
    .select("id,changed_by,changed_at,reason,action,before,after")
    .eq("record_id", id)
    .order("changed_at", { ascending: false });

  return NextResponse.json({
    record: data,
    audit: audit.error ? [] : audit.data ?? [],
    auditError: audit.error ? audit.error.message : null,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireOnSiteBAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const body = await request.json();
  const { data: existing, error: loadError } = await loadRecord(id);
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  const row = existing as RecordRow;
  const expectedUpdatedAt = String(body?.expectedUpdatedAt ?? "");
  if (timestampsConflict(String(row.updated_at), expectedUpdatedAt)) {
    return NextResponse.json(
      { error: "Record changed. Reload and try again." },
      { status: 409 },
    );
  }

  const checked = validatePspRecordEdit(
    {
      layers_required: Number(row.layers_required ?? 3),
      sign_off_at: row.sign_off_at,
      updated_at: String(row.updated_at),
      readings: readingsFromRow(row),
    },
    {
      layersRequired: body?.layersRequired,
      readings: body?.readings ?? {},
      reason: typeof body?.reason === "string" ? body.reason : null,
      expectedUpdatedAt,
    },
  );
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: checked.status });
  }

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { error: rpcError } = await supabase.rpc("psp_record_admin_edit", {
    p_record_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_layers_required: body.layersRequired,
    p_readings: checked.readings,
    p_changed_by: gate.user.email ?? gate.user.id,
    p_reason: checked.reason,
    p_action: checked.action,
  });
  if (rpcError) {
    const message = rpcError.message ?? "Update failed";
    if (message.includes("psp_record_conflict")) {
      return NextResponse.json(
        { error: "Record changed. Reload and try again." },
        { status: 409 },
      );
    }
    if (message.includes("psp_record_reason_required")) {
      return NextResponse.json(
        { error: "A reason is required for a signed record." },
        { status: 400 },
      );
    }
    if (message.includes("psp_record_layer_gap")) {
      return NextResponse.json(
        { error: "Remove the highest layer first." },
        { status: 400 },
      );
    }
    if (message.includes("psp_record_not_found")) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const reloaded = await loadRecord(id);
  let syncError: string | null = null;
  if (row.unified_section_id) {
    try {
      const syncResponse = await syncCompactionReports(
        new NextRequest(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({
            sectionId: row.unified_section_id,
            subsectionId: row.subsection_id,
          }),
        }),
      );
      if (!syncResponse.ok) {
        const payload = await syncResponse.json().catch(() => ({}));
        syncError = payload.error ?? "Compaction report sync failed.";
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Compaction report sync failed.";
    }
  }

  return NextResponse.json({
    record: reloaded.data ?? null,
    syncError,
  });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireOnSiteBAdmin(request);
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const { data: existing, error: loadError } = await loadRecord(id);
  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  const row = existing as RecordRow;

  const supabase = getSupabaseServer({ useServiceRole: true });
  const { error } = await supabase.from("psp_records").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let syncError: string | null = null;
  if (row.unified_section_id) {
    try {
      const syncResponse = await syncCompactionReports(
        new NextRequest(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({
            sectionId: row.unified_section_id,
            subsectionId: row.subsection_id,
          }),
        }),
      );
      if (!syncResponse.ok) {
        const payload = await syncResponse.json().catch(() => ({}));
        syncError = payload.error ?? "Compaction report sync failed.";
      }
    } catch (err) {
      syncError = err instanceof Error ? err.message : "Compaction report sync failed.";
    }
  }

  return NextResponse.json({ ok: true, syncError });
}
