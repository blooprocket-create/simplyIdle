import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/story.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { isUnlocked, missingGate, nextBeat, STORY_BEATS, storyBeatById } from '../../content/story';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import { markBeatSeen, readStory, unreadBeats } from './story';

/**
 * The story beats: the shipped nineteen, in the order a player reaches them.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const OPTIONS = { nowMs: 0, content: CONTENT };
const DEEP = { highestWave: 9_999, prestigeCount: 99 };

function save(seenIds: string[] = []): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      story: { seenIds },
    },
    OPTIONS,
  );
}

describe('the catalogue', () => {
  it('is the shipped nineteen, with their prose', () => {
    expect(
      STORY_BEATS.map(beat => ({
        id: beat.id,
        chapter: beat.chapter,
        title: beat.title,
        body: beat.body,
        unlockWave: beat.unlockWave,
        unlockPrestige: beat.unlockPrestige ?? null,
      })).sort((left, right) => left.id.localeCompare(right.id)),
    ).toEqual([...fixture.beats].sort((left, right) => left.id.localeCompare(right.id)));
  });

  it('is sorted by unlock wave, and the shipped one is not', () => {
    /*
     * The shipped array runs …200, 180, 300, 400, 250, 500, 300, 600, and
     * `GameScreen` maps it in that order — both to list the story and to
     * decide what to call "next".
     */
    expect(fixture.inWaveOrder).toBe(false);
    const waves = STORY_BEATS.map(beat => beat.unlockWave);
    expect(waves).toEqual([...waves].sort((left, right) => left - right));
  });

  it('keeps the authored order where two beats share a wave', () => {
    // A stable sort, so the two at wave 100 and the two at 300 stay as the
    // writer put them rather than being reshuffled by the fix.
    const atHundred = STORY_BEATS.filter(beat => beat.unlockWave === 100).map(beat => beat.id);
    const authoredAtHundred = fixture.beats.filter(beat => beat.unlockWave === 100).map(beat => beat.id);
    expect(atHundred).toEqual(authoredAtHundred);
  });
});

describe('what comes next', () => {
  it('is the nearest locked beat, on every wave the shipped game got wrong', () => {
    /*
     * The shipped screen takes the first locked entry in *array* order. The
     * fixture scanned every wave from 1 to 620 and found two stretches where
     * that is not the nearest one: 150–179 and 200–249.
     *
     * Checked against those exact waves rather than in general, because they
     * are the ones a reader can go and confirm.
     */
    for (const row of fixture.misleadingNextAt) {
      const next = nextBeat({ highestWave: row.wave, prestigeCount: 99 })!;
      expect({ wave: row.wave, id: next.id, at: next.unlockWave }).toEqual({
        wave: row.wave,
        id: row.nearestIs,
        at: row.atNearestWave,
      });
    }
  });

  it('answers null once every beat is unlocked', () => {
    expect(nextBeat(DEEP)).toBeNull();
    expect(nextBeat({ highestWave: 0, prestigeCount: 0 })!.unlockWave).toBe(1);
  });

  it('takes the prestige gate into account as well as the wave', () => {
    const gated = STORY_BEATS.filter(beat => beat.unlockPrestige !== undefined);
    expect(gated.length).toBe(5);
    for (const beat of gated) {
      expect(isUnlocked(beat, { highestWave: 9_999, prestigeCount: 0 })).toBe(false);
      expect(isUnlocked(beat, { highestWave: 9_999, prestigeCount: beat.unlockPrestige! })).toBe(true);
    }
  });

  it('says what a locked beat is actually waiting on', () => {
    /*
     * The earliest unread beat is not always the soonest one: at wave 200
     * with no prestige, the next beat is `ascension_first` at **wave 100** —
     * a wave the player passed a hundred ago. What it wants is a prestige.
     *
     * A screen quoting the wave there would be the ordering bug again in a
     * different costume, so `missingGate` names the gate rather than leaving
     * the caller to assume it is the wave.
     */
    const deepButFresh = { highestWave: 200, prestigeCount: 0 };
    const next = nextBeat(deepButFresh)!;
    expect({ id: next.id, unlockWave: next.unlockWave }).toEqual({ id: 'ascension_first', unlockWave: 100 });
    expect(missingGate(next, deepButFresh)).toEqual({ wave: false, prestige: true });

    const shallow = { highestWave: 5, prestigeCount: 0 };
    expect(missingGate(nextBeat(shallow)!, shallow)).toEqual({ wave: true, prestige: false });
  });
});

describe('marking one read', () => {
  const first = STORY_BEATS[0].id;

  it('records it once, and refuses a repeat', () => {
    const once = markBeatSeen(save(), first)!;
    expect(once.story.seenIds).toEqual([first]);
    expect(markBeatSeen(once, first)).toBeNull();
  });

  it('refuses an id nobody wrote, where the shipped reducer records it', () => {
    // The shipped list takes any string — measured. Here the check is on the
    // verb as well as the reader, which is what every other collection does.
    expect(fixture.seen[2].recorded).toEqual(['not_a_beat']);
    expect(markBeatSeen(save(), 'not_a_beat')).toBeNull();
  });

  it('lists what is unlocked and still unread, in unlock order', () => {
    const unread = unreadBeats(save([first]), { highestWave: 20, prestigeCount: 0 });
    expect(unread.map(beat => beat.id)).toEqual(['chapter_1_raiders', 'chapter_2_verdant']);
    expect(unreadBeats(save(), { highestWave: 0, prestigeCount: 0 })).toEqual([]);
  });
});

describe('the stored list', () => {
  it('drops an id the catalogue has retired, and de-duplicates', () => {
    expect(readStory({ seenIds: ['prologue_ash', 'prologue_ash', 'gone'] }).seenIds).toEqual(['prologue_ash']);
    expect(readStory({ seenStoryBeatIds: ['prologue_ash'] }, true).seenIds).toEqual(['prologue_ash']);
    expect(readStory(null).seenIds).toEqual([]);
  });

  it('round-trips through a migration and back out', () => {
    const migrated = migrateSave({ saveVersion: 2, seenStoryBeatIds: ['prologue_ash', 'nonsense'] }, OPTIONS);
    expect(migrated.legacy.seenStoryBeatIds).toBeUndefined();
    expect(migrated.story.seenIds).toEqual(['prologue_ash']);
    expect((toLegacyPayload(migrated) as { seenStoryBeatIds: string[] }).seenStoryBeatIds).toEqual(['prologue_ash']);
  });

  it('looks one up, and admits when it cannot', () => {
    expect(storyBeatById('prologue_ash')?.unlockWave).toBe(1);
    expect(storyBeatById('not_a_beat')).toBeNull();
  });
});
