import { Fragment } from "react";
import type { SessionStore } from "../hooks/useSessionStore";
import styles from "./ReviewScreen.module.css";

type ReviewProps = SessionStore["review"];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function ReviewScreen({ sessionName, sessionSchedule, matchesCompleted, playersCount, courtsCount, resultMode, rankingsVM, onShareRankings, onStartNew }: ReviewProps) {
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
        {rankingsVM.map((r, i) => (
          <Fragment key={r.id}>
            {resultMode !== "none" && r.section !== "ranked" && r.section !== rankingsVM[i - 1]?.section && (
              <div className={styles.sectionLabel}>{r.section === "tooFew" ? "Not enough games yet" : "Not ranked"}</div>
            )}
            <div className={styles.row}>
              <span className={styles.rank}>{r.medal ? MEDAL[r.medal] : (r.rank ?? "")}</span>
              <span className={styles.name}>{r.name}</span>
              <span className={styles.record}>
                {r.wins}W–{r.losses}L
              </span>
              {resultMode !== "none" && r.played > 0 && (
                <span className={`${styles.diff} ${styles.positive}`}>
                  {r.winPct}%{r.pointsPct !== null && ` · ${r.pointsPct}% pts`}
                </span>
              )}
            </div>
          </Fragment>
        ))}
      </div>
      {rankingsVM.some((r) => r.rank !== null) && (
        <button className={styles.shareBtn} onClick={onShareRankings}>
          Share Rankings
        </button>
      )}
      <button className={styles.startNewBtn} onClick={onStartNew}>
        New Session
      </button>
    </div>
  );
}
