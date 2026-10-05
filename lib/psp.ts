 export const START_CHAINAGE = 3210;
 export const CHAINAGE_STEP = 20;
 export const BLOCK_SIZE = 10;

 export function normalizeChainage(value: number) {
  const snapped = Math.floor(value / CHAINAGE_STEP) * CHAINAGE_STEP;
   return snapped;
 }

export function getNextSuggestion(
  maxChainage?: number | null,
  direction: "backwards" | "onwards" = "backwards",
) {
  if (!maxChainage) return START_CHAINAGE;
  const suggestion =
    direction === "onwards"
      ? maxChainage + CHAINAGE_STEP
      : maxChainage - CHAINAGE_STEP;
  return normalizeChainage(suggestion);
}

export function getBlockChainages(maxChainage: number) {
  const chainages = Array.from({ length: BLOCK_SIZE }, (_, idx) =>
    maxChainage - idx * CHAINAGE_STEP,
  );
  return chainages;
}

export type DisjointChainageBlock = {
  index: number;
  key: string;
  start: number;
  end: number;
  expected: number[];
  pending: number[];
  recordCount: number;
  status: "READY" | "OPEN";
};

/**
 * Partition real chainages into disjoint pages of BLOCK_SIZE.
 * Each page starts at the next chainage after the previous page ends.
 * No arithmetic padding past the data, so a chainage appears once.
 * Pending is the chainages in that page whose own record is incomplete.
 */
/** Parse `hi-lo` block_key into inclusive chainage span (hi >= lo). */
export function spanFromBlockKey(
  blockKey: string,
): { hi: number; lo: number } | null {
  const parts = String(blockKey ?? "").split("-");
  if (parts.length < 2) return null;
  const a = Number(parts[0]);
  const b = Number(parts[parts.length - 1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { hi: Math.max(a, b), lo: Math.min(a, b) };
}

function spansOverlap(
  a: { hi: number; lo: number },
  b: { hi: number; lo: number },
): boolean {
  return a.lo <= b.hi && b.lo <= a.hi;
}

/**
 * Within each section/subsection scope, drop older reports that overlap a
 * newer one. Prefer recent data when block ranges collide.
 */
export function preferRecentNonOverlappingReports<
  T extends {
    block_key: string;
    created_at?: string | null;
    unified_section_id?: string | null;
    subsection_id?: string | null;
  },
>(reports: T[]): T[] {
  const byScope = new Map<string, T[]>();
  for (const report of reports) {
    const scope = `${report.unified_section_id ?? ""}|${report.subsection_id ?? ""}`;
    const list = byScope.get(scope) ?? [];
    list.push(report);
    byScope.set(scope, list);
  }
  const kept: T[] = [];
  for (const list of byScope.values()) {
    const ordered = [...list].sort((a, b) => {
      const ta = Date.parse(String(a.created_at ?? "")) || 0;
      const tb = Date.parse(String(b.created_at ?? "")) || 0;
      return tb - ta;
    });
    const accepted: { hi: number; lo: number }[] = [];
    for (const report of ordered) {
      const span = spanFromBlockKey(report.block_key);
      if (!span) {
        kept.push(report);
        continue;
      }
      if (accepted.some((other) => spansOverlap(span, other))) continue;
      accepted.push(span);
      kept.push(report);
    }
  }
  return kept;
}

export function buildDisjointChainageBlocks(
  chainages: number[],
  isComplete?: (chainage: number) => boolean,
): DisjointChainageBlock[] {
  const unique = [...new Set(chainages.filter((value) => Number.isFinite(value)))].sort(
    (a, b) => b - a,
  );
  const blocks: DisjointChainageBlock[] = [];
  for (let offset = 0, index = 1; offset < unique.length; offset += BLOCK_SIZE, index += 1) {
    const expected = unique.slice(offset, offset + BLOCK_SIZE);
    const end = expected[0];
    const start = expected[expected.length - 1];
    const pending = isComplete
      ? expected.filter((chainage) => !isComplete(chainage))
      : [];
    blocks.push({
      index,
      key: `${end}-${start}`,
      start,
      end,
      expected,
      pending,
      recordCount: expected.length,
      status: pending.length > 0 ? "OPEN" : "READY",
    });
  }
  return blocks;
}

/** Explicit `app_config.chainage_increment`; null when missing/invalid (no silent default). */
export function readChainageIncrement(appConfig: unknown): number | null {
  if (!appConfig || typeof appConfig !== "object" || Array.isArray(appConfig)) {
    return null;
  }
  const raw = (appConfig as Record<string, unknown>).chainage_increment;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Expected PSP grid: absolute multiples of `increment` inside [start,end]
 * (inclusive). Anchors to the increment lattice, not a walk from a possibly
 * off-grid start_ch (e.g. 773 with records on 760,740,…).
 */
export function buildExpectedChainages(
  start: number,
  end: number,
  increment: number,
): number[] {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(increment) ||
    increment <= 0
  ) {
    return [];
  }
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const first = Math.ceil(lo / increment) * increment;
  const out: number[] = [];
  for (let v = first; v <= hi + 1e-9; v += increment) {
    const n = Number(v.toFixed(10));
    if (n >= lo - 1e-9 && n <= hi + 1e-9) out.push(n);
  }
  return out;
}

export function isChainageGridComplete(
  expected: number[],
  completedChainages: Iterable<number>,
): boolean {
  if (!expected.length) return false;
  const done = new Set(
    [...completedChainages].map((c) => Number(c)).filter(Number.isFinite),
  );
  return expected.every((ch) => done.has(ch));
}
