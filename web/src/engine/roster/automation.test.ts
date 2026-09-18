import { describe, expect, it } from 'vitest';
import { AUTOMATIONS, automationById, availableAutomations } from '../../content/automation';
import type { Rarity } from '../../content/rarities';
import { AUTO_SUMMON_COOLDOWN_MS, autoRecycleShards, autoRecycleTargets, autoSummonTick } from './automation';
import { calculateShardReward } from './progression';
import type { TeamHero } from './team';

/**
 * The two roster automations Phase 8 makes real.
 *
 * `content/automation.ts` has listed them since Phase 4 with `available:
 * false` — "the systems they automate do not exist in this rewrite yet". They
 * do now, and these are the rules that make the flags mean something.
 */

function hero(uid: string, rarity: Rarity, level = 1): TeamHero {
  return { id: 'h1', uid, heroClass: 'warrior', rarity, level, rank: 1, teamBoost: 0.05, rebirthStatMult: 1 };
}

const ROSTER: TeamHero[] = [
  hero('fighting', 'common'),
  hero('junk', 'common'),
  hero('spare', 'uncommon'),
  hero('decent', 'rare'),
  hero('good', 'epic'),
  hero('relic', 'common'),
];

const NO_RELICS: ReadonlySet<string> = new Set();

describe('what the catalogue still does not claim', () => {
  it('claims the two flags now that the shell honours them', () => {
    /*
     * Phase 8 built summoning and recycling and the flags stayed false, for a
     * reason this test used to state: `available` is a claim that the shell
     * wires the flag, and `ui/architecture.test.ts` required a
     * `loopRef.setAuto…` call for each one — which is right for `burst`, an
     * in-fight behaviour, and has no shape for one that spends currency.
     *
     * Phase 10 widened that gate. An automation is honoured either by the
     * loop or by `app/automationRunner.ts`, which runs on the shell's save
     * cadence — and the wallet blocker is gone too, because the fight earns
     * and banks boss tears now.
     *
     * `usePotion` came later in the same phase and by a *third* route, which
     * is why the gate now counts three: its trigger is the team's health, so
     * only the fight can see it, and the potion comes out of the bag, so only
     * the save holds it. `app/GameLoop.ts` is where those already meet.
     *
     * `tempo` and `useCoolant` are the only two left, and they wait on the
     * same thing: this engine has no heat.
     */
    expect(automationById('summon')?.available).toBe(true);
    expect(automationById('recycle')?.available).toBe(true);
    expect(automationById('usePotion')?.available).toBe(true);
    expect(automationById('tempo')?.available).toBe(false);
    expect(automationById('useCoolant')?.available).toBe(false);

    expect(availableAutomations().map(entry => entry.id)).toEqual([
      'burst',
      'castHeroActives',
      'summon',
      'recycle',
      'dismantle',
      'usePotion',
    ]);
  });

  it('still lists every shipped flag, honoured or not', () => {
    // A screen showing one automation would be telling the player this game
    // has one. The unavailable ones stay listed for the same reason the
    // untracked achievements do.
    // Eight, not nine: `equipBest` was never a settings flag. See
    // `content/automation.test.ts` and `__tests__/bestTeamFixture.test.ts`.
    expect(AUTOMATIONS).toHaveLength(8);
    expect(AUTOMATIONS.filter(entry => !entry.available).map(entry => entry.id)).toEqual(['tempo', 'useCoolant']);
  });
});

describe('automatic summoning', () => {
  const state = { cooldownMs: 0, freeSummonCharges: 0, bossTears: 0 };

  it('spends a free charge before a boss tear', () => {
    // Otherwise the automation burns tears while charges sit unused, which is
    // the player's scarcer currency going first.
    const tick = autoSummonTick({ ...state, freeSummonCharges: 2, bossTears: 5 }, 0);
    expect(tick).toEqual({
      summon: true,
      cooldownMs: AUTO_SUMMON_COOLDOWN_MS,
      freeSummonCharges: 1,
      bossTears: 5,
    });
  });

  it('spends a boss tear when there is no charge', () => {
    expect(autoSummonTick({ ...state, bossTears: 3 }, 0)).toEqual({
      summon: true,
      cooldownMs: AUTO_SUMMON_COOLDOWN_MS,
      freeSummonCharges: 0,
      bossTears: 2,
    });
  });

  it('does nothing when it can pay with neither', () => {
    expect(autoSummonTick(state, 0).summon).toBe(false);
  });

  it('counts the cooldown down without resetting it on an idle tick', () => {
    /*
     * The cooldown is only *set* by a summon. A tick that cannot pay leaves it
     * counting down — otherwise an account that ran out of tears would hold the
     * cooldown at full forever and never resume when tears arrived.
     */
    const cooling = autoSummonTick({ ...state, cooldownMs: 1_000 }, 400);
    expect(cooling).toEqual({ summon: false, cooldownMs: 600, freeSummonCharges: 0, bossTears: 0 });

    const broke = autoSummonTick({ ...state, cooldownMs: 300, bossTears: 0 }, 400);
    expect(broke).toEqual({ summon: false, cooldownMs: 0, freeSummonCharges: 0, bossTears: 0 });

    // And once it is down and a tear arrives, it fires.
    expect(autoSummonTick({ ...state, cooldownMs: 0, bossTears: 1 }, 0).summon).toBe(true);
  });

  it('never runs the cooldown negative or backwards', () => {
    expect(autoSummonTick({ ...state, cooldownMs: 100 }, 10_000).cooldownMs).toBe(0);
    // A negative elapsed is a clock that moved backwards, not a refund.
    expect(autoSummonTick({ ...state, cooldownMs: 100 }, -500).cooldownMs).toBe(100);
  });
});

