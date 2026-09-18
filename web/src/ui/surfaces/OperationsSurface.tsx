import { useEffect, useState } from 'react';
import { LOCKPICK_ATTEMPTS, LOCKPICK_MAX_CODE, LOCKPICK_MIN_CODE, type ReconOutcome } from '../../content/miniOps';
import {
  bountyOffers,
  bountyStanding,
  dealRecon,
  lockpickCode,
  lockpickGuess,
  miniOpNotes,
  miniOpRows,
  rollDice,
  targetMeterStart,
  targetMeterTick,
  targetScore,
  type BountyStandingRow,
  type LockpickHint,
  type MiniOpContext,
  type MiniOpRow,
  type TargetMeter,
} from '../../app/miniOpActions';
import { currentEvent } from '../../app/calendarActions';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Meter, Row, Rows, Section, Tag } from './parts/parts';

/**
 * Operations: four things to press, and a writ.
 *
 * A `ledger` — a list of entries with their own controls, which is what this
 * is once the animations are set aside.
 *
 * **The player plays; the engine pays.** Every round is set up and resolved
 * here — the dice are rolled, the cards dealt, the code picked, the meter run
 * — and the engine is only ever told how it went. That is not a shortcut: it
 * is the shipped seam (no screen in the old game leaves the outcome to the
 * reducer) and the engine boundary (no generator, no clock) agreeing.
 *
 * The decisions are pure functions in `app/miniOpActions.ts` and tested there.
 * What is left in this file is which of them to call and what to draw.
 */

