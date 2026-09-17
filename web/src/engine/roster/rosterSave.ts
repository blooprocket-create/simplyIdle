import type { SaveContent, SaveV3, SavedHero } from '../save/schema';
import { preferredUniqueBearer } from '../save/migrate';
import type { FormationRole } from '../combat/formation';
import {
  levelUpWithGold,
  rankUp,
  rankUpToMax,
  rebirth,
  recycleShards,
  type RosterHero,
  type Wallet,
} from './progression';
import {
  batchLevel,
  loadLoadout,
  saveLoadout,
  setActiveTeam,
  setFormationRole,
  unlockNextSlot,
  type TeamHero,
} from './team';

/**
 * The roster verbs, applied to a save.
 *
 * `progression.ts` and `team.ts` hold the rules and take heroes and a purse;
 * this is what turns each one into "the save before" and "the save after".
 * Kept apart for the reason `summonSave.ts` is: the rules are the part with a
 * recorded baseline, and the save is the part with a schema.
 *
 * Every verb here returns **null** when it cannot happen, rather than the
 * unchanged save. A caller cannot tell "nothing happened" from "it worked and
 * changed nothing" when both come back as a save, and a screen that greys out a
 * button needs to be able to ask.
 *
 * None of them touches the *team*, except the ones whose whole job is the team.
 * Levelling a benched hero and levelling a fielded one are the same action, and
 * the shell notices the difference by itself: `fightSignature` moves only when
 * the fight would.
 */

/** What the rules need about a hero, from their save row. */
function asRosterHero(row: SavedHero): RosterHero {
  return { uid: row.uid, rarity: row.rarity, level: row.level, rank: row.rank, rebirthStatMult: row.rebirthStatMult };
}

/** The three currencies the roster spends, off the save's wallet. */
function purse(save: SaveV3): Wallet {
  return { gold: save.wallet.gold, heroShards: save.wallet.heroShards, essence: save.wallet.essence };
}

function withPurse(save: SaveV3, wallet: Wallet): SaveV3['wallet'] {
  return { ...save.wallet, gold: wallet.gold, heroShards: wallet.heroShards, essence: wallet.essence };
}

function withHero(save: SaveV3, uid: string, next: RosterHero): SavedHero[] {
  return save.roster.heroes.map(row =>
    row.uid === uid ? { ...row, level: next.level, rank: next.rank, rebirthStatMult: next.rebirthStatMult } : row,
  );
}

/** The team, joined with the catalogue so the selection rules can read a class. */
export function teamHeroes(save: SaveV3, content: SaveContent): TeamHero[] {
  const heroes: TeamHero[] = [];
  for (const row of save.roster.heroes) {
    const template = content.heroesById.get(row.id);
    if (!template) continue;
    heroes.push({ ...row, heroClass: template.heroClass });
  }
  return heroes;
}

export type HeroSpend = 'level' | 'rank' | 'rankToMax' | 'rebirth';

/**
 * Spend on one hero: a level, a rank, every rank at once, or a rebirth.
 *
 * One entry point rather than four, because the four differ only in which rule
 * they call and every one of them does the same three things afterwards — write
 * the hero back, write the purse back, and refuse as a whole if the rule did.
 */
export function spendOnHero(save: SaveV3, uid: string, spend: HeroSpend): SaveV3 | null {
  const row = save.roster.heroes.find(entry => entry.uid === uid);
  if (!row) return null;

  const hero = asRosterHero(row);
  const wallet = purse(save);
  const applied =
    spend === 'level'
      ? levelUpWithGold(hero, wallet)
      : spend === 'rank'
        ? rankUp(hero, wallet)
        : spend === 'rankToMax'
          ? rankUpToMax(hero, wallet)
          : rebirth(hero, wallet);
  if (!applied) return null;

  return {
    ...save,
    wallet: withPurse(save, applied.wallet),
    roster: { ...save.roster, heroes: withHero(save, uid, applied.hero) },
  };
}

/**
 * Level several heroes at once, for as long as the purse holds.
 *
 * `batchLevel` spends in **roster order** rather than the order asked for, and
 * skips a hero it cannot afford rather than stopping — both shipped, both
 * pinned in `team.ts`. Refuses only when nothing at all moved, so a batch that
 * levelled four of six is a success with a shorter answer.
 */
export function batchLevelHeroes(
  save: SaveV3,
  content: SaveContent,
  uids: readonly string[],
  addLevels: number | 'max',
): SaveV3 | null {
  const result = batchLevel(teamHeroes(save, content), uids, addLevels, save.wallet.gold);
  const heroes = save.roster.heroes.map(row =>
    result.levelByUid[row.uid] === undefined ? row : { ...row, level: result.levelByUid[row.uid] },
  );
  const moved = heroes.some((row, index) => row.level !== save.roster.heroes[index].level);
  if (!moved) return null;

  return { ...save, wallet: { ...save.wallet, gold: result.gold }, roster: { ...save.roster, heroes } };
}

/**
 * Recycle a hero for shards, at the weekly event's rate.
 *
 * Refuses a hero on the active team and a hero carrying their relic — the same
 * two exclusions `autoRecycleTargets` makes, for the same reasons: recycling a
 * fielded hero empties the line the player chose, and recycling a relic's
 * bearer destroys the relic, which has no other home.
 */
