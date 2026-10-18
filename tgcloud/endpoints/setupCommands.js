// One-shot utility: registers the bot's command menu for all languages.
// Run it after deploying with:
//   npx tgcloud run endpoints/setupCommands '{}'
// Safe to re-run anytime — setMyCommands is idempotent.

import { api } from 'sdk';

const COMMANDS = {
  en: [
    { command: 'start', description: 'Start / settings' },
    { command: 'help', description: 'Help' },
    { command: 'birthday', description: 'Add a birthday' },
    { command: 'event', description: 'Add an event' },
    { command: 'batch', description: 'Add multiple dates at once' },
    { command: 'list', description: 'All dates' },
    { command: 'upcoming', description: 'Upcoming events' },
    { command: 'find', description: 'Search by name' },
    { command: 'info', description: 'Event details' },
    { command: 'delete', description: 'Delete an event' },
    { command: 'edit', description: 'Edit an event' },
    { command: 'language', description: 'Change language' },
    { command: 'timezone', description: 'Change timezone' },
  ],
  ru: [
    { command: 'start', description: 'Начать / настройки' },
    { command: 'help', description: 'Помощь' },
    { command: 'birthday', description: 'Добавить день рождения' },
    { command: 'event', description: 'Добавить событие' },
    { command: 'batch', description: 'Добавить несколько дат сразу' },
    { command: 'list', description: 'Все даты' },
    { command: 'upcoming', description: 'Ближайшие события' },
    { command: 'find', description: 'Поиск по названию' },
    { command: 'info', description: 'Подробности о событии' },
    { command: 'delete', description: 'Удалить событие' },
    { command: 'edit', description: 'Редактировать событие' },
    { command: 'language', description: 'Сменить язык' },
    { command: 'timezone', description: 'Сменить часовой пояс' },
  ],
  de: [
    { command: 'start', description: 'Starten / Einstellungen' },
    { command: 'help', description: 'Hilfe' },
    { command: 'birthday', description: 'Geburtstag hinzufügen' },
    { command: 'event', description: 'Termin hinzufügen' },
    { command: 'batch', description: 'Mehrere Daten auf einmal' },
    { command: 'list', description: 'Alle Daten' },
    { command: 'upcoming', description: 'Bevorstehende Termine' },
    { command: 'find', description: 'Nach Name suchen' },
    { command: 'info', description: 'Termindetails' },
    { command: 'delete', description: 'Termin löschen' },
    { command: 'edit', description: 'Termin bearbeiten' },
    { command: 'language', description: 'Sprache ändern' },
    { command: 'timezone', description: 'Zeitzone ändern' },
  ],
};

export default async function () {
  await api.setMyCommands({ commands: COMMANDS.en }); // default scope
  await api.setMyCommands({ commands: COMMANDS.ru, language_code: 'ru' });
  await api.setMyCommands({ commands: COMMANDS.de, language_code: 'de' });
  return 'command menus installed: default(en), ru, de';
}
