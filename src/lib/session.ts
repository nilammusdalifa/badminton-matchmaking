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

/** The end of a free-text schedule ("Rabu · 19:00–22:00") as "HH:MM", the
 * same time the photo reminder counts down to; null without a start and an end. */
export function scheduleEndTime(schedule: string): string | null {
  const times = scheduleTimes(schedule);
  if (times.length < 2) return null;
  const end = times[times.length - 1] % 1440;
  return String(Math.floor(end / 60)).padStart(2, "0") + ":" + String(end % 60).padStart(2, "0");
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

const COURT_CLOSE_LEAD_MINUTES = 10;
/** From this long before its closing time a court stops being offered new
 * matches — one started now wouldn't finish in time. */
export const COURT_CLOSING_SOON_MINUTES = 15;
/** How long after its closing time a court keeps being handled. Bounded so a
 * court left over from a past session doesn't act up hours later. */
const COURT_CLOSE_GRACE_MINUTES = 120;

/** "HH:MM" as a time input yields it, as minutes after midnight; null when
 * missing or malformed. */
export function parseClockTime(value: string | undefined): number | null {
  const m = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

/** Minutes until a court's closing time (negative once it has passed, down to
 * two hours after); null when it has no valid closing time, or when that time
 * is more than 12 hours away either way. Compared around the clock, so a court
 * closing at 00:15 still counts at 23:55. */
export function minutesToClose(court: Court, now: Date): number | null {
  const closeMin = parseClockTime(court.closesAt);
  if (closeMin === null) return null;
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const diff = ((((closeMin - nowMin + 720) % 1440) + 1440) % 1440) - 720; // (-720, 720]
  return diff <= -COURT_CLOSE_GRACE_MINUTES ? null : diff;
}

/** Matches started on a court this session, running or finished. */
function courtMatchCount(courtId: string, matches: Match[]): number {
  return matches.filter((m) => m.courtId === courtId).length;
}

/** The organizer chose to run this court past its closing time and the one
 * more match that allowed hasn't been started yet. */
function keptOpen(court: Court, matches: Match[]): boolean {
  return court.keepOpenFor !== undefined && court.keepOpenFor === court.closesAt && courtMatchCount(court.id, matches) <= (court.keepOpenBase ?? 0);
}

/** Within 15 minutes of closing (or past it), still open, and not kept open:
 * no new match should start here. */
export function isCourtClosingSoon(court: Court, matches: Match[], now: Date): boolean {
  const left = minutesToClose(court, now);
  return left !== null && left <= COURT_CLOSING_SOON_MINUTES && !court.paused && !keptOpen(court, matches);
}

/** Open past the closing window on the organizer's say-so, with one more
 * match still to start — what the court card reports as "kept open". */
export function isCourtKeptOpen(court: Court, matches: Match[], now: Date): boolean {
  const left = minutesToClose(court, now);
  return left !== null && left <= COURT_CLOSING_SOON_MINUTES && !court.paused && keptOpen(court, matches);
}

/** Its closing time has passed (within the last two hours). */
export function isCourtPastClosing(court: Court, now: Date): boolean {
  const left = minutesToClose(court, now);
  return left !== null && left <= 0;
}

/** Courts that have reached their closing time with nothing being played on
 * them, and should now pause themselves. */
export function courtsDueToPause(courts: Court[], matches: Match[], now: Date): Court[] {
  return courts.filter((court) => {
    const left = minutesToClose(court, now);
    if (left === null || left > 0 || court.paused || keptOpen(court, matches)) return false;
    return !matches.some((m) => m.status === "in_progress" && m.courtId === court.id);
  });
}

/** Courts as a new session finds them: everything reopened, and last
 * session's "keep open" choices forgotten. Names and closing times carry over. */
export function resetCourtsForNewSession(courts: Court[]): Court[] {
  return courts.map((court) => {
    const next = { ...court };
    delete next.paused;
    delete next.keepOpenFor;
    delete next.keepOpenBase;
    return next;
  });
}

/** Resuming only unpauses. Inside the closing window the court then shows
 * "Closing soon" like any other; it takes an explicit Keep open to run past
 * closing time. */
export function resumeCourt(court: Court): Court {
  const next = { ...court };
  delete next.paused;
  return next;
}

/** Keep open: one more match may start on this court, whether it is idle,
 * mid-match or paused past closing. Pressed again while that match runs, it
 * allows another. The court then closes normally when the match is over. */
export function keepCourtOpen(court: Court, matches: Match[]): Court {
  if (!court.closesAt) return court;
  const next: Court = { ...court, keepOpenFor: court.closesAt, keepOpenBase: courtMatchCount(court.id, matches) };
  delete next.paused;
  return next;
}

export interface CourtCloseReminder {
  courtId: string;
  name: string;
  closesAt: string;
  /** Whole minutes until closing; 0 or negative once it has passed. */
  minutesLeft: number;
  /** A match is still being played there, so it can't be paused yet. */
  busy: boolean;
}

/** Courts whose closing time is within the next 10 minutes, or passed in the
 * last two hours, and that are still open and not overridden — the ones the
 * organizer should hear about. */
export function courtCloseReminders(courts: Court[], matches: Match[], now: Date): CourtCloseReminder[] {
  const reminders: CourtCloseReminder[] = [];
  for (const court of courts) {
    const left = minutesToClose(court, now);
    if (left === null || left > COURT_CLOSE_LEAD_MINUTES || court.paused || keptOpen(court, matches)) continue;
    reminders.push({
      courtId: court.id,
      name: court.name,
      closesAt: court.closesAt!,
      minutesLeft: Math.ceil(left),
      busy: matches.some((m) => m.status === "in_progress" && m.courtId === court.id),
    });
  }
  return reminders;
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

/** Two characters for an avatar. Two-word names use both first letters
 * ("Budi Santoso" → BS); a name ending in a number keeps it, so "P01" and
 * "P02" stay apart (P1, P2); anything else is its first two letters. */
export function initialsFor(name: string): string {
  const words = (name || "?").trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const numbered = words[0].match(/^(\D)\D*0*(\d+)$/);
  if (numbered) return (numbered[1] + numbered[2]).toUpperCase();
  return words[0].substring(0, 2).toUpperCase();
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

/** How many times each pair has shared a match this session, as opponents or
 * partners (`meet`) and as partners only (`partner`). Counts matches that are
 * still being played too — they're part of tonight's history already. */
export function pairCounts(matches: Match[]): { meet: Map<string, number>; partner: Map<string, number> } {
  const meet = new Map<string, number>();
  const partner = new Map<string, number>();
  const bump = (map: Map<string, number>, a: string, b: string) => map.set(pairKey(a, b), (map.get(pairKey(a, b)) || 0) + 1);
  for (const m of matches) {
    const four = [...m.t1, ...m.t2];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) bump(meet, four[i], four[j]);
    bump(partner, m.t1[0], m.t1[1]);
    bump(partner, m.t2[0], m.t2[1]);
  }
  return { meet, partner };
}

/** Splits a foursome into two teams by skill tier so the average skill on
 * each side of the net is close. Deliberately keyed on the organizer-set
 * tier, not a performance-derived rating — the audit backing this rework
 * calls out result-driven rating as a live matchmaking input as hard to
 * trust/explain; tier is visible, organizer-controlled, and doesn't drift
 * mid-session.
 *
 * `partnerCount` — how often each pair (by id, order-independent) has been
 * partners this session. Of the 3 ways to split 4 people into two pairs, this
 * picks whichever repeats the fewest partnerships, then the smallest skill
 * gap. Only splits within one tier point of the best balance are considered,
 * so avoiding a repeat never means putting both strongest players against
 * both weakest. The extremes-vs-middle split is listed first so it still wins
 * a full tie. */
export function pickBalancedFoursome(
  four: Player[],
  partnerCount: Map<string, number> = new Map(),
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
    (partnerCount.get(pairKey(t1[0].id, t1[1].id)) || 0) + (partnerCount.get(pairKey(t2[0].id, t2[1].id)) || 0);
  const scored = candidates.map(([team1, team2]) => ({ team1, team2, repeats: repeatCount(team1, team2), gap: skillGap(team1, team2) }));
  const bestGap = Math.min(...scored.map((x) => x.gap));
  const best = scored.filter((x) => x.gap <= bestGap + 1).sort((x, y) => x.repeats - y.repeats || x.gap - y.gap)[0];
  return { team1: best.team1, team2: best.team2 };
}

export function readyPool(players: Player[], matches: Match[]): Player[] {
  return players.filter((p) => p.status === "ready" && !p.skipNextRound && !isPlaying(p.id, matches));
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([item, ...rest]);
  });
  return out;
}

/** Nobody is picked for a third match in a row while others are available. */
const MAX_CONSECUTIVE = 2;
/** How many of the highest-priority players are weighed against each other. */
const CANDIDATE_WINDOW = 8;
/** How many of the best-scoring groups Shuffle cycles through. */
const SHUFFLE_CHOICES = 6;

/** Waiting this many matches makes a player a must-play: a quarter of the
 * ready players, rounded up. A fixed number breaks down as the group grows —
 * with 16 on two courts every waiting player has already waited 2 whenever a
 * court frees, so the rule would fill all four places with the waiting group,
 * in roster order, and the same foursomes would repeat all night. */
function mustPlayAfter(readyCount: number): number {
  return Math.ceil(readyCount / 4);
}

/** With a single court open, a waiting player's turn is a whole match away, so
 * waiting counts double against the other terms. */
const SINGLE_COURT_WAIT_WEIGHT = 2;

/** Picks who plays next from the ready pool. Rules, in order:
 *  1. Anyone who has waited a quarter of the pool's size (rounded up) must
 *     play (at most 4, by priority).
 *  2. Nobody plays a third match in a row, unless too few others are ready.
 *  3. The rest are chosen from the next 8 by priority: every combination is
 *     costed as `8 × familiarity − Σ priority + 6 × Σ (games − fewest games)`,
 *     where familiarity is how often each pair of the four has already shared
 *     a match tonight. Lowest cost wins; `seed` (Shuffle) steps through the
 *     next-best few. So four people who just finished together get split up
 *     rather than sent straight back out as the same group. */
export function pickFour(pool: Player[], meet: Map<string, number>, seed = 0, singleCourt = false): Player[] | null {
  if (pool.length < 4) return null;
  const waitWeight = singleCourt ? SINGLE_COURT_WAIT_WEIGHT : 1;
  const mustAfter = mustPlayAfter(pool.length);
  const sorted = playerPriority(pool);
  const must = sorted.filter((p) => p.skipped >= mustAfter).slice(0, 4);
  let rest = sorted.filter((p) => !must.includes(p));
  const rested = rest.filter((p) => p.consecutiveGames < MAX_CONSECUTIVE);
  if (rested.length >= 4 - must.length) rest = rested;
  rest = rest.slice(0, CANDIDATE_WINDOW);

  const minGames = Math.min(...pool.map((p) => p.games));
  const ranked = combinations(rest, 4 - must.length)
    .map((combo) => {
      const four = [...must, ...combo];
      let familiarity = 0;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) familiarity += meet.get(pairKey(four[i].id, four[j].id)) || 0;
      const cost = 8 * familiarity - waitWeight * four.reduce((sum, p) => sum + priorityScore(p), 0) + 6 * four.reduce((sum, p) => sum + (p.games - minGames), 0);
      return { four, familiarity, cost };
    })
    .sort((x, y) => x.cost - y.cost);
  return ranked[seed % Math.min(ranked.length, SHUFFLE_CHOICES)].four;
}

