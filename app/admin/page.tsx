 "use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
 import { AuthPanel } from "@/components/auth-panel";
 import { ConfirmButton } from "@/components/confirm-button";
 import { useToast } from "@/components/toast";
import { BLOCK_SIZE, CHAINAGE_STEP, getBlockChainages } from "@/lib/psp";
 import { getSupabaseBrowser } from "@/lib/supabase/browser";
 import { Badge } from "@/components/ui/badge";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Input } from "@/components/ui/input";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";

type Location = {
  id: string;
  name: string;
  start_chainage?: number | null;
  end_chainage?: number | null;
  direction?: "backwards" | "onwards" | null;
  chainage_increment?: number | null;
  data_source?: string | null;
  length_m?: number | null;
  quality_reports_required?: number | null;
};
 type RecordRow = {
  location_id: string;
   chainage: number;
  sign_off_at?: string | null;
  section_id?: string | null;
 };

type CompactionReportRow = {
  id: string;
  status: "READY" | "OPEN" | string;
  block_key: string;
  block_index?: number | null;
  pending_chainages?: number[] | null;
  pdf_path?: string | null;
};

 type BlockInfo = {
   key: string;
   index: number;
   start: number;
   end: number;
   expected: number[];
   recordCount: number;
   status: "READY" | "OPEN";
   pending: number[];
 };

 export default function AdminPage() {
   const supabase = getSupabaseBrowser();
   const { pushToast } = useToast();
   const [locations, setLocations] = useState<Location[]>([]);
   const [locationId, setLocationId] = useState("");
   const [locationName, setLocationName] = useState("");
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [allRecords, setAllRecords] = useState<RecordRow[]>([]);
  const [compactionReports, setCompactionReports] = useState<
    CompactionReportRow[]
  >([]);
  const [syncingReports, setSyncingReports] = useState(false);
   const [authEmail, setAuthEmail] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationModalMode, setLocationModalMode] = useState<"create" | "edit">(
    "create",
  );
  const [locationNameInput, setLocationNameInput] = useState("");
  const [locationStartInput, setLocationStartInput] = useState("");
  const [locationEndInput, setLocationEndInput] = useState("");
  const [locationDirectionInput, setLocationDirectionInput] = useState<
    "backwards" | "onwards"
  >("backwards");
  const [selectedLocationEditId, setSelectedLocationEditId] = useState<
    string | null
  >(null);
  const selectedLocation = useMemo(
    () => locations.find((loc) => loc.id === locationId),
    [locationId, locations],
  );
  const locationSelectValue = locationId || undefined;

  useEffect(() => {
    if (!authEmail) return;
    const loadLocations = async () => {
      const { data, error } = await supabase
        .from("psp_locations")
        .select(
          "id,name,start_chainage,end_chainage,direction,chainage_increment,data_source,length_m,quality_reports_required",
        )
        .order("name");
      if (error) {
        pushToast({
          type: "error",
          title: "Failed to load locations",
          message: error.message,
        });
        return;
      }
      setLocations(data ?? []);
      if (data?.length) {
        setLocationId(data[0].id);
        setLocationName(data[0].name);
      }
    };
    loadLocations();
  }, [authEmail, pushToast, supabase]);


  useEffect(() => {
    if (authEmail) return;
    setLocations([]);
    setLocationId("");
    setLocationName("");
    setRecords([]);
    setAllRecords([]);
    setCompactionReports([]);
    setSelectedLocationEditId(null);
  }, [authEmail]);

  useEffect(() => {
    if (!locationId || !authEmail) return;
    const loadRecords = async () => {
      const { data, error } = await supabase
        .from("psp_records")
        .select("location_id,chainage,sign_off_at,section_id")
        .eq("location_id", locationId)
        .order("chainage", { ascending: false });
      if (error) {
        pushToast({
          type: "error",
          title: "Failed to load records",
          message: error.message,
        });
        return;
      }
      setRecords((data ?? []) as RecordRow[]);
    };
    loadRecords();
  }, [authEmail, locationId, pushToast, supabase]);

  const loadCompactionReports = async () => {
    if (!locationId || !authEmail) return;
    const { data, error } = await supabase
      .from("psp_reports")
      .select("id,status,block_key,block_index,pending_chainages,pdf_path")
      .eq("location_id", locationId)
      .eq("report_type", "compaction")
      .order("block_index", { ascending: true });
    if (error) {
      pushToast({
        type: "error",
        title: "Failed to load compaction reports",
        message: error.message,
      });
      return;
    }
    setCompactionReports((data ?? []) as CompactionReportRow[]);
  };

  useEffect(() => {
    if (!authEmail) return;
    const loadAllRecords = async () => {
      const { data, error } = await supabase
        .from("psp_records")
        .select("location_id,chainage");
      if (error) {
        pushToast({
          type: "error",
          title: "Failed to load records",
          message: error.message,
        });
        return;
      }
      setAllRecords((data ?? []) as RecordRow[]);
    };
    loadAllRecords();
  }, [authEmail, pushToast, supabase]);

  useEffect(() => {
    if (selectedLocation) {
      setLocationName(selectedLocation.name);
    }
  }, [selectedLocation]);

  const syncCompactionReports = async () => {
    if (!locationId || !authEmail) return;
    setSyncingReports(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const response = await fetch("/api/psp/compaction-reports/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locationId,
        locationName,
      }),
    });
    const payload = await response.json();
    setSyncingReports(false);
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Compaction sync failed",
        message: payload.error ?? "Unable to generate compaction reports",
      });
      return;
    }
    await loadCompactionReports();
  };

  useEffect(() => {
    if (!locationId || !authEmail) return;
    syncCompactionReports();
  }, [authEmail, locationId, locationName, pushToast, supabase]);

  const computeBlocks = (chainages: number[]) => {
    if (!chainages.length) return [];
    const sorted = [...chainages].sort((a, b) => b - a);
    if (!sorted.length) return [];
    const max = sorted[0];
    const totalBlocks = Math.ceil(sorted.length / 10);
    const set = new Set(sorted);
    const blocks: BlockInfo[] = [];

    for (let index = 0; index < totalBlocks; index += 1) {
      const blockMax = max - index * BLOCK_SIZE * CHAINAGE_STEP;
      const expected = getBlockChainages(blockMax);
      const start = expected[expected.length - 1];
      const end = expected[0];
      const recordCount = expected.filter((value) => set.has(value)).length;
      const pending = expected.filter((value) => !set.has(value));
      blocks.push({
        key: `${blockMax}-${start}`,
        index: index + 1,
        start,
        end,
        expected,
        recordCount,
        status: recordCount === expected.length ? "READY" : "OPEN",
        pending,
      });
    }
    return blocks;
  };

  const blocks = useMemo(
    () => computeBlocks(records.map((row) => row.chainage)),
    [records],
  );

  const compactionSummary = useMemo(() => {
    const ready = compactionReports.filter((row) => row.status === "READY").length;
    const open = compactionReports.filter((row) => row.status === "OPEN").length;
    const nextOpen = compactionReports
      .filter((row) => row.status === "OPEN")
      .sort((a, b) => (a.block_index ?? 999) - (b.block_index ?? 999))[0];
    const pending = Array.isArray(nextOpen?.pending_chainages)
      ? nextOpen?.pending_chainages ?? []
      : [];
    return { ready, open, pending };
  }, [compactionReports]);

  const buildChainagesFromBlock = (blockKey: string) => {
    const parts = blockKey.split("-");
    if (parts.length < 2) return [];
    const max = Number(parts[0]);
    const start = Number(parts[1]);
    if (!Number.isFinite(max) || !Number.isFinite(start)) return [];
    const chainages: number[] = [];
    for (let value = max; value >= start; value -= CHAINAGE_STEP) {
      chainages.push(value);
    }
    return chainages;
  };

  const locationRequirement = useMemo(() => {
    if (!selectedLocation) return null;
    if (selectedLocation.quality_reports_required !== null && selectedLocation.quality_reports_required !== undefined) {
      return selectedLocation.quality_reports_required;
    }
    const start = selectedLocation.start_chainage;
    const end = selectedLocation.end_chainage;
    if (typeof start === "number" && typeof end === "number") {
      const length = Math.abs(end - start);
      return Math.ceil(length / 200);
    }
    return null;
  }, [selectedLocation]);

  const progressSummary = useMemo(() => {
    const required = locationRequirement ?? 0;
    const ready = compactionSummary.ready;
    const pending = Math.max(required - ready, 0);
    const percent =
      required > 0 ? Math.min(100, Math.round((ready / required) * 100)) : 0;
    return { required, pending, percent };
  }, [compactionSummary.ready, locationRequirement]);

  const handleSendPdf = async (report: CompactionReportRow) => {
    if (!report.block_index) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: "Missing report number for this block.",
      });
      return;
    }
    if (!locationId && !locationName) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: "Select a location before sending.",
      });
      return;
    }
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const response = await fetch("/api/reports/itr-exb-003/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        location_id: locationId,
        location_name: locationName,
        reportNum: report.block_index,
        includeOpen: true,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: payload.error ?? "Unable to send report.",
      });
      return;
    }
    pushToast({
      type: "success",
      title: "Report sent",
      message: "The PDF was emailed to the admin account.",
    });
  };

  const handleAuditReportAll = async () => {
    if (!locationId || !authEmail) return;
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const response = await fetch("/api/psp/audit-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locationId,
        locationName,
      }),
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Audit report failed",
        message: payload.error ?? "Unable to generate audit report",
      });
      return;
    }
    pushToast({
      type: "success",
      title: "Audit report ready",
      message: "Download link generated.",
    });
    window.open(payload.url, "_blank");
  };

  const locationSummaries = useMemo(() => {
    const summaryMap = new Map<
      string,
      { location: Location; records: RecordRow[]; blocks: BlockInfo[] }
    >();

    locations.forEach((loc) =>
      summaryMap.set(loc.id, { location: loc, records: [], blocks: [] }),
    );

    allRecords.forEach((record) => {
      summaryMap.get(record.location_id)?.records.push(record);
    });

    summaryMap.forEach((entry) => {
      entry.blocks = computeBlocks(entry.records.map((row) => row.chainage));
    });

    return Array.from(summaryMap.values());
  }, [allRecords, locations]);

   const handleDispatchFormal = (block: BlockInfo) => {
     pushToast({
       type: "info",
       title: "Formal dispatch stubbed",
       message: `Block ${block.index} queued.`,
     });
   };

   const handleDispatchOpen = (block: BlockInfo) => {
     pushToast({
       type: "success",
       title: "Dispatch open",
       message: `Block ${block.index} dispatched.`,
     });
   };

   const handleSignOffBlock = async (block: BlockInfo) => {
     setLoading(true);
     const session = await supabase.auth.getSession();
     const token = session.data.session?.access_token;
     const response = await fetch("/api/psp/signoff-block", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
         chainages: block.expected,
       }),
     });
     const payload = await response.json();
     setLoading(false);
     if (!response.ok) {
       pushToast({
         type: "error",
         title: "Sign-off failed",
         message: payload.error ?? "Unable to sign off block",
       });
       return;
     }
     pushToast({
       type: "success",
       title: "Block signed off",
       message: `${payload.updated} records updated`,
     });
     setRecords((prev) =>
       prev.map((row) =>
         block.expected.includes(row.chainage)
           ? { ...row, sign_off_at: new Date().toISOString() }
           : row,
       ),
     );
   };

  const handleAuditReport = async (block: BlockInfo) => {
     setLoading(true);
     const session = await supabase.auth.getSession();
     const token = session.data.session?.access_token;
     const response = await fetch("/api/psp/audit-report", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
         locationName,
         blockKey: block.key,
        blockIndex: block.index,
        status: block.status,
        pending: block.pending,
         chainages: block.expected,
       }),
     });
     const payload = await response.json();
     setLoading(false);
     if (!response.ok) {
       pushToast({
         type: "error",
         title: "Audit report failed",
         message: payload.error ?? "Unable to generate audit report",
       });
       return;
     }
     pushToast({
       type: "success",
       title: "Audit report ready",
       message: "Download link generated.",
     });
     window.open(payload.url, "_blank");
   };

  const openLocationModal = (mode: "create" | "edit", targetId?: string) => {
    setLocationModalMode(mode);
    setSelectedLocationEditId(targetId ?? null);
    if (mode === "edit") {
      const loc = locations.find((item) => item.id === targetId);
      setLocationNameInput(loc?.name ?? "");
      setLocationStartInput(
        loc?.start_chainage !== null && loc?.start_chainage !== undefined
          ? String(loc.start_chainage)
          : "",
      );
      setLocationEndInput(
        loc?.end_chainage !== null && loc?.end_chainage !== undefined
          ? String(loc.end_chainage)
          : "",
      );
      setLocationDirectionInput(loc?.direction ?? "backwards");
    } else {
      setLocationNameInput("");
      setLocationStartInput("");
      setLocationEndInput("");
      setLocationDirectionInput("backwards");
    }
    setLocationModalOpen(true);
  };

  const handleCompactionReport = async (block: BlockInfo) => {
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const response = await fetch("/api/psp/compaction-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locationId,
        locationName,
        chainages: block.expected,
      }),
    });
    setLoading(false);

    if (!response.ok) {
      const payload = await response.json();
      pushToast({
        type: "error",
        title: "Report failed",
        message: payload.error ?? "Unable to generate report",
      });
      return;
    }

    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : "compaction-report.pdf";
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSaveLocation = async () => {
    if (!locationNameInput) return;
    if (locationModalMode === "edit" && !selectedLocationEditId) return;

    const startValue = Number(locationStartInput);
    const endValue = Number(locationEndInput);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
      pushToast({
        type: "error",
        title: "Invalid chainage",
        message: "Starting and End chainage are required.",
      });
      return;
    }

    const increment = CHAINAGE_STEP;
    if (Math.abs(startValue - endValue) % increment !== 0) {
      pushToast({
        type: "error",
        title: "Invalid chainage",
        message: `Start/end chainage must align to ${increment}m steps.`,
      });
      return;
    }

    const length = Math.abs(endValue - startValue);
    const qualityReportsRequired = Math.ceil(length / 200);

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
      message: "Authenticate before editing locations.",
      });
      return;
    }

  const payload = {
    name: locationNameInput,
    start_chainage: startValue,
    end_chainage: endValue,
    direction: locationDirectionInput,
    chainage_increment: increment,
    data_source: "psp_records",
    length_m: length,
    quality_reports_required: qualityReportsRequired,
  };

  const response =
    locationModalMode === "create"
      ? await supabase
          .from("psp_locations")
          .insert(payload)
          .select(
            "id,name,start_chainage,end_chainage,direction,chainage_increment,data_source,length_m,quality_reports_required",
          )
          .single()
      : await supabase
          .from("psp_locations")
          .update(payload)
          .eq("id", selectedLocationEditId)
          .select(
            "id,name,start_chainage,end_chainage,direction,chainage_increment,data_source,length_m,quality_reports_required",
          )
          .maybeSingle();

  if (response.error || !response.data) {
    pushToast({
      type: "error",
      title: "Location update failed",
      message: response.error?.message ?? "No location returned.",
    });
    return;
  }

  const updatedLocation = response.data;
  setLocations((prev) => {
    const updated = prev.filter((loc) => loc.id !== updatedLocation.id);
    return [...updated, updatedLocation].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  });
  setLocationModalOpen(false);
  };

  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <div className="psp-page">
      <div className="psp-shell">
        <header className="psp-header space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                PSP Lodge
              </p>
              <h1 className="text-xl font-semibold text-[var(--ink)]">
                PSP Admin Center
              </h1>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 px-3">
              <Link href="/">Back to User</Link>
            </Button>
          </div>
          <AuthPanel onAuthChange={setAuthEmail} />
        </header>

        <Card className="psp-card h-[90px] gap-2 py-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">Location:</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 items-center gap-2 pt-0">
            <Select
              value={locationSelectValue}
              onValueChange={(value) => setLocationId(value)}
              disabled={!authEmail}
            >
              <SelectTrigger className="psp-input w-full">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 px-0 text-sm"
                  disabled={!authEmail}
                >
                  ⋮
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openLocationModal("create")}>
                  Create Location
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openLocationModal("edit", locationId)}
                  disabled={!locationId}
                >
                  Edit Location
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setAuditOpen(true)}>
                  Audit
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardContent>
        </Card>

        <Card className="psp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {selectedLocation?.name ?? "Section Reports"}
            </CardTitle>
            <div className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
              PSP Compaction Reports
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedLocation ? (
              <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{selectedLocation.name}</p>
                  <div className="flex gap-2 text-xs">
                    <Badge className="bg-[color:var(--success)/0.18] text-[var(--success)]">
                      Ready {compactionSummary.ready}
                    </Badge>
                    <Badge className="bg-[color:var(--warning)/0.2] text-[var(--warnText)]">
                      Open {compactionSummary.open}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={syncCompactionReports}
                      disabled={!authEmail || syncingReports}
                    >
                      {syncingReports ? "Syncing..." : "Sync"}
                    </Button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  Records: {records.length}
                </p>
                {locationRequirement !== null ? (
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Minimum ITR required: {locationRequirement}
                  </p>
                ) : null}
                {locationRequirement !== null ? (
                  <div className="mt-2 grid gap-1 text-xs text-[var(--muted-foreground)]">
                    <div className="flex items-center justify-between">
                      <span>Reports ready</span>
                      <span>{compactionSummary.ready}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Reports pending</span>
                      <span>{progressSummary.pending}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Progress</span>
                      <span>{progressSummary.percent}%</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {compactionReports.length ? (
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {compactionReports.map((report) => {
                  const range = report.block_key.replace("-", " → ");
                  const isOpen = report.status === "OPEN";
                  return (
                    <div
                      key={report.id}
                      className={`flex items-center justify-between rounded-[12px] border border-[var(--border)] px-3 py-2 ${
                        report.status === "READY"
                          ? "bg-[rgba(22,163,74,0.2)]"
                          : "bg-[rgba(245,158,11,0.2)]"
                      }`}
                    >
                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Report #{report.block_index ?? "—"}
                        </p>
                        <p className="text-sm font-semibold">{range}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          Status:{" "}
                          <span
                            className={
                              report.status === "READY"
                                ? "text-[var(--success)]"
                                : "text-[var(--warnText)]"
                            }
                          >
                            {report.status}
                          </span>
                        </p>
                        {isOpen && report.pending_chainages?.length ? (
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            Pending Ch: {report.pending_chainages.join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 px-3 text-xs"
                        onClick={() => handleSendPdf(report)}
                      >
                        Send PDF
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>

      </div>

      <Dialog open={locationModalOpen} onOpenChange={setLocationModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {locationModalMode === "create" ? "Create Location" : "Edit Location"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="psp-label">Location name</label>
              <Input
                className="psp-input"
                value={locationNameInput}
                onChange={(event) => setLocationNameInput(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="psp-label">Starting Chainage (Ch)</label>
              <Input
                type="number"
                className="psp-input"
                value={locationStartInput}
                onChange={(event) => setLocationStartInput(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="psp-label">End Chainage (Ch)</label>
              <Input
                type="number"
                className="psp-input"
                value={locationEndInput}
                onChange={(event) => setLocationEndInput(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="psp-label">Direction</label>
              <Select
                value={locationDirectionInput}
                onValueChange={(value) =>
                  setLocationDirectionInput(value as "backwards" | "onwards")
                }
              >
                <SelectTrigger className="psp-input">
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backwards">Backwards</SelectItem>
                  <SelectItem value="onwards">Onwards</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="psp-button psp-button-primary h-10 px-4 text-xs"
              onClick={handleSaveLocation}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Location Audit</DialogTitle>
          </DialogHeader>
          {selectedLocation ? (
            <div className="space-y-2 text-xs text-[var(--muted-foreground)]">
              <p>
                Start: {selectedLocation.start_chainage ?? "—"} / End:{" "}
                {selectedLocation.end_chainage ?? "—"}
              </p>
              <p>Direction: {selectedLocation.direction ?? "—"}</p>
              <p>Increment: {selectedLocation.chainage_increment ?? CHAINAGE_STEP}</p>
              <p>Length: {selectedLocation.length_m ?? "—"} m</p>
              <p>
                Minimum ITR required:{" "}
                {selectedLocation.quality_reports_required ?? "—"}
              </p>
              <p>Reports READY: {compactionSummary.ready}</p>
              <p>Reports OPEN: {compactionSummary.open}</p>
              {compactionSummary.pending.length ? (
                <p>Pending chainages: {compactionSummary.pending.join(", ")}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">
              Select a location to view audit details.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
 }
