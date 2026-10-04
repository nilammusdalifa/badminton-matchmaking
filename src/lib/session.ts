import type { GamesPlayedRow, GamesPlayedVM } from "../types.viewmodel";
import type { CounterSnapshot, Court, Match, Player, PlayerStatus, QueueItem, ResultMode, SessionHistoryEntry, SkillLevel, Suggestion } from "../types";
import { carriesSinceHard, hardGamePick, isHardMatch } from "./hardGames";

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

/** Courts that can take a new match: not paused and not closing soon. */
export function openCourts(courts: Court[], matches: Match[], now: Date): Court[] {
  return courts.filter((c) => !c.paused && !isCourtClosingSoon(c, matches, now));
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
export function withListDefaults<T extends { players?: Player[]; matches?: Match[]; courts?: Court[]; requestedPairs?: [string, string][]; history?: SessionHistoryEntry[]; queue?: QueueItem[] }>(
  payload: T,
): T & { players: Player[]; matches: Match[]; courts: Court[]; requestedPairs: [string, string][]; history: SessionHistoryEntry[]; queue: QueueItem[] } {
  return { players: [], matches: [], courts: [], requestedPairs: [], history: [], queue: [], ...payload };
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
      // only the four lose their place in line (cancelling stamps them); the key is
      // left out rather than undefined, which Firebase rejects
      if (four.includes(p.id) && p.idleSince !== undefined) snapshot[p.id].idleSince = p.idleSince;
    }
  }
  return snapshot;
}

/** Restores each player's pre-match rotation fields from a snapshot — used
 * when cancelling a match that never actually finished, so it doesn't leave
 * permanent fairness drift behind. Players no longer on the roster, or not
 * covered by the snapshot, are left untouched; `idleSince` only where the
 * snapshot holds one. */
export function reverseCounterSnapshot(players: Player[], snapshot: Record<string, CounterSnapshot> | undefined): Player[] {
  if (!snapshot) return players;
  return players.map((p) => {
    const snap = snapshot[p.id];
    return snap ? { ...p, ...snap } : p;
  });
}

/** The roster after cancelling a match still on court: everyone's rotation
 * fields go back to just before it started (see `reverseCounterSnapshot`) —
 * including the four's place in line, so a mis-started round-1 match doesn't
 * send them to the back — and any "after this match" choice takes effect. A
 * snapshot saved without arrival times stamps the four free at `now`. */
