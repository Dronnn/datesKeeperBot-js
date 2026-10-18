import { table, integer, text, boolean, index, sql } from 'sdk/db';

// users.id is the Telegram user id (not auto-increment).
// No foreign keys on this platform — integrity is enforced in app code.

export const users = table('users', {
  id:        integer('id').primaryKey(),
  username:  text('username'),
  firstName: text('first_name'),
  language:  text('language').notNull().default('ru'),
  timezone:  text('timezone').notNull().default('Europe/Berlin'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ownerId is the chat the event belongs to: the user's id in private chats,
// the group's chat id in group chats (shared list for the whole chat).
// addedBy is the Telegram user who created the event.
export const events = table('events', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  ownerId:    integer('owner_id').notNull(),
  addedBy:    integer('added_by').notNull(),
  title:      text('title').notNull(),
  eventDate:  text('event_date').notNull(), // YYYY-MM-DD
  eventTime:  text('event_time'),           // HH:MM or null
  birthYear:  integer('birth_year'),
  isBirthday: boolean('is_birthday').default(false),
  createdAt:  integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  ownerIdx: index('idx_events_owner').on(t.ownerId),
}));
