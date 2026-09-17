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
     * `burst` and now `castHeroActives`. Phase 8 did not change this despite
     * building summoning and recycling: `available` is a claim that the *shell
     * wires this flag to the running simulation*, not that the rules exist —
     * and `ui/architecture.test.ts` enforces exactly that correspondence. It
     * caught an attempt to flip those two on the strength of the rules alone.
     *
     * Abilities earned it the other way round, which is the distinction worth
     * keeping: the rules were ported in Phase 10, then stepped by the fight,
     * then given a bar with a button on it — and only then was the flag
     * flipped. Each of those three was its own commit, because the first two
     * are exactly the state that looks finished and plays as though the system
     * is missing.
     *
     * Three more arrived together when the gate was widened. It had required
     * the shell to call `loopRef.setAuto…` for every available automation,
     * which is right for `burst` and has no shape at all for one that spends
     * currency or rearranges a roster — so `summon`, `recycle` and `dismantle`
     * are honoured by `app/automationRunner.ts` instead, on the shell's save
     * cadence. Their other blocker was a wallet the simulation could not fill;
     * it earns and banks boss tears now.
     *
     * The four still listed and unavailable each wait on something real:
     * `equipBest` on a rule nobody has ported or measured, `tempo` on heat,
     * and the two usable-item ones on usable items.
     */
    const available = availableAutomations();
    expect(available.map(entry => entry.id)).toEqual(['burst', 'castHeroActives', 'summon', 'recycle', 'dismantle']);
    for (const entry of AUTOMATIONS) {
      expect(entry.available, entry.id).toBe(available.includes(entry));
    }
  });

  it('looks one up, and admits when it cannot', () => {
    expect(automationById('burst')?.shippedFlag).toBe('autoBurstEnabled');
    // `equipBest` took `summon`'s place here when Phase 10 wired the
    // save-side automations. It is the one left, and for a different reason:
    // no rule for it has been ported or measured.
    expect(automationById('equipBest')?.available).toBe(false);
  });
});