export function cancelMatchPlayers(players: Player[], match: Pick<Match, "t1" | "t2" | "counterSnapshot">, now: number): Player[] {
  return reverseCounterSnapshot(applyAfterMatch(players, match, now), match.counterSnapshot);
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

/** Highest priority first. Equal scores go to whoever became free earliest
 * (`idleSince`); players with no recorded time sort after any with one; still
 * equal keeps the input (roster) order, since the sort is stable. */
export function playerPriority(pool: Player[]): Player[] {
  return [...pool].sort((a, b) => {
    const byScore = priorityScore(b) - priorityScore(a);
    if (byScore !== 0) return byScore;
    const ai = a.idleSince ?? Infinity;
    const bi = b.idleSince ?? Infinity;
    if (ai === bi) return 0;
    return ai < bi ? -1 : 1;
  });
}

/** Marks a player ready and records when they became free to play. */
export function markReady(p: Player, now: number): Player {
  return { ...p, status: "ready", idleSince: now };
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

/** Added to the cost of a foursome holding both an A and a C while a hard game
 * is planned or on court (same scale as `8 × familiarity`). A preference, not a
 * ban: if every choice has one, the match is still made. */
const AVOID_AC_PENALTY = 20;

/** The must-play players of a pool: those who have waited a quarter of the
 * ready players (rounded up), by priority, at most 4. `extraReady`: players
 * about to join the pool (planned into a match ahead, or on a court about to
 * finish) count towards the cap too. Without it the cap sees only the players
 * waiting right now and forces the longest waiters together again, so the same
 * groups come back. */
function mustPlayers(pool: Player[], extraReady: number): Player[] {
  const mustAfter = mustPlayAfter(pool.length + extraReady);
  return playerPriority(pool)
    .filter((p) => p.skipped >= mustAfter)
    .slice(0, 4);
}

/** Picks who plays next from the ready pool. Rules, in order:
 *  1. Anyone who has waited a quarter of the pool's size (rounded up) must
 *     play (at most 4, by priority). `opts.forced`, when given, replaces this
 *     group (a hard game's must-play and due players); its players need not be
 *     in `pool`, which then only supplies the rest.
 *  2. Nobody plays a third match in a row, unless too few others are ready.
 *  3. The rest are chosen from the next 8 by priority: every combination is
 *     costed as `8 × familiarity − Σ priority + 6 × Σ (games − fewest games)`,
 *     where familiarity is how often each pair of the four has already shared
 *     a match tonight, plus `AVOID_AC_PENALTY` for an A with a C when
 *     `opts.avoidAC`. Lowest cost wins; `seed` (Shuffle) steps through the
 *     next-best few. So four people who just finished together get split up
 *     rather than sent straight back out as the same group. */
export function pickFour(
  pool: Player[],
  meet: Map<string, number>,
  seed = 0,
  singleCourt = false,
  extraReady = 0,
  opts: { forced?: Player[]; avoidAC?: boolean } = {},
): Player[] | null {
  if (pool.length < 4) return null;
  const waitWeight = singleCourt ? SINGLE_COURT_WAIT_WEIGHT : 1;
  const must = opts.forced
    ? opts.forced.filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i).slice(0, 4)
    : mustPlayers(pool, extraReady);
  const sorted = playerPriority(pool);
  let rest = sorted.filter((p) => !must.some((m) => m.id === p.id));
  const rested = rest.filter((p) => p.consecutiveGames < MAX_CONSECUTIVE);
  if (rested.length >= 4 - must.length) rest = rested;
  rest = rest.slice(0, CANDIDATE_WINDOW);

  const minGames = Math.min(...[...pool, ...must].map((p) => p.games));
  const ranked = combinations(rest, 4 - must.length)
    .map((combo) => {
      const four = [...must, ...combo];
      let familiarity = 0;
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) familiarity += meet.get(pairKey(four[i].id, four[j].id)) || 0;
      const mixesAC = opts.avoidAC && four.some((p) => p.level === "A") && four.some((p) => p.level === "C");
      const cost =
        8 * familiarity -
        waitWeight * four.reduce((sum, p) => sum + priorityScore(p), 0) +
        6 * four.reduce((sum, p) => sum + (p.games - minGames), 0) +
        (mixesAC ? AVOID_AC_PENALTY : 0);
      return { four, familiarity, cost };
    })
    .sort((x, y) => x.cost - y.cost);
  // forced players from outside `pool` can leave too few others to fill the four
  if (ranked.length === 0) return null;
  return ranked[seed % Math.min(ranked.length, SHUFFLE_CHOICES)].four;
}

export interface SuggestionOptions {
  /** Hosts wait out the first round: leave them out while enough others can fill the court. */
  holdHosts?: boolean;
  /** Only one court can take a match, so waiting players count for more. */
  singleCourt?: boolean;
  /** Players beyond the pool that the must-play cap should also count (see `pickFour`). */
  extraReady?: number;
  /** The "Hard games" switch: an A/B player who has carried a C partner twice
   * since their last all-A/B match may be given one (see `hardGamePick`). */
  hardGames?: boolean;
  /** A hard game exists outside `matches` (e.g. in the plan), so no other may
   * be picked and this pick avoids an A with a C. */
  hardPlanned?: boolean;
  /** A hard game is planned to start after this pick: avoid an A with a C, but
   * (unlike `hardPlanned`) a hard game may still be picked. Only with `hardGames`. */
  avoidAC?: boolean;
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

  const extraReady = options.extraReady ?? 0;
  // Hard games only with the switch on: with it off the night runs as before,
  // even when an all-A/B match happens to be on court.
  let four: Player[] | null = null;
  let hardNote: string | null = null;
  if (options.hardGames) {
    const level = new Map(players.map((p) => [p.id, p.level] as const));
    const hardActive = !!options.hardPlanned || matches.some((m) => m.status === "in_progress" && isHardMatch(m, (id) => level.get(id)));
    const carries = carriesSinceHard(players, matches);
    const pick = hardGamePick({
      pool: ordered.filter((p) => p.consecutiveGames < MAX_CONSECUTIVE),
      mustPlay: mustPlayers(pool, extraReady),
      carries,
      enabled: true,
      hardActive,
    });
    if (pick) {
      four = pickFour(pick.candidates, meet, seed, options.singleCourt, extraReady, { forced: pick.forced });
      if (four) {
        const due = pick.due.filter((p) => four!.some((q) => q.id === p.id));
        hardNote = due.length > 0 ? `Hard game · ${due.map((p) => p.name).join(" & ")} carried ${Math.max(...due.map((p) => carries.get(p.id) ?? 0))} games · ` : "Hard game · ";
      }
    }
    four ??= pickFour(pool, meet, seed, options.singleCourt, extraReady, { avoidAC: hardActive || !!options.avoidAC });
  } else {
    four = pickFour(pool, meet, seed, options.singleCourt, extraReady);
  }
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
  const balanceNote = `${hardNote ?? ""}Teams balanced by tier (${levels(split.team1)} vs ${levels(split.team2)})`;
  return { team1: split.team1, team2: split.team2, four, reasons, balanceNote, ...(hardNote !== null ? { hard: true } : {}) };
}

