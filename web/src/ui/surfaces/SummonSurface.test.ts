import { describe, expect, it } from 'vitest';
import { SUMMON_MILESTONES } from '../../content/summon';
import { nextMilestone } from './SummonSurface';

/**
 * The one branch on the Summon surface that is not a render.
 *
 * There is no React testing stack in this tree, by choice — surfaces describe
 * data and are held to `ui/architecture.test.ts`, and anything with a decision
 * in it lives somewhere that can be called without mounting a component.
 */

describe('the milestone a player is working towards', () => {
  it('names the first one they have not reached', () => {
    expect(nextMilestone([], 0)?.threshold).toBe(10);
    expect(nextMilestone([], 9)?.threshold).toBe(10);
    // Reached but not yet claimed is still not "working towards" it.
    expect(nextMilestone([], 10)?.threshold).toBe(50);
  });

  it('skips one already claimed', () => {
    expect(nextMilestone([10], 4)?.threshold).toBe(50);
    expect(nextMilestone([10, 50], 4)?.threshold).toBe(100);
  });

  it('skips a claimed one even when the count is behind it', () => {
    /*
     * `claimMilestones` collects *every* unclaimed threshold at or below the
     * count at once, so an account can hold a claim for a milestone its own
     * counter has since been reduced past — a restored save, a support
     * adjustment. Showing them a target they already collected would be a
     * progress bar that never fills.
     */
    expect(nextMilestone([10, 50, 100], 12)?.threshold).toBe(250);
  });

  it('runs out rather than looping', () => {
    const all = SUMMON_MILESTONES.map(entry => entry.threshold);
    expect(nextMilestone(all, 5_000)).toBeNull();
    // And the count alone is enough to exhaust it.
    expect(nextMilestone([], Math.max(...all))).toBeNull();
  });

  it('carries the reward label the player is shown', () => {
    // Read from the catalogue rather than rebuilt, because the two apps share
    // accounts and the string is what the player recognises.
    expect(nextMilestone([], 0)?.rewardLabel).toBe(SUMMON_MILESTONES[0].rewardLabel);
  });
});
