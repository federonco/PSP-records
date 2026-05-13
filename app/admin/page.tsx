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
 import { getBrowserAccessToken, getSupabaseBrowser } from "@/lib/supabase/browser";
 import { Modal } from "@/components/modal";
 import { Button } from "@/components/ui/button";
 import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  id?: string;
  location_id: string | null;
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
  location_id?: string | null;
  source_kind?: "subsection" | "section";
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
  location_id?: string | null;
  subsections: UnifiedSubsectionRow[];
};

type SendQrTarget =
  | { kind: "section"; section: UnifiedSectionRow }
  | { kind: "subsection"; subsection: UnifiedSubsectionRow; sectionName: string };
type Supervisor = { id: string; name: string; company: string | null };

type SupervisorOverviewEntry = {
  id: string;
  name: string;
  company: string | null;
  sections: {
    id: string;
    name: string;
    chainage_start?: number;
    chainage_end?: number;
  }[];
  subsections: {
    id: string;
    name: string;
    parent_section_name: string;
  }[];
};

function formatSectionChainageOverview(
  start?: number,
  end?: number,
): string | null {
  const hasStart = typeof start === "number" && Number.isFinite(start);
  const hasEnd = typeof end === "number" && Number.isFinite(end);
  if (hasStart && hasEnd) return `${start} → ${end}`;
  if (hasStart) return String(start);
  if (hasEnd) return String(end);
  return null;
}

function getSectionFamilyKey(name: string): string | null {
  const direct = /^\s*section\s+(\d+)\s*$/i.exec(name);
  if (direct?.[1]) return direct[1];
  const dotted = /^\s*section\s+(\d+)\.(\d+)\b/i.exec(name);
  if (dotted?.[1]) return dotted[1];
  return null;
}

function isDottedSectionName(name: string): boolean {
  return /^\s*section\s+\d+\.\d+\b/i.test(name);
}

/** In-memory `recordsByLocation` bucket for null `location_id`; must never be used as a real `location_id` in queries or sync. */
const NO_LOCATION_BUCKET_KEY = "__no_location__";

function safeLocationIdsForQuery(ids: string[]): string[] {
  return ids.filter(
    (id) =>
      Boolean(id) && id !== NO_LOCATION_BUCKET_KEY && id.length === 36,
  );
}

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

