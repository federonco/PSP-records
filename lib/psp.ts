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
