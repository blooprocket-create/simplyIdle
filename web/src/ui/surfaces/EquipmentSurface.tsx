import { useState } from 'react';
import {
  EQUIPMENT_RARITY_IDS,
  EQUIPMENT_SLOTS,
  getEquipmentItem,
  type EquipmentRarity,
  type EquipmentSlot,
} from '../../content/equipment';
import {
  EQUIPMENT_CRAFT_COST,
  SCRAP_TO_SHARD_COST,
  SHARDS_PER_REFINE,
  scrapToEssenceCost,
} from '../../engine/equipment/forge';
import { EQUIPMENT_SCRAP_VALUE } from '../../engine/equipment/instance';
import type { SavedEquipment, SaveV3, StatBlock } from '../../engine/save/schema';
import { STAT_KEYS } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import { heldGold } from '../profile/playerProfile';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Row, Rows, Section, Tag } from './parts/parts';
import styles from './EquipmentSurface.module.css';
import { EQUIPMENT_RARITY_TONE } from '../copy/equipment';

/**
 * What the player owns and wears. A `ledger`: it lists an inventory, which is
 * the one thing that really runs on.
 *
 * Every button is gated on the rule that would refuse it — the craft price
 * against the purse, the dismantle offered only for what is not worn — with one
 * deliberate exception. **Upgrade is offered whenever an item has a tier above
 * it**, and its price is not shown, because pricing it means calling
 * `upgradePlan`, and that *draws a value* before anybody checks the purse.
 * Quoting a price here would advance the sequence on every render.
 */

const SLOT_LABEL: Record<EquipmentSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armour',
  accessory: 'Accessory',
};

/** An owned id, resolved for display. Either shape is legal; see `SaveEquipment`. */
export interface ShownItem {
  id: string;
  name: string;
  emoji: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  description: string;
  bonus: Partial<StatBlock>;
  /** Null for a bare catalogue row, which has no roll behind it. */
  itemLevel: number | null;
  worn: boolean;
  /** Whether the player's class may wear it at all. */
  wearable: boolean;
}

/**
 * Everything the player owns, in a shape a card can draw.
 *
 * Exported so the resolution can be tested without mounting anything — there is
 * no React testing stack here by choice, so every branch lives somewhere it can
 * be called.
 */
export function shownItems(save: SaveV3): ShownItem[] {
  const playerClass = save.identity.playerClass;
  const worn = new Set(Object.values(save.equipment.equipped).filter((id): id is string => id !== null));
  const items: ShownItem[] = [];

  for (const id of save.equipment.inventory) {
    const instance: SavedEquipment | undefined = save.equipment.instances[id];
    const base = getEquipmentItem(instance ? instance.baseItemId : id);
    if (!base) continue;
    items.push({
      id,
      name: instance?.name ?? base.name,
      emoji: instance?.emoji ?? base.emoji,
      slot: base.slot,
      // An instance's own rarity wins: an upgrade builds from a different row.
      rarity: instance?.rarity ?? base.rarity,
      description: instance?.description ?? base.description,
      bonus: instance?.bonus ?? base.bonus,
      itemLevel: instance?.itemLevel ?? null,
      worn: worn.has(id),
      wearable: playerClass !== null && base.allowedClasses.includes(playerClass),
    });
  }
  return items;
}

/** The stats a bonus adds, as a line. Zeroes are left out rather than shown. */
export function statLine(bonus: Partial<StatBlock>): string {
  const parts: string[] = [];
  for (const key of STAT_KEYS) {
    const value = bonus[key] ?? 0;
    if (value > 0) parts.push(`+${value} ${key.slice(0, 3).toUpperCase()}`);
  }
  return parts.join(' · ');
}

