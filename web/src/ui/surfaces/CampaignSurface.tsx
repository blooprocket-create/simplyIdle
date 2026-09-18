import { getActForWave } from '../../content/acts';
import { bossMechanicForAct } from '../../content/bossMechanics';
import { getMonsterForWave, isBossWave } from '../../content/monsters';
import { CHAPTER_WAVES, chapterStartWave } from '../../engine/combat/chapters';
import { barFraction } from '../../game/fx/ratio';
import { missingGate, nextBeat, STORY_BEAT_COUNT, type StoryBeat, type StoryProgress } from '../../content/story';
import { unreadBeats } from '../../engine/progression/story';
import type { SaveV3 } from '../../engine/save/schema';
import type { SurfaceProps } from './SurfaceProps';
import { Empty, Meter, Row, Rows, Section } from './parts/parts';

/**
 * The story, on the screen the story is about.
 *
 * A `dashboard` cannot scroll nineteen beats, and it does not need to: what a
 * player wants here is the one they have not read and a line saying what the
 * next one is waiting on. The full list is the Codex's job.
 */
export interface StoryView {
  /** The earliest unlocked beat they have not read, or null. */
  unread: StoryBeat | null;
  unreadCount: number;
  readCount: number;
  next: StoryBeat | null;
  /** What the next one is waiting on. Null when there is no next one. */
  needs: { wave: boolean; prestige: boolean } | null;
}

export function storyView(save: SaveV3, progress: StoryProgress): StoryView {
  const unread = unreadBeats(save, progress);
  const next = nextBeat(progress);
  return {
    unread: unread[0] ?? null,
    unreadCount: unread.length,
    readCount: save.story.seenIds.length,
    next,
    needs: next === null ? null : missingGate(next, progress),
  };
}

/** What the next-beat row says, which is the gate rather than always a wave. */
export function nextBeatHint(view: StoryView): string {
  if (view.next === null) return 'Every beat unlocked';
  if (view.needs?.prestige && !view.needs.wave) return `Needs rebirth ${view.next.unlockPrestige}`;
  if (view.needs?.prestige) return `Wave ${view.next.unlockWave}, and rebirth ${view.next.unlockPrestige}`;
  return `Wave ${view.next.unlockWave}`;
}

/**
 * Where the fight is. A `dashboard`, so the fight stays visible behind it —
 * which matters more here than anywhere: this is the screen a player opens to
 * decide whether to keep pushing, and deciding that while the battle is
 * paused is deciding it blind.
 *
 * Which is also why it is short. A dashboard is "a few big numbers and their
 * controls. No list, so nothing to scroll", and it is sized to the panel
 * rather than given a scroller. A first version of this listed all six acts
 * as cards; they ran off the bottom and the shelf covered them, because an
 * archetype that does not scroll cannot hold a list. The full act list is in
 * the Codex, which is a ledger and can.
 */
/**
 * Acts name their unlock with a content id — `advanced_consumables`. Printing
 * that raw is printing a database key at the player.
 */
function unlockHint(unlock: string | null): string {
  if (unlock === null) return 'Nothing further to unlock';
  const words = unlock.replace(/_/g, ' ');
  return `Unlocks ${words}`;
}

export function CampaignSurface({ snapshot, profile, save, actions }: SurfaceProps) {
  const wave = snapshot.wave;
  const act = getActForWave(wave);
  const start = chapterStartWave(wave);
  // Where this chapter has got to. A wipe sends the team back to `start`, so
  // this is the thing actually at stake in the next fight.
  const throughChapter = (wave - start) / CHAPTER_WAVES;
  const monster = getMonsterForWave(wave);
  /*
   * What this act's boss will ask for. Named here rather than only in the
   * fight: the mechanic's window is under a second and a half, so a player
   * meeting it for the first time mid-swing has no chance to prepare for it.
   * This is the screen they open to decide whether to push on, which makes it
   * the screen that owes them what pushing on involves.
   *
   * It costs no height. A dashboard is sized to the panel and does not
   * scroll, and adding a fifth row for this clipped the last line by five
   * pixels on desktop — so the mechanic's name joins a hint that was already
   * there, and its tell takes the line the act's theme had. The theme is
   * flavour and lives in the Codex; the tell is the thing to act on, and
   * this is the screen for acting.
   */
  const mechanic = bossMechanicForAct(act.id);
  const teamPercent = Math.round(barFraction(snapshot.team.hp, snapshot.team.maxHp) * 100);
  // The record rather than this run: a beat unlocks on the deepest wave the
  // account ever reached, so wiping back a chapter does not lock the story.
  const story = storyView(save, {
    highestWave: Math.max(profile.highestWave, snapshot.wave),
    prestigeCount: profile.prestigeCount,
  });

  return (
    <>
      <Section title={`Act ${act.id} — ${act.name}`}>
        <Rows>
          <Row label="Wave" hint={isBossWave(wave) ? 'Boss wave' : `Chapter starts at ${start}`}>
            {wave}
          </Row>
          <Row label="Facing">
            {monster.emoji} {monster.name}
          </Row>
          <Row label="Act boss" hint={`${mechanic.name} · ${unlockHint(act.unlock)}`}>
            Wave {act.bossWave}
          </Row>
          <Row label="Enemy health" hint={`Team at ${teamPercent}%`}>
            {snapshot.enemy === null
              ? 'Between waves'
              : `${Math.round(barFraction(snapshot.enemy.hp, snapshot.enemy.maxHp) * 100)}%`}
          </Row>
        </Rows>
        <Meter fraction={throughChapter} tone="gold" label="Progress through this chapter" />
        <Empty>{mechanic.tell}</Empty>
      </Section>

      <Section title="Story">
        <Rows>
          {story.unread === null ? (
            <Row label="Nothing new" hint={`${story.readCount} of ${STORY_BEAT_COUNT} read`}>
              —
            </Row>
          ) : (
            <Row label={`${story.unread.chapter} — ${story.unread.title}`} hint={story.unread.body}>
              <button type="button" onClick={() => actions.markStoryBeatSeen(story.unread!.id)}>
                {story.unreadCount > 1 ? `Read (${story.unreadCount} waiting)` : 'Read'}
              </button>
            </Row>
          )}
          <Row label="Next beat" hint={nextBeatHint(story)}>
            {story.next === null ? 'Complete' : story.next.title}
          </Row>
        </Rows>
      </Section>
    </>
  );
}
