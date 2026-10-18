// Routes every incoming message: slash commands (with args, no dialogs) and
// free-text "date title" input. All flows are stateless — every update
// carries everything the bot needs.

import { api } from 'sdk';
import { parseMessage } from '../lib/parser.js';
import { t, DEFAULT_LANGUAGE, DEFAULT_TIMEZONE } from '../lib/i18n.js';
import {
  getUser, upsertUser, updateUserTimezone, createEvent, listEvents,
  searchEvents, getEvent, updateEvent, getUpcomingEvents,
} from '../lib/events.js';
import { todayInTz, pad2, isValidDate } from '../lib/dates.js';
import { formatEventLine, formatUpcomingLine, formatEventInfo } from '../lib/format.js';

const PAGE_SIZE = 10;

const LANGUAGE_OPTIONS = [
  ['🇷🇺 Русский', 'ru'],
  ['🇩🇪 Deutsch', 'de'],
  ['🇬🇧 English', 'en'],
];

const TIMEZONE_OPTIONS = [
  ['🇷🇺 Moscow', 'Europe/Moscow'],
  ['🇩🇪 Berlin', 'Europe/Berlin'],
  ['🇬🇧 London', 'Europe/London'],
  ['🇺🇸 New York', 'America/New_York'],
  ['🇺🇸 Los Angeles', 'America/Los_Angeles'],
  ['🇯🇵 Tokyo', 'Asia/Tokyo'],
  ['🇨🇳 Shanghai', 'Asia/Shanghai'],
];

export function languageKeyboard() {
  return {
    inline_keyboard: LANGUAGE_OPTIONS.map(([label, code]) => ([
      { text: label, callback_data: `lang:${code}` },
    ])),
  };
}

function timezoneKeyboard(lang) {
  return {
    inline_keyboard: [
      ...TIMEZONE_OPTIONS.map(([label, tz]) => ([
        { text: label, callback_data: `tz:${tz}:${lang}` },
      ])),
      [{ text: t(lang, 'btn_manual_tz'), callback_data: `tz_manual:${lang}` }],
    ],
  };
}

function eventPickKeyboard(events, prefix) {
  return {
    inline_keyboard: events.map((ev) => ([
      { text: `${ev.isBirthday ? '🎂' : '📅'} ${ev.title}`, callback_data: `${prefix}:${ev.id}` },
    ])),
  };
}

function isGroup(chat) {
  return chat.type === 'group' || chat.type === 'supergroup';
}

// The list these commands work on: the user in private, the chat in groups.
function ownerIdOf(message) {
  return message.chat.id;
}