export function EquipmentSurface(props: SurfaceProps) {
  const { save, actions, profile, snapshot } = props;
  const [lastCraft, setLastCraft] = useState<string | null>(null);

  const items = shownItems(save);
  const scrap = save.wallet.equipmentScrap;
  const gold = heldGold(profile, snapshot).toNumber();
  const essencePrice = scrapToEssenceCost({
    damage: save.progression.metaDamageLevel,
    economy: save.progression.metaEconomyLevel,
    survival: save.progression.metaSurvivalLevel,
  });

  const byId = new Map(items.map(item => [item.id, item]));
  const sweepValue = items
    .filter(
      item =>
        !item.worn &&
        EQUIPMENT_RARITY_IDS.indexOf(item.rarity) <= EQUIPMENT_RARITY_IDS.indexOf(save.equipment.autoDismantleFloor),
    )
    .reduce((sum, item) => sum + EQUIPMENT_SCRAP_VALUE[item.rarity], 0);

  const itemCard = (item: ShownItem) => (
    <Card
      key={item.id}
      title={`${item.emoji} ${item.name}`}
      badge={item.itemLevel === null ? undefined : `iLv ${item.itemLevel}`}
    >
      <span>
        <Tag tone={EQUIPMENT_RARITY_TONE[item.rarity]}>{item.rarity}</Tag>
        {item.worn && <Tag tone="good">Worn</Tag>}
      </span>
      <span>{statLine(item.bonus) || 'No bonus'}</span>
      <div className={styles.verbs}>
        {/*
          Equip is offered only for something the class can wear and is not
          already wearing — `equipItem` refuses both, and a button the engine
          always refuses is the button that does nothing.
        */}
        {!item.worn && item.wearable && (
          <button type="button" className={styles.verb} onClick={() => actions.equip(item.id)}>
            Equip
          </button>
        )}
        {item.worn && (
          <button type="button" className={styles.verb} onClick={() => actions.unequip(item.slot)}>
            Take off
          </button>
        )}
        {/*
          Upgrade carries no price, deliberately. Pricing it means calling
          `upgradePlan`, which draws a value *before* checking the purse — so a
          quoted price would advance the sequence on every render, and the item
          it named need not be the one the press hands over.
        */}
        {item.rarity !== 'transcendent' && (
          <button type="button" className={styles.verb} onClick={() => actions.upgrade(item.id)}>
            Upgrade
          </button>
        )}
        {!item.worn && (
          <button
            type="button"
            className={`${styles.verb} ${styles.destructive}`}
            onClick={() => actions.dismantle(item.id)}
          >
            Scrap
          </button>
        )}
      </div>
    </Card>
  );

  return (
    <>
      <Section title="Worn">
        <Rows>
          {EQUIPMENT_SLOTS.map(slot => {
            const id = save.equipment.equipped[slot];
            const item = id === null ? undefined : byId.get(id);
            return (
              <Row key={slot} label={SLOT_LABEL[slot]} hint={item ? statLine(item.bonus) : undefined}>
                {item ? `${item.emoji} ${item.name}` : 'Nothing'}
              </Row>
            );
          })}
        </Rows>
      </Section>

      <Section title="Forge">
        <Rows>
          <Row label="Scrap">{formatDamage(scrap)}</Row>
          <Row label="Essence">{formatDamage(save.wallet.essence)}</Row>
          <Row label="Gold" hint="Banked, plus this run">
            {formatDamage(gold)}
          </Row>
          {EQUIPMENT_SLOTS.map(slot => {
            const cost = EQUIPMENT_CRAFT_COST[slot];
            return (
              <Row key={slot} label={`Forge a ${SLOT_LABEL[slot].toLowerCase()}`}>
                <button
                  type="button"
                  className={styles.verb}
                  disabled={scrap < cost.scrap || gold < cost.gold}
                  onClick={() => {
                    const made = actions.craft(slot);
                    setLastCraft(made ? `${made.item.emoji} ${made.item.name} (${made.item.rarity})` : null);
                  }}
                >
                  {formatDamage(cost.scrap)}⚙ + {formatDamage(cost.gold)}🪙
                </button>
              </Row>
            );
          })}
          <Row label="Refine to essence" hint="Priced up by every meta level">
            <button
              type="button"
              className={styles.verb}
              disabled={scrap < essencePrice}
              onClick={() => actions.refineEssence()}
            >
              {formatDamage(essencePrice)}⚙ → 1
            </button>
          </Row>
          <Row label="Refine to shards">
            <button
              type="button"
              className={styles.verb}
              disabled={scrap < SCRAP_TO_SHARD_COST}
              onClick={() => actions.refineShards()}
            >
              {formatDamage(SCRAP_TO_SHARD_COST)}⚙ → {SHARDS_PER_REFINE}🔹
            </button>
          </Row>
        </Rows>
        {lastCraft !== null && <p className={styles.note}>Forged {lastCraft}.</p>}
      </Section>

      <Section title="Sweep">
        {/*
          At or below the floor, and it says which. The default floor is
          `common`, and reading the rule as strictly-below would make the
          default sweep nothing — so the count is shown rather than promised.
        */}
        <Rows>
          <Row label="Floor" hint="Everything at this rarity or below">
            <span className={styles.verbs}>
              {EQUIPMENT_RARITY_IDS.map(rarity => (
                <button
                  key={rarity}
                  type="button"
                  className={rarity === save.equipment.autoDismantleFloor ? `${styles.verb} ${styles.on}` : styles.verb}
                  onClick={() => actions.setSweepFloor(rarity)}
                >
                  {rarity}
                </button>
              ))}
            </span>
          </Row>
          <Row label="Would scrap" hint="Never what you are wearing">
            <button type="button" className={styles.verb} disabled={sweepValue === 0} onClick={() => actions.sweep()}>
              ≈{formatDamage(sweepValue)}⚙
            </button>
          </Row>
        </Rows>
      </Section>

      {items.length === 0 ? (
        <Empty>Nothing owned yet. The forge above turns scrap into gear.</Empty>
      ) : (
        <Section title={`Owned · ${items.length}`}>
          <Cards>{items.map(itemCard)}</Cards>
        </Section>
      )}
    </>
  );
}
