import { Fragment } from "react";
import { copy } from "../lib/copy";
import { formatSchedule } from "../lib/locale";
import type { SessionStore } from "../hooks/useSessionStore";
import styles from "./ReviewScreen.module.css";

type ReviewProps = SessionStore["review"] & {
  /** View-only: no way to start a new session. */
  readOnly?: boolean;
};

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function ReviewScreen({ sessionName, sessionSchedule, matchesCompleted, playersCount, courtsCount, resultMode, rankingsVM, onShareRankings, onStartNew, readOnly }: ReviewProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.heading}>
        <div className={styles.title}>{copy.review.title}</div>
        <div className={styles.subtitle}>{copy.header.line([sessionName, formatSchedule(sessionSchedule)])}</div>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <div className={styles.statValue}>{matchesCompleted}</div>
          <div className={styles.statLabel}>{copy.review.matchesPlayed}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{playersCount}</div>
          <div className={styles.statLabel}>{copy.review.players}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statValue}>{courtsCount}</div>
          <div className={styles.statLabel}>{copy.review.courts}</div>
        </div>
      </div>
      <div className={styles.sectionLabel}>{copy.review.finalRankings}</div>
      {resultMode !== "none" && <div className={styles.columnHead}>{copy.rankings.scoreColumn}</div>}
      <div className={styles.list}>
        {rankingsVM.map((r, i) => (
          <Fragment key={r.id}>
            {resultMode !== "none" && r.section !== "ranked" && r.section !== rankingsVM[i - 1]?.section && (
              <div className={styles.sectionLabel}>{r.section === "tooFew" ? copy.rankings.groupTooFew : copy.rankings.groupNotRanked}</div>
            )}
            <div className={styles.row}>
              <span className={styles.rank}>{r.medal ? MEDAL[r.medal] : (r.rank ?? "")}</span>
              <span className={styles.name}>{r.name}</span>
              <span className={styles.record}>
                {r.wins}–{r.losses}
              </span>
              {resultMode !== "none" && r.played > 0 && (
                <span className={`${styles.diff} ${styles.positive}`}>
                  {r.score}
                </span>
              )}
            </div>
          </Fragment>
        ))}
      </div>
      {rankingsVM.some((r) => r.rank !== null) && (
        <button className={styles.shareBtn} onClick={onShareRankings}>
          {copy.review.shareRankings}
        </button>
      )}
      {!readOnly && (
        <button className={styles.startNewBtn} onClick={onStartNew}>
          {copy.review.newSession}
        </button>
      )}
    </div>
  );
}
