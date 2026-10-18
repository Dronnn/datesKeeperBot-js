# Plan: Port datesKeeperBot to Telegram Serverless (JS)

## Goal
Port the Python bot (`datesKeeperBot-py`) to Telegram Serverless (JS, `tgcloud/`) as a
store-only bot: no reminders, no photos, stateless command flows.
New public GitHub repo `Dronnn/datesKeeperBot-js`; old repo untouched.

## Scope decisions (confirmed with Andrew)
- Drop reminders, prereminders, scheduler, photos entirely.
- Dialogs (ConversationHandlers) replaced by parameterized commands + inline keyboards;
  no dialog-state storage.
- Groups: events added in a group are shared for the whole chat (stored per chat_id).
- Private chats: events belong to the user.

## Steps

- [x] 1. Explore scaffolded project (AGENTS.md, docs/tgcloud-sdk.md, schema.js, handlers) and read Python sources to port (parser, i18n, handlers)
- [x] 2. Write schema.js (users, events) — no foreign keys, no photos/reminders tables
- [x] 3. Port lib/parser.js (date parsing: dd.mm(.yyyy), dd.mm.yyyy, ISO, relative etc.)
- [x] 4. Port lib/i18n.js (ru/de/en strings, minus reminder/photo strings, plus new command-help strings)
- [x] 5. Port handlers/message.js — commands: start, help, event, birthday, batch, list, upcoming, info, delete, edit, language, timezone, cancel removed; free-text add
- [x] 6. Port handlers/callback_query.js — language picker, delete confirm, list pagination
- [x] 7. Group-chat support: owner = chat.id in groups, user.id in private
- [x] 8. Commands menu (setMyCommands ru/de/en) — lib/setup module runnable via `npx tgcloud run`
- [x] 9. Test via `npx tgcloud run` (parser, i18n, key handlers)
- [x] 10. README.md, .gitignore check (no secrets), git init already done
- [x] 11. Create public GitHub repo Dronnn/datesKeeperBot-js, push
