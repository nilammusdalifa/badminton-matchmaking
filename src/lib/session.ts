import type { CounterSnapshot, Match, Player, PlayerStatus, SessionHistoryEntry, SkillLevel, Suggestion } from "../types";

/** Best-effort: pulls the last "HH:MM"-shaped token out of a free-text
 * schedule string (e.g. "Wed · 19:00–22:00" or "Rabu, 19:00 - 22:00") and
 * treats it as the session's end time. Needs at least two time-like tokens
 * (a start and an end) to avoid misreading a single time as an end time;
 * returns null rather than guess when the text doesn't look like that. */
export function parseScheduleEndTime(schedule: string): { hour: number; minute: number } | null {
  const matches = [...schedule.matchAll(/(\d{1,2}):(\d{2})/g)];
  if (matches.length < 2) return null;
  const [, h, m] = matches[matches.length - 1];
  const hour = parseInt(h, 10);
  const minute = parseInt(m, 10);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function isOverTarget(s1: number, s2: number): boolean {
  return (s1 >= 21 && s1 - s2 >= 2) || (s2 >= 21 && s2 - s1 >= 2) || s1 >= 30 || s2 >= 30;
}

export function initialsFor(name: string): string {
  return (name || "?").substring(0, 2).toUpperCase();
}

export function isPlaying(playerId: string, matches: Match[]): boolean {
  return matches.some(
    (m) => m.status === "in_progress" && (m.t1.includes(playerId) || m.t2.includes(playerId)),
  );
}

export function teamNames(ids: readonly string[], players: Player[]): string[] {
  return ids.map((id) => players.find((p) => p.id === id)?.name ?? "?");
}

/** Captures the rotation-fairness fields a match-start is about to touch —
 * the four joining players (about to have skipped reset and consecutiveGames
 * bumped) and every other ready, not-yet-playing player (about to have
 * skipped bumped) — using the *same* eligibility condition the mutation
 * itself uses, so nothing it will touch is missed. See `Match.counterSnapshot`. */
export function buildCounterSnapshot(players: Player[], matches: Match[], four: readonly string[]): Record<string, CounterSnapshot> {
  const snapshot: Record<string, CounterSnapshot> = {};
  for (const p of players) {
    if (four.includes(p.id) || (p.status === "ready" && !isPlaying(p.id, matches))) {
      snapshot[p.id] = { skipped: p.skipped, consecutiveGames: p.consecutiveGames, skipNextRound: p.skipNextRound, maxConsecutive: p.maxConsecutive };
    }
  }
  return snapshot;
}

/** Restores each player's pre-match rotation fields from a snapshot — used
 * when cancelling a match that never actually finished, so it doesn't leave
 * permanent fairness drift behind. Players no longer on the roster, or not
 * covered by the snapshot, are left untouched. */
export function reverseCounterSnapshot(players: Player[], snapshot: Record<string, CounterSnapshot> | undefined): Player[] {
  if (!snapshot) return players;
  return players.map((p) => {
    const snap = snapshot[p.id];
    return snap ? { ...p, ...snap } : p;
  });
}

export function formatElapsed(match: Match, tick: number): string {
  const secs = Math.max(0, match.elapsedAtTick0 + tick);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

/** Higher score = waited longer / more overdue for a game. Drives who gets
 * suggested next: rounds skipped dominate, back-to-back play and total
 * games act as tiebreakers so no one gets stuck sitting out forever. */
export function priorityScore(p: Player): number {
  return p.skipped * 10 - p.consecutiveGames * 3 - p.games * 0.5;
}

export function playerPriority(pool: Player[]): Player[] {
  return [...pool].sort((a, b) => priorityScore(b) - priorityScore(a));
}

const LEVEL_RANK: Record<SkillLevel, number> = { A: 3, B: 2, C: 1 };

/** Splits a foursome into two teams by skill tier (highest+lowest vs. the
 * middle pair) so the average skill on each side of the net is close.
 * Deliberately keyed on the organizer-set tier, not a performance-derived
 * rating — the audit backing this rework calls out result-driven rating as
 * a live matchmaking input as hard to trust/explain; tier is visible,
 * organizer-controlled, and doesn't drift mid-session. */
export function pickBalancedFoursome(four: Player[]): { team1: [Player, Player]; team2: [Player, Player] } {
  const sorted = [...four].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  return { team1: [sorted[0], sorted[3]], team2: [sorted[1], sorted[2]] };
}

export function readyPool(players: Player[], matches: Match[]): Player[] {
  return players.filter((p) => p.status === "ready" && !p.skipNextRound && !isPlaying(p.id, matches));
}

export function buildSuggestion(
  players: Player[],
  matches: Match[],
  requestedPairs: [string, string][],
  excludeIds: string[],
  seed: number,
): Suggestion | null {
  const pool = readyPool(players, matches).filter((p) => !excludeIds.includes(p.id));
  if (pool.length < 4) return null;
  const ordered = playerPriority(pool);

  const reqPair = requestedPairs.find(
    ([a, b]) => ordered.some((p) => p.id === a) && ordered.some((p) => p.id === b),
  );
  if (reqPair) {
    const a = ordered.find((p) => p.id === reqPair[0])!;
    const b = ordered.find((p) => p.id === reqPair[1])!;
    const rest = ordered.filter((p) => p.id !== a.id && p.id !== b.id);
    if (rest.length >= 2) {
      // Requested partners stay fixed; Shuffle rotates which two players
      // fill the other side, via a sliding window of `rest` keyed by seed —
      // otherwise Shuffle would silently do nothing while a request is pending.
      const start = rest.length > 2 ? seed % rest.length : 0;
      const fillers = [rest[start], rest[(start + 1) % rest.length]] as [Player, Player];
      return {
        team1: [a, b],
        team2: fillers,
        four: [a, b, ...fillers],
        reasons: [
          `${a.name} & ${b.name} — requested partners`,
          `${fillers.map((p) => p.name).join(" & ")} filled in by priority`,
        ],
      };
    }
  }

  const top3 = ordered.slice(0, 3);
  const restPool = ordered.slice(3);
  const fourth = restPool.length ? restPool[seed % restPool.length] : null;
  const four = [...top3, fourth].filter((p): p is Player => Boolean(p));
  if (four.length < 4) return null;
  const split = pickBalancedFoursome(four);
  const lead = ordered[0];
  const reasons = [`${lead.name} waited ${lead.skipped} matches — top priority`];
  const streak = four.find((p) => p.consecutiveGames >= 2);
  if (streak) reasons.push(`${streak.name} has played back-to-back — watch for fatigue`);
  reasons.push(`Split by skill tier for balance (${four.map((p) => p.level).join("/")})`);
  return { team1: split.team1, team2: split.team2, four, reasons };
}

/** Every stat on Rankings (games/wins/losses/point diff/trend/favorite
 * partner/toughest opponent) is derived fresh from completed matches every
 * time, rather than incrementally mutated as matches are scored. That's
 * deliberate: correcting or deleting a match (see the Matches tab's "Fix
 * score"/"Delete") only has to change the match record itself — there's no
 * separate running total that could drift out of sync with it. `rating` is
 * an informational-only "form" number for the leaderboard sort; it is never
 * read by matchmaking (team splits use skill tier — see
 * pickBalancedFoursome), so it can't become a hidden algorithmic factor. */
export function recomputePlayerStats(players: Player[], matches: Match[]): Player[] {
  interface PartnerStat {
    games: number;
    wins: number;
  }
  interface OppStat {
    games: number;
    losses: number;
  }
  const games = new Map<string, number>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const diff = new Map<string, number>();
  const recent = new Map<string, number[]>();
  const partner = new Map<string, Map<string, PartnerStat>>();
  const opp = new Map<string, Map<string, OppStat>>();
  const bump = (m: Map<string, number>, id: string, by: number) => m.set(id, (m.get(id) || 0) + by);

  const process = (ids: readonly [string, string], own: number, oppScore: number, won: boolean, tie: boolean, oppIds: readonly [string, string]) => {
    const lost = !tie && !won;
    for (const id of ids) {
      bump(games, id, 1);
      bump(diff, id, own - oppScore);
      if (won) bump(wins, id, 1);
      else if (lost) bump(losses, id, 1);
      if (!tie) {
        const arr = recent.get(id) || [];
        arr.push(won ? 1 : -1);
        recent.set(id, arr);
      }
      const partnerId = ids[0] === id ? ids[1] : ids[0];
      if (!partner.has(id)) partner.set(id, new Map());
      const pm = partner.get(id)!;
      const pe = pm.get(partnerId) || { games: 0, wins: 0 };
      pe.games += 1;
      if (won) pe.wins += 1;
      pm.set(partnerId, pe);
      if (!opp.has(id)) opp.set(id, new Map());
      const om = opp.get(id)!;
      for (const oid of oppIds) {
        const oe = om.get(oid) || { games: 0, losses: 0 };
        oe.games += 1;
        if (lost) oe.losses += 1;
        om.set(oid, oe);
      }
    }
  };

  for (const m of matches) {
    if (m.status !== "completed") continue;
    const tie = m.s1 === m.s2;
    const t1Won = !tie && m.s1 > m.s2;
    process(m.t1, m.s1, m.s2, t1Won, tie, m.t2);
    process(m.t2, m.s2, m.s1, !tie && !t1Won, tie, m.t1);
  }

  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "?";

  return players.map((p) => {
    const g = games.get(p.id) || 0;
    const w = wins.get(p.id) || 0;
    const l = losses.get(p.id) || 0;
    const d = diff.get(p.id) || 0;
    const trend = (recent.get(p.id) || []).slice(-5).reduce((a, b) => a + b, 0);

    let favPartner = "—";
    let favPartnerWin = 0;
    let favPartnerGames = 0;
    const pm = partner.get(p.id);
    if (pm) {
      let best: [string, PartnerStat] | null = null;
      for (const entry of pm) {
        const rate = entry[1].wins / entry[1].games;
        const bestRate = best ? best[1].wins / best[1].games : -1;
        if (!best || rate > bestRate || (rate === bestRate && entry[1].games > best[1].games)) best = entry;
      }
      if (best) {
        favPartner = nameOf(best[0]);
        favPartnerWin = Math.round((best[1].wins / best[1].games) * 100);
        favPartnerGames = best[1].games;
      }
    }

    let toughOpp = "—";
    let toughOppLoss = 0;
    let toughOppGames = 0;
    const om = opp.get(p.id);
    if (om) {
      let worst: [string, OppStat] | null = null;
      for (const entry of om) {
        const rate = entry[1].losses / entry[1].games;
        const worstRate = worst ? worst[1].losses / worst[1].games : -1;
        if (!worst || rate > worstRate || (rate === worstRate && entry[1].games > worst[1].games)) worst = entry;
      }
      if (worst) {
        toughOpp = nameOf(worst[0]);
        toughOppLoss = Math.round((worst[1].losses / worst[1].games) * 100);
        toughOppGames = worst[1].games;
      }
    }

    return {
      ...p,
      games: g,
      wins: w,
      losses: l,
      diff: d,
      rating: 1100 + d * 3 + w * 15 - l * 10,
      trend,
      favPartner,
      favPartnerWin,
      favPartnerGames,
      toughOpp,
      toughOppLoss,
      toughOppGames,
    };
  });
}

export function makeBlankPlayer(id: string, name: string, level: SkillLevel, status: PlayerStatus): Player {
  return {
    id,
    name,
    level,
    games: 0,
    wins: 0,
    losses: 0,
    diff: 0,
    rating: 1100,
    trend: 0,
    status,
    skipped: 0,
    consecutiveGames: 0,
    skipNextRound: false,
    pauseReason: null,
    favPartner: "—",
    favPartnerWin: 0,
    favPartnerGames: 0,
    toughOpp: "—",
    toughOppLoss: 0,
    toughOppGames: 0,
    avgWait: 0,
    maxConsecutive: 0,
  };
}

/** Keeps a player's identity (id/name/level) but wipes everything scoped to
 * a single session, so a recurring group's roster survives Reset / New
 * Session without re-typing names, while attendance and stats start clean. */
export function resetPlayersForNewSession(players: Player[]): Player[] {
  return players.map((p) => ({
    ...p,
    status: "expected",
    games: 0,
    wins: 0,
    losses: 0,
    diff: 0,
    rating: 1100,
    trend: 0,
    skipped: 0,
    consecutiveGames: 0,
    skipNextRound: false,
    pauseReason: null,
    favPartner: "—",
    favPartnerWin: 0,
    favPartnerGames: 0,
    toughOpp: "—",
    toughOppLoss: 0,
    toughOppGames: 0,
    avgWait: 0,
    maxConsecutive: 0,
  }));
}

export function buildSessionSummary(params: {
  id: string;
  name: string;
  schedule: string;
  completedCount: number;
  courtsCount: number;
  players: Player[];
}): SessionHistoryEntry {
  const topRankings = [...params.players]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 5)
    .map((p, i) => ({ rank: i + 1, name: p.name, wins: p.wins, losses: p.losses }));
  return {
    id: params.id,
    name: params.name,
    schedule: params.schedule,
    endedAt: new Date().toISOString(),
    completedCount: params.completedCount,
    playersCount: params.players.length,
    courtsCount: params.courtsCount,
    topRankings,
  };
}
