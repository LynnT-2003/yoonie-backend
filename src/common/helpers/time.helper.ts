/**
 * Business dates are 'YYYY-MM-DD' strings in the BRANCH timezone, stored next to real UTC Dates.
 * Never derive a business date from a UTC Date at query time, a 01:00 BKK arrival is "yesterday" in UTC.
 * Bangkok has no DST so a fixed offset is safe here. For multi-timezone chains swap these for luxon + branch.timezone.
 */
const BKK_OFFSET_MIN = 7 * 60;

export const toBusinessDate = (d: Date, offsetMin = BKK_OFFSET_MIN): string =>
  new Date(d.getTime() + offsetMin * 60_000).toISOString().slice(0, 10);

export const addDays = (date: string, n: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const zonedAt = (
  date: string,
  timeHhmm: string,
  offset = "+07:00",
): Date => new Date(`${date}T${timeHhmm}:00${offset}`);

export const minutesOfDay = (d: Date, offsetMin = BKK_OFFSET_MIN): number => {
  const m = Math.floor(d.getTime() / 60_000) + offsetMin;
  return ((m % 1440) + 1440) % 1440;
};

export const hhmm = (d: Date, offsetMin = BKK_OFFSET_MIN): string => {
  const m = minutesOfDay(d, offsetMin);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export const eachNight = (checkIn: string, checkOut: string): string[] => {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
};

export const toBranchBusinessDate = (d: Date, tz = "Asia/Bangkok"): string => {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(d);
  } catch {
    return toBusinessDate(d);
  }
};