/** Hosts wait out the first round: until one match has started on every open court. */
export function hostsHolding(courts: Court[], matches: Match[]): boolean {
  return matches.length < courts.filter((c) => !c.paused).length;
}

/** The "Host" box on a player locks once round 1 has started. Counts every
 * court, paused or not: with all courts paused and no match yet, round 1 hasn't
 * started, so the box must still work. */
export function hostSwitchLocked(courts: Court[], matches: Match[]): boolean {
  return matches.length >= Math.max(1, courts.length);
}

/** Everyone on the roster by games played, fewest first. A player two or more
 * games behind the busiest gets a line of their own with where they are
 * (waiting, resting, left…) and a warning; the rest are grouped by count.
 * Players not checked in (and with no games) come last. Counts every game
 * played, including matches that ended early. */
export function buildGamesPlayed(players: Player[], playingIds: Set<string>): GamesPlayedVM {
  const where = (p: Player) =>
    playingIds.has(p.id) ? "on court" : p.status === "ready" ? "waiting" : p.status === "paused" ? "resting" : p.status === "left" ? "left" : "not checked in";
  const here = players.filter((p) => p.status !== "expected" || p.games > 0);
  const absent = players.filter((p) => p.status === "expected" && p.games === 0);
  const most = Math.max(0, ...here.map((p) => p.games));
  const byCount = new Map<number, Player[]>();
  for (const p of [...here].sort((a, b) => a.games - b.games || a.name.localeCompare(b.name))) {
    byCount.set(p.games, [...(byCount.get(p.games) ?? []), p]);
  }
  // someone who has left can't catch up, so they're never flagged
  const behind = (p: Player) => most - p.games >= 2 && p.status !== "left";
  const rows: GamesPlayedRow[] = [];
  for (const [games, members] of byCount) {
    if (members.length === 1 || members.some(behind)) {
      for (const p of members) rows.push({ games: String(games), text: p.name, status: where(p), warn: behind(p) });
    } else {
      rows.push({
        games: String(games),
        text: members.map((p) => (p.status === "left" || p.status === "paused" ? `${p.name} (${where(p)})` : p.name)).join(" · "),
        status: null,
        warn: false,
      });
    }
  }
  if (absent.length > 0) rows.push({ games: "–", text: absent.map((p) => p.name).join(" · "), status: absent.length === 1 ? "not checked in" : null, warn: false });
  return {
    rows,
    average: here.length > 0 ? Math.round((here.reduce((sum, p) => sum + p.games, 0) / here.length) * 10) / 10 : 0,
    behind: here.filter(behind).length,
  };
}

/** A hint for when there are too few players for the courts open: below
 * 4 per court plus 2, people end up playing 3–5 games in a row. Null when
 * there is nothing to suggest. */
export function fewPlayersHint(readyCount: number, openCourts: number): string | null {
  if (openCourts < 2 || readyCount < 4 || readyCount >= 4 * openCourts + 2) return null;
  const courts = Math.max(1, Math.floor((readyCount - 2) / 4));
  return `Only ${readyCount} players ready. Consider ${courts} ${courts === 1 ? "court" : "courts"} for now.`;
}

/** How many players are waiting once every idle open court has taken its four,
 * i.e. as it will look with all courts busy (counting the four who have just
 * finished would trip the lock for a moment on 12 players / 2 courts). Open
 * courts are those from `openCourts`, as in `planQueue`. With `hasLocked`, one
 * extra: while matches are locked, resting one player must not drop the lock
 * when exactly 8 wait. */
