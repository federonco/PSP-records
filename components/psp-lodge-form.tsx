 "use client";

 import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
 import { useEffect, useMemo, useState } from "react";
 import { useRouter } from "next/navigation";
 import { AuthPanel } from "@/components/auth-panel";
 import { ConfirmButton } from "@/components/confirm-button";
 import {
   SignaturePad,
   SignaturePreview,
   type SignatureStrokes,
 } from "@/components/signature-pad";
 import { useToast } from "@/components/toast";
 import { CHAINAGE_STEP } from "@/lib/psp";
import {
  getDepthLiftPlanForChainage,
  getLayerFieldKeysForLayerCount,
  resolveDepthRangesForScope,
  type LiftSuffix,
} from "@/lib/psp-depth";
import {
  getEffectiveLocationFields,
  LOCATION_LIST_SELECT,
  mergeLocationAppConfig,
} from "@/lib/location-app-config";
 import { getBrowserAccessToken, getSupabaseBrowser } from "@/lib/supabase/browser";

type ChainageScope = {
  start: number;
  end: number;
  direction: "backwards" | "onwards";
  increment: number;
};

function parseChainageIncrement(appConfig: unknown): number {
  if (!appConfig || typeof appConfig !== "object" || Array.isArray(appConfig)) {
    return CHAINAGE_STEP;
  }
  const raw = (appConfig as Record<string, unknown>).chainage_increment;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : CHAINAGE_STEP;
}

/** Next chainage within [lo, hi]; snaps to exact end when step would overshoot. Null = range done. */
function nextChainageInScope(
  current: number,
  scope: ChainageScope,
): number | null {
  const hi = Math.max(scope.start, scope.end);
  const lo = Math.min(scope.start, scope.end);
  const step = scope.increment;
  if (scope.direction === "backwards") {
    const candidate = current - step;
    if (candidate >= lo) return candidate;
    if (current > lo) return lo;
    return null;
  }
  const candidate = current + step;
  if (candidate <= hi) return candidate;
  if (current < hi) return hi;
  return null;
}

function clampChainageToScope(value: number, scope: ChainageScope): number {
  const hi = Math.max(scope.start, scope.end);
  const lo = Math.min(scope.start, scope.end);
  return Math.min(hi, Math.max(lo, value));
}

function isChainageInScope(value: number, scope: ChainageScope): boolean {
  const hi = Math.max(scope.start, scope.end);
  const lo = Math.min(scope.start, scope.end);
  return value >= lo && value <= hi;
}
 import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, X } from "lucide-react";

function liftMmLabel(layerIndex0: number, liftIndex0: number): string {
  const start = 150 + layerIndex0 * 900 + liftIndex0 * 300;
  const end = start + 300;
  return `${start}-${end}mm`;
}

function maxLayerIndexFromLayers(obj: Record<string, unknown> | null): number {
  let m = 0;
  if (!obj) return m;
  for (const k of Object.keys(obj)) {
    const match = /^l(\d+)_/.exec(k);
    if (match) m = Math.max(m, Number(match[1]));
  }
  return m;
}

 type LocationRow = {
    id: string;
    name: string;
    app_config?: Record<string, unknown> | null;
  };

 type LodgeSubsectionRow = {
   id: string;
   name: string;
   start_ch: number | null;
   end_ch: number | null;
   direction: string | null;
   qr_token: string | null;
   app_config?: Record<string, unknown>;
   location_id: string | null;
 };

 type LodgeSectionRow = {
   id: string;
   name: string;
   start_ch: number;
   end_ch: number;
   direction: string;
   scope: string;
   app_config: Record<string, unknown>;
   qr_token: string | null;
   location_id: string | null;
   subsections: LodgeSubsectionRow[];
 };

 type PenetrometerOption = { id: string; serial_text: string; sort_order: number };
type SupervisorOption = { id: string; name: string; company: string | null };

export type PspLodgeLockedEntry = {
  /** Legacy PSP site row; optional when entering via unified QR only. */
  locationId?: string | null;
  locationName?: string | null;
  unifiedSectionId: string;
  subsectionId: string | null;
  sectionName: string;
  subsectionName: string | null;
  /** From GET /api/psp/enter (section/subsection row) when no location is used. */
  chainageStart?: number | null;
  chainageEnd?: number | null;
  chainageDirection?: string | null;
};

type PspLodgeFormProps = {
  lockedEntry?: PspLodgeLockedEntry | null;
};

