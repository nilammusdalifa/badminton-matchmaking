import { copy } from "../lib/copy";
import type { CourtViewModel } from "../types.viewmodel";
import styles from "./CourtCard.module.css";

interface CourtCardProps {
  court: CourtViewModel;
  /** View-only: just teams and score. No button is rendered, not even a greyed-out one. */
  readOnly?: boolean;
}

export function CourtCard({ court, readOnly }: CourtCardProps) {
  const { state, match, suggestion } = court;
  const stateLabel =
    state === "playing" ? copy.court.playing : state === "scoreNeeded" ? copy.court.scoreNeeded : state === "paused" ? copy.court.paused : copy.court.available;

  return (
    <div className={styles.card}>
      <div className={styles.stripe} />
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.courtBadge}>{court.id}</div>
          <div className={styles.courtName}>{court.name}</div>
          {court.closesAt && state !== "paused" && <div className={styles.closesAt}>{copy.court.closes(court.closesAt)}</div>}
        </div>
        <span className={`${styles.stateBadge} ${styles[state]}`}>
          <span className={`${styles.stateDot} ${state === "playing" ? styles.pulsing : ""}`} />
          {stateLabel}
        </span>
      </div>
      <div className={styles.body}>
        {match && (
          <>
            <div className={styles.matchMeta}>
              <span>#{match.matchNumber}</span>
              <span>{match.elapsed}</span>
            </div>
            <div className={styles.scoreRow}>
              <div className={styles.teamCol}>
                <div className={`${styles.teamLabel} ${styles.a}`}>{copy.court.teamA}</div>
                <div className={styles.teamP1}>{match.t1p1}</div>
                <div className={styles.teamP2}>{match.t1p2}</div>
              </div>
              {match.resultMode === "score" ? (
                <div className={styles.score}>
                  <span>{match.s1}</span>
                  <span className={styles.scoreDash}>–</span>
                  <span>{match.s2}</span>
                </div>
              ) : (
                <div className={styles.scoreVs}>{copy.matches.vs}</div>
              )}
              <div className={styles.teamCol}>
                <div className={`${styles.teamLabel} ${styles.b}`}>{copy.court.teamB}</div>
                <div className={styles.teamP1}>{match.t2p1}</div>
                <div className={styles.teamP2}>{match.t2p2}</div>
              </div>
            </div>
            {court.inNextButOne && <div className={styles.nextButOne}>{copy.court.nextButOne}</div>}
            {!readOnly && match.resultMode === "score" && (
              <button className={`${styles.ctaBtn} ${styles[state]}`} onClick={match.onEnterScore}>
                {state === "scoreNeeded" ? copy.court.saveResult : copy.court.enterScore}
              </button>
            )}
            {!readOnly && match.resultMode === "winner" && (
              <div className={styles.actionsRow}>
                <button className={styles.startBtn} onClick={match.onWinT1}>
                  {copy.court.teamAWon}
                </button>
                <button className={styles.startBtn} onClick={match.onWinT2}>
                  {copy.court.teamBWon}
                </button>
              </div>
            )}
            {!readOnly && match.resultMode === "none" && (
              <button className={styles.startBtn} onClick={match.onQuickFinish}>
                {copy.court.matchFinished}
              </button>
            )}
          </>
        )}
        {state === "available" && court.closingSoon && (
          <>
            <div className={styles.availableLabel}>{copy.court.closingSoon}</div>
            <div className={styles.noSuggestion}>{copy.court.closesNoNew(court.closingSoon.closesAt)}</div>
            {!readOnly && (
              <>
                <button className={styles.manualAssignBtn} onClick={court.closingSoon.onKeepOpen}>
                  {copy.court.keepOpenAndStart}
                </button>
                <button className={styles.pauseLink} onClick={court.onTogglePause}>
                  {copy.court.pauseCourt}
                </button>
              </>
            )}
          </>
        )}
        {state === "available" && !court.closingSoon && (
          <>
            <div className={styles.availableLabel}>{copy.court.open}</div>
            {court.keptOpen && <div className={styles.keptOpen}>{copy.court.keptOpen}</div>}
            {readOnly ? null : suggestion ? (
              <>
                <div className={styles.suggestion}>
                  <div>
                    <span className={styles.suggestionTeam1}>{suggestion.team1Label}</span>{" "}
                    <span className={styles.suggestionVs}>{copy.matches.vs}</span>{" "}
                    <span className={styles.suggestionTeam2}>{suggestion.team2Label}</span>
                  </div>
                  <div className={styles.suggestionReason}>{suggestion.reason}</div>
                </div>
                <div className={styles.actionsRow}>
                  <button className={styles.startBtn} onClick={suggestion.onStart}>
                    {copy.court.startMatch}
                  </button>
                  <button className={styles.secondaryBtn} onClick={suggestion.onRegenerate}>
                    {copy.session.shuffle}
                  </button>
                  <button className={styles.secondaryBtn} onClick={court.onEdit}>
                    {copy.session.edit}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.noSuggestion}>
                  {court.insufficientPlayers ? (
                    copy.court.inQueueNeedMore(court.insufficientPlayers.eligibleCount, court.insufficientPlayers.missing)
                  ) : (
                    copy.court.notEnoughInQueue
                  )}
                </div>
                <button className={styles.manualAssignBtn} onClick={court.onEdit}>
                  {copy.court.assignManually}
                </button>
              </>
            )}
            {!readOnly && (
              <button className={styles.pauseLink} onClick={court.onTogglePause}>
                {copy.court.pauseCourt}
              </button>
            )}
          </>
        )}
        {state === "paused" && (
          <>
            {court.pastClosing ? (
              <>
                <div className={styles.pausedNote}>{copy.court.closedAt(court.pastClosing.closesAt)}</div>
                {!readOnly && (
                  <button className={styles.startBtn} onClick={court.pastClosing.onKeepOpen}>
                    {copy.court.keepOpenOneMore}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className={styles.pausedNote}>{readOnly ? copy.court.pausedViewer : copy.court.pausedUmpire}</div>
                {!readOnly && (
                  <button className={styles.startBtn} onClick={court.onTogglePause}>
                    {copy.court.resume}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
