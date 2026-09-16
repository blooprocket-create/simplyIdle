import { ACTS } from '../../content/acts';
import { HERO_POOL, HERO_TEMPLATE_COUNT, heroClassesInPool } from '../../content/heroes';
import { MONSTER_POOL, firstWaveFor, isBossWave, poolEntryForWave } from '../../content/monsters';
import { CLASS_COPY } from '../copy/classes';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Row, Rows, Section, Tag } from './parts/parts';

/**
 * What is in the game, as opposed to what the player has. A `ledger`.
 *
 * Every monster is listed whether or not it has been met: this is the
 * reference, and a reference that hides what you have not seen is one you
 * cannot plan against. What the player *has* reached is marked instead.
 */
export function CodexSurface({ snapshot, profile }: SurfaceProps) {
  const reached = Math.max(profile.highestWave, snapshot.wave);
  /*
   * Met once the player has been to a wave that draws on that entry — in
   * either form. Matching on the *shown* name instead left Ancient Dragon
   * permanently unseen: it is last in the pool, so its ordinary slot is wave
   * 10, 20, 30, every one of which is a boss wave, and it therefore never
   * spawns uncrowned for the name to match.
   */
  const seen = new Set<string>();
  for (let wave = 1; wave <= Math.min(reached, MONSTER_POOL.length * 10); wave += 1) {
    seen.add(poolEntryForWave(wave).name);
  }

  return (
    <>
      <Section title="Bestiary">
        <Cards>
          {MONSTER_POOL.map((monster, index) => {
            // Scanned rather than taken from the index: the two cycles
            // interleave, so position in the pool is not the wave it arrives
            // on. This card used to promise Ancient Dragon at wave 10, which
            // is a Slime King.
            const firstWave = firstWaveFor(monster.name);
            const crownedAt = (index + 1) * 10;
            return (
              <Card
                key={monster.name}
                title={`${monster.emoji} ${monster.name}`}
                badge={firstWave === null ? undefined : `Wave ${firstWave}`}
              >
                {seen.has(monster.name) ? <Tag tone="good">Met</Tag> : <Tag>Unseen</Tag>}
                {isBossWave(crownedAt) && <Tag tone="warn">Crowned at {crownedAt}</Tag>}
              </Card>
            );
          })}
        </Cards>
      </Section>

      <Section title="Classes">
        <Cards>
          {heroClassesInPool().map(heroClass => {
            const copy = CLASS_COPY[heroClass];
            const count = HERO_POOL.filter(hero => hero.heroClass === heroClass).length;
            return (
              <Card key={heroClass} title={`${copy.emoji} ${copy.name}`} badge={`${count} heroes`}>
                <span>{copy.blurb}</span>
                <span>
                  <Tag tone="gold">{copy.passive.name}</Tag>
                </span>
              </Card>
            );
          })}
        </Cards>
      </Section>

      <Section title="Acts">
        <Cards>
          {ACTS.map(act => {
            const cleared = reached > (act.endWave ?? Number.POSITIVE_INFINITY);
            const here = reached >= act.startWave && !cleared;
            return (
              <Card
                key={act.id}
                title={`${act.emoji} ${act.name}`}
                badge={act.endWave === null ? `${act.startWave}+` : `${act.startWave}–${act.endWave}`}
              >
                <span>{act.theme}</span>
                <span>
                  {cleared && <Tag tone="good">Cleared</Tag>}
                  {here && <Tag tone="gold">Here</Tag>}
                  {!cleared && !here && <Tag>Ahead</Tag>}
                </span>
              </Card>
            );
          })}
        </Cards>
      </Section>

      <Section title="The world">
        <Rows>
          <Row label="Acts">{ACTS.length}</Row>
          <Row label="Monsters" hint="Each returns crowned as a boss">
            {MONSTER_POOL.length}
          </Row>
          <Row label="Heroes">{HERO_TEMPLATE_COUNT}</Row>
          <Row label="Furthest wave">{reached}</Row>
        </Rows>
      </Section>
    </>
  );
}
