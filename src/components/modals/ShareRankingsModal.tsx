import { useEffect, useRef, useState } from "react";
import { shortName } from "../../lib/session";
import { CROWN_IMAGE } from "../../lib/crownImage";
import { SHARE_CARD_H, SHARE_CARD_W } from "../../lib/shareCard";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

/** The widest the preview gets on screen; the picture itself is always SHARE_CARD_W wide. */
const PREVIEW_MAX_W = 360;
/** The backdrop's 16px gutter, both sides. */
const PREVIEW_GUTTER = 32;

/** The card carries the group's name, not the app's: a session called
 * "SmashMatch GoBadmin" shows as "GoBadmin". */
function cardTitle(sessionName: string): string {
  return sessionName.replace(/^\s*smash\s*match\b[\s·\-–—:|]*/i, "").trim() || sessionName;
}

/** Fits the full-size card into the phone's width. */
function usePreviewScale(): number {
  const [width, setWidth] = useState(() => Math.min(PREVIEW_MAX_W, window.innerWidth - PREVIEW_GUTTER));
  useEffect(() => {
    const onResize = () => setWidth(Math.min(PREVIEW_MAX_W, window.innerWidth - PREVIEW_GUTTER));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width / SHARE_CARD_W;
}

/** An angled panel. The design's slanted edges are drawn as SVG polygons because
 * html2canvas can't draw CSS clip-path; `points` are in percent of the box. */
function Shape({ points, fill, opacity = 1 }: { points: string; fill: string; opacity?: number }) {
  return (
    <svg className={styles.shape} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={points} fill={fill} fillOpacity={opacity} />
    </svg>
  );
}

export function ShareRankingsModal({ open, top, early, sessionName, playersCount, matchesCompleted, close, download, cardRef, fallbackImageUrl, onOpenImage, onCloseImage, photo, onPickPhoto, onClearPhoto }: ShareRankingsProps) {
  const scale = usePreviewScale();
  const fileInput = useRef<HTMLInputElement>(null);
  if (!open) return null;

  const title = cardTitle(sessionName);
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const leader = top[0];
  // fewer players than the design's eight: spread the rows out a little
  const rowGap = top.length >= 7 ? 16 : top.length >= 6 ? 24 : top.length >= 4 ? 32 : 40;

  // Where a phone can't save from the page (some browsers, home-screen apps),
  // the picture itself is shown: press and hold it to save.
  if (fallbackImageUrl) {
    return (
      <div className={styles.backdrop}>
        <div className={styles.wrap}>
          <img className={styles.fallbackImg} src={fallbackImageUrl} alt={`Top ${top.length} rankings`} />
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
        {/* The card is laid out at its real 1179 x 1440 and scaled down by a
           transform just for this preview. renderRankingsImage undoes the
           transform on the copy it draws from (data-share-frame/-card), so the
           exported picture is full size whatever the phone. */}
        <div className={styles.frame} data-share-frame style={{ width: SHARE_CARD_W * scale, height: SHARE_CARD_H * scale }}>
          <div className={styles.card} ref={cardRef} data-share-card style={{ transform: `scale(${scale})` }}>
            <div className={styles.glow} />
            {photo ? (
              <div className={styles.photo}>
                <img className={styles.photoImg} src={photo} alt="" />
                <div className={styles.photoFadeSide} />
                <div className={styles.photoFadeBottom} />
              </div>
            ) : (
              // no photo picked: the leader's initials, huge and faint, in its place
              leader && (
                <div className={styles.ghost}>
                  <span data-xfix>{leader.initials}</span>
                </div>
              )
            )}

            <div className={styles.header}>
              <div className={styles.logo}>
                <img className={styles.logoImg} src={`${import.meta.env.BASE_URL}gobadmin-logo.png`} alt="GoBadmin" />
              </div>
              <div className={styles.title}>
                <span className={styles.titleLine} data-xfix>
                  {early ? "EARLY" : `TOP ${top.length}`}
                </span>
                <span className={`${styles.titleLine} ${styles.titleAccent}`} data-xfix>
                  {early ? "STANDINGS" : "RANKINGS"}
                </span>
              </div>
              <div className={styles.pill}>
                <span className={styles.pillText} data-xfix>
                  Mabar · {date} · {title}
                </span>
              </div>
            </div>

            <div className={styles.panel}>
              <Shape points="0,0 100,0 91,100 0,100" fill="#101E2F" />
            </div>

            <div className={styles.columns}>
              <div className={styles.rankCol} />
              <div className={styles.colPlayer} data-xfix>
                Player
              </div>
              <div className={styles.colRate} data-xfix>
                Win Rate
              </div>
            </div>

            <div className={styles.list} style={{ gap: rowGap }}>
              {top.map((r) => {
                const first = r.rank === 1;
                // the filled part of the win-rate cell can't start left of its slanted edge
                const fillTo = Math.max(7, Math.min(100, r.winPct));
                return (
                  <div className={styles.row} key={r.rank}>
                    <div className={styles.rankCol}>
                      {first && <img className={styles.crown} src={CROWN_IMAGE} alt="" />}
                      <div className={`${styles.rank} ${first ? styles.rankFirst : ""}`} data-xfix>
                        {r.rank}
                      </div>
                    </div>
                    <div className={styles.rowMain}>
                      <div className={styles.nameBar}>
                        <Shape points="0,0 100,0 98.5,100 0,100" fill="#FFFFFF" opacity={first ? 1 : 0.06} />
                        <span className={styles.avatar}>
                          <span className={styles.avatarText} data-xfix>
                            {r.initials}
                          </span>
                        </span>
                        <span className={`${styles.name} ${first ? styles.nameFirst : ""}`} data-xfix>
                          {shortName(r.name, 18)}
                        </span>
                        {first && (
                          <span className={styles.mvp} data-xfix>
                            MVP
                          </span>
                        )}
                      </div>
                      <div className={styles.winCell}>
                        <Shape points="7,0 100,0 100,100 0,100" fill="#FFFFFF" opacity={0.12} />
                        {r.winPct > 0 && <Shape points={`7,0 ${fillTo},0 ${fillTo},100 0,100`} fill="#FF4A1A" />}
                        <div className={styles.pct} data-xfix>
                          {r.winPct}%
                        </div>
                        <div className={styles.record} data-xfix>
                          {r.wins}W–{r.losses}L
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.chip}>
              <span data-xfix>
                {title} · {playersCount} players · {matchesCompleted} matches
              </span>
            </div>
            <div className={styles.cta}>
              <span data-xfix>Follow @gobadmin for the next Mabar →</span>
            </div>
            <div className={styles.bar} />
          </div>
        </div>

        <div className={styles.photoRow}>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickPhoto(file);
              e.target.value = ""; // picking the same photo again should still fire
            }}
          />
          <button className={styles.photoBtn} onClick={() => fileInput.current?.click()}>
            {photo ? "Change 1st place photo" : "Add 1st place photo"}
          </button>
          {photo && (
            <button className={styles.photoBtn} onClick={onClearPhoto}>
              Remove
            </button>
          )}
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
