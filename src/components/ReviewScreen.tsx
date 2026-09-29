import type { SessionStore } from "../hooks/useSessionStore";
import styles from "./ReviewScreen.module.css";

type ReviewProps = SessionStore["review"];

export function ReviewScreen({ sessionName, sessionSchedule, matchesCompleted, playersCount, courtsCount, resultMode, rankingsVM, onStartNew }: ReviewProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        <div className={styles.title}>Session Complete</div>
        <div className={styles.subtitle}>{sessionSchedule ? `${sessionName} · ${sessionSchedule}` : sessionName}</div>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{matchesCompleted}</div>
          <div className={styles.statLabel}>Matches Played</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{playersCount}</div>
          <div className={styles.statLabel}>Players</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{courtsCount}</div>
          <div className={styles.statLabel}>Courts</div>
        </div>
      </div>
      <div className={styles.sectionLabel}>Final Rankings</div>
      <div className={styles.list}>
        {rankingsVM.map((r) => (
          <div className={styles.row} key={r.id}>
            <span className={styles.rank}>{r.rank}</span>
            <span className={styles.name}>{r.name}</span>
            <span className={styles.record}>
              {r.wins}W–{r.losses}L
            </span>
            {resultMode === "score" && (
              <span className={`${styles.diff} ${r.positiveDiff ? styles.positive : styles.negative}`}>{r.diffLabel} pts</span>
            )}
          </div>
        ))}
      </div>
      <button className={styles.startNewBtn} onClick={onStartNew}>
        Start New Session
      </button>
    </div>
  );
}
