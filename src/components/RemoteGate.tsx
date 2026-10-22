import { useState } from "react";
import { copy } from "../lib/copy";
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
          <div className={styles.title}>{copy.gate.notSetUpTitle}</div>
          <div className={styles.body}>{copy.gate.notSetUpBody}</div>
        </div>
      </div>
    );
  }

  if (!role) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>{copy.gate.joinTitle}</div>
          <div className={styles.body}>{copy.gate.joinBody}</div>
          {roleStep === "choose" ? (
            <div className={styles.buttons}>
              <button className={styles.primaryBtn} onClick={() => chooseRole("player")}>
                <span className={styles.btnTitle}>{copy.gate.watch}</span>
                <span className={styles.btnSub}>{copy.gate.watchSub}</span>
              </button>
              <button className={styles.secondaryBtn} onClick={() => chooseRole("umpire")}>
                <span className={styles.btnTitle}>{copy.gate.umpire}</span>
                <span className={styles.btnSub}>{copy.gate.umpireSub}</span>
              </button>
            </div>
          ) : (
            <div className={styles.buttons}>
              <input
                className={styles.pinInput}
                type="text"
                inputMode="numeric"
                maxLength={4}
                placeholder={copy.gate.pinPlaceholder}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
              {pinError && <div className={styles.error}>{pinError}</div>}
              <button className={styles.primaryBtn} disabled={pin.length !== 4 || checking} onClick={() => submitPin(pin)}>
                {checking ? copy.gate.checking : copy.gate.continueAsUmpire}
              </button>
              <button className={styles.backBtn} onClick={back}>
                {copy.gate.back}
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
          <div className={styles.body}>{copy.gate.connecting}</div>
        </div>
      </div>
    );
  }

  if (missing) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.title}>{copy.gate.notFoundTitle}</div>
          <div className={styles.body}>{copy.gate.notFoundBody}</div>
        </div>
      </div>
    );
  }

  return null;
}
