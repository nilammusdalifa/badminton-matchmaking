import { useCallback, useState } from "react";
import { loadRankingSort, saveRankingSort, type RankingSort } from "../lib/rankingSort";

/** The Rankings sort choice, remembered on this device. */
export function useRankingSort(): [RankingSort, (sort: RankingSort) => void] {
  const [sort, setSort] = useState<RankingSort>(() => loadRankingSort());
  const update = useCallback((next: RankingSort) => {
    setSort(next);
    saveRankingSort(next);
  }, []);
  return [sort, update];
}
