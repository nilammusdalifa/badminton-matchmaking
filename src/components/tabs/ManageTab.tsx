import { useState } from "react";
import { LevelPicker } from "../LevelPicker";
import { PlayerAddForm } from "../PlayerAddForm";
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
    resultMode === "score" ? "21 points, win by 2, cap 30" : resultMode === "winner" ? "winner only" : "no scoring";

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
        <h1 className={styles.title}>Manage</h1>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Add a Walk-in Player</div>
        <div className={styles.panelHint}>Added straight to Waiting.</div>
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

      {isOwner && (
        <div className={styles.courtsPanel}>
          <div className={styles.courtsHead}>
            <div>
              <div className={styles.panelTitle}>Courts</div>
              <div className={styles.courtsSub}>
                {courtsCount} {courtsCount === 1 ? "court" : "courts"} · {rulesLabel}
              </div>
            </div>
            <div className={styles.courtsBtns}>
              <button className={styles.roundBtn} onClick={onRemoveCourt} aria-label="Remove a court">
                –
              </button>
              <button className={styles.roundBtn} onClick={onAddCourt} aria-label="Add a court">
                +
              </button>
            </div>
          </div>
          <label className={styles.hostToggle}>
            <input type="checkbox" checked={planAhead} onChange={onTogglePlanAhead} />
            <span>
              <span className={styles.hostToggleTitle}>Plan 2 matches ahead</span>
              <span className={styles.hostToggleHint}>
                Shows Up next and Then, and starts them exactly as shown. Off: only a likely preview, as before.
              </span>
            </span>
          </label>
          {courtHours.length > 0 && (
            <>
              <div className={styles.panelHint}>Set a closing time to get a reminder to pause the court.</div>
              {courtHours.map((c) => (
                <label className={styles.courtHoursRow} key={c.id}>
                  <span>{c.name} closes at</span>
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
          <div className={styles.panelTitle}>Session</div>
          <div className={styles.dangerZone}>
            <button className={styles.zoneBtn} onClick={onOpenSetup}>
              + New Session
            </button>
            <button className={`${styles.zoneBtn} ${styles.danger}`} onClick={onEndSession}>
              End &amp; See Results
            </button>
            <button className={`${styles.zoneBtn} ${styles.dangerSolid}`} onClick={onResetSession}>
              Erase Results &amp; Restart
            </button>
          </div>
        </div>
      )}

      {shareEnabled && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Live Sharing</div>
          <div className={styles.panelHint}>
            {isOwner
              ? "Share the link to let people watch live. The PIN lets someone score."
              : "Share the link to let people watch live."}
          </div>
          <div className={styles.shareRow}>
            <button className={styles.addBtn} onClick={onCopyShareLink}>
              Copy Live Link
            </button>
            {isOwner && <div className={styles.pinBadge}>PIN: {sessionPin}</div>}
          </div>
          {isOwner && <div className={styles.pinHint}>Only share the PIN with scorers.</div>}
          <div className={styles.shareUrl}>{shareUrl}</div>
        </div>
      )}

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Partner Requests</div>
        <div className={styles.panelHint}>Put two players on the same team next match.</div>
        <div className={styles.formRow}>
          <select className={styles.select} value={requestA} onChange={onRequestAChange}>
            <option value="">Player A</option>
            {players.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select className={styles.select} value={requestB} onChange={onRequestBChange}>
            <option value="">Player B</option>
            {players.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className={styles.addBtn} onClick={onAddPartnerRequest}>
            Pair Them
          </button>
        </div>
        {hasRequestedPairs && (
          <div className={styles.requestedList}>
            {requestedPairsVM.map((rp, i) => (
              <div className={styles.requestedRow} key={i}>
                <span>{rp.label}</span>
                <button className={styles.removeBtn} onClick={rp.onRemove}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.panel}>
        <div className={styles.rosterTitle}>Roster ({playersCount})</div>
        <div className={styles.rosterList}>
          {managePlayersVM.map((p) => {
            const editing = editingId === p.id;
            return (
              <div className={styles.rosterRow} key={p.id}>
                <div className={styles.rosterMain}>
                  <div className={styles.rosterInfo}>
                    <div className={styles.rosterName}>
                      {p.name} <span className={styles.rosterLevel}>Tier {p.level}</span>
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
                        Edit
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
                      aria-label={`Name for ${p.name}`}
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
                        <span className={styles.hostToggleTitle}>Host · plays later</span>
                        <span className={styles.hostToggleHint}>
                          {p.hostLocked ? "Round 1 has started, so this only applies to the next session." : "Sits out the first round, then joins the rotation normally."}
                        </span>
                      </span>
                    </label>
                    <label className={styles.hostToggle}>
                      <input type="checkbox" checked={draftCounted} onChange={(e) => setDraftCounted(e.target.checked)} />
                      <span>
                        <span className={styles.hostToggleTitle}>Count in rankings</span>
                        <span className={styles.hostToggleHint}>Off: still plays, but is listed under &quot;Not ranked&quot; and doesn&apos;t change anyone else&apos;s record.</span>
                      </span>
                    </label>
                    <div className={styles.editActions}>
                      <button type="submit" className={styles.addBtn} disabled={!draftName.trim()}>
                        Save
                      </button>
                      <button type="button" className={styles.pillBtn} onClick={() => setEditingId(null)}>
                        Cancel
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
                          Remove {p.name}
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
