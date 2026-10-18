// Date helpers. Events are stored as "YYYY-MM-DD"; month/day semantics drive
// recurring display (birthdays), so every "today" is computed in the user's
// timezone rather than the server's.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymd(y, m, d) {
  return { y, m, d };
}

export function isoOf({ y, m, d }) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseIso(s) {
  const [y, m, d] = s.split('-').map(Number);
  return ymd(y, m, d);
}

export function isValidDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Today in an IANA timezone as {y, m, d}. Falls back to UTC on an unknown zone.
export function todayInTz(tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
  }
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return ymd(get('year'), get('month'), get('day'));
}

export function addDays({ y, m, d }, days) {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysBetween(a, b) {
  const ta = Date.UTC(a.y, a.m - 1, a.d);
  const tb = Date.UTC(b.y, b.m - 1, b.d);
  return Math.round((tb - ta) / 86400000);
}

// Next calendar occurrence of month/day on or after today.
// Feb 29 in a non-leap year → Mar 1 as proxy (same as the Python bot).
export function nextOccurrence(mm, dd, today) {
  let candidate;
  try {
    candidate = isValidDate(today.y, mm, dd) ? ymd(today.y, mm, dd) : ymd(today.y, 3, 1);
  } catch {
    candidate = ymd(today.y, 3, 1);
  }
  let { y, m, d } = candidate;
  if (daysBetween(today, candidate) < 0) {
    try {
      candidate = isValidDate(y + 1, mm, dd) ? ymd(y + 1, mm, dd) : ymd(y + 1, 3, 1);
    } catch {
      candidate = ymd(y + 1, 3, 1);
    }
  }
  return candidate;
}

export function displayOf({ y, m, d }) {
  return `${pad2(d)}.${pad2(m)}.${y}`;
}
