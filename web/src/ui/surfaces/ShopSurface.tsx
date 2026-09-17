import { LOOSE_OFFERS, SHOP_OFFERS, type LooseOffer, type ShopOffer } from '../../content/shops';
import { getUsableItem } from '../../content/usableItems';
import { pointsToNextVipLevel, VIP_MILESTONES, type VipMilestone } from '../../content/vip';
import { claimableVipLevels } from '../../engine/progression/vip';
import type { SaveV3 } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Row, Rows, Section } from './parts/parts';

/**
 * The shop, and the VIP track that pays for it.
 *
 * One surface for both because the shipped game puts them on one screen, and
 * because they are one loop: VIP milestones are the only source of diamonds
 * this build has, and the diamond half of this shop is the only place to spend
 * them. Splitting them would give the player a currency screen with no shop
 * and a shop with no currency.
 *
 * A `ledger`: a list to spend down.
 *
 * Offers this build cannot honour are drawn **greyed with the reason**, not
 * hidden. A shop showing three rows would be telling the player this game
 * sells three, and the reasons are short and true — there is no heat to clear,
 * and there are no dungeons yet.
 */

export interface OfferRow {
  offer: ShopOffer;
  /** Whether the purse covers it. False for an offer this build withholds. */
  affordable: boolean;
  /** Why the button is dead, or null when it is live. */
  blockedBy: string | null;
}

export function offerRows(save: SaveV3): OfferRow[] {
  return SHOP_OFFERS.map(offer => {
    const purse = offer.currency === 'gold' ? save.wallet.gold : save.wallet.diamonds;
    const affordable = offer.available && purse >= offer.cost;
    return {
      offer,
      affordable,
      // The catalogue's reason wins over the purse: telling a player they
      // cannot afford something this build would refuse anyway sends them off
      // to earn diamonds for a button that will never work.
      blockedBy: offer.available
        ? purse >= offer.cost
          ? null
          : `Costs ${offer.cost} ${offer.currency}`
        : offer.unavailableBecause,
    };
  });
}

export interface LooseRow {
  offer: LooseOffer;
  name: string;
  held: number;
  blockedBy: string | null;
}

export function looseRows(save: SaveV3): LooseRow[] {
  return LOOSE_OFFERS.map(offer => {
    const item = getUsableItem(offer.itemId);
    return {
      offer,
      name: item === null ? offer.itemId : `${item.emoji} ${item.name}`,
      held: save.usables[offer.itemId] ?? 0,
      blockedBy: offer.available ? null : offer.unavailableBecause,
    };
  });
}

export interface VipRow {
  milestone: VipMilestone;
  earned: boolean;
  claimed: boolean;
  /** Earned and not yet taken. The only state with a live button. */
  claimable: boolean;
}

export function vipRows(save: SaveV3): VipRow[] {
  const claimable = new Set(claimableVipLevels(save.vip));
  const claimed = new Set(save.vip.claimedRewardLevels);
  return VIP_MILESTONES.map(milestone => ({
    milestone,
    earned: save.vip.level >= milestone.level,
    claimed: claimed.has(milestone.level),
    claimable: claimable.has(milestone.level),
  }));
}

/** The one line at the top of the track: where this account stands. */
export function vipStanding(save: SaveV3): { level: number; points: number; toNext: number | null } {
  return { level: save.vip.level, points: save.vip.points, toNext: pointsToNextVipLevel(save.vip.points) };
}

export function ShopSurface({ save, actions }: SurfaceProps) {
  const standing = vipStanding(save);
  const outstandingCodex = actions.claimableCodex();

  return (
    <>
      <Section title="Shop">
        <Rows>
          {offerRows(save).map(row => (
            <Row key={row.offer.id} label={row.offer.name} hint={row.blockedBy ?? row.offer.detail}>
              <button type="button" disabled={!row.affordable} onClick={() => actions.buyOffer(row.offer.id)}>
                {row.offer.cost} {row.offer.currency === 'gold' ? 'gold' : '💎'}
              </button>
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="By the unit">
        <Rows>
          {looseRows(save).map(row => (
            <Row key={row.offer.itemId} label={row.name} hint={row.blockedBy ?? `Held: ${row.held}`}>
              <button
                type="button"
                disabled={row.blockedBy !== null}
                onClick={() => actions.buyUnits(row.offer.itemId, 5)}
              >
                5 × {row.offer.unitCost} 💎
              </button>
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title={`VIP ${standing.level}`}>
        <Rows>
          <Row
            label="Points"
            hint={standing.toNext === null ? 'Top of the track' : `${standing.toNext} to the next level`}
          >
            {formatDamage(standing.points)}
          </Row>
          {/*
            The codex sweep, rather than one button per hero per kind. The
            shipped game makes a player with sixty heroes press a hundred and
            twenty times, which is the same correction `useUsableItem` makes by
            taking an amount.
          */}
          <Row label="Record codex entries" hint="Ten points each, for heroes you own and weapons you have ranked">
            <button type="button" disabled={outstandingCodex === 0} onClick={() => actions.recordCodex()}>
              {outstandingCodex === 0 ? 'Nothing to record' : `Record ${outstandingCodex}`}
            </button>
          </Row>
          {vipRows(save).map(row => (
            <Row
              key={row.milestone.level}
              label={`VIP ${row.milestone.level}`}
              hint={`${row.milestone.diamonds} 💎 · ${formatDamage(row.milestone.gold)} gold · ${row.milestone.shards} shards · ${row.milestone.essence} essence`}
            >
              <button type="button" disabled={!row.claimable} onClick={() => actions.claimVip(row.milestone.level)}>
                {row.claimed ? 'Claimed' : row.claimable ? 'Claim' : 'Locked'}
              </button>
            </Row>
          ))}
        </Rows>
      </Section>
    </>
  );
}
