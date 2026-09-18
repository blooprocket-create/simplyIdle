import { isUnlocked, STORY_BEATS, storyBeatById, type StoryBeat, type StoryProgress } from '../../content/story';
import { boundedStringList, isRecord, MAX_SAVE_COLLECTION } from '../save/guards';
import type { SaveV3 } from '../save/schema';

/**
 * Story beats already read.
 *
 * `MARK_STORY_BEAT_SEEN` has no validation at all — the shipped list takes any
 * string — so the check happens on the way in here instead, which is what
 * every other collection in this save does. A stored id with no beat behind it
 * is how a retired beat leaves an old save.
 */
export function readStory(raw: unknown, legacy = false): { seenIds: string[] } {
  const source = legacy ? (isRecord(raw) ? raw.seenStoryBeatIds : null) : isRecord(raw) ? raw.seenIds : null;
  const ids = [...new Set(boundedStringList(source, MAX_SAVE_COLLECTION))];
  return { seenIds: ids.filter(id => storyBeatById(id) !== null) };
}

/** Back out under the shipped name. */
export function storyToLegacy(story: { seenIds: string[] }): Record<string, unknown> {
  return { seenStoryBeatIds: [...story.seenIds] };
}

/** Mark one read. Null when it is not a beat, or was already read. */
export function markBeatSeen(save: SaveV3, id: string): SaveV3 | null {
  if (storyBeatById(id) === null) return null;
  if (save.story.seenIds.includes(id)) return null;
  return { ...save, story: { seenIds: [...save.story.seenIds, id] } };
}

/** Beats unlocked and not yet read, in the order they unlock. */
export function unreadBeats(save: SaveV3, progress: StoryProgress): StoryBeat[] {
  return STORY_BEATS.filter(beat => isUnlocked(beat, progress) && !save.story.seenIds.includes(beat.id));
}
