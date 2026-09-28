import type { SkillLevel } from "../types";
import styles from "./LevelPicker.module.css";

const LEVELS: SkillLevel[] = ["A", "B", "C"];

interface LevelPickerProps {
  value: SkillLevel;
  onChange: (level: SkillLevel) => void;
  size?: "sm" | "md";
}

export function LevelPicker({ value, onChange, size = "md" }: LevelPickerProps) {
  return (
    <div className={styles.group}>
      {LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`${styles.option} ${size === "sm" ? styles.sm : ""} ${value === level ? styles.active : ""}`}
          aria-pressed={value === level}
        >
          {level}
        </button>
      ))}
    </div>
  );
}
