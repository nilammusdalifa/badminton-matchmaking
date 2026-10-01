import { useState } from "react";
import { createPortal } from "react-dom";
import { LevelPicker } from "../LevelPicker";
import { ShareNodesIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./RankingsTab.module.css";

type RankingsTabProps = SessionStore["rankings"] & { hideTier?: boolean };
type Row = RankingsTabProps["rankingsVM"][number];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const RULE: Record<string, string> = {
  score: "Best win rate first · ties by tougher matches",
  winner: "Best win rate first · ties by tougher matches",
  none: "This session doesn't record results.",
};

// Wins/losses behind a rounded percentage ("won 2 of 3" reads better than "67%").
const share = (pct: number, games: number) => Math.round((pct * games) / 100);

// "Tougher" only once the gap is clear; a few stray games shouldn't read as a verdict.
const difficulty = (edge: number) => (edge >= 0.25 ? "Tougher than their team" : edge <= -0.25 ? "Easier than their team" : "About even");

export function RankingsTab({ rankingsVM, resultMode, early, canEdit, onShareRankings, hideTier }: RankingsTabProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  const renderRow = (r: Row) => {
    // Medals and their tint follow the medal rule, not just the list position.
    const topRank = r.medal;
    const record =
      resultMode === "none"
        ? `${r.played} played`
        : r.played === 0
          ? "Not played"
          : `${r.wins}W–${r.losses}L · ${r.played} ${r.played === 1 ? "game" : "games"}`;
    const hasInsights = r.favPartner !== "—" || r.toughOpp !== "—";
    const rankCell = topRank ? MEDAL[topRank] : r.section === "ranked" ? r.rank : "";
    return (
      <details className={`${styles.row} ${topRank ? styles["top" + topRank] : ""}`} key={r.id}>
        <summary className={styles.summary}>
          <div className={styles.summaryTop}>
            <span className={styles.rank}>{rankCell}</span>
            <div className={`${styles.avatar} ${topRank ? styles["avatarTop" + topRank] : ""}`}>{r.initials}</div>
            <span className={styles.name}>
              {r.name} {!hideTier && <span className={styles.level}>Tier {r.level}</span>}
            </span>
            <span className={styles.record}>{record}</span>
          </div>
          <div className={styles.summaryBottom}>
            <div className={styles.formDots} aria-label="Last 5 results">
              {r.recentForm.length === 0
                ? Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.formDotEmpty} />)
                : r.recentForm.map((res, i) => <span key={i} className={res > 0 ? styles.formDotWin : styles.formDotLoss} />)}
            </div>
            {resultMode !== "none" && r.played > 0 && (
              <span className={styles.rates}>
                {r.winPct}% won{r.pointsPct !== null && ` · ${r.pointsPct}% points`}
              </span>
            )}
          </div>
        </summary>
        <div className={styles.detail}>
          {resultMode !== "none" && r.played > 0 && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>This session</span>
              <span>
                Played <strong className={styles.detailStrong}>{r.played}</strong> · Won <strong className={styles.detailStrong}>{r.wins}</strong>
                {resultMode === "score" && (
                  <>
                    {" "}
                    · Points{" "}
                    <strong className={styles.detailStrong}>
                      {r.pointsFor}–{r.pointsAgainst}
                    </strong>
                  </>
                )}
              </span>
            </div>
          )}
          {resultMode !== "none" && r.played > 0 && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Opponents</span>
              <span>
                <strong className={styles.detailStrong}>{difficulty(r.oppEdge)}</strong>
              </span>
            </div>
          )}
          {r.partnersCount > 0 && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Partners</span>
              <span>
                <strong className={styles.detailStrong}>{r.partnersCount}</strong> different
              </span>
            </div>
          )}
          {r.favPartner !== "—" && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Best partner</span>
              <span>
                <strong className={styles.detailStrong}>{r.favPartner}</strong> · won {share(r.favPartnerWin, r.favPartnerGames)} of {r.favPartnerGames}
              </span>
            </div>
          )}
          {r.toughOpp !== "—" && (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Toughest opponent</span>
              <span>
                <strong className={styles.detailStrong}>{r.toughOpp}</strong> · lost {share(r.toughOppLoss, r.toughOppGames)} of {r.toughOppGames}
              </span>
            </div>
          )}
          {r.section === "tooFew" && r.played > 0 && (
            <div className={styles.fewNote}>
              Played {r.played} of {r.mostGames}. A rank needs at least 3 games, and at least half as many as the player with the most.
            </div>
          )}
          {r.section === "notRanked" && <div className={styles.fewNote}>Plays, but isn&apos;t competing for a place. Doesn&apos;t change anyone else&apos;s record.</div>}
          {!hasInsights && <div>Not enough games yet.</div>}
          {!hideTier && canEdit && (
            <div className={styles.tierRow}>
              <span className={styles.tierLabel}>Tier (A strongest):</span>
              <LevelPicker value={r.level} onChange={r.onSetLevel} size="sm" />
            </div>
          )}
          {canEdit && r.onToggleCounted && resultMode !== "none" && (
            <button className={styles.countBtn} onClick={r.onToggleCounted}>
              {r.inRankings ? "Exclude from rankings" : "Include in rankings"}
            </button>
          )}
        </div>
      </details>
    );
  };

  const ranked = rankingsVM.filter((r) => r.section === "ranked");
  const tooFew = rankingsVM.filter((r) => r.section === "tooFew");
  const notRanked = rankingsVM.filter((r) => r.section === "notRanked");

  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <div>
            <div className={styles.titleLine}>
              <h1 className={styles.title}>Rankings</h1>
              {resultMode !== "none" && (
                <button className={styles.infoBtn} onClick={() => setInfoOpen(true)} aria-label="How rankings work">
                  ⓘ
                </button>
              )}
            </div>
            {rankingsVM.length > 0 && <div className={styles.subtitle}>{RULE[resultMode]}</div>}
          </div>
          {rankingsVM.some((r) => r.rank !== null) && (
            <button className={styles.shareBtn} onClick={onShareRankings}>
              <ShareNodesIcon />
              Share
            </button>
          )}
        </div>
      </div>

      {early && <div className={styles.earlyNote}>Early standings. Settles after round 2</div>}

      {rankingsVM.length === 0 && <div className={styles.empty}>No players yet. Add some in Manage.</div>}

      {resultMode === "none" ? (
        <div className={styles.list}>{rankingsVM.map(renderRow)}</div>
      ) : (
        <>
          <div className={styles.list}>{ranked.map(renderRow)}</div>
          {ranked.length === 0 && tooFew.some((r) => r.played > 0) && <div className={styles.empty}>Ranks appear once players have 3 games.</div>}
          {tooFew.length > 0 && (
            <>
              <div className={styles.groupLabel}>Not enough games yet</div>
              <div className={styles.list}>{tooFew.map(renderRow)}</div>
            </>
          )}
          {notRanked.length > 0 && (
            <>
              <div className={styles.groupLabel}>Not ranked</div>
              <div className={styles.list}>{notRanked.map(renderRow)}</div>
            </>
          )}
        </>
      )}

      {infoOpen &&
        createPortal(
          <div className={styles.sheetBackdrop} onClick={() => setInfoOpen(false)}>
            <div className={styles.sheet} role="dialog" aria-label="How rankings work" onClick={(e) => e.stopPropagation()}>
              <div className={styles.sheetTitle}>How rankings work</div>
              <ol className={styles.sheetList}>
                <li>
                  <strong>Win rate first.</strong> The order counts everyone as starting with 1 win and 1 loss, so one lucky game doesn&apos;t put you on
                  top. The % shown on each row is your real win rate.
                </li>
                <li>
                  <strong>Same win rate?</strong> Whoever played tougher matches is higher: the other team&apos;s tiers against their own, on average.
                </li>
                {resultMode === "score" ? (
                  <li>
                    <strong>Still level?</strong> Whoever won more of the points is higher. That % also starts everyone at an even split, so a couple of
                    games can&apos;t swing it.
                  </li>
                ) : (
                  <li>
                    <strong>Still level?</strong> More games played is higher.
                  </li>
                )}
                <li>
                  <strong>You need at least 3 games</strong>, and at least half as many as the player with the most, to get a rank. Others are listed under
                  &quot;Not enough games yet&quot;. Medals wait until most players have played 2 games.
                </li>
              </ol>
              <div className={styles.sheetNote}>Partners rotate all night, so partner luck evens out.</div>
              <button className={styles.sheetClose} onClick={() => setInfoOpen(false)}>
                Got it
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
