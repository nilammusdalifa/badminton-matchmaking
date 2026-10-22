import { AppIcon } from "./AppIcon";
import { copy } from "../lib/copy";
import { formatSchedule } from "../lib/locale";
import styles from "./Header.module.css";

interface HeaderProps {
  sessionName: string;
  sessionSchedule: string;
  matchesCompleted: number;
  matchesTotal: number | null;
  progressWidth: string;
  needsSetup: boolean;
  onOpenSetup: () => void;
  /** View-only: no "New session" button. */
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
            {needsSetup
              ? copy.header.noSession
              : copy.header.line([sessionName, formatSchedule(sessionSchedule), copy.header.matches(matchesCompleted, matchesTotal)])}
          </div>
        </div>
        {needsSetup && !readOnly && (
          <button className={styles.setupBtn} onClick={onOpenSetup}>
            {copy.header.newSession}
          </button>
        )}
      </div>
      {!needsSetup && matchesTotal !== null && (
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: progressWidth }} />
        </div>
      )}
    </header>
  );
}
