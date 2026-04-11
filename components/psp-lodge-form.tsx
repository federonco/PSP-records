 "use client";

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
  getEffectiveLocationFields,
  LOCATION_LIST_SELECT,
  mergeLocationAppConfig,
} from "@/lib/location-app-config";
 import { getSupabaseBrowser } from "@/lib/supabase/browser";
 import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Loader2 } from "lucide-react";

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

 const layerFields = [
   { key: "l1_150", label: "150-450mm" },
   { key: "l1_450", label: "450-750mm" },
   { key: "l1_750", label: "750-1050mm" },
   { key: "l2_150", label: "150-450mm" },
   { key: "l2_450", label: "450-750mm" },
   { key: "l2_750", label: "750-1050mm" },
   { key: "l3_150", label: "150-450mm" },
   { key: "l3_450", label: "450-750mm" },
   { key: "l3_750", label: "750-1050mm" },
 ] as const;

 type LayerKey = (typeof layerFields)[number]["key"];

const inspectorOptions = ["Cliff Dawson", "Adam O'Neill"];

export type PspLodgeLockedEntry = {
  locationId: string;
  locationName: string;
  unifiedSectionId: string;
  subsectionId: string | null;
  sectionName: string;
  subsectionName: string | null;
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
   const [checking, setChecking] = useState(false);
   const [duplicate, setDuplicate] = useState(false);
   const [recordId, setRecordId] = useState<string | null>(null);
   const [signOffBy, setSignOffBy] = useState<string | null>(null);
   const [signOffAt, setSignOffAt] = useState<string | null>(null);
   const [signatureStrokes, setSignatureStrokes] =
     useState<SignatureStrokes | null>(null);
   const [siteInspector, setSiteInspector] = useState("");
   const [layers, setLayers] = useState<Record<LayerKey, string>>(() =>
     Object.fromEntries(layerFields.map((field) => [field.key, ""])) as Record<
       LayerKey,
       string
     >,
   );
   const [loading, setLoading] = useState(false);
  const [penetrometerOptions, setPenetrometerOptions] = useState<PenetrometerOption[]>([]);
  const [penetrometerAddOpen, setPenetrometerAddOpen] = useState(false);
  const [penetrometerEditOpen, setPenetrometerEditOpen] = useState(false);
  const [penetrometerAddInput, setPenetrometerAddInput] = useState("#3059-0325");
  const [penetrometerEditId, setPenetrometerEditId] = useState<string | null>(null);
  const [penetrometerEditInput, setPenetrometerEditInput] = useState("#3059-0325");
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [adminAuthOpen, setAdminAuthOpen] = useState(false);

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      return data.session.access_token;
    }
    const refreshed = await supabase.auth.refreshSession();
    return refreshed.data.session?.access_token ?? null;
  };

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

  const locationId = useMemo(
    () =>
      selectedSubsection?.location_id ??
      selectedSection?.location_id ??
      null,
    [selectedSubsection, selectedSection],
  );

  const subsectionIdForApi = selectedSubsectionId;

  const unifiedSectionId = selectedSectionId;

  const locationName =
    activeLocation?.name ?? lockedEntry?.locationName ?? "";

   useEffect(() => {
     supabase.auth.getSession().then(({ data }) => {
       setAuthEmail(data.session?.user.email ?? null);
     });
     const { data: subscription } = supabase.auth.onAuthStateChange(
       (_event, session) => {
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
      const token = await getAccessToken();
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
      const token = await getAccessToken();
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
    if (!locationId || !unifiedSectionId) {
      setChainageLoading(false);
      return;
    }
    setChainageLoading(true);
    const updateSuggestion = async () => {
      try {
        const token = await getAccessToken();
        const usp = new URLSearchParams({
          locationId,
          unifiedSectionId,
        });
        if (subsectionIdForApi) {
          usp.set("subsectionId", subsectionIdForApi);
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
        setChainage(payload.chainage);
      } finally {
        setChainageLoading(false);
      }
    };
    updateSuggestion();
  }, [
    locationId,
    unifiedSectionId,
    subsectionIdForApi,
    pushToast,
    supabase,
  ]);

  useEffect(() => {
    if (!locationId || !chainage || !unifiedSectionId) return;
     const checkDuplicate = async () => {
      setChecking(true);
      try {
        const token = await getAccessToken();
        const usp = new URLSearchParams({
          locationId,
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
        setDuplicate(Boolean(payload.exists));
        setRecordId(payload.recordId ?? null);
        setSignOffBy(payload.signOffBy ?? null);
        setSignOffAt(payload.signOffAt ?? null);
        setSignatureStrokes(payload.signatureStrokes ?? null);
      } catch (error) {
        pushToast({
          type: "error",
          title: "Duplicate check failed",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setChecking(false);
      }
     };
     checkDuplicate();
  }, [
    chainage,
    locationId,
    unifiedSectionId,
    subsectionIdForApi,
    pushToast,
    supabase,
  ]);

  useEffect(() => {
    if (!Number.isFinite(chainage)) return;
    setChainageDisplay(chainage.toFixed(2));
  }, [chainage]);

   const updateLayerValue = (key: LayerKey, value: string) => {
     setLayers((prev) => ({ ...prev, [key]: value }));
   };

  const layerOutOfRange = (value: string) => {
    if (value === "") return false;
    const num = Number(value);
    return Number.isNaN(num) || num < 0 || num > 35;
  };

   const canSubmit =
     locationId &&
     unifiedSectionId &&
     chainage > 0 &&
     siteInspector &&
     layerFields.every((field) => {
       const value = layers[field.key];
       const num = Number(value);
      return value !== "" && !Number.isNaN(num) && num >= 0 && num <= 35;
     });

  const handleAdjustChainage = (step: number) => {
    setChainage((prev) => Math.max(0, prev + step));
  };

  const handleChainageChange = (value: string) => {
    setChainageDisplay(value);
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      setChainage(parsed);
    }
  };

  const handleChainageBlur = () => {
    if (!Number.isFinite(chainage)) return;
    setChainageDisplay(chainage.toFixed(2));
  };

   const handleLodge = async () => {
     if (!canSubmit || duplicate) return;
     setLoading(true);
    const token = await getAccessToken();
     const response = await fetch("/api/psp/records", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
         locationName,
         unifiedSectionId,
         subsectionId: subsectionIdForApi,
         chainage,
         siteInspector,
         layers,
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
          locationId,
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
     setLayers(
       Object.fromEntries(layerFields.map((field) => [field.key, ""])) as Record<
         LayerKey,
         string
       >,
     );
     setSignatureStrokes(null);
     pushToast({ type: "success", title: "Record lodged" });
     setDuplicate(false);
     setRecordId(null);
    const nextToken = await getAccessToken();
    const usp = new URLSearchParams({
      locationId,
      unifiedSectionId,
    });
    if (subsectionIdForApi) {
      usp.set("subsectionId", subsectionIdForApi);
    }
    const nextResponse = await fetch(`/api/psp/next-chainage?${usp.toString()}`, {
      headers: nextToken ? { Authorization: `Bearer ${nextToken}` } : undefined,
    });
     const nextPayload = await nextResponse.json();
     if (nextResponse.ok) {
       setChainage(nextPayload.chainage);
     }
   };

   const handleOverwrite = async () => {
     if (!canSubmit || !duplicate) return;
     setLoading(true);
    const token = await getAccessToken();
     const response = await fetch("/api/psp/records/overwrite", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
         locationName,
         unifiedSectionId,
         subsectionId: subsectionIdForApi,
         chainage,
         siteInspector,
         layers,
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
         title: "Overwrite failed",
         message: payload.error ?? "Unable to overwrite record",
       });
       return;
     }
     pushToast({ type: "success", title: "Record overwritten" });
    setOverwriteOpen(false);
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
    const token = await getAccessToken();
     const response = await fetch("/api/psp/signature", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
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

          <div className="relative mt-[14px] mb-[2px] w-full">
            <Input
              type="text"
              inputMode="decimal"
              value={chainageDisplay}
              onChange={(event) => handleChainageChange(event.target.value)}
              onBlur={handleChainageBlur}
              disabled={chainageLoading}
              className="psp-mono psp-hero h-9 min-h-9 w-full rounded-[12px] border border-[var(--input-border)] bg-[var(--inner-bg)] px-12 py-2 text-center text-[var(--ink)] focus:ring-2 focus:ring-[color:var(--primary)/0.25]"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="psp-stepper-btn absolute left-[-2px] top-1/2 z-10 size-9 min-w-9 min-h-9 -translate-y-1/2 rounded-full border border-white/30 bg-[var(--psp-stepper-bg)] text-white shadow-[var(--shadow)] hover:opacity-90"
              onClick={() => handleAdjustChainage(-CHAINAGE_STEP)}
            >
              -
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="psp-stepper-btn absolute right-[-2px] top-1/2 z-10 size-9 min-w-9 min-h-9 -translate-y-1/2 rounded-full border border-white/30 bg-[var(--psp-stepper-bg)] text-white shadow-[var(--shadow)] hover:opacity-90"
              onClick={() => handleAdjustChainage(CHAINAGE_STEP)}
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

        {duplicate ? (
          <Alert className="border-[var(--warning)] bg-[color:var(--warning)/0.08] text-[var(--warning)]">
            <AlertTitle>Already recorded</AlertTitle>
            <AlertDescription>
              This chainage already exists. Overwrite requires confirmation.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="psp-card">
          <CardHeader className="pb-2 gap-y-[14px]">
            <CardTitle className="psp-section-label">Layers</CardTitle>
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
                      const token = await getAccessToken();
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
              {[0, 1, 2].map((layerIndex) => (
                <div
                  key={`layer-${layerIndex}`}
                  className="rounded-[20px] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                >
                  <div className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">
                    <span>Layer {layerIndex + 1} - Number of blows</span>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-2">
                    {layerFields
                      .slice(layerIndex * 3, layerIndex * 3 + 3)
                      .map((field) => {
                        const value = layers[field.key];
                        const warning = layerOutOfRange(value);
                        return (
                          <div
                            key={field.key}
                            className="grid min-w-0 content-start gap-1"
                          >
                            <label className="psp-label truncate">
                              {field.label}
                            </label>
                            <Input
                              type="number"
                              min={0}
                              max={35}
                              value={value}
                              onChange={(event) =>
                                updateLayerValue(field.key, event.target.value)
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
              ))}
            </div>
          </CardHeader>
        </Card>

        <div className="psp-outer">
          <div className="psp-section-label">Signature</div>

          <Select value={siteInspector} onValueChange={setSiteInspector}>
            <SelectTrigger
              className={`psp-input mt-[14px] mb-[2px] w-full bg-[var(--inner-bg)] ${siteInspector ? "psp-select-inspector-filled" : ""}`}
            >
              <SelectValue placeholder="Select inspector" />
            </SelectTrigger>
            <SelectContent>
              {inspectorOptions.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
            label={loading ? "Lodging..." : "Lodge record"}
            confirmLabel="CONFIRM?"
            onConfirm={handleLodge}
            disabled={!canSubmit || loading || duplicate}
            className="psp-button psp-button-lodge w-full shrink-0 min-h-11 text-white"
            style={{
              backgroundColor: "var(--psp-lodge-bg)",
              color: "#fff",
            }}
            confirmClassName="psp-button-warning"
          />
          {duplicate ? (
            <div className="pt-3">
              <Button
                className="w-full shrink-0 min-h-11 rounded-full border border-[#F5C7CB] bg-[#FCEBEC] px-4 py-1 font-[500] text-[#B4232C] shadow-none hover:bg-[#FCEBEC]/80 hover:text-[#B4232C] active:bg-[#FCEBEC]/70 font-[family-name:var(--font-display)]"
                style={{ fontFamily: "Manrope, var(--font-display), sans-serif" }}
                onClick={() => setOverwriteOpen(true)}
                disabled={!canSubmit}
              >
                Proceed to overwrite
              </Button>
            </div>
          ) : null}
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

      <Dialog open={overwriteOpen} onOpenChange={setOverwriteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm overwrite</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--muted-foreground)]">
            This will overwrite the existing record at chainage {chainage}. This
            action requires admin access and cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverwriteOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleOverwrite}>
              Confirm overwrite
            </Button>
          </DialogFooter>
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
                const token = await getAccessToken();
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
                const token = await getAccessToken();
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
