import { shortName } from "../../lib/session";
// inlined as a data URI so the exporter always has the picture ready, with nothing to fetch
import logoUrl from "../../assets/gobadmin-logo.png?inline";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function ShareRankingsModal({ open, top, highlights, early, sessionSchedule, playersCount, matchesCompleted, close, download, cardRef, fallbackImageUrl, onOpenImage, onCloseImage }: ShareRankingsProps) {
  if (!open) return null;
  // the schedule if there is one (cut short so the line fits), otherwise today's date
  const schedule = sessionSchedule.trim();
  const when = schedule ? (schedule.length > 28 ? schedule.slice(0, 27).trimEnd() + "…" : schedule) : new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // Where a phone can't save from the page (some browsers, home-screen apps),
  // the picture itself is shown: press and hold it to save.
  if (fallbackImageUrl) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.wrap}>
          <img className={styles.fallbackImg} src={fallbackImageUrl} alt="Top 5 rankings" />
          <div className={styles.fallbackHint}>Press and hold the picture, then choose Save Image.</div>
          <div className={styles.actions}>
            <button className={styles.closeBtn} onClick={onCloseImage}>
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.wrap}>
        <div className={styles.card} ref={cardRef}>
          {/* the app's own backdrop: soft teal, sage and peach glows over a faint dot grid */}
          <div className={styles.glow1} />
          <div className={styles.glow2} />
          <div className={styles.glow3} />
          <div className={styles.dots} />
          {/* confetti: plain coloured dots, which both the browser and the exporter draw the same */}
          <span className={`${styles.confetti} ${styles.c1}`} />
          <span className={`${styles.confetti} ${styles.c2}`} />
          <span className={`${styles.confetti} ${styles.c3}`} />
          <span className={`${styles.confetti} ${styles.c4}`} />
          <span className={`${styles.confetti} ${styles.c5}`} />
          <span className={`${styles.confetti} ${styles.c6}`} />
          <span className={`${styles.confetti} ${styles.c7}`} />
          <span className={`${styles.confetti} ${styles.c8}`} />

          <div className={styles.cardBody}>
            <div className={styles.logoRow}>
              <div className={styles.logoPlate}>
                <img className={styles.logo} src={logoUrl} alt="GoBadmin" />
              </div>
            </div>
            <div className={styles.subheading}>
              <span className={styles.subheadingIcon} aria-hidden="true">
                🏆
              </span>
              {early ? "Early standings" : `Top ${top.length} Rankings`}
            </div>

            {/* Every row, the leader's included, has one fixed height and structure.
               That sidesteps a real html2canvas bug hit while this used a podium: a
               flex row whose children had different heights (staggered margins for
               #2/#3) rendered with badly wrong vertical positions during capture,
               overlapping the row below, even though it looked fine on screen. */}
            <div className={styles.list}>
              {top.map((r) => (
                <div className={`${styles.row} ${r.medal ? styles["medal" + r.medal] : ""}`} key={r.rank}>
                  <span className={styles.rankBadge} data-xfix>{r.medal ? MEDAL[r.medal] : r.rank}</span>
                  <span className={`${styles.avatar} ${r.medal ? styles["avatar" + r.medal] : ""}`}>
                    <span className={styles.avatarText} data-xfix>
                      {r.initials}
                    </span>
                  </span>
                  <span className={styles.rowName} data-xfix>{shortName(r.name, 12)}</span>
                  <div className={styles.statBlock}>
                    <div className={styles.statPct} data-xfix>
                      {r.winPct}%
                    </div>
                    {/* W/L letters: an earlier version dropped them because
                       html2canvas rendered a capital "L" as "I" in one capture
                       environment. With this system-sans stat line the exported
                       PNG shows them correctly (checked by exporting the card).
                       If they ever come out wrong on a device, drop the letters
                       and let the colours carry the win/loss distinction. */}
                    <div className={styles.statLine} data-xfix>
                      <span className={styles.win}>{r.wins}W</span>
                      <span className={styles.statDash}>–</span>
                      <span className={styles.loss}>{r.losses}L</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {highlights.length > 0 && (
              <div className={styles.highlights}>
                {highlights.map((h) => (
                  <div className={styles.highlight} key={h.label} data-xfix>
                    <span className={styles.highlightIcon}>{h.icon}</span>
                    <span className={styles.highlightLabel}>{h.label}</span>
                    <span className={styles.highlightText}>{h.text}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.footer}>
              {when} · {playersCount} players · {matchesCompleted} matches
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <button className={styles.closeBtn} onClick={close}>
            Close
          </button>
          <button className={styles.downloadBtn} onClick={download}>
            Save Image
          </button>
        </div>
        <button className={styles.linkBtn} onClick={onOpenImage}>
          Not saving? Open the picture
        </button>
      </div>
    </div>
  );
}
