// Port of bot/parser.py. Parses "date title" with an optional leading HH:MM.
// The original raised ValueError on impossible dates (e.g. 45.45); this port
// returns null for those instead.

import { todayInTz, isoOf, isValidDate, addDays } from './dates.js';

const RELATIVE_DAYS = {
  'сегодня': 0, 'вчера': -1, 'завтра': 1,
  'heute': 0, 'gestern': -1, 'morgen': 1,
  'today': 0, 'yesterday': -1, 'tomorrow': 1,
};

const RE_DOT = /^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s+(.+)$/;
const RE_SLASH = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s+(.+)$/;
const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(.+)$/;
const RE_TIME = /^(\d{1,2}:\d{2})\s+(.+)$/;

function normalizeYear(y) {
  if (y === undefined || y === null) return null;
  let yi = parseInt(y, 10);
  if (yi < 100) yi += yi > 30 ? 1900 : 2000;
  return yi;
}

// Returns 'HH:MM' and the remaining text, or null time.
function extractTime(text) {
  const m = RE_TIME.exec(text);
  if (m) return { time: m[1], rest: m[2] };
  return { time: null, rest: text };
}

function makeDate(y, m, d) {
  if (!isValidDate(y, m, d)) return null;
  return { y, m, d };
}

// text — user input; today — {y,m,d} in the user's timezone (lib/dates.js).
// Returns { date: 'YYYY-MM-DD', time: 'HH:MM'|null, text, yearExplicit } or null.
// yearExplicit is true when the user actually wrote a year in the date.
export function parseMessage(text, today = todayInTz('UTC')) {
  text = text.trim();
  const lower = text.toLowerCase();

  for (const [word, delta] of Object.entries(RELATIVE_DAYS)) {
    if (lower.startsWith(word)) {
      const rest = text.slice(word.length).trim();
      if (!rest) return null;
      const d = addDays(today, delta);
      return { date: isoOf(d), time: null, text: rest, yearExplicit: false };
    }
  }

  let m = RE_DOT.exec(text);
  if (m) {
    const year = normalizeYear(m[3]) ?? today.y;
    const d = makeDate(year, parseInt(m[2], 10), parseInt(m[1], 10));
    if (!d) return null;
    const { time, rest } = extractTime(m[4]);
    return { date: isoOf(d), time, text: rest, yearExplicit: m[3] !== undefined };
  }

  m = RE_SLASH.exec(text);
  if (m) {
    const year = normalizeYear(m[3]) ?? today.y;
    const d = makeDate(year, parseInt(m[2], 10), parseInt(m[1], 10));
    if (!d) return null;
    const { time, rest } = extractTime(m[4]);
    return { date: isoOf(d), time, text: rest, yearExplicit: m[3] !== undefined };
  }

  m = RE_ISO.exec(text);
  if (m) {
    const d = makeDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
    if (!d) return null;
    const { time, rest } = extractTime(m[4]);
    return { date: isoOf(d), time, text: rest, yearExplicit: true };
  }

  return null;
}
