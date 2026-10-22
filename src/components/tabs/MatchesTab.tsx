import { WinMark } from "../WinMark";
import { copy } from "../../lib/copy";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./MatchesTab.module.css";

type MatchesTabProps = SessionStore["matches"] & { readOnly?: boolean };

export function MatchesTab({ matchLogVM, courtsCount, readOnly }: MatchesTabProps) {
  return (
    <>
      <div className={styles.section}>
        <h1 className={styles.title}>{copy.matches.title}</h1>
      </div>

      <div className={styles.list}>
        {matchLogVM.length === 0 && (
          <div className={styles.empty}>
            {readOnly ? copy.matches.empty : courtsCount === 0 ? copy.matches.emptyNoCourts : copy.matches.emptyStart}
          </div>
        )}
        {matchLogVM.map((m) => (
          <div className={styles.row} key={m.id}>
            <div className={styles.rowHead}>
              <div className={styles.rowMeta}>
                <span className={styles.court}>{copy.matches.heading(m.matchNumber, m.courtName)}</span>
                {m.startedLabel && <span className={styles.startedAt}>{copy.matches.started(m.startedLabel)}</span>}
              </div>
              {m.status === "in_progress" && <span className={`${styles.badge} ${styles.inProgress}`}>{copy.matches.live}</span>}
            </div>
            <div className={styles.teams}>
              <span className={`${styles.teamName} ${m.winner === "t1" ? styles.winner : m.winner === "t2" ? styles.loser : ""}`}>
                {m.winner === "t1" && <WinMark />}
                {m.t1Names}
              </span>
              <span className={styles.score}>
                {m.resultMode === "score" ? m.score : m.status === "completed" ? copy.session.final : copy.matches.vs}
                {m.isTie && <span className={styles.tieTag}>{copy.session.tied}</span>}
              </span>
              <span className={`${styles.teamName} ${m.winner === "t2" ? styles.winner : m.winner === "t1" ? styles.loser : ""}`}>
                {m.winner === "t2" && <WinMark />}
                {m.t2Names}
              </span>
            </div>
            {m.notCounted && <div className={styles.notCounted}>{copy.matches.endedEarly}</div>}
            {!readOnly && (
              <div className={styles.rowActions}>
                {m.status === "completed" && m.resultMode === "score" && (
                  <button className={styles.actionBtn} onClick={m.onEditScore}>
                    {copy.matches.editScore}
                  </button>
                )}
                <button className={`${styles.actionBtn} ${styles.danger}`} onClick={m.onDelete}>
                  {m.status === "in_progress" ? copy.matches.cancelMatch : copy.matches.deleteMatch}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