export function recycleHero(save: SaveV3, uid: string, weeklyShardMultiplier: number): SaveV3 | null {
  const row = save.roster.heroes.find(entry => entry.uid === uid);
  if (!row) return null;
  if (save.roster.activeUids.includes(uid)) return null;
  if (Object.values(save.roster.uniqueByHeroId).some(gear => gear.equippedByUid === uid)) return null;

  const shards = recycleShards(asRosterHero(row), weeklyShardMultiplier);
  const heroes = save.roster.heroes.filter(entry => entry.uid !== uid);
  const formationByUid = { ...save.roster.formationByUid };
  delete formationByUid[uid];

  return {
    ...save,
    wallet: { ...save.wallet, heroShards: save.wallet.heroShards + shards },
    roster: {
      ...save.roster,
      heroes,
      formationByUid,
      // A recycled hero has to leave the saved lineups as well, or loading one
      // silently fields a shorter team and the player never learns why.
      loadouts: save.roster.loadouts.map(slot => slot.filter(entry => entry !== uid)),
    },
  };
}

/** Field a team, replayed through the selection rules. */
export function fieldTeam(save: SaveV3, content: SaveContent, requested: readonly string[]): SaveV3 | null {
  const activeUids = setActiveTeam(
    teamHeroes(save, content),
    save.roster.formationByUid,
    content,
    save.roster.slotsUnlocked,
    requested,
  );
  if (sameTeam(activeUids, save.roster.activeUids)) return null;
  return { ...save, roster: { ...save.roster, activeUids } };
}

function sameTeam(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((uid, index) => uid === b[index]);
}

/** Move a hero to a rank, or refuse — see `setFormationRole` for which. */
export function placeHero(save: SaveV3, content: SaveContent, uid: string, role: FormationRole): SaveV3 | null {
  const formationByUid = setFormationRole(
    teamHeroes(save, content),
    save.roster.formationByUid,
    save.roster.activeUids,
    uid,
    role,
  );
  if (!formationByUid) return null;
  return { ...save, roster: { ...save.roster, formationByUid } };
}

export function storeLoadout(save: SaveV3, slot: number): SaveV3 {
  return {
    ...save,
    roster: { ...save.roster, loadouts: saveLoadout(save.roster.loadouts, slot, save.roster.activeUids) },
  };
}

export function recallLoadout(save: SaveV3, content: SaveContent, slot: number): SaveV3 | null {
  const activeUids = loadLoadout(
    teamHeroes(save, content),
    save.roster.formationByUid,
    content,
    save.roster.slotsUnlocked,
    save.roster.loadouts,
    slot,
  );
  if (sameTeam(activeUids, save.roster.activeUids)) return null;
  return { ...save, roster: { ...save.roster, activeUids } };
}

/**
 * Buy the next team slot, or refuse.
 *
 * Gated on the furthest wave reached as well as the price, and one at a time —
 * the sixth asks for twice the wave the fifth did, so a player at wave 60 can
 * buy the fifth and not the sixth however rich they are.
 */
export function buySlot(save: SaveV3): SaveV3 | null {
  const unlock = unlockNextSlot({
    slotsUnlocked: save.roster.slotsUnlocked,
    gold: save.wallet.gold,
    heroShards: save.wallet.heroShards,
    highestWave: save.progression.highestWave,
  });
  if (!unlock) return null;

  return {
    ...save,
    wallet: { ...save.wallet, gold: unlock.gold, heroShards: unlock.heroShards },
    roster: { ...save.roster, slotsUnlocked: unlock.slotsUnlocked },
  };
}

/**
 * Put a hero's unique relic on or take it off, or refuse.
 *
 * **The uid decides which relic, not which copy carries it.** The shipped
 * action looks the hero up to find their *template*, then re-derives the
 * preferred bearer across every copy of that template and equips **that** one —
 * so pressing the button on a weaker copy still hands the relic to the best
 * one. It reads like a bug and is what makes the control safe: a relic can
 * never end up on a copy that is not the strongest.
 *
 * The consequence for taking it *off* is the part a port gets wrong by
 * tidying. It comes off only when the stored bearer is already the preferred
 * copy; when it is not, the same press **moves** it to the preferred copy
 * instead. So a player whose relic sits on an old copy presses once to move it
 * and again to remove it.
 *
 * Refused when the hero is unknown or the relic has never dropped. The shipped
 * guard is `!current || current.rank <= 0`; here it is the absence alone,
 * because the reader floors a stored rank at one — so `rank <= 0` is a branch
 * no save can reach, and a branch no input can reach is a branch no test can
 * hold to account.
 */
export function toggleUniqueRelic(save: SaveV3, heroUid: string): SaveV3 | null {
  const hero = save.roster.heroes.find(entry => entry.uid === heroUid);
  if (!hero) return null;

  const current = save.roster.uniqueByHeroId[hero.id];
  if (!current) return null;

  const bearer = preferredUniqueBearer(save.roster.heroes, hero.id);
  if (!bearer) return null;

  const equippedByUid = current.equippedByUid === bearer.uid ? null : bearer.uid;
  return {
    ...save,
    roster: {
      ...save.roster,
      uniqueByHeroId: { ...save.roster.uniqueByHeroId, [hero.id]: { ...current, equippedByUid } },
    },
  };
}
