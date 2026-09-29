import type { CounterSnapshot, Court, Match, Player, PlayerStatus, ResultMode, SessionHistoryEntry, SkillLevel, Suggestion } from "../types";

const PHOTO_REMINDER_LEAD_MINUTES = 30;

/** Times written in a free-text schedule, as minutes after midnight: "19:00",
 * "7:30 PM", "7pm". A bare number ("Wed 12 Nov") isn't a time — it needs a
 * colon or am/pm. Out-of-range values are dropped. */
function scheduleTimes(schedule: string): number[] {
  const times: number[] = [];
  for (const m of schedule.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(?:([ap])\.?m\b\.?)?/gi)) {
    const [, h, min, ampm] = m;
    if (min === undefined && !ampm) continue;
    let hour = parseInt(h, 10);
    const minute = min === undefined ? 0 : parseInt(min, 10);
    if (minute > 59) continue;
    if (ampm) {
      if (hour < 1 || hour > 12) continue;
      hour = (hour % 12) + (ampm.toLowerCase() === "p" ? 12 : 0);
    } else if (hour > 23) continue;
    times.push(hour * 60 + minute);
  }
  return times;
}

/** Minutes left when `now` falls in the last 30 minutes of the session named
 * by a free-text schedule ("Rabu · 19:00–22:00", "7pm-10pm", "22:00–00:30");
 * null otherwise, or when the text doesn't hold a start and an end time. The
 * first time is the start and the last is the end; an end at or before the
 * start means the session runs past midnight. */
export function photoReminderMinutes(schedule: string, now: Date): number | null {
  const times = scheduleTimes(schedule);
  if (times.length < 2) return null;
  const start = times[0];
  let end = times[times.length - 1];
  if (end <= start) end += 1440;
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  // the session may have started today, or (past midnight) yesterday
  for (const endToday of [end, end - 1440]) {
    const left = endToday - nowMin;
    if (left > 0 && left <= PHOTO_REMINDER_LEAD_MINUTES) return Math.ceil(left);
  }
  return null;
}

/** Writes points entered in the scorekeeper onto the match itself while it's
 * still being played, so closing the sheet (or a viewer watching) doesn't
 * lose them. A completed match is only ever changed by an explicit save —
 * otherwise retyping a score while fixing it would rewrite rankings live. */
export function applyLiveScore(matches: Match[], matchId: string, s1: number, s2: number): Match[] {
  return matches.map((m) => (m.id === matchId && m.status === "in_progress" ? { ...m, s1, s2 } : m));
}

/** Identity of a session document for sync purposes: everything EXCEPT the
 * running points of matches still being played. Points entered in the
 * scorekeeper change many times a rally; pushing the whole session to
 * Firebase each time makes two devices' writes collide constantly (the
 * server only accepts a strictly higher `rev`, and the loser silently
 * diverges). Live points travel with the next real push instead. */
export function syncFingerprint<T extends { matches: Match[] }>(data: T): string {
  return JSON.stringify({ ...data, matches: data.matches.map((m) => (m.status === "in_progress" ? { ...m, s1: 0, s2: 0 } : m)) });
}

/** The points on the board for a match that's still being played — what an
 * open scorekeeper sheet should show when another device changed the match
 * underneath it. Null for a finished or unknown match. */
export function liveScoreFor(matches: Match[], matchId: string | null): { s1: number; s2: number } | null {
  const m = matchId ? matches.find((x) => x.id === matchId) : undefined;
  return m && m.status === "in_progress" ? { s1: m.s1, s2: m.s2 } : null;
}

/** Firebase Realtime Database doesn't store empty arrays, so a snapshot
 * simply lacks a list that was just emptied (last partner request removed,
 * session reset, only match cancelled). Merging that snapshot over local
 * state must reset those lists, not keep the stale copy. */
export function withListDefaults<T extends { players?: Player[]; matches?: Match[]; courts?: Court[]; requestedPairs?: [string, string][]; history?: SessionHistoryEntry[] }>(
  payload: T,
): T & { players: Player[]; matches: Match[]; courts: Court[]; requestedPairs: [string, string][]; history: SessionHistoryEntry[] } {
  return { players: [], matches: [], courts: [], requestedPairs: [], history: [], ...payload };
}

/** True when another roster entry already uses this name (trimmed,
 * case-insensitive). `exceptId` lets a player keep their own name while
 * being edited. */
export function nameTaken(players: Player[], name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return players.some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === key);
}

/** A player can only be deleted outright while nothing refers to them — no
 * games played and no match (live or finished) listing them. Anyone else
 * would leave stats and history pointing at a person who no longer exists;
 * they can "Leave" instead, which keeps their record. */
export function canRemovePlayer(player: Player, matches: Match[]): boolean {
  return player.games === 0 && !matches.some((m) => m.t1.includes(player.id) || m.t2.includes(player.id));
}

/** True on a brand-new install: nothing set up at all. Having players but no
 * courts yet is a half-finished setup, not a first run. */
