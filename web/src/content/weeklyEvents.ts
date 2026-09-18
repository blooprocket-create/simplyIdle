/**
 * The eight weekly events. Authored data, ported verbatim.
 *
 * Five multipliers each, and they move independently: `double_gold_week` pays
 * twice the gold and ordinary EXP, `hero_experience_surge` the reverse. That
 * independence is what stops the reward chain collapsing into one scalar, and
 * `__tests__/killRewardFixture.test.ts` pins it by exhibiting the inversion.
 *
 * **There is no neutral week.** Every event moves something, and the one a new
 * save starts on — `balanced_week` — pays 1.15x gold and 1.15x EXP. A port
 * treating the default as 1x bakes a fifteen percent shortfall into its
 * baseline, which is a rounding-sized error at wave one and a real one at
 * wave two hundred.
 *
 * *Which* week is current is Phase 11's: the shipped game derives it from a
 * timestamp, and a clock is not something this engine reads. `weeklyEventWeek`
 * is carried on the save and read from there, so the table is live and only
 * its rotation waits.
 */

export interface WeeklyEvent {
  id: string;
  name: string;
  description: string;
  emoji: string;
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  goldMultiplier: number;
  expMultiplier: number;
  shardMultiplier: number;
}

export const WEEKLY_EVENTS: readonly WeeklyEvent[] = [
  {
    id: 'no_armor_week',
    name: 'No Armor Week',
    description: 'Enemies lose heavy defenses. Faster clears, lighter resistance.',
    emoji: '🪓',
    enemyHpMultiplier: 0.85,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1.05,
    expMultiplier: 1,
    shardMultiplier: 1,
  },
  {
    id: 'double_shard_drops',
    name: 'Double Shard Drops',
    description: 'Shard income surges from recycling and shard rewards.',
    emoji: '💎',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1,
    expMultiplier: 1,
    shardMultiplier: 2,
  },
  {
    id: 'elite_waves_only',
    name: 'Elite Waves Only',
    description: 'Every wave is dangerous, but rewards are amplified.',
    emoji: '👹',
    enemyHpMultiplier: 1.2,
    enemyDamageMultiplier: 1.22,
    goldMultiplier: 1.25,
    expMultiplier: 1.25,
    shardMultiplier: 1.15,
  },
  {
    id: 'double_gold_week',
    name: 'Double Gold Week',
    description: 'Every kill pays twice.',
    emoji: '🪙',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 2,
    expMultiplier: 1,
    shardMultiplier: 1,
  },
  {
    id: 'hero_experience_surge',
    name: 'Hero Experience Surge',
    description: 'Levels come twice as fast.',
    emoji: '📈',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1,
    expMultiplier: 2,
    shardMultiplier: 1,
  },
  {
    id: 'nightmare_assault',
    name: 'Nightmare Assault',
    description: 'Far deadlier waves, paid for at every counter.',
    emoji: '💀',
    enemyHpMultiplier: 1.8,
    enemyDamageMultiplier: 1.5,
    goldMultiplier: 3,
    expMultiplier: 2.5,
    shardMultiplier: 2.5,
  },
  {
    id: 'essence_harvest',
    name: 'Essence Harvest',
    description: 'A little more of everything, and rather more shards.',
    emoji: '✦',
    enemyHpMultiplier: 1.1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1.1,
    expMultiplier: 1.1,
    shardMultiplier: 1.5,
  },
  {
    id: 'balanced_week',
    name: 'Balanced Week',
    description: 'A modest lift across the board.',
    emoji: '⚖️',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1.15,
    expMultiplier: 1.15,
    shardMultiplier: 1.15,
  },
];

/**
 * The event for a week number.
 *
 * `Math.abs` before the modulo, as shipped — a negative week number is a
 * corrupt save rather than a date in the past, and it wraps to a real event
 * rather than reading off the end of the array.
 */
export function weeklyEventByWeek(weekNumber: number): WeeklyEvent {
  return WEEKLY_EVENTS[Math.abs(Math.floor(weekNumber)) % WEEKLY_EVENTS.length];
}

/** What a new save starts on, and deliberately not a neutral one. */
export const DEFAULT_WEEKLY_EVENT_WEEK = 0;
