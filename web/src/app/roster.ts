import { CLASS_ATTACK_INTERVAL_MS, PLAYER_ATTACK_INTERVAL_MS } from '../content/attackSpeeds';
import { getHeroTemplate } from '../content/heroes';
import { getHeroContribution } from '../engine/combat/heroDamage';
import { playerContribution } from '../engine/combat/playerDamage';
import { teamDamage, type PoweredHero } from '../engine/combat/teamPower';
import type { RelicBearer } from '../engine/combat/uniqueRelics';
import { getIntendedFormationRole } from '../engine/combat/formation';
import {
  classPassiveUnlockedFromLegacy,
  progressionFromSave,
  tacticsLevelFromLegacy,
  economyFromSave,
  teamHealthFromSave,
} from '../engine/character/fromSave';
import { incomingMultiplier, teamDefense } from '../engine/combat/mitigation';
import { rewardRatesFrom } from '../engine/combat/rewardRates';
import type { RewardRates } from '../engine/combat/rewards';
import type { ActiveCaster } from '../engine/combat/HeroActiveClock';
import { uniqueSkillFor } from '../content/heroSkills';
import { wornStats } from '../engine/equipment/equipmentSave';
import { EQUIPMENT_CONTENT } from './equipmentActions';
import type { HealthHero } from '../engine/character/stats';
import { ACTIVE_TEAM_SIZE } from '../engine/save/migrate';
import type { SavedHero, SaveV3 } from '../engine/save/schema';
import { createHeroEntity, type HeroEntity } from '../engine/entities/HeroEntity';
import type { Cast, CastMember } from '../game/models/cast';
import { heroModelKey, playerModelKey } from '../game/models/manifest';
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
  /**
   * Whose abilities are in the fight, in team order.
   *
   * The fifth unported system, connected. Built from the same rows as the
   * other four for the same reason — a hero's archetype and their relic's rank
   * both live on the save, and reading them anywhere else is a second list to
   * keep in step.
   */
  casters: ActiveCaster[];
  /**
   * The gold and EXP chains, as the two scalars the fight and the away
   * estimator both take.
   *
   * `SimulationOptions.rates` has existed since Phase 8 and **nothing ever
   * supplied it**, so every player has earned at 1x while thirteen factors sat
   * computed and unread. Built here because the same rows already feed the
   * damage chain — hero passives, relics and synergy all answer for gold and
   * EXP as well as for damage, and reading them twice is two chances to
   * disagree.
   */
  rates: RewardRates;
  /**
   * What fraction of a monster's damage actually lands.
   *
   * The demo handed the loop a flat `1` — the team taking damage raw, with no
   * defence, formation, synergy, passives or relics — which against the shipped
   * chain is up to ten times too much. See `engine/combat/mitigation.ts`.
   */
  incomingMult: number;
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

/** The reserved uid for the player's own combatant. No hero may hold it. */
export const PLAYER_UID = 'player';

/**
 * The relics that are contributing, joined with the catalogue.
 *
 * A relic contributes only when it is equipped *and* its bearer is on the
 * field, and `getUniqueRelicMultipliers` checks both — so the join has to say
 * which bearers are active rather than assume.
 */
function relicBearers(save: SaveV3, activeUids: ReadonlySet<string>): RelicBearer[] {
  const bearers: RelicBearer[] = [];
  for (const [heroId, gear] of Object.entries(save.roster.uniqueByHeroId)) {
    const template = getHeroTemplate(heroId);
    if (!template) continue;
    bearers.push({
      heroId,
      archetype: template.activeSkillArchetype,
      trait: template.passiveTrait,
      rank: gear.rank,
      equipped: gear.equippedByUid !== null,
      bearerActive: gear.equippedByUid !== null && activeUids.has(gear.equippedByUid),
    });
  }
  return bearers;
}

