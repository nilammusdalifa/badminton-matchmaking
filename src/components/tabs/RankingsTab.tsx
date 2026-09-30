import { useState } from "react";
import { createPortal } from "react-dom";
import { LevelPicker } from "../LevelPicker";
import { ShareNodesIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./RankingsTab.module.css";

type RankingsTabProps = SessionStore["rankings"] & { hideTier?: boolean };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const RULE: Record<string, string> = {
  score: "Best win rate first · ties by points won",
  winner: "Best win rate first · ties by games played",
  none: "This session doesn't record results.",
};

// Wins/losses behind a rounded percentage ("won 2 of 3" reads better than "67%").
const share = (pct: number, games: number) => Math.round((pct * games) / 100);

export function RankingsTab({ rankingsVM, resultMode, early, onShareRankings, hideTier }: RankingsTabProps) {
  const [infoOpen, setInfoOpen] = useState(false);
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

      <div className={styles.list}>
        {rankingsVM.map((r) => {
          // Medals and their tint follow the medal rule, not just the list position.
          const topRank = r.medal;
          const record = resultMode === "none" ? `${r.played} played` : r.played === 0 ? "Not played" : `${r.wins}W–${r.losses}L`;
          const hasInsights = r.favPartner !== "—" || r.toughOpp !== "—";
          return (
            <details className={`${styles.row} ${topRank ? styles["top" + topRank] : ""}`} key={r.id}>
              <summary className={styles.summary}>
                <div className={styles.summaryTop}>
                  <span className={styles.rank}>{topRank ? MEDAL[topRank] : (r.rank ?? "—")}</span>
                  <div className={`${styles.avatar} ${topRank ? styles["avatarTop" + topRank] : ""}`}>{r.initials}</div>
                  <span className={styles.name}>
                    {r.name} {!hideTier && <span className={styles.level}>Tier {r.level}</span>}
                    {r.fewGames && <span className={styles.fewTag}>Fewer games</span>}
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
                      {r.winPct}% wins{r.pointsPct !== null && ` · ${r.pointsPct}% points`}
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
                {r.fewGames && (
                  <div className={styles.fewNote}>
                    Played {r.played} of {r.mostGames}. Rank may change as more games are played.
                  </div>
                )}
                {!hasInsights && <div>Not enough games yet.</div>}
                {!hideTier && (
                  <div className={styles.tierRow}>
                    <span className={styles.tierLabel}>Tier (A strongest):</span>
                    <LevelPicker value={r.level} onChange={r.onSetLevel} size="sm" />
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {infoOpen &&
        createPortal(
          <div className={styles.sheetBackdrop} onClick={() => setInfoOpen(false)}>
            <div className={styles.sheet} role="dialog" aria-label="How rankings work" onClick={(e) => e.stopPropagation()}>
              <div className={styles.sheetTitle}>How rankings work</div>
              <ol className={styles.sheetList}>
                <li>
                  <strong>Win rate first.</strong> Everyone starts at 1 win, 1 loss, so one lucky game doesn&apos;t put you on top. The % shown is the one that
                  decides the order.
                </li>
                {resultMode === "score" ? (
                  <li>
                    <strong>Same win rate?</strong> Whoever won more of the points is higher. That % also starts everyone at an even split, so a couple of
                    games can&apos;t swing it.
                  </li>
                ) : (
                  <li>
                    <strong>Same win rate?</strong> More games played is higher.
                  </li>
                )}
                <li>
                  <strong>Medals need at least 3 games</strong>, and 60% of the most games anyone has played. Until everyone has played 2 games, standings are
                  early and there are no medals.
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
