import { shortName } from "../../lib/session";
// inlined as a data URI so the exporter always has the picture ready, with nothing to fetch
import logoUrl from "../../assets/gobadmin-logo-light.png?inline";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

export function ShareRankingsModal({ open, top, highlights, early, sessionSchedule, playersCount, matchesCompleted, close, download, cardRef, fallbackImageUrl, onOpenImage, onCloseImage }: ShareRankingsProps) {
  if (!open) return null;
  // The schedule (cut short so it fits the pill), without the group's own name, which the logo already says;
  // today's date when there is no schedule.
  const schedule = sessionSchedule.replace(/^\s*go\s*badmin\b[\s·\-–—:|,]*/i, "").trim();
  const when = schedule ? (schedule.length > 24 ? schedule.slice(0, 23).trimEnd() + "…" : schedule) : new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

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
          <div className={styles.band1} />
          <div className={styles.dots} />

          <div className={styles.cardBody}>
            <img className={styles.logo} src={logoUrl} alt="GoBadmin" />
            <div className={styles.title}>
              <div className={styles.titleA} data-xfix>
                {early ? "Early" : `Top ${top.length}`}
              </div>
              <div className={styles.titleB} data-xfix>
                {early ? "Standings" : "Rankings"}
              </div>
            </div>
            <div className={styles.pillRow}>
              <div className={styles.pill}>
                <span className={styles.pillText} data-xfix>
                  {when}
                </span>
              </div>
            </div>

            <div className={styles.colHead} data-xfix>
              Win rate
            </div>
            <div className={styles.list}>
              {top.map((r) => (
                <div className={styles.row} key={r.rank}>
                  <span className={`${styles.rank} ${r.medal ? styles["rank" + r.medal] : ""}`}>
                    <span className={styles.rankText} data-xfix>
                      {r.rank}
                    </span>
                    {/* the crown's own box is positioned; the text inside it takes the export nudge */}
                    {r.medal === 1 && (
                      <span className={styles.crown}>
                        <span className={styles.crownText} data-xfix>
                          👑
                        </span>
                      </span>
                    )}
                  </span>
                  <span className={styles.name} data-xfix>
                    {shortName(r.name, 10)}
                  </span>
                  {/* W/L letters are drawn in the system sans: html2canvas has clipped glyphs (W, L) under bold monospace fonts. */}
                  <span className={styles.record} data-xfix>
                    {r.wins}W–{r.losses}L
                  </span>
                  <span className={styles.pct}>
                    <span className={styles.pctText} data-xfix>
                      {r.winPct}%
                    </span>
                  </span>
                </div>
              ))}
            </div>

            {highlights.length > 0 && (
              <div className={styles.highlights}>
                {highlights.map((h) => (
                  <div className={styles.highlight} key={h.label} data-xfix>
                    <span className={styles.highlightIcon}>{h.icon}</span>
                    <span className={styles.highlightLabel}>{h.label}</span>
                    <span>{h.text}</span>
                  </div>
                ))}
              </div>
            )}

            <div className={styles.footer} data-xfix>
              {playersCount} players · {matchesCompleted} matches
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
