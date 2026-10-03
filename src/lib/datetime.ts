import { getSetting, setSetting } from "./encryption";
import { DATE_FORMATS, TIME_FORMATS, DEFAULT_DATETIME, isTimeZone, type DateTimeSettings, type DateFormat, type TimeFormat } from "./datetime-shared";

export async function getDateTimeSettings(): Promise<DateTimeSettings> {
  const [timezone, dateFormat, timeFormat] = await Promise.all([
    getSetting("datetime_timezone"),
    getSetting("datetime_date_format"),
    getSetting("datetime_time_format"),
  ]);
  return {
    timezone: timezone && isTimeZone(timezone) ? timezone : DEFAULT_DATETIME.timezone,
    dateFormat: DATE_FORMATS.includes(dateFormat as DateFormat) ? (dateFormat as DateFormat) : DEFAULT_DATETIME.dateFormat,
    timeFormat: TIME_FORMATS.includes(timeFormat as TimeFormat) ? (timeFormat as TimeFormat) : DEFAULT_DATETIME.timeFormat,
  };
}

export async function setDateTimeSettings(s: DateTimeSettings) {
  await Promise.all([
    setSetting("datetime_timezone", s.timezone),
    setSetting("datetime_date_format", s.dateFormat),
    setSetting("datetime_time_format", s.timeFormat),
  ]);
}
