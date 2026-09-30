import { AppIcon } from "../AppIcon";
import { TrophyIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** Splits a session name into a two-tone "wordmark" — first word / first
 * capitalized segment gets the plain color, the rest gets the accent. Falls
 * back to one plain-colored piece when there's no good split point (a
 * single all-lowercase word), rather than guessing wrong. */
function splitWordmark(name: string): [string, string] {
  const spaceIdx = name.indexOf(" ");
  if (spaceIdx > 0) return [name.slice(0, spaceIdx), name.slice(spaceIdx + 1)];
  const rest = name.slice(1);
  const capMatch = rest.match(/[A-Z]/);
  if (capMatch && capMatch.index !== undefined) {
    const splitAt = capMatch.index + 1;
    return [name.slice(0, splitAt), name.slice(splitAt)];
  }
  return [name, ""];
}

export function ShareRankingsModal({ open, top, early, sessionName, playersCount, matchesCompleted, close, download, cardRef }: ShareRankingsProps) {
  if (!open) return null;
  const [wordA, wordB] = splitWordmark(sessionName);

  return (
    <div className={styles.backdrop}>
      <div className={styles.wrap}>
        <div className={styles.card} ref={cardRef}>
          <div className={styles.glow1} />
          <div className={styles.glow2} />

          <div className={styles.cardBody}>
            <div className={styles.wordmarkRow}>
              <AppIcon size={30} />
              <div className={styles.wordmark}>
                <span className={styles.wordmarkPlain}>{wordA}</span>
                {wordB && <span className={styles.wordmarkAccent}> {wordB}</span>}
              </div>
            </div>
            <div className={styles.subheading}>
              <TrophyIcon className={styles.subheadingIcon} />
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
                <div className={`${styles.row} ${r.medal === 1 ? styles.rowFirst : ""}`} key={r.rank}>
                  <span className={styles.rankBadge}>{r.medal ? MEDAL[r.medal] : r.rank}</span>
                  <span className={styles.rowName}>{r.name}</span>
                  <div className={styles.statLine}>
                    {/* W/L letters: an earlier version dropped them because
                       html2canvas rendered a capital "L" as "I" in one capture
                       environment. With this system-sans stat line the exported
                       PNG shows them correctly (checked by exporting the card).
                       If they ever come out wrong on a device, drop the letters
                       and let the colours carry the win/loss distinction. */}
                    <span className={styles.win}>{r.wins}W</span>
                    <span className={styles.statDash}>–</span>
                    <span className={styles.loss}>{r.losses}L</span>
                    <span className={styles.statDash}>·</span>
                    <span>{r.winPct}%</span>
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
            Download Image
          </button>
        </div>
      </div>
    </div>
  );
}
