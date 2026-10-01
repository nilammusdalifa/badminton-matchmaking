import { useRef } from "react";
import { shortName } from "../../lib/session";
// inlined as a data URI so the exporter always has the picture ready, with nothing to fetch
import logoUrl from "../../assets/gobadmin-logo.png?inline";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

/** "Mabar 30 Sept 26": the card's headline tag. */
function sessionTag(now: Date): string {
  return `Mabar ${now.getDate()} ${MONTHS[now.getMonth()]} ${String(now.getFullYear()).slice(-2)}`;
}

export function ShareRankingsModal({
  open,
  top,
  highlights,
  early,
  playersCount,
  matchesCompleted,
  close,
  download,
  cardRef,
  fallbackImageUrl,
  onOpenImage,
  onCloseImage,
  championName,
  photoUrl,
  hasPhoto,
  canEditPhoto,
  onPickPhoto,
  onRemovePhoto,
}: ShareRankingsProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  if (!open) return null;

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
        <div className={`${styles.card} ${photoUrl ? styles.hasPhoto : ""}`} ref={cardRef}>
          <div className={styles.band1} />
          <div className={styles.dots} />
          {/* the champion, in black and white, fading into the card on its left and bottom */}
          {photoUrl && <img className={styles.photo} src={photoUrl} alt="" />}
          <div className={styles.logoPlate}>
            <img className={styles.logo} src={logoUrl} alt="GoBadmin" />
          </div>

          <div className={styles.cardBody}>
            <div className={styles.datePill}>
              <span className={styles.datePillText} data-xfix>
                {sessionTag(new Date())}
              </span>
            </div>
            <div className={styles.title} data-xfix>
              Leaderboard
            </div>
            {early && (
              <div className={styles.earlyTag} data-xfix>
                Early standings
              </div>
            )}

            <div className={styles.colHeadRow}>
              <span className={styles.colHead}>
                <span className={styles.colHeadText} data-xfix>
                  Winrate
                </span>
              </span>
            </div>
            <div className={styles.list}>
              {top.map((r) => (
                <div className={styles.row} key={r.rank}>
                  <span className={styles.rank}>
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
                  <div className={styles.bar}>
                    <div className={styles.nameCol}>
                      <div className={styles.name} data-xfix>
                        {shortName(r.name, photoUrl ? 10 : 14)}
                      </div>
                      {/* W/L letters are drawn in the system sans: html2canvas has clipped glyphs (W, L) under bold monospace fonts. */}
                      <div className={styles.record} data-xfix>
                        {r.wins}W–{r.losses}L
                      </div>
                    </div>
                    <span className={styles.pct}>
                      <span className={styles.pctText} data-xfix>
                        {r.winPct}%
                      </span>
                    </span>
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

        {canEditPhoto && (
          <div className={styles.photoRow}>
            <button className={styles.photoBtn} onClick={() => fileRef.current?.click()}>
              {hasPhoto ? "Change" : "Add"} photo of {shortName(championName, 14)}
            </button>
            {hasPhoto && (
              <button className={styles.linkBtn} onClick={onRemovePhoto}>
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              className={styles.fileInput}
              type="file"
              accept="image/*"
              aria-label="Photo of the first-place player"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onPickPhoto(file);
              }}
            />
          </div>
        )}

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
