import { describe, expect, it } from 'vitest';
import { AUTOMATIONS, AUTOMATION_COUNT, automationById, availableAutomations } from './automation';
import { TRACKED_SIGNALS } from './achievements';

describe('the automation catalogue', () => {
  it('covers all nine shipped flags', () => {
    // The shipped game has nine. Listing fewer would tell the player this
    // game automates less than it does; the ones with no system yet are
    // marked unavailable rather than dropped.
    expect(AUTOMATION_COUNT).toBe(9);
    expect(new Set(AUTOMATIONS.map(entry => entry.id)).size).toBe(9);
    expect(new Set(AUTOMATIONS.map(entry => entry.shippedFlag)).size).toBe(9);
  });

  it('names a real shipped flag for each one', () => {
    for (const entry of AUTOMATIONS) {
      expect(entry.shippedFlag, entry.id).toMatch(/^auto[A-Z]/);
    }
  });

  it('gates every one on a signal that can actually be measured', () => {
    // An unlock keyed to a signal nothing feeds would never open, which is
    // indistinguishable to the player from a bug.
    for (const entry of AUTOMATIONS) {
      expect(TRACKED_SIGNALS.has(entry.signal), `${entry.id} gated on ${entry.signal}`).toBe(true);
    }
  });

  it('asks for a reachable amount', () => {
    for (const entry of AUTOMATIONS) {
      expect(entry.goal, entry.id).toBeGreaterThan(0);
      expect(Number.isFinite(entry.goal), entry.id).toBe(true);
    }
  });

  it('says what each one costs as well as what it does', () => {
    // An automation with only upside is one nobody would decline, and then
    // it is a default with extra steps.
    for (const entry of AUTOMATIONS) {
      expect(entry.name.trim(), entry.id).not.toBe('');
      expect(entry.effect.trim(), entry.id).not.toBe('');
      expect(entry.tradeoff.trim(), entry.id).not.toBe('');
    }
  });

  it('marks only what this build can honour as available', () => {
    /*
     * Still only `burst`, and Phase 8 did not change that despite building
     * summoning and recycling. `available` is a claim that the *shell wires
     * this flag to the running simulation*, not that the rules exist — and
     * `ui/architecture.test.ts` enforces exactly that correspondence. It
     * caught an attempt to flip these two on the strength of the rules alone.
     *
     * What the wiring waits on is a wallet: the simulation carries no gold,
     * shards or boss tears, so there is nothing for an automatic summon to
     * spend or an automatic recycle to pay into. That is Phase 10's.
     */
    const available = availableAutomations();
    expect(available.map(entry => entry.id)).toEqual(['burst']);
    for (const entry of AUTOMATIONS) {
      expect(entry.available, entry.id).toBe(available.includes(entry));
    }
  });

  it('looks one up, and admits when it cannot', () => {
    expect(automationById('burst')?.shippedFlag).toBe('autoBurstEnabled');
    expect(automationById('summon')?.available).toBe(false);
  });
});
