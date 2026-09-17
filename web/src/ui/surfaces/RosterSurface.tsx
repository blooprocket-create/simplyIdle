import { HERO_TEMPLATE_COUNT } from '../../content/heroes';
import { SPARK_EXCHANGE_OPTIONS } from '../../content/summon';
import { HERO_LEVEL_CAP, HERO_RANK_CAP, heroGoldLevelCost, rankUpShardCost } from '../../engine/roster/progression';
import { TEAM_SLOT_UNLOCK_RULES } from '../../engine/roster/team';
import { formatDamage } from '../../format/bigNumber';
import { CLASS_COPY } from '../copy/classes';
import { RARITY_TONE } from '../copy/rarities';
import { heldGold } from '../profile/playerProfile';
import type { RosterEntry } from '../profile/playerProfile';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Row, Rows, Section, Tag } from './parts/parts';
import styles from './RosterSurface.module.css';

/**
 * Every hero the player owns, and what they can do to them. A `ledger`: the
 * one archetype that really runs on, so the host gives it the screen and one
 * axis of scroll.
 *
 * Ordered by `rosterOrder` rather than here — the team first, then the
 * strongest — because a roster that sorts differently depending on which
 * screen you opened it from is a roster nobody can learn.
 *
 * Every button here is gated on the same rule that would refuse it, rather
 * than on a guess: `heroGoldLevelCost` prices the level and the purse is read
 * against it, so a button that looks affordable is one the engine will honour.
 * The alternative — enable everything and let the refusal happen — is a button
 * that does nothing, which is the worst thing a button can do.
 */

/** What the run has earned, plus what was banked. The same figure Character shows. */
function spendableGold(props: SurfaceProps): number {
  return heldGold(props.profile, props.snapshot).toNumber();
}

export function RosterSurface(props: SurfaceProps) {
  const { profile, actions } = props;
  if (profile.roster.length === 0) {
    return <Empty>No heroes yet. There are {HERO_TEMPLATE_COUNT} to find; Summon is where they come from.</Empty>;
  }

  const gold = spendableGold(props);
  const shards = profile.wallet.heroShards;
  const spark = profile.wallet.sparkTokens;
  const active = profile.roster.filter(hero => hero.active);
  const benched = profile.roster.filter(hero => !hero.active);
  const nextSlot = TEAM_SLOT_UNLOCK_RULES[profile.slotsUnlocked + 1];

  const heroCard = (hero: RosterEntry) => {
    const levelCost = heroGoldLevelCost(hero.level);
    const rankCost = rankUpShardCost(hero.rarity, hero.rank + 1);
    const canLevel = hero.level < HERO_LEVEL_CAP && gold >= levelCost;
    const canRank = hero.rank < HERO_RANK_CAP && shards >= rankCost;

    return (
      <Card key={hero.uid} title={`${hero.emoji} ${hero.name}`} badge={`Lv ${hero.level}`}>
        <span>
          {CLASS_COPY[hero.heroClass].name} · {hero.role}
        </span>
        <span>
          <Tag tone={RARITY_TONE[hero.rarity]}>{hero.rarity}</Tag>
          {hero.rank > 0 && <Tag tone="gold">Rank {hero.rank}</Tag>}
        </span>
        <div className={styles.verbs}>
          <button
            type="button"
            className={styles.verb}
            disabled={!canLevel}
            onClick={() => actions.spendOnHero(hero.uid, 'level')}
          >
            Level · {formatDamage(levelCost)}🪙
          </button>
          <button
            type="button"
            className={styles.verb}
            disabled={!canRank}
            onClick={() => actions.spendOnHero(hero.uid, 'rank')}
          >
            Rank · {formatDamage(rankCost)}🔹
          </button>
          <button
            type="button"
            className={styles.verb}
            onClick={() => actions.fieldTeam(teamAfterToggling(active, hero))}
          >
            {hero.active ? 'Bench' : 'Field'}
          </button>
          {/*
            Only for a benched hero, and not because a fielded one is harder to
            handle — `recycleHero` refuses them outright. Offering a button the
            engine will always refuse is the button that does nothing.
          */}
          {!hero.active && (
            <button
              type="button"
              className={`${styles.verb} ${styles.destructive}`}
              onClick={() => actions.recycle(hero.uid)}
            >
              Recycle
            </button>
          )}
        </div>
      </Card>
    );
  };

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
          <Row label="Gold" hint="Banked, plus this run">
            {formatDamage(gold)}
          </Row>
          <Row label="Hero shards">{formatDamage(shards)}</Row>
          {nextSlot && (
            <Row label="Next slot" hint={`Needs wave ${nextSlot.requiredWave}`}>
              <button
                type="button"
                className={styles.verb}
                disabled={
                  profile.highestWave < nextSlot.requiredWave || gold < nextSlot.goldCost || shards < nextSlot.shardCost
                }
                onClick={() => actions.buySlot()}
              >
                {formatDamage(nextSlot.goldCost)}🪙 + {formatDamage(nextSlot.shardCost)}🔹
              </button>
            </Row>
          )}
        </Rows>
      </Section>

      <Section title="Spark exchange">
        {/*
          Filed here rather than on Summon, which is a `moment` and does not
          scroll — six priced rows do not fit one. It belongs with the wallet
          anyway: this is the screen where gold and shards are already spent,
          and the hero a purchase hands over lands in Reserve below, where the
          player is already looking.
        */}
        <Rows>
          <Row label="Spark tokens" hint="Paid out by duplicate summons">
            {formatDamage(spark)}
          </Row>
          {/*
            The charge count, so the one option that hands over no hero still
            has a visible effect on the screen the player bought it from.
          */}
          <Row label="Free summon charges" hint="Spent before either currency">
            {props.save.summon.freeCharges}
          </Row>
          {SPARK_EXCHANGE_OPTIONS.map(option => (
            <Row key={option.id} label={option.label}>
              <button
                type="button"
                className={styles.verb}
                disabled={!actions.canAffordSpark(option.id)}
                onClick={() => actions.sparkExchange(option.id)}
              >
                {formatDamage(option.sparkCost)}⚡
              </button>
            </Row>
          ))}
        </Rows>
      </Section>

      {active.length > 0 && (
        <Section title="On the team">
          <Cards>{active.map(heroCard)}</Cards>
        </Section>
      )}

      {benched.length > 0 && (
        <Section title="Reserve">
          <Cards>{benched.map(heroCard)}</Cards>
        </Section>
      )}
    </>
  );
}

/**
 * The team a field-or-bench press is asking for.
 *
 * Asking rather than commanding: `fieldTeam` replays the request through the
 * selection rules, so a fifth front-ranker is dropped by the engine rather
 * than refused by the screen. The button therefore always *does* something
 * legible — it either fields them or it does not, and the roster redraws
 * either way.
 */
export function teamAfterToggling(active: readonly RosterEntry[], hero: RosterEntry): string[] {
  const uids = active.map(entry => entry.uid);
  return hero.active ? uids.filter(uid => uid !== hero.uid) : [...uids, hero.uid];
}
