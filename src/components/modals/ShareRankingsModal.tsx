import { AppIcon } from "../AppIcon";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

function rankBadgeClass(rank: number) {
  if (rank === 1) return styles.gold;
  if (rank === 2) return styles.silver;
  if (rank === 3) return styles.bronze;
  return "";
}

export function ShareRankingsModal({ open, top, sessionName, sessionSchedule, close, download, cardRef }: ShareRankingsProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <div className={styles.wrap}>
        <div className={styles.card} ref={cardRef}>
          <div className={styles.glow1} />
          <div className={styles.glow2} />
          <div className={styles.dots} />

          <div className={styles.cardHead}>
            <div className={styles.cardBadge}>
              <AppIcon size={18} />
            </div>
            <div className={styles.cardBrand}>{sessionName}</div>
            <span className={styles.cardTag}>Final Standings</span>
          </div>
          <div className={styles.cardTitle}>{sessionName} Rankings</div>
          {sessionSchedule && <div className={styles.cardSubtitle}>{sessionSchedule}</div>}

          <div className={styles.rows}>
            {top.map((r) => (
              <div className={`${styles.row} ${r.rank <= 3 ? styles.top : ""} ${r.rank === 1 ? styles.first : ""}`} key={r.rank}>
                <span className={`${styles.rowBadge} ${rankBadgeClass(r.rank)}`}>{r.rank}</span>
                <span className={styles.rowName}>{r.name}</span>
                <span className={styles.rowRecord}>
                  {r.wins}W-{r.losses}L
                </span>
              </div>
            ))}
          </div>
          <div className={styles.footerNote}>Made with SmashMatch</div>
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
