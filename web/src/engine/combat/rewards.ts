import Decimal from 'break_eternity.js';
import { getMonsterAffixModifiers } from '../../content/affixes';
import { getMonsterExp, getMonsterGold } from '../waves/curves';
import { addPayout, EMPTY_PAYOUT, killPayout, type KillPayout } from './killPayout';

/**
 * What a kill pays.
 *
 * Until this existed the rewrite had no economy at all: `Simulation` tracked
 * kills, deaths and damage and nothing else, `awayCredit.ts` carried a note
 * saying "it has no economy yet, so no gold or EXP is awarded here", and
 * `demoRoster.ts` handed the profile a hardcoded `gold: 8_421_000` in the same
 * spirit as the flat team health Phase 7 replaced.
 *
 * So the offline estimator has been computing gold correctly and throwing it
 * away, while the live loop earned none — a player who closed the tab was told
 * nothing and a player who stayed earned nothing.
 *
 * **This is not Phase 9.** The plan puts currencies in Phase 10, and this is a
 * slice of it pulled forward because Phase 8's roster UI is priced in gold —
 * `heroGoldLevelCost`, `batchLevel` and `TEAM_SLOT_UNLOCK_RULES` all take a
 * purse — and a screen that shows what a level costs against a balance that
 * does not exist is a screen that cannot be built. Phase 9's crafting is
 * priced partly in gold too. The plan records the reordering rather than
 * leaving it implied.
 *
 * It is a *slice*: gold and EXP, earned. Not spending, and not the other seven
 * currencies. In particular the `summon` and `recycle` automations are **not**
 * unblocked by it — an automatic summon spends boss tears and an automatic
 * recycle pays into hero shards, and neither of those is here. Those two stay
 * Phase 10, which is where they already were.
 *
 * Lives in its own module because `Simulation.ts` is six lines under a
 * 300-line cap, and that cap is a guard rather than a formality — the
 * simulation this rewrite replaces reached 5,901 lines because nothing was
 * checking. `swingSchedule.ts` came out for the same reason.
 */

export interface RewardRates {
  /**
   * The whole gold multiplier chain — prestige, achievements, meta, hero
   * passives, synergy, mastery, weekly event, VIP and treasury — as one
   * measured scalar, exactly as `OfflineConditions.goldMult` carries it. One
   * number rather than the chain, because the chain is Phase 10's and this has
   * to agree with the estimator today.
   */
  goldMult: number;
  expMult: number;
}

export const FLAT_RATES: RewardRates = { goldMult: 1, expMult: 1 };

/** What a bank moves out of the run. See `RunEarnings.bank` for what does not. */
export interface BankedRun {
  gold: Decimal;
  essence: number;
  bossTears: number;
}

export interface Purse {
  gold: Decimal;
  exp: Decimal;
}

export const EMPTY_PURSE: Purse = { gold: new Decimal(0), exp: new Decimal(0) };

/**
 * What one monster at `wave` pays.
 *
 * Affixes are read here rather than passed in, for the same reason
 * `spawnEnemy` reads them: the live simulation and the offline estimator have
 * to face the same monster at the same wave, and two callers looking them up
 * separately is two chances to disagree.
 *
 * **Rounded up, once, over the whole product.** `killMonster` in the shipped
 * game wraps its entire chain in a single `Math.ceil`, so a kill worth 10.2
 * gold pays 11 — and at wave one, where the curve floors at a handful of gold
 * and the chain is a few percent either way, rounding down instead would pay a
 * new account nothing at all for its first kills.
 *
 * The offline estimator deliberately does *not* round: it prices a window by
 * resolving rounds and extrapolating repeats, so a per-kill ceiling would be
 * applied to kills it never individually simulated and would compound across
 * thousands of them. The live loop matches the shipped game kill for kill and
 * the estimator matches it in aggregate; `RunEarnings` keeps both, which is why
 * `creditAway` takes a block whole rather than re-deriving it from a count.
 */
