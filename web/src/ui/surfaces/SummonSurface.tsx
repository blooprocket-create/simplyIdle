import { useState } from 'react';
import { getHeroTemplate } from '../../content/heroes';
import { SUMMON_MILESTONES } from '../../content/summon';
import { PITY_THRESHOLD, SOFT_PITY_START } from '../../engine/roster/summon';
import type { SummonOutcome, SummonPayment } from '../../engine/roster/summonSave';
import { formatDamage } from '../../format/bigNumber';
import { RARITY_TONE } from '../copy/rarities';
import type { SurfaceProps } from './SurfaceProps';
import { Empty, Meter, Row, Rows, Section, Tag } from './parts/parts';
import styles from './SummonSurface.module.css';

/**
 * Summoning. A `moment`: it takes the screen and dims the fight, because the
 * reveal is the point and a hero arriving behind a half-transparent panel is
 * not a reveal.
 *
 * Which is also why there is no card grid here. A `moment` does not scroll —
 * `ui/architecture.test.ts` refuses a `<Cards>` under one — so what a player
 * needs while deciding whether to pull has to fit: what it costs, what they
 * hold, how close the guarantee is, and what the next milestone gives. The
 * banner list belongs on a `ledger`, and nothing selects a banner yet anyway.
 *
 * The last pull is local state rather than something read back from the save.
 * The save records that a hero *arrived*; which one was most recent is a fact
 * about this visit to this screen, and storing it would make the reveal
 * reappear on a reload as though it had just happened.
 */

/**
 * The milestone a summon count is working towards, if any are left.
 *
 * Exported so it can be tested without a render — there is no React testing
 * stack here, by choice: surfaces are held to `ui/architecture.test.ts` and
 * everything with a branch in it lives somewhere that can be called.
 *
 * Both conditions matter. `threshold > total` is the "working towards" part,
 * and skipping the claimed ones is what stops an account that jumped past
 * several — `claimMilestones` collects every unclaimed one at once — from being
 * shown a target it has already collected.
 */
export function nextMilestone(claimed: readonly number[], total: number) {
  return SUMMON_MILESTONES.find(entry => entry.threshold > total && !claimed.includes(entry.threshold)) ?? null;
}

export function SummonSurface({ save, actions }: SurfaceProps) {
  const [last, setLast] = useState<SummonOutcome | null>(null);

  const free = save.summon.freeCharges;
  const counter = save.summon.pityCounter;
  const milestone = nextMilestone(save.summon.claimedMilestones, save.summon.totalSummons);
  const template = last ? getHeroTemplate(last.hero.id) : undefined;

  const pull = (pay: SummonPayment) => setLast(actions.summon(pay) ?? last);

  return (
    <>
      <Section title={last ? 'Arrived' : 'Summon'}>
        {last && template ? (
          <div className={styles.reveal}>
            <span className={styles.portrait}>{template.emoji}</span>
            <span className={styles.name}>{template.name}</span>
            <Tag tone={RARITY_TONE[last.rarity]}>{last.rarity}</Tag>
            <span className={styles.aside}>
              {last.pityTriggered && 'Pity answered. '}
              {/*
                The rolled rarity is shown only when the tier clamp moved it,
                because otherwise it is the same word twice — and when it did
                move, a player who rolled mythic and received a legendary is
                owed the explanation rather than left to think the game lied.
              */}
              {last.rolledRarity !== last.rarity && `Rolled ${last.rolledRarity}, clamped by tier. `}
              {last.duplicate && `Duplicate — ${last.sparkGained} spark. `}
              {last.relicsGranted.length > 0 && 'A unique relic came with it. '}
              {last.milestonesClaimed.length > 0 && `Milestone ${last.milestonesClaimed.join(', ')} claimed.`}
            </span>
          </div>
        ) : (
          <Empty>Heroes come from here. Every pull is a hero; what changes is how good.</Empty>
        )}
      </Section>

      <Section title="Cost">
        <div className={styles.buys}>
          {(['bossTears', 'diamonds'] as const).map(pay => (
            <button
              key={pay}
              type="button"
              className={free > 0 ? `${styles.buy} ${styles.free}` : styles.buy}
              disabled={!actions.canSummon(pay)}
              onClick={() => pull(pay)}
            >
              {pay === 'bossTears' ? '💧' : '💎'} {free > 0 ? 'Free' : formatDamage(actions.priceOfSummon(pay))}
            </button>
          ))}
        </div>
        <Rows>
          <Row label="Boss tears">{formatDamage(save.wallet.bossTears)}</Row>
          <Row label="Diamonds">{formatDamage(save.wallet.diamonds)}</Row>
          <Row label="Free charges" hint="Spent before either currency">
            {free}
          </Row>
          <Row label="Spark tokens" hint="Paid for duplicates">
            {formatDamage(save.wallet.sparkTokens)}
          </Row>
        </Rows>
      </Section>

      <Section title="Pity">
        <Meter
          fraction={counter / PITY_THRESHOLD}
          tone={counter >= SOFT_PITY_START ? 'gold' : 'neutral'}
          label={`${counter} / ${PITY_THRESHOLD} to a guaranteed legendary`}
        />
        <Rows>
          <Row label="Pulls" hint="Since the last legendary or better">
            {counter}
          </Row>
          <Row label="Improved odds" hint={`From ${SOFT_PITY_START} pulls, and rising each one`}>
            {counter >= SOFT_PITY_START ? 'Running' : `In ${SOFT_PITY_START - counter}`}
          </Row>
          {save.summon.guaranteedMinRarity !== null && (
            <Row label="Promised" hint="The next pull, at least">
              <Tag tone={RARITY_TONE[save.summon.guaranteedMinRarity]}>{save.summon.guaranteedMinRarity}</Tag>
            </Row>
          )}
        </Rows>
      </Section>

      <Section title="Milestones">
        {milestone ? (
          <>
            <Meter
              fraction={save.summon.totalSummons / milestone.threshold}
              label={`${save.summon.totalSummons} / ${milestone.threshold} summons`}
            />
            <Rows>
              <Row label="Next" hint={`At ${milestone.threshold} summons`}>
                {milestone.rewardLabel}
              </Row>
              <Row label="Claimed">{save.summon.claimedMilestones.length}</Row>
            </Rows>
          </>
        ) : (
          <Empty>Every milestone claimed. {save.summon.totalSummons} summons and counting.</Empty>
        )}
      </Section>
    </>
  );
}