export function lockableWaiting(players: Player[], matches: Match[], courts: Court[], now: Date, hasLocked: boolean): number {
  const open = openCourts(courts, matches, now);
  const idle = open.filter((c) => !matches.some((m) => m.status === "in_progress" && m.courtId === c.id)).length;
  return Math.max(0, readyPool(players, matches).length - 4 * idle) + (hasLocked ? 1 : 0);
}

/** How many of the planned matches are locked: none when Plan ahead is off (the
 * plan is then only a preview that recomputes live); with it on, the whole plan
 * once at least 8 players wait, otherwise none. With fewer waiting there is
 * nobody left over to mix, and locking would pin the same groups again — which
 * the old queue-depth threshold avoided. `waiting` comes from `lockableWaiting`. */
export function lockedCount(depth: number, planAhead: boolean, waiting: number): number {
  return !planAhead ? 0 : waiting >= 8 ? depth : 0;
}

const itemIds = (item: Pick<QueueItem, "team1" | "team2">): string[] => [...item.team1, ...item.team2];

/** A locked match as a suggestion, or null if any of its players isn't ready now. */
function suggestionFromItem(item: QueueItem, players: Player[], matches: Match[], claimed: string[], queueIndex: number): Suggestion | null {
  const ready = new Map(readyPool(players, matches).map((p) => [p.id, p]));
  const ids = itemIds(item);
  if (ids.some((id) => !ready.has(id) || claimed.includes(id))) return null;
  const t = (id: string) => ready.get(id)!;
  return {
    team1: [t(item.team1[0]), t(item.team1[1])],
    team2: [t(item.team2[0]), t(item.team2[1])],
    four: ids.map(t),
    reasons: item.reasons,
    balanceNote: item.balanceNote,
    queueIndex,
    ...(item.hard ? { hard: true } : {}),
  };
}

/** Takes a match that has started out of the queue. */
export function dropStarted(queue: QueueItem[], four: readonly string[]): QueueItem[] {
  const key = [...four].sort().join("|");
  return queue.filter((item) => itemIds(item).sort().join("|") !== key);
}

/** Plans the matches after the ones already on court: one per open court.
 *
 * Item `j` (0 = "Up next", 1 = "Then") is picked as the world will look when it
 * starts: the `j` longest-playing courts have finished (they started first, so
 * they usually finish first — their four go back into the pool, which is what
 * lets groups mix) and the `j` items before it have started. The must-play cap
 * also counts the players about to join the pool (`extraReady`).
 *
 * `existing` items are kept while they're still valid for that moment — every
 * player ready — which is what makes them locked: a match shown ahead starts as
 * shown. The first one that isn't (someone rested or was edited) is re-picked
 * together with everything after it, since later items depend on earlier ones.
 * `seedAt` re-picks one position with another seed (Shuffle). Late check-ins
 * only ever extend the end.
 *
 * `hardGames` lets a slot become a hard game (see `buildSuggestion`); planned
 * matches count as on court for the slots after them, so only one is planned
 * at a time, and those slots avoid an A with a C. The freshly picked slots
 * BEFORE a freshly picked hard game are then picked once more avoiding an A
 * with a C too (upper tiers on one court, lower on the other); that second
 * plan is used only if the hard game is still there, otherwise the first.
 * Kept (locked) slots are never re-picked for this. With it off, a kept hard
 * game is re-picked as a normal match. */
