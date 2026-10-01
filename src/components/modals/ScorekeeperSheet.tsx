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
  // A tie or a score that never reached 21 probably wasn't actually finished
  // (an injury, time up), so saving asks first instead of silently recording
  // it as a full win and loss. "Don't count result" keeps the score in the log
  // but changes nobody's record; "Count as final" is there for a game that
  // really did end that way. A tie is never a real result, so it only gets
  // the first option. The prompt goes away as soon as the score changes.
  const [askEndedEarly, setAskEndedEarly] = useState(false);
  useEffect(() => {
    setAskEndedEarly(false);
  }, [courtLabel, t1, t2]);

  if (!open) return null;

  const handleSave = () => {
    if (isTie || isLikelyIncomplete) {
      setAskEndedEarly(true);
      return;
    }
    saveFinal("final");
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
        {askEndedEarly ? (
          <div className={styles.endedEarly}>
            <div className={styles.endedEarlyTitle}>Match ended early?</div>
            <div className={styles.gameOverNote}>
              {isTie ? "A game can't end tied. " : "Looks unfinished. "}
              Not counting it keeps everyone&apos;s wins, losses and points as they were. It still counts as a game played.
            </div>
            <button className={styles.saveBtn} onClick={() => saveFinal("early")}>
              Don&apos;t count result
            </button>
            {!isTie && (
              <button className={styles.undoBtn} onClick={() => saveFinal("final")}>
                Count as final
              </button>
            )}
            <button className={styles.cancelMatchBtn} onClick={() => setAskEndedEarly(false)}>
              Keep scoring
            </button>
          </div>
        ) : (
          <>
            {isGameOver && <div className={styles.gameOverNote}>Game over — save the result</div>}
            <div className={styles.footer}>
              <button className={styles.undoBtn} onClick={undo}>
                Undo Point
              </button>
              <button className={styles.saveBtn} onClick={handleSave}>
                {isEditingCompleted ? "Update Result" : "Save Final Result"}
              </button>
            </div>
          </>
        )}
        <button className={styles.cancelMatchBtn} onClick={onCancelMatch}>
          {isEditingCompleted ? "Delete this match instead" : "Wrong match? Cancel it instead"}
        </button>
      </div>
    </div>
  );
}
