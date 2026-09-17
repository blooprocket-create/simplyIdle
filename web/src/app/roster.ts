import Decimal from 'break_eternity.js';

import { CLASS_ATTACK_INTERVAL_MS } from '../content/attackSpeeds';
import { getHeroTemplate } from '../content/heroes';
import { getHeroContribution } from '../engine/combat/heroDamage';
import { getIntendedFormationRole } from '../engine/combat/formation';
import { teamHealthFromSave } from '../engine/character/fromSave';
import type { HealthHero } from '../engine/character/stats';
import { ACTIVE_TEAM_SIZE } from '../engine/save/migrate';
import type { SavedHero, SaveV3 } from '../engine/save/schema';
import { createHeroEntity, type HeroEntity } from '../engine/entities/HeroEntity';
import type { Cast, CastMember } from '../game/models/cast';
import { heroModelKey } from '../game/models/manifest';
import { silhouetteFor } from '../game/models/silhouette';
import { profileFromSave, type PlayerProfile } from '../ui/profile/playerProfile';

/**
 * The player's team, in the three shapes the app needs it in.
 *
 * Built together from the same rows, which is the whole point. `demoRoster`
 * learned this the hard way: an earlier version wrote the names by hand and
 * took the emoji from the catalogue under the same id, so a mage was drawn
 * carrying a warrior's shield. One source makes that impossible rather than
 * merely fixed, and a save has three readers — the simulation, the diorama
 * and the surfaces — so it is three chances to disagree.
 */
export interface LoadedRoster {
  /** What fights. */
  heroes: HeroEntity[];
  /** What is drawn. */
  cast: Cast;
  /** What the surfaces read. */
  profile: PlayerProfile;
  /**
   * How much the team can take, derived rather than guessed.
   *
   * It was a flat `2000` until Phase 7, with a note in `demoRoster.ts` saying
   * "nothing derives it yet" — and everything downstream of it was unanchored:
   * how long a team survives, which wave is the wall, where the offline
   * sawtooth turns over. Built from the same rows as the other three, for the
   * same reason.
   */
  teamMaxHp: number;
}

/**
 * Which roster rows are on the team.
 *
 * `activeUids` is the player's own choice and its order is theirs too, so it
 * is followed rather than sorted. A save with nothing selected falls back to
 * the first few rows: a team of nobody deals no damage, and a game that does
 * nothing at all is worse than one that guesses a line-up the player can
 * change.
 */
function activeRows(save: SaveV3): SavedHero[] {
  const byUid = new Map(save.roster.heroes.map(hero => [hero.uid, hero]));
  const chosen = save.roster.activeUids
    .map(uid => byUid.get(uid))
    .filter((hero): hero is SavedHero => hero !== undefined);
  return chosen.length > 0 ? chosen : save.roster.heroes.slice(0, ACTIVE_TEAM_SIZE);
}

export function rosterFromSave(save: SaveV3): LoadedRoster {
  const heroes: HeroEntity[] = [];
  // `Cast` is `readonly CastMember[]` on purpose — nothing downstream may
  // mutate the roster it was handed — so it is built here and widened to
  // that on the way out rather than pushed into.
  const cast: CastMember[] = [];

  for (const row of activeRows(save)) {
    const template = getHeroTemplate(row.id);
    // The migration already drops a row whose template is gone — that is how
    // a retired hero leaves an old save. Should is not the same as does, and
    // a team member with no template has no class to swing with.
    if (template === undefined) continue;

    const damage = getHeroContribution({
      uid: row.uid,
      template,
      level: row.level,
      rank: row.rank,
      rarity: row.rarity,
      rebirthStatMult: row.rebirthStatMult,
    }).damage;

    heroes.push(createHeroEntity(row.uid, new Decimal(damage), CLASS_ATTACK_INTERVAL_MS[template.heroClass]));
    cast.push({
      uid: row.uid,
      name: template.name,
      // The rank the player asked for when the save does not say — the same
      // choice `profileFromSave` makes, so the roster surface and the figure
      // on screen never disagree about where a hero stands.
      role:
        save.roster.formationByUid[row.uid] ??
        getIntendedFormationRole({ uid: row.uid, heroClass: template.heroClass }),
      // Keyed off the *template*, not the instance. A saved hero's `uid` is
      // unique to that copy of it; two Valkyras have two uids and one model.
      modelKey: heroModelKey(row.id),
      silhouette: silhouetteFor(row.id, template.heroClass),
    });
  }

  /*
   * Health reads the roster rows rather than the `HeroEntity` list, because
   * the two are not the same set: an entity is built only for a row whose
   * template still exists, and health is measured off the same rows for the
   * same reason — a hero with no template has no class, and no class has no
   * vitality. Building it from the rows keeps the two in step by construction.
   */
  const healthHeroes: HealthHero[] = [];
  for (const row of activeRows(save)) {
    const template = getHeroTemplate(row.id);
    if (template === undefined) continue;
    healthHeroes.push({
      uid: row.uid,
      heroClass: template.heroClass,
      rarity: row.rarity,
      level: row.level,
      rank: row.rank,
      rebirthStatMult: row.rebirthStatMult,
    });
  }

  return {
    heroes,
    cast,
    profile: profileFromSave(save),
    teamMaxHp: teamHealthFromSave(save, healthHeroes),
  };
}

/**
 * Everything the running fight can observe about a roster, as one string.
 *
 * The shell rebuilds the loop when this changes and leaves it alone when it
 * does not, which is what lets a summon add a hero to the bench without
 * restarting the run — and lets fielding one, or levelling one, take effect
 * without a reload.
 *
 * Derived from the *built* roster rather than from the save's fields, and that
 * is the whole point. Enumerating which save fields the fight depends on means
 * keeping a second list in step with `rosterFromSave` — and the day equipment
 * or a passive joins the damage calculation, the list is wrong and the symptom
 * is a hero whose new gear does nothing until the tab is reloaded. Comparing
 * the output cannot drift from the thing it describes.
 *
 * **Two of the three terms are redundant today**, and are kept anyway. Damage
 * and team health are currently functions of the same hero fields, so no save
 * change moves one without the other, and the cast's ordering follows the
 * heroes'. That is a fact about this build rather than about the idea: the
 * damage multiplier chain — synergy, formation, hero passives, relics, the
 * prestige and meta levels — is ported and fixture-tested and **not applied to
 * the live fight**, and the moment it is, `metaDamageLevel` moves damage
 * without touching health. Dropping the terms now to match the tests would
 * mean putting them back then, having shipped a build where a meta upgrade did
 * nothing until reload.
 */
export function fightSignature(roster: LoadedRoster): string {
  return JSON.stringify([
    roster.teamMaxHp,
    roster.heroes.map(hero => [hero.uid, hero.damagePerHit.toString(), hero.timer.intervalMs]),
    roster.cast.map(member => [member.uid, member.role, member.modelKey, member.silhouette]),
  ]);
}
