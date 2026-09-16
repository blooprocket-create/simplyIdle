import { ACTS } from '../../content/acts';
import { HERO_POOL, HERO_TEMPLATE_COUNT, heroClassesInPool } from '../../content/heroes';
import { MONSTER_POOL, getMonsterForWave, isBossWave } from '../../content/monsters';
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
  // A monster is "met" once the player has been to a wave that spawns it.
  const seen = new Set<string>();
  for (let wave = 1; wave <= Math.min(reached, MONSTER_POOL.length * 10); wave += 1) {
    seen.add(getMonsterForWave(wave).name);
  }

  return (
    <>
      <Section title="Bestiary">
        <Cards>
          {MONSTER_POOL.map((monster, index) => {
            // The pool cycles every wave, so this is the first wave it can be
            // met on — the useful fact for someone deciding where to push.
            const firstWave = index + 1;
            return (
              <Card key={monster.name} title={`${monster.emoji} ${monster.name}`} badge={`Wave ${firstWave}`}>
                {seen.has(monster.name) ? <Tag tone="good">Met</Tag> : <Tag>Unseen</Tag>}
                {isBossWave((index + 1) * 10) && <Tag tone="warn">Crowned at {(index + 1) * 10}</Tag>}
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