/** How long until this op comes back, in the words a player wants. */
export function readyIn(readyInMs: number): string {
  if (readyInMs <= 0) return 'Ready';
  const minutes = Math.ceil(readyInMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** What the lockpick hint says, in one line. */
export function hintText(hint: LockpickHint): string {
  if (hint.cracked) return 'Cache open.';
  if (hint.jammed) return 'Lockout. The mechanism jams.';
  const digit = (where: string, answer: 'higher' | 'lower' | 'correct') =>
    answer === 'correct' ? `${where} correct` : `${where} ${answer}`;
  return `${digit('Tens', hint.tens)}, ${digit('ones', hint.ones)}. ${hint.attemptsLeft} left.`;
}

/** What a writ's row says under its title. */
export function writHint(row: BountyStandingRow): string {
  const noun = row.bounty.metric === 'wave' ? 'wave' : row.bounty.metric === 'summons' ? 'summons' : 'kills';
  return `${formatDamage(row.current)} of ${formatDamage(row.bounty.targetValue)} ${noun}`;
}

/**
 * The two things the shipped game never tells anyone.
 *
 * A boss wave pays every gold reward here six times over, and the weekly shard
 * event does nothing to target practice until the account is deep enough to
 * clear the floor. Both reproduced exactly; both said out loud, because a
 * timing choice a player can see is a choice.
 */
export function noteLines(notes: ReturnType<typeof miniOpNotes>, shardMultiplier: number): string[] {
  const lines: string[] = [`Each operation comes back every ${notes.cooldownHours} hours.`];
  if (notes.onBossWave) {
    lines.push('You are standing on a boss wave — every gold payout here is worth about seven times as much.');
  } else {
    lines.push('Gold payouts follow the wave underfoot. A boss wave is worth about seven times its neighbours.');
  }
  if (shardMultiplier > 1) {
    lines.push(
      notes.eventReaches
        ? `The weekly event is multiplying target-practice shards by ${shardMultiplier}.`
        : `The weekly event's ${shardMultiplier}x shards do not clear target practice's minimum yet — go deeper first.`,
    );
  }
  return lines;
}

type Round =
  | { kind: 'none' }
  | { kind: 'dice'; roll: number }
  | { kind: 'recon'; cards: ReconOutcome[]; picked: ReconOutcome | null }
  | { kind: 'lockpick'; code: number; guess: string; used: number; hint: LockpickHint | null }
  | { kind: 'target'; meter: TargetMeter; stopped: number | null };

export function OperationsSurface({ save, snapshot, actions }: SurfaceProps) {
  const [round, setRound] = useState<Round>({ kind: 'none' });
  const [said, setSaid] = useState<string | null>(null);

  // The meter only runs while a target round is open, and the interval is torn
  // down with it — a surface that leaves a timer behind is a surface that
  // keeps ticking after the player has closed it.
  useEffect(() => {
    if (round.kind !== 'target' || round.stopped !== null) return;
    const id = setInterval(() => {
      setRound(current =>
        current.kind === 'target' && current.stopped === null
          ? { ...current, meter: targetMeterTick(current.meter) }
          : current,
      );
    }, 40);
    return () => clearInterval(id);
  }, [round.kind, round.kind === 'target' ? round.stopped : null]);

  const nowMs = Date.now();
  const context: MiniOpContext = {
    save,
    nowMs,
    wave: snapshot.wave,
    highestWave: save.progression.highestWave,
  };
  const shardMultiplier = currentEvent(save).shardMultiplier;
  const rows = miniOpRows(save, nowMs);
  const notes = miniOpNotes(context, shardMultiplier);
  const writ = bountyStanding(save, {
    kills: save.progression.totalKills,
    wave: snapshot.wave,
    summons: save.summon.totalSummons,
  });

  const announce = (paid: { gained: { gold: number; shards: number; diamonds: number } } | null, missed: string) => {
    if (paid === null) {
      setSaid(missed);
      return;
    }
    const parts: string[] = [];
    if (paid.gained.gold > 0) parts.push(`${formatDamage(paid.gained.gold)} gold`);
    if (paid.gained.shards > 0) parts.push(`${formatDamage(paid.gained.shards)} shards`);
    if (paid.gained.diamonds > 0) parts.push(`${formatDamage(paid.gained.diamonds)} diamonds`);
    setSaid(parts.length > 0 ? `Collected ${parts.join(', ')}.` : 'Collected nothing.');
    setRound({ kind: 'none' });
  };

  const opRow = (id: MiniOpRow['op']['id']) => rows.find(row => row.op.id === id) as MiniOpRow;

  return (
    <>
      <Section title="Operations">
        <Rows>
          {noteLines(notes, shardMultiplier).map(line => (
            <Row key={line} label={line}>
              {' '}
            </Row>
          ))}
          {said !== null && (
            <Row label="Last result">
              <Tag tone="good">{said}</Tag>
            </Row>
          )}
        </Rows>
      </Section>

      <Section title="Ready now">
        <Cards>
          {rows.map(row => (
            <Card key={row.op.id} title={row.op.name} badge={readyIn(row.readyInMs)}>
              <span>{row.op.blurb}</span>
            </Card>
          ))}
        </Cards>
      </Section>

      <Section title="Dice Protocol">
        <Rows>
          <Row
            label={round.kind === 'dice' ? `Rolled ${round.roll} of 20` : 'One roll, every four hours'}
            hint={readyIn(opRow('dice').readyInMs)}
          >
            <span>
              <button
                type="button"
                disabled={!opRow('dice').ready || round.kind === 'dice'}
                onClick={() => setRound({ kind: 'dice', roll: rollDice(Math.random) })}
              >
                Roll
              </button>
              {round.kind === 'dice' && (
                <button type="button" onClick={() => announce(actions.playDice(round.roll), 'Not ready yet.')}>
                  Collect
                </button>
              )}
            </span>
          </Row>
        </Rows>
      </Section>

      <Section title="Recon Sweep">
        {round.kind === 'recon' ? (
          <Cards>
            {round.cards.map((card, index) => (
              <Card key={`${card}-${index}`} title={round.picked === null ? `Card ${index + 1}` : card}>
                <button
                  type="button"
                  disabled={round.picked !== null}
                  onClick={() => {
                    setRound({ ...round, picked: card });
                    announce(actions.playRecon(card), 'Not ready yet.');
                  }}
                >
                  Take it
                </button>
              </Card>
            ))}
          </Cards>
        ) : (
          <Rows>
            <Row label="Three sealed cards, one pick" hint={readyIn(opRow('recon').readyInMs)}>
              <button
                type="button"
                disabled={!opRow('recon').ready}
                onClick={() => setRound({ kind: 'recon', cards: dealRecon(Math.random), picked: null })}
              >
                Sweep
              </button>
            </Row>
          </Rows>
        )}
      </Section>

      <Section title="Lockpick Cache">
        {round.kind === 'lockpick' ? (
          <Rows>
            <Row
              label={`A code from ${LOCKPICK_MIN_CODE} to ${LOCKPICK_MAX_CODE}`}
              hint={round.hint === null ? `${LOCKPICK_ATTEMPTS} attempts` : hintText(round.hint)}
            >
              <span>
                <input
                  type="number"
                  value={round.guess}
                  aria-label="Code"
                  onChange={event => setRound({ ...round, guess: event.target.value })}
                />
                <button
                  type="button"
                  disabled={round.hint?.cracked === true || round.hint?.jammed === true}
                  onClick={() => {
                    const hint = lockpickGuess(round.code, Number(round.guess), round.used);
                    setRound({ ...round, used: round.used + 1, hint, guess: '' });
                    if (hint.cracked || hint.jammed) {
                      announce(actions.playLockpick(hint.cracked), 'Not ready yet.');
                    }
                  }}
                >
                  Try it
                </button>
              </span>
            </Row>
          </Rows>
        ) : (
          <Rows>
            <Row label="Two digits, three guesses" hint={readyIn(opRow('lockpick').readyInMs)}>
              <button
                type="button"
                disabled={!opRow('lockpick').ready}
                onClick={() =>
                  setRound({ kind: 'lockpick', code: lockpickCode(Math.random), guess: '', used: 0, hint: null })
                }
              >
                Crack
              </button>
            </Row>
          </Rows>
        )}
      </Section>

      <Section title="Target Practice">
        {round.kind === 'target' ? (
          <Rows>
            <Row label="Stop it in the middle" hint={`Score ${targetScore(round.meter.position)}`}>
              <span>
                <Meter fraction={round.meter.position / 100} tone="neutral" label="Meter" />
                <button
                  type="button"
                  disabled={round.stopped !== null}
                  onClick={() => {
                    const score = targetScore(round.meter.position);
                    setRound({ ...round, stopped: score });
                    announce(actions.playTarget(score, shardMultiplier), 'Not ready yet.');
                  }}
                >
                  Fire
                </button>
              </span>
            </Row>
          </Rows>
        ) : (
          <Rows>
            <Row label="One shot, scored by how close you got" hint={readyIn(opRow('target').readyInMs)}>
              <button
                type="button"
                disabled={!opRow('target').ready}
                onClick={() => setRound({ kind: 'target', meter: targetMeterStart(), stopped: null })}
              >
                Take aim
              </button>
            </Row>
          </Rows>
        )}
      </Section>

      <Section title="Bounty Writ">
        {writ !== null ? (
          <Rows>
            <Row label={writ.bounty.title} hint={writHint(writ)}>
              <span>
                <Meter fraction={writ.progress} tone={writ.met ? 'good' : 'neutral'} label="Progress" />
                <button
                  type="button"
                  disabled={!writ.met}
                  onClick={() => announce(actions.claimBounty(), 'Not there yet.')}
                >
                  {writ.met ? 'Collect' : 'Not yet'}
                </button>
                <button type="button" onClick={() => actions.abandonBounty()}>
                  Abandon
                </button>
              </span>
            </Row>
          </Rows>
        ) : (
          <Cards>
            {bountyOffers(context).map(offer => (
              <Card key={offer.draft} title={offer.title} badge={`+${offer.targetDelta} ${offer.metric}`}>
                <span>
                  {formatDamage(offer.reward.gold)} gold · {formatDamage(offer.reward.shards)} shards ·{' '}
                  {offer.reward.diamonds} diamonds
                </span>
                <button type="button" onClick={() => actions.acceptBounty(offer.draft)}>
                  Accept
                </button>
              </Card>
            ))}
          </Cards>
        )}
      </Section>
    </>
  );
}
