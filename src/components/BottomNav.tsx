import type { Tab } from "../types";
import { ManageNavIcon, MatchesNavIcon, RankingsNavIcon, SessionNavIcon } from "./icons";
import styles from "./BottomNav.module.css";

const TABS: { id: Tab; label: string; Icon: typeof SessionNavIcon }[] = [
  { id: "session", label: "Session", Icon: SessionNavIcon },
  { id: "matches", label: "Matches", Icon: MatchesNavIcon },
  { id: "rankings", label: "Rankings", Icon: RankingsNavIcon },
  { id: "manage", label: "Manage", Icon: ManageNavIcon },
];

interface BottomNavProps {
  active: Tab;
  onChange: (tab: Tab) => void;
  hideManage?: boolean;
}

export function BottomNav({ active, onChange, hideManage }: BottomNavProps) {
  const tabs = hideManage ? TABS.filter((t) => t.id !== "manage") : TABS;
  return (
    <nav className={styles.nav}>
      <div className={styles.inner}>
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`${styles.item} ${active === id ? styles.active : ""}`}
            onClick={() => onChange(id)}
            aria-current={active === id ? "page" : undefined}
          >
            <Icon />
            <span className={styles.label}>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
