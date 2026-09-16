import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, TRACKED_SIGNALS, isTracked, trackedAchievements } from '../../content/achievements';
import { emptySnapshot, type SimulationSnapshot } from '../../engine/types';
import { emptyProfile, type PlayerProfile, type RosterEntry } from '../profile/playerProfile';
import { measure, trackOf, tracks } from './measure';

function hero(over: Partial<RosterEntry> & { uid: string }): RosterEntry {
  return {
    templateId: 'h1',
    name: 'Someone',
    emoji: '🙂',
    heroClass: 'warrior',
    tier: 1,
    rarity: 'common',
    level: 1,
    rank: 0,
    teamBoost: 0.05,
    role: 'front',
    active: false,
    ...over,
  };
}

function profileWith(over: Partial<PlayerProfile>): PlayerProfile {
  return { ...emptyProfile(), ...over };
}

function snapshotAt(wave: number): SimulationSnapshot {
  return { ...emptySnapshot(), wave };
}

describe('measuring an achievement signal', () => {
  it('produces a figure for every signal it claims to track', () => {
    // The set and the switch can disagree. If they do, a signal advertised as
    // tracked shows the player "not tracked yet" forever, which is worse than
    // never advertising it.
    const profile = profileWith({ roster: [hero({ uid: 'a', active: true })] });
    for (const signal of TRACKED_SIGNALS) {
      expect(measure(signal, profile, emptySnapshot()), signal).not.toBeNull();
    }
  });

  it('refuses a signal nothing feeds yet', () => {
    // `totalSummons` is a real shipped signal with no home in this build.
    expect(measure('totalSummons', emptyProfile(), emptySnapshot())).toBeNull();
    expect(measure('vipLevel', emptyProfile(), emptySnapshot())).toBeNull();
  });

  it('reads the player figures off the profile', () => {
    const profile = profileWith({ level: 42, prestigeCount: 3, highestWave: 90, totalKills: 1_000 });
    expect(measure('level', profile, emptySnapshot())).toBe(42);
    expect(measure('prestigeCount', profile, emptySnapshot())).toBe(3);
    expect(measure('highestWaveReached', profile, emptySnapshot())).toBe(90);
    expect(measure('totalKills', profile, emptySnapshot())).toBe(1_000);
  });

  it('takes the wave from whichever source is further on', () => {
    // The snapshot is this run and the profile is the record. A player who
    // just reloaded should not see their wave achievements go backwards.
    const profile = profileWith({ wave: 12, highestWave: 50 });
    expect(measure('wave', profile, snapshotAt(3))).toBe(12);
    expect(measure('wave', profile, snapshotAt(80))).toBe(80);
  });

  it('counts the roster the way the shipped conditions did', () => {
    const roster = [
      hero({ uid: 'a', active: true, heroClass: 'warrior', level: 999, rank: 10, rarity: 'godly' }),
      hero({ uid: 'b', active: true, heroClass: 'mage', rarity: 'transcendent' }),
      hero({ uid: 'c', active: false, heroClass: 'mage' }),
    ];
    const profile = profileWith({ roster, slotsUnlocked: 4 });
    expect(measure('heroRosterCount', profile, emptySnapshot())).toBe(3);
    expect(measure('equippedCount', profile, emptySnapshot())).toBe(2);
    expect(measure('activeTeamClassCount', profile, emptySnapshot())).toBe(2);
    expect(measure('teamSlotCount', profile, emptySnapshot())).toBe(4);
    expect(measure('maxHeroLevelCount', profile, emptySnapshot())).toBe(1);
    expect(measure('maxHeroRankCount', profile, emptySnapshot())).toBe(1);
    expect(measure('godlyHeroCount', profile, emptySnapshot())).toBe(1);
    expect(measure('transcendentHeroCount', profile, emptySnapshot())).toBe(1);
  });

  it('counts a benched hero towards the roster but not the team', () => {
    const profile = profileWith({ roster: [hero({ uid: 'benched', active: false })] });
    expect(measure('heroRosterCount', profile, emptySnapshot())).toBe(1);
    expect(measure('equippedCount', profile, emptySnapshot())).toBe(0);
    expect(measure('activeTeamClassCount', profile, emptySnapshot())).toBe(0);
  });
});

