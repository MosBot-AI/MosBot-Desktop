import { translate, type MessageKey } from './i18n';
import type { Language, Presence } from '../../shared/domain';

/** Presence → the message key shown next to a Bot's name. */
export function presenceKey(presence: Presence): MessageKey {
  return `app.presence.${presence}`;
}

/** Locale-aware relative time used by the roster and details panel. */
export function formatRelativeMinutes(language: Language, minutes: number): string {
  if (minutes <= 1) {
    return translate(language, 'time.justNow');
  }
  if (minutes < 60) {
    return translate(language, 'time.minutesAgo', { count: Math.round(minutes) });
  }
  if (minutes < 60 * 24) {
    return translate(language, 'time.hoursAgo', { count: Math.round(minutes / 60) });
  }
  return translate(language, 'time.daysAgo', { count: Math.round(minutes / (60 * 24)) });
}
