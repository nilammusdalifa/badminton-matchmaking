import { PlayerAddForm } from "../PlayerAddForm";
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
  onOpenSetup,
  onEndSession,
  onResetSession,
  resultMode,
  shareEnabled,
  shareUrl,
  sessionPin,
  onCopyShareLink,
}: ManageTabProps) {
  const rulesLabel =
    resultMode === "score" ? "21 points, win by 2, cap 30" : resultMode === "winner" ? "winner only" : "no scoring";
  return (
    <>
      <div className={styles.section}>
        <h1 className={styles.title}>Manage</h1>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Add a Walk-in Player</div>
        <div className={styles.panelHint}>They're here now — added straight to Ready</div>
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

      <div className={styles.panel}>
        <div className={styles.rosterTitle}>Roster ({playersCount})</div>
        <div className={styles.rosterList}>
          {managePlayersVM.map((p) => (
            <div className={styles.rosterRow} key={p.id}>
              <div>
                <div className={styles.rosterName}>
                  {p.name} <span className={styles.rosterLevel}>Tier {p.level}</span>
                </div>
                <div className={`${styles.rosterStatus} ${styles[p.statusTone]}`}>{p.statusLabel}</div>
              </div>
              <div className={styles.rosterActions}>
                {p.actions.map((a) => (
                  <button key={a.label} className={styles.pillBtn} onClick={a.onClick}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelTitle}>Partner Requests</div>
        <div className={styles.panelHint}>Put two players on the same team, once — filled in by whoever's most owed a game</div>
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
            Request
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

      {shareEnabled && (
        <div className={styles.panel}>
          <div className={styles.panelTitle}>Live Sharing</div>
          <div className={styles.panelHint}>
            Anyone with the link can watch this session live. They can also score matches by entering the Umpire PIN below.
          </div>
          <div className={styles.shareRow}>
            <button className={styles.addBtn} onClick={onCopyShareLink}>
              Copy Live Link
            </button>
            <div className={styles.pinBadge} title="Umpire PIN — share only with someone you want scoring matches">
              PIN: {sessionPin}
            </div>
          </div>
          <div className={styles.shareUrl}>{shareUrl}</div>
        </div>
      )}

      <div className={styles.courtsPanel}>
        <div>
          <div className={styles.panelTitle}>Courts</div>
          <div className={styles.courtsSub}>
            {courtsCount} {courtsCount === 1 ? "court" : "courts"} · {rulesLabel}
          </div>
        </div>
        <div className={styles.courtsBtns}>
          <button className={styles.roundBtn} onClick={onRemoveCourt}>
            –
          </button>
          <button className={styles.roundBtn} onClick={onAddCourt}>
            +
          </button>
        </div>
      </div>

      <div className={styles.dangerZone}>
        <button className={styles.zoneBtn} onClick={onOpenSetup}>
          + Start a New Session
        </button>
        <button className={`${styles.zoneBtn} ${styles.danger}`} onClick={onEndSession}>
          End Session
        </button>
        <button className={`${styles.zoneBtn} ${styles.dangerSolid}`} onClick={onResetSession}>
          Reset This Session
        </button>
      </div>
    </>
  );
}
