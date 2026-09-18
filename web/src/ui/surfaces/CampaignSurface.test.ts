import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { STORY_BEAT_COUNT, STORY_BEATS } from '../../content/story';
import { readSave } from '../../engine/save/v3';
import type { SaveV3 } from '../../engine/save/schema';
import { nextBeatHint, storyView } from './CampaignSurface';

/**
 * The Campaign surface's story panel: what to show, and what the next beat is
 * waiting on.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

function save(seenIds: string[] = []): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 20 },
      story: { seenIds },
    },
    { nowMs: 0, content: CONTENT },
  );
}

describe('which beat the panel shows', () => {
  it('shows the earliest unlocked one that has not been read', () => {
    const view = storyView(save(), { highestWave: 25, prestigeCount: 0 });
    expect(view.unread?.id).toBe('prologue_ash');
    expect(view.unreadCount).toBe(3);
  });

  it('moves on once that one is read', () => {
    const view = storyView(save(['prologue_ash']), { highestWave: 25, prestigeCount: 0 });
    expect(view.unread?.id).toBe('chapter_1_raiders');
    expect({ unread: view.unreadCount, read: view.readCount }).toEqual({ unread: 2, read: 1 });
  });

  it('shows nothing when everything unlocked has been read', () => {
    const view = storyView(save(['prologue_ash']), { highestWave: 5, prestigeCount: 0 });
    expect(view.unread).toBeNull();
    expect(view.unreadCount).toBe(0);
  });
});

describe('what the next-beat row says', () => {
  it('names the wave when that is what is missing', () => {
    expect(nextBeatHint(storyView(save(), { highestWave: 5, prestigeCount: 0 }))).toBe('Wave 10');
  });

  it('names the rebirth when the wave is already past', () => {
    /*
     * At wave 200 with no rebirths the earliest unread beat is
     * `ascension_first`, gated at **wave 100** — a wave the player passed a
     * hundred ago. Quoting that wave would be the shipped ordering bug in a
     * different costume; what it wants is a rebirth.
     */
    const hint = nextBeatHint(storyView(save(), { highestWave: 200, prestigeCount: 0 }));
    expect(hint).toBe('Needs rebirth 1');
  });

  it('names both when both are missing', () => {
    // Wave 550 with ten rebirths: everything below 600 is open, and the last
    // beat wants both a deeper wave and fifteen more rebirths.
    const hint = nextBeatHint(storyView(save(), { highestWave: 550, prestigeCount: 10 }));
    expect(hint).toBe('Wave 600, and rebirth 25');
  });

  it('says so once every beat is unlocked', () => {
    const view = storyView(save(STORY_BEATS.map(beat => beat.id)), { highestWave: 9_999, prestigeCount: 99 });
    expect(nextBeatHint(view)).toBe('Every beat unlocked');
    expect(view.readCount).toBe(STORY_BEAT_COUNT);
  });
});
