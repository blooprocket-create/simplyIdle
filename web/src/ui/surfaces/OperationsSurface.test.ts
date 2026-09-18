import { describe, expect, it } from 'vitest';
import { WEEKLY_EVENTS } from '../../content/weeklyEvents';
import { MINI_OP_COOLDOWN_MS } from '../../content/miniOps';
import { hintText, noteLines, readyIn, writHint } from './OperationsSurface';
import type { BountyStandingRow } from '../../app/miniOpActions';

/**
 * What the Operations screen decides, tested without rendering it.
 *
 * The rule the whole `ui/` layer runs on: a surface exports the decisions and
 * draws them, and the decisions are what a test can hold. There is no React
 * testing stack here and there does not need to be one.
 */

const notes = (over: Partial<ReturnType<typeof baseNotes>> = {}) => ({ ...baseNotes(), ...over });
const baseNotes = () => ({ onBossWave: false, eventReaches: false, cooldownHours: 4 });

describe('the clock on each op', () => {
  it('says Ready rather than a zero', () => {
    expect(readyIn(0)).toBe('Ready');
    expect(readyIn(-1)).toBe('Ready');
  });

  it('rounds up, so a button never says zero minutes while still shut', () => {
    expect(readyIn(1)).toBe('1m');
    expect(readyIn(59_000)).toBe('1m');
    expect(readyIn(61_000)).toBe('2m');
  });

  it('breaks into hours past the hour', () => {
    expect(readyIn(3_600_000)).toBe('1h 0m');
    expect(readyIn(MINI_OP_COOLDOWN_MS)).toBe('4h 0m');
    expect(readyIn(2 * 3_600_000 + 90_000)).toBe('2h 2m');
  });
});

describe('the lockpick hint', () => {
  it('reports both digits separately, which is what makes three guesses enough', () => {
    expect(hintText({ cracked: false, tens: 'lower', ones: 'higher', attemptsLeft: 2, jammed: false })).toBe(
      'Tens lower, ones higher. 2 left.',
    );
    expect(hintText({ cracked: false, tens: 'correct', ones: 'lower', attemptsLeft: 1, jammed: false })).toBe(
      'Tens correct, ones lower. 1 left.',
    );
  });

  it('says so when it opens, and when it jams', () => {
    expect(hintText({ cracked: true, tens: 'correct', ones: 'correct', attemptsLeft: 2, jammed: false })).toBe(
      'Cache open.',
    );
    expect(hintText({ cracked: false, tens: 'lower', ones: 'lower', attemptsLeft: 0, jammed: true })).toContain(
      'Lockout',
    );
  });
});

describe('the writ line', () => {
  const row = (metric: 'kills' | 'wave' | 'summons', current: number, target: number): BountyStandingRow => ({
    bounty: {
      id: 'b',
      draft: metric === 'wave' ? 'push' : metric === 'summons' ? 'recruit' : 'assault',
      title: 'T',
      metric,
      startValue: 0,
      targetValue: target,
      reward: { gold: 0, shards: 0, diamonds: 0 },
    },
    current,
    progress: current / target,
    met: current >= target,
  });

  it('names the metric the writ is actually measured on', () => {
    expect(writHint(row('wave', 50, 58))).toContain('wave');
    expect(writHint(row('kills', 10, 130))).toContain('kills');
    expect(writHint(row('summons', 30, 38))).toContain('summons');
  });

  it('shows where the player stands against the target', () => {
    expect(writHint(row('wave', 50, 58))).toBe('50 of 58 wave');
  });
});

describe('what the screen says out loud', () => {
  it('always states the cooldown, because no field in the game does', () => {
    expect(noteLines(notes(), 1)[0]).toBe('Each operation comes back every 4 hours.');
  });

  it('says when the player is standing on a boss wave, and what it is worth', () => {
    /*
     * Every gold payout here is priced off the wave underfoot and a boss wave
     * pays seven times its neighbours — 1,160,586 gold on wave 50 against
     * 190,278 on wave 51. The shipped game never mentions it, which makes it a
     * secret handshake rather than a choice.
     */
    const standing = noteLines(notes({ onBossWave: true }), 1);
    expect(standing.some(line => line.includes('standing on a boss wave'))).toBe(true);
    const between = noteLines(notes({ onBossWave: false }), 1);
    expect(between.some(line => line.includes('standing on a boss wave'))).toBe(false);
    // Said either way, so a player learns the rule before they are on one.
    expect(between.some(line => line.includes('seven times'))).toBe(true);
  });

  it('says nothing about the weekly event on a week that has none', () => {
    expect(noteLines(notes(), 1).some(line => line.includes('weekly event'))).toBe(false);
  });

  it('distinguishes an event that is reaching the player from one that is not', () => {
    /*
     * The floor on target practice is applied after the multiply, so at wave
     * one six of the eight weeks pay an identical 140. Telling a shallow
     * account that a 1.5x shard week is running would be true and useless;
     * telling them it does not clear the minimum yet is neither.
     */
    const reaching = noteLines(notes({ eventReaches: true }), 2.5);
    expect(reaching.some(line => line.includes('multiplying target-practice shards by 2.5'))).toBe(true);

    const short = noteLines(notes({ eventReaches: false }), 1.5);
    expect(short.some(line => line.includes('do not clear'))).toBe(true);
    expect(short.some(line => line.includes('multiplying'))).toBe(false);
  });

  it('has a line for every multiplier the table actually runs', () => {
    // Nothing in the eight weeks produces a case this cannot describe.
    for (const event of WEEKLY_EVENTS) {
      const lines = noteLines(notes({ eventReaches: event.shardMultiplier >= 2 }), event.shardMultiplier);
      expect(lines.length).toBe(event.shardMultiplier > 1 ? 3 : 2);
    }
  });
});
