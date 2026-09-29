import { PlayerAddForm } from "../PlayerAddForm";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./SetupWizardModal.module.css";

type SetupProps = SessionStore["setup"];

export function SetupWizardModal({
  open,
  step,
  stepLabel,
  progressWidth,
  name,
  schedule,
  onNameChange,
  onScheduleChange,
  reviewName,
  reviewSchedule,
  reviewConsequence,
  reviewHasHistory,
  canBack,
  isLast,
  close,
  next,
  back,
  finish,
  playersCount,
  courtsCount,
  newPlayerName,
  newPlayerLevel,
  onNewPlayerNameChange,
  setNewPlayerLevel,
  onAddPlayer,
  onAddPlayers,
  onAddCourt,
  onRemoveCourt,
  resultMode,
  onSetResultMode,
}: SetupProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <div className={styles.head}>
          <div className={styles.headTitle}>New Session · Step {stepLabel}/4</div>
          <button className={styles.closeBtn} onClick={close} aria-label="Close setup">
            ×
          </button>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: progressWidth }} />
        </div>

        {step === 0 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>Session basics</div>
            <div className={styles.stepHint}>Set up tonight's session — SmashMatch suggests fair doubles matches as players arrive.</div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Session name</span>
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={onNameChange}
                placeholder="e.g. Wednesday Night Badminton"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Schedule</span>
              <input
                className={styles.input}
                type="text"
                value={schedule}
                onChange={onScheduleChange}
                placeholder="e.g. Wed · 19:00–22:00"
              />
              <span className={styles.fieldHint}>
                Optional. Add start and end times (e.g. 19:00–22:00) to get a heads-up 30 minutes before the end.
              </span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>Players ({playersCount} on the roster)</div>
            <div className={styles.stepHint}>They start as not checked in — check them in on the Session tab when they arrive</div>
            <PlayerAddForm
              newPlayerName={newPlayerName}
              newPlayerLevel={newPlayerLevel}
              onNewPlayerNameChange={onNewPlayerNameChange}
              setNewPlayerLevel={setNewPlayerLevel}
              onAddPlayer={onAddPlayer}
              onAddPlayers={onAddPlayers}
              addLabel="Add Player"
            />
          </div>
        )}

        {step === 2 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>Courts &amp; scoring</div>
            <div className={styles.stepHint}>You can add or remove courts later in Manage.</div>
            <div className={styles.courtsRow}>
              <span>
                {courtsCount} {courtsCount === 1 ? "court" : "courts"}
              </span>
              <div className={styles.formRow}>
                <button className={styles.roundBtn} onClick={onRemoveCourt} aria-label="Remove a court">
                  –
                </button>
                <button className={styles.roundBtn} onClick={onAddCourt} aria-label="Add a court">
                  +
                </button>
              </div>
            </div>
            {courtsCount === 0 && <div className={styles.warnNote}>Add at least one court to start suggesting matches.</div>}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>How to record results</span>
              <div className={styles.modeGroup}>
                <button
                  type="button"
                  className={`${styles.modeOption} ${resultMode === "score" ? styles.modeActive : ""}`}
                  onClick={() => onSetResultMode("score")}
                >
                  Final Score
                </button>
                <button
                  type="button"
                  className={`${styles.modeOption} ${resultMode === "winner" ? styles.modeActive : ""}`}
                  onClick={() => onSetResultMode("winner")}
                >
                  Winner Only
                </button>
                <button
                  type="button"
                  className={`${styles.modeOption} ${resultMode === "none" ? styles.modeActive : ""}`}
                  onClick={() => onSetResultMode("none")}
                >
                  No Score
                </button>
              </div>
            </div>
            {resultMode === "score" && <div className={styles.rulesNote}>21 points to win · win by 2 · cap 30</div>}
            {resultMode === "winner" && <div className={styles.rulesNote}>One tap records which team won — no points tracked</div>}
            {resultMode === "none" && <div className={styles.rulesNote}>Just tracks who played, not who won</div>}
          </div>
        )}

        {step === 3 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>Review</div>
            <div className={styles.review}>
              <div>
                {reviewSchedule ? `${reviewName} · ${reviewSchedule}` : reviewName}
              </div>
              <div>
                {playersCount} {playersCount === 1 ? "player" : "players"} · {courtsCount} {courtsCount === 1 ? "court" : "courts"}
              </div>
              <div>
                {resultMode === "score" ? "21 points to win, win by 2" : resultMode === "winner" ? "Winner only — no points tracked" : "No score — just tracks who played"}
              </div>
            </div>
            {courtsCount === 0 && <div className={styles.warnNote}>Add at least one court to start suggesting matches.</div>}
            {reviewHasHistory && <div className={styles.consequence}>{reviewConsequence}</div>}
          </div>
        )}

        <div className={styles.footer}>
          {canBack && (
            <button className={styles.backBtn} onClick={back}>
              Back
            </button>
          )}
          {isLast ? (
            <button className={styles.nextBtn} onClick={finish}>
              Start Session
            </button>
          ) : (
            <button className={styles.nextBtn} onClick={next}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
