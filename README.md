# DatesKeeperBot (Telegram Serverless)

A Telegram bot that keeps track of birthdays and important dates — no server,
no hosting bill. Runs entirely on [Telegram Serverless](https://core.telegram.org/bots/serverless):
your updates are handled by JS modules in Telegram's own runtime, storage is the
built-in SQLite database.

This is a rewrite of the original Python (python-telegram-bot) version, adapted
to the serverless model:

- **No reminders.** The platform has no scheduler, so the bot only stores dates.
- **No photos.** Removed together with the reminder flows.
- **No dialog state.** Conversations were replaced by parameterized commands —
  every update is processed independently, nothing is kept between messages.

## Commands

| Command | What it does |
|---|---|
| `/start` | Onboarding: pick language, then timezone |
| `/help` | Full reference |
| `/event 01.05.2024 Название` | Add an event (time optional: `… 15:00 Название`) |
| `/birthday 12.03.1990 Имя` | Add a birthday (year optional — used for age) |
| `/batch` | Add many dates at once, one `title date` per line |
| `/list` | All dates, paginated, with event ids |
| `/upcoming` | Events in the next 30 days |
| `/find текст` | Search by title |
| `/info <id>` | Event details (without `id` — pick from a list) |
| `/delete <id>` | Delete an event (with confirmation) |
| `/edit <id> title \| date value` | Edit an event |
| `/language` | Change language (ru / de / en) |
| `/timezone` | Change timezone (IANA name or UTC offset) |

Free input works too: send `12.03.1990 ДР Пети` or `01.05 Встреча` as a plain
message. An explicit past year makes it a birthday; without a year it's a
regular event. Date formats: `DD.MM.YYYY`, `DD.MM`, `DD/MM/YYYY`, `YYYY-MM-DD`,
plus relative words (`сегодня/завтра/вчера`, `heute/gestern/morgen`,
`yesterday/today/tomorrow`).

`/event` and `/birthday` without arguments reply with a ready-to-copy template.

## Private chats and groups

- **Private chat** — the list belongs to the user.
- **Group chats** — the list is shared by the whole chat: events added in the
  group are stored against the group's chat id and visible to everyone there.
  Language and timezone stay personal (per Telegram user).
- For free-text adds to work inside groups, switch the bot's **privacy mode
  off** in @BotFather (otherwise the bot only receives commands there).

## Repository layout

```
tgcloud/               deployed code
├── schema.js          users + events tables
├── handlers/
│   ├── message.js         commands and free-text input
│   └── callback_query.js  inline keyboards (language, timezone, delete, paging, info)
├── lib/
│   ├── parser.js          "date title" parsing
│   ├── dates.js           timezone-aware date helpers
│   ├── format.js          list / upcoming / info formatting
│   ├── events.js          database access
│   └── i18n.js            ru / de / en strings
└── endpoints/
    ├── setupCommands.js   registers the command menu (run once after deploy)
    └── selftest.js        DB round-trip diagnostic
```

Everything outside `tgcloud/` is local: `docs/` (SDK reference), logs, config.

## Development

Requires Node.js 18+. The `tgcloud` CLI is a local dev-dependency — always run
it through `npx`.

```bash
npx tgcloud login      # once: link the project to the bot (token from @BotFather → Serverless)
npx tgcloud status     # local vs cloud diff
npx tgcloud run handlers/message '{ chat: { id: 1, type: "private" }, from: { id: 1 }, text: "/help" }'
                       # execute a handler on the platform with local code, no deploy
npx tgcloud push       # deploy code
npx tgcloud migrate    # apply schema changes to the database
npx tgcloud run endpoints/setupCommands '{}'   # (re)install the command menu
```

Note: `npx tgcloud run` really executes against the Bot API — a test payload
needs an existing `chat_id`, or the run ends with `chat not found` (harmless:
the database part has already succeeded by then).
