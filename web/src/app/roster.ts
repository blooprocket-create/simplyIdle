import Decimal from 'break_eternity.js';

import { CLASS_ATTACK_INTERVAL_MS } from '../content/attackSpeeds';
import { getHeroTemplate } from '../content/heroes';
import { getHeroContribution } from '../engine/combat/heroDamage';
import { getIntendedFormationRole } from '../engine/combat/formation';
import { ACTIVE_TEAM_SIZE } from '../engine/save/migrate';
import type { SavedHero, SaveV3 } from '../engine/save/schema';
import { createHeroEntity, type HeroEntity } from '../engine/entities/HeroEntity';
import type { Cast } from '../game/models/cast';
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
  const cast: Cast = [];

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

  return { heroes, cast, profile: profileFromSave(save) };
}
