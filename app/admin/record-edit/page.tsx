"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserAccessToken } from "@/lib/supabase/browser";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X } from "lucide-react";

type ReadingMap = Record<string, string>;

type AuditRow = {
  id: string;
  changed_by: string;
  changed_at: string;
  reason: string | null;
  action: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

type PspRecord = {
  id: string;
  chainage: number;
  layers_required: number | null;
  updated_at: string;
  sign_off_by: string | null;
  sign_off_at: string | null;
  site_inspector: string | null;
  unified_section_id: string | null;
  subsection_id: string | null;
} & Record<string, unknown>;

const suffixes = ["150", "450", "750"] as const;

function key(layer: number, suffix: string) {
  return `l${layer}_${suffix}`;
}

function liftMmLabel(layerIndex0: number, liftIndex0: number): string {
  const start = 150 + layerIndex0 * 900 + liftIndex0 * 300;
  const end = start + 300;
  return `${start}-${end}mm`;
}

function outOfRange(value: string) {
  if (value === "") return false;
  const num = Number(value);
  return Number.isNaN(num) || num < 0 || num > 35;
}

function formatSignedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function layerComplete(readings: ReadingMap, layer: number) {
  return suffixes.every((suffix) => readings[key(layer, suffix)] !== "");
}

function RecordEditContent() {
  const router = useRouter();
  const { pushToast } = useToast();
  const searchParams = useSearchParams();
  const recordId = searchParams.get("recordId") ?? "";
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<PspRecord | null>(null);
  const [layersRequired, setLayersRequired] = useState(3);
  const [savedLayers, setSavedLayers] = useState(3);
  const [readings, setReadings] = useState<ReadingMap>({});
  const [reason, setReason] = useState("");
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{
    layer: number;
    lost: string[];
  } | null>(null);

  const load = async (id: string) => {
    setLoading(true);
    const token = await getBrowserAccessToken();
    const response = await fetch(`/api/psp/records/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      pushToast({ type: "error", title: "Record load failed", message: payload.error ?? "Unable to load record." });
      return;
    }
    const next = payload.record as PspRecord;
    const required = Number(next.layers_required ?? 3);
    const nextReadings: ReadingMap = {};
    for (let layer = 1; layer <= 5; layer += 1) {
      for (const suffix of suffixes) {
        const value = next[key(layer, suffix)];
        nextReadings[key(layer, suffix)] = value == null ? "" : String(value);
      }
    }
    setRecord(next);
    setLayersRequired(required);
    setSavedLayers(required);
    setReadings(nextReadings);
    setAudit(payload.audit ?? []);
    setReason("");
  };

  useEffect(() => {
    if (recordId) void load(recordId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId]);

  const signed = Boolean(record?.sign_off_at);
  const layersDirty = layersRequired !== savedLayers;

  const applyRemoveLayer = (layerNum: number) => {
    if (layerNum < 1 || layerNum > layersRequired || layersRequired <= 1) return;
    const next: ReadingMap = { ...readings };
    for (let layer = layerNum; layer < layersRequired; layer += 1) {
      for (const suffix of suffixes) {
        next[key(layer, suffix)] = readings[key(layer + 1, suffix)] ?? "";
      }
    }
    for (const suffix of suffixes) {
      next[key(layersRequired, suffix)] = "";
    }
    for (let layer = layersRequired + 1; layer <= 5; layer += 1) {
      for (const suffix of suffixes) next[key(layer, suffix)] = "";
    }
    setReadings(next);
    setLayersRequired(layersRequired - 1);
    setPendingDrop(null);
  };

  const requestRemoveLayer = (layerNum: number) => {
    if (layerNum < 1 || layerNum > layersRequired || layersRequired <= 1) return;
    const lost: string[] = [];
    for (const suffix of suffixes) {
      const value = readings[key(layerNum, suffix)];
      if (value !== "") lost.push(`Layer ${layerNum} · ${suffix}: ${value}`);
    }
    setPendingDrop({ layer: layerNum, lost });
  };

  const confirmDrop = () => {
    if (!pendingDrop) return;
    applyRemoveLayer(pendingDrop.layer);
  };

  const save = async () => {
    if (!record) return;
    if (signed && !reason.trim()) {
      pushToast({ type: "error", title: "Reason required", message: "Signed records need a short reason." });
      return;
    }
    const payloadReadings: Record<string, number | null> = {};
    for (let layer = 1; layer <= 5; layer += 1) {
      for (const suffix of suffixes) {
        const raw = readings[key(layer, suffix)].trim();
        if (layer > layersRequired || raw === "") {
          payloadReadings[key(layer, suffix)] = null;
          continue;
        }
        if (!/^\d+$/.test(raw) || Number(raw) > 35) {
          pushToast({ type: "error", title: "Invalid reading", message: `${key(layer, suffix)} must be an integer from 0 to 35.` });
          return;
        }
        payloadReadings[key(layer, suffix)] = Number(raw);
      }
    }
    setLoading(true);
    const token = await getBrowserAccessToken();
    const response = await fetch(`/api/psp/records/${record.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        layersRequired,
        readings: payloadReadings,
        reason,
        expectedUpdatedAt: record.updated_at,
      }),
    });
    const payload = await response.json();
    setLoading(false);
    if (response.status === 409) {
      pushToast({ type: "error", title: "Record changed", message: payload.error ?? "Reload and try again." });
      return;
    }
    if (!response.ok) {
      pushToast({ type: "error", title: "Save failed", message: payload.error ?? "Unable to update record." });
      return;
    }
    setSyncError(payload.syncError ?? null);
    if (payload.syncError) {
      pushToast({ type: "error", title: "Report sync failed", message: "The record was saved. Retry the report sync." });
    } else {
      pushToast({ type: "success", title: "Record updated" });
    }
    await load(record.id);
  };

  const retrySync = async () => {
    if (!record?.unified_section_id) return;
    setLoading(true);
    const token = await getBrowserAccessToken();
    const response = await fetch("/api/psp/compaction-reports/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        sectionId: record.unified_section_id,
        subsectionId: record.subsection_id,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setSyncError(payload.error ?? "Compaction report sync failed.");
      return;
    }
    setSyncError(null);
    pushToast({ type: "success", title: "Reports synced" });
  };

  const remove = async () => {
    if (!record) return;
    setLoading(true);
    const token = await getBrowserAccessToken();
    const response = await fetch(`/api/psp/records/${record.id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Delete failed",
        message: payload.error ?? "Unable to delete record.",
      });
      return;
    }
    if (payload.syncError) {
      pushToast({
        type: "error",
        title: "Record deleted",
        message: "Report sync failed. Retry sync from the section.",
      });
    }
    const sectionId = record.unified_section_id;
    const query = record.subsection_id ? `?subsection=${record.subsection_id}` : "";
    router.push(sectionId ? `/admin/records/${sectionId}${query}` : "/admin");
  };

  return (
    <div className="psp-page">
      <div className="psp-shell">
        <header className="psp-header space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h1 className="psp-title text-xl text-[var(--ink)]">Edit record</h1>
            <Button asChild variant="outline" size="sm" className="min-h-[44px] px-3">
              <Link href="/admin">Back</Link>
            </Button>
          </div>
        </header>

        {!record ? (
          <p className="text-sm text-[var(--muted-foreground)]">{loading ? "Loading…" : "Record not found."}</p>
        ) : (
          <div className="space-y-3">
            <div className="psp-outer">
              <div className="psp-section-label">Current chainage (m)</div>
              <Input
                readOnly
                value={Number(record.chainage).toFixed(2)}
                className="psp-mono psp-hero mt-[14px] h-9 min-h-9 w-full rounded-[12px] border border-[var(--input-border)] bg-[var(--inner-bg)] px-3 py-2 text-center text-[var(--ink)]"
              />
            </div>

            <Card className="psp-card">
              <CardHeader className="gap-y-[14px] pb-2">
                <CardTitle className="psp-section-label">Layers</CardTitle>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {layersRequired} layer block(s)
                </p>
                {layersDirty ? (
                  <p className="rounded-[12px] border border-[#F3E3B0] bg-[#FFF6DB] px-3 py-2 text-xs text-[#9A6B00]">
                    Layer count is {layersRequired} (was {savedLayers}). Tap Save to apply this
                    chainage config.
                  </p>
                ) : null}
                <div className="grid gap-3">
                  {Array.from({ length: layersRequired }, (_, index) => index).map((layerIndex) => {
                    const layer = layerIndex + 1;
                    const canDelete = layersRequired > 1;
                    return (
                      <div
                        key={layer}
                        className="rounded-[20px] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                          <span>
                            Layer {layer} - Number of blows
                            {" · "}
                            {layerComplete(readings, layer) ? "Complete" : "Pending"}
                          </span>
                          {canDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-[var(--muted-foreground)]"
                              title={`Remove layer ${layer}`}
                              onClick={() => requestRemoveLayer(layer)}
                              aria-label={`Remove layer ${layer}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {suffixes.map((suffix, liftIdx) => {
                            const field = key(layer, suffix);
                            const value = readings[field] ?? "";
                            const warning = outOfRange(value);
                            return (
                              <div key={field} className="grid min-w-0 content-start gap-1">
                                <label className="psp-label truncate">{liftMmLabel(layerIndex, liftIdx)}</label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={35}
                                  value={value}
                                  onChange={(event) =>
                                    setReadings((prev) => ({ ...prev, [field]: event.target.value }))
                                  }
                                  className={`psp-layer-input ${warning ? "border border-[var(--danger)] bg-[color:var(--danger)/0.08]" : ""}`}
                                />
                                {warning ? <p className="text-xs text-[var(--danger)]">Out of Tolerance</p> : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed"
                      disabled={layersRequired >= 5 || layersDirty}
                      title={
                        layersRequired >= 5
                          ? "Maximum 5 layers"
                          : layersDirty
                            ? "Save the current layer change first"
                            : "Add a layer"
                      }
                      onClick={() => setLayersRequired((value) => Math.min(5, value + 1))}
                    >
                      + Add Layer
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="psp-outer">
              <div className="psp-section-label">Supervisor</div>
              <Input
                readOnly
                value={record.site_inspector ?? ""}
                className="psp-input mt-[14px] w-full bg-[var(--inner-bg)]"
              />
              <div className="psp-section-label mt-[14px]">Signature</div>
              <div className="mt-[14px] min-h-[120px] rounded-[12px] bg-[var(--inner-bg)] p-3 text-xs text-[var(--muted-foreground)]">
                {signed
                  ? `Signed by ${record.sign_off_by ?? "Unknown"} on ${formatSignedDate(String(record.sign_off_at))}. The signature is kept.`
                  : "Not signed"}
              </div>
              {syncError ? (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-[var(--danger)]">{syncError}</p>
                  <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => void retrySync()}>
                    Retry report sync
                  </Button>
                </div>
              ) : null}
              {signed ? (
                <label className="mt-[14px] block space-y-1">
                  <span className="psp-label">Reason</span>
                  <Input className="psp-input min-h-[44px]" value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
              ) : null}
            </div>

            <ConfirmButton
              variant="ghost"
              label={layersDirty ? `Save (${layersRequired} layers)` : "Save"}
              confirmLabel="CONFIRM?"
              onConfirm={() => void save()}
              disabled={loading || (signed && !reason.trim())}
              className="psp-button psp-button-lodge w-full shrink-0 min-h-11 text-white"
              style={{ backgroundColor: "var(--psp-lodge-bg)", color: "#fff" }}
              confirmClassName="psp-button-warning"
            />
            <ConfirmButton
              variant="outline"
              label="Delete record"
              confirmLabel="DELETE?"
              onConfirm={() => void remove()}
              disabled={loading}
              className="w-full min-h-11 border-[var(--danger)] text-[var(--danger)]"
              confirmClassName="psp-button-warning"
            />

            <Dialog
              open={pendingDrop != null}
              onOpenChange={(open) => {
                if (!open) setPendingDrop(null);
              }}
            >
              <DialogContent className="max-w-[420px]">
                <DialogHeader>
                  <DialogTitle>Remove layer?</DialogTitle>
                </DialogHeader>
                {pendingDrop ? (
                  <div className="space-y-2 text-sm">
                    <p>
                      Remove layer {pendingDrop.layer}. Higher layers move down.
                      Count goes from {layersRequired} to {layersRequired - 1}.
                      Save afterwards to keep this config for the chainage.
                    </p>
                    {pendingDrop.lost.length ? (
                      <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-alt)] p-3 text-xs">
                        <p className="mb-1 font-semibold">Readings to clear:</p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {pendingDrop.lost.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        This layer is empty.
                      </p>
                    )}
                  </div>
                ) : null}
                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-[44px]"
                    onClick={() => setPendingDrop(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    className="min-h-[44px] bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90"
                    onClick={confirmDrop}
                  >
                    Remove
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Card className="psp-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {audit.length === 0 ? <p>No edits yet.</p> : null}
                {audit.map((row) => (
                  <div key={row.id} className="rounded-[12px] border border-[var(--border)] p-2">
                    <p>{row.changed_by} · {formatSignedDate(row.changed_at)} · {row.action}</p>
                    <p>{row.reason ?? "—"}</p>
                    <p>
                      Layers {String(row.before?.layers_required ?? "—")} → {String(row.after?.layers_required ?? "—")}
                    </p>
                  </div>
                ))}
                <p className="text-[var(--muted-foreground)]">Saved layers: {savedLayers}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecordEditPage() {
  return (
    <Suspense fallback={<div className="psp-page p-4 text-sm">Loading…</div>}>
      <RecordEditContent />
    </Suspense>
  );
}
