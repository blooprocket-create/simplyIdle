/**
 * The mission board.
 *
 * Sixteen goals across three horizons, each gated on one of six metrics.
 * Ported as measured in `__tests__/missionsFixture.test.ts`, which matters
 * more here than usual because **two of the six metrics do not mean what the
 * missions say they mean**:
 *
 *   - `wave` is the wave the player is **on**, not the deepest they have
 *     reached — including on the three goals whose own description says
 *     "highest". So a wave goal is claimable only while standing at or past
 *     its target: reach 60, wipe back to 41, and the wave-50 goal is locked
 *     again until you climb back.
 *   - `kills` is the account's **lifetime** count, though every kill goal says
 *     "this run". A returning account claims them without fighting anything.
 *     There is no per-run kill counter on the shipped state to read instead.
 *
 * Both are reproduced rather than corrected. They are awkward, not broken —
 * every goal is reachable and pays what it says — and silently redefining a
 * metric would change which goals a returning player's account has already
 * satisfied. The screen says "while you are there" on a wave goal instead,
 * which is the honest fix that costs nobody a claim.
 */

/** The shipped metric names, kept so the mapping stays checkable. */
export type MissionMetric = 'wave' | 'kills' | 'summons' | 'active_team' | 'hero_shards' | 'essence';

export type MissionHorizon = 'short' | 'medium' | 'long';

export interface MissionReward {
  gold: number;
  shards: number;
  essence: number;
  diamonds: number;
}

export interface Mission {
  id: string;
  horizon: MissionHorizon;
  title: string;
  description: string;
  metric: MissionMetric;
  target: number;
  reward: MissionReward;
}

export const MISSIONS: readonly Mission[] = [
  {
    id: 'm_short_wave_20',
    horizon: 'short',
    title: 'Frontline Sprint',
    description: 'Reach Wave 20 this run.',
    metric: 'wave',
    target: 20,
    reward: { gold: 1200, shards: 80, essence: 0, diamonds: 2 },
  },
  {
    id: 'm_short_wave_50',
    horizon: 'short',
    title: 'Surge Momentum',
    description: 'Reach Wave 50 this run.',
    metric: 'wave',
    target: 50,
    reward: { gold: 3000, shards: 150, essence: 0, diamonds: 4 },
  },
  {
    id: 'm_short_team_4',
    horizon: 'short',
    title: 'Full Squad',
    description: 'Field 4 heroes in your active team.',
    metric: 'active_team',
    target: 4,
    reward: { gold: 1000, shards: 60, essence: 0, diamonds: 1 },
  },
  {
    id: 'm_short_kills_100',
    horizon: 'short',
    title: 'Quick Dominance',
    description: 'Defeat 100 monsters this run.',
    metric: 'kills',
    target: 100,
    reward: { gold: 1800, shards: 100, essence: 0, diamonds: 2 },
  },
  {
    id: 'm_short_summon_10',
    horizon: 'short',
    title: 'Fresh Recruits',
    description: 'Complete 10 hero summons.',
    metric: 'summons',
    target: 10,
    reward: { gold: 1500, shards: 100, essence: 0, diamonds: 2 },
  },
  {
    id: 'm_medium_kills_250',
    horizon: 'medium',
    title: 'Campaign Attrition',
    description: 'Defeat 250 monsters total.',
    metric: 'kills',
    target: 250,
    reward: { gold: 3200, shards: 160, essence: 0, diamonds: 0 },
  },
  {
    id: 'm_medium_kills_1000',
    horizon: 'medium',
    title: 'Slaughter Master',
    description: 'Defeat 1,000 monsters total.',
    metric: 'kills',
    target: 1000,
    reward: { gold: 8000, shards: 400, essence: 0, diamonds: 6 },
  },
  {
    id: 'm_medium_summons_40',
    horizon: 'medium',
    title: 'Roster Architect',
    description: 'Complete 40 hero summons.',
    metric: 'summons',
    target: 40,
    reward: { gold: 0, shards: 220, essence: 6, diamonds: 4 },
  },
  {
    id: 'm_medium_summons_100',
    horizon: 'medium',
    title: 'Legion Builder',
    description: 'Complete 100 hero summons.',
    metric: 'summons',
    target: 100,
    reward: { gold: 5000, shards: 500, essence: 12, diamonds: 10 },
  },
  {
    id: 'm_medium_wave_100',
    horizon: 'medium',
    title: 'Century Siege',
    description: 'Reach Wave 100 highest.',
    metric: 'wave',
    target: 100,
    reward: { gold: 4000, shards: 300, essence: 8, diamonds: 8 },
  },
  {
    id: 'm_long_essence_60',
    horizon: 'long',
    title: 'Core Resonance',
    description: 'Accumulate 60 essence.',
    metric: 'essence',
    target: 60,
    reward: { gold: 6000, shards: 0, essence: 10, diamonds: 8 },
  },
  {
    id: 'm_long_essence_200',
    horizon: 'long',
    title: 'Eternal Essence Master',
    description: 'Accumulate 200 essence total.',
    metric: 'essence',
    target: 200,
    reward: { gold: 15000, shards: 600, essence: 25, diamonds: 15 },
  },
  {
    id: 'm_long_shards_2000',
    horizon: 'long',
    title: 'Shard Dominion',
    description: 'Own 2,000 hero shards at once.',
    metric: 'hero_shards',
    target: 2000,
    reward: { gold: 0, shards: 300, essence: 8, diamonds: 0 },
  },
  {
    id: 'm_long_shards_10k',
    horizon: 'long',
    title: 'Crystalline Infinity',
    description: 'Own 10,000 hero shards at once.',
    metric: 'hero_shards',
    target: 10000,
    reward: { gold: 20000, shards: 1000, essence: 30, diamonds: 20 },
  },
  {
    id: 'm_long_wave_250',
    horizon: 'long',
    title: 'Storm Marshal Ascendant',
    description: 'Reach Wave 250 highest.',
    metric: 'wave',
    target: 250,
    reward: { gold: 12000, shards: 800, essence: 20, diamonds: 15 },
  },
  {
    id: 'm_long_wave_500',
    horizon: 'long',
    title: 'Infinite Path Pioneer',
    description: 'Reach Wave 500 highest. You transcend mortality.',
    metric: 'wave',
    target: 500,
    reward: { gold: 30000, shards: 2000, essence: 50, diamonds: 30 },
  },
];

export const MISSION_COUNT = MISSIONS.length;

/** Rendering order, and the order a screen groups by. */
export const MISSION_HORIZONS: readonly MissionHorizon[] = ['short', 'medium', 'long'];

export function missionById(id: string): Mission | null {
  return MISSIONS.find(mission => mission.id === id) ?? null;
}

export function missionsByHorizon(horizon: MissionHorizon): Mission[] {
  return MISSIONS.filter(mission => mission.horizon === horizon);
}

/**
 * Whether a goal is measured on something that can fall.
 *
 * Only the wave metric can: every other source is a lifetime tally or a
 * holding, and a holding only falls when the player spends it. A screen uses
 * this to say "while you are there" rather than leaving a player to discover
 * it by losing a claim.
 */
export function isTransient(mission: Mission): boolean {
  return mission.metric === 'wave';
}