export function PspLodgeForm({ lockedEntry = null }: PspLodgeFormProps) {
   const supabase = getSupabaseBrowser();
   const { pushToast } = useToast();
  const router = useRouter();
   const [authEmail, setAuthEmail] = useState<string | null>(null);
   const [sections, setSections] = useState<LodgeSectionRow[]>([]);
   const [selectedSectionId, setSelectedSectionId] = useState("");
   const [selectedSubsectionId, setSelectedSubsectionId] = useState<string | null>(
     null,
   );
   const [activeLocation, setActiveLocation] = useState<LocationRow | null>(null);
  const [chainage, setChainage] = useState<number>(0);
  const [chainageDisplay, setChainageDisplay] = useState("0.00");
  const [chainageLoading, setChainageLoading] = useState(false);
  const [rangeComplete, setRangeComplete] = useState(false);
   const [checking, setChecking] = useState(false);
   const [recordId, setRecordId] = useState<string | null>(null);
   const [signOffBy, setSignOffBy] = useState<string | null>(null);
   const [signOffAt, setSignOffAt] = useState<string | null>(null);
   const [signatureStrokes, setSignatureStrokes] =
     useState<SignatureStrokes | null>(null);
  /** Supervisor row id for Select (unique); name is derived for API payloads. */
  const [inspectorSupervisorId, setInspectorSupervisorId] = useState("");
  const [layerCount, setLayerCount] = useState(3);
  const [layers, setLayers] = useState<Record<string, string>>({});
   const [loading, setLoading] = useState(false);
  const [penetrometerOptions, setPenetrometerOptions] = useState<PenetrometerOption[]>([]);
  const [penetrometerAddOpen, setPenetrometerAddOpen] = useState(false);
  const [penetrometerEditOpen, setPenetrometerEditOpen] = useState(false);
  const [penetrometerAddInput, setPenetrometerAddInput] = useState("#3059-0325");
  const [penetrometerEditId, setPenetrometerEditId] = useState<string | null>(null);
  const [penetrometerEditInput, setPenetrometerEditInput] = useState("#3059-0325");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [supervisorOptions, setSupervisorOptions] = useState<SupervisorOption[]>([]);
  const siteInspector = useMemo(() => {
    const s = supervisorOptions.find((x) => x.id === inspectorSupervisorId);
    return (s?.name ?? "").trim();
  }, [supervisorOptions, inspectorSupervisorId]);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);
  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId],
  );

  const selectedSubsection = useMemo(() => {
    if (selectedSubsectionId == null) return null;
    return (
      selectedSection?.subsections?.find((s) => s.id === selectedSubsectionId) ??
      null
    );
  }, [selectedSection, selectedSubsectionId]);

  /** From subsection.app_config.layers_required; default 3 for backwards compat. */
  const configuredLayersRequired = useMemo(() => {
    const raw = selectedSubsection?.app_config?.layers_required;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.floor(n);
    return 3;
  }, [selectedSubsection]);

  const layersLockedToConfig = Boolean(selectedSubsectionId);

  /** Null = no matching depth_range → show all 3 lifts per layer (current behaviour). */
  const depthLiftPlan = useMemo(() => {
    if (!Number.isFinite(chainage)) return null;
    const ranges = resolveDepthRangesForScope(
      selectedSection?.app_config,
      selectedSubsection?.app_config,
    );
    return getDepthLiftPlanForChainage(chainage, ranges);
  }, [chainage, selectedSection?.app_config, selectedSubsection?.app_config]);

  const isLiftActive = (layerNum: number, suffix: LiftSuffix): boolean => {
    if (!depthLiftPlan) return true;
    return depthLiftPlan.activeKeys.includes(`l${layerNum}_${suffix}`);
  };

  const chainageScope = useMemo((): ChainageScope | null => {
    if (selectedSubsection) {
      const start = selectedSubsection.start_ch;
      const end = selectedSubsection.end_ch;
      if (typeof start !== "number" || typeof end !== "number") return null;
      const dir =
        String(selectedSubsection.direction ?? "").toLowerCase() === "onwards"
          ? "onwards"
          : "backwards";
      return {
        start,
        end,
        direction: dir,
        increment: parseChainageIncrement(selectedSubsection.app_config),
      };
    }
    if (
      lockedEntry &&
      typeof lockedEntry.chainageStart === "number" &&
      typeof lockedEntry.chainageEnd === "number"
    ) {
      const dir =
        String(lockedEntry.chainageDirection ?? "").toLowerCase() === "onwards"
          ? "onwards"
          : "backwards";
      return {
        start: lockedEntry.chainageStart,
        end: lockedEntry.chainageEnd,
        direction: dir,
        increment: parseChainageIncrement(selectedSection?.app_config),
      };
    }
    if (selectedSection && !selectedSubsectionId) {
      const start = selectedSection.start_ch;
      const end = selectedSection.end_ch;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      const dir =
        String(selectedSection.direction ?? "").toLowerCase() === "onwards"
          ? "onwards"
          : "backwards";
      return {
        start,
        end,
        direction: dir,
        increment: parseChainageIncrement(selectedSection.app_config),
      };
    }
    return null;
  }, [selectedSubsection, selectedSubsectionId, selectedSection, lockedEntry]);

  const chainageStep = chainageScope?.increment ?? CHAINAGE_STEP;

  const currentLayerKeys = useMemo(
    () => getLayerFieldKeysForLayerCount(layerCount),
    [layerCount],
  );

  const locationId = useMemo(() => {
    if (
      lockedEntry?.locationId != null &&
      String(lockedEntry.locationId).trim()
    ) {
      return String(lockedEntry.locationId).trim();
    }
    // Subsection in scope: use ONLY its location_id (null is intentional — do not
    // inherit parent section.location_id, which may point at a legacy PSP site).
    if (selectedSubsectionId) {
      return selectedSubsection?.location_id ?? null;
    }
    return selectedSection?.location_id ?? null;
  }, [
    lockedEntry,
    selectedSubsectionId,
    selectedSubsection,
    selectedSection,
  ]);

  const subsectionIdForApi = selectedSubsectionId;

  const unifiedSectionId = selectedSectionId;

  const locationName =
    activeLocation?.name ?? lockedEntry?.locationName ?? "";

   useEffect(() => {
     void supabase.auth.getSession().then(
       ({ data }: { data: { session: Session | null } }) => {
       setAuthEmail(data.session?.user.email ?? null);
     },
     );
     const { data: subscription } = supabase.auth.onAuthStateChange(
       (_event: AuthChangeEvent, session: Session | null) => {
         setAuthEmail(session?.user.email ?? null);
       },
     );
     return () => subscription.subscription.unsubscribe();
   }, [supabase]);

  useEffect(() => {
    if (lockedEntry) return;
    if (authEmail && adminAuthOpen) {
      setAdminAuthOpen(false);
      router.push("/admin");
    }
  }, [adminAuthOpen, authEmail, lockedEntry, router]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const token = await getBrowserAccessToken();
      const response = await fetch("/api/psp/sections", {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        if (!cancelled) {
          pushToast({
            type: "error",
            title: "Failed to load sections",
            message: payload.error ?? "Unable to load sections",
          });
        }
        return;
      }
      const list = (payload.sections ?? []) as LodgeSectionRow[];
      if (!cancelled) {
        setSections(list);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [pushToast]);

  useEffect(() => {
    if (!lockedEntry || !sections.length) return;
    setSelectedSectionId(lockedEntry.unifiedSectionId);
    setSelectedSubsectionId(lockedEntry.subsectionId);
  }, [lockedEntry, sections]);

  useEffect(() => {
    if (!selectedSubsectionId) return;
    setLayerCount(configuredLayersRequired);
  }, [selectedSubsectionId, configuredLayersRequired]);

  useEffect(() => {
    setRangeComplete(false);
  }, [selectedSubsectionId, selectedSectionId, chainageScope?.start, chainageScope?.end]);

  useEffect(() => {
    if (!chainageScope || !Number.isFinite(chainage)) return;
    if (!isChainageInScope(chainage, chainageScope)) {
      setChainage(clampChainageToScope(chainage, chainageScope));
    }
  }, [chainageScope]); // eslint-disable-line react-hooks/exhaustive-deps -- clamp when scope changes only

  useEffect(() => {
    if (!lockedEntry) return;
    const start = lockedEntry.chainageStart;
    if (
      start != null &&
      Number.isFinite(start) &&
      !locationId
    ) {
      setChainage(start);
    }
  }, [lockedEntry, locationId]);

  useEffect(() => {
    if (lockedEntry || !sections.length) return;
    setSelectedSectionId((prev) =>
      prev && sections.some((s) => s.id === prev) ? prev : sections[0].id,
    );
  }, [lockedEntry, sections]);

  useEffect(() => {
    if (!locationId) {
      setActiveLocation(null);
      return;
    }
    const loadLoc = async () => {
      const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_LIST_SELECT)
        .eq("id", locationId)
        .eq("location_type", "psp")
        .maybeSingle();
      if (error || !data) {
        setActiveLocation(null);
        if (error) {
          pushToast({
            type: "error",
            title: "Failed to load location row",
            message: error.message,
          });
        }
        return;
      }
      setActiveLocation(data as LocationRow);
    };
    void loadLoc();
  }, [locationId, pushToast, supabase]);

  useEffect(() => {
    if (!locationId) return;
    const loadOptions = async () => {
      const token = await getBrowserAccessToken();
      const response = await fetch(
        `/api/psp/penetrometer-options?locationId=${locationId}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const payload = await response.json();
      if (response.ok && Array.isArray(payload.options)) {
        setPenetrometerOptions(payload.options);
      } else {
        setPenetrometerOptions([]);
      }
    };
    loadOptions();
  }, [locationId]);

  useEffect(() => {
    if (!unifiedSectionId) {
      setSupervisorOptions([]);
      return;
    }
    const loadSupervisors = async () => {
      const token = await getBrowserAccessToken();
      const query = selectedSubsectionId
        ? `subsection_id=${selectedSubsectionId}`
        : `section_id=${unifiedSectionId}`;
      const response = await fetch(`/api/psp/supervisors/assignments?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json();
      if (!response.ok) {
        setSupervisorOptions([]);
        return;
      }
      setSupervisorOptions((payload.supervisors ?? []) as SupervisorOption[]);
    };
    void loadSupervisors();
  }, [selectedSubsectionId, unifiedSectionId]);

  useEffect(() => {
    if (!inspectorSupervisorId) return;
    if (!supervisorOptions.some((s) => s.id === inspectorSupervisorId)) {
      setInspectorSupervisorId("");
    }
  }, [supervisorOptions, inspectorSupervisorId]);

  useEffect(() => {
    if (!unifiedSectionId) {
      setChainageLoading(false);
      return;
    }
    setChainageLoading(true);
    const updateSuggestion = async () => {
      try {
        const token = await getBrowserAccessToken();
        const usp = new URLSearchParams({ unifiedSectionId });
        if (subsectionIdForApi) {
          usp.set("subsectionId", subsectionIdForApi);
        }
        if (locationId?.trim()) {
          usp.set("locationId", locationId.trim());
          if (locationName?.trim()) {
            usp.set("location", locationName.trim());
          }
        }
        const response = await fetch(`/api/psp/next-chainage?${usp.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const payload = await response.json();
        if (!response.ok) {
          pushToast({
            type: "error",
            title: "Failed to get next chainage",
            message: payload.error ?? "Unknown error",
          });
          return;
        }
        let next = Number(payload.chainage);
        if (chainageScope && Number.isFinite(next)) {
          if (!isChainageInScope(next, chainageScope)) {
            const snapped = clampChainageToScope(next, chainageScope);
            // If API jumped past the end, treat range as complete when at terminal
            // and the terminal would already be "after" the last step.
            const beyond =
              chainageScope.direction === "backwards"
                ? next < Math.min(chainageScope.start, chainageScope.end)
                : next > Math.max(chainageScope.start, chainageScope.end);
            if (beyond) {
              setChainage(snapped);
              setRangeComplete(true);
              return;
            }
            next = snapped;
          }
          setRangeComplete(false);
        }
        setChainage(next);
      } finally {
        setChainageLoading(false);
      }
    };
    updateSuggestion();
  }, [
    locationId,
    locationName,
    unifiedSectionId,
    subsectionIdForApi,
    chainageScope,
    pushToast,
    supabase,
  ]);

  const handleChainageBlur = () => {
    if (!Number.isFinite(chainage)) return;
    let value = chainage;
    if (chainageScope) {
      value = clampChainageToScope(value, chainageScope);
      if (value !== chainage) setChainage(value);
    }
    setChainageDisplay(value.toFixed(2));
  };

  useEffect(() => {
    if (!unifiedSectionId || !chainage) return;
     const checkDuplicate = async () => {
      setChecking(true);
      try {
        const token = await getBrowserAccessToken();
        const usp = new URLSearchParams({
          chainage: String(chainage),
          unifiedSectionId,
        });
        if (subsectionIdForApi) {
          usp.set("subsectionId", subsectionIdForApi);
        }
        const response = await fetch(`/api/psp/exists?${usp.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const payload = await response.json();
        setRecordId(payload.recordId ?? null);
        setSignOffBy(payload.signOffBy ?? null);
        setSignOffAt(payload.signOffAt ?? null);
        setSignatureStrokes(payload.signatureStrokes ?? null);
        const incoming = payload.layers as Record<string, number | null> | null;
        const storedLc = Number(payload.layersRequired);
        const storedOk = Number.isFinite(storedLc) && storedLc >= 1;
        const fromKeys = maxLayerIndexFromLayers(incoming);
        const nextCount = layersLockedToConfig
          ? configuredLayersRequired
          : Math.max(3, storedOk ? storedLc : 0, fromKeys);
        setLayerCount(nextCount);
        if (incoming) {
          setLayers((prev) => {
            const next = { ...prev };
            for (const [key, value] of Object.entries(incoming)) {
              if (value !== null && value !== undefined) {
                next[key] = String(value);
              }
            }
            return next;
          });
        }
      } catch (error) {
        pushToast({
          type: "error",
          title: "Check failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setChecking(false);
      }
     };
     checkDuplicate();
  }, [
    chainage,
    unifiedSectionId,
    subsectionIdForApi,
    layersLockedToConfig,
    configuredLayersRequired,
    pushToast,
    supabase,
  ]);

  useEffect(() => {
    if (!Number.isFinite(chainage)) return;
    setChainageDisplay(chainage.toFixed(2));
  }, [chainage]);
   const updateLayerValue = (key: string, value: string) => {
     setLayers((prev) => ({ ...prev, [key]: value }));
   };

  const layerOutOfRange = (value: string) => {
    if (value === "") return false;
    const num = Number(value);
    return Number.isNaN(num) || num < 0 || num > 35;
  };

   const canSubmit =
     !rangeComplete &&
     unifiedSectionId &&
     chainage > 0 &&
     (!chainageScope || isChainageInScope(chainage, chainageScope)) &&
     siteInspector &&
    currentLayerKeys.every((key) => {
      const value = layers[key];
      if (value === "" || value === undefined) return true;
      const num = Number(value);
      return !Number.isNaN(num) && num >= 0 && num <= 35;
     });
  const addLayer = () => {
    if (layersLockedToConfig) return;
    if (layerCount >= 5) {
      pushToast({
        type: "info",
        title: "Layer limit",
        message:
          "Maximum 5 layers supported. Contact admin if more are required.",
      });
      return;
    }
    setLayerCount((c) => c + 1);
  };

  const removeLayer = (layerNum1: number) => {
    if (layersLockedToConfig) return;
    if (layerNum1 < 4 || layerNum1 > layerCount) return;
    setLayers((prev) => {
      const next = { ...prev };
      for (let L = layerNum1; L < layerCount; L += 1) {
        for (const suf of ["150", "450", "750"] as const) {
          next[`l${L}_${suf}`] = next[`l${L + 1}_${suf}`] ?? "";
        }
      }
      for (const suf of ["150", "450", "750"] as const) {
        delete next[`l${layerCount}_${suf}`];
      }
      return next;
    });
    setLayerCount((c) => c - 1);
  };

  const buildLayersPayload = () =>
    Object.fromEntries(
      currentLayerKeys.map((key) => [
        key,
        (layers[key] ?? "") === "" ? null : layers[key],
      ]),
    );

  const handleAdjustChainage = (step: number) => {
    if (rangeComplete) return;
    setChainage((prev) => {
      const next = Math.max(0, prev + step);
      if (!chainageScope) return next;
      return clampChainageToScope(next, chainageScope);
    });
  };

  const handleChainageChange = (value: string) => {
    setChainageDisplay(value);
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      setChainage(parsed);
    }
  };

   const handleLodge = async () => {
     if (!canSubmit) return;
     setLoading(true);
    const token = await getBrowserAccessToken();
     const response = await fetch("/api/psp/records", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         ...(locationId?.trim()
           ? { locationId: locationId.trim() }
           : {}),
         // Never send locationName alone — resolveLocationId would match legacy
         // locations by name and reintroduce a location_id the subsection does not have.
         ...(locationId?.trim() && locationName?.trim()
           ? { locationName: locationName.trim() }
           : {}),
         unifiedSectionId,
         subsectionId: subsectionIdForApi,
         chainage,
         siteInspector,
         layerCount: layersLockedToConfig ? configuredLayersRequired : layerCount,
        layers: buildLayersPayload(),
         compactorSn: (() => {
           const eff = getEffectiveLocationFields(activeLocation ?? undefined);
           return eff.compactor_serial != null
             ? String(eff.compactor_serial)
             : (eff.penetrometer_sn ?? "#3059-0325");
         })(),
       }),
     });
     const payload = await response.json();
     setLoading(false);
     if (!response.ok) {
       pushToast({
         type: "error",
         title: "Lodge failed",
         message: payload.error ?? "Unable to lodge record",
       });
       return;
     }
    if (signatureStrokes) {
      const signatureResponse = await fetch("/api/psp/signature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...(locationId?.trim()
            ? { locationId: locationId.trim() }
            : {
                unifiedSectionId,
                ...(subsectionIdForApi
                  ? { subsectionId: subsectionIdForApi }
                  : {}),
              }),
          chainage,
          inspectorName: siteInspector,
          signatureStrokes,
        }),
      });
      const signaturePayload = await signatureResponse.json();
      if (signatureResponse.ok) {
        setSignOffBy(siteInspector);
        setSignOffAt(signaturePayload.signOffAt ?? new Date().toISOString());
      } else {
        pushToast({
          type: "error",
          title: "Signature failed",
          message: signaturePayload.error ?? "Unable to save signature",
        });
      }
    }
     setLayerCount(
       layersLockedToConfig ? configuredLayersRequired : 3,
     );
     setLayers({});
     setInspectorSupervisorId("");
     setSignatureStrokes(null);
     pushToast({ type: "success", title: "Record lodged" });
     setRecordId(null);
    const nextToken = await getBrowserAccessToken();
    const usp = new URLSearchParams({ unifiedSectionId });
    if (subsectionIdForApi) {
      usp.set("subsectionId", subsectionIdForApi);
    }
    if (locationId?.trim()) {
      usp.set("locationId", locationId.trim());
      if (locationName?.trim()) {
        usp.set("location", locationName.trim());
      }
    }
    if (chainageScope) {
      const scopedNext = nextChainageInScope(chainage, chainageScope);
      if (scopedNext == null) {
        setRangeComplete(true);
        return;
      }
      setChainage(scopedNext);
      setRangeComplete(false);
      return;
    }
    const nextResponse = await fetch(`/api/psp/next-chainage?${usp.toString()}`, {
      headers: nextToken ? { Authorization: `Bearer ${nextToken}` } : undefined,
    });
     const nextPayload = await nextResponse.json();
     if (nextResponse.ok) {
       setChainage(nextPayload.chainage);
     }
   };

   const handleSaveSignature = async (payload: SignatureStrokes) => {
    if (!recordId) {
      setSignatureStrokes(payload);
      setSignatureOpen(false);
      pushToast({
        type: "info",
        title: "Signature captured",
        message: "Signature will be saved after lodging.",
      });
      return;
    }
    const token = await getBrowserAccessToken();
     const response = await fetch("/api/psp/signature", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         ...(locationId?.trim()
           ? { locationId: locationId.trim() }
           : {
               unifiedSectionId,
               ...(subsectionIdForApi
                 ? { subsectionId: subsectionIdForApi }
                 : {}),
             }),
         chainage,
         inspectorName: siteInspector,
         signatureStrokes: payload,
       }),
     });
     const result = await response.json();
     if (!response.ok) {
       pushToast({
         type: "error",
         title: "Signature failed",
         message: result.error ?? "Unable to save signature",
       });
       return;
     }
     setSignatureStrokes(payload);
     setSignOffBy(siteInspector);
     setSignOffAt(result.signOffAt ?? new Date().toISOString());
     pushToast({ type: "success", title: "Signature saved" });
     setSignatureOpen(false);
   };

  return (
    <div className="psp-page">
      <div className="psp-shell">
        <header className="psp-outer space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="psp-page-title">
                PSP Record sheet
              </h1>
            </div>
            {!lockedEntry ? (
              <Button
                variant="ghost"
                className="psp-button psp-button-ghost shrink-0 h-8 min-h-8 border-0 px-3 text-xs text-[var(--text-secondary)]"
                onClick={() => {
                  if (authEmail) {
                    router.push("/admin");
                  } else {
                    setAdminAuthOpen(true);
                  }
                }}
              >
                ⚙ Admin
              </Button>
            ) : null}
          </div>
        </header>

        <div className="psp-outer space-y-3">
          {lockedEntry ? (
            <div>
              <div className="psp-section-label">Section</div>
              <p className="mt-[14px] text-sm font-semibold text-[var(--ink)]">
                {lockedEntry.sectionName}
              </p>
            </div>
          ) : (
            <div>
              <div className="psp-section-label">Section</div>
              <Select
                value={selectedSectionId || undefined}
                onValueChange={(value) => {
                  setSelectedSectionId(value);
                  setSelectedSubsectionId(null);
                }}
                disabled={!sections.length}
              >
                <SelectTrigger className="psp-input mt-[14px] w-full bg-[var(--inner-bg)]">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedSection &&
          (selectedSection.subsections?.length ?? 0) > 0 ? (
            <div>
              <div className="psp-section-label">Subsection</div>
              {lockedEntry && lockedEntry.subsectionId != null ? (
                <p className="mt-[14px] text-sm font-semibold text-[var(--ink)]">
                  {lockedEntry.subsectionName ?? "—"}
                </p>
              ) : (
                <Select
                  value={selectedSubsectionId ?? "__none__"}
                  onValueChange={(v) =>
                    setSelectedSubsectionId(v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger className="psp-input mt-[14px] w-full bg-[var(--inner-bg)]">
                    <SelectValue placeholder="Subsection" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {selectedSection.subsections.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : null}
        </div>

        <div className="psp-outer">
          <div className="psp-section-label">Current chainage (m)</div>

          {rangeComplete ? (
            <p className="mt-[14px] rounded-[12px] border border-[#CFE8DA] bg-[#E7F4EC] px-3 py-2 text-sm font-medium text-[#2F7D55]">
              Subsección completa — no quedan chainages por cargar
            </p>
          ) : null}

          <div className="relative mt-[14px] mb-[2px] w-full">
            <Input
              type="text"
              inputMode="decimal"
              value={chainageDisplay}
              onChange={(event) => handleChainageChange(event.target.value)}
              onBlur={handleChainageBlur}
              disabled={chainageLoading || rangeComplete}
              className="psp-mono psp-hero h-9 min-h-9 w-full rounded-[12px] border border-[var(--input-border)] bg-[var(--inner-bg)] px-12 py-2 text-center text-[var(--ink)] focus:ring-2 focus:ring-[color:var(--primary)/0.25]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="psp-stepper-btn absolute left-[-2px] top-1/2 z-10 size-9 min-w-9 min-h-9 -translate-y-1/2 rounded-full border border-white/30 bg-[var(--psp-stepper-bg)] text-white shadow-[var(--shadow)] hover:opacity-90"
              onClick={() => handleAdjustChainage(-chainageStep)}
              disabled={rangeComplete}
            >
              -
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="psp-stepper-btn absolute right-[-2px] top-1/2 z-10 size-9 min-w-9 min-h-9 -translate-y-1/2 rounded-full border border-white/30 bg-[var(--psp-stepper-bg)] text-white shadow-[var(--shadow)] hover:opacity-90"
              onClick={() => handleAdjustChainage(chainageStep)}
              disabled={rangeComplete}
            >
              +
            </Button>
            {chainageLoading ? (
              <span className="absolute right-12 top-1/2 z-10 -translate-y-1/2 pointer-events-none text-[var(--ink)]/70">
                <Loader2 className="h-4 w-4 animate-spin" />
              </span>
            ) : null}
          </div>

        </div>

        <Card className="psp-card">
          <CardHeader className="pb-2 gap-y-[14px]">
            <CardTitle className="psp-section-label">Layers</CardTitle>
            <p className="text-xs text-[var(--muted-foreground)]">
              {layerCount} layer block(s)
            </p>
            <div className="grid gap-3">
              <div className="rounded-[20px] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                  <span className="font-semibold">Penetrometer S/N:</span>
                  <Select
                    value={(() => {
                      const eff = getEffectiveLocationFields(activeLocation ?? undefined);
                      return (
                        eff.penetrometer_sn ??
                        (eff.penetrometer_serial != null
                          ? String(eff.penetrometer_serial)
                          : "#3059-0325")
                      );
                    })()}
                    onValueChange={async (value) => {
                      if (!locationId) return;
                      const token = await getBrowserAccessToken();
                      const res = await fetch(`/api/psp/locations/${locationId}`, {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ penetrometerSn: value }),
                      });
                      if (res.ok) {
                        setActiveLocation((prev) =>
                          prev && prev.id === locationId
                            ? {
                                ...prev,
                                app_config: mergeLocationAppConfig(
                                  prev.app_config,
                                  { penetrometer_sn: value },
                                ),
                              }
                            : prev,
                        );
                      } else {
                        const payload = await res.json();
                        pushToast({
                          type: "error",
                          title: "Failed to update penetrometer",
                          message: payload.error ?? "Unknown error",
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-10 w-[140px] border-0 bg-[var(--surface-alt)] px-4 py-2 rounded-[12px] text-xs font-medium text-[var(--ink)] shadow-none focus:ring-0">
                      <SelectValue placeholder="#3059-0325" />
                    </SelectTrigger>
                    <SelectContent>
                      {(penetrometerOptions.length
                        ? penetrometerOptions
                        : [
                            {
                              id: "default",
                              serial_text: "#3059-0325",
                              sort_order: 0,
                            },
                          ]
                      ).map((o) => (
                        <SelectItem
                          key={o.id}
                          value={o.serial_text}
                          className="text-xs"
                        >
                          {o.serial_text}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-[var(--muted-foreground)] ml-auto"
                      >
                        ⋮
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setPenetrometerAddOpen(true)}>
                        Add new penetrometer
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const current = (() => {
                            const eff = getEffectiveLocationFields(
                              activeLocation ?? undefined,
                            );
                            return (
                              eff.penetrometer_sn ??
                              (eff.penetrometer_serial != null
                                ? String(eff.penetrometer_serial)
                                : "#3059-0325")
                            );
                          })();
                          const p = penetrometerOptions.find(
                            (x) => x.serial_text === current,
                          );
                          if (p && p.id !== "default") {
                            setPenetrometerEditId(p.id);
                            setPenetrometerEditInput(p.serial_text);
                            setPenetrometerEditOpen(true);
                          } else {
                            pushToast({
                              type: "info",
                              title: "Edit penetrometer",
                              message:
                                "Select a penetrometer from the list or add a new one first.",
                            });
                          }
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {Array.from({ length: layerCount }, (_, idx) => idx).map((layerIndex) => {
                const layerNum = layerIndex + 1;
                return (
                <div
                  key={`layer-${layerIndex}`}
                  className="rounded-[20px] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-[var(--muted-foreground)]">
                    <span>Layer {layerNum} - Number of blows</span>
                    {layerNum >= 4 && !layersLockedToConfig ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-[var(--muted-foreground)]"
                        onClick={() => removeLayer(layerNum)}
                        aria-label={`Remove layer ${layerNum}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                    {([0, 1, 2] as const).map((liftIdx) => {
                      const suffix =
                        liftIdx === 0 ? "150" : liftIdx === 1 ? "450" : "750";
                      if (!isLiftActive(layerNum, suffix)) return null;
                      const key = `l${layerNum}_${suffix}`;
                      const value = layers[key] ?? "";
                      const warning = layerOutOfRange(value);
                      return (
                        <div
                          key={key}
                          className="grid min-w-0 content-start gap-1"
                        >
                          <label className="psp-label truncate">
                            {liftMmLabel(layerIndex, liftIdx)}
                          </label>
                          <Input
                            type="number"
                            min={0}
                            max={35}
                            value={value}
                            onChange={(event) =>
                              updateLayerValue(key, event.target.value)
                            }
                            className={`psp-layer-input ${
                              warning
                                ? "border border-[var(--danger)] bg-[color:var(--danger)/0.08]"
                                : ""
                            }`}
                          />
                          {warning ? (
                            <p className="text-xs text-[var(--danger)]">
                              Out of Tolerance
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
              {!layersLockedToConfig ? (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={addLayer}
                >
                  + Add Layer
                </Button>
              </div>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        <div className="psp-outer">
          <div className="psp-section-label">Supervisor</div>

          <Select
            value={inspectorSupervisorId || undefined}
            onValueChange={setInspectorSupervisorId}
          >
            <SelectTrigger
              className={`psp-input mt-[14px] mb-[2px] w-full bg-[var(--inner-bg)] ${siteInspector ? "psp-select-supervisor-filled" : ""}`}
            >
              <SelectValue placeholder="Select supervisor" />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4} className="z-[100]">
              {supervisorOptions.length ? (
                supervisorOptions.map((supervisor) => (
                  <SelectItem key={supervisor.id} value={supervisor.id}>
                    {supervisor.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__none__" disabled>
                  No supervisors assigned — contact admin
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          <div className="psp-section-label mt-[14px]">Signature</div>

          <div className="mt-[14px] w-full space-y-2">
            <div className="rounded-[12px] bg-[var(--inner-bg)] min-h-[180px] overflow-hidden relative flex flex-col">
              {signatureStrokes ? (
                <div className="overflow-hidden">
                  <SignaturePreview strokes={signatureStrokes} />
                </div>
              ) : signatureOpen ? (
                <div className="p-2 flex flex-col gap-3">
                  <SignaturePad
                    wrapperClassName="bg-[var(--inner-bg)]"
                    onSave={handleSaveSignature}
                    onCancel={() => setSignatureOpen(false)}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-6 rounded-[12px] border border-[var(--border)] bg-[var(--inner-bg)] text-[var(--muted-foreground)] hover:bg-[var(--surface-alt)] hover:text-[var(--ink)]"
                    onClick={() => setSignatureOpen(true)}
                    disabled={!siteInspector}
                  >
                    Tap to sign
                  </Button>
                </div>
              )}
            </div>
            {signOffAt ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Signed by {signOffBy ?? "Unknown"} at{" "}
                {new Date(signOffAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>

        <div className="pt-0">
          <ConfirmButton
            variant="ghost"
            label="Lodge Record"
            confirmLabel="CONFIRM?"
            onConfirm={handleLodge}
            disabled={!canSubmit || loading}
            className="psp-button psp-button-lodge w-full shrink-0 min-h-11 text-white"
            style={{
              backgroundColor: "var(--psp-lodge-bg)",
              color: "#fff",
            }}
            confirmClassName="psp-button-warning"
          />
        </div>
      </div>

      <Dialog open={adminAuthOpen} onOpenChange={setAdminAuthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin sign-in</DialogTitle>
          </DialogHeader>
          <AuthPanel onAuthChange={setAuthEmail} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={penetrometerAddOpen}
        onOpenChange={(open) => {
          setPenetrometerAddOpen(open);
          if (!open) setPenetrometerAddInput("#3059-0325");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new penetrometer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="psp-label">Serial number</label>
            <Input
              type="text"
              value={penetrometerAddInput}
              onChange={(e) => setPenetrometerAddInput(e.target.value)}
              placeholder="#3059-0325"
              className="psp-input"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-[#E6EDF3] border-[#E6EDF3] text-[var(--ink)] hover:bg-[#E6EDF3]/90"
              onClick={() => setPenetrometerAddOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#556F87] text-white hover:bg-[#556F87]/90"
              onClick={async () => {
                const text = penetrometerAddInput.trim();
                if (!locationId || !text) {
                  pushToast({
                    type: "error",
                    title: "Invalid serial number",
                    message: "Enter a value (e.g. #3059-0325).",
                  });
                  return;
                }
                const token = await getBrowserAccessToken();
                const res = await fetch("/api/psp/penetrometer-options", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ locationId, serialText: text }),
                });
                const payload = await res.json();
                if (res.ok) {
                  setPenetrometerOptions((prev) =>
                    [...prev, payload.option].sort(
                      (a, b) => a.sort_order - b.sort_order,
                    ),
                  );
                  setActiveLocation((prev) =>
                    prev && prev.id === locationId
                      ? {
                          ...prev,
                          app_config: mergeLocationAppConfig(prev.app_config, {
                            penetrometer_sn: text,
                          }),
                        }
                      : prev,
                  );
                  setPenetrometerAddOpen(false);
                  pushToast({ type: "success", title: "Penetrometer added" });
                } else {
                  pushToast({
                    type: "error",
                    title: "Failed to add penetrometer",
                    message: payload.error ?? "Unknown error",
                  });
                }
              }}
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={penetrometerEditOpen}
        onOpenChange={(open) => {
          setPenetrometerEditOpen(open);
          if (!open) {
            setPenetrometerEditId(null);
            setPenetrometerEditInput("#3059-0325");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit penetrometer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="psp-label">Serial number</label>
            <Input
              type="text"
              value={penetrometerEditInput}
              onChange={(e) => setPenetrometerEditInput(e.target.value)}
              placeholder="#3059-0325"
              className="psp-input"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="bg-[#E6EDF3] border-[#E6EDF3] text-[var(--ink)] hover:bg-[#E6EDF3]/90"
              onClick={() => setPenetrometerEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#556F87] text-white hover:bg-[#556F87]/90"
              onClick={async () => {
                if (!penetrometerEditId) return;
                const text = penetrometerEditInput.trim();
                if (!text) {
                  pushToast({
                    type: "error",
                    title: "Invalid serial number",
                    message: "Enter a value (e.g. #3059-0325).",
                  });
                  return;
                }
                const token = await getBrowserAccessToken();
                const res = await fetch(
                  `/api/psp/penetrometer-options/${penetrometerEditId}`,
                  {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    },
                    body: JSON.stringify({ serialText: text }),
                  },
                );
                const payload = await res.json();
                if (res.ok) {
                  const current =
                    getEffectiveLocationFields(activeLocation ?? undefined).penetrometer_sn ??
                    "#3059-0325";
                  const wasSelected =
                    penetrometerOptions.find(
                      (p) => p.id === penetrometerEditId,
                    )?.serial_text === current;
                  setPenetrometerOptions((prev) =>
                    prev
                      .map((p) =>
                        p.id === penetrometerEditId
                          ? { ...p, serial_text: text }
                          : p,
                      )
                      .sort((a, b) => a.sort_order - b.sort_order),
                  );
                  if (wasSelected) {
                    setActiveLocation((prev) =>
                      prev && prev.id === locationId
                        ? {
                            ...prev,
                            app_config: mergeLocationAppConfig(prev.app_config, {
                              penetrometer_sn: text,
                            }),
                          }
                        : prev,
                    );
                  }
                  setPenetrometerEditOpen(false);
                  pushToast({ type: "success", title: "Penetrometer updated" });
                } else {
                  pushToast({
                    type: "error",
                    title: "Failed to update penetrometer",
                    message: payload.error ?? "Unknown error",
                  });
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
 }
