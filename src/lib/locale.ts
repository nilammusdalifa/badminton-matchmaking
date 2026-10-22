/** One place for how the app writes dates, times and weekday names. Session
 * times are the organizers' wall clock in Jakarta no matter where the phone
 * thinks it is, so they are always read and written in this zone. */
export const APP_LOCALE = "en-GB";
export const APP_TIME_ZONE = "Asia/Jakarta";

/** Offset of `timeZone` from UTC at an instant, in ms (positive = east). */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Calendar date of an instant as seen in `timeZone`. */
export function zonedDate(ms: number, timeZone: string = APP_TIME_ZONE): { year: number; month: number; day: number } {
  const shifted = new Date(ms + zoneOffsetMs(ms, timeZone));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** The instant at which the wall clock in `timeZone` reads `minutes` after
 * midnight on the given date. `minutes` may run past 1440 (into the next day). */
export function zonedToEpoch(date: { year: number; month: number; day: number }, minutes: number, timeZone: string = APP_TIME_ZONE): number {
  const naive = Date.UTC(date.year, date.month - 1, date.day, 0, minutes);
  const first = naive - zoneOffsetMs(naive, timeZone);
  return naive - zoneOffsetMs(first, timeZone); // second pass settles a zone that changes offset in between
}

/** "20:35": the time of day, in the app's locale and zone. */
export function formatClock(ms: number): string {
  return new Intl.DateTimeFormat(APP_LOCALE, { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms));
}

/** Waits and match times people can read at a glance: "45 min", "1h 20m". A
 * wait past three hours isn't a wait any more (the player left, or it's a
 * leftover from another day), so it has no figure at all: null. */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes > 180) return null;
  const m = Math.max(0, Math.floor(minutes));
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** "just now", "20 min ago", "1h 20m ago"; the clock time once it's more
 * than three hours back or `useClock` is set (a session that has ended). */
export function formatAgo(ms: number, now: number, useClock = false): string {
  if (useClock) return formatClock(ms);
  const minutes = Math.floor((now - ms) / 60000);
  if (minutes < 1) return "just now";
  const d = formatDuration(minutes);
  return d === null ? formatClock(ms) : `${d} ago`;
}

const ID_WEEKDAYS: Record<string, number> = { senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6, minggu: 0 };

/** A schedule the organizer typed ("Rabu, 19:00–22:00") with any Indonesian
 * weekday name swapped for the app's language, for display only. */
export function localizeSchedule(schedule: string): string {
  return schedule.replace(/\b(senin|selasa|rabu|kamis|jum'?at|sabtu|minggu)\b/gi, (word) => {
    const day = ID_WEEKDAYS[word.toLowerCase()];
    // 2024-01-07 was a Sunday, so day N is the 7th + N.
    return new Intl.DateTimeFormat(APP_LOCALE, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + day)));
  });
}
