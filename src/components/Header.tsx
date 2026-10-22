import { AppIcon } from "./AppIcon";
import { localizeSchedule } from "../lib/locale";
import styles from "./Header.module.css";

interface HeaderProps {
  sessionName: string;
  sessionSchedule: string;
  matchesCompleted: number;
  matchesTotal: number | null;
  progressWidth: string;
  needsSetup: boolean;
  onOpenSetup: () => void;
  /** View-only: no "New Session" button. */
  readOnly?: boolean;
}

export function Header({ sessionName, sessionSchedule, matchesCompleted, matchesTotal, progressWidth, needsSetup, onOpenSetup, readOnly }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <div className={styles.badge}>
          <AppIcon size={22} />
        </div>
        <div className={styles.titles}>
          <div className={styles.name}>SmashMatch</div>
          <div className={styles.schedule}>
            {needsSetup ? "No session set up yet" : sessionSchedule ? `${sessionName} · ${localizeSchedule(sessionSchedule)}` : sessionName}
          </div>
        </div>
        {needsSetup && !readOnly && (
          <button className={styles.setupBtn} onClick={onOpenSetup}>
            + New Session
          </button>
        )}
      </div>
      {!needsSetup && (
        <>
          <div className={styles.meta}>
            <span>
              {matchesTotal !== null
                ? `${matchesCompleted}/${matchesTotal} matches`
                : `${matchesCompleted} ${matchesCompleted === 1 ? "match" : "matches"}`}
            </span>
          </div>
          {matchesTotal !== null && (
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: progressWidth }} />
            </div>
          )}
        </>
      )}
    </header>
  );
}
