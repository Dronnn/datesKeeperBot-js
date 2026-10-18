// Formatting of event lines for /list, /upcoming and /info
// (port of _format_event/_days_label/_format_info from the Python handlers).

import { parseIso, nextOccurrence, displayOf, pad2, daysBetween } from './dates.js';
import { t } from './i18n.js';

function daysLabel(days, lang) {
  if (days === 0) return t(lang, 'today_mark');
  if (days === 1) return t(lang, 'tomorrow_mark');
  return t(lang, 'in_days', { days });
}

// One list line. withId prefixes the event id so /edit and /delete can use it.
export function formatEventLine(ev, lang, today, withId = false) {
  const emoji = ev.isBirthday ? '🎂' : '📅';
  const { y, m, d } = parseIso(ev.eventDate);
  const next = nextOccurrence(m, d, today);

  let extra = '';
  if (ev.isBirthday && ev.birthYear) {
    extra = ` (${t(lang, 'years_count', { years: next.y - ev.birthYear })})`;
  } else if (!ev.isBirthday && y > 1900 && y < next.y) {
    extra = ` (${t(lang, 'years_count', { years: next.y - y })})`;
  }

  const idPrefix = withId ? `${ev.id}. ` : '';
  return `${idPrefix}${emoji} ${ev.title} — ${displayOf(next)}${extra}`;
}

// /upcoming line: the list line with an "in N days" label folded in.
export function formatUpcomingLine(ev, lang, today) {
  const { m, d } = parseIso(ev.eventDate);
  const next = nextOccurrence(m, d, today);
  const until = daysBetween(today, next);
  let base = formatEventLine(ev, lang, today);

  const daysStr = daysLabel(until, lang);
  if (base.endsWith(')')) {
    const open = base.lastIndexOf('(');
    base = `${base.slice(0, open)}(${daysStr}, ${base.slice(open + 1)}`;
  } else {
    base = `${base} (${daysStr})`;
  }
  return base;
}

// Full /info text. Reminders are gone, so it's type/date/age/next occurrence.
export function formatEventInfo(ev, lang, today) {
  const { y, m, d } = parseIso(ev.eventDate);
  const stored = `${pad2(d)}.${pad2(m)}.${y}`;
  const next = nextOccurrence(m, d, today);

  const lines = [t(lang, 'info_header', { title: ev.title }), ''];
  lines.push(ev.isBirthday ? t(lang, 'info_type_birthday') : t(lang, 'info_type_event'));
  lines.push(t(lang, 'info_date', { date: stored }));
  if (ev.isBirthday && ev.birthYear) {
    lines.push(t(lang, 'info_age', { age: next.y - ev.birthYear }));
  }
  lines.push(t(lang, 'info_next', {
    date: displayOf(next),
    in_days: daysLabel(daysBetween(today, next), lang),
  }));
  return lines.join('\n');
}
