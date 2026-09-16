import { HERO_TEMPLATE_COUNT } from '../../content/heroes';
import type { Rarity } from '../../content/rarities';
import { CLASS_COPY } from '../copy/classes';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Row, Rows, Section, Tag, type Tone } from './parts/parts';

/**
 * Every hero the player owns. A `ledger`: the one archetype that really runs
 * on, so the host gives it the screen and one axis of scroll.
 *
 * Ordered by `rosterOrder` rather than here — the team first, then the
 * strongest — because a roster that sorts differently depending on which
 * screen you opened it from is a roster nobody can learn.
 */

/**
 * Rarity as a tone. Deliberately coarse: the token sheet has a closed set of
 * meanings and eight rarities may not each claim one, so they group.
 *
 * Keyed off the rarity rather than the hero's tier — an earlier version used
 * tier, which is a different axis, so every tag came out the same colour
 * while the label underneath said otherwise.
 */
const RARITY_TONE: Record<Rarity, Tone> = {
  common: 'neutral',
  uncommon: 'neutral',
  rare: 'good',
  epic: 'good',
  legendary: 'gold',
  mythic: 'gold',
  godly: 'warn',
  transcendent: 'warn',
};

export function RosterSurface({ profile }: SurfaceProps) {
  if (profile.roster.length === 0) {
    return <Empty>No heroes yet. There are {HERO_TEMPLATE_COUNT} to find; Summon is where they come from.</Empty>;
  }

  const active = profile.roster.filter(hero => hero.active);
  const benched = profile.roster.filter(hero => !hero.active);

  return (
    <>
      <Section title="Summary">
        <Rows>
          <Row label="Owned" hint={`of ${HERO_TEMPLATE_COUNT} in the game`}>
            {profile.roster.length}
          </Row>
          <Row label="On the team" hint={`${profile.slotsUnlocked} slots unlocked`}>
            {active.length}
          </Row>
        </Rows>
      </Section>

      {active.length > 0 && (
        <Section title="On the team">
          <Cards>
            {active.map(hero => (
              <Card key={hero.uid} title={`${hero.emoji} ${hero.name}`} badge={`Lv ${hero.level}`}>
                <span>
                  {CLASS_COPY[hero.heroClass].name} · {hero.role}
                </span>
                <span>
                  <Tag tone={RARITY_TONE[hero.rarity]}>{hero.rarity}</Tag>
                  {hero.rank > 0 && <Tag tone="gold">Rank {hero.rank}</Tag>}
                </span>
              </Card>
            ))}
          </Cards>
        </Section>
      )}

      {benched.length > 0 && (
        <Section title="Reserve">
          <Cards>
            {benched.map(hero => (
              <Card key={hero.uid} title={`${hero.emoji} ${hero.name}`} badge={`Lv ${hero.level}`}>
                <span>
                  {CLASS_COPY[hero.heroClass].name} · {hero.role}
                </span>
                <span>
                  <Tag tone={RARITY_TONE[hero.rarity]}>{hero.rarity}</Tag>
                </span>
              </Card>
            ))}
          </Cards>
        </Section>
      )}
    </>
  );
}
