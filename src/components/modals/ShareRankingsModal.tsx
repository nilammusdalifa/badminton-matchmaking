import { useState } from "react";
import { AppIcon } from "../AppIcon";
import { TrophyIcon } from "../icons";
import type { SessionStore } from "../../hooks/useSessionStore";
import type { ShareRankingEntry } from "../../types.viewmodel";
import styles from "./ShareRankingsModal.module.css";

type ShareRankingsProps = SessionStore["shareRankings"];

const PODIUM_ORDER: [2, 1, 3] = [2, 1, 3];

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

function StatLine({ r }: { r: ShareRankingEntry }) {
  return (
    <div className={styles.statLine}>
      <span>{r.winRate}%</span>
      <span className={styles.statDot} />
      <span className={styles.win}>{r.wins}W</span>
      <span className={styles.statDash}>–</span>
      <span className={styles.loss}>{r.losses}L</span>
    </div>
  );
}

export function ShareRankingsModal({ open, top, sessionName, close, download, cardRef }: ShareRankingsProps) {
  // This deployment's club has its own logo (public/session-logo.png) — show
  // that instead of the generated two-tone text wordmark when it's actually
  // there. Falls back to the text version if the file is ever missing (a
  // fresh checkout without a logo of its own), rather than showing a broken
  // image on a card meant to be posted publicly.
  const [logoFailed, setLogoFailed] = useState(false);
  if (!open) return null;
  const byRank = new Map<number, ShareRankingEntry>(top.map((r) => [r.rank, r]));
  const podium = PODIUM_ORDER.map((rank) => byRank.get(rank)).filter((r): r is ShareRankingEntry => Boolean(r));
  const rest = top.filter((r) => r.rank > 3);
  const [wordA, wordB] = splitWordmark(sessionName);

  return (
    <div className={styles.backdrop}>
      <div className={styles.wrap}>
        <div className={styles.card} ref={cardRef}>
          <div className={styles.glow1} />
          <div className={styles.glow2} />

          {logoFailed ? (
            <div className={styles.wordmarkRow}>
              <AppIcon size={34} />
              <div className={styles.wordmark}>
                <span className={styles.wordmarkPlain}>{wordA}</span>
                {wordB && <span className={styles.wordmarkAccent}> {wordB}</span>}
              </div>
            </div>
          ) : (
            <div className={styles.logoRow}>
              <div className={styles.logoBadge}>
                <img src="/session-logo.png" alt={sessionName} className={styles.logoImg} onError={() => setLogoFailed(true)} />
              </div>
            </div>
          )}
          <div className={styles.subheading}>
            <TrophyIcon className={styles.subheadingIcon} />
            Top {top.length} Rankings
          </div>

          {podium.length > 0 && (
            <div className={styles.podium}>
              {podium.map((r) => (
                <div key={r.rank} className={`${styles.podiumSpot} ${styles["spot" + r.rank]}`}>
                  {r.rank === 1 && <TrophyIcon className={styles.trophy} />}
                  <div className={`${styles.podiumAvatar} ${styles["medal" + r.rank]}`}>{r.initials}</div>
                  <div className={styles.podiumName}>{r.name}</div>
                  <StatLine r={r} />
                </div>
              ))}
            </div>
          )}

          {rest.length > 0 && (
            <div className={styles.restList}>
              {rest.map((r) => (
                <div className={styles.restRow} key={r.rank}>
                  <span className={styles.restRank}>{r.rank}</span>
                  <span className={styles.restName}>{r.name}</span>
                  <StatLine r={r} />
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