export interface SuggestionOptions {
  /** Hosts wait out the first round: leave them out while enough others can fill the court. */
  holdHosts?: boolean;
  /** Only one court can take a match, so waiting players count for more. */
  singleCourt?: boolean;
}

export function buildSuggestion(
  players: Player[],
  matches: Match[],
  requestedPairs: [string, string][],
  excludeIds: string[],
  seed: number,
  options: SuggestionOptions = {},
): Suggestion | null {
  let pool = readyPool(players, matches).filter((p) => !excludeIds.includes(p.id));
  if (options.holdHosts) {
    // Only while four others are there to play — a court never sits empty for a host.
    const others = pool.filter((p) => !p.isHost);
    if (others.length >= 4) pool = others;
  }
  if (pool.length < 4) return null;
  const ordered = playerPriority(pool);
  const { meet, partner } = pairCounts(matches);

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

  const four = pickFour(pool, meet, seed, options.singleCourt);
  if (!four) return null;
  const split = pickBalancedFoursome(four, partner);

  // What actually drove the pick, not how the teams were split.
  const lead = playerPriority(four)[0];
  const reasons = [
    lead.skipped === 0
      ? `${lead.name} is first in line`
      : `${lead.name} has waited ${lead.skipped} ${lead.skipped === 1 ? "match" : "matches"}`,
  ];
  let familiarity = 0;
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) familiarity += meet.get(pairKey(four[i].id, four[j].id)) || 0;
  // "New group" only means something once everyone has been on court
  const everyonePlayed = players.filter((p) => p.status === "ready").every((p) => matches.some((m) => m.t1.includes(p.id) || m.t2.includes(p.id)));
  if (everyonePlayed && familiarity === 0) reasons.push("New group");
  const streak = four.find((p) => p.consecutiveGames >= 2);
  if (streak) reasons.push(`${streak.name} is playing back-to-back`);
  const levels = (team: [Player, Player]) => team.map((p) => p.level).join("+");
  const balanceNote = `Teams balanced by tier (${levels(split.team1)} vs ${levels(split.team2)})`;
  return { team1: split.team1, team2: split.team2, four, reasons, balanceNote };
}

