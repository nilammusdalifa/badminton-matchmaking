import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ConfirmModal.module.css";

type ConfirmProps = SessionStore["confirm"];

export function ConfirmModal({ open, title, body, actionLabel, onConfirm, close }: ConfirmProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{body}</div>
        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={close}>
            Go Back
          </button>
          <button className={styles.confirmBtn} onClick={onConfirm}>
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