export function planQueue(args: {
  players: Player[];
  matches: Match[];
  courts: Court[];
  requestedPairs: [string, string][];
  existing: QueueItem[];
  now: Date;
  enabled: boolean;
  seedAt?: { index: number; seed: number };
  /** Seeds for re-picked positions (preview shuffles), keyed by position. */
  seeds?: Record<number, number>;
  /** The "Hard games" switch. */
  hardGames?: boolean;
}): QueueItem[] {
  const { players, matches, courts, existing, now, enabled, seedAt } = args;
  const hardGames = args.hardGames ?? false;
  if (!enabled) return [];
  // a court about to close can't be given a match to plan around
  const open = openCourts(courts, matches, now);
  if (open.length === 0) return [];
  const running = matches.filter((m) => m.status === "in_progress"); // in the order they started
  const depth = open.length; // one match per open court; stops early at the first slot that can't find four
  const options: SuggestionOptions = { singleCourt: open.length === 1 };

  // One planning pass; fresh picks before slot `avoidACBefore` avoid an A with a C.
  const pass = (avoidACBefore: number) => {
    let P = players;
    let M = matches;
    let pairs = args.requestedPairs;
    const out: QueueItem[] = [];
    let firstFresh = depth; // slots from here on were picked, not kept
    let keeping = true;

    for (let j = 0; j < depth; j++) {
      let item: QueueItem | null = null;
      const kept = existing[j];
      if (keeping && kept && !(seedAt && seedAt.index === j) && !(kept.hard && !hardGames)) {
        const ready = new Set(readyPool(P, M).map((p) => p.id));
        const ids = itemIds(kept);
        if (new Set(ids).size === 4 && ids.every((id) => ready.has(id))) item = kept;
      }
      if (!item) {
        if (keeping) firstFresh = j;
        keeping = false;
        const extraReady = 4 * Math.max(j, running.length ? 1 : 0);
        const seed = seedAt && seedAt.index === j ? seedAt.seed : (args.seeds?.[j] ?? 0);
        const sug = buildSuggestion(P, M, pairs, [], seed, { ...options, holdHosts: hostsHolding(courts, M), extraReady, hardGames, avoidAC: j < avoidACBefore });
        if (!sug) break;
        item = {
          team1: [sug.team1[0].id, sug.team1[1].id],
          team2: [sug.team2[0].id, sug.team2[1].id],
          seed,
          reasons: sug.reasons,
          balanceNote: sug.balanceNote,
          // only set when true, never `hard: undefined` (Firebase rejects undefined values)
          ...(sug.hard ? { hard: true } : {}),
        };
      }
      out.push(item);

      // the world as item j+1 will see it: the next-longest court finishes, then this match starts
      const done = running[j];
      if (done) {
        const finishing = [...done.t1, ...done.t2];
        M = M.map((m) => (m.id === done.id ? { ...m, status: "completed" as const } : m));
        P = P.map((p) => (finishing.includes(p.id) ? { ...p, games: p.games + 1 } : p));
      }
      const ids = itemIds(item);
      P = applyMatchStart(P, M, ids);
      M = [...M, { id: "queue" + j, round: 0, num: M.length + 1, courtId: "", status: "in_progress", t1: item.team1, t2: item.team2, s1: 0, s2: 0, elapsedAtTick0: 0 }];
      pairs = pairs.filter(([a, b]) => !((item!.team1.includes(a) && item!.team1.includes(b)) || (item!.team2.includes(a) && item!.team2.includes(b))));
    }
    return { out, firstFresh };
  };

  const first = pass(0);
  if (!hardGames) return first.out;
  // a freshly picked hard game with freshly picked slots before it: pick those again avoiding an A with a C
  const h = first.out.findIndex((item, j) => j >= first.firstFresh && item.hard);
  if (h <= first.firstFresh) return first.out;
  const second = pass(h).out;
  return second[h]?.hard ? second : first.out;
}

/** Suggestions for every court that can take a match right now, keyed by
 * court id — computed once so the court card, "Start Match", the manual-assign
 * modal and auto-fill all show and start the same four. Free courts take the
 * locked queue in order (`queueIndex` says which), then fresh picks that
 * exclude whoever earlier courts already claimed. A court that is paused,
 * busy or closing soon has no entry; `null` means it's open but too few
 * players are waiting. With `hardGames`, a fresh pick may be a hard game unless
 * one is already planned in `queue` or picked for an earlier court this pass. */
