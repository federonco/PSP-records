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

function mapEnterPayload(payload: Record<string, unknown>): PspLodgeLockedEntry {
  const typ = payload.type;
  const num = (v: unknown) =>
    v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;

  if (typ === "section") {
    return {
      unifiedSectionId: String(payload.id ?? ""),
      subsectionId: null,
      sectionName: String(payload.name ?? ""),
      subsectionName: null,
      chainageStart: num(payload.start_ch),
      chainageEnd: num(payload.end_ch),
      chainageDirection:
        typeof payload.direction === "string" ? payload.direction : null,
    };
  }

  const parent = payload.sections as
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null
    | undefined;
  const parentRow = Array.isArray(parent) ? parent[0] : parent;

  return {
    unifiedSectionId: String(parentRow?.id ?? payload.section_id ?? ""),
    subsectionId: String(payload.id ?? ""),
    sectionName: String(parentRow?.name ?? ""),
    subsectionName: String(payload.name ?? ""),
    chainageStart: num(payload.start_ch),
    chainageEnd: num(payload.end_ch),
    chainageDirection:
      typeof payload.direction === "string" ? payload.direction : null,
  };
}

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
        const payload = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        if (cancelled) return;
        if (!res.ok) {
          if (res.status !== 404) {
            console.error("[enter] lookup failed", {
              status: res.status,
              tokenPrefix: `${token.slice(0, 8)}…`,
              body: payload,
            });
          }
          setState({ status: "error", message: INVALID_MSG });
          return;
        }
        if (payload.type !== "section" && payload.type !== "subsection") {
          console.error("[enter] unexpected payload", payload);
          setState({ status: "error", message: INVALID_MSG });
          return;
        }
        setState({ status: "ok", locked: mapEnterPayload(payload) });
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
