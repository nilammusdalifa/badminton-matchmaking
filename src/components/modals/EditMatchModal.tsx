import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./EditMatchModal.module.css";

type EditMatchProps = SessionStore["editMatch"];

export function EditMatchModal({
  open,
  courtLabel,
  editablePlayers,
  t1A,
  t1B,
  t2A,
  t2B,
  onT1AChange,
  onT1BChange,
  onT2AChange,
  onT2BChange,
  onStart,
  onAutoFill,
  close,
}: EditMatchProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <div className={styles.head}>
          <div className={styles.headTitle}>Edit Match — Court {courtLabel}</div>
          <button className={styles.closeBtn} onClick={close}>
            ×
          </button>
        </div>
        <div className={styles.hintRow}>
          <div className={styles.hint}>Swap in anyone who's waiting — teams are rebalanced when you start.</div>
          <button className={styles.autoFillBtn} onClick={onAutoFill}>
            Auto-fill
          </button>
        </div>
        <div className={styles.grid}>
          <div className={styles.teamCol}>
            <span className={`${styles.teamLabel} ${styles.a}`}>Team A</span>
            <select className={styles.select} value={t1A} onChange={onT1AChange}>
              <option value="">Choose player…</option>
              {editablePlayers.map((ep) => (
                <option value={ep.id} key={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
            <select className={styles.select} value={t1B} onChange={onT1BChange}>
              <option value="">Choose player…</option>
              {editablePlayers.map((ep) => (
                <option value={ep.id} key={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.teamCol}>
            <span className={`${styles.teamLabel} ${styles.b}`}>Team B</span>
            <select className={styles.select} value={t2A} onChange={onT2AChange}>
              <option value="">Choose player…</option>
              {editablePlayers.map((ep) => (
                <option value={ep.id} key={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
            <select className={styles.select} value={t2B} onChange={onT2BChange}>
              <option value="">Choose player…</option>
              {editablePlayers.map((ep) => (
                <option value={ep.id} key={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={close}>
            Cancel
          </button>
          <button className={styles.startBtn} onClick={onStart}>
            Start This Match
          </button>
        </div>
      </div>
    </div>
  );
}
