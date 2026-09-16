import { CLASS_COPY } from '../copy/classes';
import { formatDamage } from '../../format/bigNumber';
import type { FormationRole } from '../../engine/combat/formation';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Meter, Section } from './parts/parts';

/**
 * Who is fighting, right now. A `dashboard`: a few things and no list to run
 * on, so it sits over the battle as a panel rather than taking the screen.
 *
 * It reads the cast for who is there and the snapshot for what they are
 * doing, which is the same split the renderer makes — a hero's name is not
 * per-frame state and a swing timer is nothing else.
 */

const RANK_LABEL: Record<FormationRole, string> = {
  front: 'Front',
  mid: 'Middle',
  back: 'Back',
};

const RANKS: readonly FormationRole[] = ['front', 'mid', 'back'];

export function PartySurface({ cast, snapshot, profile }: SurfaceProps) {
  if (cast.length === 0) return <Empty>Nobody on the field. Summon a hero and they appear here.</Empty>;

  const swingByUid = new Map(snapshot.heroes.map(hero => [hero.uid, hero]));
  // The cast says who is on the field and where they stand; it does not carry
  // a class, because the renderer does not need one. The profile does.
  const classByUid = new Map(profile.roster.map(hero => [hero.uid, hero.heroClass]));

  return (
    <>
      {RANKS.map(rank => {
        const inRank = cast.filter(member => member.role === rank);
        if (inRank.length === 0) return null;
        return (
          <Section key={rank} title={`${RANK_LABEL[rank]} rank`}>
            <Cards>
              {inRank.map(member => {
                const live = swingByUid.get(member.uid);
                const swing = live?.swingProgress ?? 0;
                const heroClass = classByUid.get(member.uid);
                return (
                  <Card
                    key={member.uid}
                    title={member.name}
                    badge={heroClass === undefined ? undefined : CLASS_COPY[heroClass].emoji}
                  >
                    <Meter fraction={swing} tone="good" label={`${member.name} swing timer`} />
                    <span>{live ? `${formatDamage(live.damagePerHit)} a hit` : 'Not swinging'}</span>
                    {heroClass !== undefined && <span>{CLASS_COPY[heroClass].name}</span>}
                  </Card>
                );
              })}
            </Cards>
          </Section>
        );
      })}
      <Section title="This wave">
        <Cards>
          <Card title="Kills" badge="⚔️">
            {snapshot.totals.kills}
          </Card>
          <Card title="Wipes" badge="💀">
            {snapshot.totals.deaths}
          </Card>
          <Card title="Dealt" badge="🔥">
            {formatDamage(snapshot.totals.dealt)}
          </Card>
          <Card title="Overkill" badge="🩸">
            {formatDamage(snapshot.totals.overkill)}
          </Card>
        </Cards>
      </Section>
    </>
  );
}
