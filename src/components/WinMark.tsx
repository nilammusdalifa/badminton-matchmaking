import styles from "./WinMark.module.css";

/** Marks the winning team without relying on colour: a ✓ for sight, "Winner:" for a screen reader. */
export function WinMark() {
  return (
    <>
      <span className={styles.mark} aria-hidden="true">
        ✓
      </span>
      <span className="srOnly">Winner: </span>
    </>
  );
}
