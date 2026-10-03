export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD.MM.YYYY", "D MMM YYYY"] as const;
export const TIME_FORMATS = ["24h", "12h"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export type TimeFormat = (typeof TIME_FORMATS)[number];

export interface DateTimeSettings {
  timezone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

export const DEFAULT_DATETIME: DateTimeSettings = { timezone: "UTC", dateFormat: "DD/MM/YYYY", timeFormat: "24h" };

export function isTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Same output in the browser and on the server: the platform's timezone and formats, never the viewer's locale
export function formatDateTime(value: Date | string | number, s: DateTimeSettings, withTime = true) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: s.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map(x => [x.type, x.value]),
  );
  const mon = new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone, month: "short" }).format(d);
  const date = {
    "DD/MM/YYYY": `${p.day}/${p.month}/${p.year}`,
    "MM/DD/YYYY": `${p.month}/${p.day}/${p.year}`,
    "YYYY-MM-DD": `${p.year}-${p.month}-${p.day}`,
    "DD.MM.YYYY": `${p.day}.${p.month}.${p.year}`,
    "D MMM YYYY": `${Number(p.day)} ${mon} ${p.year}`,
  }[s.dateFormat];
  if (!withTime) return date;
  const h = Number(p.hour);
  const time = s.timeFormat === "12h" ? `${h % 12 || 12}:${p.minute} ${h < 12 ? "AM" : "PM"}` : `${p.hour}:${p.minute}`;
  return `${date} ${time}`;
}