export function rosterFromSave(save: SaveV3): LoadedRoster {
  const heroes: HeroEntity[] = [];
  // `Cast` is `readonly CastMember[]` on purpose — nothing downstream may
  // mutate the roster it was handed — so it is built here and widened to
  // that on the way out rather than pushed into.
  const cast: CastMember[] = [];
  const baseDamage: { uid: string; damage: number }[] = [];
  const powered: PoweredHero[] = [];
  const intervals = new Map<string, number>();

  for (const row of activeRows(save)) {
    const template = getHeroTemplate(row.id);
    // The migration already drops a row whose template is gone — that is how
    // a retired hero leaves an old save. Should is not the same as does, and
    // a team member with no template has no class to swing with.
    if (template === undefined) continue;

    baseDamage.push({
      uid: row.uid,
      damage: getHeroContribution({
        uid: row.uid,
        template,
        level: row.level,
        rank: row.rank,
        rarity: row.rarity,
        rebirthStatMult: row.rebirthStatMult,
      }).damage,
    });
    powered.push({
      uid: row.uid,
      heroClass: template.heroClass,
      passiveTrait: template.passiveTrait,
      teamBoost: row.teamBoost,
    });
    intervals.set(row.uid, CLASS_ATTACK_INTERVAL_MS[template.heroClass]);
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
  const casters: ActiveCaster[] = [];
  for (const row of activeRows(save)) {
    const template = getHeroTemplate(row.id);
    if (template === undefined) continue;
    /*
     * A hero casts their relic's skill only when they are *carrying* it —
     * equipped, and equipped by this copy. A relic in the armoury, or on a
     * different copy of the same hero, leaves them on their archetype.
     */
    const gear = save.roster.uniqueByHeroId[row.id];
    const skill = uniqueSkillFor(row.id);
    casters.push({
      uid: row.uid,
      fielded: true,
      caster: {
        level: row.level,
        archetype: template.activeSkillArchetype,
        unique: skill !== null && gear?.equippedByUid === row.uid ? { skill, rank: gear.rank } : null,
      },
    });
    healthHeroes.push({
      uid: row.uid,
      heroClass: template.heroClass,
      rarity: row.rarity,
      level: row.level,
      rank: row.rank,
      rebirthStatMult: row.rebirthStatMult,
    });
  }

  /*
   * The multiplier stack, applied here rather than nowhere.
   *
   * Fourteen factors sat ported, fixture-tested and uncalled while the live
   * fight dealt bare base damage — no synergy, no formation bonus, no hero
   * passives, no relics, and nothing at all from prestige, meta levels,
   * mastery or VIP. `teamPower.ts` has the composition and why its order is
   * written out by hand.
   */
  const playerClass = save.identity.playerClass;
  const activeUids = new Set(powered.map(hero => hero.uid));

  /*
   * What the player is wearing, as a stat block.
   *
   * `derivedStats` has taken this as an argument since Phase 7 with the note
   * that "Phase 9 adds a caller rather than editing it". This is that caller,
   * and it feeds all three of the places the player's stats reach the fight —
   * their damage, the team's defence and the team's health — because the
   * shipped `derivedStats` is one function and all three read it.
   */
  const equipment = wornStats(save, EQUIPMENT_CONTENT);
  const damage = teamDamage({
    team: powered,
    relics: relicBearers(save, activeUids),
    progression: progressionFromSave(save),
    // The player fights too, and for four phases they did not. See
    // `engine/combat/playerDamage.ts`.
    playerDamage: playerContribution({
      playerClass,
      level: save.progression.level,
      alloc: save.stats.alloc,
      equipment,
    }),
    heroDamage: baseDamage,
  });

  for (const hero of damage.heroes) {
    // Every uid in `damage.heroes` came from `baseDamage`, which is built in
    // the same loop as `intervals`, so the fallback is unreachable — and is a
    // warrior's cadence rather than zero, because a zero interval is a hero
    // who swings infinitely often.
    const interval = intervals.get(hero.uid) ?? CLASS_ATTACK_INTERVAL_MS.warrior;
    heroes.push(createHeroEntity(hero.uid, hero.damage, interval));
  }

  /*
   * The player, as a seventh combatant.
   *
   * `ACTIVE_TEAM_SIZE` is six "(+ player)" in the shipped comment, and the
   * player's damage is added to the hero total before any multiplier — so they
   * are not a bonus applied to the team, they are one of the people swinging.
   * Given their own entity for the same reason the heroes were: this build
   * models discrete attacks, and a combatant folded into someone else's
   * damage cannot have a swing of their own or a floating number that says it
   * was theirs.
   *
   * Only when the character exists. Before that there is nobody to draw and
   * `playerContribution` is reading a warrior's defaults.
   */
  if (save.identity.created && playerClass !== null) {
    // `PLAYER_ATTACK_INTERVAL_MS`, not the class's. It was written for this
    // and left unused: the player's cadence sits between the warrior's and the
    // berserker's whatever they picked, because the player is not a hero of
    // their class — the class decides their stats, not their swing.
    heroes.push(createHeroEntity(PLAYER_UID, damage.player, PLAYER_ATTACK_INTERVAL_MS));
    cast.push({
      uid: PLAYER_UID,
      name: save.identity.name || 'You',
      role: getIntendedFormationRole({ uid: PLAYER_UID, heroClass: playerClass }),
      modelKey: playerModelKey(playerClass),
      silhouette: silhouetteFor(PLAYER_UID, playerClass),
    });
  }

  const defense = teamDefense({
    playerClass,
    alloc: save.stats.alloc,
    equipment,
    activeHeroes: healthHeroes,
    metaSurvivalLevel: save.progression.metaSurvivalLevel,
    rebirthSurvivalPath: save.progression.rebirthSurvivalPath,
    tacticsFacilityLevel: tacticsLevelFromLegacy(save),
  });

  return {
    heroes,
    cast,
    casters,
    rates: rewardRatesFrom({ team: powered, relics: relicBearers(save, activeUids), economy: economyFromSave(save) }),
    profile: profileFromSave(save),
    teamMaxHp: teamHealthFromSave(save, healthHeroes, equipment),
    incomingMult: incomingMultiplier({
      defense,
      playerClass,
      classPassiveUnlocked: classPassiveUnlockedFromLegacy(save),
      team: powered,
      relics: relicBearers(save, activeUids),
      // Not read from the save. A temporary buff needs a clock to expire by
      // and nothing here ticks one down, so honouring a stored one would make
      // it permanent — the same call `progressionFromSave` makes about the
      // damage buff, and for the same reason.
      damageReductionBuffPct: 0,
    }),
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
 * The damage term used to be redundant — damage and team health were functions
 * of the same hero fields, so no save change moved one without the other, and
 * a test asserted exactly that as a tripwire. Connecting the damage multiplier
 * chain broke it, which is what it was for: `metaDamageLevel` now moves damage
 * and nothing else, and so does the player's own level.
 */
export function fightSignature(roster: LoadedRoster): string {
  return JSON.stringify([
    roster.teamMaxHp,
    roster.incomingMult,
    // Abilities join it too: a hero who just picked up their relic casts a
    // different skill, and a hero who levelled heals for more.
    roster.casters.map(entry => [
      entry.uid,
      entry.caster.level,
      entry.caster.archetype,
      entry.caster.unique?.skill.type ?? null,
      entry.caster.unique?.rank ?? null,
    ]),
    // And what a kill pays, so a rebirth or a new weekly event rebuilds the
    // fight rather than going on paying the old rate.
    [roster.rates.goldMult, roster.rates.expMult],
    roster.heroes.map(hero => [hero.uid, hero.damagePerHit.toString(), hero.timer.intervalMs]),
    roster.cast.map(member => [member.uid, member.role, member.modelKey, member.silhouette]),
  ]);
}
