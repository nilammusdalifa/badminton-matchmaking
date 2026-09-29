import { useEffect, useState } from "react";
import { CloseIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ScorekeeperSheet.module.css";

type ScorekeeperProps = SessionStore["scorekeeper"];

export function ScorekeeperSheet({
  open,
  courtLabel,
  t1p1,
  t1p2,
  t2p1,
  t2p2,
  t1,
  t2,
  isGameOver,
  isLikelyIncomplete,
  isTie,
  isEditingCompleted,
  addT1,
  addT2,
  setT1,
  setT2,
  focusSelect,
  undo,
  saveFinal,
  close,
  onCancelMatch,
}: ScorekeeperProps) {
  // A tie or a score that never reached 21 probably wasn't actually
  // finished — require a second tap instead of silently saving it as final.
  const [pendingConfirm, setPendingConfirm] = useState(false);
  useEffect(() => {
    setPendingConfirm(false);
  }, [courtLabel]);
  // A level score is normal mid-game (0-0, 20-20), so the "can't tie" note
  // only appears once someone actually tries to save one, and goes away as
  // soon as the score changes.
  const [tieAttempted, setTieAttempted] = useState(false);
  useEffect(() => {
    setTieAttempted(false);
  }, [courtLabel, t1, t2]);

  if (!open) return null;

  const handleSave = () => {
    // Ties are never a real badminton result — no override, unlike the
    // "looks unfinished" case below. The only honest way out of a tied
    // score is Cancel Match, not a second tap here.
    if (isTie) {
      setTieAttempted(true);
      return;
    }
    if (isLikelyIncomplete && !pendingConfirm) {
      setPendingConfirm(true);
      return;
    }
    saveFinal();
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.sheet}>
        <div className={styles.head}>
          <div>
            <div className={styles.headTitle}>{courtLabel}</div>
            <div className={styles.headHint}>
              {isEditingCompleted ? "Fix the score, then save." : "Tap +1 or type a score."}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={close} aria-label="Close scorekeeper">
            <CloseIcon />
          </button>
        </div>
        <div className={styles.grid}>
          <div className={styles.teamCol}>
            <div className={`${styles.teamLabel} ${styles.a}`}>Team A</div>
            <div className={styles.teamNames}>
              {t1p1} &amp; {t1p2}
            </div>
            <input type="number" min={0} max={99} className={styles.scoreInput} value={t1} onChange={setT1} onFocus={focusSelect} />
            <button className={`${styles.plusBtn} ${styles.a}`} onClick={addT1} disabled={isGameOver}>
              +1
            </button>
          </div>
          <div className={styles.teamCol}>
            <div className={`${styles.teamLabel} ${styles.b}`}>Team B</div>
            <div className={styles.teamNames}>
              {t2p1} &amp; {t2p2}
            </div>
            <input type="number" min={0} max={99} className={styles.scoreInput} value={t2} onChange={setT2} onFocus={focusSelect} />
            <button className={`${styles.plusBtn} ${styles.b}`} onClick={addT2} disabled={isGameOver}>
              +1
            </button>
          </div>
        </div>
        {isTie && tieAttempted ? (
          <div className={styles.gameOverNote}>A game can't end tied. Keep scoring, or cancel the match.</div>
        ) : pendingConfirm ? (
          <div className={styles.gameOverNote}>Looks unfinished. Tap again to save anyway.</div>
        ) : (
          isGameOver && <div className={styles.gameOverNote}>Game over — save the result</div>
        )}
        <div className={styles.footer}>
          <button className={styles.undoBtn} onClick={undo}>
            Undo Point
          </button>
          <button className={styles.saveBtn} onClick={handleSave}>
            {pendingConfirm ? "Save Anyway?" : isEditingCompleted ? "Update Result" : "Save Final Result"}
          </button>
        </div>
        <button className={styles.cancelMatchBtn} onClick={onCancelMatch}>
          {isEditingCompleted ? "Delete this match instead" : "Wrong match? Cancel it instead"}
        </button>
      </div>
    </div>
  );
}