export function courtSuggestions(
  courts: Court[],
  players: Player[],
  matches: Match[],
  requestedPairs: [string, string][],
  seeds: Record<string, number>,
  now: Date,
  queue: QueueItem[] = [],
  hardGames = false,
): Record<string, Suggestion | null> {
  const claimed: string[] = [];
  const out: Record<string, Suggestion | null> = {};
  const options: SuggestionOptions = {
    holdHosts: hostsHolding(courts, matches),
    singleCourt: openCourts(courts, matches, now).length === 1,
    hardGames,
  };
  let hardPlanned = queue.some((q) => q.hard);
  let next = 0; // how far into the queue the free courts have got
  for (const court of courts) {
    if (court.paused || isCourtClosingSoon(court, matches, now)) continue;
    if (matches.some((m) => m.status === "in_progress" && m.courtId === court.id)) continue;
    let suggestion: Suggestion | null = null;
    if (next < queue.length) {
      suggestion = suggestionFromItem(queue[next], players, matches, claimed, next);
      next++;
    }
    suggestion ??= buildSuggestion(players, matches, requestedPairs, claimed, seeds[court.id] || 0, { ...options, hardPlanned });
    out[court.id] = suggestion;
    if (suggestion) claimed.push(...suggestion.four.map((p) => p.id));
    if (suggestion?.hard) hardPlanned = true;
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

/** Tier as a number, for comparing two teams: A=3, B=2, C=1. */
const tierPoints = (level: SkillLevel): number => (level === "A" ? 3 : level === "B" ? 2 : 1);

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
  const rankGames = new Map<string, number>();
  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  const diff = new Map<string, number>();
  const pointsFor = new Map<string, number>();
  const pointsAgainst = new Map<string, number>();
  const recent = new Map<string, number[]>();
  const edge = new Map<string, number>();
  const partner = new Map<string, Map<string, PartnerStat>>();
  const opp = new Map<string, Map<string, OppStat>>();
  const bump = (m: Map<string, number>, id: string, by: number) => m.set(id, (m.get(id) || 0) + by);
  const tierOf = new Map(players.map((p) => [p.id, tierPoints(p.level)]));
  const teamPoints = (ids: readonly [string, string]) => (tierOf.get(ids[0]) ?? 2) + (tierOf.get(ids[1]) ?? 2);

  const process = (ids: readonly [string, string], own: number, oppScore: number, won: boolean, tie: boolean, oppIds: readonly [string, string]) => {
    const lost = !tie && !won;
    for (const id of ids) {
      bump(games, id, 1);
      bump(rankGames, id, 1);
      bump(diff, id, own - oppScore);
      bump(pointsFor, id, own);
      bump(pointsAgainst, id, oppScore);
      bump(edge, id, teamPoints(oppIds) - teamPoints(ids));
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
    // A match that ended early still counts as a game played (they did play,
    // so rotation shouldn't push them to the front), but nothing about its
    // result — wins, points, partners, opponents — counts.
    if (m.counted === false) {
      for (const id of [...m.t1, ...m.t2]) bump(games, id, 1);
      continue;
    }
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
      rankGames: rankGames.get(p.id) || 0,
      wins: w,
      losses: l,
      diff: d,
      pointsFor: pointsFor.get(p.id) || 0,
      pointsAgainst: pointsAgainst.get(p.id) || 0,
      partnersCount: partner.get(p.id)?.size ?? 0,
      rating: 1100 + d * 3 + w * 15 - l * 10,
      trend,
      recentForm,
      favPartner,
      favPartnerWin,
      favPartnerGames,
      toughOpp,
      toughOppLoss,
      toughOppGames,
      oppEdge: (rankGames.get(p.id) || 0) > 0 ? (edge.get(p.id) || 0) / (rankGames.get(p.id) || 1) : 0,
    };
  });
}

/** Win rate that starts everyone at "1 win, 1 loss": 1W–0L (67%) doesn't
 * jump above 4W–1L (71%), and games played doesn't decide the order alone.
 * Counts only games whose result counts. */
export function winRate(p: Pick<Player, "wins" | "rankGames">): number {
  return (p.wins + 1) / (p.rankGames + 2);
}

/** Share of all points won, pulled towards 50% by 40 points each way so a
 * couple of games can't produce an extreme figure. The tie-breaker between
 * equal records: it counts every rally, not just the win or the loss. */
export function pointsShare(p: Pick<Player, "pointsFor" | "pointsAgainst">): number {
  return (p.pointsFor + 40) / (p.pointsFor + p.pointsAgainst + 80);
}

/** To get a rank a player needs at least this many games… */
const RANK_MIN_GAMES = 3;
/** …and this share of the most games anyone ranked has played. */
const RANK_MIN_SHARE = 0.5;
/** Medals wait until this many of the players in the rotation have played 2. */
const SETTLED_SHARE = 0.75;
const SETTLED_GAMES = 2;

/** Where a player sits on the Rankings tab. */
export type StandingSection = "ranked" | "tooFew" | "notRanked";

export interface RankedPlayer {
  player: Player;
  /** Position among the ranked players (1-based); null in every other section. */
  rank: number | null;
  /** 🥇🥈🥉 for the first three ranked players, once the standings have settled. */
  medal: 1 | 2 | 3 | null;
  section: StandingSection;
}

export interface Standings {
  /** Ranked players first, then "not enough games yet", then "not ranked". */
  rows: RankedPlayer[];
  /** Too soon for medals: the leader has fewer than 3 games, or fewer than
   * 75% of the players in the rotation have played 2. */
  early: boolean;
  /** Most games anyone ranked has played. */
  maxGames: number;
}

