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

