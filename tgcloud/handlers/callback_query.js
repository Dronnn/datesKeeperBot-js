// Inline keyboard callbacks: language, timezone, delete confirmation,
// list pagination, info pick. All stateless — ids and languages travel
// inside callback_data.

import { api, BotApiError } from 'sdk';
import { t, DEFAULT_LANGUAGE, DEFAULT_TIMEZONE } from '../lib/i18n.js';
import {
  getUser, upsertUser, updateUserLanguage, updateUserTimezone,
  getEvent, deleteEvent, listEvents,
} from '../lib/events.js';
import { todayInTz } from '../lib/dates.js';
import { formatEventInfo } from '../lib/format.js';

function timezoneKeyboard(lang) {
  const TIMEZONE_OPTIONS = [
    ['🇷🇺 Moscow', 'Europe/Moscow'],
    ['🇩🇪 Berlin', 'Europe/Berlin'],
    ['🇬🇧 London', 'Europe/London'],
    ['🇺🇸 New York', 'America/New_York'],
    ['🇺🇸 Los Angeles', 'America/Los_Angeles'],
    ['🇯🇵 Tokyo', 'Asia/Tokyo'],
    ['🇨🇳 Shanghai', 'Asia/Shanghai'],
  ];
  return {
    inline_keyboard: [
      ...TIMEZONE_OPTIONS.map(([label, tz]) => ([
        { text: label, callback_data: `tz:${tz}:${lang}` },
      ])),
      [{ text: t(lang, 'btn_manual_tz'), callback_data: `tz_manual:${lang}` }],
    ],
  };
}

async function answer(query) {
  try {
    await api.answerCallbackQuery({ callback_query_id: query.id });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
    // answering an already-answered query is not fatal
  }
}

// lang:<code> — from /start onboarding or /language.
async function onLanguage(query) {
  await answer(query);
  const lang = query.data.split(':', 2)[1];
  const user = query.from;
  const existing = await getUser(user.id);

  if (existing) {
    await updateUserLanguage(user.id, lang);
    await api.editMessageText({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      text: t(lang, 'language_set'),
    });
    return;
  }

  // First contact (onboarding): remember the language, then ask for the timezone.
  await upsertUser(user.id, user.username, user.first_name, lang, DEFAULT_TIMEZONE);
  await api.editMessageText({
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: t(lang, 'ask_timezone'),
    reply_markup: timezoneKeyboard(lang),
  });
}

// tz:<timezone>:<lang> — timezone picked from the keyboard.
async function onTimezone(query) {
  await answer(query);
  const [tz, lang] = query.data.split(':', 3).slice(1);
  const user = query.from;
  const existing = await getUser(user.id);

  if (existing) {
    await updateUserTimezone(user.id, tz);
  } else {
    await upsertUser(user.id, user.username, user.first_name, lang ?? DEFAULT_LANGUAGE, tz);
  }
  await api.editMessageText({
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: t(lang, 'timezone_set', { timezone: tz }),
  });
}

// tz_manual:<lang> — "enter manually" → explain the /timezone <offset> command.
async function onTimezoneManual(query) {
  await answer(query);
  const lang = query.data.split(':', 2)[1];
  await api.editMessageText({
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: t(lang, 'timezone_manual_hint'),
  });
}

// list:<page> — list pagination.
async function onListPage(query) {
  await answer(query);
  const page = parseInt(query.data.split(':', 2)[1], 10) || 0;

  const userId = query.from.id;
  const dbUser = await getUser(userId);
  const lang = dbUser?.language ?? DEFAULT_LANGUAGE;
  const tz = dbUser?.timezone ?? DEFAULT_TIMEZONE;
  const today = todayInTz(tz);
  // In groups the pagination buttons work on the chat's shared list.
  const ownerId = query.message.chat.id;

  const PAGE_SIZE = 10;
  const rows = await listEvents(ownerId, PAGE_SIZE + 1, page * PAGE_SIZE);

  if (rows.length === 0) {
    await editText(query, t(lang, 'list_empty'));
    return;
  }

  const hasNext = rows.length > PAGE_SIZE;
  const events = rows.slice(0, PAGE_SIZE);
  const lines = [t(lang, 'list_header', { count: events.length })];
  for (const ev of events) lines.push(formatEventLine(ev, lang, today, true));

  const navRow = [];
  if (page > 0) navRow.push({ text: t(lang, 'btn_prev'), callback_data: `list:${page - 1}` });
  if (hasNext) navRow.push({ text: t(lang, 'btn_next'), callback_data: `list:${page + 1}` });

  await api.editMessageText({
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: lines.join('\n'),
    reply_markup: navRow.length > 0 ? { inline_keyboard: [navRow] } : undefined,
  });
}

// info:<id> — event picked in the /info keyboard.
async function onInfo(query) {
  await answer(query);
  const id = parseInt(query.data.split(':', 2)[1], 10);
  const dbUser = await getUser(query.from.id);
  const lang = dbUser?.language ?? DEFAULT_LANGUAGE;
  const ownerId = query.message.chat.id;

  const ev = await getEvent(id);
  if (!ev || ev.ownerId !== ownerId) {
    await editText(query, t(lang, 'event_not_found'));
    return;
  }
  const today = todayInTz(dbUser?.timezone ?? DEFAULT_TIMEZONE);
  await editText(query, formatEventInfo(ev, lang, today));
}

// del:<id> → confirmation; del_yes:<id> → delete; del_no → drop the message.
async function onDeletePick(query) {
  await answer(query);
  const id = parseInt(query.data.split(':', 2)[1], 10);
  const dbUser = await getUser(query.from.id);
  const lang = dbUser?.language ?? DEFAULT_LANGUAGE;
  const ownerId = query.message.chat.id;

  const ev = await getEvent(id);
  if (!ev || ev.ownerId !== ownerId) {
    await editText(query, t(lang, 'event_not_found'));
    return;
  }
  await api.editMessageText({
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: t(lang, 'confirm_delete', { title: ev.title }),
    reply_markup: {
      inline_keyboard: [[
        { text: t(lang, 'btn_yes'), callback_data: `del_yes:${ev.id}` },
        { text: t(lang, 'btn_no'), callback_data: 'del_no' },
      ]],
    },
  });
}

async function onDeleteConfirm(query) {
  await answer(query);
  const id = parseInt(query.data.split(':', 2)[1], 10);
  const dbUser = await getUser(query.from.id);
  const lang = dbUser?.language ?? DEFAULT_LANGUAGE;
  const ownerId = query.message.chat.id;

  const ev = await getEvent(id);
  const deleted = ev ? await deleteEvent(id, ownerId) : false;
  await editText(query, deleted
    ? t(lang, 'deleted', { title: ev.title })
    : t(lang, 'event_not_found'));
}

async function onDeleteCancel(query) {
  await answer(query);
  try {
    await api.deleteMessage({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
    });
  } catch (e) {
    if (!(e instanceof BotApiError)) throw e;
  }
}

async function editText(query, text, replyMarkup) {
  await api.editMessageText({
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text,
    reply_markup: replyMarkup,
  });
}

const ROUTES = [
  [/^lang:/, onLanguage],
  [/^tz:/, onTimezone],
  [/^tz_manual:/, onTimezoneManual],
  [/^list:/, onListPage],
  [/^info:/, onInfo],
  [/^del:/, onDeletePick],
  [/^del_yes:/, onDeleteConfirm],
  [/^del_no$/, onDeleteCancel],
];

export default async function (query) {
  if (!query.data) return;
  for (const [pattern, handler] of ROUTES) {
    if (pattern.test(query.data)) {
      await handler(query);
      return;
    }
  }
}
