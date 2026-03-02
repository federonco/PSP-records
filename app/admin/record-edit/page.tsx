"use client";

 import { Suspense, useEffect, useMemo, useState } from "react";
 import Link from "next/link";
 import { useSearchParams } from "next/navigation";
 import { getSupabaseBrowser } from "@/lib/supabase/browser";
 import { useToast } from "@/components/toast";
 import { Button } from "@/components/ui/button";
 import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
 import { Input } from "@/components/ui/input";
 import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
 } from "@/components/ui/select";
 import {
   SignaturePad,
   SignaturePreview,
   type SignatureStrokes,
 } from "@/components/signature-pad";
 import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

 const inspectorOptions = ["Cliff Dawson", "Adam O'Neill"];

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

 type RecordPayload = {
   location_id: string;
   location_name: string | null;
   section_id: string | null;
   chainage: number;
   site_inspector: string;
   sign_off_by?: string | null;
   sign_off_at?: string | null;
   signature_strokes?: SignatureStrokes | null;
 } & Record<LayerKey, number>;

function RecordEditContent() {
   const supabase = getSupabaseBrowser();
   const { pushToast } = useToast();
   const searchParams = useSearchParams();
   const locationId = searchParams.get("locationId") ?? "";
   const chainage = Number(searchParams.get("chainage"));

   const [loading, setLoading] = useState(false);
   const [record, setRecord] = useState<RecordPayload | null>(null);
   const [siteInspector, setSiteInspector] = useState("");
   const [layers, setLayers] = useState<Record<LayerKey, string>>(() =>
     Object.fromEntries(layerFields.map((field) => [field.key, ""])) as Record<
       LayerKey,
       string
     >,
   );
   const [signatureStrokes, setSignatureStrokes] =
     useState<SignatureStrokes | null>(null);
   const [signatureOpen, setSignatureOpen] = useState(false);

   useEffect(() => {
     if (!locationId || !Number.isFinite(chainage)) return;
     const loadRecord = async () => {
       setLoading(true);
       const response = await fetch(
         `/api/psp/records/by-chainage?locationId=${locationId}&chainage=${chainage}`,
       );
       const payload = await response.json();
       setLoading(false);
       if (!response.ok) {
         pushToast({
           type: "error",
           title: "Record load failed",
           message: payload.error ?? "Unable to load record.",
         });
         return;
       }
       const data = payload.record as RecordPayload;
       setRecord(data);
       setSiteInspector(data.site_inspector ?? "");
       setSignatureStrokes(data.signature_strokes ?? null);
       setLayers(
         Object.fromEntries(
           layerFields.map((field) => [field.key, String(data[field.key] ?? "")]),
         ) as Record<LayerKey, string>,
       );
     };
     loadRecord();
   }, [chainage, locationId, pushToast]);

   const canSubmit =
     siteInspector &&
     layerFields.every((field) => {
       const value = layers[field.key];
       const num = Number(value);
       return value !== "" && !Number.isNaN(num) && num >= 0 && num <= 35;
     });

   const updateLayerValue = (key: LayerKey, value: string) => {
     setLayers((prev) => ({ ...prev, [key]: value }));
   };

   const handleSave = async () => {
     if (!record || !canSubmit) return;
     setLoading(true);
     const session = await supabase.auth.getSession();
     const token = session.data.session?.access_token;
     const response = await fetch("/api/psp/records/overwrite", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
       },
       body: JSON.stringify({
         locationId: record.location_id,
         locationName: record.location_name,
         chainage: record.chainage,
         siteInspector,
         sectionId: record.section_id,
         layers: Object.fromEntries(
           layerFields.map((field) => [field.key, Number(layers[field.key])]),
         ),
       }),
     });
     const payload = await response.json();
     if (!response.ok) {
       setLoading(false);
       pushToast({
         type: "error",
         title: "Save failed",
         message: payload.error ?? "Unable to update record.",
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
           locationId: record.location_id,
           chainage: record.chainage,
           inspectorName: siteInspector,
           signatureStrokes,
         }),
       });
       const signaturePayload = await signatureResponse.json();
       if (!signatureResponse.ok) {
         pushToast({
           type: "error",
           title: "Signature failed",
           message: signaturePayload.error ?? "Unable to save signature",
         });
       } else {
         setRecord((prev) =>
           prev
             ? {
                 ...prev,
                 sign_off_by: siteInspector,
                 sign_off_at: signaturePayload.signOffAt ?? prev.sign_off_at,
               }
             : prev,
         );
       }
     }

     setLoading(false);
     pushToast({ type: "success", title: "Record updated" });
   };

   const handleSaveSignature = async (payload: SignatureStrokes) => {
     setSignatureStrokes(payload);
     setSignatureOpen(false);
     pushToast({ type: "success", title: "Signature captured" });
   };

  const handleDelete = async () => {
    if (!record) return;
    const confirmed = window.confirm(
      `Delete record at Ch ${record.chainage}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setLoading(true);
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    const response = await fetch("/api/psp/records/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        locationId: record.location_id,
        chainage: record.chainage,
      }),
    });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      pushToast({
        type: "error",
        title: "Delete failed",
        message: payload.error ?? "Unable to delete record.",
      });
      return;
    }
    pushToast({ type: "success", title: "Record deleted" });
    window.location.href = "/admin";
  };

   const summaryTitle = useMemo(() => {
     if (!record) return "Edit Record";
     return `${record.location_name ?? record.location_id} · Ch ${record.chainage}`;
   }, [record]);

   return (
     <div className="psp-page">
       <div className="psp-shell">
         <header className="psp-header space-y-3">
           <div className="flex items-center justify-between">
             <div>
               <p className="text-xs font-semibold uppercase text-[var(--muted-foreground)]">
                 PSP Admin Center
               </p>
               <h1 className="psp-title text-xl text-[var(--ink)]">
                 Edit Record
               </h1>
             </div>
             <Button asChild variant="outline" size="sm" className="h-8 px-3">
               <Link href="/admin">Back to Admin</Link>
             </Button>
           </div>
         </header>

         <Card className="psp-card">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm">{summaryTitle}</CardTitle>
           </CardHeader>
           <CardContent className="space-y-3">
             <div className="space-y-1">
               <label className="psp-label">Chainage (Ch)</label>
               <Input
                 type="number"
                 className="psp-input"
                 value={Number.isFinite(chainage) ? chainage : ""}
                 readOnly
               />
             </div>
             <div className="space-y-1">
               <label className="psp-label">Site Inspector</label>
               <Select value={siteInspector} onValueChange={setSiteInspector}>
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
           </CardContent>
         </Card>

         <Card className="psp-card">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm">Layers</CardTitle>
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
                     {layerFields
                       .slice(layerIndex * 3, layerIndex * 3 + 3)
                       .map((field) => (
                         <div key={field.key} className="space-y-1">
                           <label className="psp-label">{field.label}</label>
                           <Input
                             type="number"
                             min={0}
                             max={35}
                             value={layers[field.key]}
                             onChange={(event) =>
                               updateLayerValue(field.key, event.target.value)
                             }
                             className="psp-input"
                           />
                         </div>
                       ))}
                   </div>
                 </div>
               ))}
             </div>
           </CardContent>
         </Card>

         <Card className="psp-card">
           <CardHeader className="pb-2">
             <CardTitle className="text-sm">Signature</CardTitle>
           </CardHeader>
           <CardContent className="space-y-2">
             <div className="flex items-center justify-between">
               <p className="text-sm font-semibold">Signature</p>
               <Button
                 type="button"
                 size="sm"
                 className="psp-button psp-button-primary h-9 px-3 text-xs"
                 onClick={() => setSignatureOpen(true)}
                 disabled={!siteInspector}
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
             {record?.sign_off_at ? (
               <p className="text-xs text-[var(--muted-foreground)]">
                 Signed by {record.sign_off_by ?? "Unknown"} at{" "}
                 {new Date(record.sign_off_at).toLocaleString()}
               </p>
             ) : null}
           </CardContent>
         </Card>

         <Card className="psp-card">
           <CardContent className="pt-0 text-[#16a34a]">
            <div className="flex flex-col gap-2">
              <Button
                className="psp-button psp-button-primary w-full"
                onClick={handleSave}
                disabled={!canSubmit || loading}
              >
                {loading ? "Saving..." : "Save Record"}
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleDelete}
                disabled={loading || !record}
              >
                Delete Record
              </Button>
            </div>
           </CardContent>
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
     </div>
   );
 }

export default function RecordEditPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RecordEditContent />
    </Suspense>
  );
}