describe('automatic recycling', () => {
  it('spares the active team', () => {
    // Recycling a hero who is fighting would empty the line the player chose.
    const targets = autoRecycleTargets({
      heroes: ROSTER,
      activeUids: ['fighting'],
      maxRarity: 'epic',
      relicBearerUids: NO_RELICS,
    });
    expect(targets.map(entry => entry.uid)).not.toContain('fighting');
  });

  it('spares a hero carrying their relic', () => {
    // The relic has no other home, so recycling its bearer destroys it.
    const targets = autoRecycleTargets({
      heroes: ROSTER,
      activeUids: [],
      maxRarity: 'epic',
      relicBearerUids: new Set(['relic']),
    });
    expect(targets.map(entry => entry.uid)).not.toContain('relic');
  });

  it('reads the rarity floor as inclusive', () => {
    /*
     * A floor of `rare` takes commons, uncommons *and* rares. Reading it as
     * exclusive would leave a player's rares piling up after they had asked
     * for them to go — a silent refusal to do the thing they switched on.
     */
    const targets = autoRecycleTargets({
      heroes: ROSTER,
      activeUids: [],
      maxRarity: 'rare',
      relicBearerUids: NO_RELICS,
    });
    expect(targets.map(entry => entry.uid).sort()).toEqual(['decent', 'fighting', 'junk', 'relic', 'spare']);
    // The epic is above the floor and stays.
    expect(targets.map(entry => entry.uid)).not.toContain('good');
  });

  it('takes nothing for a floor it does not recognise', () => {
    expect(
      autoRecycleTargets({
        heroes: ROSTER,
        activeUids: [],
        maxRarity: 'not-a-rarity' as Rarity,
        relicBearerUids: NO_RELICS,
      }),
    ).toEqual([]);
  });

  it('rounds the batch once rather than per hero', () => {
    /*
     * `Math.ceil(sum * multiplier)`, not a sum of per-hero ceilings — and the
     * difference is real money during a shard event. `ceil` is superadditive,
     * so the sweep pays **less than or equal to** recycling the same heroes one
     * at a time, and strictly less whenever more than one of them would have
     * rounded up.
     *
     * Ported as it stands rather than made consistent with the manual button.
     * The two apps share accounts, and a player who noticed the sweep paying
     * differently would be noticing a divergence rather than a fix.
     */
    /*
     * Three heroes whose flat rewards are all *odd* — 5, 5 and 7 — so each one
     * lands on a half shard at 1.5x and each would round up on its own. Picked
     * rather than stumbled on: the first version of this test used rewards of
     * 6, 7 and 24, where only one was fractional, and the two totals came out
     * equal. A test of a difference has to choose inputs that make one.
     */
    const targets = [hero('a', 'common', 1), hero('b', 'common', 2), hero('c', 'common', 4)];
    const multiplier = 1.5;

    const batch = autoRecycleShards(targets, multiplier);
    const oneAtATime = targets.reduce(
      (sum, entry) => sum + Math.ceil(calculateShardReward(entry.rarity, entry.level) * multiplier),
      0,
    );

    expect(batch).toBeLessThanOrEqual(oneAtATime);
    // And on this batch it is strictly less, so the case is exercised rather
    // than merely allowed for.
    expect(batch).toBeLessThan(oneAtATime);
  });

  it('pays nothing for an empty sweep', () => {
    expect(autoRecycleShards([], 2)).toBe(0);
  });

  it('pays the flat sum when no event is running', () => {
    const targets = [hero('a', 'rare', 10), hero('b', 'epic', 20)];
    const expected = targets.reduce((sum, entry) => sum + calculateShardReward(entry.rarity, entry.level), 0);
    expect(autoRecycleShards(targets, 1)).toBe(expected);
  });
});
