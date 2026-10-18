// Diagnostic utility: verifies DB read/write without touching the Bot API.
// Run with:  npx tgcloud run endpoints/selftest '{}'
// With { cleanup: true } also deletes its own test rows.

import { db, eq } from 'sdk/db';
import { users, events } from '../schema.js';

const TEST_USER = -424242;
const TEST_EVENT_DATE = '2000-01-01';

export default async function (input) {
  const cleanupOnly = input && input.cleanup === true;

  if (cleanupOnly) {
    await db.delete(events).where(eq(events.ownerId, TEST_USER)).run();
    await db.delete(users).where(eq(users.id, TEST_USER)).run();
    return 'cleaned';
  }

  if (input && input.dumpOwnerId !== undefined) {
    const rows = await db.select().from(events)
      .where(eq(events.ownerId, input.dumpOwnerId))
      .all();
    return rows;
  }

  await db.insert(users)
    .values({ id: TEST_USER, username: 'selftest', firstName: 'selftest', language: 'ru', timezone: 'Europe/Berlin' })
    .onConflictDoNothing({ target: users.id })
    .run();

  const [row] = await db.insert(events)
    .values({ ownerId: TEST_USER, addedBy: TEST_USER, title: 'selftest event', eventDate: TEST_EVENT_DATE, isBirthday: true, birthYear: 2000 })
    .returning({ id: events.id })
    .run();

  const found = await db.select().from(events).where(eq(events.id, row.id)).get();
  if (!found || found.title !== 'selftest event' || found.isBirthday !== true) {
    throw new Error('selftest: event roundtrip failed');
  }

  return {
    ok: true,
    eventId: row.id,
    userCount: (await db.select().from(users).all()).length,
  };
}