describe('an achievement track', () => {
  it('is null for one this build cannot measure', () => {
    const untracked = ACHIEVEMENTS.find(entry => !isTracked(entry));
    expect(untracked).toBeDefined();
    if (untracked) expect(trackOf(untracked, emptyProfile(), emptySnapshot())).toBeNull();
  });

  it('reports a fraction inside nothing and done, for every tracked one', () => {
    const profile = profileWith({
      level: 500,
      totalKills: 1e9,
      prestigeCount: 40,
      roster: [hero({ uid: 'a', active: true })],
      wallet: { ...emptyProfile().wallet, totalGold: 1e18, heroShards: 1e6, essence: 1e6, bossTears: 1e6 },
    });
    for (const entry of trackedAchievements()) {
      const track = trackOf(entry, profile, snapshotAt(4_000));
      expect(track, entry.id).not.toBeNull();
      if (!track) continue;
      expect(track.fraction, entry.id).toBeGreaterThanOrEqual(0);
      expect(track.fraction, entry.id).toBeLessThanOrEqual(1);
      expect(Number.isFinite(track.fraction), entry.id).toBe(true);
    }
  });

  it('is done exactly when the figure reaches the goal', () => {
    const kills = ACHIEVEMENTS.find(entry => entry.signal === 'totalKills' && entry.goal === 100);
    expect(kills).toBeDefined();
    if (!kills) return;
    expect(trackOf(kills, profileWith({ totalKills: 99 }), emptySnapshot())?.done).toBe(false);
    expect(trackOf(kills, profileWith({ totalKills: 100 }), emptySnapshot())?.done).toBe(true);
    expect(trackOf(kills, profileWith({ totalKills: 101 }), emptySnapshot())?.done).toBe(true);
  });

  it('spells a goal too large to read as digits', () => {
    const track = trackOf(
      { id: 'x', name: 'x', description: 'x', emoji: '🙂', signal: 'totalGold', goal: 1e15 },
      profileWith({ wallet: { ...emptyProfile().wallet, totalGold: 1e12 } }),
      emptySnapshot(),
    );
    // Asserting only "no e+" could not fail: `String(1e15)` is already all
    // digits. What is meant is that a figure this size is *spelled* — given
    // a suffix — rather than printed as sixteen characters of zeroes.
    expect(track?.detail).toMatch(/[A-Za-z]/);
    expect(track?.detail).not.toMatch(/\d{10}/);
    expect(track?.detail).toMatch(/\//);
  });

  it('lists every tracked achievement, in one stable order', () => {
    const first = tracks(emptyProfile(), emptySnapshot());
    expect(first.map(entry => entry.id)).toEqual(tracks(emptyProfile(), emptySnapshot()).map(entry => entry.id));
    expect(first.length).toBe(trackedAchievements().length);
    // Done ones come last: the ledger is for what is left.
    const profile = profileWith({ totalKills: 1e9 });
    const ordered = tracks(profile, emptySnapshot());
    const firstDone = ordered.findIndex(entry => entry.done);
    if (firstDone >= 0) expect(ordered.slice(firstDone).every(entry => entry.done)).toBe(true);
  });

  it('does not lose a Decimal wallet figure on the way to a fraction', () => {
    const track = trackOf(
      { id: 'x', name: 'x', description: 'x', emoji: '🙂', signal: 'totalGold', goal: 100 },
      profileWith({ wallet: { ...emptyProfile().wallet, totalGold: new Decimal('1e400').toNumber() } }),
      emptySnapshot(),
    );
    expect(track?.done).toBe(true);
    expect(track?.fraction).toBe(1);
  });
});
