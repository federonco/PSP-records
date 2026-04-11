"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  PspLodgeForm,
  type PspLodgeLockedEntry,
} from "@/components/psp-lodge-form";

type EnterState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; locked: PspLodgeLockedEntry };

const INVALID_MSG =
  "QR code not recognised. Please scan again or contact your supervisor.";

function EnterContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [state, setState] = useState<EnterState>({ status: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ status: "error", message: INVALID_MSG });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/psp/enter?token=${encodeURIComponent(token)}`,
        );
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ status: "error", message: INVALID_MSG });
          return;
        }
        setState({
          status: "ok",
          locked: {
            locationId: payload.locationId,
            locationName: payload.locationName ?? "",
            unifiedSectionId: payload.unifiedSectionId,
            subsectionId: payload.subsectionId ?? null,
            sectionName: payload.sectionName ?? "",
            subsectionName: payload.subsectionName ?? null,
          },
        });
      } catch {
        if (!cancelled) setState({ status: "error", message: INVALID_MSG });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="psp-page flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--ink)]" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="psp-page p-6">
        <p className="text-center text-sm text-[var(--ink)]">{state.message}</p>
      </div>
    );
  }

  return <PspLodgeForm lockedEntry={state.locked} />;
}

export default function EnterPage() {
  return (
    <Suspense
      fallback={
        <div className="psp-page flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--ink)]" />
        </div>
      }
    >
      <EnterContent />
    </Suspense>
  );
}