function itrRequirementFromSectionAppConfig(
  app: Record<string, unknown> | null | undefined,
): number | null {
  if (!app || typeof app !== "object" || Array.isArray(app)) return null;
  const steps = app.steps;
  if (typeof steps === "number" && Number.isFinite(steps)) return steps;
  if (typeof steps === "string" && steps.trim()) {
    const n = Number(steps.trim());
    if (Number.isFinite(n)) return n;
  }
  const listRaw = app.chainage_list_json;
  if (Array.isArray(listRaw) && listRaw.length > 0) return listRaw.length;
  if (typeof listRaw === "string" && listRaw.trim()) {
    try {
      const parsed = JSON.parse(listRaw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.length;
    } catch {
      /* ignore invalid JSON */
    }
  }
  const lenM = app.length_m;
  if (typeof lenM === "number" && Number.isFinite(lenM) && lenM > 0) {
    return Math.max(1, Math.ceil(lenM / 200));
  }
  if (typeof lenM === "string" && lenM.trim()) {
    const n = Number(lenM.trim());
    if (Number.isFinite(n) && n > 0) return Math.max(1, Math.ceil(n / 200));
  }
  return null;
}

function getLocationRequirementFor(
  loc: Location | undefined,
  sectionAppConfig?: Record<string, unknown> | null,
  sectionRow?: Pick<UnifiedSectionRow, "start_ch" | "end_ch"> | null,
): number | null {
  if (loc) {
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
  }
  const fromSection = itrRequirementFromSectionAppConfig(sectionAppConfig ?? undefined);
  if (fromSection !== null) return fromSection;
  if (
    sectionRow &&
    typeof sectionRow.start_ch === "number" &&
    typeof sectionRow.end_ch === "number"
  ) {
    const span = Math.abs(sectionRow.end_ch - sectionRow.start_ch);
    if (span > 0) return Math.ceil(span / 200);
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
  const [reportEmail, setReportEmail] = useState("");
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [itrModalOpen, setItrModalOpen] = useState(false);
  const [sendingAudit, setSendingAudit] = useState(false);
  const [sendingAllItr, setSendingAllItr] = useState(false);
  const [reportScope, setReportScope] = useState<{
    sectionId: string;
    subsectionId: string | null;
    sectionName: string;
  } | null>(null);
  /** Section / subsection compaction panels: default collapsed */
  const [compactionPanelExpanded, setCompactionPanelExpanded] = useState<
    Record<string, boolean>
  >({});
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorNameInput, setSupervisorNameInput] = useState("");
  const [supervisorCompanyInput, setSupervisorCompanyInput] = useState("");
  const [supervisorEditId, setSupervisorEditId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignScope, setAssignScope] = useState<{
    sectionId?: string;
    subsectionId?: string;
    title: string;
  } | null>(null);
  const [assignedSupervisors, setAssignedSupervisors] = useState<Supervisor[]>([]);
  const [assignSupervisorId, setAssignSupervisorId] = useState("");
  const [adminMainTab, setAdminMainTab] = useState("sections");
  const [supervisorOverview, setSupervisorOverview] = useState<
    SupervisorOverviewEntry[]
  >([]);
  const [supervisorOverviewLoading, setSupervisorOverviewLoading] =
    useState(false);
  const [depthConfigOpen, setDepthConfigOpen] = useState(false);
  const [depthSectionId, setDepthSectionId] = useState<string | null>(null);
  const [depthSubsectionId, setDepthSubsectionId] = useState<string | null>(null);
  /** When true, `depthSubsectionId` is a `sections.id` (dotted section shown as child), not `subsections.id`. */
  const [depthSubsectionIsPromotedSection, setDepthSubsectionIsPromotedSection] =
    useState(false);
  const [depthSectionName, setDepthSectionName] = useState("");
  const [depthRanges, setDepthRanges] = useState<
    { from_ch: string; to_ch: string; max_depth_m: string }[]
  >([{ from_ch: "", to_ch: "", max_depth_m: "" }]);
  const locationIdsKey = useMemo(
    () => [...new Set(locations.map((l) => l.id))].sort().join(","),
    [locations],
  );

  const unifiedSectionIdsKey = useMemo(
    () =>
      [...new Set(unifiedSections.map((s) => s.id).filter(Boolean))].sort().join(
        ",",
      ),
    [unifiedSections],
  );

  const normalizedSections = useMemo(() => {
    const cloned = unifiedSections.map((section) => ({
      ...section,
      subsections: (section.subsections ?? []).map((sub) => ({
        ...sub,
        source_kind: sub.source_kind ?? "subsection",
      })),
    }));
    const familyParents = new Map<string, UnifiedSectionRow>();
    for (const section of cloned) {
      const family = getSectionFamilyKey(section.name);
      if (!family || isDottedSectionName(section.name)) continue;
      familyParents.set(family, section);
    }
    const promoted = new Set<string>();
    for (const section of cloned) {
      if (!isDottedSectionName(section.name)) continue;
      const family = getSectionFamilyKey(section.name);
      if (!family) continue;
      const parent = familyParents.get(family);
      if (!parent || parent.id === section.id) continue;
      parent.subsections = [
        ...(parent.subsections ?? []),
        {
          id: section.id,
          name: section.name,
          start_ch: section.start_ch ?? null,
          end_ch: section.end_ch ?? null,
          direction: section.direction ?? null,
          qr_token: section.qr_token ?? null,
          app_config: section.app_config ?? {},
          location_id: section.location_id ?? null,
          source_kind: "section",
        },
      ];
      promoted.add(section.id);
    }
    const output = cloned.filter((section) => !promoted.has(section.id));
    return output.map((section) => ({
      ...section,
      subsections: [...(section.subsections ?? [])].sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? "")),
      ),
    }));
  }, [unifiedSections]);

  const subsectionEditOptions = useMemo(
    () =>
      normalizedSections.flatMap((sec) =>
        (sec.subsections ?? [])
          .filter((sub) => sub.source_kind !== "section")
          .map((sub) => ({
            sub,
            sectionName: sec.name,
          })),
      ),
    [normalizedSections],
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
    const token = await getBrowserAccessToken();
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
    const secs = (payload.sections ?? []) as UnifiedSectionRow[];
    setUnifiedSections(secs);
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[DEBUG sections]",
        secs.map((s) => ({ id: s.id, name: s.name })),
      );
    }
  };

  const loadSupervisors = async () => {
    const token = await getBrowserAccessToken();
    const response = await fetch("/api/psp/supervisors", {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Failed to load supervisors",
        message: payload.error ?? "Unknown error",
      });
      return;
    }
    setSupervisors((payload.supervisors ?? []) as Supervisor[]);
  };

  const loadAssignments = async (scope: { sectionId?: string; subsectionId?: string }) => {
    const token = await getBrowserAccessToken();
    const query = scope.subsectionId
      ? `subsection_id=${scope.subsectionId}`
      : `section_id=${scope.sectionId}`;
    const response = await fetch(`/api/psp/supervisors/assignments?${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Failed to load assignments",
        message: payload.error ?? "Unknown error",
      });
      return;
    }
    setAssignedSupervisors((payload.supervisors ?? []) as Supervisor[]);
  };

  const loadSupervisorOverview = async () => {
    const token = await getBrowserAccessToken();
    if (!token) return;
    setSupervisorOverviewLoading(true);
    try {
      const response = await fetch("/api/psp/supervisors/overview", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        pushToast({
          type: "error",
          title: "Overview failed",
          message:
            typeof payload?.error === "string"
              ? payload.error
              : "Unable to load supervisor assignments overview.",
        });
        setSupervisorOverview([]);
        return;
      }
      setSupervisorOverview(
        Array.isArray(payload) ? (payload as SupervisorOverviewEntry[]) : [],
      );
    } finally {
      setSupervisorOverviewLoading(false);
    }
  };

  useEffect(() => {
    if (!authEmail || adminMainTab !== "supervisors") return;
    void loadSupervisorOverview();
  }, [authEmail, adminMainTab]);

  useEffect(() => {
    if (!authEmail) return;
    loadUnifiedSections();
    loadSupervisors();
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
    const safeIds = safeLocationIdsForQuery(
      [...new Set(locations.map((l) => l.id))].filter(Boolean),
    );
    const sectionIds = unifiedSectionIdsKey.split(",").filter(Boolean);
    if (!safeIds.length && !sectionIds.length) {
      setCompactionReports([]);
      return;
    }
    const selectCols =
      "id,status,block_key,block_index,pending_chainages,pdf_path,location_id,unified_section_id,subsection_id";
    const byLocPromise = safeIds.length
      ? supabase
          .from("psp_reports")
          .select(selectCols)
          .in("location_id", safeIds)
          .eq("report_type", "compaction")
          .order("block_index", { ascending: true })
      : Promise.resolve({
          data: [] as Record<string, unknown>[],
          error: null as null,
        });
    const bySecPromise = sectionIds.length
      ? supabase
          .from("psp_reports")
          .select(selectCols)
          .in("unified_section_id", sectionIds)
          .eq("report_type", "compaction")
          .order("block_index", { ascending: true })
      : Promise.resolve({
          data: [] as Record<string, unknown>[],
          error: null as null,
        });
    const [{ data: dataByLoc, error: errLoc }, { data: dataBySec, error: errSec }] =
      await Promise.all([byLocPromise, bySecPromise]);
    const error = errLoc ?? errSec;
    if (error) {
      pushToast({
        type: "error",
        title: "Failed to load compaction reports",
        message: error.message,
      });
      return;
    }
    const mergedById = new Map<string, CompactionReportRow>();
    for (const row of [...(dataByLoc ?? []), ...(dataBySec ?? [])]) {
      const r = row as CompactionReportRow & { id?: string };
      const k =
        typeof r.id === "string" && r.id.trim()
          ? r.id.trim()
          : `${r.block_key ?? ""}|${r.unified_section_id ?? ""}|${r.subsection_id ?? ""}`;
      if (!mergedById.has(k)) mergedById.set(k, r);
    }
    const reports = [...mergedById.values()];
    const dedupedReports = reports.filter(
      (report, index, self) =>
        index ===
        self.findIndex(
          (r) =>
            r.block_key === report.block_key &&
            r.unified_section_id === report.unified_section_id &&
            (r.subsection_id ?? null) === (report.subsection_id ?? null),
        ),
    );
    setCompactionReports(dedupedReports);
  };

  useEffect(() => {
    if (!authEmail) return;
    const ids = locationIdsKey.split(",").filter(Boolean);
    const safeLocIds = safeLocationIdsForQuery(ids);
    const sectionIds = unifiedSectionIdsKey.split(",").filter(Boolean);
    if (!safeLocIds.length && !sectionIds.length) {
      setRecordsByLocation({});
      return;
    }
    const loadRecords = async () => {
      const byLocPromise = safeLocIds.length
        ? supabase
            .from("psp_records")
            .select(
              "id,location_id,chainage,sign_off_at,unified_section_id,subsection_id",
            )
            .in("location_id", safeLocIds)
            .order("chainage", { ascending: false })
        : Promise.resolve({
            data: [] as Record<string, unknown>[],
            error: null as null,
          });
      const bySecPromise = sectionIds.length
        ? supabase
            .from("psp_records")
            .select(
              "id,location_id,chainage,sign_off_at,unified_section_id,subsection_id",
            )
            .in("unified_section_id", sectionIds)
            .order("chainage", { ascending: false })
        : Promise.resolve({
            data: [] as Record<string, unknown>[],
            error: null as null,
          });
      const [{ data: dataByLoc, error: errLoc }, { data: dataBySec, error: errSec }] =
        await Promise.all([byLocPromise, bySecPromise]);
      const error = errLoc ?? errSec;
      if (error) {
        pushToast({
          type: "error",
          title: "Failed to load records",
          message: error.message,
        });
        return;
      }
      const data = [...(dataByLoc ?? []), ...(dataBySec ?? [])];
      if (process.env.NODE_ENV === "development") {
        console.log("[DEBUG psp_records]", {
          fetchedCount: data.length,
          locationIdsUsed: safeLocIds,
          unifiedSectionIdsUsed: sectionIds,
          sampleRecord: data[0],
          nullLocationIdCount: data.filter((r) => {
            const lid = (r as { location_id?: string | null }).location_id;
            return lid == null || (typeof lid === "string" && !lid.trim());
          }).length,
        });
      }
      const mergedById = new Map<string, RecordRow>();
      for (const row of data) {
        const rec = row as RecordRow & { id?: string };
        const dedupeKey =
          typeof rec.id === "string" && rec.id.trim()
            ? rec.id
            : `${rec.unified_section_id ?? ""}|${rec.subsection_id ?? ""}|${rec.chainage}`;
        if (!mergedById.has(dedupeKey)) mergedById.set(dedupeKey, rec);
      }
      const grouped: Record<string, RecordRow[]> = {};
      for (const id of safeLocIds) {
        grouped[id] = [];
      }
      const bucketFor = (lid: string | null | undefined) => {
        if (typeof lid === "string" && lid.trim()) return lid.trim();
        return NO_LOCATION_BUCKET_KEY;
      };
      for (const row of mergedById.values()) {
        const key = bucketFor(row.location_id);
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row);
      }
      setRecordsByLocation(grouped);
    };
    void loadRecords();
  }, [
    authEmail,
    locationIdsKey,
    unifiedSectionIdsKey,
    pushToast,
    supabase,
  ]);

  useEffect(() => {
    if (!authEmail) return;
    if (!locationIdsKey && !unifiedSectionIdsKey) return;
    void loadCompactionReports();
  }, [authEmail, locationIdsKey, unifiedSectionIdsKey]);

  const syncCompactionReports = async (args: {
    locationId: string;
    locationName: string;
    sectionId?: string | null;
    subsectionId?: string | null;
  }) => {
    const { locationName, sectionId, subsectionId } = args;
    const safeLocationId =
      args.locationId &&
      args.locationId !== NO_LOCATION_BUCKET_KEY &&
      args.locationId.length === 36
        ? args.locationId
        : null;
    const sec = sectionId?.trim() || null;
    const sub = subsectionId?.trim() || null;
    if (!authEmail) return;
    if (!safeLocationId && !sec && !sub) return;
    setSyncingLocationId(safeLocationId ?? sec ?? sub ?? "");
    const token = await getBrowserAccessToken();
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
        locationId: safeLocationId,
        locationName,
        sectionId: sec,
        subsectionId: sub,
      }),
    });
    const payload = await response.json();
    console.log("[DEBUG SYNC RESPONSE]", JSON.stringify(payload, null, 2));
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
    const token = await getBrowserAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before sending.",
      });
      return;
    }
    setSendQrLoading(true);
    const subsectionUsesSectionRoute =
      sendQrTarget.kind === "subsection" &&
      sendQrTarget.subsection.source_kind === "section";
    const id =
      sendQrTarget.kind === "section"
        ? sendQrTarget.section.id
        : sendQrTarget.subsection.id;
    const base =
      sendQrTarget.kind === "section" || subsectionUsesSectionRoute
        ? "/api/psp/sections"
        : "/api/psp/subsections";
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
      sendQrTarget.kind === "section" || subsectionUsesSectionRoute
        ? await fetch("/api/psp/sections/send-qr", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              sectionId:
                sendQrTarget.kind === "section"
                  ? sendQrTarget.section.id
                  : sendQrTarget.subsection.id,
              email: trimmed,
            }),
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
    const token = await getBrowserAccessToken();
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
    if (!normalizedSections.length) {
      pushToast({
        type: "info",
        title: "No sections",
        message: "No sections are available yet.",
      });
      return;
    }
    setCreateSubSectionId(normalizedSections[0].id);
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

    const token = await getBrowserAccessToken();
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
    const token = await getBrowserAccessToken();
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
    const token = await getBrowserAccessToken();
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
    const token = await getBrowserAccessToken();
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
    const token = await getBrowserAccessToken();
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

  const openAuditModal = (sectionId: string, sectionName: string, subsectionId?: string) => {
    setReportScope({
      sectionId,
      subsectionId: subsectionId ?? null,
      sectionName,
    });
    setReportEmail(authEmail ?? "");
    setAuditModalOpen(true);
  };

  const openItrModal = (sectionId: string, sectionName: string, subsectionId?: string) => {
    setReportScope({
      sectionId,
      subsectionId: subsectionId ?? null,
      sectionName,
    });
    setReportEmail(authEmail ?? "");
    setItrModalOpen(true);
  };

  const handleSendAuditByScope = async () => {
    if (!reportScope) return;
    const token = await getBrowserAccessToken();
    if (!token) {
      pushToast({ type: "error", title: "Sign in required" });
      return;
    }
    setSendingAudit(true);
    try {
      const params = new URLSearchParams({
        unified_section_id: reportScope.sectionId,
        recipient_email: reportEmail.trim(),
      });
      if (reportScope.subsectionId) {
        params.set("subsection_id", reportScope.subsectionId);
      }
      const response = await fetch(`/api/psp/audit-report/email?${params.toString()}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to send audit");
      pushToast({
        type: "success",
        title: "Audit report sent",
        message: `Report sent to ${reportEmail.trim()}`,
      });
      setAuditModalOpen(false);
      setReportScope(null);
    } catch (error) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSendingAudit(false);
    }
  };

  const handleSendAllItr = async () => {
    if (!reportScope) return;
    const token = await getBrowserAccessToken();
    if (!token) {
      pushToast({ type: "error", title: "Sign in required" });
      return;
    }
    setSendingAllItr(true);
    try {
      const response = await fetch("/api/psp/compaction-reports/email-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          unified_section_id: reportScope.sectionId,
          subsection_id: reportScope.subsectionId,
          recipient_email: reportEmail.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to send reports");
      pushToast({
        type: "success",
        title: "All ITR sent",
        message: `Report sent to ${reportEmail.trim()}`,
      });
      setItrModalOpen(false);
      setReportScope(null);
    } catch (error) {
      pushToast({
        type: "error",
        title: "Send failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSendingAllItr(false);
    }
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

    if (!(await getBrowserAccessToken())) {
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

  const handleSaveSupervisor = async () => {
    const name = supervisorNameInput.trim();
    if (!name) return;
    const token = await getBrowserAccessToken();
    const isEdit = Boolean(supervisorEditId);
    const response = await fetch(
      isEdit ? `/api/psp/supervisors/${supervisorEditId}` : "/api/psp/supervisors",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name,
          company: supervisorCompanyInput.trim() || null,
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Supervisor save failed",
        message: payload.error ?? "Unknown error",
      });
      return;
    }
    setSupervisorNameInput("");
    setSupervisorCompanyInput("");
    setSupervisorEditId(null);
    await loadSupervisors();
  };

  const handleDeleteSupervisor = async (id: string) => {
    const token = await getBrowserAccessToken();
    const response = await fetch(`/api/psp/supervisors/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Supervisor delete failed",
        message: payload.error ?? "Unknown error",
      });
      return;
    }
    await loadSupervisors();
    if (adminMainTab === "supervisors") {
      await loadSupervisorOverview();
    }
  };

  const openAssignSupervisors = async (scope: {
    sectionId?: string;
    subsectionId?: string;
    title: string;
  }) => {
    setAssignScope(scope);
    setAssignOpen(true);
    setAssignSupervisorId("");
    await loadAssignments(scope);
  };

  const handleAssignSupervisor = async () => {
    if (!assignScope || !assignSupervisorId) return;
    const token = await getBrowserAccessToken();
    const response = await fetch("/api/psp/supervisors/assignments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        supervisor_id: assignSupervisorId,
        section_id: assignScope.sectionId,
        subsection_id: assignScope.subsectionId,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Assignment failed",
        message: payload.error ?? "Unknown error",
      });
      return;
    }
    await loadAssignments(assignScope);
    await loadSupervisorOverview();
  };

  const handleUnassignSupervisor = async (supervisorId: string) => {
    if (!assignScope) return;
    const token = await getBrowserAccessToken();
    const response = await fetch("/api/psp/supervisors/assignments", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        supervisor_id: supervisorId,
        section_id: assignScope.sectionId,
        subsection_id: assignScope.subsectionId,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Remove assignment failed",
        message: payload.error ?? "Unknown error",
      });
      return;
    }
    await loadAssignments(assignScope);
    await loadSupervisorOverview();
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

  function calcLayers(depthM: number): number {
    const depthMm = depthM * 1000;
    const layers = Math.ceil((depthMm - 150) / 900);
    return Math.max(layers, 1);
  }

  function buildDepthRowsFromAppConfig(
    appConfig: Record<string, unknown> | null | undefined,
  ): { from_ch: string; to_ch: string; max_depth_m: string }[] {
    const raw =
      appConfig &&
      typeof appConfig === "object" &&
      !Array.isArray(appConfig)
        ? appConfig.depth_ranges
        : null;
    const parsed = Array.isArray(raw)
      ? raw
          .map((r) => ({
            from_ch: String((r as Record<string, unknown>).from_ch ?? ""),
            to_ch: String((r as Record<string, unknown>).to_ch ?? ""),
            max_depth_m: (() => {
              const mm = Number(
                (r as Record<string, unknown>).max_depth_mm ?? Number.NaN,
              );
              if (!Number.isFinite(mm)) return "";
              return String(mm / 1000);
            })(),
          }))
          .filter((r) => r.from_ch || r.to_ch || r.max_depth_m)
      : [];
    const normalized = parsed.map((r) => {
      const depthM = Number(r.max_depth_m);
      if (Number.isFinite(depthM)) {
        const snappedLayers = calcLayers(depthM);
        const snappedDepthM = (150 + snappedLayers * 900) / 1000;
        return { ...r, max_depth_m: String(snappedDepthM) };
      }
      return r;
    });
    return normalized.length
      ? normalized
      : [{ from_ch: "", to_ch: "", max_depth_m: "" }];
  }

  const openDepthConfig = (section: UnifiedSectionRow) => {
    setDepthSubsectionId(null);
    setDepthSubsectionIsPromotedSection(false);
    setDepthSectionId(section.id);
    setDepthSectionName(section.name);
    const cfg =
      section.app_config &&
      typeof section.app_config === "object" &&
      !Array.isArray(section.app_config)
        ? (section.app_config as Record<string, unknown>)
        : null;
    setDepthRanges(buildDepthRowsFromAppConfig(cfg));
    setDepthConfigOpen(true);
  };

  const openDepthConfigForSubsection = (
    section: UnifiedSectionRow,
    sub: UnifiedSubsectionRow,
  ) => {
    setDepthSubsectionId(sub.id);
    setDepthSubsectionIsPromotedSection(sub.source_kind === "section");
    setDepthSectionId(section.id);
    setDepthSectionName(`${section.name} — ${sub.name}`);
    const subCfg =
      sub.app_config &&
      typeof sub.app_config === "object" &&
      !Array.isArray(sub.app_config)
        ? (sub.app_config as Record<string, unknown>)
        : null;
    setDepthRanges(buildDepthRowsFromAppConfig(subCfg));
    setDepthConfigOpen(true);
  };

  const depthValidation = useMemo(() => {
    const errorsByIndex: Record<number, string[]> = {};
    const spans = depthRanges.map((r, index) => {
      const from = Number(r.from_ch);
      const to = Number(r.to_ch);
      const depthM = Number(r.max_depth_m);
      const rowErrors: string[] = [];
      if (!r.from_ch || !r.to_ch || !r.max_depth_m) {
        rowErrors.push("All fields are required.");
      }
      if (Number.isFinite(from) && Number.isFinite(to) && from >= to) {
        rowErrors.push("From CH must be lower than To CH.");
      }
      if (Number.isFinite(depthM) && (depthM < 0.1 || depthM > 10)) {
        rowErrors.push("Depth must be between 0.1m and 10.0m");
      }
      if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(depthM)) {
        rowErrors.push("Values must be numeric.");
      }
      errorsByIndex[index] = rowErrors;
      return { index, from, to };
    });

    for (let i = 0; i < spans.length; i += 1) {
      for (let j = i + 1; j < spans.length; j += 1) {
        const a = spans[i];
        const b = spans[j];
        if (
          Number.isFinite(a.from) &&
          Number.isFinite(a.to) &&
          Number.isFinite(b.from) &&
          Number.isFinite(b.to) &&
          a.from < b.to &&
          b.from < a.to
        ) {
          errorsByIndex[a.index] = [
            ...(errorsByIndex[a.index] ?? []),
            "Overlaps with another range.",
          ];
          errorsByIndex[b.index] = [
            ...(errorsByIndex[b.index] ?? []),
            "Overlaps with another range.",
          ];
        }
      }
    }

    const hasErrors = Object.values(errorsByIndex).some((list) => list.length > 0);
    return { errorsByIndex, hasErrors };
  }, [depthRanges]);

  const saveDepthConfig = async () => {
    const targetId = depthSubsectionId ?? depthSectionId;
    if (!targetId || depthValidation.hasErrors) return;
    const token = await getBrowserAccessToken();
    if (!token) return;
    const payload = depthRanges
      .map((r) => ({
        from_ch: Number(r.from_ch),
        to_ch: Number(r.to_ch),
        max_depth_mm: Number(r.max_depth_m) * 1000,
      }))
      .filter(
        (r) =>
          Number.isFinite(r.from_ch) &&
          Number.isFinite(r.to_ch) &&
          Number.isFinite(r.max_depth_mm),
      );
    const depthSaveUrl =
      depthSubsectionId && !depthSubsectionIsPromotedSection
        ? `/api/psp/subsections/${depthSubsectionId}/config`
        : `/api/psp/sections/${
            depthSubsectionId && depthSubsectionIsPromotedSection
              ? depthSubsectionId
              : depthSectionId
          }/config`;
    const response = await fetch(depthSaveUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ depth_ranges: payload }),
    });
    const result = await response.json();
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Depth config failed",
        message: result.error ?? "Unable to save depth ranges",
      });
      return;
    }
    pushToast({ type: "success", title: "Depth ranges saved" });
    setDepthConfigOpen(false);
    await loadUnifiedSections();
  };

  const resolveSectionScopeSync = (
    section: UnifiedSectionRow,
    scopeReports: CompactionReportRow[],
  ): {
    id: string;
    name: string;
    sectionId: string;
    subsectionId: null;
  } | null => {
    const sectionLocationId =
      (typeof section.location_id === "string" && section.location_id.trim()
        ? section.location_id.trim()
        : null) ??
      (section.app_config &&
      typeof section.app_config === "object" &&
      !Array.isArray(section.app_config) &&
      typeof (section.app_config as Record<string, unknown>).location_id === "string" &&
      String((section.app_config as Record<string, unknown>).location_id).trim()
        ? String((section.app_config as Record<string, unknown>).location_id).trim()
        : null);
    if (sectionLocationId) {
      const loc = locations.find((l) => l.id === sectionLocationId);
      return {
        id: sectionLocationId,
        name: loc?.name ?? sectionLocationId,
        sectionId: section.id,
        subsectionId: null,
      };
    }
    const first = scopeReports[0];
    if (first?.location_id) {
      const loc = locations.find((l) => l.id === first.location_id);
      return {
        id: first.location_id,
        name: loc?.name ?? first.location_id,
        sectionId: section.id,
        subsectionId: null,
      };
    }
    for (const lid of Object.keys(recordsByLocation)) {
      if (lid === NO_LOCATION_BUCKET_KEY) continue;
      const rows = recordsByLocation[lid] ?? [];
      if (
        rows.some(
          (r) =>
            r.unified_section_id === section.id && !r.subsection_id,
        )
      ) {
        const loc = locations.find((l) => l.id === lid);
        return {
          id: lid,
          name: loc?.name ?? lid,
          sectionId: section.id,
          subsectionId: null,
        };
      }
    }
    // If direct records for this section exist but only under __no_location__,
    // don't fall through to location-based guesses — return with null id
    const hasNullLocationRecords = (
      recordsByLocation[NO_LOCATION_BUCKET_KEY] ?? []
    ).some(
      (r) => r.unified_section_id === section.id && !r.subsection_id,
    );
    if (hasNullLocationRecords) {
      return {
        id: NO_LOCATION_BUCKET_KEY,
        name: section.name,
        sectionId: section.id,
        subsectionId: null,
      };
    }
    for (const loc of locations) {
      const raw = loc.app_config;
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        const uid = (raw as Record<string, unknown>).unified_section_id;
        if (typeof uid === "string" && uid.trim() === section.id) {
          return {
            id: loc.id,
            name: loc.name,
            sectionId: section.id,
            subsectionId: null,
          };
        }
      }
    }
    const firstLocation = locations[0];
    if (firstLocation) {
      return {
        id: firstLocation.id,
        name: firstLocation.name,
        sectionId: section.id,
        subsectionId: null,
      };
    }
    return null;
  };

  const resolveSubsectionScopeSync = (
    sub: UnifiedSubsectionRow,
    sectionId: string,
    scopeReports: CompactionReportRow[],
  ): {
    id: string;
    name: string;
    sectionId: string;
    subsectionId: string;
  } | null => {
    const fromRow =
      typeof sub.location_id === "string" && sub.location_id.trim()
        ? sub.location_id.trim()
        : null;
    const fromCfg = locationIdFromSubAppConfig(sub.app_config);
    const linkedLocationId = fromRow ?? fromCfg;
    if (linkedLocationId) {
      const loc = locations.find((l) => l.id === linkedLocationId);
      return {
        id: linkedLocationId,
        name: loc?.name ?? linkedLocationId,
        sectionId,
        subsectionId: sub.id,
      };
    }
    const first = scopeReports[0];
    if (first?.location_id) {
      const loc = locations.find((l) => l.id === first.location_id);
      return {
        id: first.location_id,
        name: loc?.name ?? first.location_id,
        sectionId,
        subsectionId: sub.id,
      };
    }
    // Fallback: infer location from loaded records for this subsection.
    for (const lid of Object.keys(recordsByLocation)) {
      if (lid === NO_LOCATION_BUCKET_KEY) continue;
      const rows = recordsByLocation[lid] ?? [];
      if (rows.some((r) => r.subsection_id === sub.id)) {
        const loc = locations.find((l) => l.id === lid);
        return {
          id: lid,
          name: loc?.name ?? lid,
          sectionId,
          subsectionId: sub.id,
        };
      }
    }
    const hasNullLocationSubRecords = (
      recordsByLocation[NO_LOCATION_BUCKET_KEY] ?? []
    ).some((r) => r.subsection_id === sub.id);
    if (hasNullLocationSubRecords) {
      return {
        id: NO_LOCATION_BUCKET_KEY,
        name: sub.name,
        sectionId,
        subsectionId: sub.id,
      };
    }
    const firstLocation = locations[0];
    if (firstLocation) {
      return {
        id: firstLocation.id,
        name: firstLocation.name,
        sectionId,
        subsectionId: sub.id,
      };
    }
    return null;
  };

  const renderCompactionScopePanel = (args: {
    scopeKey: string;
    titleText: string;
    variant: "section" | "subsection";
    reports: CompactionReportRow[];
    locRecords: RecordRow[];
    sectionAppConfigForItr?: Record<string, unknown> | null;
    sectionRowForItr?: Pick<UnifiedSectionRow, "start_ch" | "end_ch"> | null;
    subsectionChainageForItr?: { start: number; end: number } | null;
    syncTarget: {
      id: string;
      name: string;
      sectionId: string;
      subsectionId: string | null;
    } | null;
  }) => {
    const {
      scopeKey,
      titleText,
      variant,
      reports: scopeReports,
      locRecords,
      sectionAppConfigForItr,
      sectionRowForItr,
      subsectionChainageForItr,
      syncTarget,
    } = args;

    const compactionSummary = buildCompactionSummary(scopeReports);
    const locForRequirement = syncTarget
      ? locations.find((l) => l.id === syncTarget.id)
      : undefined;
    let locationRequirement = getLocationRequirementFor(
      locForRequirement,
      sectionAppConfigForItr,
      sectionRowForItr,
    );
    if (
      locationRequirement === null &&
      subsectionChainageForItr &&
      typeof subsectionChainageForItr.start === "number" &&
      typeof subsectionChainageForItr.end === "number"
    ) {
      const length = Math.abs(
        subsectionChainageForItr.end - subsectionChainageForItr.start,
      );
      if (length > 0) {
        locationRequirement = Math.ceil(length / 200);
      }
    }
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

    const syncId = (() => {
      if (!syncTarget) return null;
      const raw = syncTarget.id;
      if (
        raw &&
        raw !== NO_LOCATION_BUCKET_KEY &&
        raw.length === 36
      ) {
        return raw;
      }
      return syncTarget.subsectionId ?? syncTarget.sectionId ?? null;
    })();
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
              syncCompactionReports({
                locationId: syncTarget.id,
                locationName: syncTarget.name,
                sectionId: syncTarget.sectionId,
                subsectionId: syncTarget.subsectionId,
              })
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] px-4 text-sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (syncTarget?.subsectionId) {
                    params.set("subsection", syncTarget.subsectionId);
                  }
                  router.push(
                    `/admin/records/${syncTarget?.sectionId ?? ""}${params.toString() ? `?${params.toString()}` : ""}`,
                  );
                }}
                disabled={!syncTarget}
              >
                View Records
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] px-4 text-sm border-0 drainer-button-accent"
                onClick={() =>
                  syncTarget &&
                  openAuditModal(syncTarget.sectionId, titleText, syncTarget.subsectionId ?? undefined)
                }
                disabled={!syncTarget}
              >
                Send Audit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] px-4 text-sm border-0 drainer-button-accent"
                onClick={() =>
                  syncTarget &&
                  openItrModal(syncTarget.sectionId, titleText, syncTarget.subsectionId ?? undefined)
                }
                disabled={!syncTarget}
              >
                Send All ITR
              </Button>
            </div>
            <div className="mb-3 rounded-[var(--radius)] border border-[var(--border)]/70 bg-[var(--surface)] p-3 text-[var(--ink)] shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
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
              <div className="max-h-[280px] space-y-3 overflow-y-auto rounded-[12px] border border-[var(--border)]/60 bg-[var(--surface)] p-2 pr-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]">
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

        <Tabs
          value={adminMainTab}
          onValueChange={setAdminMainTab}
          className="w-full"
        >
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="sections">Sections</TabsTrigger>
            <TabsTrigger value="supervisors">Supervisors</TabsTrigger>
          </TabsList>
          <TabsContent value="sections" className="mt-4 space-y-4">
          {normalizedSections.length === 0 ? (
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
                                disabled={!authEmail || !normalizedSections.length}
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
          {normalizedSections.map((section) => {
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
                              disabled={!authEmail || !normalizedSections.length}
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
                        <DropdownMenuItem
                          onClick={() => openDepthConfig(section)}
                          disabled={!authEmail}
                        >
                          Configure Depth Ranges
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            void openAssignSupervisors({
                              sectionId: section.id,
                              title: section.name,
                            })
                          }
                          disabled={!authEmail}
                        >
                          Assign Supervisors
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">
                  {renderCompactionScopePanel({
                    scopeKey: `section-root-${section.id}`,
                    titleText: section.name,
                    variant: "section",
                    reports: sectionScopeReports,
                    locRecords: sectionScopeRecords,
                    sectionAppConfigForItr: section.app_config,
                    sectionRowForItr: section,
                    subsectionChainageForItr: null,
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
                      section.id,
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
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 w-8 shrink-0 border-[#E6EDF3] bg-[#E6EDF3] px-0 text-xs hover:bg-[#F7F9FB] hover:border-[#F7F9FB] active:bg-[#F7F9FB] active:border-[#F7F9FB]"
                                  disabled={!authEmail}
                                >
                                  ⋮
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    openDepthConfigForSubsection(section, sub)
                                  }
                                  disabled={!authEmail}
                                >
                                  Configure Depth Ranges
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    void openAssignSupervisors({
                                      subsectionId: sub.id,
                                      title: `${section.name} — ${sub.name}`,
                                    })
                                  }
                                  disabled={!authEmail}
                                >
                                  Assign Supervisors
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        {renderCompactionScopePanel({
                          scopeKey: `subsection-${sub.id}`,
                          titleText: sub.name,
                          variant: "subsection",
                          reports: subScopeReports,
                          locRecords: subScopeRecords,
                          sectionAppConfigForItr: {
                            ...section.app_config,
                            ...(sub.app_config &&
                            typeof sub.app_config === "object" &&
                            !Array.isArray(sub.app_config)
                              ? sub.app_config
                              : {}),
                          },
                          sectionRowForItr: section,
                          subsectionChainageForItr:
                            typeof sub.start_ch === "number" &&
                            typeof sub.end_ch === "number"
                              ? { start: sub.start_ch, end: sub.end_ch }
                              : null,
                          syncTarget: subSyncTarget,
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {authEmail && !normalizedSections.length && !locations.length ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No sections or sites loaded. Create a site to get started.
            </p>
          ) : null}
          </TabsContent>
          <TabsContent value="supervisors" className="mt-4 space-y-4">
          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-[var(--ink)]">Supervisors</h2>
            </div>
            <div className="mt-3 grid gap-2">
              {supervisors.map((sup) => (
                <div key={sup.id} className="flex items-center gap-2 rounded-[12px] bg-[var(--surface-alt)] p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">{sup.name}</p>
                    <p className="truncate text-xs text-[var(--muted-foreground)]">{sup.company ?? "—"}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSupervisorEditId(sup.id);
                      setSupervisorNameInput(sup.name);
                      setSupervisorCompanyInput(sup.company ?? "");
                    }}
                  >
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void handleDeleteSupervisor(sup.id)}>
                    Delete
                  </Button>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                className="psp-input"
                value={supervisorNameInput}
                onChange={(e) => setSupervisorNameInput(e.target.value)}
                placeholder="Supervisor name"
              />
              <Input
                className="psp-input"
                value={supervisorCompanyInput}
                onChange={(e) => setSupervisorCompanyInput(e.target.value)}
                placeholder="Company (optional)"
              />
              <Button className="psp-button psp-button-primary" onClick={() => void handleSaveSupervisor()}>
                {supervisorEditId ? "Update Supervisor" : "Add Supervisor"}
              </Button>
            </div>
          </div>

          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <h2 className="text-lg font-bold text-[var(--ink)]">
              Supervisor Assignments Overview
            </h2>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">
              Sections and subsections linked to each supervisor.
            </p>
            {supervisorOverviewLoading ? (
              <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                Loading…
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {supervisorOverview.map((row) => {
                  const hasAny =
                    row.sections.length > 0 || row.subsections.length > 0;
                  return (
                    <div
                      key={row.id}
                      className="rounded-[14px] border border-[var(--border)]/80 bg-[var(--surface-alt)] p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--ink)]">
                            {row.name}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {row.company?.trim()
                              ? row.company
                              : "No company"}
                          </p>
                        </div>
                        {!hasAny ? (
                          <Badge variant="outline" className="shrink-0 text-[var(--muted-foreground)]">
                            Unassigned
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-2 text-xs">
                        <div>
                          <p className="font-semibold text-[var(--ink)]">
                            Sections
                          </p>
                          {row.sections.length ? (
                            <ul className="mt-1 space-y-1 text-[var(--muted-foreground)]">
                              {row.sections.map((sec) => {
                                const ch = formatSectionChainageOverview(
                                  sec.chainage_start,
                                  sec.chainage_end,
                                );
                                return (
                                  <li key={sec.id}>
                                    <span className="font-medium text-[var(--ink)]">
                                      {sec.name}
                                    </span>
                                    {ch ? (
                                      <span className="text-[var(--muted-foreground)]">
                                        {" "}
                                        · Chainage: {ch}
                                      </span>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : (
                            <p className="mt-1 text-[var(--muted-foreground)]">
                              —
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--ink)]">
                            Subsections
                          </p>
                          {row.subsections.length ? (
                            <ul className="mt-1 space-y-1 text-[var(--muted-foreground)]">
                              {row.subsections.map((sub) => (
                                <li key={sub.id}>
                                  <span className="font-medium text-[var(--ink)]">
                                    {sub.name}
                                  </span>
                                  <span className="text-[var(--muted-foreground)]">
                                    {" "}
                                    · {sub.parent_section_name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-[var(--muted-foreground)]">
                              —
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          </TabsContent>
        </Tabs>

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
                  {normalizedSections.map((s) => (
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

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Supervisors — {assignScope?.title ?? ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              {assignedSupervisors.map((sup) => (
                <div key={sup.id} className="flex items-center justify-between rounded-[10px] bg-[var(--surface-alt)] px-3 py-2">
                  <p className="text-sm">{sup.name}</p>
                  <Button variant="ghost" size="sm" onClick={() => void handleUnassignSupervisor(sup.id)}>
                    ✕
                  </Button>
                </div>
              ))}
              {!assignedSupervisors.length ? (
                <p className="text-xs text-[var(--muted-foreground)]">No supervisors assigned.</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Select value={assignSupervisorId} onValueChange={setAssignSupervisorId}>
                <SelectTrigger className="psp-input">
                  <SelectValue placeholder="Select supervisor" />
                </SelectTrigger>
                <SelectContent>
                  {supervisors.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void handleAssignSupervisor()} disabled={!assignSupervisorId}>
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={depthConfigOpen}
        onOpenChange={(open) => {
          setDepthConfigOpen(open);
          if (!open) {
            setDepthSubsectionId(null);
            setDepthSubsectionIsPromotedSection(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure Depth Ranges — {depthSectionName}</DialogTitle>
            <p className="text-xs text-[var(--muted-foreground)]">
              Define max excavation depth by chainage range. Layers are calculated
              automatically (default: 3 layers for the entire section).
            </p>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
              <span className="font-medium text-[var(--ink)]">
                Default (entire section):
              </span>{" "}
              3 layers
            </div>
            <div className="overflow-x-auto rounded-[10px] border border-[var(--border)]">
              <table className="min-w-full text-xs">
                <thead className="bg-[var(--surface-alt)]">
                  <tr>
                    <th className="px-2 py-2 text-left">From CH (m)</th>
                    <th className="px-2 py-2 text-left">To CH (m)</th>
                    <th className="px-2 py-2 text-left">Max Depth (m)</th>
                    <th className="px-2 py-2 text-left">Layers (auto)</th>
                    <th className="px-2 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {depthRanges.map((range, index) => {
                    const depthM = Number(range.max_depth_m);
                    const layers = Number.isFinite(depthM) ? calcLayers(depthM) : 3;
                    const rowErrors = depthValidation.errorsByIndex[index] ?? [];
                    const rowHasError = rowErrors.length > 0;
                    const layerTone =
                      layers <= 2
                        ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                        : layers === 3
                          ? "bg-[#DBEAFE] text-[#1D4ED8]"
                          : layers === 4
                            ? "bg-[#FFEDD5] text-[#C2410C]"
                            : "bg-[#FEE2E2] text-[#B91C1C]";
                    return (
                      <tr key={`${index}-${range.from_ch}`} className="border-t border-[var(--border)]">
                        <td className="px-2 py-2 align-top">
                          <Input
                            type="number"
                            step="any"
                            className={`psp-input ${rowHasError ? "border-[#DC2626]" : ""}`}
                            value={range.from_ch}
                            onChange={(e) =>
                              setDepthRanges((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, from_ch: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Input
                            type="number"
                            step="any"
                            className={`psp-input ${rowHasError ? "border-[#DC2626]" : ""}`}
                            value={range.to_ch}
                            onChange={(e) =>
                              setDepthRanges((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, to_ch: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Input
                            type="number"
                            step="any"
                            className={`psp-input ${rowHasError ? "border-[#DC2626]" : ""}`}
                            value={range.max_depth_m}
                            onChange={(e) =>
                              setDepthRanges((prev) =>
                                prev.map((r, i) =>
                                  i === index ? { ...r, max_depth_m: e.target.value } : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${layerTone}`}>
                            {layers} layer{layers === 1 ? "" : "s"}
                          </span>
                          {rowHasError ? (
                            <p className="mt-1 text-[10px] text-[#DC2626]">
                              {rowErrors[0]}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDepthRanges((prev) => prev.filter((_, i) => i !== index))
                            }
                          >
                            ✕
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button
              variant="outline"
              onClick={() =>
                setDepthRanges((prev) => [
                  ...prev,
                  { from_ch: "", to_ch: "", max_depth_m: "" },
                ])
              }
            >
              Add range
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepthConfigOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void saveDepthConfig()}
              disabled={depthValidation.hasErrors}
            >
              Save
            </Button>
          </DialogFooter>
          <p className="text-[10px] text-[var(--muted-foreground)]">
            Layer calculation: 1 layer ≈ 900mm (150mm offset + 3 × 300mm lifts)
          </p>
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

      <Dialog open={auditModalOpen} onOpenChange={setAuditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send report to</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Audit report: This report contains all the raw data for the selected section.
            </p>
            <Input
              type="email"
              placeholder="Email address"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              className="psp-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendAuditByScope}
              disabled={!isValidEmail(reportEmail) || sendingAudit}
              className="bg-[#B8682A] text-white border-0 hover:bg-[#A35D26]"
            >
              {sendingAudit ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itrModalOpen} onOpenChange={setItrModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send report to</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              All ITRs report: This sends all ITR PDFs for the selected section.
            </p>
            <Input
              type="email"
              placeholder="Email address"
              value={reportEmail}
              onChange={(e) => setReportEmail(e.target.value)}
              className="psp-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItrModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendAllItr}
              disabled={!isValidEmail(reportEmail) || sendingAllItr}
              className="bg-[#B8682A] text-white border-0 hover:bg-[#A35D26]"
            >
              {sendingAllItr ? "Sending…" : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
 }