/** Hosts wait out the first round: until one match has started on every open court. */
export function hostsHolding(courts: Court[], matches: Match[]): boolean {
  return matches.length < courts.filter((c) => !c.paused).length;
}

/** A hint for when there are too few players for the courts open: below
 * 4 per court plus 2, people end up playing 3–5 games in a row. Null when
 * there is nothing to suggest. */
export function fewPlayersHint(readyCount: number, openCourts: number): string | null {
  if (openCourts < 2 || readyCount < 4 || readyCount >= 4 * openCourts + 2) return null;
  const courts = Math.max(1, Math.floor((readyCount - 2) / 4));
  return `Only ${readyCount} players ready. Consider ${courts} ${courts === 1 ? "court" : "courts"} for now.`;
}

/** Suggestions for every court that can take a match right now, keyed by
 * court id — computed once so the court card, "Start Match", the manual-assign
 * modal and auto-fill all show and start the same four. A court's suggestion
 * excludes whoever earlier courts already claimed. A court that is paused,
 * busy or closing soon has no entry; `null` means it's open but too few
 * players are waiting. */
export function courtSuggestions(
  courts: Court[],
  players: Player[],
  matches: Match[],
  requestedPairs: [string, string][],
  seeds: Record<string, number>,
  now: Date,
): Record<string, Suggestion | null> {
  const claimed: string[] = [];
  const out: Record<string, Suggestion | null> = {};
  const options: SuggestionOptions = {
    holdHosts: hostsHolding(courts, matches),
    singleCourt: courts.filter((c) => !c.paused && !isCourtClosingSoon(c, matches, now)).length === 1,
  };
  for (const court of courts) {
    if (court.paused || isCourtClosingSoon(court, matches, now)) continue;
    if (matches.some((m) => m.status === "in_progress" && m.courtId === court.id)) continue;
    const suggestion = buildSuggestion(players, matches, requestedPairs, claimed, seeds[court.id] || 0, options);
    out[court.id] = suggestion;
    if (suggestion) claimed.push(...suggestion.four.map((p) => p.id));
  }
  return out;
}

/** The rotation counters after `four` start a match: they reset their wait
 * and add a game in a row; every other ready player who isn't on a court
 * waits one more. `matches` is the list BEFORE the new match is added. */
export function applyMatchStart(players: Player[], matches: Match[], four: readonly string[]): Player[] {
  return players.map((p) => {
    if (four.includes(p.id)) {
      const consecutiveGames = (p.consecutiveGames || 0) + 1;
      return { ...p, skipped: 0, consecutiveGames, skipNextRound: false, maxConsecutive: Math.max(p.maxConsecutive || 0, consecutiveGames) };
    }
    if (p.status === "ready" && !isPlaying(p.id, matches)) return { ...p, skipped: p.skipped + 1, consecutiveGames: 0, skipNextRound: false };
    return p;
  });
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
