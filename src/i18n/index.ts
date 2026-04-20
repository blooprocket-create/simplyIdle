import en, { type StringCatalog } from './en';

// ── Locale registry ────────────────────────────────────────
type Locale = 'en'; // extend as new catalogs are added

const catalogs: Record<Locale, StringCatalog> = { en };
let currentLocale: Locale = 'en';

/** Change the active locale at runtime. */
export function setLocale(locale: Locale) {
  if (!catalogs[locale]) return;
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

// ── Key path helper ────────────────────────────────────────
// Turns { a: { b: string } } into 'a.b'
type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;

type Leaves<T> = T extends object
  ? { [K in keyof T]: T[K] extends object ? Join<K, Leaves<T[K]>> : K }[keyof T]
  : never;

/** All valid dot-path keys, e.g. "header.dps" | "tap.attack" | … */
export type TranslationKey = Join<keyof StringCatalog, Leaves<StringCatalog[keyof StringCatalog]>>;

// ── Core translate function ────────────────────────────────

function resolve(obj: unknown, path: string): string | undefined {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Translate a key, optionally interpolating `{{variable}}` placeholders.
 *
 * ```ts
 * t('header.cloudSyncedAgo', { seconds: 12 })
 * // → "Cloud Synced 12s ago"
 * ```
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const raw = resolve(catalogs[currentLocale], key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (vars[k] != null ? String(vars[k]) : `{{${k}}}`));
}

export default t;
