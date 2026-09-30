import type { CourtViewModel } from "../types.viewmodel";
import styles from "./CourtCard.module.css";

interface CourtCardProps {
  court: CourtViewModel;
}

export function CourtCard({ court }: CourtCardProps) {
  const { state, match, suggestion } = court;
  const stateLabel = state === "playing" ? "Playing" : state === "scoreNeeded" ? "Score Needed" : state === "paused" ? "Paused" : "Available";

  return (
    <div className={styles.card}>
      <div className={styles.stripe} />
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.courtBadge}>{court.id}</div>
          <div className={styles.courtName}>{court.name}</div>
          {court.closesAt && state !== "paused" && <div className={styles.closesAt}>closes {court.closesAt}</div>}
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
                <div className={`${styles.teamLabel} ${styles.a}`}>Team A</div>
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
                <div className={styles.scoreVs}>vs</div>
              )}
              <div className={styles.teamCol}>
                <div className={`${styles.teamLabel} ${styles.b}`}>Team B</div>
                <div className={styles.teamP1}>{match.t2p1}</div>
                <div className={styles.teamP2}>{match.t2p2}</div>
              </div>
            </div>
            {match.resultMode === "score" && (
              <button className={`${styles.ctaBtn} ${styles[state]}`} onClick={match.onEnterScore}>
                {state === "scoreNeeded" ? "Save Result" : "Enter Score"}
              </button>
            )}
            {match.resultMode === "winner" && (
              <div className={styles.actionsRow}>
                <button className={styles.startBtn} onClick={match.onWinT1}>
                  Team A Won
                </button>
                <button className={styles.startBtn} onClick={match.onWinT2}>
                  Team B Won
                </button>
              </div>
            )}
            {match.resultMode === "none" && (
              <button className={styles.startBtn} onClick={match.onQuickFinish}>
                Match Finished
              </button>
            )}
          </>
        )}
        {state === "available" && court.closingSoon && (
          <>
            <div className={styles.availableLabel}>Closing soon</div>
            <div className={styles.noSuggestion}>Closes at {court.closingSoon.closesAt}. No new match will start here.</div>
            <button className={styles.manualAssignBtn} onClick={court.closingSoon.onKeepOpen}>
              Keep open and start a match
            </button>
            <button className={styles.pauseLink} onClick={court.onTogglePause}>
              Pause this court
            </button>
          </>
        )}
        {state === "available" && !court.closingSoon && (
          <>
            <div className={styles.availableLabel}>Court is open</div>
            {court.keptOpen && <div className={styles.keptOpen}>Kept open for 1 more match</div>}
            {suggestion ? (
              <>
                <div className={styles.suggestion}>
                  <div>
                    <span className={styles.suggestionTeam1}>{suggestion.team1Label}</span>{" "}
                    <span className={styles.suggestionVs}>vs</span>{" "}
                    <span className={styles.suggestionTeam2}>{suggestion.team2Label}</span>
                  </div>
                  <div className={styles.suggestionReason}>{suggestion.reason}</div>
                </div>
                <div className={styles.actionsRow}>
                  <button className={styles.startBtn} onClick={suggestion.onStart}>
                    Start Match
                  </button>
                  <button className={styles.secondaryBtn} onClick={suggestion.onRegenerate}>
                    Shuffle
                  </button>
                  <button className={styles.secondaryBtn} onClick={court.onEdit}>
                    Edit
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.noSuggestion}>
                  {court.insufficientPlayers ? (
                    <>
                      {court.insufficientPlayers.eligibleCount} waiting · need {court.insufficientPlayers.missing} more to start
                    </>
                  ) : (
                    "Not enough players waiting yet"
                  )}
                </div>
                <button className={styles.manualAssignBtn} onClick={court.onEdit}>
                  + Assign Players Manually
                </button>
              </>
            )}
            <button className={styles.pauseLink} onClick={court.onTogglePause}>
              Pause this court
            </button>
          </>
        )}
        {state === "paused" && (
          <>
            {court.pastClosing ? (
              <>
                <div className={styles.pausedNote}>Closed at {court.pastClosing.closesAt}.</div>
                <button className={styles.startBtn} onClick={court.pastClosing.onKeepOpen}>
                  Keep open for 1 more match
                </button>
              </>
            ) : (
              <>
                <div className={styles.pausedNote}>Court paused. No matches until resumed.</div>
                <button className={styles.startBtn} onClick={court.onTogglePause}>
                  Resume Court
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
