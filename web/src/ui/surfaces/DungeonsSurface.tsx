import { dungeonRows } from '../../app/dungeonActions';
import type { DungeonRow } from '../../app/dungeonActions';
import type { SaveV3 } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Row, Rows, Section } from './parts/parts';

/**
 * The two dungeons: a rift breach and a treasury raid.
 *
 * A `ledger` — two entries with their own controls, and a list is what it is.
 *
 * Neither is fought. Both resolve from the player's own damage in one step,
 * which is worth saying on the screen: a player who expects to play a dungeon
 * and gets a result instead should have been told, and the hint is where.
 */

/** What a row says under its title: where it stands and what it costs. */
export function rowHint(row: DungeonRow): string {
  const entries =
    row.entriesLeft > 0 ? `${row.entriesLeft} of ${row.entryCap} entries left today` : 'No entries left today';
  return `Level ${row.level} · ${entries}`;
}

/** What the ticket button says, which depends on what it would buy. */
export function raidLabel(row: DungeonRow, tickets: number): string {
  if (tickets <= 0) return 'No tickets';
  if (row.raidLevel === null) return 'Nothing below level 1';
  return `Raid L${row.raidLevel}`;
}

export function dungeonView(save: SaveV3, nowMs: number): { rows: DungeonRow[]; tickets: number } {
  return { rows: dungeonRows(save, nowMs), tickets: save.dungeons.raidTickets };
}

export function DungeonsSurface({ save, actions }: SurfaceProps) {
  // The clock is read once per render rather than per row, so both rows agree
  // about what day it is even across a midnight.
  const view = dungeonView(save, Date.now());

  return (
    <>
      <Section title="Dungeons">
        <Rows>
          <Row label="Raid tickets" hint="Bought in the shop. Each one takes the level below you, outright.">
            {formatDamage(view.tickets)}
          </Row>
        </Rows>
      </Section>

      {view.rows.map(row => (
        <Section key={row.dungeon.id} title={row.dungeon.name}>
          <Rows>
            <Row label={row.dungeon.detail} hint={rowHint(row)}>
              <span>
                <button type="button" disabled={!row.canRun} onClick={() => actions.runDungeon(row.dungeon.id)}>
                  {row.canRun ? 'Enter' : 'Back tomorrow'}
                </button>
                <button type="button" disabled={!row.canRaid} onClick={() => actions.raidDungeon(row.dungeon.id)}>
                  {raidLabel(row, view.tickets)}
                </button>
              </span>
            </Row>
          </Rows>
        </Section>
      ))}
    </>
  );
}
