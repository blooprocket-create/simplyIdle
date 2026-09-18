import {
  REFRESH_COST,
  boardRows,
  dueCount,
  refreshInMs,
  runningRows,
  type BoardRow,
  type RunningRow,
} from '../../app/expeditionActions';
import { MAX_RUNNING } from '../../engine/expeditions/contracts';
import type { SaveV3 } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Meter, Row, Rows, Section } from './parts/parts';

/**
 * Expeditions: five destinations, each offering one contract, and the ones
 * already out.
 *
 * A `ledger` — two lists to spend down.
 *
 * **The board is the game.** Each destination offers one rarity, rolled
 * uniformly, and that is what a player may send there — the way to get a
 * different tier is to wait eight hours or pay a hundred thousand gold to
 * reroll. An earlier version of this screen drew the five *tiers* and let the
 * player choose, which turned a board into a menu and made a godly contract
 * available on demand. The shipped reducer allows exactly that if asked, and
 * the only reason it never happens is that its screen does not ask.
 *
 * **The wait is real here.** The shipped game stores a duration and never
 * checks it, so an eight-hour contract finishes the instant it starts; this
 * one does not, and the row says how long is left rather than offering a
 * button that would be a lie either way.
 */

/** How long is left, in words. Minutes below an hour, hours above. */
export function remainingLabel(row: RunningRow): string {
  if (row.due) return 'Ready';
  const minutes = Math.ceil(row.remainingMs / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m left`;
}

/** What a contract row says under its title. */
export function contractHint(contract: {
  durationMs: number;
  reward: { diamonds: number; shards: number; essence: number };
}): string {
  const minutes = Math.round(contract.durationMs / 60_000);
  const time = minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
  const reward = [
    `${contract.reward.diamonds} 💎`,
    `${contract.reward.shards} shards`,
    contract.reward.essence > 0 ? `${contract.reward.essence} essence` : null,
  ].filter((part): part is string => part !== null);
  return `${time} · ${reward.join(' · ')}`;
}

/** What a board row says under the destination's name. */
export function boardHint(row: BoardRow): string {
  return `${row.rarity} · ${contractHint(row.contract)}`;
}

/** How long until the board rerolls itself, in words. */
export function refreshLabel(msLeft: number): string {
  if (msLeft <= 0) return 'New contracts now';
  const minutes = Math.ceil(msLeft / 60_000);
  if (minutes < 60) return `New contracts in ${minutes}m`;
  return `New contracts in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function expeditionView(save: SaveV3, nowMs: number, random: () => number = Math.random) {
  return {
    running: runningRows(save, nowMs),
    board: boardRows(save, nowMs, random),
    due: dueCount(save, nowMs),
    slotsLeft: MAX_RUNNING - save.expeditions.queue.length,
    refreshInMs: refreshInMs(save, nowMs),
    canRefresh: save.wallet.gold >= REFRESH_COST,
  };
}

export function ExpeditionsSurface({ save, actions }: SurfaceProps) {
  // Read once per render so every row agrees about the time.
  const view = expeditionView(save, Date.now());

  return (
    <>
      <Section title="Out on contract">
        <Rows>
          <Row
            label="Bring home everything ready"
            hint={view.due === 0 ? `${view.slotsLeft} of ${MAX_RUNNING} slots free` : `${view.due} ready`}
          >
            <button type="button" disabled={view.due === 0} onClick={() => actions.collectExpeditions()}>
              {view.due === 0 ? 'Nothing ready' : `Collect ${view.due}`}
            </button>
          </Row>
          {view.running.map(row => (
            <Row key={row.expedition.id} label={row.expedition.type} hint={remainingLabel(row)}>
              {row.due ? (
                <button type="button" onClick={() => actions.collectExpedition(row.expedition.id)}>
                  Collect
                </button>
              ) : (
                <Meter fraction={row.fraction} label={remainingLabel(row)} />
              )}
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="On offer">
        <Rows>
          <Row label="The board rerolls itself every eight hours" hint={refreshLabel(view.refreshInMs)}>
            <button type="button" disabled={!view.canRefresh} onClick={() => actions.refreshContracts()}>
              {view.canRefresh ? `Reroll · ${formatDamage(REFRESH_COST)} gold` : 'Not enough gold'}
            </button>
          </Row>
          {view.board.map(row => (
            <Row key={row.type} label={row.type} hint={boardHint(row)}>
              <button
                type="button"
                disabled={!row.affordable || !row.hasRoom}
                onClick={() => actions.sendExpedition(row.type)}
              >
                {formatDamage(row.contract.goldCost)} gold
              </button>
            </Row>
          ))}
        </Rows>
      </Section>
    </>
  );
}
