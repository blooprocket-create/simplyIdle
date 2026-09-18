/**
 * Expeditions: gold up front, a reward after a wait.
 *
 * Five contract tiers at five destinations, every number measured in
 * `__tests__/expeditionsFixture.test.ts`. Two things about the shipped
 * version are not ported, and both are stated here rather than discovered:
 *
 * **The wait is enforced here and is not there.** `COMPLETE_EXPEDITION` looks
 * the expedition up by id and pays it out; it never compares `startTime +
 * durationMs` against anything. Measured: an eight-hour godly contract,
 * started and completed with no time passed, hands over its full reward. That
 * makes an expedition a gold-to-diamonds exchange rather than a timer —
 * 1,000,000 gold for 400 diamonds as fast as a player can press twice — and
 * with the dollar shop switched off it is one of the few diamond sources the
 * game has. Reproducing it would be reproducing the hole, not the feature.
 * See `engine/expeditions/contracts.ts`.
 *
 * **Artifacts are not listed.** Every shipped tier stores an artifact count,
 * up to eight, and the save reader validates it — and the completion pays
 * diamonds, shards and essence. There is no artifact anywhere on the shipped
 * state to receive them. Listing a reward this game cannot hand over would be
 * promising the player something, which is worse than the shipped version's
 * silence.
 */

export type ExpeditionRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'godly';
export type ExpeditionType = 'artifact' | 'merchant' | 'ruins' | 'vault' | 'abyss';

export const EXPEDITION_TYPES: readonly ExpeditionType[] = ['artifact', 'merchant', 'ruins', 'vault', 'abyss'];

export interface ExpeditionReward {
  diamonds: number;
  shards: number;
  essence: number;
}

export interface ExpeditionContract {
  rarity: ExpeditionRarity;
  goldCost: number;
  durationMs: number;
  reward: ExpeditionReward;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const EXPEDITION_CONTRACTS: readonly ExpeditionContract[] = [
  { rarity: 'common', goldCost: 25_000, durationMs: 5 * MINUTE, reward: { diamonds: 35, shards: 150, essence: 0 } },
  { rarity: 'rare', goldCost: 75_000, durationMs: 20 * MINUTE, reward: { diamonds: 75, shards: 320, essence: 0 } },
  { rarity: 'epic', goldCost: 220_000, durationMs: 90 * MINUTE, reward: { diamonds: 140, shards: 700, essence: 1 } },
  {
    rarity: 'legendary',
    goldCost: 500_000,
    durationMs: 4 * HOUR,
    reward: { diamonds: 240, shards: 1_300, essence: 2 },
  },
  { rarity: 'godly', goldCost: 1_000_000, durationMs: 8 * HOUR, reward: { diamonds: 400, shards: 2_400, essence: 4 } },
];

/** What rerolling the contracts on offer costs. */
export const CONTRACT_REFRESH_GOLD_COST = 100_000;

export function contractFor(rarity: string): ExpeditionContract | null {
  return EXPEDITION_CONTRACTS.find(contract => contract.rarity === rarity) ?? null;
}

export function isExpeditionType(value: unknown): value is ExpeditionType {
  return typeof value === 'string' && (EXPEDITION_TYPES as readonly string[]).includes(value);
}
