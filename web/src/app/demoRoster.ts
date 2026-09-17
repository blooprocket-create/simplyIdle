import type { PlayerClass } from '../content/classes';
import { HERO_POOL, heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import type { FormationRole } from '../engine/combat/formation';
import type { Rarity } from '../content/rarities';
import { readSave } from '../engine/save/v3';
import type { SaveV3 } from '../engine/save/schema';

/**
 * The team a player starts on, and what they see before they have a save.
 *
 * This was scaffolding — "a team and a player to look at until there is a
 * save to load them from" — and `saveStore.ts` is now that somewhere, so the
 * shell reaches for this only when there is no save at all. What is left is
 * not a placeholder but an answer the cutover owed anyway: what does someone
 * who has never played see?
 *
 * **It is a save.** That is the change here, and it fixed three separate
 * disagreements rather than tidying one. The file used to bolt four
 * independently written things together — heroes with hand-written DPS, a
 * cast, a `PlayerProfile` built by hand, and a team health figure derived from
 * *different heroes again* — and each told a different story about the same six
 * people:
 *
 * - The profile listed them at levels 40 to 75 with mixed rarities. The health
 *   derivation assumed six **level-one commons**, and so came out at 843 for a
 *   team the screens described as veterans.
 * - Their damage was `100 + index * 18`, chosen so the cast bars would visibly
 *   run at different rates. Nothing derived it, so the demo's whole balance
 *   rested on a presentation decision.
 * - The profile gave them `rank: index % 3`, which starts at **zero**. There is
 *   no rank zero; the save reader clamps it to one.
 *
 * And the formation was illegal. Picking one hero per class gives three whose
 * intended rank is `front` plus a spare that was usually a fourth, and a rank
 * holds two — so the shipped rules would field only **four** of the six. The
 * cast path does not check, so the diorama drew all six standing somewhere the
 * game says they cannot stand.
 *
 * Building one save and running it through `rosterFromSave` makes all of that
 * impossible rather than merely fixed, for the reason that function's own
 * comment gives: a save has three readers, which is three chances to disagree.
 *
 * What it costs: the starting team now deals 365 DPS rather than 870 and has
 * 3,826 health rather than 843, because both are derived from the six heroes
 * actually shown. The demo is *better* for it — over ten minutes it reaches
 * wave 48 against the old wave 43, wiping twice instead of eight times, and
 * both versions meet their first wall at wave 41.
 */

/** Enough spread to show the roster's rarity tones actually differ. */
const STARTING_RARITY: readonly Rarity[] = ['legendary', 'epic', 'rare', 'mythic', 'uncommon', 'common'];

interface StartingHero {
  id: string;
  role: FormationRole;
}

/**
 * Six heroes who can legally stand together.
 *
 * Taken from the catalogue rather than written out here — an earlier version
 * listed six names by hand, which drifted the moment the catalogue landed: the
 * name came from this file and the emoji and tier came from `content/heroes.ts`
 * under the same id, so a mage was displayed with a warrior's shield.
 *
 * The *shape* of the team is the part that had to be chosen rather than
 * discovered. `warrior` and `berserker` may only stand at the front, `mage`
 * only at mid and `archer` only at back; `monk` may take either front or mid.
 * A rank holds two. So one of each class cannot be fielded together — three of
 * the five want the front — and the sixth is a **second archer** rather than
 * an arbitrary spare, which is what makes a legal two-two-two.
 *
 * The monk goes to mid rather than to their intended front for the same
 * reason: they are the only hero here with a choice, and spending it is what
 * leaves room for both front-rankers.
 */
function startingTeam(): StartingHero[] {
  const firstOf = (heroClass: PlayerClass, exclude: readonly string[] = []): string => {
    const found = HERO_POOL.find(hero => hero.heroClass === heroClass && !exclude.includes(hero.id));
    if (!found) throw new Error(`the catalogue has no ${heroClass} left to start with`);
    return found.id;
  };

  const archer = firstOf('archer');
  return [
    { id: firstOf('warrior'), role: 'front' },
    { id: firstOf('berserker'), role: 'front' },
    { id: firstOf('monk'), role: 'mid' },
    { id: firstOf('mage'), role: 'mid' },
    { id: archer, role: 'back' },
    { id: firstOf('archer', [archer]), role: 'back' },
  ];
}

/**
 * The starting save.
 *
 * Built as a raw payload and read through `readSave`, rather than returned as a
 * `SaveV3` literal. That is not ceremony: it means the starting save is a save
 * *by construction* — bounded by the same reader every stored save goes
 * through, and subject to the idempotence `v3.test.ts` holds that reader to. A
 * literal could quietly carry a rank of zero or a formation the rules forbid,
 * which is exactly what the hand-built profile did.
 */
export function startingSave(nowMs: number): SaveV3 {
  const team = startingTeam();
  const formationByUid: Record<string, FormationRole> = {};
  for (const hero of team) formationByUid[hero.id] = hero.role;

  const payload = {
    version: 3,
    awayAtMs: nowMs,
    identity: { name: 'Wanderer', playerClass: 'warrior', created: true },
    progression: { level: 42, exp: 1_200, wave: 1, highestWave: 37, totalKills: 1_482 },
    stats: { alloc: { strength: 12, vitality: 8, agility: 5, intelligence: 2, spirit: 3 }, unspent: 4 },
    wallet: { gold: 8_421_000, totalGold: 41_900_000, diamonds: 312, heroShards: 1_840, essence: 26 },
    roster: {
      heroes: team.map((hero, index) => ({
        id: hero.id,
        // One instance of each template, so the uid and the template id are the
        // same string here. A summoned duplicate would not be.
        uid: hero.id,
        rarity: STARTING_RARITY[index % STARTING_RARITY.length],
        level: 40 + index * 7,
        // Ranks run from one. `index % 3` gave a rank of zero to every third
        // hero, which the reader clamps — visible only as a roster row that
        // would not move.
        rank: (index % 3) + 1,
        // `teamBoost` is deliberately absent. The reader floors it at the
        // hero's own authored base boost, so stating it here would either
        // duplicate the catalogue or contradict it — and a save that
        // under-reports a boost is repaired upward rather than trusted.
        rebirthStatMult: 1,
      })),
      activeUids: team.map(hero => hero.id),
      formationByUid,
      slotsUnlocked: team.length,
    },
  };

  return readSave(payload, {
    nowMs,
    content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() },
  });
}

/*
 * `demoSimulationOptions` used to live here, handing the loop a flat
 * `incomingMult: 1`.
 *
 * Its note explained the first half of the problem — `incomingMult` defaults
 * to *zero* in `Simulation`, which is right for a test isolating damage dealt
 * and made the app's team literally invulnerable, stalling around wave 59 with
 * the wipe offer unreachable. A shell demonstrating a game with no failure
 * state is demonstrating the wrong game.
 *
 * One was the fix and it was still wrong the other way: the shipped chain
 * reduces incoming damage by up to ninety percent, so a flat one is a team
 * taking as much as ten times what it should. `rosterFromSave` derives it now,
 * from the same save as everything else.
 */
