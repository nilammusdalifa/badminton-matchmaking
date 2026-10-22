import { useRef, useState } from "react";
import { CourtCard } from "../CourtCard";
import { WinMark } from "../WinMark";
import { copy } from "../../lib/copy";
import { avatarStyle } from "../../lib/playerColor";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./SessionTab.module.css";

type SessionTabProps = SessionStore["session"] & {
  hideTier?: boolean;
  /** View-only (a Player on a shared link): information only, no editing controls rendered. */
  readOnly?: boolean;
  onSeeAllMatches?: () => void;
  /** Rankings, for the final standings shown once the session has ended. */
  rankings: SessionStore["rankings"]["rankingsVM"];
  onSeeRankings?: () => void;
  /** Who this viewer says they are ("Who are you?"); highlights them in the queue. */
  youId?: string | null;
  onSetYou?: (id: string | null) => void;
};

const ordinal = (n: number) => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
};

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
  queueVM,
  waitingVM,
  waitingCount,
  hasNotInRotation,
  notInRotationVM,
  recentResultsVM,
  sessionHealth,
  gamesPlayedVM,
  fewPlayersHint,
  scheduleOver,
  scheduleEndLabel,
  playerOptions,
  hideTier,
  readOnly,
  onSeeAllMatches,
  rankings,
  onSeeRankings,
  youId,
  onSetYou,
}: SessionTabProps) {
  // The "Games played" card is collapsed until asked for; the strip under
  // Waiting opens it and brings it into view.
  const [gamesOpen, setGamesOpen] = useState(false);
  const gamesRef = useRef<HTMLDivElement>(null);
  const showGames = () => {
    setGamesOpen(true);
    requestAnimationFrame(() => gamesRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  // A viewer only sees "ended" once the schedule has passed; the umpire's own
  // screen keeps running as it always did (it has End Session for that).
  const ended = Boolean(readOnly && scheduleOver);
  const you = readOnly && youId ? playerOptions.find((p) => p.id === youId) : undefined;
  const yourQueueIndex = you ? waitingVM.findIndex((w) => w.id === you.id) : -1;
  const yourCourt = you ? courtsVM.find((c) => c.match && [c.match.t1p1, c.match.t1p2, c.match.t2p1, c.match.t2p2].includes(you.name)) : undefined;
  const yourStatus = !you
    ? null
    : yourCourt
      ? copy.session.youPlaying(yourCourt.name)
      : yourQueueIndex >= 0 && !ended
        ? yourQueueIndex === 0
          ? copy.session.youNext
          : copy.session.youPosition(ordinal(yourQueueIndex + 1))
        : notInRotationVM.some((n) => n.id === you.id) && !ended
          ? copy.session.youResting
          : null;

  const finalRanked = rankings.filter((r) => r.section === "ranked");

  const youPicker = readOnly && playerOptions.length > 0 && onSetYou && (
    <div className={styles.youRow}>
      <label className={styles.youLabel} htmlFor="who-are-you">
        {copy.session.whoAreYou}
      </label>
      <select id="who-are-you" className={styles.youSelect} value={you?.id ?? ""} onChange={(e) => onSetYou(e.target.value || null)}>
        <option value="">{copy.session.pickYourName}</option>
        {playerOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {yourStatus && <div className={styles.youStatus}>{yourStatus}</div>}
    </div>
  );

  const resultsPanel = (
    <div className={styles.panel}>
      <div className={styles.panelTitle}>{ended ? copy.session.finalResults : copy.session.recentResults}</div>
      {recentResultsVM.length === 0 ? (
        <div className={styles.emptyNote}>{copy.session.noResults}</div>
      ) : (
        <div className={styles.list}>
          {recentResultsVM.map((r, i) => {
            const isTie = r.winner === null && r.resultMode === "score";
            return (
              <div className={styles.resultRow} key={i}>
                <span className={`${styles.resultTeam} ${r.winner === "t1" ? styles.winner : r.winner === null ? styles.tie : styles.loser}`}>
                  {r.winner === "t1" && <WinMark />}
                  {r.t1Names}
                </span>
                <span className={styles.resultScore}>
                  {r.resultMode === "score" ? r.score : r.resultMode === "winner" ? copy.session.final : copy.session.played}
                  {isTie && !r.notCounted && <span className={styles.tieTag}>{copy.session.tied}</span>}
                  {r.notCounted && <span className={styles.tieTag}>{copy.session.notCounted}</span>}
                </span>
                <span
                  className={`${styles.resultTeam} ${styles.resultTeamRight} ${r.winner === "t2" ? styles.winner : r.winner === null ? styles.tie : styles.loser}`}
                >
                  {r.winner === "t2" && <WinMark />}
                  {r.t2Names}
                </span>
              </div>
            );
          })}
          {onSeeAllMatches && (
            <button className={styles.linkBtn} onClick={onSeeAllMatches}>
              {copy.session.seeAllMatches}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const gamesPanel = (
    <div className={styles.panel} ref={gamesRef}>
      <button className={styles.gamesHead} onClick={() => setGamesOpen((o) => !o)} aria-expanded={gamesOpen}>
        <span className={styles.gamesTitle}>{copy.session.fewestMatches}</span>
        <span className={styles.gamesAvg}>
          {copy.session.avg(gamesPlayedVM.average, gamesPlayedVM.behind)}
          <span className={`${styles.chevron} ${gamesOpen ? styles.chevronOpen : ""}`} aria-hidden="true">
            ›
          </span>
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
                <span className={styles.gamesWarn} role="img" aria-label={copy.session.twoBehind}>
                  ⚠
                </span>
              )}
            </div>
          ))}
          {gamesPlayedVM.rows.length === 0 && <div className={styles.emptyNote}>{copy.session.noPlayers}</div>}
        </div>
      )}
    </div>
  );

  if (ended) {
    return (
      <>
        <div className={styles.section}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{copy.session.ended}</h1>
            <span className={styles.subtitle}>{copy.session.summary(playersCount, courtsCount)}</span>
          </div>
          <div className={styles.endedNote}>{copy.session.endedNote(scheduleEndLabel)}</div>
          {youPicker}
        </div>

        <div className={styles.panel}>
          <div className={styles.panelTitle}>{copy.session.finalRankings}</div>
          {finalRanked.length === 0 ? (
            <div className={styles.emptyNote}>{copy.session.noRanked}</div>
          ) : (
            <ol className={styles.finalList}>
              {finalRanked.map((r) => (
                <li className={`${styles.finalRow} ${r.id === you?.id ? styles.youRowHighlight : ""}`} key={r.id}>
                  <span className={styles.finalRank}>{r.medal ? ["", "🥇", "🥈", "🥉"][r.medal] : r.rank}</span>
                  <span className={styles.avatar} style={avatarStyle(r.name)}>
                    {r.initials}
                  </span>
                  <span className={styles.finalName}>
                    {r.name}
                    {r.id === you?.id && <span className={styles.youTag}>{copy.session.youTag}</span>}
                  </span>
                  <span className={styles.finalRecord}>
                    {copy.rankings.summary(r.wins, r.losses, r.winPct)} · <strong>{r.score}</strong>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {onSeeRankings && (
            <button className={styles.linkBtn} onClick={onSeeRankings}>
              {copy.session.seeFullRankings}
            </button>
          )}
        </div>

        {resultsPanel}
        {gamesPanel}
      </>
    );
  }

  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{copy.session.live}</h1>
          <span className={styles.subtitle}>{copy.session.summary(playersCount, courtsCount)}</span>
        </div>
        <div className={styles.chips}>
          <span className={`${styles.chip} ${styles.chipPlaying}`}>{copy.session.chipPlaying(playingCount)}</span>
          <span className={`${styles.chip} ${styles.chipWaiting}`}>{copy.session.chipQueue(readyWaitingCount)}</span>
          <span className={`${styles.chip} ${styles.chipPaused}`}>{copy.session.chipResting(pausedCount)}</span>
        </div>
        {fewPlayersHint && !readOnly && <div className={styles.hintNote}>{fewPlayersHint}</div>}
        {hasExpected && (
          <div className={styles.checkInBanner}>
            <span className={styles.checkInText}>{copy.session.notCheckedIn(expectedCount)}</span>
            {!readOnly && (
              <button className={styles.checkInBtn} onClick={onCheckInAll}>
                {copy.session.checkInAll}
              </button>
            )}
          </div>
        )}
        {youPicker}
      </div>

      {courtsVM.length > 0 ? (
        <div className={styles.courtsGrid}>
          {courtsVM.map((court) => (
            <CourtCard key={court.id} court={court} readOnly={readOnly} />
          ))}
        </div>
      ) : (
        <div className={styles.panel}>
          <div className={styles.emptyNote}>
            {readOnly ? copy.session.noCourts : copy.session.noCourtsUmpire}
          </div>
        </div>
      )}

      {!readOnly &&
        queueVM.map((q) => (
          <div className={styles.upNextPanel} key={q.index}>
            <div className={styles.upNextHeading}>
              {q.label}
              {!q.locked && ` · ${copy.session.mayChange}`}
              {q.detail && <span className={styles.queueDetail}> · {q.detail}</span>}
            </div>
            <div className={styles.upNextTeams}>
              <span className={styles.upNextTeamA}>{q.team1Label}</span> <span className={styles.upNextVs}>vs</span>{" "}
              <span className={styles.upNextTeamB}>{q.team2Label}</span>
            </div>
            <div className={styles.upNextReason}>{q.reason}</div>
            <div className={styles.queueActions}>
              <button className={styles.upNextShuffleBtn} onClick={q.onShuffle}>
                {copy.session.shuffle}
              </button>
              {q.onEdit && (
                <button className={styles.upNextShuffleBtn} onClick={q.onEdit}>
                  {copy.session.edit}
                </button>
              )}
            </div>
          </div>
        ))}

      <div className={styles.panel}>
        <div className={styles.panelTitle}>{copy.session.queueTitle(waitingCount)}</div>
        {readOnly && queueVM.length > 0 && (
          <div className={styles.previewCard}>
            <div className={styles.previewLabel}>
              {copy.session.upNext}
              {!queueVM[0].locked && ` · ${copy.session.mayChange}`}
            </div>
            <div className={styles.previewTeams}>
              {queueVM[0].team1Label} <span className={styles.upNextVs}>{copy.matches.vs}</span> {queueVM[0].team2Label}
            </div>
          </div>
        )}
        {sessionHealth.hasWarning && sessionHealth.longestWaitName && (
          <div className={`${styles.healthStrip} ${styles.healthWarning}`}>
            <span>{copy.session.longestWait(sessionHealth.longestWaitName, sessionHealth.longestWaitMatches)}</span>
            <button className={styles.healthLink} onClick={showGames}>
              {copy.session.matchesPlayedLink(sessionHealth.minPlayed, sessionHealth.maxPlayed)}
            </button>
          </div>
        )}
        {waitingCount === 0 && !hasNotInRotation ? (
          <div className={styles.emptyNote}>{copy.session.queueEmpty}</div>
        ) : (
          <div className={styles.list}>
            {!readOnly && waitingVM.length > 0 && (
              <div className={styles.emptyNote}>{copy.session.queueHint}</div>
            )}
            {waitingVM.map((w, i) => {
              const position = copy.session.position(i);
              const stats = copy.session.queueMeta(w.skipped, w.games, w.hasStreak ? w.consec : 0);
              return (
                <div className={`${styles.waitingRow} ${w.id === you?.id ? styles.youRowHighlight : ""}`} key={w.id}>
                  <div className={styles.waitingLeft}>
                    <div className={styles.avatar} style={avatarStyle(w.name)}>
                      {w.initials}
                    </div>
                    <div className={styles.waitingText}>
                      <div className={styles.waitingPos}>
                        {position}
                        {w.queueTag && (i > 0 || w.queueTag === copy.session.then) && (
                          <span className={styles.queueTag}>{w.queueTag === copy.session.upNext ? copy.session.inNextMatch : copy.session.inMatchAfter}</span>
                        )}
                      </div>
                      <div className={styles.waitingName}>
                        {w.name} {!hideTier && <span className={styles.waitingLevel}>· Tier {w.level}</span>}
                        {w.id === you?.id && <span className={styles.youTag}>{copy.session.youTag}</span>}
                      </div>
                      <div className={styles.waitingMeta}>{stats}</div>
                      {w.note && <div className={styles.waitingMeta}>{w.note}</div>}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className={styles.waitingActions}>
                      <button className={styles.pillBtn} onClick={w.onSkip}>
                        {copy.session.skipNext}
                      </button>
                      <button className={styles.pillBtn} onClick={w.onPause}>
                        {copy.session.rest}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {hasNotInRotation &&
              notInRotationVM.map((n) => (
                <div className={styles.notInRotationRow} key={n.id}>
                  <div className={styles.notInRotationName}>
                    {n.name} · {n.tag}
                  </div>
                  {!readOnly && (
                    <button className={styles.linkBtn} onClick={n.onAction}>
                      {n.actionLabel}
                    </button>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>

      {gamesPanel}
      {resultsPanel}
    </>
  );
}
