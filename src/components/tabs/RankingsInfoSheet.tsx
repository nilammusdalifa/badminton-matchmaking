import { useEffect, useId, useRef, useState } from "react";
import { copy } from "../../lib/copy";
import { RANK_MIN_GAMES } from "../../lib/session";
import type { ResultMode } from "../../types";
import styles from "./RankingsTab.module.css";

interface RankingsInfoSheetProps {
  resultMode: ResultMode;
  /** Viewers don't see tiers, so the explanation leaves them out. */
  hideTier?: boolean;
  onClose: () => void;
}

/** "How rankings work": one sentence first, the maths behind More. Render it in a portal; it is a real dialog. */
export function RankingsInfoSheet({ resultMode, hideTier, onClose }: RankingsInfoSheetProps) {
  const [more, setMore] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const detailsId = useId();

  // Escape closes it, and focus starts inside it.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.sheetBackdrop} onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={copy.rankings.howItWorks} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetTitle}>{copy.rankings.howItWorks}</div>
        <p className={styles.sheetSummary}>{copy.rankings.sheet.summary}</p>
        <button type="button" className={styles.sheetMore} aria-expanded={more} aria-controls={detailsId} onClick={() => setMore((m) => !m)}>
          {more ? copy.rankings.sheet.less : copy.rankings.sheet.more}
        </button>
        {more && (
          <div id={detailsId} className={styles.sheetDetails}>
            <ol className={styles.sheetList}>
              {resultMode === "score" ? (
                <li>
                  <strong>{copy.rankings.sheet.scoreMatch}</strong> {copy.rankings.sheet.scoreMatchBody}
                </li>
              ) : (
                <li>
                  <strong>{copy.rankings.sheet.winnerMatch}</strong>
                </li>
              )}
              <li>
                <strong>{copy.rankings.sheet.expected}</strong> {hideTier ? copy.rankings.sheet.expectedViewer : copy.rankings.sheet.expectedUmpire}
              </li>
              <li>
                <strong>{copy.rankings.sheet.fifty}</strong> {copy.rankings.sheet.fiftyBody}
              </li>
              <li>
                <strong>{copy.rankings.sheet.need(RANK_MIN_GAMES)}</strong>
                {copy.rankings.sheet.needBody}
              </li>
            </ol>
            <div className={styles.sheetNote}>{copy.rankings.sheet.note}</div>
          </div>
        )}
        <button className={styles.sheetClose} ref={closeRef} onClick={onClose}>
          {copy.rankings.sheet.gotIt}
        </button>
      </div>
    </div>
  );
}
