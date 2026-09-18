import { getUsableItem, USABLE_ITEMS } from '../../content/usableItems';
import type { SaveV3 } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Row, Rows, Section } from './parts/parts';

/**
 * The bag: what a run has found, and what pressing it is worth.
 *
 * A `ledger`, because it is a list to spend down.
 *
 * **The value on an item is not what it pays.** Every gain is the larger of a
 * scaled base and a wave floor, so a Gold Cache says 350 and hands a deep
 * account what three of their own monsters hand them. The screen shows the
 * description rather than a number for that reason: quoting 350 beside a
 * button that pays 8.5e24 would be worse than quoting nothing.
 */

/** What is actually held, in catalogue order rather than acquisition order. */
export function heldItems(save: SaveV3): { id: string; count: number }[] {
  return USABLE_ITEMS.filter(item => (save.usables[item.id] ?? 0) > 0).map(item => ({
    id: item.id,
    count: save.usables[item.id] ?? 0,
  }));
}

export function ItemsSurface({ save, actions }: SurfaceProps) {
  const held = heldItems(save);

  return (
    <Section title="Items">
      {held.length === 0 ? (
        <Rows>
          {/*
            Named rather than left blank. Items drop from kills, and a player
            with none has simply not found one yet — which is a different
            thing from a screen that is broken.
          */}
          <Row label="Nothing yet" hint="They drop from kills">
            —
          </Row>
        </Rows>
      ) : (
        <Rows>
          {held.map(entry => {
            const item = getUsableItem(entry.id)!;
            return (
              <Row key={entry.id} label={`${item.emoji} ${item.name}`} hint={item.description}>
                <button type="button" onClick={() => actions.useItem(entry.id, 1)}>
                  Use · {formatDamage(entry.count)}
                </button>
              </Row>
            );
          })}
        </Rows>
      )}
    </Section>
  );
}