export function killReward(wave: number, rates: RewardRates): Purse {
  const safeWave = Math.max(1, Math.floor(wave));
  const affix = getMonsterAffixModifiers(safeWave);
  return {
    gold: getMonsterGold(safeWave).mul(rates.goldMult).mul(affix.goldMult).ceil(),
    exp: getMonsterExp(safeWave).mul(rates.expMult).mul(affix.expMult).ceil(),
  };
}

/**
 * The run's earnings.
 *
 * Deliberately not a balance. This counts what the *run* has earned, which is
 * what the simulation can honestly know — what the player *holds* is the save's
 * wallet plus this, minus whatever they have spent, and spending is Phase 10's.
 * Conflating the two would make the first screen that spends gold decrement a
 * number that means "earned since the run began".
 */
export class RunEarnings {
  private purse: Purse;

  /**
   * Readable, because the offline estimator needs the same chain: it prices a
   * window wave by wave inside its own round model, so the rates have to reach
   * it rather than being applied to the total it hands back. Lending them from
   * here is what keeps the away window and the live loop on one chain.
   */
  constructor(
    public rates: RewardRates = FLAT_RATES,
    resume: Purse = EMPTY_PURSE,
  ) {
    this.purse = { gold: resume.gold, exp: resume.exp };
  }

  private payout: KillPayout = EMPTY_PAYOUT;

  /**
   * Credit one kill, at the wave that died rather than the one replacing it.
   *
   * `random` is the chest roll and nothing else — an argument rather than a
   * reach for `Math.random`, so the away estimator and the live loop cannot
   * disagree about a wave they both modelled. `killPayout` draws only on a
   * chest node, so a seeded generator advances exactly where the shipped game
   * advances it.
   */
  creditKill(wave: number, random: () => number): void {
    const reward = killReward(wave, this.rates);
    this.purse = { gold: this.purse.gold.add(reward.gold), exp: this.purse.exp.add(reward.exp) };
    this.payout = addPayout(this.payout, killPayout(wave, random));
  }

  /** What the run has earned that is not gold or EXP. */
  spoils(): KillPayout {
    return this.payout;
  }

  /**
   * Hand over the earnings the account can store, and stop holding them.
   *
   * The half that was missing. `RunEarnings` is documented as "deliberately
   * not a balance" — what the player *holds* is the save's wallet plus this —
   * and that held true right up until something spent it. `heldGold` added the
   * two, purchases deducted from the wallet alone and floored it at zero, and
   * the run's tally never moved: measured, an empty wallet with a million
   * unbanked gold bought **seven** facility levels and still read a million.
   *
   * Essence and boss tears have the opposite fault rather than the same one.
   * Nothing adds the run's share of those to the wallet before spending, so
   * they were simply never arriving. Both are one bug: a coin has to belong to
   * the wallet or to the run, and never to both or to neither.
   *
   * **EXP, season points and mastery XP stay in the run**, and deliberately:
   * the account has nowhere to put them yet. Player levelling reads
   * `save.progression.level` and nothing converts EXP into it; season points
   * and mastery live in the legacy bag untyped. Zeroing them here would lose
   * them, which is worse than leaving them uncounted — so they keep
   * accumulating and the phase that gives them a home banks them.
   */
  bank(): BankedRun {
    const banked = {
      gold: this.purse.gold,
      essence: this.payout.essence,
      bossTears: this.payout.bossTears,
    };
    this.purse = { gold: new Decimal(0), exp: this.purse.exp };
    this.payout = { ...this.payout, essence: 0, bossTears: 0 };
    return banked;
  }

  /**
   * Credit a block the estimator already priced.
   *
   * Taken whole rather than recomputed per kill: the estimator prices a window
   * by simulating rounds and extrapolating repeats, so re-deriving it from a
   * kill count would silently drop everything the extrapolation accounted for.
   */
  creditAway(gold: Decimal, exp: Decimal): void {
    this.purse = { gold: this.purse.gold.add(gold), exp: this.purse.exp.add(exp) };
  }

  read(): Purse {
    return this.purse;
  }
}
