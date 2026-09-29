import { LevelPicker } from "../LevelPicker";
import { ShareNodesIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./RankingsTab.module.css";

type RankingsTabProps = SessionStore["rankings"] & { hideTier?: boolean };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

const RULE: Record<string, string> = {
  score: "Most wins first, then point difference.",
  winner: "Most wins first.",
  none: "This session doesn't record results.",
};

// Wins/losses behind a rounded percentage ("won 2 of 3" reads better than "67%").
const share = (pct: number, games: number) => Math.round((pct * games) / 100);

export function RankingsTab({ rankingsVM, resultMode, onShareRankings, hideTier }: RankingsTabProps) {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Rankings</h1>
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

      {rankingsVM.length === 0 && <div className={styles.empty}>No players yet. Add some in Manage.</div>}

      <div className={styles.list}>
        {rankingsVM.map((r) => {
          const topRank = r.rank !== null && r.rank <= 3 ? r.rank : null;
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
                  </span>
                  <span className={styles.record}>{record}</span>
                </div>
                <div className={styles.summaryBottom}>
                  <div className={styles.formDots} aria-label="Last 5 results">
                    {r.recentForm.length === 0
                      ? Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.formDotEmpty} />)
                      : r.recentForm.map((res, i) => <span key={i} className={res > 0 ? styles.formDotWin : styles.formDotLoss} />)}
                  </div>
                  {resultMode === "score" && r.played > 0 && (
                    <span className={r.positiveDiff ? styles.diffPos : styles.diffNeg}>{r.diffLabel} pts</span>
                  )}
                </div>
              </summary>
              <div className={styles.detail}>
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
    </>
  );
}
