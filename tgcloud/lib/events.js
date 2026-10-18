// Database access helpers (port of the relevant parts of bot/database.py,
// minus reminders and photos). All queries are async — always await.

import { db, eq, like, asc, and } from 'sdk/db';
import { users, events } from '../schema.js';
import { DEFAULT_LANGUAGE, DEFAULT_TIMEZONE } from './i18n.js';

export async function getUser(id) {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export async function upsertUser(id, username, firstName, language, timezone) {
  await db.insert(users)
    .values({ id, username, firstName, language, timezone })
    .onConflictDoUpdate({
      target: users.id,
      set: { username, firstName, language, timezone },
    })
    .run();
  return getUser(id);
}

export async function updateUserLanguage(id, language) {
  await db.update(users).set({ language }).where(eq(users.id, id)).run();
}

export async function updateUserTimezone(id, timezone) {
  await db.update(users).set({ timezone }).where(eq(users.id, id)).run();
}

// Language for replies: the sender's stored preference or the default.
export async function resolveLang(userId) {
  const user = await getUser(userId);
  return user?.language ?? DEFAULT_LANGUAGE;
}

export async function createEvent({ ownerId, addedBy, title, eventDate, eventTime, birthYear, isBirthday }) {
  const [row] = await db.insert(events)
    .values({
      ownerId,
      addedBy,
      title,
      eventDate,
      eventTime: eventTime ?? null,
      birthYear: birthYear ?? null,
      isBirthday: Boolean(isBirthday),
    })
    .returning({ id: events.id })
    .run();
  return row.id;
}

export async function getEvent(id) {
  return db.select().from(events).where(eq(events.id, id)).get();
}

export async function listEvents(ownerId, limit = 1000, offset = 0) {
  return db.select().from(events)
    .where(eq(events.ownerId, ownerId))
    .orderBy(asc(events.eventDate))
    .limit(limit).offset(offset)
    .all();
}

export async function searchEvents(ownerId, query) {
  return db.select().from(events)
    .where(and(eq(events.ownerId, ownerId), like(events.title, `%${query}%`)))
    .orderBy(asc(events.eventDate))
    .all();
}

export async function deleteEvent(id, ownerId) {
  const res = await db.delete(events)
    .where(and(eq(events.id, id), eq(events.ownerId, ownerId)))
    .run();
  return res.rowsAffected > 0;
}

export async function updateEvent(id, ownerId, fields) {
  if (!fields || Object.keys(fields).length === 0) return;
  await db.update(events).set(fields)
    .where(and(eq(events.id, id), eq(events.ownerId, ownerId)))
    .run();
}

// Events whose next occurrence (MM-DD) falls on one of the given days.
export async function getUpcomingEvents(ownerId, mmddList) {
  const rows = await db.select().from(events)
    .where(eq(events.ownerId, ownerId))
    .all();
  const wanted = new Set(mmddList);
  return rows.filter((ev) => wanted.has(ev.eventDate.slice(5, 10)));
}
