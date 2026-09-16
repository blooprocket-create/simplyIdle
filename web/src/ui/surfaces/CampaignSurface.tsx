import { getActForWave } from '../../content/acts';
import { getMonsterForWave, isBossWave } from '../../content/monsters';
import { CHAPTER_WAVES, chapterStartWave } from '../../engine/combat/chapters';
import { barFraction } from '../../game/fx/ratio';
import type { SurfaceProps } from './SurfaceProps';
import { Empty, Meter, Row, Rows, Section } from './parts/parts';

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

export function CampaignSurface({ snapshot }: SurfaceProps) {
  const wave = snapshot.wave;
  const act = getActForWave(wave);
  const start = chapterStartWave(wave);
  // Where this chapter has got to. A wipe sends the team back to `start`, so
  // this is the thing actually at stake in the next fight.
  const throughChapter = (wave - start) / CHAPTER_WAVES;
  const monster = getMonsterForWave(wave);
  const teamPercent = Math.round(barFraction(snapshot.team.hp, snapshot.team.maxHp) * 100);

  return (
    <Section title={`Act ${act.id} — ${act.name}`}>
      <Rows>
        <Row label="Wave" hint={isBossWave(wave) ? 'Boss wave' : `Chapter starts at ${start}`}>
          {wave}
        </Row>
        <Row label="Facing">
          {monster.emoji} {monster.name}
        </Row>
        <Row label="Act boss" hint={unlockHint(act.unlock)}>
          Wave {act.bossWave}
        </Row>
        <Row label="Enemy health" hint={`Team at ${teamPercent}%`}>
          {snapshot.enemy === null
            ? 'Between waves'
            : `${Math.round(barFraction(snapshot.enemy.hp, snapshot.enemy.maxHp) * 100)}%`}
        </Row>
      </Rows>
      <Meter fraction={throughChapter} tone="gold" label="Progress through this chapter" />
      <Empty>{act.theme}</Empty>
    </Section>
  );
}
