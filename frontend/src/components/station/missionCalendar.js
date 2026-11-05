export const MISSION_TOTAL_DAYS = 5;
export const MISSION_START = Date.UTC(2026, 9, 19);

const romeDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function missionDayOf(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(romeDate.formatToParts(date).map(({ type, value: part }) => [type, part]));
  const day = (Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - MISSION_START) / 86400000 + 1;
  return Number.isInteger(day) && day >= 1 && day <= MISSION_TOTAL_DAYS ? day : null;
}

export function currentMissionDay(now = new Date()) {
  return missionDayOf(now) || 1;
}

export function openedMissionDays(now = new Date()) {
  return Array.from({ length: currentMissionDay(now) }, (_, index) => index + 1);
}

export function missionClock(mission, now = new Date()) {
  const day = Number(mission?.current_day) || currentMissionDay(now);
  const total = Number(mission?.total_days) || MISSION_TOTAL_DAYS;
  return { day, total, label: `GIORNO ${day} DI ${total}` };
}
