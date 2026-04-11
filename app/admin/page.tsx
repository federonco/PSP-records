"use client";

import { ChevronDown, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
 import { AuthPanel } from "@/components/auth-panel";
 import { useToast } from "@/components/toast";
import { BLOCK_SIZE, CHAINAGE_STEP, getBlockChainages } from "@/lib/psp";
import {
  getEffectiveLocationFields,
  LOCATION_LIST_SELECT,
  mergeLocationAppConfig,
} from "@/lib/location-app-config";
 import { getSupabaseBrowser } from "@/lib/supabase/browser";
 import { Modal } from "@/components/modal";
 import { Button } from "@/components/ui/button";
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
   DropdownMenuSub,
   DropdownMenuSubContent,
   DropdownMenuSubTrigger,
   DropdownMenuTrigger,
 } from "@/components/ui/dropdown-menu";

type Location = {
  id: string;
  name: string;
  start_chainage?: number | null;
  end_chainage?: number | null;
  direction?: "backwards" | "onwards" | null;
  length_m?: number | null;
  location_type?: string | null;
  app_config?: Record<string, unknown> | null;
};
 type RecordRow = {
  location_id: string;
   chainage: number;
  sign_off_at?: string | null;
  unified_section_id?: string | null;
  subsection_id?: string | null;
 };

type UnifiedSubsectionRow = {
  id: string;
  name: string;
  start_ch: number | null;
  end_ch: number | null;
  direction: string | null;
  qr_token: string | null;
  app_config?: Record<string, unknown> | null;
};

type UnifiedSectionRow = {
  id: string;
  name: string;
  start_ch: number;
  end_ch: number;
  direction: string;
  scope: string;
  app_config: Record<string, unknown>;
  qr_token: string | null;
  subsections: UnifiedSubsectionRow[];
};

type SendQrTarget =
  | { kind: "section"; section: UnifiedSectionRow }
  | { kind: "subsection"; subsection: UnifiedSubsectionRow; sectionName: string };

