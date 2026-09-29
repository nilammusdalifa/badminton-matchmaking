import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./MatchesTab.module.css";

type MatchesTabProps = SessionStore["matches"] & { readOnly?: boolean };

export function MatchesTab({ matchLogVM, courtsCount, readOnly }: MatchesTabProps) {
  return (
    <>
      <div className={styles.section}>
        <h1 className={styles.title}>Matches</h1>
        <div className={styles.subtitle}>Every match this session, most recent first</div>
      </div>

      <div className={styles.list}>
        {matchLogVM.length === 0 && (
          <div className={styles.empty}>
            {readOnly
              ? "No matches yet."
              : courtsCount === 0
                ? "No matches yet — add a court in Manage first."
                : "No matches yet — start one from the Session tab."}
          </div>
        )}
        {matchLogVM.map((m) => (
          <div className={styles.row} key={m.id}>
            <div className={styles.rowHead}>
              <div className={styles.rowMeta}>
                <span className={styles.court}>{m.courtName}</span>
                <span className={styles.matchNum}>#{m.matchNumber}</span>
              </div>
              <span className={`${styles.badge} ${m.status === "in_progress" ? styles.inProgress : styles.completed}`}>
                {m.status === "in_progress" ? "Live" : "Final"}
              </span>
            </div>
            <div className={styles.teams}>
              <span className={`${styles.teamName} ${m.winner === "t1" ? styles.winner : m.winner === "t2" ? styles.loser : ""}`}>
                {m.t1Names}
              </span>
              <span className={styles.score}>
                {m.resultMode === "score" ? m.score : m.status === "completed" ? "Final" : "vs"}
                {m.isTie && <span className={styles.tieTag}>Tied</span>}
              </span>
              <span className={`${styles.teamName} ${m.winner === "t2" ? styles.winner : m.winner === "t1" ? styles.loser : ""}`}>
                {m.t2Names}
              </span>
            </div>
            <div className={styles.rowActions}>
              {m.status === "completed" && m.resultMode === "score" && (
                <button className={styles.actionBtn} onClick={m.onEditScore}>
                  Fix Score
                </button>
              )}
              <button className={`${styles.actionBtn} ${styles.danger}`} onClick={m.onDelete}>
                {m.status === "in_progress" ? "Cancel Match" : "Delete"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
