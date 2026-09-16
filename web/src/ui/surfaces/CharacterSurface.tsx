import { getClassProfile } from '../../content/classes';
import { formatDamage } from '../../format/bigNumber';
import { CLASS_COPY, STAT_COPY, statOrder } from '../copy/classes';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Row, Rows, Section, Tag } from './parts/parts';

/**
 * The player, at length. A `detail` surface: one thing, scrolled by the host.
 *
 * Stats are shown as the class's base plus what the player has spent, because
 * a bare total answers "how much" and not "how much of this did I choose" —
 * which is the question anyone looking at a character sheet is actually
 * asking before they spend a point.
 */
export function CharacterSurface({ profile }: SurfaceProps) {
  if (!profile.created || profile.playerClass === null) {
    return <Empty>No character yet. Pick a class and this fills in.</Empty>;
  }

  const copy = CLASS_COPY[profile.playerClass];
  const base = getClassProfile(profile.playerClass).baseStats;

  return (
    <>
      <Section title="Character">
        <Rows>
          <Row label="Name">{profile.name || 'Unnamed'}</Row>
          <Row label="Class">
            {copy.emoji} {copy.name}
          </Row>
          <Row label="Level">{profile.level}</Row>
          <Row label="Furthest wave" hint="Across this run">
            {profile.highestWave}
          </Row>
          {profile.prestigeCount > 0 && <Row label="Rebirths">{profile.prestigeCount}</Row>}
        </Rows>
        <Empty>{copy.blurb}</Empty>
      </Section>

      <Section title={profile.stats.unspent > 0 ? `Stats — ${profile.stats.unspent} unspent` : 'Stats'}>
        <Rows>
          {statOrder().map(stat => {
            const spent = profile.stats.alloc[stat];
            return (
              <Row key={stat} label={STAT_COPY[stat].label} hint={STAT_COPY[stat].effect}>
                {base[stat] + spent}
                {spent > 0 && <span> (+{spent})</span>}
              </Row>
            );
          })}
        </Rows>
      </Section>

      <Section title="Class passive">
        <Rows>
          <Row label={copy.passive.name}>{copy.passive.effect}</Row>
        </Rows>
      </Section>

      <Section title="Wallet">
        <Cards>
          <Card title="Gold" badge="🪙">
            {formatDamage(profile.wallet.gold)}
          </Card>
          <Card title="Diamonds" badge="💎">
            {formatDamage(profile.wallet.diamonds)}
          </Card>
          <Card title="Hero shards" badge="🔹">
            {formatDamage(profile.wallet.heroShards)}
          </Card>
          <Card title="Essence" badge="✨">
            {formatDamage(profile.wallet.essence)}
          </Card>
        </Cards>
        <Empty>
          <Tag tone="gold">Spent in Summon and Rebirth</Tag>
        </Empty>
      </Section>
    </>
  );
}