type CompactionReportRow = {
  id: string;
  status: "READY" | "OPEN" | string;
  block_key: string;
  block_index?: number | null;
  pending_chainages?: number[] | null;
  pdf_path?: string | null;
  location_id: string;
  unified_section_id?: string | null;
  subsection_id?: string | null;
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

function buildCompactionSummary(reports: CompactionReportRow[]) {
  const ready = reports.filter((row) => row.status === "READY").length;
  const open = reports.filter((row) => row.status === "OPEN").length;
  const nextOpen = reports
    .filter((row) => row.status === "OPEN")
    .sort((a, b) => (a.block_index ?? 999) - (b.block_index ?? 999))[0];
  const pending = Array.isArray(nextOpen?.pending_chainages)
    ? nextOpen?.pending_chainages ?? []
    : [];
  return { ready, open, pending };
}

function getLocationRequirementFor(loc: Location | undefined): number | null {
  if (!loc) return null;
  const eff = getEffectiveLocationFields(loc);
  if (
    eff.quality_reports_required !== null &&
    eff.quality_reports_required !== undefined
  ) {
    return eff.quality_reports_required;
  }
  const start = loc.start_chainage;
  const end = loc.end_chainage;
  if (typeof start === "number" && typeof end === "number") {
    const length = Math.abs(end - start);
    return Math.ceil(length / 200);
  }
  return null;
}

function getProgressSummary(
  records: RecordRow[],
  loc: Location | undefined,
  compactionReady: number,
  locationRequirement: number | null,
) {
  const required = locationRequirement ?? 0;
  const ready = compactionReady;
  const pending = Math.max(required - ready, 0);
  const percent =
    required > 0 ? Math.min(100, Math.round((ready / required) * 100)) : 0;

  let lengthPercent = 0;
  if (loc) {
    const start = loc.start_chainage;
    const end = loc.end_chainage;
    if (typeof start === "number" && typeof end === "number") {
      const length = Math.abs(end - start);
      if (length > 0) {
        const totalSteps = Math.floor(length / CHAINAGE_STEP) + 1;
        const uniqueChainages = new Set(records.map((row) => row.chainage));
        const covered = Math.min(uniqueChainages.size, totalSteps);
        lengthPercent = Math.min(
          100,
          Math.round((covered / totalSteps) * 100),
        );
      }
    }
  }

  return { required, pending, percent, lengthPercent };
}

function formatSectionChainageText(section: UnifiedSectionRow): string | null {
  if (section.start_ch != null && section.end_ch != null) {
    return `${section.start_ch} → ${section.end_ch}`;
  }
  if (section.start_ch != null) {
    return String(section.start_ch);
  }
  return null;
}

function formatSubsectionChainageText(sub: UnifiedSubsectionRow): string | null {
  if (sub.start_ch != null && sub.end_ch != null) {
    return `${sub.start_ch} → ${sub.end_ch}`;
  }
  if (sub.start_ch != null) {
    return String(sub.start_ch);
  }
  return null;
}

function locationIdFromSubAppConfig(app_config: unknown): string | null {
  if (!app_config || typeof app_config !== "object" || Array.isArray(app_config)) {
    return null;
  }
  const v = (app_config as Record<string, unknown>).location_id;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

 export default function AdminPage() {
   const supabase = getSupabaseBrowser();
  const router = useRouter();
   const { pushToast } = useToast();
   const [locations, setLocations] = useState<Location[]>([]);
  const [unifiedSections, setUnifiedSections] = useState<UnifiedSectionRow[]>([]);
  const [recordsByLocation, setRecordsByLocation] = useState<
    Record<string, RecordRow[]>
  >({});
  const [compactionReports, setCompactionReports] = useState<
    CompactionReportRow[]
  >([]);
  const [syncingLocationId, setSyncingLocationId] = useState<string | null>(null);
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
  const [locationPenetrometerIdInput, setLocationPenetrometerIdInput] =
    useState("");
  const [selectedLocationEditId, setSelectedLocationEditId] = useState<
    string | null
  >(null);
  const [penetrometerOpen, setPenetrometerOpen] = useState(false);
  const [penetrometerInput, setPenetrometerInput] = useState("1");
  const [editRecordOpen, setEditRecordOpen] = useState(false);
  const [editRecordChainage, setEditRecordChainage] = useState("");
  const [sendPdfModalOpen, setSendPdfModalOpen] = useState(false);
  const [sendPdfReport, setSendPdfReport] = useState<CompactionReportRow | null>(null);
  const [sendPdfEmail, setSendPdfEmail] = useState("");
  const [sendPdfLoading, setSendPdfLoading] = useState(false);
  const [sendPdfLocationId, setSendPdfLocationId] = useState("");
  const [sendPdfLocationName, setSendPdfLocationName] = useState("");
  const [sendQrOpen, setSendQrOpen] = useState(false);
  const [sendQrTarget, setSendQrTarget] = useState<SendQrTarget | null>(null);
  const [createSubOpen, setCreateSubOpen] = useState(false);
  const [createSubSectionId, setCreateSubSectionId] = useState<string | null>(null);
  const [createSubName, setCreateSubName] = useState("");
  const [createSubStart, setCreateSubStart] = useState("");
  const [createSubEnd, setCreateSubEnd] = useState("");
  const [createSubDirection, setCreateSubDirection] = useState<"onwards" | "backwards">(
    "onwards",
  );
  const [createSubIncrement, setCreateSubIncrement] = useState("20");
  const [createSubSaving, setCreateSubSaving] = useState(false);
  const [editSubOpen, setEditSubOpen] = useState(false);
  const [editSubId, setEditSubId] = useState("");
  const [editSubName, setEditSubName] = useState("");
  const [editSubStart, setEditSubStart] = useState("");
  const [editSubEnd, setEditSubEnd] = useState("");
  const [editSubDirection, setEditSubDirection] = useState<"onwards" | "backwards">(
    "onwards",
  );
  const [editSubIncrement, setEditSubIncrement] = useState("20");
  const [editSubSaving, setEditSubSaving] = useState(false);
  const [sendQrEmail, setSendQrEmail] = useState("");
  const [sendQrLoading, setSendQrLoading] = useState(false);
  const [auditLocationId, setAuditLocationId] = useState("");
  const [editRecordLocationId, setEditRecordLocationId] = useState("");
  const [sitePickerOpen, setSitePickerOpen] = useState(false);
  const [penetrometerLocationId, setPenetrometerLocationId] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  /** Section / subsection compaction panels: default collapsed */
  const [compactionPanelExpanded, setCompactionPanelExpanded] = useState<
    Record<string, boolean>
  >({});
  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      return data.session.access_token;
    }
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  };
  const locationIdsKey = useMemo(
    () => [...new Set(locations.map((l) => l.id))].sort().join(","),
    [locations],
  );

  const subsectionEditOptions = useMemo(
    () =>
      unifiedSections.flatMap((sec) =>
        (sec.subsections ?? []).map((sub) => ({
          sub,
          sectionName: sec.name,
        })),
      ),
    [unifiedSections],
  );

  useEffect(() => {
    if (!authEmail) return;
    const loadLocations = async () => {
      const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_LIST_SELECT)
        .eq("location_type", "psp")
        .order("name");
      if (error) {
        pushToast({
          type: "error",
          title: "Failed to load sites",
          message: error.message,
        });
        return;
      }
      setLocations(data ?? []);
    };
    loadLocations();
  }, [authEmail, pushToast, supabase]);

  const loadUnifiedSections = async () => {
    const token = await getAccessToken();
    const response = await fetch("/api/psp/sections", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Failed to load sections",
        message: payload.error ?? "Unable to load sections",
      });
      return;
    }
    setUnifiedSections((payload.sections ?? []) as UnifiedSectionRow[]);
  };

  useEffect(() => {
    if (!authEmail) return;
    loadUnifiedSections();
  }, [authEmail, pushToast]);

  useEffect(() => {
    if (authEmail) return;
    setLocations([]);
    setUnifiedSections([]);
    setRecordsByLocation({});
    setCompactionReports([]);
    setSelectedLocationEditId(null);
  }, [authEmail]);

  const loadCompactionReports = async () => {
    if (!authEmail) return;
    const ids = [...new Set(locations.map((l) => l.id))].filter(Boolean);
    if (!ids.length) {
      setCompactionReports([]);
      return;
    }
    const { data, error } = await supabase
      .from("psp_reports")
      .select(
        "id,status,block_key,block_index,pending_chainages,pdf_path,location_id,unified_section_id,subsection_id",
      )
      .in("location_id", ids)
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
    if (!authEmail || !locationIdsKey) return;
    const ids = locationIdsKey.split(",").filter(Boolean);
    const loadRecords = async () => {
      const { data, error } = await supabase
        .from("psp_records")
        .select("location_id,chainage,sign_off_at,unified_section_id,subsection_id")
        .in("location_id", ids)
        .order("chainage", { ascending: false });
      if (error) {
        pushToast({
          type: "error",
          title: "Failed to load records",
          message: error.message,
        });
        return;
      }
      const grouped: Record<string, RecordRow[]> = {};
      ids.forEach((id) => {
        grouped[id] = [];
      });
      for (const row of data ?? []) {
        const lid = row.location_id as string;
        if (!grouped[lid]) grouped[lid] = [];
        grouped[lid].push(row as RecordRow);
      }
      setRecordsByLocation(grouped);
    };
    loadRecords();
  }, [authEmail, locationIdsKey, pushToast, supabase]);

  useEffect(() => {
    if (!authEmail || !locationIdsKey) return;
    void loadCompactionReports();
  }, [authEmail, locationIdsKey]);

  const syncCompactionReports = async (
    locationId: string,
    locationName: string,
  ) => {
    if (!locationId || !authEmail) return;
    setSyncingLocationId(locationId);
    const token = await getAccessToken();
    if (!token) {
      setSyncingLocationId(null);
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before syncing compaction reports.",
      });
      return;
    }
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
    setSyncingLocationId(null);
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

  const openSendQrModal = async (section: UnifiedSectionRow) => {
    setSendQrTarget({ kind: "section", section });
    setSendQrOpen(true);
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      setSendQrEmail(config.reportDefaultEmail ?? "");
    } catch {
      setSendQrEmail("");
    }
  };

  const openSendQrModalSubsection = async (
    subsection: UnifiedSubsectionRow,
    sectionName: string,
  ) => {
    setSendQrTarget({ kind: "subsection", subsection, sectionName });
    setSendQrOpen(true);
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      setSendQrEmail(config.reportDefaultEmail ?? "");
    } catch {
      setSendQrEmail("");
    }
  };

  const handleSendQr = async () => {
    if (!sendQrTarget) return;
    const trimmed = sendQrEmail.trim();
    if (!trimmed) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: "Please enter a recipient email address.",
      });
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before sending.",
      });
      return;
    }
    setSendQrLoading(true);
    const id =
      sendQrTarget.kind === "section"
        ? sendQrTarget.section.id
        : sendQrTarget.subsection.id;
    const base =
      sendQrTarget.kind === "section" ? "/api/psp/sections" : "/api/psp/subsections";
    const r1 = await fetch(`${base}/${id}/qr`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const p1 = await r1.json();
    if (!r1.ok) {
      setSendQrLoading(false);
      pushToast({
        type: "error",
        title: "QR failed",
        message: p1.error ?? "Unable to create QR token",
      });
      return;
    }
    const r2 =
      sendQrTarget.kind === "section"
        ? await fetch("/api/psp/sections/send-qr", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sectionId: sendQrTarget.section.id, email: trimmed }),
          })
        : await fetch("/api/psp/subsections/send-qr", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              subsectionId: sendQrTarget.subsection.id,
              email: trimmed,
            }),
          });
    const p2 = await r2.json();
    setSendQrLoading(false);
    if (!r2.ok) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: p2.error ?? "Unable to send email",
      });
      return;
    }
    pushToast({
      type: "success",
      title: "QR sent",
      message: `The QR email was sent to ${trimmed}.`,
    });
    setSendQrOpen(false);
    setSendQrTarget(null);
  };

  const handleCreateSubsection = async () => {
    if (!createSubSectionId || !createSubName.trim()) {
      pushToast({
        type: "error",
        title: "Missing fields",
        message: "Name is required.",
      });
      return;
    }
    const startN = Number(createSubStart);
    const endN = Number(createSubEnd);
    if (!Number.isFinite(startN) || !Number.isFinite(endN)) {
      pushToast({
        type: "error",
        title: "Invalid chainage",
        message: "Enter valid start and end chainage.",
      });
      return;
    }
    const incN = Number(createSubIncrement);
    const token = await getAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before creating a subsection.",
      });
      return;
    }
    setCreateSubSaving(true);
    const response = await fetch("/api/psp/subsections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        section_id: createSubSectionId,
        name: createSubName.trim(),
        start_ch: startN,
        end_ch: endN,
        direction: createSubDirection,
        app_config: {
          chainage_increment: Number.isFinite(incN) ? incN : 20,
        },
      }),
    });
    const payload = await response.json();
    setCreateSubSaving(false);
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Create failed",
        message: payload.error ?? "Unable to create subsection.",
      });
      return;
    }
    pushToast({ type: "success", title: "Subsection created" });
    setCreateSubOpen(false);
    setCreateSubSectionId(null);
    await loadUnifiedSections();
  };

  const applyEditSubFields = (sub: UnifiedSubsectionRow) => {
    setEditSubName(sub.name ?? "");
    setEditSubStart(sub.start_ch != null ? String(sub.start_ch) : "");
    setEditSubEnd(sub.end_ch != null ? String(sub.end_ch) : "");
    const dir = String(sub.direction ?? "").toLowerCase();
    setEditSubDirection(dir === "backwards" ? "backwards" : "onwards");
    const inc = sub.app_config?.chainage_increment;
    setEditSubIncrement(
      typeof inc === "number" && Number.isFinite(inc) ? String(inc) : "20",
    );
  };

  const openEditSubsectionFromMenu = () => {
    if (!subsectionEditOptions.length) {
      pushToast({
        type: "info",
        title: "No subsections",
        message: "Create a subsection first.",
      });
      return;
    }
    const { sub } = subsectionEditOptions[0];
    setEditSubId(sub.id);
    applyEditSubFields(sub);
    setEditSubOpen(true);
  };

  const openCreateSubsectionFromMenu = () => {
    if (!unifiedSections.length) {
      pushToast({
        type: "info",
        title: "No sections",
        message: "No sections are available yet.",
      });
      return;
    }
    setCreateSubSectionId(unifiedSections[0].id);
    setCreateSubName("");
    setCreateSubStart("");
    setCreateSubEnd("");
    setCreateSubDirection("onwards");
    setCreateSubIncrement("20");
    setCreateSubOpen(true);
  };

  const handleSaveEditSubsection = async () => {
    if (!editSubId.trim() || !editSubName.trim()) {
      pushToast({
        type: "error",
        title: "Missing fields",
        message: "Name is required.",
      });
      return;
    }
    const startN = Number(editSubStart);
    const endN = Number(editSubEnd);
    if (!Number.isFinite(startN) || !Number.isFinite(endN)) {
      pushToast({
        type: "error",
        title: "Invalid chainage",
        message: "Enter valid start and end chainage.",
      });
      return;
    }
    const incN = Number(editSubIncrement);
    let mergedApp: Record<string, unknown> = {};
    for (const opt of subsectionEditOptions) {
      if (opt.sub.id === editSubId) {
        mergedApp = { ...(opt.sub.app_config ?? {}) };
        break;
      }
    }
    mergedApp.chainage_increment = Number.isFinite(incN) ? incN : 20;

    const token = await getAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before saving.",
      });
      return;
    }
    setEditSubSaving(true);
    const response = await fetch(`/api/psp/subsections/${editSubId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: editSubName.trim(),
        start_ch: startN,
        end_ch: endN,
        direction: editSubDirection,
        app_config: mergedApp,
      }),
    });
    const payload = await response.json();
    setEditSubSaving(false);
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Update failed",
        message: payload.error ?? "Unable to update subsection.",
      });
      return;
    }
    pushToast({ type: "success", title: "Subsection updated" });
    setEditSubOpen(false);
    setEditSubId("");
    await loadUnifiedSections();
  };

  const openSendPdfModal = async (
    report: CompactionReportRow,
    pdfLocationId: string,
    pdfLocationName: string,
  ) => {
    setSendPdfReport(report);
    setSendPdfLocationId(pdfLocationId);
    setSendPdfLocationName(pdfLocationName);
    setSendPdfModalOpen(true);
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      setSendPdfEmail(config.reportDefaultEmail ?? "");
    } catch {
      setSendPdfEmail("");
    }
  };

  const handleSendPdf = async (report: CompactionReportRow, recipientEmail: string) => {
    if (!report.block_index) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: "Missing report number for this block.",
      });
      return;
    }
    if (!sendPdfLocationId && !sendPdfLocationName) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: "Missing site context for this report.",
      });
      return;
    }
    const trimmed = recipientEmail.trim();
    if (!trimmed) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: "Please enter a recipient email address.",
      });
      return;
    }
    const token = await getAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before sending reports.",
      });
      return;
    }
    setSendPdfLoading(true);
    const response = await fetch("/api/reports/itr-exb-003/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        location_id: sendPdfLocationId,
        location_name: sendPdfLocationName,
        reportNum: report.block_index,
        includeOpen: true,
        recipientEmail: trimmed,
      }),
    });
    const payload = await response.json();
    setSendPdfLoading(false);
    setSendPdfModalOpen(false);
    setSendPdfReport(null);
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
      message: `The PDF was emailed to ${trimmed}.`,
    });
  };

  const isValidEmail = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(trimmed);
  };

  const handleAuditReportAll = async () => {
    if (!auditLocationId || !authEmail) return;
    const auditLoc = locations.find((l) => l.id === auditLocationId);
    const auditName = auditLoc?.name ?? "";
    setLoading(true);
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before generating audit reports.",
      });
      return;
    }
    const response = await fetch("/api/psp/audit-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locationId: auditLocationId,
        locationName: auditName,
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
      title: "Audit report sent",
      message: "The PDF was emailed to the admin list.",
    });
  };

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

   const handleSignOffBlock = async (block: BlockInfo, forLocationId: string) => {
     setLoading(true);
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before signing off blocks.",
      });
      return;
    }
     const response = await fetch("/api/psp/signoff-block", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId: forLocationId,
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
     setRecordsByLocation((prev) => {
       const list = prev[forLocationId] ?? [];
       return {
         ...prev,
         [forLocationId]: list.map((row) =>
           block.expected.includes(row.chainage)
             ? { ...row, sign_off_at: new Date().toISOString() }
             : row,
         ),
       };
     });
   };

  const handleAuditReport = async (
    block: BlockInfo,
    forLocationId: string,
    forLocationName: string,
  ) => {
     setLoading(true);
    const token = await getAccessToken();
    if (!token) {
      setLoading(false);
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before generating audit reports.",
      });
      return;
    }
     const response = await fetch("/api/psp/audit-report", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId: forLocationId,
         locationName: forLocationName,
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
      setLocationPenetrometerIdInput(
        getEffectiveLocationFields(loc).penetrometer_sn ?? "",
      );
    } else {
      setLocationNameInput("");
      setLocationStartInput("");
      setLocationEndInput("");
      setLocationDirectionInput("backwards");
      setLocationPenetrometerIdInput("");
    }
    setLocationModalOpen(true);
  };

  const handleCompactionReport = (block: BlockInfo, forLocationId: string) => {
    const params = new URLSearchParams({
      location_id: forLocationId,
      reportNum: String(block.index),
    });
    window.open(`/reports/compaction-preview?${params.toString()}`, "_blank", "noopener,noreferrer");
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

    const existingRow =
      locationModalMode === "edit"
        ? locations.find((l) => l.id === selectedLocationEditId)
        : undefined;
    const mergedConfig = mergeLocationAppConfig(existingRow?.app_config, {
      chainage_increment: increment,
      data_source: "psp_records",
      quality_reports_required: Math.ceil(length / 200),
      penetrometer_sn: locationPenetrometerIdInput || null,
    });

    const payload = {
      name: locationNameInput,
      start_chainage: startValue,
      end_chainage: endValue,
      direction: locationDirectionInput,
      length_m: length,
      app_config: mergedConfig,
    };

    const response =
      locationModalMode === "create"
        ? await supabase
            .from("locations")
            .insert({ ...payload, location_type: "psp" })
            .select(LOCATION_LIST_SELECT)
            .single()
        : await supabase
            .from("locations")
            .update(payload)
            .eq("location_type", "psp")
            .eq("id", selectedLocationEditId)
            .select(LOCATION_LIST_SELECT)
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
    await loadUnifiedSections();
  };

  const handleOpenPenetrometer = () => {
    const lid = locations[0]?.id;
    if (!lid) {
      pushToast({
        type: "info",
        title: "No sites",
        message: "Create a site first.",
      });
      return;
    }
    setPenetrometerLocationId(lid);
    const loc = locations.find((l) => l.id === lid);
    const current = loc
      ? getEffectiveLocationFields(loc).penetrometer_sn
      : null;
    setPenetrometerInput(current ?? "");
    setPenetrometerOpen(true);
  };

  const handleSavePenetrometer = async () => {
    if (!penetrometerLocationId) return;
    const value = penetrometerInput;
    const loc = locations.find((l) => l.id === penetrometerLocationId);
    const merged = mergeLocationAppConfig(loc?.app_config, {
      penetrometer_sn: value,
    });
    const { error } = await supabase
      .from("locations")
      .update({ app_config: merged })
      .eq("location_type", "psp")
      .eq("id", penetrometerLocationId);
    if (error) {
      pushToast({
        type: "error",
        title: "Update failed",
        message: error.message,
      });
      return;
    }
    setLocations((prev) =>
      prev.map((l) =>
        l.id === penetrometerLocationId ? { ...l, app_config: merged } : l,
      ),
    );
    setPenetrometerOpen(false);
  };

  const handleOpenEditRecord = () => {
    setEditRecordLocationId(locations[0]?.id ?? "");
    setEditRecordChainage("");
    setEditRecordOpen(true);
  };

  const handleGoToEditRecord = () => {
    if (!editRecordLocationId || !editRecordChainage) return;
    const value = Number(editRecordChainage);
    if (!Number.isFinite(value)) {
      pushToast({
        type: "error",
        title: "Invalid chainage",
        message: "Please select a valid chainage.",
      });
      return;
    }
    setEditRecordOpen(false);
    router.push(
      `/admin/record-edit?locationId=${editRecordLocationId}&chainage=${value}`,
    );
  };

  const resolveSectionScopeSync = (
    section: UnifiedSectionRow,
    scopeReports: CompactionReportRow[],
  ): { id: string; name: string } | null => {
    const first = scopeReports[0];
    if (first?.location_id) {
      const loc = locations.find((l) => l.id === first.location_id);
      return { id: first.location_id, name: loc?.name ?? first.location_id };
    }
    for (const lid of Object.keys(recordsByLocation)) {
      const rows = recordsByLocation[lid] ?? [];
      if (
        rows.some(
          (r) =>
            r.unified_section_id === section.id && !r.subsection_id,
        )
      ) {
        const loc = locations.find((l) => l.id === lid);
        return { id: lid, name: loc?.name ?? lid };
      }
    }
    for (const loc of locations) {
      const raw = loc.app_config;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const uid = (raw as Record<string, unknown>).unified_section_id;
        if (typeof uid === "string" && uid.trim() === section.id) {
          return { id: loc.id, name: loc.name };
        }
      }
    }
    return null;
  };

  const resolveSubsectionScopeSync = (
    sub: UnifiedSubsectionRow,
    scopeReports: CompactionReportRow[],
  ): { id: string; name: string } | null => {
    const fromCfg = locationIdFromSubAppConfig(sub.app_config);
    if (fromCfg) {
      const loc = locations.find((l) => l.id === fromCfg);
      return { id: fromCfg, name: loc?.name ?? fromCfg };
    }
    const first = scopeReports[0];
    if (first?.location_id) {
      const loc = locations.find((l) => l.id === first.location_id);
      return { id: first.location_id, name: loc?.name ?? first.location_id };
    }
    return null;
  };

  const renderCompactionScopePanel = (args: {
    scopeKey: string;
    titleText: string;
    variant: "section" | "subsection";
    reports: CompactionReportRow[];
    locRecords: RecordRow[];
    syncTarget: { id: string; name: string } | null;
  }) => {
    const {
      scopeKey,
      titleText,
      variant,
      reports: scopeReports,
      locRecords,
      syncTarget,
    } = args;

    const compactionSummary = buildCompactionSummary(scopeReports);
    const locForRequirement = syncTarget
      ? locations.find((l) => l.id === syncTarget.id)
      : undefined;
    const locationRequirement = getLocationRequirementFor(locForRequirement);
    const progressSummary = getProgressSummary(
      locRecords,
      locForRequirement,
      compactionSummary.ready,
      locationRequirement,
    );
    const siteExpanded = compactionPanelExpanded[scopeKey] ?? false;
    const isSubScope = variant === "subsection";
    const nested = true;

    const outerClass = (() => {
      if (nested) {
        return isSubScope
          ? "ml-3 rounded-[12px] border border-dashed border-[var(--border)]/75 bg-[var(--surface-alt)]/75 p-2.5 pl-3 shadow-none sm:ml-6"
          : "ml-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface-alt)] p-3 pl-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:ml-6";
      }
      return isSubScope
        ? "rounded-[16px] border border-dashed border-[var(--border)]/80 bg-[var(--surface-alt)]/95 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
        : "rounded-[20px] border-2 border-[#556F87]/25 bg-[var(--surface)] p-4 shadow-[0_4px_20px_rgba(85,111,135,0.14)]";
    })();

    const titleClass = (() => {
      if (nested) {
        return isSubScope
          ? "text-sm font-medium text-[var(--ink)]/90"
          : "text-sm font-semibold text-[var(--ink)]";
      }
      return isSubScope
        ? "text-sm font-semibold text-[var(--ink)]"
        : "text-lg font-bold tracking-tight text-[var(--ink)]";
    })();

    const syncId = syncTarget?.id;
    const syncing = syncId != null && syncingLocationId === syncId;

    return (
      <div className={outerClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start gap-2 rounded-[12px] text-left outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40"
            aria-expanded={siteExpanded}
            onClick={() =>
              setCompactionPanelExpanded((prev) => ({
                ...prev,
                [scopeKey]: !siteExpanded,
              }))
            }
          >
            <ChevronDown
              className={`mt-1 size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${
                siteExpanded ? "rotate-0" : "-rotate-90"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`min-w-0 ${titleClass}`}>{titleText}</p>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    isSubScope
                      ? "bg-[var(--muted-foreground)]/12 text-[var(--muted-foreground)]"
                      : "bg-[#556F87]/14 text-[#556F87]"
                  }`}
                >
                  {isSubScope ? "Subsection" : "Section"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                PSP compaction reports
              </p>
            </div>
          </button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 rounded-full border-[#E6EDF3] bg-[#E6EDF3] text-[var(--ink)] hover:bg-[#D3DAE1] hover:border-[#D3DAE1]"
            onClick={() =>
              syncTarget &&
              syncCompactionReports(syncTarget.id, syncTarget.name)
            }
            disabled={
              !authEmail || !syncTarget || syncing
            }
            title={
              syncing
                ? "Syncing..."
                : !syncTarget
                  ? "No PSP site linked for this scope"
                  : "Sync compaction reports"
            }
          >
            <RefreshCw
              className={`size-4 ${syncing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {siteExpanded ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <div className="mb-3 rounded-[var(--radius)] bg-[#F7F9FB] p-3 text-[var(--ink)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold">{titleText}</p>
                <div className="flex gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE8DA] bg-[#E7F4EC] px-2 py-0.5 text-[10px] font-medium text-[#2F7D55]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2F7D55]"
                      aria-hidden
                    />
                    Ready {compactionSummary.ready}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F3E3B0] bg-[#FFF6DB] px-2 py-0.5 text-[10px] font-medium text-[#9A6B00]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#D8A200]"
                      aria-hidden
                    />
                    Open {compactionSummary.open}
                  </span>
                </div>
              </div>
              <div className="mt-2 space-y-1 text-xs">
                <p>Records: {locRecords.length}</p>
                {locationRequirement !== null ? (
                  <p>Minimum ITR required: {locationRequirement}</p>
                ) : null}
                {locationRequirement !== null ? (
                  <div className="grid gap-1">
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
                      <span>{progressSummary.lengthPercent}%</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {scopeReports.length ? (
              <div className="max-h-[280px] space-y-3 overflow-y-auto pr-1">
                {scopeReports.map((report) => {
                  const range = report.block_key.replace("-", " → ");
                  const isOpen = report.status === "OPEN";
                  const pendingCount = report.pending_chainages?.length ?? 0;
                  const completedCount = Math.max(0, BLOCK_SIZE - pendingCount);
                  const progressPercent = Math.round(
                    (completedCount / BLOCK_SIZE) * 100,
                  );
                  const pdfName =
                    locations.find((l) => l.id === report.location_id)?.name ??
                    report.location_id;

                  return (
                    <div
                      key={report.id}
                      className="flex items-center justify-between rounded-[16px] bg-[var(--surface-alt)] px-3 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                    >
                      <div>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Report #{report.block_index ?? "—"}
                        </p>
                        <p className="text-sm font-semibold">{range}</p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          Status:{" "}
                          {report.status === "READY" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE8DA] bg-[#E7F4EC] px-2 py-0.5 text-[10px] font-medium text-[#2F7D55]">
                              Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F3E3B0] bg-[#FFF6DB] px-2 py-0.5 text-[10px] font-medium text-[#9A6B00]">
                              Open
                            </span>
                          )}
                        </p>
                        {isOpen && report.pending_chainages?.length ? (
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            Pending Ch: {report.pending_chainages.join(", ")}
                          </p>
                        ) : null}
                        {isOpen ? (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)]">
                              <span>Complete</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                              <div
                                className="h-full rounded-full bg-[#556F87]"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 px-3 text-xs border-0 text-white shadow-[0_4px_14px_rgba(85,111,135,0.35)] bg-[#556F87] hover:bg-[#556F87]/90"
                        onClick={() =>
                          openSendPdfModal(
                            report,
                            report.location_id,
                            pdfName,
                          )
                        }
                      >
                        Send PDF
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[var(--muted-foreground)]">
                No compaction reports for this site yet. Use Sync to generate.
              </p>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="psp-page">
      <div className="psp-shell">
        <header className="psp-header space-y-3">
          <div className="psp-header-title-wrap">
            <h1 className="psp-page-title">
              PSP Admin
            </h1>
          </div>
          <div className="mt-[28px]">
            <AuthPanel onAuthChange={setAuthEmail} />
          </div>
        </header>

        <div className="space-y-4">
          {unifiedSections.length === 0 ? (
            <div className="flex justify-end pb-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 shrink-0 border-[#E6EDF3] bg-[#E6EDF3] px-0 text-sm hover:bg-[#F7F9FB] hover:border-[#F7F9FB] active:bg-[#F7F9FB] active:border-[#F7F9FB]"
                    disabled={!authEmail}
                  >
                    ⋮
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={!authEmail}>
                      Subsection
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={openCreateSubsectionFromMenu}
                        disabled={!authEmail || !unifiedSections.length}
                      >
                        Create
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={openEditSubsectionFromMenu}
                        disabled={!authEmail || !subsectionEditOptions.length}
                      >
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem
                    onClick={handleOpenEditRecord}
                    disabled={!locations.length}
                  >
                    Edit record
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setAuditLocationId(locations[0]?.id ?? "");
                      setAuditOpen(true);
                    }}
                  >
                    Audit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          {unifiedSections.map((section, sectionIndex) => {
            const chainageText = formatSectionChainageText(section);
            const sectionScopeReports = compactionReports.filter(
              (r) =>
                r.unified_section_id === section.id && !r.subsection_id,
            );
            const sectionScopeRecords = Object.values(
              recordsByLocation,
            ).flatMap((rows) =>
              rows.filter(
                (r) =>
                  r.unified_section_id === section.id && !r.subsection_id,
              ),
            );
            const sectionSyncTarget = resolveSectionScopeSync(
              section,
              sectionScopeReports,
            );
            return (
              <div
                key={section.id}
                className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <h2 className="text-lg font-bold text-[var(--ink)]">
                      {section.name}
                    </h2>
                    {chainageText ? (
                      <p className="text-sm text-[var(--ink)]">
                        Chainage: {chainageText}
                      </p>
                    ) : null}
                    {section.direction ? (
                      <p className="text-sm text-[var(--ink)]">
                        Direction: {section.direction}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 px-4 text-xs border-0 text-white shadow-[0_4px_14px_rgba(85,111,135,0.35)] bg-[#556F87] hover:bg-[#556F87]/90"
                      disabled={!authEmail}
                      onClick={() => openSendQrModal(section)}
                    >
                      Send QR
                    </Button>
                    {sectionIndex === 0 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-9 shrink-0 border-[#E6EDF3] bg-[#E6EDF3] px-0 text-sm hover:bg-[#F7F9FB] hover:border-[#F7F9FB] active:bg-[#F7F9FB] active:border-[#F7F9FB]"
                            disabled={!authEmail}
                          >
                            ⋮
                          </Button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent align="end">
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger disabled={!authEmail}>
                              Subsection
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuItem
                                onClick={openCreateSubsectionFromMenu}
                                disabled={
                                  !authEmail || !unifiedSections.length
                                }
                              >
                                Create
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={openEditSubsectionFromMenu}
                                disabled={
                                  !authEmail || !subsectionEditOptions.length
                                }
                              >
                                Edit
                              </DropdownMenuItem>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuItem
                            onClick={handleOpenEditRecord}
                            disabled={!locations.length}
                          >
                            Edit record
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setAuditLocationId(locations[0]?.id ?? "");
                              setAuditOpen(true);
                            }}
                          >
                            Audit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
                  {renderCompactionScopePanel({
                    scopeKey: `section-root-${section.id}`,
                    titleText: section.name,
                    variant: "section",
                    reports: sectionScopeReports,
                    locRecords: sectionScopeRecords,
                    syncTarget: sectionSyncTarget,
                  })}
                  {(section.subsections ?? []).map((sub) => {
                    const subCh = formatSubsectionChainageText(sub);
                    const subScopeReports = compactionReports.filter(
                      (r) => r.subsection_id === sub.id,
                    );
                    const subScopeRecords = Object.values(
                      recordsByLocation,
                    ).flatMap((rows) =>
                      rows.filter((r) => r.subsection_id === sub.id),
                    );
                    const subSyncTarget = resolveSubsectionScopeSync(
                      sub,
                      subScopeReports,
                    );
                    return (
                      <div
                        key={sub.id}
                        className="ml-3 space-y-2 sm:ml-6"
                      >
                        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface-alt)]/75 p-3 pl-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm font-semibold text-[var(--ink)]">
                                {sub.name}
                              </p>
                              {subCh ? (
                                <p className="text-xs text-[var(--ink)]">
                                  Chainage: {subCh}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 shrink-0 px-3 text-[11px] border-0 text-white shadow-[0_4px_12px_rgba(85,111,135,0.3)] bg-[#556F87] hover:bg-[#556F87]/90"
                              disabled={!authEmail}
                              onClick={() =>
                                openSendQrModalSubsection(sub, section.name)
                              }
                            >
                              Send QR
                            </Button>
                          </div>
                        </div>
                        {renderCompactionScopePanel({
                          scopeKey: `subsection-${sub.id}`,
                          titleText: sub.name,
                          variant: "subsection",
                          reports: subScopeReports,
                          locRecords: subScopeRecords,
                          syncTarget: subSyncTarget,
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {authEmail && !unifiedSections.length && !locations.length ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No sections or sites loaded. Create a site to get started.
            </p>
          ) : null}
        </div>

      </div>

      <Modal
        open={sendQrOpen}
        title={
          sendQrTarget?.kind === "section"
            ? `Send QR by email — ${sendQrTarget.section.name}`
            : sendQrTarget?.kind === "subsection"
              ? `Send QR by email — ${sendQrTarget.subsection.name}`
              : "Send QR by email"
        }
        onClose={() => {
          setSendQrOpen(false);
          setSendQrTarget(null);
        }}
      >
        <div className="space-y-3">
          <label className="psp-label">Send QR to:</label>
          <Input
            type="email"
            className="psp-input min-h-[44px]"
            placeholder="recipient@example.com"
            value={sendQrEmail}
            onChange={(e) => setSendQrEmail(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => {
                setSendQrOpen(false);
                setSendQrTarget(null);
              }}
            >
              Cancel
            </Button>
            <Button
              className="psp-button psp-button-primary min-h-[44px] min-w-[44px] px-4"
              onClick={handleSendQr}
              disabled={sendQrLoading || !isValidEmail(sendQrEmail)}
            >
              {sendQrLoading ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      </Modal>

      <Dialog
        open={createSubOpen}
        onOpenChange={(open) => {
          setCreateSubOpen(open);
          if (!open) setCreateSubSectionId(null);
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create subsection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="psp-label">Section</label>
              <Select
                value={createSubSectionId ?? ""}
                onValueChange={(v) => setCreateSubSectionId(v)}
              >
                <SelectTrigger className="psp-input">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {unifiedSections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="psp-label">Name</label>
              <Input
                className="psp-input"
                value={createSubName}
                onChange={(e) => setCreateSubName(e.target.value)}
                placeholder="Subsection name"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="psp-label">Start chainage</label>
                <Input
                  type="number"
                  className="psp-input"
                  value={createSubStart}
                  onChange={(e) => setCreateSubStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="psp-label">End chainage</label>
                <Input
                  type="number"
                  className="psp-input"
                  value={createSubEnd}
                  onChange={(e) => setCreateSubEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="psp-label">Direction</label>
              <Select
                value={createSubDirection}
                onValueChange={(v) =>
                  setCreateSubDirection(v as "onwards" | "backwards")
                }
              >
                <SelectTrigger className="psp-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onwards">Onwards</SelectItem>
                  <SelectItem value="backwards">Backwards</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="psp-label">Chainage increment</label>
              <Input
                type="number"
                className="psp-input"
                value={createSubIncrement}
                onChange={(e) => setCreateSubIncrement(e.target.value)}
                placeholder="20"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateSubOpen(false);
                setCreateSubSectionId(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="psp-button psp-button-primary"
              onClick={() => void handleCreateSubsection()}
              disabled={createSubSaving}
            >
              {createSubSaving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editSubOpen}
        onOpenChange={(open) => {
          setEditSubOpen(open);
          if (!open) setEditSubId("");
        }}
      >
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Edit subsection</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="psp-label">Subsection</label>
              <Select
                value={editSubId}
                onValueChange={(id) => {
                  setEditSubId(id);
                  const found = subsectionEditOptions.find((o) => o.sub.id === id);
                  if (found) applyEditSubFields(found.sub);
                }}
              >
                <SelectTrigger className="psp-input">
                  <SelectValue placeholder="Select subsection" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(280px,50vh)]">
                  {subsectionEditOptions.map(({ sub, sectionName }) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sectionName} — {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="psp-label">Name</label>
              <Input
                className="psp-input"
                value={editSubName}
                onChange={(e) => setEditSubName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="psp-label">Start chainage</label>
                <Input
                  type="number"
                  className="psp-input"
                  value={editSubStart}
                  onChange={(e) => setEditSubStart(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="psp-label">End chainage</label>
                <Input
                  type="number"
                  className="psp-input"
                  value={editSubEnd}
                  onChange={(e) => setEditSubEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="psp-label">Direction</label>
              <Select
                value={editSubDirection}
                onValueChange={(v) =>
                  setEditSubDirection(v as "onwards" | "backwards")
                }
              >
                <SelectTrigger className="psp-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onwards">Onwards</SelectItem>
                  <SelectItem value="backwards">Backwards</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="psp-label">Chainage increment</label>
              <Input
                type="number"
                className="psp-input"
                value={editSubIncrement}
                onChange={(e) => setEditSubIncrement(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditSubOpen(false);
                setEditSubId("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="psp-button psp-button-primary"
              onClick={() => void handleSaveEditSubsection()}
              disabled={editSubSaving || !editSubId}
            >
              {editSubSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sendPdfModalOpen} onOpenChange={setSendPdfModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="psp-label">Send report to:</label>
            <Input
              type="email"
              className="psp-input min-h-[44px]"
              placeholder="recipient@example.com"
              value={sendPdfEmail}
              onChange={(e) => setSendPdfEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-[44px] min-w-[44px]"
              onClick={() => {
                setSendPdfModalOpen(false);
                setSendPdfReport(null);
                setSendPdfLocationId("");
                setSendPdfLocationName("");
              }}
            >
              Cancel
            </Button>
            <Button
              className="psp-button psp-button-primary min-h-[44px] min-w-[44px] px-4"
              onClick={() => sendPdfReport && handleSendPdf(sendPdfReport, sendPdfEmail)}
              disabled={!sendPdfReport || sendPdfLoading || !isValidEmail(sendPdfEmail)}
            >
              {sendPdfLoading ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={locationModalOpen} onOpenChange={setLocationModalOpen}>
        <DialogContent data-dialog="location">
          <DialogHeader>
            <DialogTitle>
              {locationModalMode === "create" ? "Create site" : "Edit site"}
            </DialogTitle>
          </DialogHeader>
          <div className="psp-dialog-location-form space-y-3">
            <div className="space-y-1">
              <label className="psp-label">Site name</label>
              <Input
                className="psp-input"
                value={locationNameInput}
                onChange={(event) => setLocationNameInput(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="psp-label">Starting chainage (ch)</label>
              <Input
                type="number"
                className="psp-input"
                value={locationStartInput}
                onChange={(event) => setLocationStartInput(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="psp-label">End chainage (ch)</label>
              <Input
                type="number"
                className="psp-input"
                value={locationEndInput}
                onChange={(event) => setLocationEndInput(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="psp-label">Penetrometer ID</label>
              <Input
                className="psp-input"
                value={locationPenetrometerIdInput}
                onChange={(event) =>
                  setLocationPenetrometerIdInput(event.target.value)
                }
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
              className="psp-button psp-button-primary psp-dialog-location-save h-10 px-6 text-sm !bg-[#556F87] text-white hover:!bg-[#556F87]/90"
              onClick={handleSaveLocation}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={penetrometerOpen} onOpenChange={setPenetrometerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Penetrometer serial</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="psp-label">Serial number</label>
            <Input
              className="psp-input"
              value={penetrometerInput}
              onChange={(event) => setPenetrometerInput(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPenetrometerOpen(false)}>
              Cancel
            </Button>
            <Button className="psp-button psp-button-primary h-10 px-4 text-xs" onClick={handleSavePenetrometer}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editRecordOpen} onOpenChange={setEditRecordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit record</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="psp-label">Section / subsection</label>
            <Select
              value={editRecordLocationId || undefined}
              onValueChange={setEditRecordLocationId}
            >
              <SelectTrigger className="psp-input">
                <SelectValue placeholder="Select section or subsection" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="psp-label">Chainage (ch)</label>
            <Select
              value={editRecordChainage || undefined}
              onValueChange={setEditRecordChainage}
            >
              <SelectTrigger className="psp-input">
                <SelectValue placeholder="Select chainage" />
              </SelectTrigger>
              <SelectContent>
                {[
                  ...new Set(
                    (recordsByLocation[editRecordLocationId] ?? []).map(
                      (r) => r.chainage,
                    ),
                  ),
                ]
                  .sort((a, b) => b - a)
                  .map((ch) => (
                    <SelectItem key={ch} value={String(ch)}>
                      {ch}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {(recordsByLocation[editRecordLocationId] ?? []).length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                No records for this site.
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              className="psp-button psp-button-primary psp-dialog-continue-btn h-10 px-6 text-sm !bg-[#556F87] text-white hover:!bg-[#556F87]/90"
              onClick={handleGoToEditRecord}
              disabled={!editRecordChainage}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Site audit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="psp-label">Section / subsection</label>
            <Select
              value={auditLocationId || undefined}
              onValueChange={setAuditLocationId}
            >
              <SelectTrigger className="psp-input">
                <SelectValue placeholder="Select section or subsection" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(() => {
              const auditLoc = locations.find((l) => l.id === auditLocationId);
              const auditCompaction = buildCompactionSummary(
                compactionReports.filter((r) => r.location_id === auditLocationId),
              );
              const auditRequirement = getLocationRequirementFor(auditLoc);
              return auditLoc ? (
                <div className="space-y-2 text-xs text-[var(--muted-foreground)]">
                  <p>
                    Start: {auditLoc.start_chainage ?? "—"} / End:{" "}
                    {auditLoc.end_chainage ?? "—"}
                  </p>
                  <p>Direction: {auditLoc.direction ?? "—"}</p>
                  <p>
                    Increment:{" "}
                    {getEffectiveLocationFields(auditLoc).chainage_increment ??
                      CHAINAGE_STEP}
                  </p>
                  <p>Length: {auditLoc.length_m ?? "—"} m</p>
                  <p>
                    Minimum ITR required:{" "}
                    {auditRequirement ?? "—"}
                  </p>
                  <p>Reports READY: {auditCompaction.ready}</p>
                  <p>Reports OPEN: {auditCompaction.open}</p>
                  {auditCompaction.pending.length ? (
                    <p>
                      Pending chainages: {auditCompaction.pending.join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Select a site to view audit details.
                </p>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              className="psp-button psp-button-primary psp-dialog-send-pdf-btn h-10 px-6 text-sm !bg-[#556F87] text-white hover:!bg-[#556F87]/90"
              onClick={handleAuditReportAll}
              disabled={!auditLocationId || loading}
            >
              Send PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sitePickerOpen} onOpenChange={setSitePickerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit site</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {locations.map((loc) => (
              <Button
                key={loc.id}
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setSitePickerOpen(false);
                  openLocationModal("edit", loc.id);
                }}
              >
                {loc.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
 }
