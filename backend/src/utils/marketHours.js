export const INDIA_TIME_ZONE = 'Asia/Kolkata';

const OPEN_MINUTES = 9 * 60 + 15;
const CLOSE_MINUTES = 15 * 60 + 30;

export function isIndianMarketOpen(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour'));
  const minute = Number(get('minute'));

  if ([year, month, day, hour, minute].some(Number.isNaN)) return false;
  const istWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (istWeekday === 0 || istWeekday === 6) return false;

  const minutes = hour * 60 + minute;
  return minutes >= OPEN_MINUTES && minutes <= CLOSE_MINUTES;
}