const key4 = (x: number) => Math.round(x * 10000);
const key2 = (x: number) => Math.round((x || 0) * 100);

/** Leaderboard, in words anyone can check. Of the players who count in the
 * rankings, only those with at least 3 games and at least half as many as the
 * player with the most get a rank number: best smoothed win rate first, then
 * the tougher matches (the other team's tiers against their own, on average),
 * then — where scores are recorded — the bigger share of points won, then more
 * games, then name. Everyone else with games goes in "not enough games yet" (record
 * shown, no rank), and players switched out of the rankings (hosts, guests)
 * sit under "not ranked"; neither affects anyone's rank, the most-games bar or
 * the early check. Win rates compare to 4 decimals, so equal records tie
 * exactly and fall to the tie-breaker.
 *
 * Medals go to the first three ranked players, and only once the night has
 * settled: not while the leader has fewer than 3 games, and not until 75% of
 * the players in the rotation have played 2. A session that doesn't record
 * results ("none") has nothing to rank by, so nobody is ranked and the list
 * shows who played most. */
export function buildStandings(players: Player[], resultMode: ResultMode = "score"): Standings {
  const counted = players.filter((p) => p.inRankings !== false);
  const excluded = players.filter((p) => p.inRankings === false);
  const maxGames = Math.max(0, ...counted.map((p) => p.rankGames));
  const byGames = (a: Player, b: Player) => b.rankGames - a.rankGames || a.name.localeCompare(b.name);
  const notRanked: RankedPlayer[] = [...excluded].sort(byGames).map((player) => ({ player, rank: null, medal: null, section: "notRanked" }));
  if (resultMode === "none") {
    const rows: RankedPlayer[] = [...counted].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).map((player) => ({ player, rank: null, medal: null, section: "tooFew" }));
    return { rows: [...rows, ...notRanked], early: false, maxGames };
  }
  const sorted = counted
    .filter((p) => p.rankGames > 0)
    .sort(
      (a, b) =>
        key4(winRate(b)) - key4(winRate(a)) ||
        key2(b.oppEdge) - key2(a.oppEdge) ||
        (resultMode === "score" ? key4(pointsShare(b)) - key4(pointsShare(a)) : 0) ||
        b.rankGames - a.rankGames ||
        a.name.localeCompare(b.name),
    );
  const qualifies = (p: Player) => p.rankGames >= RANK_MIN_GAMES && p.rankGames >= RANK_MIN_SHARE * maxGames;
  const inRotation = counted.filter((p) => p.status === "ready");
  const early =
    sorted.length > 0 && (maxGames < RANK_MIN_GAMES || inRotation.filter((p) => p.rankGames >= SETTLED_GAMES).length < SETTLED_SHARE * inRotation.length);
  const ranked: RankedPlayer[] = sorted
    .filter(qualifies)
    .map((player, i) => ({ player, rank: i + 1, medal: !early && i < 3 ? ((i + 1) as 1 | 2 | 3) : null, section: "ranked" }));
  const tooFew: RankedPlayer[] = [
    ...sorted.filter((p) => !qualifies(p)),
    ...counted.filter((p) => p.rankGames === 0).sort((a, b) => a.name.localeCompare(b.name)),
  ].map((player) => ({ player, rank: null, medal: null, section: "tooFew" }));
  return { rows: [...ranked, ...tooFew, ...notRanked], early, maxGames };
}

/** A name that fits a fixed-width spot on the share card. The exporter cuts
 * overflowing text off without an ellipsis, so the name is shortened here: a
 * long full name becomes first name + last initial ("Siti N."), and anything
 * still too long is cut with an ellipsis. */
export function shortName(name: string, max: number): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  const words = trimmed.split(/\s+/);
  const compact = words.length > 1 ? `${words[0]} ${words[words.length - 1][0].toUpperCase()}.` : trimmed;
  return compact.length <= max ? compact : compact.slice(0, max - 1).trimEnd() + "…";
}

/** A fun fact for the share card, built only from results that happened. */
export interface Highlight {
  icon: string;
  label: string;
  text: string;
}

/** Up to three highlights for the picture players pass around: 🔥 a current
 * winning streak (3+ in a row), 🤝 the best partnership (won at least 75% of 2+
 * games together), 💪 the most games played (4+, and nobody else level with
 * them). Each appears only when it is real; players switched out of the
 * rankings and sessions that don't record results get none. */
