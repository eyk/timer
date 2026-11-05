export type Language = 'de' | 'en';
export function preferredLanguage(languages: readonly string[]): Language {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}
const en = {
  load: 'Could not load the timer.', confirm: 'Please try acknowledging again.', limit: 'Up to ten timers.',
  start: 'Could not start the timer.', cancel: 'Could not cancel the timer.', hidden: 'Timer hidden',
  expired: 'Timer expired', running: 'Running timers', cancelLabel: 'Cancel timer', minutes: 'Minutes',
  open: 'Open with', version: 'Version', engine: 'Timer engine failed. Please restart the app.'
};
const de: typeof en = {
  load: 'Timer konnte nicht geladen werden.', confirm: 'Bitte noch einmal bestätigen.', limit: 'Maximal zehn Timer.',
  start: 'Timer konnte nicht gestartet werden.', cancel: 'Timer konnte nicht abgebrochen werden.', hidden: 'Timer ausgeblendet',
  expired: 'Timer abgelaufen', running: 'Laufende Timer', cancelLabel: 'Timer abbrechen', minutes: 'Minuten',
  open: 'Öffnen mit', version: 'Version', engine: 'Timer-Steuerung ausgefallen. Bitte die App neu starten.'
};
export const messages = (language: Language) => language === 'de' ? de : en;
export const shortcutLabel = (keys: string, language: Language) => language === 'de' ? keys.replace('Ctrl', 'Strg') : keys;
