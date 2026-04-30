"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type RecordRow = {
  id: string;
  chainage: number;
  recorded_at: string | null;
  unified_section_id: string | null;
  subsection_id: string | null;
  location_id: string | null;
  site_inspector: string | null;
  sign_off_by: string | null;
  sign_off_at: string | null;
  l1_150: number | null;
  l1_450: number | null;
  l1_750: number | null;
  l2_150: number | null;
  l2_450: number | null;
  l2_750: number | null;
  l3_150: number | null;
  l3_450: number | null;
  l3_750: number | null;
  compactor_sn: string | null;
};

export default function RecordsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sectionId = params.sectionId as string;
  const subsectionId = searchParams.get("subsection");
  const supabase = getSupabaseBrowser();

  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<RecordRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [editInspector, setEditInspector] = useState("");
  const [editLayers, setEditLayers] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthEmail(data.session?.user.email ?? null);
    });
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      if (!sectionId) return;
      console.log("[view-records] sectionId:", sectionId);
      console.log("[view-records] subsectionId:", subsectionId);
      setLoading(true);
      const baseSelect =
        "id, chainage, recorded_at, unified_section_id, subsection_id, location_id, site_inspector, sign_off_by, sign_off_at, l1_150, l1_450, l1_750, l2_150, l2_450, l2_750, l3_150, l3_450, l3_750, compactor_sn";

      let loadedRows: RecordRow[] = [];
      if (subsectionId) {
        // Support both true subsection rows and "promoted section-as-subsection" rows.
        const subQuery = supabase
          .from("psp_records")
          .select(baseSelect)
          .eq("unified_section_id", sectionId)
          .eq("subsection_id", subsectionId)
          .order("chainage", { ascending: false });
        const promotedQuery = supabase
          .from("psp_records")
          .select(baseSelect)
          .eq("unified_section_id", subsectionId)
          .is("subsection_id", null)
          .order("chainage", { ascending: false });
        const [subRows, promotedRows] = await Promise.all([
          subQuery,
          promotedQuery,
        ]);
        console.log("[view-records] result count:", (subRows.data?.length ?? 0) + (promotedRows.data?.length ?? 0));
        console.log("[view-records] error:", subRows.error ?? promotedRows.error ?? null);
        console.log("[view-records] sample row:", subRows.data?.[0] ?? promotedRows.data?.[0] ?? null);
        const merged = [...(subRows.data ?? []), ...(promotedRows.data ?? [])];
        const deduped = merged.filter(
          (row, idx, arr) => idx === arr.findIndex((candidate) => candidate.id === row.id),
        );
        loadedRows = deduped as RecordRow[];
      } else {
        const query = supabase
          .from("psp_records")
          .select(baseSelect)
          .eq("unified_section_id", sectionId)
          .order("chainage", { ascending: false });
        const { data, error } = await query;
        console.log("[view-records] result count:", data?.length);
        console.log("[view-records] error:", error);
        console.log("[view-records] sample row:", data?.[0]);
        loadedRows = (data ?? []) as RecordRow[];
      }

      // Fallback: if scope returns empty, try records by resolved location_id.
      if (loadedRows.length === 0) {
        if (subsectionId) {
          const { data: subRow } = await supabase
            .from("subsections")
            .select("location_id, app_config")
            .eq("id", subsectionId)
            .maybeSingle();
          const fromConfig =
            subRow?.app_config &&
            typeof subRow.app_config === "object" &&
            !Array.isArray(subRow.app_config) &&
            typeof (subRow.app_config as Record<string, unknown>).location_id === "string"
              ? String((subRow.app_config as Record<string, unknown>).location_id)
              : null;
          const fallbackLocationId = subRow?.location_id ?? fromConfig;
          if (fallbackLocationId) {
            const { data } = await supabase
              .from("psp_records")
              .select(baseSelect)
              .eq("location_id", fallbackLocationId)
              .order("chainage", { ascending: false });
            loadedRows = (data ?? []) as RecordRow[];
          }
        } else {
          const { data: secRow } = await supabase
            .from("sections")
            .select("location_id, app_config")
            .eq("id", sectionId)
            .maybeSingle();
          const fromConfig =
            secRow?.app_config &&
            typeof secRow.app_config === "object" &&
            !Array.isArray(secRow.app_config) &&
            typeof (secRow.app_config as Record<string, unknown>).location_id === "string"
              ? String((secRow.app_config as Record<string, unknown>).location_id)
              : null;
          const fallbackLocationId = secRow?.location_id ?? fromConfig;
          if (fallbackLocationId) {
            const { data } = await supabase
              .from("psp_records")
              .select(baseSelect)
              .eq("location_id", fallbackLocationId)
              .order("chainage", { ascending: false });
            loadedRows = (data ?? []) as RecordRow[];
          }
        }
      }
      setRecords(loadedRows);
      setLoading(false);
    };
    void load();
  }, [sectionId, subsectionId, supabase]);

  const rows = useMemo(() => records, [records]);

  const openEditor = (row: RecordRow) => {
    setSelectedRecord(row);
    setEditInspector(row.site_inspector ?? "");
    setEditLayers({
      l1_150: String(row.l1_150 ?? ""),
      l1_450: String(row.l1_450 ?? ""),
      l1_750: String(row.l1_750 ?? ""),
      l2_150: String(row.l2_150 ?? ""),
      l2_450: String(row.l2_450 ?? ""),
      l2_750: String(row.l2_750 ?? ""),
      l3_150: String(row.l3_150 ?? ""),
      l3_450: String(row.l3_450 ?? ""),
      l3_750: String(row.l3_750 ?? ""),
    });
  };

  const handleConfirm = async () => {
    if (!selectedRecord) return;
    setSaving(true);
    const payload = {
      unifiedSectionId: sectionId,
      subsectionId: subsectionId ?? selectedRecord.subsection_id ?? null,
      chainage: selectedRecord.chainage,
      siteInspector: editInspector.trim(),
      layers: {
        l1_150: Number(editLayers.l1_150),
        l1_450: Number(editLayers.l1_450),
        l1_750: Number(editLayers.l1_750),
        l2_150: Number(editLayers.l2_150),
        l2_450: Number(editLayers.l2_450),
        l2_750: Number(editLayers.l2_750),
        l3_150: Number(editLayers.l3_150),
        l3_450: Number(editLayers.l3_450),
        l3_750: Number(editLayers.l3_750),
      },
    };
    const response = await fetch("/api/psp/records/overwrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!response.ok) return;
    setSelectedRecord(null);
    setLoading(true);
    let query = supabase
      .from("psp_records")
      .select(
        "id, chainage, recorded_at, unified_section_id, subsection_id, location_id, site_inspector, sign_off_by, sign_off_at, l1_150, l1_450, l1_750, l2_150, l2_450, l2_750, l3_150, l3_450, l3_750, compactor_sn",
      )
      .eq("unified_section_id", sectionId)
      .order("chainage", { ascending: false });
    query = subsectionId ? query.eq("subsection_id", subsectionId) : query.is("subsection_id", null);
    if (!subsectionId) {
      query = supabase
        .from("psp_records")
        .select(
          "id, chainage, recorded_at, unified_section_id, subsection_id, location_id, site_inspector, sign_off_by, sign_off_at, l1_150, l1_450, l1_750, l2_150, l2_450, l2_750, l3_150, l3_450, l3_750, compactor_sn",
        )
        .eq("unified_section_id", sectionId)
        .order("chainage", { ascending: false });
    }
    const { data } = await query;
    setRecords((data ?? []) as RecordRow[]);
    setLoading(false);
  };

  if (!authEmail) {
    return (
      <div className="psp-page">
        <div className="psp-shell">
          <h1 className="psp-page-title">Records</h1>
          <AuthPanel onAuthChange={setAuthEmail} />
        </div>
      </div>
    );
  }

  return (
    <div className="psp-page">
      <div className="psp-shell">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="psp-page-title">Section Records</h1>
          <Link href="/admin">
            <Button variant="outline" size="sm">
              Back to Admin
            </Button>
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No records found.</p>
        ) : (
          <div className="overflow-x-auto rounded-[12px] border border-[var(--border)] bg-[var(--surface)]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--surface-alt)]">
                <tr>
                  <th className="px-3 py-2 text-left">Chainage</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Inspector</th>
                  <th className="px-3 py-2 text-left">Sign-off</th>
                  <th className="px-3 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2">{row.chainage}</td>
                    <td className="px-3 py-2">
                      {row.recorded_at ? new Date(row.recorded_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2">{row.site_inspector ?? "—"}</td>
                    <td className="px-3 py-2">{row.sign_off_by ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditor(row)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={selectedRecord != null}
        onOpenChange={(open) => {
          if (!open) setSelectedRecord(null);
        }}
      >
        <DialogContent className="psp-outer max-w-[520px] p-0">
          <DialogHeader>
            <DialogTitle className="px-5 pt-5 text-base font-semibold text-[var(--ink)]">
              Record detail
            </DialogTitle>
          </DialogHeader>
          {selectedRecord ? (
            <div className="space-y-3 px-5 pb-4 text-sm">
              <div className="psp-outer">
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--muted-foreground)]">
                  <p>Chainage: <span className="font-medium text-[var(--ink)]">{selectedRecord.chainage}</span></p>
                  <p>Date: <span className="font-medium text-[var(--ink)]">{selectedRecord.recorded_at ? new Date(selectedRecord.recorded_at).toLocaleString() : "—"}</span></p>
                  <p>Inspector: <span className="font-medium text-[var(--ink)]">{selectedRecord.site_inspector ?? "—"}</span></p>
                  <p>Sign-off: <span className="font-medium text-[var(--ink)]">{selectedRecord.sign_off_by ?? "—"}</span></p>
                </div>
              </div>
              <div className="psp-outer">
                <div className="psp-section-label mb-2">Edit values</div>
                <Input
                  value={editInspector}
                  onChange={(e) => setEditInspector(e.target.value)}
                  placeholder="Inspector"
                  className="psp-input mb-2 bg-[var(--inner-bg)]"
                />
                <div className="grid grid-cols-2 gap-2">
                {Object.keys(editLayers).map((key) => (
                  <Input
                    key={key}
                    type="number"
                    min={0}
                    max={35}
                    value={editLayers[key]}
                    onChange={(e) => setEditLayers((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={key}
                    className="psp-input bg-[var(--inner-bg)]"
                  />
                ))}
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-t border-[var(--border)] px-5 py-3">
            <Button
              variant="outline"
              className="psp-button psp-button-ghost h-9"
              onClick={() => setSelectedRecord(null)}
            >
              Close
            </Button>
            <Button
              className="psp-button psp-button-primary h-9 px-4"
              onClick={handleConfirm}
              disabled={saving}
            >
              {saving ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