export function buildHighlights(players: Player[], resultMode: ResultMode = "score"): Highlight[] {
  if (resultMode === "none") return [];
  const counted = players.filter((p) => p.inRankings !== false);
  const out: Highlight[] = [];
  // one line at a fixed width: the exporter cuts overflowing text off without an ellipsis
  const fit = (text: string) => (text.length > 30 ? text.slice(0, 29).trimEnd() + "…" : text);

  const streakOf = (p: Player) => {
    let n = 0;
    for (let i = p.recentForm.length - 1; i >= 0 && p.recentForm[i] > 0; i--) n++;
    return n;
  };
  const hot = counted
    .filter((p) => p.rankGames >= 3)
    .map((p) => ({ p, n: streakOf(p) }))
    .filter((x) => x.n >= 3)
    .sort((a, b) => b.n - a.n || b.p.wins - a.p.wins || a.p.name.localeCompare(b.p.name))[0];
  if (hot) out.push({ icon: "🔥", label: "On fire", text: fit(`${shortName(hot.p.name, 14)} · ${hot.n} wins in a row`) });

  const duo = counted
    .filter((p) => p.favPartner !== "—" && p.favPartnerGames >= 2 && p.favPartnerWin >= 75)
    .sort((a, b) => b.favPartnerWin - a.favPartnerWin || b.favPartnerGames - a.favPartnerGames || a.name.localeCompare(b.name))[0];
  if (duo) {
    const names = [duo.name, duo.favPartner].sort((x, y) => x.localeCompare(y)).map((n) => shortName(n.trim().split(/\s+/)[0], 9));
    const won = Math.round((duo.favPartnerWin * duo.favPartnerGames) / 100);
    out.push({ icon: "🤝", label: "Dream duo", text: fit(`${names[0]} & ${names[1]} · won ${won} of ${duo.favPartnerGames}`) });
  }

  const byGames = [...counted].sort((a, b) => b.games - a.games);
  if (byGames[0] && byGames[0].games >= 4 && byGames[0].games > (byGames[1]?.games ?? 0)) {
    out.push({ icon: "💪", label: "Iron player", text: fit(`${shortName(byGames[0].name, 14)} · ${byGames[0].games} games`) });
  }
  return out;
}

/** The ordered list without the extras, for callers that only need who came where. */
export function rankPlayers(players: Player[], resultMode: ResultMode = "score"): RankedPlayer[] {
  return buildStandings(players, resultMode).rows;
}

export function makeBlankPlayer(id: string, name: string, level: SkillLevel, status: PlayerStatus): Player {
  return {
    id,
    name,
    level,
    games: 0,
    rankGames: 0,
    wins: 0,
    losses: 0,
    diff: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    partnersCount: 0,
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
    oppEdge: 0,
    avgWait: 0,
    maxConsecutive: 0,
  };
}

/** Keeps a player's identity (id/name/level) but wipes everything scoped to
 * a single session, so a recurring group's roster survives Reset / New
 * Session without re-typing names, while attendance and stats start clean. */
export function resetPlayersForNewSession(players: Player[]): Player[] {
  return players.map((p) => {
    const next: Player = {
      ...p,
      status: "expected",
      games: 0,
      rankGames: 0,
      wins: 0,
      losses: 0,
      diff: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      partnersCount: 0,
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
      oppEdge: 0,
      avgWait: 0,
      maxConsecutive: 0,
    };
    // a pending "after this match" belongs to a match that no longer exists
    delete next.afterMatch;
    // arrival order belongs to the session that just ended
    delete next.idleSince;
    return next;
  });
}

/** Stamps the match's four as free to play again at `now`, then applies each
 * player's "after this match" choice now that their match is saved or
 * cancelled: rest (back from the rotation until they return) or leave. */
export function applyAfterMatch(players: Player[], match: Pick<Match, "t1" | "t2">, now: number): Player[] {
  const ids = [...match.t1, ...match.t2];
  return players.map((stamped) => {
    if (!ids.includes(stamped.id)) return stamped;
    const p: Player = { ...stamped, idleSince: now };
    if (!p.afterMatch) return p;
    const next: Player = p.afterMatch === "rest" ? { ...p, status: "paused", pauseReason: "rest" } : { ...p, status: "left" };
    delete next.afterMatch;
    return next;
  });
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
