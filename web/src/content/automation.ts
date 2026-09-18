import type { AchievementSignal } from './achievements';

/**
 * Automation, as something earned.
 *
 * The shipped game shipped **eight** `auto*` flags as plain settings toggles
 * in `settingsReducer.ts`. Seven of the eight default to `false` — REVAMP says
 * they "let the game play itself from the start", which is right about the
 * effect and wrong about the defaults — but **none of them is gated**, so a
 * player can switch the whole game off in their first minute and never learn
 * a single verb.
 *
 * It said nine here for six phases, and the ninth was `equipBest`. There is no
 * `autoEquipBestHeroes` flag: that name belongs to a `useCallback` dispatching
 * a one-shot action from a button. It is a verb, it lives on the Party screen
 * as one, and `engine/roster/bestTeam.ts` is the rule — which is why every
 * note about it saying "no rule has been ported or measured" went six phases
 * without anyone finding one. They were looking for the wrong shape.
 *
 * So each one is earned, against the same signals the achievements are
 * measured on. Reusing that vocabulary is deliberate: an unlock condition and
 * an achievement are the same kind of statement about a player's history, and
 * two ways of asking "how many have they killed" would drift.
 *
 * Most of the nine are listed but not `available`, because the systems they
 * automate do not exist in this rewrite yet. They are here rather than
 * omitted for the same reason the untracked achievements are: a screen that
 * showed two automations would be telling the player this game has two.
 */

export type AutomationId =
  | 'burst'
  | 'castHeroActives'
  | 'dismantle'
  | 'recycle'
  | 'summon'
  | 'tempo'
  | 'useCoolant'
  | 'usePotion';

export interface Automation {
  id: AutomationId;
  /** The shipped flag this corresponds to, so the mapping stays checkable. */
  shippedFlag: string;
  name: string;
  /** What it does once it is on. */
  effect: string;
  /** What it costs the player who uses it, stated plainly. */
  tradeoff: string;
  signal: AchievementSignal;
  goal: number;
  /**
   * Whether this build can actually honour it. False means the system it
   * automates has not been written, not that the player cannot reach it.
   */
  available: boolean;
}

export const AUTOMATIONS: readonly Automation[] = [
  {
    id: 'burst',
    shippedFlag: 'autoBurstEnabled',
    name: 'Auto-burst',
    effect: 'A BURST window you do not answer fires itself as it closes.',
    // The whole design of the verb in one line: it buys never missing, and
    // nothing else. Hand-played bursts stay worth up to three times as much.
    tradeoff: 'Always at the weakest point of the window.',
    signal: 'totalKills',
    goal: 500,
    available: true,
  },
  {
    id: 'castHeroActives',
    shippedFlag: 'autoCastHeroActivesEnabled',
    name: 'Auto-cast abilities',
    effect: 'Hero abilities fire as soon as they come off cooldown.',
    tradeoff: 'Spent the moment they are ready, not when they would land best.',
    signal: 'level',
    goal: 25,
    // Available as of the commit that gave abilities a bar to be pressed on.
    // It is the one automation whose shipped default was *on*, which is how a
    // team cast four skills for five phases with nothing on screen naming
    // them. Here it is earned like the rest, so the verb is hand-played first
    // and automated second rather than the other way round.
    available: true,
  },
  {
    id: 'tempo',
    shippedFlag: 'autoTempoEnabled',
    name: 'Auto-tempo',
    effect: 'Raises combat tempo whenever the team is not overheating.',
    tradeoff: 'Runs hot, so a bad wave costs more.',
    signal: 'wave',
    goal: 50,
    available: false,
  },
  {
    id: 'summon',
    shippedFlag: 'autoSummonEnabled',
    name: 'Auto-summon',
    effect: 'Spends gold above a reserve on summons.',
    tradeoff: 'Gold you were saving for something else.',
    signal: 'totalGold',
    goal: 1_000_000,
    // Available as of Phase 10. The blocker was a wallet — an automatic
    // summon spends boss tears and nothing earned them — and the fight earns
    // and banks them now.
    available: true,
  },
  {
    id: 'recycle',
    shippedFlag: 'autoRecycleEnabled',
    name: 'Auto-recycle',
    effect: 'Recycles duplicate heroes below a rarity floor.',
    tradeoff: 'Nothing asks before a hero goes.',
    signal: 'heroRosterCount',
    goal: 20,
    // Available as of Phase 10, for the same reason `summon` is: it pays into
    // hero shards, which a banked run now holds.
    available: true,
  },
  {
    id: 'dismantle',
    shippedFlag: 'autoDismantleEnabled',
    name: 'Auto-dismantle',
    effect: 'Breaks down equipment below a rarity floor for scrap.',
    tradeoff: 'Nothing asks before an item goes.',
    signal: 'equipmentScrap',
    goal: 500,
    // Available as of Phase 10. It runs off the shell's save cadence rather
    // than the shipped combat tick, which is where every save-side automation
    // runs here.
    available: true,
  },
  {
    id: 'usePotion',
    shippedFlag: 'autoUsePotionEnabled',
    name: 'Auto-potion',
    effect: 'Drinks a potion when the team drops below a threshold.',
    tradeoff: 'Potions spent on waves you would have survived.',
    signal: 'totalKills',
    goal: 2_500,
    // Available as of Phase 10. It is the one automation honoured by the
    // *loop* rather than by the simulation or the save runner: the trigger is
    // the team's health, which only the fight knows, and the potion comes out
    // of the bag, which only the save holds.
    available: true,
  },
  {
    id: 'useCoolant',
    shippedFlag: 'autoUseCoolantEnabled',
    name: 'Auto-coolant',
    effect: 'Spends coolant to clear combat heat.',
    tradeoff: 'Coolant spent on heat that would have decayed anyway.',
    signal: 'bossTears',
    goal: 50,
    available: false,
  },
];

export const AUTOMATION_COUNT = AUTOMATIONS.length;

export function availableAutomations(): Automation[] {
  return AUTOMATIONS.filter(entry => entry.available);
}

export function automationById(id: AutomationId): Automation | undefined {
  return AUTOMATIONS.find(entry => entry.id === id);
}
