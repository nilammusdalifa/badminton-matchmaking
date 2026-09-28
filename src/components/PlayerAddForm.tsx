import { useState } from "react";
import type { SkillLevel } from "../types";
import { LevelPicker } from "./LevelPicker";
import styles from "./PlayerAddForm.module.css";

interface PlayerAddFormProps {
  newPlayerName: string;
  newPlayerLevel: SkillLevel;
  onNewPlayerNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  setNewPlayerLevel: (level: SkillLevel) => void;
  onAddPlayer: () => void;
  onAddPlayers: (names: string[]) => void;
  addLabel?: string;
}

/** One-by-one add (existing flow) plus a "paste a list" mode for onboarding
 * a whole roster at once — all pasted names land at the currently-selected
 * tier, no per-line parsing. */
export function PlayerAddForm({
  newPlayerName,
  newPlayerLevel,
  onNewPlayerNameChange,
  setNewPlayerLevel,
  onAddPlayer,
  onAddPlayers,
  addLabel = "Add Player",
}: PlayerAddFormProps) {
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const submitBulk = () => {
    const names = bulkText.split("\n");
    onAddPlayers(names);
    setBulkText("");
    setBulkMode(false);
  };

  if (bulkMode) {
    return (
      <div className={styles.wrap}>
        <textarea
          className={styles.textarea}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={"One name per line, e.g.\nAndi\nBudi\nCitra"}
        />
        <div className={styles.formRow}>
          <span>Tier:</span>
          <LevelPicker value={newPlayerLevel} onChange={setNewPlayerLevel} />
          <button className={styles.addBtn} onClick={submitBulk}>
            Add All
          </button>
        </div>
        <button className={styles.toggleBtn} onClick={() => setBulkMode(false)}>
          Add one by one instead
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.formRow}>
        <input
          type="text"
          className={styles.nameInput}
          value={newPlayerName}
          onChange={onNewPlayerNameChange}
          placeholder="Player name"
        />
        <LevelPicker value={newPlayerLevel} onChange={setNewPlayerLevel} />
        <button className={styles.addBtn} onClick={onAddPlayer}>
          {addLabel}
        </button>
      </div>
      <button className={styles.toggleBtn} onClick={() => setBulkMode(true)}>
        Paste a list instead
      </button>
    </div>
  );
}
