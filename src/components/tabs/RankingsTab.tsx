import { LevelPicker } from "../LevelPicker";
import { ShareNodesIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./RankingsTab.module.css";

type RankingsTabProps = SessionStore["rankings"] & { hideTier?: boolean };

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function RankingsTab({ rankingsVM, onShareRankings, hideTier }: RankingsTabProps) {
  return (
    <>
      <div className={styles.section}>
        <div className={styles.titleRow}>
          <div>
            <h1 className={styles.title}>Rankings</h1>
            {rankingsVM.length > 0 && <div className={styles.subtitle}>See how everyone's playing this session</div>}
          </div>
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
        {rankingsVM.map((r) => {
          const played = r.wins + r.losses;
          const winRate = played > 0 ? Math.round((r.wins / played) * 100) : null;
          const topRank = r.rank <= 3 ? r.rank : null;
          return (
            <details className={`${styles.row} ${topRank ? styles["top" + topRank] : ""}`} key={r.id}>
              <summary className={styles.summary}>
                <div className={styles.summaryTop}>
                  <span className={styles.rank}>{topRank ? MEDAL[topRank] : r.rank}</span>
                  <div className={`${styles.avatar} ${topRank ? styles["avatarTop" + topRank] : ""}`}>{r.initials}</div>
                  <span className={styles.name}>
                    {r.name} {!hideTier && <span className={styles.level}>Tier {r.level}</span>}
                  </span>
                  <span className={styles.winRate}>{winRate === null ? "—" : `${winRate}%`}</span>
                </div>
                <div className={styles.summaryBottom}>
                  <div className={styles.barTrack}>
                    <div className={styles.barFill} style={{ width: `${winRate ?? 0}%` }} />
                  </div>
                  <div className={styles.formDots}>
                    {r.recentForm.length === 0
                      ? Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.formDotEmpty} />)
                      : r.recentForm.map((res, i) => (
                          <span key={i} className={res > 0 ? styles.formDotWin : styles.formDotLoss} />
                        ))}
                  </div>
                </div>
              </summary>
              <div className={styles.detail}>
                <div className={styles.detailStat}>
                  <span className={styles.detailStatValue}>
                    {r.wins}W – {r.losses}L
                  </span>
                  <span className={styles.ratingCaption}>Rating {r.rating} · goes up with wins, down with losses</span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Favorite partner</span>
                  <span>
                    <strong className={styles.detailStrong}>{r.favPartner}</strong>
                    {r.favPartner !== "—" && ` · ${r.favPartnerWin}% win, ${r.favPartnerGames} together`}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Tough opponent</span>
                  <span>
                    <strong className={styles.detailStrong}>{r.toughOpp}</strong>
                    {r.toughOpp !== "—" && ` · ${r.toughOppLoss}% loss, ${r.toughOppGames} faced`}
                  </span>
                </div>
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Rotation</span>
                  <span>
                    Avg wait {r.avgWait} min · most games in a row: {r.maxConsecutive}
                  </span>
                </div>
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
