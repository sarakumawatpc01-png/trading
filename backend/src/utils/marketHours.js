export const INDIA_TIME_ZONE = 'Asia/Kolkata';

const OPEN_MINUTES = 9 * 60 + 15;
const CLOSE_MINUTES = 15 * 60 + 30;
const WEEKEND = new Set(['Sat', 'Sun']);

export function isIndianMarketOpen(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INDIA_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = get('weekday');
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  if (!weekday || Number.isNaN(hour) || Number.isNaN(minute)) return false;
  if (WEEKEND.has(weekday)) return false;

  const minutes = hour * 60 + minute;
  return minutes >= OPEN_MINUTES && minutes <= CLOSE_MINUTES;
}
