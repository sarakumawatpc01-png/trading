export const DEFAULT_EVENT_CALENDAR = [
  {
    id: 'rbi-policy-apr-2026',
    title: 'RBI Monetary Policy',
    date: '2026-04-08',
    symbols: ['NIFTY50', 'BANKNIFTY'],
    impact: 'HIGH'
  },
  {
    id: 'infy-results-apr-2026',
    title: 'INFY Earnings',
    date: '2026-04-17',
    symbols: ['INFY.NS'],
    impact: 'HIGH'
  },
  {
    id: 'reliance-results-apr-2026',
    title: 'RELIANCE Earnings',
    date: '2026-04-18',
    symbols: ['RELIANCE.NS'],
    impact: 'HIGH'
  }
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeCalendarEvent(event = {}) {
  const symbols = Array.isArray(event.symbols)
    ? event.symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean)
    : [];
  return {
    id: String(event.id || '').trim(),
    title: String(event.title || '').trim() || 'Market Event',
    date: String(event.date || '').trim(),
    symbols,
    impact: String(event.impact || 'MEDIUM').toUpperCase()
  };
}

export function getEventDayTag({ symbol, timestampMs = Date.now(), calendar = [], leadDays = 1, lagDays = 1 }) {
  if (!symbol || !Array.isArray(calendar) || !calendar.length) return { eventDay: 'NORMAL', event: null };
  const current = new Date(timestampMs);
  current.setHours(0, 0, 0, 0);
  const normalizedSymbol = String(symbol).toUpperCase();
  for (const rawEvent of calendar) {
    const event = normalizeCalendarEvent(rawEvent);
    if (!event.date) continue;
    if (event.symbols.length && !event.symbols.includes(normalizedSymbol) && !event.symbols.includes('NIFTY50')) continue;
    const eventDate = new Date(`${event.date}T00:00:00Z`);
    if (Number.isNaN(eventDate.getTime())) continue;
    const dayDiff = Math.round((current.getTime() - eventDate.getTime()) / DAY_MS);
    if (dayDiff === 0) return { eventDay: 'EVENT', event };
    if (dayDiff < 0 && Math.abs(dayDiff) <= leadDays) return { eventDay: 'PRE_EVENT', event };
    if (dayDiff > 0 && dayDiff <= lagDays) return { eventDay: 'POST_EVENT', event };
  }
  return { eventDay: 'NORMAL', event: null };
}
