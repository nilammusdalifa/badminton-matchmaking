import type { Match, Player } from "../types";

export const PAUSE_LABELS: Record<string, string> = {
  rest: "Rest",
  host: "Host Duty",
  break: "Break",
  injury: "Injury",
  other: "Other",
};

// Intentionally empty — the app starts from a clean slate. Add players via
// Manage or the New Session wizard rather than seeding fake demo content.
export const PLAYERS_INIT: Player[] = [];
export const MATCHES_INIT: Match[] = [];
