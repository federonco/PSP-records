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
 import { getSupabaseBrowser } from "@/lib/supabase/browser";
 import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
 import { Button } from "@/components/ui/button";
 import {
   Card,
   CardContent,
   CardFooter,
   CardHeader,
   CardTitle,
 } from "@/components/ui/card";
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

 type Location = { id: string; name: string };
 type Section = { id: string; name: string };

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

 const inspectorOptions = ["Inspector A", "Inspector B", "Inspector C"];

 export default function Home() {
   const supabase = getSupabaseBrowser();
   const { pushToast } = useToast();
  const router = useRouter();
   const [authEmail, setAuthEmail] = useState<string | null>(null);
   const [locations, setLocations] = useState<Location[]>([]);
   const [sections, setSections] = useState<Section[]>([]);
   const [locationId, setLocationId] = useState("");
   const [locationName, setLocationName] = useState("");
   const [sectionId, setSectionId] = useState("");
  const [chainage, setChainage] = useState<number>(0);
  const [chainageDisplay, setChainageDisplay] = useState("0.00");
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

   const selectedLocation = useMemo(
     () => locations.find((loc) => loc.id === locationId),
     [locationId, locations],
   );

  const locationSelectValue = locationId || undefined;

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
    if (authEmail && adminAuthOpen) {
      setAdminAuthOpen(false);
      router.push("/admin");
    }
  }, [adminAuthOpen, authEmail, router]);

   useEffect(() => {
     if (!authEmail) return;
     const loadLocations = async () => {
       const { data, error } = await supabase
         .from("psp_locations")
         .select("id,name")
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
     setSections([]);
     setLocationId("");
     setSectionId("");
     setLocationName("");
     setChainage(0);
     setDuplicate(false);
     setRecordId(null);
     setSignOffBy(null);
     setSignOffAt(null);
     setSignatureStrokes(null);
   }, [authEmail]);

   useEffect(() => {
     if (selectedLocation) {
       setLocationName(selectedLocation.name);
     }
   }, [selectedLocation]);

   useEffect(() => {
     if (!authEmail || !locationId) return;
     const loadSections = async () => {
      const token = await getAccessToken();
       const response = await fetch(
         `/api/psp/sections?locationId=${locationId}`,
         {
           headers: token ? { Authorization: `Bearer ${token}` } : undefined,
         },
       );
       const payload = await response.json();
       if (!response.ok) {
         pushToast({
           type: "error",
           title: "Failed to load sections",
           message: payload.error ?? "Unable to load sections",
         });
         return;
       }
       setSections(payload.sections ?? []);
       if (payload.sections?.length) {
         setSectionId(payload.sections[0].id);
       } else {
         setSectionId("");
       }
     };
     loadSections();
   }, [authEmail, locationId, pushToast, supabase]);

  useEffect(() => {
    if (!locationId) return;
     const updateSuggestion = async () => {
      const token = await getAccessToken();
    const response = await fetch(
      `/api/psp/next-chainage?locationId=${locationId}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      },
    );
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
     };
    updateSuggestion();
  }, [locationId, pushToast, supabase]);

  useEffect(() => {
     if (!locationId || !chainage || !authEmail) return;
     const checkDuplicate = async () => {
      setChecking(true);
      try {
        const token = await getAccessToken();
        if (!token) {
          pushToast({
            type: "error",
            title: "Sign in required",
            message: "Authenticate before checking duplicates.",
          });
          return;
        }
        const response = await fetch(
          `/api/psp/exists?locationId=${locationId}&chainage=${chainage}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          },
        );
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
  }, [authEmail, chainage, locationId, pushToast, supabase]);

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
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before lodging records.",
      });
      setLoading(false);
      return;
    }
     const response = await fetch("/api/psp/records", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
         locationName,
         sectionId: sectionId || null,
         chainage,
         siteInspector,
         layers,
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
    const nextResponse = await fetch(
      `/api/psp/next-chainage?locationId=${locationId}`,
      {
        headers: nextToken ? { Authorization: `Bearer ${nextToken}` } : undefined,
      },
    );
     const nextPayload = await nextResponse.json();
     if (nextResponse.ok) {
       setChainage(nextPayload.chainage);
     }
   };

   const handleOverwrite = async () => {
     if (!canSubmit || !duplicate) return;
     setLoading(true);
    const token = await getAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before overwriting records.",
      });
      setLoading(false);
      return;
    }
     const response = await fetch("/api/psp/records/overwrite", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId,
         locationName,
         sectionId: sectionId || null,
         chainage,
         siteInspector,
         layers,
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
       pushToast({
         type: "warning",
         title: "Record missing",
         message: "Lodge the record before signing.",
       });
       return;
     }
    const token = await getAccessToken();
    if (!token) {
      pushToast({
        type: "error",
        title: "Sign in required",
        message: "Authenticate before saving signatures.",
      });
      return;
    }
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
        <header className="psp-header space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                PSP Record Sheet
              </p>
              <h1 className="psp-title text-xl text-[var(--ink)]">
                PSP Record Sheet
              </h1>
            </div>
            <Button
              variant="ghost"
              className="psp-button psp-button-ghost h-9"
              onClick={() => {
                if (authEmail) {
                  router.push("/admin");
                } else {
                  setAdminAuthOpen(true);
                }
              }}
            >
              Admin mode
            </Button>
          </div>
          {!authEmail ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Sign in via Admin mode to lodge records.
            </p>
          ) : null}
        </header>

        <Card className="psp-card h-[90px] gap-3 py-3">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">Location</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 items-center pt-0 -mt-[9px]">
            <Select
              value={locationSelectValue}
              onValueChange={(value) => setLocationId(value)}
              disabled={!authEmail}
            >
              <SelectTrigger className="psp-input -mt-[5px] w-[320px]">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent className="w-[360px] -mt-[2px] p-0">
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id} className="h-10 items-center">
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="psp-card-dark h-[180px]">
          <CardHeader className="pb-0">
            <CardTitle className="text-[16px] font-semibold text-[var(--text-inverse-muted)]">
              Current Chainage (m)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="flex w-full items-center justify-between gap-3 -mt-[23px]">
              <Button
                variant="outline"
                size="icon"
                className="h-[84px] w-[84px] rounded-full border-0 bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]"
                onClick={() =>
                  handleAdjustChainage(-CHAINAGE_STEP)
                }
              >
                -
              </Button>
              <Input
                type="text"
                inputMode="decimal"
                value={chainageDisplay}
                onChange={(event) => handleChainageChange(event.target.value)}
                onBlur={handleChainageBlur}
                className="psp-mono psp-hero h-14 w-full max-w-[224px] bg-[var(--surface-alt)] text-center text-[var(--ink)]"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-[84px] w-[84px] rounded-full border-0 bg-[var(--surface)] text-[var(--ink)] shadow-[var(--shadow)]"
                onClick={() =>
                  handleAdjustChainage(CHAINAGE_STEP)
                }
              >
                +
              </Button>
            </div>
            {checking ? (
              <div className="w-full max-w-[260px] space-y-1">
                <div className="text-center text-xs text-[var(--text-inverse-muted)]">
                  Checking...
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--text-inverse)/0.2]">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--text-inverse)]" />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {duplicate ? (
          <Alert className="border-[var(--warning)] bg-[color:var(--warning)/0.08] text-[var(--warning)]">
            <AlertTitle>Already recorded</AlertTitle>
            <AlertDescription>
              This chainage already exists. Overwrite requires confirmation.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card className="psp-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Layers</CardTitle>
              <span className="text-xs text-[var(--muted-foreground)]">0 - 30</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3">
              {[0, 1, 2].map((layerIndex) => (
                <div
                  key={`layer-${layerIndex}`}
                  className="rounded-[20px] bg-[var(--surface)] p-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]"
                >
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--muted-foreground)]">
                    <span>Layer {layerIndex + 1}</span>
                    <span>Number of blows</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {layerFields.slice(layerIndex * 3, layerIndex * 3 + 3).map(
                      (field) => {
                        const value = layers[field.key];
                        const warning = layerOutOfRange(value);
                        return (
                          <div key={field.key} className="space-y-1">
                            <label className="psp-label">{field.label}</label>
                            <Input
                              type="number"
                              min={0}
                              max={35}
                              value={value}
                              onChange={(event) =>
                                updateLayerValue(field.key, event.target.value)
                              }
                              className={`psp-input ${warning ? "border-[var(--danger)] bg-[color:var(--danger)/0.08]" : ""}`}
                            />
                            {warning ? (
                              <p className="text-xs text-[var(--danger)]">
                                Out of Tolerance
                              </p>
                            ) : null}
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="psp-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Inspector + Signature</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="psp-label">Site Inspector</label>
              <Select
                value={siteInspector}
                onValueChange={setSiteInspector}
                disabled={!authEmail}
              >
                <SelectTrigger className="psp-input">
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
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Signature</p>
                <Button
                  type="button"
                  size="sm"
                  className="psp-button psp-button-primary h-9 px-3 text-xs"
                  onClick={() => setSignatureOpen(true)}
                  disabled={!authEmail || !siteInspector}
                >
                  Tap to Sign
                </Button>
              </div>
              {signatureStrokes ? (
                <SignaturePreview strokes={signatureStrokes} />
              ) : (
                <div className="rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
                  No signature saved.
                </div>
              )}
              {signOffAt ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  Signed by {signOffBy ?? "Unknown"} at{" "}
                  {new Date(signOffAt).toLocaleString()}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="psp-card">
          <CardContent className="pt-0">
            <ConfirmButton
              label={loading ? "Lodging..." : "Lodge Record"}
              confirmLabel="CONFIRM?"
              onConfirm={handleLodge}
              disabled={!authEmail || !canSubmit || loading || duplicate}
              className="psp-button psp-button-primary w-full"
              confirmClassName="psp-button-warning"
            />
          </CardContent>
          {duplicate ? (
            <CardFooter className="pt-3">
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setOverwriteOpen(true)}
                disabled={!authEmail || !canSubmit}
              >
                Proceed to overwrite
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </div>

      <Dialog open={signatureOpen} onOpenChange={setSignatureOpen}>
        <DialogContent className="max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Inspector Signature</DialogTitle>
          </DialogHeader>
          <SignaturePad
            onSave={handleSaveSignature}
            onCancel={() => setSignatureOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={adminAuthOpen} onOpenChange={setAdminAuthOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Admin sign-in</DialogTitle>
          </DialogHeader>
          <AuthPanel onAuthChange={setAuthEmail} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminAuthOpen(false)}>
              Close
            </Button>
          </DialogFooter>
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
    </div>
  );
 }
