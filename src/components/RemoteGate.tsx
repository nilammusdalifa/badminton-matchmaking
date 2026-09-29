import { useState } from "react";
import type { SessionStore } from "../hooks/useSessionStore";
import styles from "./RemoteGate.module.css";

type RemoteProps = SessionStore["remote"];

/** Everything shown before the live session itself, for someone who opened
 * a shared `?view=` link: choosing Player vs. Umpire, entering the Umpire
 * PIN, and the brief "connecting" window while the first Firebase snapshot
 * arrives. Returns null once there's nothing left to gate on. */
export function RemoteGate({ role, roleStep, pinError, checking, connected, missing, chooseRole, submitPin, back, firebaseConfigured }: RemoteProps) {
  const [pin, setPin] = useState("");

  if (!firebaseConfigured) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>Live sharing isn't set up</div>
          <div className={styles.body}>This link needs the organizer's app to have live sharing configured. Ask them to check it and resend the link.</div>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>Join live session</div>
          <div className={styles.body}>Someone shared a live badminton session with you. Choose how you're joining.</div>
          {roleStep === "choose" ? (
            <div className={styles.buttons}>
              <button className={styles.primaryBtn} onClick={() => chooseRole("player")}>
                Player (just watching)
              </button>
              <button className={styles.secondaryBtn} onClick={() => chooseRole("umpire")}>
                Umpire (I'm scoring)
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <input
                className={styles.pinInput}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder="4-digit PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
              {pinError && <div className={styles.error}>{pinError}</div>}
              <button className={styles.primaryBtn} disabled={pin.length !== 4 || checking} onClick={() => submitPin(pin)}>
                {checking ? "Checking…" : "Continue as Umpire"}
              </button>
              <button className={styles.backBtn} onClick={back}>
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.body}>Connecting to live session…</div>
        </div>
      </div>
    );
  }

  if (missing) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>Session not found</div>
          <div className={styles.body}>This live link doesn't point at a session anymore — ask the organizer for a fresh one.</div>
        </div>
      </div>
    );
  }

  return null;
}
