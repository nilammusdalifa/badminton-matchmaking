import { LevelPicker } from "../LevelPicker";
import { ShareNodesIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./RankingsTab.module.css";

type RankingsTabProps = SessionStore["rankings"];

export function RankingsTab({ rankingsVM, onShareRankings }: RankingsTabProps) {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>Rankings</h1>
          {rankingsVM.length > 0 && (
            <button className={styles.shareBtn} onClick={onShareRankings}>
              <ShareNodesIcon />
              Share Rankings
            </button>
          )}
        </div>
      </div>

      {rankingsVM.length === 0 && <div className={styles.empty}>No players yet — add some in the Manage tab.</div>}

      <div className={styles.list}>
        {rankingsVM.map((r) => (
          <details className={styles.row} key={r.id}>
            <summary className={styles.summary}>
              <span className={styles.rank}>{r.rank}</span>
              <div className={styles.avatar}>{r.initials}</div>
              <span className={styles.name}>
                {r.name} <span className={styles.level}>Tier {r.level}</span>
              </span>
              <span className={styles.played}>{r.played}p</span>
              <span className={`${styles.diff} ${r.positiveDiff ? styles.positive : styles.negative}`}>{r.diffLabel} pts</span>
              <span className={`${styles.trend} ${r.trend > 0 ? styles.up : r.trend < 0 ? styles.down : styles.flat}`}>{r.trendLabel}</span>
            </summary>
            <div className={styles.detail}>
              <div>
                {r.wins}W – {r.losses}L · rating {r.rating}
                <span className={styles.ratingCaption}> — skill rating, rises and falls with results</span>
              </div>
              <div>
                Favorite partner: <strong className={styles.detailStrong}>{r.favPartner}</strong> ({r.favPartnerWin}% win, {r.favPartnerGames}{" "}
                together)
              </div>
              <div>
                Tough opponent: <strong className={styles.detailStrong}>{r.toughOpp}</strong> ({r.toughOppLoss}% loss, {r.toughOppGames} faced)
              </div>
              <div>
                Avg wait between games: {r.avgWait} min · Longest streak: {r.maxConsecutive} games
              </div>
              <div className={styles.tierRow}>
                <span className={styles.tierLabel}>Skill tier:</span>
                <LevelPicker value={r.level} onChange={r.onSetLevel} size="sm" />
              </div>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
