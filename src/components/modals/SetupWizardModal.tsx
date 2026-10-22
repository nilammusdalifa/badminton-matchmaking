import { PlayerAddForm } from "../PlayerAddForm";
import { copy } from "../../lib/copy";
import { formatSchedule } from "../../lib/locale";
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
  rosterNames,
  onAddCourt,
  onRemoveCourt,
  courtHours,
  onSetCourtClosesAt,
  resultMode,
  onSetResultMode,
}: SetupProps) {
  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog}>
        <div className={styles.head}>
          <div className={styles.headTitle}>{copy.setup.title(stepLabel)}</div>
          <button className={styles.closeBtn} onClick={close} aria-label={copy.setup.close}>
            ×
          </button>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: progressWidth }} />
        </div>

        {step === 0 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>{copy.setup.basics}</div>
            <div className={styles.stepHint}>{copy.setup.basicsHint}</div>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.setup.sessionName}</span>
              <input
                className={styles.input}
                type="text"
                value={name}
                onChange={onNameChange}
                placeholder={copy.setup.namePlaceholder}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>{copy.setup.schedule}</span>
              <input
                className={styles.input}
                type="text"
                value={schedule}
                onChange={onScheduleChange}
                placeholder={copy.setup.schedulePlaceholder}
              />
              <span className={styles.fieldHint}>{copy.setup.scheduleHint}</span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>{copy.setup.playersStep(playersCount)}</div>
            <div className={styles.stepHint}>{copy.setup.checkInHint}</div>
            <PlayerAddForm
              newPlayerName={newPlayerName}
              newPlayerLevel={newPlayerLevel}
              onNewPlayerNameChange={onNewPlayerNameChange}
              setNewPlayerLevel={setNewPlayerLevel}
              onAddPlayer={onAddPlayer}
              onAddPlayers={onAddPlayers}
              addLabel={copy.manage.addPlayer}
            />
            {rosterNames.length > 0 && (
              <div className={styles.rosterChips} aria-label={copy.setup.playersAdded}>
                {rosterNames.map((p, i) => (
                  <span className={styles.rosterChip} key={i}>
                    {p.name} · {p.level}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>{copy.setup.courtsAndScoring}</div>
            <div className={styles.stepHint}>{copy.setup.courtsHint}</div>
            <div className={styles.courtsRow}>
              <span>{copy.setup.courtsLabel(courtsCount)}</span>
              <div className={styles.formRow}>
                <button className={styles.roundBtn} onClick={onRemoveCourt} aria-label={copy.manage.removeCourt}>
                  –
                </button>
                <button className={styles.roundBtn} onClick={onAddCourt} aria-label={copy.manage.addCourt}>
                  +
                </button>
              </div>
            </div>
            {courtsCount === 0 && <div className={styles.warnNote}>{copy.setup.addCourtWarning}</div>}
            {courtHours.length > 0 && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>{copy.setup.closingTime}</span>
                {courtHours.map((c) => (
                  <label className={styles.hoursRow} key={c.id}>
                    <span>{copy.setup.courtCloses(c.name)}</span>
                    <input className={styles.timeInput} type="time" value={c.closesAt} onChange={(e) => onSetCourtClosesAt(c.id, e.target.value)} />
                  </label>
                ))}
                <div className={styles.rulesNote}>{copy.setup.closingRule}</div>
              </div>
            )}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>{copy.setup.howToRecord}</span>
              <div className={styles.modeGroup}>
                <button
                  type="button"
                  className={`${styles.modeOption} ${resultMode === "score" ? styles.modeActive : ""}`}
                  onClick={() => onSetResultMode("score")}
                >
                  {copy.setup.modeScore}
                </button>
                <button
                  type="button"
                  className={`${styles.modeOption} ${resultMode === "winner" ? styles.modeActive : ""}`}
                  onClick={() => onSetResultMode("winner")}
                >
                  {copy.setup.modeWinner}
                </button>
                <button
                  type="button"
                  className={`${styles.modeOption} ${resultMode === "none" ? styles.modeActive : ""}`}
                  onClick={() => onSetResultMode("none")}
                >
                  {copy.setup.modeNone}
                </button>
              </div>
            </div>
            {resultMode === "score" && <div className={styles.rulesNote}>{copy.setup.ruleScore}</div>}
            {resultMode === "winner" && <div className={styles.rulesNote}>{copy.setup.ruleWinner}</div>}
            {resultMode === "none" && <div className={styles.rulesNote}>{copy.setup.ruleNone}</div>}
          </div>
        )}

        {step === 3 && (
          <div className={styles.step}>
            <div className={styles.stepTitle}>{copy.setup.review}</div>
            <div className={styles.review}>
              <div>{copy.header.line([reviewName, formatSchedule(reviewSchedule)])}</div>
              <div>{copy.session.summary(playersCount, courtsCount)}</div>
              {courtHours.some((c) => c.closesAt) && (
                <div>{courtHours.map((c) => (c.closesAt ? copy.setup.reviewUntil(c.name, c.closesAt) : copy.setup.reviewNoClosing(c.name))).join(" · ")}</div>
              )}
              <div>{resultMode === "score" ? copy.setup.reviewScore : resultMode === "winner" ? copy.setup.reviewWinner : copy.setup.reviewNone}</div>
            </div>
            {courtsCount === 0 && <div className={styles.warnNote}>{copy.setup.addCourtWarning}</div>}
            {reviewHasHistory && <div className={styles.consequence}>{reviewConsequence}</div>}
          </div>
        )}

        <div className={styles.footer}>
          {canBack && (
            <button className={styles.backBtn} onClick={back}>
              {copy.setup.back}
            </button>
          )}
          {isLast ? (
            <button className={styles.nextBtn} onClick={finish}>
              {copy.setup.start}
            </button>
          ) : (
            <button className={styles.nextBtn} onClick={next}>
              {copy.setup.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
