import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** Splits a session name into a two-tone "wordmark" — first word / first
 * capitalized segment gets the plain color, the rest gets the accent. Falls
 * back to one plain-colored piece when there's no good split point (a
 * single all-lowercase word), rather than guessing wrong. */
function splitWordmark(name: string): [string, string, string] {
  const spaceIdx = name.indexOf(" ");
  if (spaceIdx > 0) return [name.slice(0, spaceIdx), name.slice(spaceIdx + 1), " "];
  const rest = name.slice(1);
  const capMatch = rest.match(/[A-Z]/);
  if (capMatch && capMatch.index !== undefined) {
    const splitAt = capMatch.index + 1;
    // split at a capital inside one word ("GoBadmin"): no space to add back
    return [name.slice(0, splitAt), name.slice(splitAt), ""];
  }
  return [name, "", ""];
}

/** The card carries the group's name, not the app's: a session called
 * "SmashMatch GoBadmin" shows as "GoBadmin". */
function cardTitle(sessionName: string): string {
  return sessionName.replace(/^\s*smash\s*match\b[\s·\-–—:|]*/i, "").trim() || sessionName;
}

export function ShareRankingsModal({ open, top, early, sessionName, playersCount, matchesCompleted, close, download, cardRef, fallbackImageUrl, onOpenImage, onCloseImage }: ShareRankingsProps) {
  if (!open) return null;
  const [wordA, wordB, joiner] = splitWordmark(cardTitle(sessionName));

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

          <div className={styles.cardBody}>
            <div className={styles.wordmarkRow}>
              <div className={styles.wordmark}>
                <span className={styles.wordmarkPlain}>{wordA}</span>
                {wordB && <span className={styles.wordmarkAccent}>{joiner}{wordB}</span>}
              </div>
            </div>
            <div className={styles.subheading}>
              <span className={styles.subheadingIcon} aria-hidden="true">
                🏆
              </span>
              {early ? "Early standings" : `Top ${top.length} Rankings`}
            </div>

            {/* A single uniform-height row per rank — every row has the exact
               same structure/height, which sidesteps a real html2canvas bug
               hit while this used a podium: a flex row whose children had
               different heights (bigger #1 avatar, staggered margins for
               #2/#3) rendered with badly wrong vertical positions during
               capture, overlapping the row below, even though it looked
               fine on screen. Uniform rows have nothing uneven to get wrong. */}
            <div className={styles.list}>
              {top.map((r) => (
                <div className={`${styles.row} ${r.medal ? styles["medal" + r.medal] : ""}`} key={r.rank}>
                  <span className={styles.rankBadge}>{r.medal ? MEDAL[r.medal] : r.rank}</span>
                  <span className={`${styles.avatar} ${r.medal ? styles["avatar" + r.medal] : ""}`}>
                    <span className={styles.avatarText}>{r.initials}</span>
                  </span>
                  <span className={styles.rowName}>{r.name}</span>
                  <div className={styles.statBlock}>
                    {/* W/L letters: an earlier version dropped them because
                       html2canvas rendered a capital "L" as "I" in one capture
                       environment. With this system-sans stat line the exported
                       PNG shows them correctly (checked by exporting the card).
                       If they ever come out wrong on a device, drop the letters
                       and let the colours carry the win/loss distinction. */}
                    <div className={styles.statLine}>
                      <span className={styles.win}>{r.wins}W</span>
                      <span className={styles.statDash}>–</span>
                      <span className={styles.loss}>{r.losses}L</span>
                    </div>
                    <div className={styles.statPct}>{r.winPct}%</div>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.footer}>
              Tonight&apos;s standings · {playersCount} players · {matchesCompleted} matches
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
