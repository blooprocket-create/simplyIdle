import { describe, expect, it } from 'vitest';
import type { AutomationId } from '../content/automation';
import { equipmentTemplatesById } from '../content/equipment';
import { heroTemplatesById } from '../content/heroes';
import { readSave } from '../engine/save/v3';
import type { SaveV3 } from '../engine/save/schema';
import { EMPTY_AUTOMATION_STATE, MAX_SUMMONS_PER_RUN, runAutomations, SAVE_SIDE_AUTOMATIONS } from './automationRunner';
import { priceOfSummon } from './playerActions';

/**
 * The automations the shell honours against the save.
 *
 * The rule they exist under is that **nothing acts unless the player earned it
 * and switched it on** — which is enforced here by construction rather than by
 * a regex over the shell, so these are the tests that make that claim true.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/**
 * Enough for several pulls, priced off the rule rather than written down.
 *
 * A literal here would have to move whenever the price does — and it is about
 * to: the port charges `GACHA_SUMMON_COST` boss tears where the shipped game
 * charges **one**, which is the next commit. These tests are about the
 * automation, so they ask what a summon costs instead of asserting it.
 */
const PULLS = 4;

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 0, bossTears: 0, diamonds: 500 },
      ...over,
    },
    { nowMs: NOW, content: CONTENT },
  );
}

const tearsFor = (pulls: number) => Math.max(pulls, priceOfSummon(save({}), 'bossTears') * pulls);

/** An account that can pay for a few pulls, whatever a pull costs. */
const affordable = () => save({ wallet: { gold: 0, bossTears: tearsFor(PULLS), diamonds: 500 } });

const context = (from: SaveV3) => ({ save: from, elapsedMs: 5_000, nowMs: NOW, random: () => 0.5 });

describe('what a switch has to be to act', () => {
  it('does nothing at all when nothing is switched on', () => {
    /*
     * The whole of the gate, in one assertion. `runAutomations` reads the set
     * it is handed rather than a global one, so an automation that is
     * registered but not active cannot act however it got registered — which
     * is the failure the shipped game had nine times over.
     */
    const before = save();
    expect(runAutomations(new Set(), context(before)).save).toBeNull();
  });

  it('acts once it is', () => {
    // And the same account with the same switch on does move, so the reading
    // above is the gate holding rather than the scenario having nothing to do.
    const before = affordable();
    expect(runAutomations(new Set<AutomationId>(['summon']), context(before)).save).not.toBeNull();
  });

  it('runs only the one that is on', () => {
    const before = affordable();
    const summoned = runAutomations(new Set<AutomationId>(['summon']), context(before)).save!;
    expect(summoned.roster.heroes.length).toBeGreaterThan(before.roster.heroes.length);
    // Recycling was off, so nothing was recycled — the new heroes are still there.
    expect(summoned.wallet.heroShards).toBe(before.wallet.heroShards);
  });

  it('registers no automation the catalogue does not admit to', () => {
    // The other half of `ui/architecture.test.ts`'s rule, from this side.
    for (const id of Object.keys(SAVE_SIDE_AUTOMATIONS)) {
      expect(['summon', 'recycle', 'dismantle']).toContain(id);
    }
  });
});

describe('the automatic summon', () => {
  it('spends boss tears, and stops when they run out', () => {
    const before = save({ wallet: { gold: 0, bossTears: tearsFor(1), diamonds: 500 } });
    const after = runAutomations(new Set<AutomationId>(['summon']), context(before)).save!;
    expect(after.wallet.bossTears).toBeLessThan(before.wallet.bossTears);
    // Diamonds are never spent automatically: the shipped automation does not
    // touch them, and a switch that quietly spent bought currency is worse
    // than one that stops.
    expect(after.wallet.diamonds).toBe(before.wallet.diamonds);
  });

  it('spends a free charge before a tear', () => {
    const before = save({ summon: { freeCharges: 1 }, wallet: { gold: 0, bossTears: 0, diamonds: 0 } });
    expect(before.summon.freeCharges).toBe(1);
    const after = runAutomations(new Set<AutomationId>(['summon']), context(before)).save;
    // It summoned with no tears at all, so the charge is what paid.
    expect(after).not.toBeNull();
    expect(after!.roster.heroes.length).toBeGreaterThan(before.roster.heroes.length);
    expect(after!.wallet.bossTears).toBe(0);
  });

  it('does nothing when it can pay with neither', () => {
    const broke = save({ freeSummonCharges: 0, wallet: { gold: 0, bossTears: 0, diamonds: 500 } });
    expect(runAutomations(new Set<AutomationId>(['summon']), context(broke)).save).toBeNull();
  });

  it('carries its cooldown between runs', () => {
    /*
     * The one automation here with a clock. It lives in the runner's state
     * rather than the save, because it is a property of this session's pacing
     * and not of the account — a player who reloads should not find their
     * automation held back by a cooldown from yesterday.
     */
    const before = affordable();
    const first = runAutomations(new Set<AutomationId>(['summon']), context(before), EMPTY_AUTOMATION_STATE);
    expect(first.state.summonCooldownMs).toBeGreaterThanOrEqual(0);
    expect(first.state).not.toBe(EMPTY_AUTOMATION_STATE);
  });

  it('spends a long window without spending everything', () => {
    // A tab left in the background hands over a large elapsed time. The cap is
    // what stops one tick emptying an account.
    const stock = tearsFor(500);
    const rich = save({ wallet: { gold: 0, bossTears: stock, diamonds: 0 } });
    const after = runAutomations(new Set<AutomationId>(['summon']), {
      ...context(rich),
      elapsedMs: 60 * 60 * 1000,
    }).save!;
    // At most `MAX_SUMMONS_PER_RUN` pulls, however long the window was.
    expect(after.wallet.bossTears).toBeGreaterThan(stock - tearsFor(MAX_SUMMONS_PER_RUN + 1));
  });
});