export function isFirstRun(playersCount: number, courtsCount: number): boolean {
  return playersCount === 0 && courtsCount === 0;
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

function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

/** Splits a foursome into two teams by skill tier (highest+lowest vs. the
 * middle pair by default) so the average skill on each side of the net is
 * close. Deliberately keyed on the organizer-set tier, not a
 * performance-derived rating — the audit backing this rework calls out
 * result-driven rating as a live matchmaking input as hard to trust/explain;
 * tier is visible, organizer-controlled, and doesn't drift mid-session.
 *
 * `avoidPairs` — partnerships (by id, order-independent) to steer away from
 * recreating, typically the partnerships from the last match or two. Of the
 * 3 ways to split 4 people into two pairs, this picks whichever repeats the
 * fewest of them, breaking ties by skill balance — the extremes-vs-middle
 * split is listed first so it still wins when nothing needs avoiding, same
 * as before this had any history-awareness at all. Without this, the same
 * two players could be teamed together again the very next match. */
export function pickBalancedFoursome(
  four: Player[],
  avoidPairs: Set<string> = new Set(),
): { team1: [Player, Player]; team2: [Player, Player] } {
  const [a, b, c, d] = [...four].sort((x, y) => LEVEL_RANK[y.level] - LEVEL_RANK[x.level]);
  const candidates: [[Player, Player], [Player, Player]][] = [
    [[a, d], [b, c]],
    [[a, c], [b, d]],
    [[a, b], [c, d]],
  ];
  const skillGap = (t1: [Player, Player], t2: [Player, Player]) =>
    Math.abs(LEVEL_RANK[t1[0].level] + LEVEL_RANK[t1[1].level] - (LEVEL_RANK[t2[0].level] + LEVEL_RANK[t2[1].level]));
  const repeatCount = (t1: [Player, Player], t2: [Player, Player]) =>
    (avoidPairs.has(pairKey(t1[0].id, t1[1].id)) ? 1 : 0) + (avoidPairs.has(pairKey(t2[0].id, t2[1].id)) ? 1 : 0);
  const best = candidates
    .map(([team1, team2]) => ({ team1, team2, repeats: repeatCount(team1, team2), gap: skillGap(team1, team2) }))
    .sort((x, y) => x.repeats - y.repeats || x.gap - y.gap)[0];
  return { team1: best.team1, team2: best.team2 };
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
          `${a.name} & ${b.name} requested as partners`,
          "Others chosen by waiting time",
        ],
        balanceNote: null,
      };
    }
  }

  const top3 = ordered.slice(0, 3);
  const restPool = ordered.slice(3);
  const fourth = restPool.length ? restPool[seed % restPool.length] : null;
  const four = [...top3, fourth].filter((p): p is Player => Boolean(p));
  if (four.length < 4) return null;
  // Steer the team split away from repeating who was partnered with whom in
  // the last couple of completed matches — otherwise, with a small ready
  // pool, the same two players can easily get teamed together again
  // back-to-back with no variation at all.
  const avoidPairs = new Set<string>();
  for (const m of [...matches].filter((m) => m.status === "completed").sort((a, b) => b.num - a.num).slice(0, 2)) {
    avoidPairs.add(pairKey(m.t1[0], m.t1[1]));
    avoidPairs.add(pairKey(m.t2[0], m.t2[1]));
  }
  const split = pickBalancedFoursome(four, avoidPairs);
  const lead = ordered[0];
  const reasons = [
    lead.skipped === 0
      ? `${lead.name} is first in line`
      : `${lead.name} has waited ${lead.skipped} ${lead.skipped === 1 ? "match" : "matches"}`,
  ];
  const streak = four.find((p) => p.consecutiveGames >= 2);
  if (streak) reasons.push(`${streak.name} is playing back-to-back`);
  const balanceNote = `Balanced by tier (${four.map((p) => p.level).join("/")})`;
  return { team1: split.team1, team2: split.team2, four, reasons, balanceNote };
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
/** Games together / faced before partner and opponent stats are shown. */
const MIN_PAIR_GAMES = 2;

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
    const recentForm = (recent.get(p.id) || []).slice(-5);
    const trend = recentForm.reduce((a, b) => a + b, 0);

    let favPartner = "—";
    let favPartnerWin = 0;
    let favPartnerGames = 0;
    const pm = partner.get(p.id);
    if (pm) {
      let best: [string, PartnerStat] | null = null;
      for (const entry of pm) {
        // One game together (or never winning together) isn't a "favourite".
        if (entry[1].games < MIN_PAIR_GAMES || entry[1].wins === 0) continue;
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
        // Same bar for "tough opponent": faced twice, and lost at least once.
        if (entry[1].games < MIN_PAIR_GAMES || entry[1].losses === 0) continue;
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
      recentForm,
      favPartner,
      favPartnerWin,
      favPartnerGames,
      toughOpp,
      toughOppLoss,
      toughOppGames,
    };
  });
}

/** Leaderboard order, in words anyone can check: most wins first, then the
 * bigger point difference, then fewer losses, then name. Only players who
 * have played are ranked; the rest follow, unranked (`rank: null`), by name.
 * A session that doesn't record results ("none") has nothing to rank by, so
 * nobody is ranked and the list just shows who played most. */
export function rankPlayers(players: Player[], resultMode: ResultMode = "score"): { player: Player; rank: number | null }[] {
  if (resultMode === "none") {
    return [...players].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).map((player) => ({ player, rank: null }));
  }
  const played = players
    .filter((p) => p.games > 0)
    .sort((a, b) => b.wins - a.wins || b.diff - a.diff || a.losses - b.losses || a.name.localeCompare(b.name));
  const unplayed = players.filter((p) => p.games === 0).sort((a, b) => a.name.localeCompare(b.name));
  return [...played.map((player, i) => ({ player, rank: i + 1 })), ...unplayed.map((player) => ({ player, rank: null }))];
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
    recentForm: [],
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
    recentForm: [],
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
  const topRankings = rankPlayers(params.players)
    .filter((r) => r.rank !== null)
    .slice(0, 5)
    .map((r) => ({ rank: r.rank as number, name: r.player.name, wins: r.player.wins, losses: r.player.losses }));
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
