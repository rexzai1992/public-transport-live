import type { SpeedUnit } from "./contract.js";

/** Same wall-clock shape used by the existing schedule engine. */
export type ServiceClock = {
  /** YYYYMMDD, matching the calendar.txt date format. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Minutes since local midnight. */
  minutes: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short"
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Wall-clock date/weekday/minutes in an IANA zone, independent of server TZ. */
export function serviceClock(timeZone: string, now: Date = new Date()): ServiceClock {
  const parts = formatterFor(timeZone).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${get("year")}${get("month")}${get("day")}`,
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
    minutes: Number(get("hour")) * 60 + Number(get("minute"))
  };
}

/** Converts a provider-published speed to the downstream canonical unit, m/s. */
export function speedToMps(
  value: number | null | undefined,
  unit: SpeedUnit
): number | undefined {
  // A negative speed is a sensor fault, not a direction.
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return unit === "kmh" ? value / 3.6 : value + 0;
}

/* Departures are stored as minutes after local midnight, so feeds can only be
   planned together while their wall clocks agree. Splits `ids` into those on
   the first id's clock and those that are not (e.g. a UTC+9 Japan feed asked
   for alongside UTC+8 Malaysia ones). Comparing clocks rather than zone names
   keeps Asia/Kuala_Lumpur and Asia/Singapore together. */
export function partitionByClock<T>(
  ids: readonly T[],
  timeZoneOf: (id: T) => string,
  now: Date = new Date()
): { timeZone: string; kept: T[]; leftOut: T[] } {
  if (!ids.length) throw new Error("partitionByClock: no feeds given");
  const timeZone = timeZoneOf(ids[0]);
  const home = serviceClock(timeZone, now);
  const kept: T[] = [];
  const leftOut: T[] = [];
  for (const id of ids) {
    const other = serviceClock(timeZoneOf(id), now);
    (other.date === home.date && other.minutes === home.minutes ? kept : leftOut).push(id);
  }
  return { timeZone, kept, leftOut };
}
