// Time utilities for scheduling constraints

export function startOfTodayMs(tz: string): number {
  const d = new Date();
  // midnight in tz using Intl — robust without extra deps
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  const day = Number(parts.find((p) => p.type === "day")!.value);
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0)).getTime();
}

export function isWeekendISO(iso: string, tz: string): boolean {
  // get weekday in target tz (0=Sun .. 6=Sat)
  const w = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(new Date(iso));
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const idx = map[w];
  return idx === 0 || idx === 6;
}

export function isSameDayISO(isoA: string, isoB: string, tz: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(isoA)) === fmt.format(new Date(isoB));
}

export function isTodayISO(iso: string, tz: string): boolean {
  const nowIso = new Date().toISOString();
  return isSameDayISO(iso, nowIso, tz);
}

export function isDisabledDate(iso: string, tz: string): boolean {
  return isTodayISO(iso, tz) || isWeekendISO(iso, tz);
}

// NEW: epoch helpers – no timezone conversions needed for lead-time logic
export const nowEpoch = () => Date.now();
export const addMinutesEpoch = (epoch: number, minutes: number) =>
  epoch + minutes * 60_000;
export const isBeforeEpoch = (aEpoch: number, bEpoch: number) =>
  aEpoch < bEpoch;

/**
 * Get current time as ISO string in the specified timezone
 */
export function nowInTzISO(tz: string): string {
  const now = new Date();
  // Format the current time in the target timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const hour = parts.find((p) => p.type === "hour")!.value;
  const minute = parts.find((p) => p.type === "minute")!.value;
  const second = parts.find((p) => p.type === "second")!.value;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

/**
 * Add minutes to an ISO string in the specified timezone
 */
export function addMinutesISO(
  iso: string,
  minutes: number,
  tz: string
): string {
  const date = new Date(iso);
  const newDate = new Date(date.getTime() + minutes * 60 * 1000);

  // Format the new time in the target timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(newDate);

  const year = parts.find((p) => p.type === "year")!.value;
  const month = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  const hour = parts.find((p) => p.type === "hour")!.value;
  const minute = parts.find((p) => p.type === "minute")!.value;
  const second = parts.find((p) => p.type === "second")!.value;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`;
}

/**
 * Check if time A is before time B in the specified timezone
 */
export function isBeforeISO(aIso: string, bIso: string, tz: string): boolean {
  const dateA = new Date(aIso);
  const dateB = new Date(bIso);

  // Compare the dates directly - they should already be in UTC
  return dateA.getTime() < dateB.getTime();
}

// Returns a human label for a dateKey "YYYY-MM-DD" in a given tz.
// We use UTC noon to avoid DST/day-boundary shifts.
export function labelFromDateKey(
  dateKey: string,
  tz: string,
  locale = "en-US"
) {
  try {
    const [y, m, d] = dateKey.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return new Intl.DateTimeFormat(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: tz,
    }).format(dt);
  } catch {
    return dateKey;
  }
}

// Returns a time label for a slot ISO in a tz
export function labelFromSlotISO(iso: string, tz: string, locale = "en-US") {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(dt);
}