function stripQuotes(s) {
  const trimmed = s.trim();
  if (trimmed.length >= 2 &&
      ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
       (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
       (trimmed.startsWith('«') && trimmed.endsWith('»')))) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

async function reply(message, text, replyMarkup) {
  await api.sendMessage({
    chat_id: message.chat.id,
    text,
    reply_markup: replyMarkup,
  });
}

function isoToDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

// ---------------------------------------------------------------------------
// Commands. Every handler has the same signature:
// (message, args, lang, ownerId, userId, today)
// ---------------------------------------------------------------------------

async function cmdStart(message, args, lang, ownerId, userId, today) {
  if (isGroup(message.chat)) {
    await reply(message, t(lang, 'group_welcome'));
    return;
  }
  // New user: the reply language is not known yet, show the default.
  await reply(message, t(DEFAULT_LANGUAGE, 'welcome'), languageKeyboard());
}

async function cmdHelp(message, args, lang) {
  await reply(message, t(lang, 'help_text'));
}

async function cmdEvent(message, args, lang, ownerId, userId, today) {
  if (!args.trim()) {
    await reply(message, t(lang, 'event_usage'));
    return;
  }
  const parsed = parseMessage(args, today);
  if (!parsed) {
    await reply(message, t(lang, 'date_parse_error'));
    return;
  }
  const title = stripQuotes(parsed.text);
  await createEvent({
    ownerId,
    addedBy: userId,
    title,
    eventDate: parsed.date,
    eventTime: parsed.time,
    birthYear: null,
    isBirthday: false,
  });
  const dateStr = parsed.time ? `${isoToDisplay(parsed.date)} ${parsed.time}` : isoToDisplay(parsed.date);
  await reply(message, t(lang, 'saved_event', { title, date: dateStr }));
}

async function cmdBirthday(message, args, lang, ownerId, userId, today) {
  if (!args.trim()) {
    await reply(message, t(lang, 'birthday_usage'));
    return;
  }
  const parsed = parseMessage(args, today);
  if (!parsed) {
    await reply(message, t(lang, 'date_parse_error'));
    return;
  }
  const birthYear = parsed.yearExplicit && parsed.date.slice(0, 4) < String(today.y)
    ? Number(parsed.date.slice(0, 4))
    : null;
  const title = stripQuotes(parsed.text);
  await createEvent({
    ownerId,
    addedBy: userId,
    title,
    eventDate: parsed.date,
    eventTime: null,
    birthYear,
    isBirthday: true,
  });
  const [, m, d] = parsed.date.split('-');
  const dateStr = birthYear ? `${d}.${m}.${birthYear}` : `${d}.${m}`;
  await reply(message, t(lang, 'saved_birthday', { name: title, date: dateStr }));
}

// 'title DD.MM[.YYYY]' — the date is the last token.
function parseBatchLine(line, today) {
  line = line.trim();
  if (!line) return null;
  const tokens = line.split(/\s+/);
  if (tokens.length < 2) return null;

  const dateToken = tokens[tokens.length - 1];
  const m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(dateToken);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  let year = null;
  if (m[3] !== undefined) {
    year = parseInt(m[3], 10);
    if (year < 100) year += year > 30 ? 1900 : 2000;
  }

  const checkYear = year ?? today.y;
  if (!isValidDate(checkYear, month, day)) return null;

  const title = tokens.slice(0, -1).join(' ');
  if (!title) return null;

  return { title, day, month, year, storeYear: year ?? today.y };
}

async function cmdBatch(message, args, lang, ownerId, userId, today) {
  const dataLines = message.text.split(/\r?\n/).slice(1).filter((l) => l.trim());
  if (dataLines.length === 0) {
    await reply(message, t(lang, 'batch_usage'));
    return;
  }

  const saved = [];
  const failed = [];

  for (const rawLine of dataLines) {
    const parsed = parseBatchLine(rawLine, today);
    if (!parsed) {
      failed.push(rawLine.trim());
      continue;
    }
    try {
      await createEvent({
        ownerId,
        addedBy: userId,
        title: parsed.title,
        eventDate: `${parsed.storeYear}-${pad2(parsed.month)}-${pad2(parsed.day)}`,
        eventTime: null,
        birthYear: parsed.year,
        isBirthday: parsed.year !== null,
      });
      saved.push(parsed);
    } catch {
      failed.push(rawLine.trim());
    }
  }

  if (saved.length === 0 && failed.length === 0) {
    await reply(message, t(lang, 'batch_usage'));
    return;
  }

  const out = [];
  if (saved.length > 0) {
    out.push(t(lang, 'batch_added_header', { count: saved.length }));
    for (const p of saved) {
      const dateStr = `${pad2(p.day)}.${pad2(p.month)}`;
      const label = p.year !== null
        ? `${p.title} — ${dateStr} (${p.year})`
        : `${p.title} — ${dateStr}`;
      out.push(`${p.year !== null ? '🎂' : '📅'} ${label}`);
    }
  }
  if (failed.length > 0) {
    out.push('');
    out.push(t(lang, 'batch_failed_header', { count: failed.length }));
    for (const f of failed) out.push(`  • ${f}`);
  }
  await reply(message, out.join('\n'));
}

async function cmdList(message, args, lang, ownerId, userId, today) {
  await sendListPage(message.chat.id, lang, ownerId, today, 0);
}

async function sendListPage(chatId, lang, ownerId, today, page) {
  const rows = await listEvents(ownerId, PAGE_SIZE + 1, page * PAGE_SIZE);

  if (rows.length === 0) {
    await api.sendMessage({ chat_id: chatId, text: t(lang, 'list_empty') });
    return;
  }

  const hasNext = rows.length > PAGE_SIZE;
  const events = rows.slice(0, PAGE_SIZE);

  const lines = [t(lang, 'list_header', { count: events.length })];
  for (const ev of events) lines.push(formatEventLine(ev, lang, today, true));

  const keyboard = [];
  const navRow = [];
  if (page > 0) navRow.push({ text: t(lang, 'btn_prev'), callback_data: `list:${page - 1}` });
  if (hasNext) navRow.push({ text: t(lang, 'btn_next'), callback_data: `list:${page + 1}` });
  if (navRow.length > 0) keyboard.push(navRow);

  await api.sendMessage({
    chat_id: chatId,
    text: lines.join('\n'),
    reply_markup: keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined,
  });
}

async function cmdUpcoming(message, args, lang, ownerId, userId, today) {
  const mmddList = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    mmddList.push(`${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
  }

  const events = await getUpcomingEvents(ownerId, mmddList);

  if (events.length === 0) {
    await reply(message, t(lang, 'upcoming_empty'));
    return;
  }

  const lines = [t(lang, 'upcoming_header')];
  for (const ev of events) lines.push(formatUpcomingLine(ev, lang, today));
  await reply(message, lines.join('\n'));
}

async function cmdFind(message, args, lang, ownerId, userId, today) {
  const query = args.trim().toLowerCase();
  if (!query) {
    await reply(message, t(lang, 'find_usage'));
    return;
  }
  const matched = await searchEvents(ownerId, query);

  if (matched.length === 0) {
    await reply(message, t(lang, 'search_no_results'));
    return;
  }
  const lines = [t(lang, 'list_header', { count: matched.length })];
  for (const ev of matched) lines.push(formatEventLine(ev, lang, today, true));
  await reply(message, lines.join('\n'));
}

async function cmdInfo(message, args, lang, ownerId, userId, today) {
  const id = parseInt(args.trim(), 10);
  if (Number.isNaN(id)) {
    const events = await listEvents(ownerId, PAGE_SIZE);
    if (events.length === 0) {
      await reply(message, t(lang, 'list_empty'));
      return;
    }
    await reply(message, t(lang, 'info_pick_event'), eventPickKeyboard(events, 'info'));
    return;
  }

  const ev = await getEvent(id);
  if (!ev || ev.ownerId !== ownerId) {
    await reply(message, t(lang, 'event_not_found'));
    return;
  }
  await reply(message, formatEventInfo(ev, lang, today));
}

async function cmdDelete(message, args, lang, ownerId) {
  const id = parseInt(args.trim(), 10);
  if (Number.isNaN(id)) {
    const events = await listEvents(ownerId, PAGE_SIZE);
    if (events.length === 0) {
      await reply(message, t(lang, 'list_empty'));
      return;
    }
    await reply(message, t(lang, 'info_pick_event'), eventPickKeyboard(events, 'del'));
    return;
  }

  const ev = await getEvent(id);
  if (!ev || ev.ownerId !== ownerId) {
    await reply(message, t(lang, 'event_not_found'));
    return;
  }
  await reply(message, t(lang, 'confirm_delete', { title: ev.title }), {
    inline_keyboard: [[
      { text: t(lang, 'btn_yes'), callback_data: `del_yes:${ev.id}` },
      { text: t(lang, 'btn_no'), callback_data: 'del_no' },
    ]],
  });
}

const EDIT_FIELDS = new Set(['title', 'date']);

async function cmdEdit(message, args, lang, ownerId, userId, today) {
  const trimmed = args.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3 || !EDIT_FIELDS.has(parts[1])) {
    await reply(message, t(lang, 'edit_usage'));
    return;
  }
  const id = parseInt(parts[0], 10);
  const field = parts[1];
  const value = trimmed.slice(trimmed.indexOf(parts[1]) + parts[1].length).trim();
  if (Number.isNaN(id) || !value) {
    await reply(message, t(lang, 'edit_usage'));
    return;
  }

  const ev = await getEvent(id);
  if (!ev || ev.ownerId !== ownerId) {
    await reply(message, t(lang, 'edit_not_found'));
    return;
  }

  if (field === 'title') {
    await updateEvent(id, ownerId, { title: stripQuotes(value) });
  } else {
    const parsed = parseMessage(`${value} placeholder`, today);
    if (!parsed) {
      await reply(message, t(lang, 'date_parse_error'));
      return;
    }
    await updateEvent(id, ownerId, { eventDate: parsed.date, eventTime: parsed.time });
  }
  await reply(message, t(lang, 'updated'));
}

async function cmdLanguage(message, args, lang) {
  await reply(message, t(lang, 'ask_language'), languageKeyboard());
}

function parseOffset(text) {
  const value = parseInt(text.trim(), 10);
  if (Number.isNaN(value) || value < -12 || value > 14) return null;
  return value;
}

function offsetToIana(offset) {
  // IANA inverts the sign: UTC+4 → Etc/GMT-4.
  return `Etc/GMT${-offset >= 0 ? '+' : ''}${-offset}`;
}

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

async function cmdTimezone(message, args, lang, ownerId, userId) {
  const arg = args.trim();
  if (!arg) {
    await reply(message, t(lang, 'ask_timezone'), timezoneKeyboard(lang));
    return;
  }

  let tz = null;
  let offset = null;
  const parsedOffset = parseOffset(arg);
  if (parsedOffset !== null) {
    offset = parsedOffset;
    tz = offsetToIana(offset);
  } else if (isValidTimezone(arg)) {
    tz = arg;
  } else {
    await reply(message, t(lang, 'tz_offset_error'));
    return;
  }

  const user = await getUser(userId);
  if (user) {
    await updateUserTimezone(userId, tz);
  } else {
    await upsertUser(userId, message.from.username, message.from.first_name, lang, tz);
  }
  const text = offset !== null
    ? t(lang, 'tz_set_offset', { offset: `${offset >= 0 ? '+' : ''}${offset}` })
    : t(lang, 'timezone_set', { timezone: tz });
  await reply(message, text);
}

// ---------------------------------------------------------------------------
// Free text: "date title" → saved directly.
// Full explicit past year → birthday, otherwise a regular event.
// ---------------------------------------------------------------------------

async function handleFreeText(message, lang, ownerId, userId, today) {
  const parsed = parseMessage(message.text, today);
  if (!parsed) {
    // Don't spam the group chat with error replies on random messages.
    if (message.chat.type === 'private') {
      await reply(message, t(lang, 'date_parse_error'));
    }
    return;
  }

  const isBirthday = parsed.yearExplicit && parsed.date.slice(0, 4) < String(today.y);
  const title = stripQuotes(parsed.text);
  await createEvent({
    ownerId,
    addedBy: userId,
    title,
    eventDate: parsed.date,
    eventTime: parsed.time,
    birthYear: isBirthday ? Number(parsed.date.slice(0, 4)) : null,
    isBirthday,
  });

  const dateStr = parsed.time
    ? `${isoToDisplay(parsed.date)} ${parsed.time}`
    : isoToDisplay(parsed.date);
  const text = isBirthday
    ? t(lang, 'saved_birthday', { name: title, date: dateStr })
    : t(lang, 'saved_event', { title, date: dateStr });
  await reply(message, text);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const COMMANDS = {
  start: cmdStart,
  help: cmdHelp,
  event: cmdEvent,
  birthday: cmdBirthday,
  batch: cmdBatch,
  list: cmdList,
  upcoming: cmdUpcoming,
  find: cmdFind,
  info: cmdInfo,
  delete: cmdDelete,
  edit: cmdEdit,
  language: cmdLanguage,
  timezone: cmdTimezone,
};

export default async function (message) {
  if (!message.text) return; // photos/stickers/etc. are out of scope

  const userId = message.from.id;
  const ownerId = ownerIdOf(message);
  const isPrivate = message.chat.type === 'private';

  const dbUser = await getUser(userId);
  const lang = dbUser?.language ?? DEFAULT_LANGUAGE;
  const tz = dbUser?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInTz(tz);

  if (message.text.startsWith('/')) {
    const m = /^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(message.text);
    if (!m) return;
    const [, command, args] = m;

    const handler = COMMANDS[command];
    if (handler) {
      await handler(message, args, lang, ownerId, userId, today);
    } else if (isPrivate) {
      await reply(message, t(lang, 'unknown_command'));
    }
    return;
  }

  await handleFreeText(message, lang, ownerId, userId, today);
}
