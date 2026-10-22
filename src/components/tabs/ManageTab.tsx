import { useState } from "react";
import { LevelPicker } from "../LevelPicker";
import { PlayerAddForm } from "../PlayerAddForm";
import { copy } from "../../lib/copy";
import type { SkillLevel } from "../../types";
import type { SessionStore } from "../../hooks/useSessionStore";
import styles from "./ManageTab.module.css";

type ManageTabProps = SessionStore["manage"];

export function ManageTab({
  courtsCount,
  newPlayerName,
  newPlayerLevel,
  onNewPlayerNameChange,
  setNewPlayerLevel,
  onAddPlayer,
  onAddPlayers,
  managePlayersVM,
  playersCount,
  players,
  requestA,
  requestB,
  onRequestAChange,
  onRequestBChange,
  onAddPartnerRequest,
  hasRequestedPairs,
  requestedPairsVM,
  onAddCourt,
  onRemoveCourt,
  planAhead,
  onTogglePlanAhead,
  hardGames,
  onToggleHardGames,
  courtHours,
  onSetCourtClosesAt,
  onOpenSetup,
  onEndSession,
  onResetSession,
  resultMode,
  isOwner,
  shareEnabled,
  shareUrl,
  sessionPin,
  onCopyShareLink,
}: ManageTabProps) {
  const rulesLabel =
    resultMode === "score" ? copy.manage.rulesScore : resultMode === "winner" ? copy.manage.rulesWinner : copy.manage.rulesNone;

  // One roster row is open for editing at a time; its draft lives here so
  // typing doesn't touch the session until Save.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftLevel, setDraftLevel] = useState<SkillLevel>("B");
  const [draftHost, setDraftHost] = useState(false);
  const [draftCounted, setDraftCounted] = useState(true);

  return (
    <>
      <div className={styles.section}>
        <h1 className={styles.title}>{copy.manage.title}</h1>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>{copy.manage.walkIn}</div>
        <div className={styles.panelHint}>{copy.manage.walkInHint}</div>
        <PlayerAddForm
          newPlayerName={newPlayerName}
          newPlayerLevel={newPlayerLevel}
          onNewPlayerNameChange={onNewPlayerNameChange}
          setNewPlayerLevel={setNewPlayerLevel}
          onAddPlayer={onAddPlayer}
          onAddPlayers={onAddPlayers}
          addLabel={copy.manage.addPlayer}
        />
      </div>

      {isOwner && (
        <div className={styles.courtsPanel}>
          <div className={styles.courtsHead}>
            <div>
              <div className={styles.panelTitle}>{copy.manage.courts}</div>
              <div className={styles.courtsSub}>
                {copy.manage.courtsSub(courtsCount, rulesLabel)}
              </div>
            </div>
            <div className={styles.courtsBtns}>
              <button className={styles.roundBtn} onClick={onRemoveCourt} aria-label={copy.manage.removeCourt}>
                –
              </button>
              <button className={styles.roundBtn} onClick={onAddCourt} aria-label={copy.manage.addCourt}>
                +
              </button>
            </div>
          </div>
          <label className={styles.hostToggle}>
            <input type="checkbox" checked={planAhead} onChange={onTogglePlanAhead} />
            <span>
              <span className={styles.hostToggleTitle}>{copy.manage.lockPlanned}</span>
              <span className={styles.hostToggleHint}>{copy.manage.lockPlannedHint}</span>
            </span>
          </label>
          <label className={styles.hostToggle}>
            <input type="checkbox" checked={hardGames} onChange={onToggleHardGames} />
            <span>
              <span className={styles.hostToggleTitle}>{copy.manage.hardMatches}</span>
              <span className={styles.hostToggleHint}>{copy.manage.hardHint}</span>
            </span>
          </label>
          {courtHours.length > 0 && (
            <>
              <div className={styles.panelHint}>{copy.manage.closingHint}</div>
              {courtHours.map((c) => (
                <label className={styles.courtHoursRow} key={c.id}>
                  <span>{copy.manage.courtCloses(c.name)}</span>
                  <input
                    className={styles.timeInput}
                    type="time"
                    value={c.closesAt}
                    onChange={(e) => onSetCourtClosesAt(c.id, e.target.value)}
                  />
                </label>
              ))}
            </>
        )}
      </div>
      )}

      {isOwner && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{copy.manage.session}</div>
          <div className={styles.dangerZone}>
            <button className={styles.zoneBtn} onClick={onOpenSetup}>
              {copy.manage.newSession}
            </button>
            <button className={`${styles.zoneBtn} ${styles.danger}`} onClick={onEndSession}>
              {copy.manage.endAndSee}
            </button>
            <button className={`${styles.zoneBtn} ${styles.dangerSolid}`} onClick={onResetSession}>
              {copy.manage.eraseAndRestart}
            </button>
          </div>
        </div>
      )}

      {shareEnabled && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>{copy.manage.liveSharing}</div>
          <div className={styles.panelHint}>
            {isOwner ? copy.manage.shareWithPin : copy.manage.shareNoPin}
          </div>
          <div className={styles.shareRow}>
            <button className={styles.addBtn} onClick={onCopyShareLink}>
              {copy.manage.copyLink}
            </button>
            {isOwner && <div className={styles.pinBadge}>{copy.manage.pin(sessionPin)}</div>}
          </div>
          {isOwner && <div className={styles.pinHint}>{copy.manage.pinHint}</div>}
          <div className={styles.shareUrl}>{shareUrl}</div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelTitle}>{copy.manage.partnerRequests}</div>
        <div className={styles.panelHint}>{copy.manage.partnerHint}</div>
        <div className={styles.formRow}>
          <select className={styles.select} value={requestA} onChange={onRequestAChange}>
            <option value="">{copy.manage.playerA}</option>
            {players.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className={styles.select} value={requestB} onChange={onRequestBChange}>
            <option value="">{copy.manage.playerB}</option>
            {players.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className={styles.addBtn} onClick={onAddPartnerRequest}>
            {copy.manage.pairThem}
          </button>
        </div>
        {hasRequestedPairs && (
          <div className={styles.requestedList}>
            {requestedPairsVM.map((rp, i) => (
              <div className={styles.requestedRow} key={i}>
                <span>{rp.label}</span>
                <button className={styles.removeBtn} onClick={rp.onRemove}>
                  {copy.common.remove}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.rosterTitle}>{copy.manage.roster(playersCount)}</div>
        <div className={styles.rosterList}>
          {managePlayersVM.map((p) => {
            const editing = editingId === p.id;
            return (
              <div className={styles.rosterRow} key={p.id}>
                <div className={styles.rosterMain}>
                  <div className={styles.rosterInfo}>
                    <div className={styles.rosterName}>
                      {p.name} <span className={styles.rosterLevel}>{copy.manage.tierWord(p.level)}</span>
                    </div>
                    <div className={`${styles.rosterStatus} ${styles[p.statusTone]}`}>{p.statusLabel} · {p.gamesLabel}</div>
                  </div>
                  <div className={styles.rosterActions}>
                    {p.actions.map((a) => (
                      <button key={a.label} className={styles.pillBtn} onClick={a.onClick}>
                        {a.label}
                      </button>
                    ))}
                    {isOwner && (
                      <button
                        className={styles.pillBtn}
                        aria-expanded={editing}
                        onClick={() => {
                          if (editing) {
                            setEditingId(null);
                            return;
                          }
                          setEditingId(p.id);
                          setDraftName(p.name);
                          setDraftLevel(p.level);
                          setDraftHost(p.isHost);
                          setDraftCounted(p.inRankings);
                        }}
                      >
                        {copy.manage.edit}
                      </button>
                    )}
                  </div>
                </div>
                {editing && isOwner && (
                  <form
                    className={styles.rosterEdit}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!draftName.trim()) return;
                      if (p.onSave(draftName, draftLevel, draftHost, draftCounted)) setEditingId(null);
                    }}
                  >
                    <input
                      className={styles.editInput}
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      aria-label={copy.manage.nameFor(p.name)}
                      autoCapitalize="words"
                      autoComplete="off"
                      enterKeyHint="done"
                    />
                    <LevelPicker value={draftLevel} onChange={setDraftLevel} />
                    <label className={styles.hostToggle}>
                      <input
                        type="checkbox"
                        checked={draftHost}
                        disabled={p.hostLocked}
                        onChange={(e) => {
                          setDraftHost(e.target.checked);
                          // A host usually isn't competing; the box below can switch it back on.
                          if (e.target.checked) setDraftCounted(false);
                        }}
                      />
                      <span>
                        <span className={styles.hostToggleTitle}>{copy.manage.hostTitle}</span>
                        <span className={styles.hostToggleHint}>
                          {p.hostLocked ? copy.manage.hostLocked : copy.manage.hostHint}
                        </span>
                      </span>
                    </label>
                    <label className={styles.hostToggle}>
                      <input type="checkbox" checked={draftCounted} onChange={(e) => setDraftCounted(e.target.checked)} />
                      <span>
                        <span className={styles.hostToggleTitle}>{copy.manage.countInRankings}</span>
                        <span className={styles.hostToggleHint}>{copy.manage.countHint}</span>
                      </span>
                    </label>
                    <div className={styles.editActions}>
                      <button type="submit" className={styles.addBtn} disabled={!draftName.trim()}>
                        {copy.manage.save}
                      </button>
                      <button type="button" className={styles.pillBtn} onClick={() => setEditingId(null)}>
                        {copy.manage.cancel}
                      </button>
                      {p.onRemove && (
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => {
                            p.onRemove?.();
                            setEditingId(null);
                          }}
                        >
                          {copy.manage.removePlayer(p.name)}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
