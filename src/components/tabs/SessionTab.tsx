import { CourtCard } from "../CourtCard";
import { UsersIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./SessionTab.module.css";

type SessionTabProps = SessionStore["session"] & { hideTier?: boolean; readOnly?: boolean };

export function SessionTab({
  playersCount,
  courtsCount,
  playingCount,
  readyWaitingCount,
  pausedCount,
  expectedCount,
  hasExpected,
  onCheckInAll,
  topPriorityWaiting,
  courtsVM,
  upNext,
  waitingVM,
  waitingCount,
  hasNotInRotation,
  notInRotationVM,
  recentResultsVM,
  sessionHealth,
  hideTier,
  readOnly,
}: SessionTabProps) {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Live Session</h1>
          <span className={styles.subtitle}>
            {playersCount} {playersCount === 1 ? "player" : "players"} · {courtsCount} {courtsCount === 1 ? "court" : "courts"}
          </span>
        </div>
        <div className={styles.chips}>
          <span className={`${styles.chip} ${styles.chipPlaying}`}>Playing {playingCount}</span>
          <span className={`${styles.chip} ${styles.chipWaiting}`}>Waiting {readyWaitingCount}</span>
          <span className={`${styles.chip} ${styles.chipPaused}`}>Resting {pausedCount}</span>
          {hasExpected && <span className={`${styles.chip} ${styles.chipExpected}`}>{expectedCount} not checked in</span>}
        </div>
        {hasExpected && (
          <div className={styles.checkInBanner}>
            <span className={styles.checkInText}>{expectedCount} on the roster haven't checked in yet</span>
            <button className={styles.checkInBtn} onClick={onCheckInAll}>
              Check In All
            </button>
          </div>
        )}
        {sessionHealth.longestWaitName && (sessionHealth.longestWaitMatches > 0 || sessionHealth.gameSpread > 0) && (
          <div className={`${styles.healthStrip} ${sessionHealth.hasWarning ? styles.healthWarning : ""}`}>
            <span>
              Waiting longest: <strong>{sessionHealth.longestWaitName}</strong> ({sessionHealth.longestWaitMatches} match
              {sessionHealth.longestWaitMatches === 1 ? "" : "es"})
            </span>
            <span>Games played: {sessionHealth.gameSpread} apart from most to fewest</span>
          </div>
        )}
      </div>

      {topPriorityWaiting.length > 0 && (
        <div className={styles.priorityPanel}>
          <div className={styles.priorityGlow} />
          <div className={styles.priorityHeading}>
            <UsersIcon />
            Who should play next
          </div>
          <div className={styles.priorityListWrap}>
            <div className={styles.priorityList}>
              {topPriorityWaiting.map((p, i) => (
                <div className={styles.priorityCard} key={i}>
                  <div className={styles.priorityAvatar}>{p.initials}</div>
                  <div>
                    <div className={styles.priorityName}>
                      {p.name} {!hideTier && <span className={styles.priorityLevel}>· {p.level}</span>}
                    </div>
                    <div className={styles.priorityReason}>{p.reason}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.priorityFade} />
          </div>
        </div>
      )}

      {courtsVM.length > 0 ? (
        <div className={styles.courtsGrid}>
          {courtsVM.map((court) => (
            <CourtCard key={court.id} court={court} />
          ))}
        </div>
      ) : (
        <div className={styles.panel}>
          <div className={styles.emptyNote}>
            {readOnly ? "No courts have been set up yet." : "No courts yet — add one in Manage → Courts to start scheduling matches."}
          </div>
        </div>
      )}

      {upNext && (
        <div className={styles.upNextPanel}>
          <div className={styles.upNextHeading}>Next Up · all courts busy</div>
          <div className={styles.upNextTeams}>
            <span className={styles.upNextTeamA}>{upNext.team1Label}</span> <span className={styles.upNextVs}>vs</span>{" "}
            <span className={styles.upNextTeamB}>{upNext.team2Label}</span>
          </div>
          <div className={styles.upNextReason}>{upNext.reason}</div>
          <button className={styles.upNextShuffleBtn} onClick={upNext.onRegenerate}>
            Shuffle
          </button>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Waiting ({waitingCount})</div>
        {waitingCount === 0 && !hasNotInRotation ? (
          <div className={styles.emptyNote}>No one waiting right now.</div>
        ) : (
          <div className={styles.list}>
            {!readOnly && waitingVM.length > 0 && (
              <div className={styles.emptyNote}>Sit Out Next skips one match. Rest keeps them out until you bring them back.</div>
            )}
            {waitingVM.map((w) => (
              <div className={styles.waitingRow} key={w.id}>
                <div className={styles.waitingLeft}>
                  <div className={styles.avatar}>{w.initials}</div>
                  <div className={styles.waitingText}>
                    <div className={styles.waitingName}>
                      {w.name} {!hideTier && <span className={styles.waitingLevel}>· Tier {w.level}</span>}
                    </div>
                    <div className={styles.waitingMeta}>
                      Waited {w.skipped} {w.skipped === 1 ? "match" : "matches"} · {w.games} {w.games === 1 ? "game" : "games"} played
                      {w.hasStreak ? ` · back-to-back x${w.consec}` : ""}
                    </div>
                  </div>
                </div>
                <div className={styles.waitingActions}>
                  <button className={styles.pillBtn} onClick={w.onSkip}>
                    Sit Out Next
                  </button>
                  <button className={styles.pillBtn} onClick={w.onPause}>
                    Rest
                  </button>
                </div>
              </div>
            ))}
            {hasNotInRotation &&
              notInRotationVM.map((n) => (
                <div className={styles.notInRotationRow} key={n.id}>
                  <div className={styles.notInRotationName}>
                    {n.name} · {n.tag}
                  </div>
                  <button className={styles.linkBtn} onClick={n.onAction}>
                    {n.actionLabel}
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Recent Results</div>
        {recentResultsVM.length === 0 ? (
          <div className={styles.emptyNote}>No matches completed yet.</div>
        ) : (
          <div className={styles.list}>
            {recentResultsVM.map((r, i) => {
              const isTie = r.winner === null && r.resultMode === "score";
              return (
                <div className={styles.resultRow} key={i}>
                  <span className={`${styles.resultTeam} ${r.winner === "t1" ? styles.winner : r.winner === null ? styles.tie : styles.loser}`}>
                    {r.t1Names}
                  </span>
                  <span className={styles.resultScore}>
                    {r.resultMode === "score" ? r.score : r.resultMode === "winner" ? "Final" : "Played"}
                    {isTie && <span className={styles.tieTag}>Tied</span>}
                  </span>
                  <span
                    className={`${styles.resultTeam} ${styles.resultTeamRight} ${r.winner === "t2" ? styles.winner : r.winner === null ? styles.tie : styles.loser}`}
                  >
                    {r.t2Names}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
