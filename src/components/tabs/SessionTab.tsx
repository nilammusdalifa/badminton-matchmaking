import { useRef, useState } from "react";
import { CourtCard } from "../CourtCard";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./SessionTab.module.css";

type SessionTabProps = SessionStore["session"] & { hideTier?: boolean; readOnly?: boolean; onSeeAllMatches?: () => void };

export function SessionTab({
  playersCount,
  courtsCount,
  playingCount,
  readyWaitingCount,
  pausedCount,
  expectedCount,
  hasExpected,
  onCheckInAll,
  courtsVM,
  upNext,
  queueVM,
  waitingVM,
  waitingCount,
  hasNotInRotation,
  notInRotationVM,
  recentResultsVM,
  sessionHealth,
  gamesPlayedVM,
  fewPlayersHint,
  hideTier,
  readOnly,
  onSeeAllMatches,
}: SessionTabProps) {
  // The "Games played" card is collapsed until asked for; the strip under
  // Waiting opens it and brings it into view.
  const [gamesOpen, setGamesOpen] = useState(false);
  const gamesRef = useRef<HTMLDivElement>(null);
  const showGames = () => {
    setGamesOpen(true);
    requestAnimationFrame(() => gamesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
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
        </div>
        {fewPlayersHint && !readOnly && <div className={styles.hintNote}>{fewPlayersHint}</div>}
        {hasExpected && (
          <div className={styles.checkInBanner}>
            <span className={styles.checkInText}>{expectedCount} not checked in</span>
            <button className={styles.checkInBtn} onClick={onCheckInAll}>
              Check In All
            </button>
          </div>
        )}
      </div>

      {courtsVM.length > 0 ? (
        <div className={styles.courtsGrid}>
          {courtsVM.map((court) => (
            <CourtCard key={court.id} court={court} />
          ))}
        </div>
      ) : (
        <div className={styles.panel}>
          <div className={styles.emptyNote}>
            {readOnly ? "No courts yet." : "No courts yet. Add one in Manage."}
          </div>
        </div>
      )}

      {queueVM.map((q) => (
        <div className={styles.upNextPanel} key={q.index}>
          <div className={styles.upNextHeading}>
            {q.label}
            {q.detail && <span className={styles.queueDetail}> · {q.detail}</span>}
          </div>
          <div className={styles.upNextTeams}>
            <span className={styles.upNextTeamA}>{q.team1Label}</span> <span className={styles.upNextVs}>vs</span>{" "}
            <span className={styles.upNextTeamB}>{q.team2Label}</span>
          </div>
          <div className={styles.upNextReason}>{q.reason}</div>
          {!readOnly && (
            <div className={styles.queueActions}>
              <button className={styles.upNextShuffleBtn} onClick={q.onShuffle}>
                Shuffle
              </button>
              <button className={styles.upNextShuffleBtn} onClick={q.onEdit}>
                Edit
              </button>
            </div>
          )}
        </div>
      ))}

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
        {sessionHealth.hasWarning && sessionHealth.longestWaitName && (
          <div className={`${styles.healthStrip} ${styles.healthWarning}`}>
            <span>
              Waiting longest: <strong>{sessionHealth.longestWaitName}</strong> ({sessionHealth.longestWaitMatches} match
              {sessionHealth.longestWaitMatches === 1 ? "" : "es"})
            </span>
            <button className={styles.healthLink} onClick={showGames}>
              Games played: {sessionHealth.gameSpread} apart ›
            </button>
          </div>
        )}
        {waitingCount === 0 && !hasNotInRotation ? (
          <div className={styles.emptyNote}>No one waiting right now.</div>
        ) : (
          <div className={styles.list}>
            {!readOnly && waitingVM.length > 0 && (
              <div className={styles.emptyNote}>Sit Out Next skips 1 match. Rest pauses them.</div>
            )}
            {waitingVM.map((w, i) => (
              <div className={styles.waitingRow} key={w.id}>
                <div className={styles.waitingLeft}>
                  <div className={styles.avatar}>{w.initials}</div>
                  <div className={styles.waitingText}>
                    <div className={styles.waitingName}>
                      {w.name} {!hideTier && <span className={styles.waitingLevel}>· Tier {w.level}</span>}
                      {w.queueTag && <span className={styles.queueTag}>{w.queueTag}</span>}
                    </div>
                    <div className={styles.waitingMeta}>
                      {i === 0 && "Next up · "}Waited {w.skipped} {w.skipped === 1 ? "match" : "matches"}{w.waitMin !== null ? ` · ${w.waitMin} min` : ""} · {w.games} {w.games === 1 ? "game" : "games"} played
                      {w.hasStreak ? ` · back-to-back x${w.consec}` : ""}
                    </div>
                    {w.note && <div className={styles.waitingMeta}>{w.note}</div>}
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

      <div className={styles.panel} ref={gamesRef}>
        <button className={styles.gamesHead} onClick={() => setGamesOpen((o) => !o)} aria-expanded={gamesOpen}>
          <span className={styles.gamesTitle}>Games played · fewest first</span>
          <span className={styles.gamesAvg}>
            avg {gamesPlayedVM.average}
            {gamesPlayedVM.behind > 0 && ` · ⚠ ${gamesPlayedVM.behind}`}
          </span>
        </button>
        {gamesOpen && (
          <div className={styles.gamesList}>
            {gamesPlayedVM.rows.map((r, i) => (
              <div className={styles.gamesRow} key={i}>
                <span className={styles.gamesCount}>{r.games}</span>
                <span className={styles.gamesNames}>{r.text}</span>
                {r.status && <span className={styles.gamesStatus}>{r.status}</span>}
                {r.warn && (
                  <span className={styles.gamesWarn} role="img" aria-label="Two or more games behind">
                    ⚠
                  </span>
                )}
              </div>
            ))}
            {gamesPlayedVM.rows.length === 0 && <div className={styles.emptyNote}>No players yet.</div>}
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
                    {isTie && !r.notCounted && <span className={styles.tieTag}>Tied</span>}
                    {r.notCounted && <span className={styles.tieTag}>Not counted</span>}
                  </span>
                  <span
                    className={`${styles.resultTeam} ${styles.resultTeamRight} ${r.winner === "t2" ? styles.winner : r.winner === null ? styles.tie : styles.loser}`}
                  >
                    {r.t2Names}
                  </span>
                </div>
              );
            })}
            {onSeeAllMatches && (
              <button className={styles.linkBtn} onClick={onSeeAllMatches}>
                See all matches
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
