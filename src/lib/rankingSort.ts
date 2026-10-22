/** How the Rankings list is ordered: by rank (the default), or fewest matches played first. */
export type RankingSort = "rank" | "matches";

const KEY = "smashmatch.rankings-sort.v1";

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

/** The remembered choice, or "rank". Storage can be blocked (private mode, site data off) and
 * even reaching `localStorage` can throw, so nothing here ever lets that through. */
export function loadRankingSort(storage?: Reader): RankingSort {
  try {
    const value = (storage ?? localStorage).getItem(KEY);
    return value === "matches" ? "matches" : "rank";
  } catch {
    return "rank";
  }
}

/** Remembers the choice; if storage is blocked it simply lasts until the page closes. */
export function saveRankingSort(sort: RankingSort, storage?: Writer): void {
  try {
    (storage ?? localStorage).setItem(KEY, sort);
  } catch {
    // not remembered; the choice still works for now
  }
}

/** "Matches played" lists the fewest first. The sort is stable, so players on the
 * same count stay in their rank order. "Rank" leaves the list as it came. */
export function sortRankings<T extends { matchesPlayed: number }>(rows: T[], sort: RankingSort): T[] {
  return sort === "matches" ? [...rows].sort((a, b) => a.matchesPlayed - b.matchesPlayed) : rows;
}
