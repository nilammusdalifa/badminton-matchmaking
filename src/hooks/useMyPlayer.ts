import { useCallback, useState } from "react";

const KEY = "smashmatch.you.v1";

/** "Who are you?" for someone watching a shared session: remembered on this
 * device only (never sent anywhere), so the queue and rankings can point them
 * out. Storage can be unavailable (private mode), in which case it just lasts
 * until the page is closed. */
export function useMyPlayer(): [string | null, (id: string | null) => void] {
  const [id, setId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const update = useCallback((next: string | null) => {
    setId(next);
    try {
      if (next) localStorage.setItem(KEY, next);
      else localStorage.removeItem(KEY);
    } catch {
      // not remembered across visits; the choice still works for now
    }
  }, []);
  return [id, update];
}
