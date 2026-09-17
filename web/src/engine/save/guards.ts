import Decimal from 'break_eternity.js';

/**
 * Bounded-value guards for reading a save.
 *
 * Every one of these is a straight port of a helper in the shipped
 * `sanitizeSaveData`, kept deliberately literal: a save that has been sitting
 * in a dormant account for a year is the one input this rewrite cannot
 * re-derive, so the reading rules are the last place to get clever.
 *
 * The bounds themselves are ported as-is too, including the one that does not
 * bound anything — see `SAFE_NUMBER_CAP`.
 */

/**
 * The shipped `SAFE_INTEGER_CAP`, which is `Number.MAX_VALUE` rather than
 * `Number.MAX_SAFE_INTEGER`. Every currency in the game is clamped against it,
 * so in practice currencies have no upper bound at all and a save can carry a
 * gold value well past the point where integer arithmetic stops being exact.
 *
 * Ported at its shipped value rather than tightened: lowering it would delete
 * currency from any account that has drifted past 2^53, which is exactly the
 * kind of silent wipe this module exists to prevent. `saveMigration.test.ts`
 * pins the behaviour so the choice stays visible.
 */
export const SAFE_NUMBER_CAP = Number.MAX_VALUE;

export const MAX_SAVE_WAVE = 1_000_000;
export const MAX_SAVE_PLAYER_LEVEL = 1_000_000;
export const MAX_SAVE_COLLECTION = 500;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function boundedInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function boundedFloat(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * A currency, read from text.
 *
 * The one guard here that is **not** a port. The shipped save stores gold as a
 * JSON number clamped against `SAFE_NUMBER_CAP`, which is `Number.MAX_VALUE` —
 * so an account that drifts past it writes `Infinity`, and `JSON.stringify`
 * turns that into `null`. A campaign whose wave curve is explicitly built to
 * outlive doubles cannot keep its currencies in them, so these round-trip as
 * `Decimal.toString()` output instead.
 *
 * Numbers are still accepted, because a save written before this existed has
 * them. Negative and non-finite values read as the fallback: `NaN` and
 * `Infinity` are both constructible `Decimal`s that propagate silently through
 * every sum after them rather than failing.
 *
 * Outright nonsense is *not* rejected — `new Decimal('abc')` is zero, not
 * `NaN`, so a mangled field reads as an empty purse. That is the same answer
 * the fallback gives for every caller here, so it is left as it is rather than
 * given a second code path nothing would exercise.
 */
export function boundedDecimal(value: unknown, fallback: Decimal): Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback;
  const parsed = new Decimal(value);
  return parsed.isFinite() && !parsed.lt(0) ? parsed : fallback;
}

export function boundedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function boundedString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

/** De-duplicating, trimming, length-capped string list. Non-strings are dropped. */
export function boundedStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }

  return out;
}

/**
 * De-duplicating integer list. Numeric strings are accepted, which is how
 * milestone arrays that round-tripped through an older JSON layer survive.
 */
export function boundedIntList(value: unknown, maxItems: number): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  const out: number[] = [];

  for (const item of value) {
    const parsed = typeof item === 'number' ? item : typeof item === 'string' ? Number(item) : NaN;
    if (!Number.isFinite(parsed)) continue;
    const asInt = Math.floor(parsed);
    if (seen.has(asInt)) continue;
    seen.add(asInt);
    out.push(asInt);
    if (out.length >= maxItems) break;
  }

  return out;
}

/**
 * Mini-op cooldown stamps were day numbers before they were milliseconds.
 * Anything below this threshold is read as a day number and multiplied up;
 * the threshold is roughly 1970 + 115 days in ms, so no real ms stamp is
 * below it and no plausible day number is above it.
 */
export const DAY_NUMBER_CEILING = 10_000_000_000;
export const MS_PER_DAY = 86_400_000;

export function boundedCooldownStamp(value: unknown, nowMs: number): number | null {
  if (value == null) return null;
  const parsed = boundedInt(value, 0, nowMs, 0);
  if (parsed <= 0) return null;
  if (parsed < DAY_NUMBER_CEILING) return Math.min(nowMs, parsed * MS_PER_DAY);
  return parsed;
}
