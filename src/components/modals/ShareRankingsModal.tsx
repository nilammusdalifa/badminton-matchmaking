import { AppIcon } from "../AppIcon";
import { TrophyIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import type { ShareRankingEntry } from "../../types.viewmodel";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

const PODIUM_ORDER: [2, 1, 3] = [2, 1, 3];

export function ShareRankingsModal({
  open,
  top,
  sessionName,
  sessionSchedule,
  playersCount,
  matchesCompleted,
  close,
  download,
  cardRef,
}: ShareRankingsProps) {
  if (!open) return null;
  const byRank = new Map<number, ShareRankingEntry>(top.map((r) => [r.rank, r]));
  const podium = PODIUM_ORDER.map((rank) => byRank.get(rank)).filter((r): r is ShareRankingEntry => Boolean(r));
  const rest = top.filter((r) => r.rank > 3);

  return (
    <div className={styles.backdrop}>
      <div className={styles.wrap}>
        <div className={styles.card} ref={cardRef}>
          <div className={styles.glow1} />
          <div className={styles.glow2} />
          <div className={styles.dots} />

          <div className={styles.cardHead}>
            <div className={styles.cardBadge}>
              <AppIcon size={16} />
            </div>
            <div className={styles.cardBrand}>SmashMatch</div>
            <span className={styles.cardTag}>Final Standings</span>
          </div>

          <div className={styles.cardTitle}>{sessionName}</div>
          <div className={styles.cardSubtitle}>
            {sessionSchedule ? sessionSchedule + " · " : ""}
            {playersCount} players · {matchesCompleted} matches
          </div>

          {podium.length > 0 && (
            <div className={styles.podium}>
              {podium.map((r) => (
                <div key={r.rank} className={`${styles.podiumSpot} ${styles["spot" + r.rank]}`}>
                  {r.rank === 1 && <TrophyIcon className={styles.trophy} />}
                  <div className={`${styles.podiumAvatar} ${styles["medal" + r.rank]}`}>{r.initials}</div>
                  <div className={styles.podiumName}>{r.name}</div>
                  <div className={styles.podiumRecord}>
                    {r.wins}W–{r.losses}L
                  </div>
                  <div className={`${styles.podiumBlock} ${styles["block" + r.rank]}`}>{r.rank}</div>
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className={styles.restList}>
              {rest.map((r) => (
                <div className={styles.restRow} key={r.rank}>
                  <span className={styles.restRank}>{r.rank}</span>
                  <span className={styles.restAvatar}>{r.initials}</span>
                  <span className={styles.restName}>{r.name}</span>
                  <span className={styles.restRecord}>
                    {r.wins}W–{r.losses}L
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.footerNote}>
            <AppIcon size={13} />
            <span>Made with SmashMatch</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.closeBtn} onClick={close}>
            Close
          </button>
          <button className={styles.downloadBtn} onClick={download}>
            Download Image
          </button>
        </div>
      </div>
    </div>
  );
}
