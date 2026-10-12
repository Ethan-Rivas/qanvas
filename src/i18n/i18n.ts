import en from './en.json';
import es from './es.json';

export type Language = 'en' | 'es';
export type MessageKey = keyof typeof en;

export const MESSAGES: Record<Language, Record<MessageKey, string>> = { en, es };
export const LANGUAGES: Language[] = ['en', 'es'];

export type Translate = (key: MessageKey, values?: Record<string, string | number>) => string;

export function translator(language: Language): Translate {
  const messages = MESSAGES[language];
  return (key, values = {}) =>
    messages[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

export function pluralKey<K extends string>(language: Language, base: K, count: number): `${K}.${'one' | 'other'}` {
  return `${base}.${new Intl.PluralRules(language).select(count) === 'one' ? 'one' : 'other'}`;
}

export function formatPercent(language: Language, fraction: number): string {
  return new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 }).format(fraction);
}
