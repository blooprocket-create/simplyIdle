import Decimal from 'break_eternity.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Diorama } from '../game/Diorama';
import { detectCapabilities, profileFor } from '../game/device/DeviceProfile';
import { emptySnapshot, type SimulationSnapshot } from '../engine/types';
import { startingSave } from './demoRoster';
import type { EquipmentRarity, EquipmentSlot } from '../content/equipment';
import type { FacilityId } from '../engine/prestige/facilities';
import type { PrestigePath } from '../engine/prestige/rebirth';
import { canAffordSpark, canSummon, priceOfSummon, rosterActions, sparkExchange, summonOnce } from './playerActions';
import { equipmentActions, migrateLegacyEquipment } from './equipmentActions';
import { prestigeActions } from './prestigeActions';
import * as shopActions from './shopActions';
import { EMPTY_AUTOMATION_STATE, runAutomations } from './automationRunner';
import { worthBanking } from '../engine/save/bankRun';
import { bankInto } from './bank';
import { fightIdentity, fightTuning, fightTuningKey, rosterFromSave } from './roster';
import { useItem } from './playerActions';
import { choosePotion } from '../engine/items/autoPotion';
import { autoPotionThresholdFromLegacy } from '../engine/character/fromSave';
import { loadSave, writeSave } from './saveStore';
import type { SaveV3 } from '../engine/save/schema';
import type { SummonPayment } from '../engine/roster/summonSave';
import type { HeroSpend } from '../engine/roster/rosterSave';
import type { FormationRole } from '../engine/combat/formation';
import { profileFromSave } from '../ui/profile/playerProfile';
import { GameLoop } from './GameLoop';
import { loadRun, RunSaver, SAVE_INTERVAL_MS } from './runStore';
import { browserStore } from '../ui/prefs/store';
import { Rail } from '../ui/nav/Rail';
import { Shelf } from '../ui/nav/Shelf';
import { REGISTRY } from '../ui/nav/registry';
import { BossTell } from '../ui/boss/BossTell';
import { BurstControl } from '../ui/burst/BurstControl';
import { WipeOffer } from '../ui/wipe/WipeOffer';
import { Ticker } from '../ui/objectives/Ticker';
import { usePinned } from '../ui/prefs/usePinned';
import { useAutomation } from '../ui/prefs/useAutomation';
import { AbilityBar } from '../ui/abilities/AbilityBar';
import { automationProgress } from '../ui/automation/unlocks';
import type { AutomationId } from '../content/automation';
import { SurfaceHost } from '../ui/shell/SurfaceHost';
import styles from './App.module.css';

/**
 * The shell. The diorama fills the screen and everything else sits over it.
 *
 * The rule the whole structure exists for: nothing here unmounts the fight.
 * The shipped game navigated away from the battle to reach any of fifty
 * places, so the thing the player came for stopped while they were gone. A
 * destination opens as an overlay and the simulation keeps stepping behind it.
 */
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => emptySnapshot());
  const [openId, setOpenId] = useState<string | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  // The loop is held so the one player-driven verb can reach the simulation.
  // Nothing else in the shell writes to it.
  const loopRef = useRef<GameLoop | null>(null);
  // The renderer, held so the loop effect can hand it a cast without owning it.
  const dioramaRef = useRef<Diorama | null>(null);

  const open = useMemo(() => REGISTRY.find(destination => destination.id === openId) ?? null, [openId]);
  const knownIds = useMemo(() => new Set(REGISTRY.map(destination => destination.id)), []);
  // Built once: the profile is what does *not* change per frame, which is the
  // whole reason it is a separate read model from the snapshot.
  /*
   * The player's save, read once and then owned here.
   *
   * A lazy `useState` rather than a `useMemo`, because reading a save and
   * reading a clock are both impure and `useMemo` is allowed to re-run or
   * throw its result away. A player with no save gets the starting one, which
   * is a `SaveV3` like any other — so nothing downstream knows which it got.
   */
  const [initialSave] = useState(() => {
    const nowMs = Date.now();
    const stored = loadSave(browserStore(), nowMs);
    // The shipped reader converts bare catalogue ids into rolled instances on
    // every load. The engine's reader may not — it draws and reads the
    // catalogue — so it happens here, at the same moment, with both supplied.
    // See `migrateLegacyEquipment`.
    return stored === null ? startingSave(nowMs) : migrateLegacyEquipment(stored, nowMs, Math.random);
  });
  const [save, setSave] = useState<SaveV3>(initialSave);
  const saveRef = useRef(save);

  /*
   * The fight's inputs, rebuilt whenever the save moves — and **two** keys
   * come off them, which is the whole of how an account can change under a
   * running game.
   *
   * `fightIdentity` is who is fighting, and moving it rebuilds the loop.
   * `fightTuningKey` is what they hit for, and moving it is handed to the
   * running fight instead.
   *
   * These were one string, and everything was a rebuild. A rebuild resumes
   * from `RunProgress` — wave, kills, deaths, burst charge, gold, exp — so
   * levelling a hero mid-run healed the team to full, healed the *enemy* to
   * full, cleared every ability cooldown and put the clock back to zero. All
   * four measured; see `engine/combat/retune.ts`.
   */
  const roster = useMemo(() => rosterFromSave(save), [save]);
  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  const fightKey = useMemo(() => fightIdentity(roster), [roster]);
  const tuningKey = useMemo(() => fightTuningKey(roster), [roster]);
  const cast = roster.cast;
  // Rebuilt whenever the save moves, which is what makes a summon show up.
  const profile = useMemo(() => profileFromSave(save), [save]);
  /*
   * Detected once and shared with the renderer, rather than detected again
   * inside it. Two detections could disagree — `matchMedia` is live, and a
   * Settings screen reporting a different tier than the one actually being
   * drawn would be worse than no Settings screen.
   */
  const device = useMemo(() => {
    const capabilities = detectCapabilities(globalThis as never);
    return { capabilities, profile: profileFor(capabilities) };
  }, []);
  const { pinnedIds, toggle } = usePinned(knownIds);

  /*
   * What the player has earned, recomputed as the fight moves — the
   * five-hundredth kill can land mid-session, and a reward that waited for a
   * reload is one the player would not connect to what they just did.
   *
   * Only automations this build can actually honour are counted, so a bar
   * that fills for a system nobody has written does not read as a benefit.
   */
  const earned = useMemo(() => {
    const ids = automationProgress(profile, snapshot)
      .filter(entry => entry.unlocked && entry.automation.available)
      .map(entry => entry.automation.id);
    return new Set<AutomationId>(ids);
  }, [profile, snapshot]);
  const automation = useAutomation(earned);

  /*
   * Read as a boolean rather than carried as a Set. `active` is rebuilt from
   * `earned`, `earned` is memoised on the snapshot, and the snapshot is a
   * fresh object every published frame — so an effect keyed on the Set ran
   * sixty times a second to deliver an answer that changes twice a session.
   */
  const autoBurst = automation.active.has('burst');
  const autoBurstRef = useRef(autoBurst);
  const autoCast = automation.active.has('castHeroActives');
  /*
   * Read through a ref by the subscription, which is built once per fight and
   * would otherwise close over the set as it was when the loop was made.
   */
  const activeRef = useRef(automation.active);
  activeRef.current = automation.active;
  const automationStateRef = useRef(EMPTY_AUTOMATION_STATE);
  const autoCastRef = useRef(autoCast);
  const autoUsePotion = automation.active.has('usePotion');

  /*
   * Change the save, and write it down.
   *
   * Written synchronously rather than on a timer, because the things that
   * change it are single deliberate acts — a summon, a level-up — and losing
   * one to a closed tab is losing something the player paid for. The *run* is
   * throttled instead; see `RunSaver`, which is recording sixty frames a
   * second rather than one press.
   */
  const applySave = useCallback((next: SaveV3) => {
    /*
     * The ref leads the state, and deliberately. `live()` banks and then hands
     * the result to a verb, and React has not re-rendered by then — a second
     * bank in the same tick reading `save` would see the balance before the
     * first one moved it. Writing the ref here makes it the current answer.
     */
    saveRef.current = next;
    setSave(next);
    writeSave(browserStore(), next);
  }, []);

  /*
   * A verb that changes the save, wrapped so a surface gets a yes or a no.
   *
   * `rosterSave.ts` answers with the next save or null, which is the right
   * shape for an engine and the wrong one for a button: a component holding a
   * `SaveV3` would be a component that could write one.
   */
  const applying = useCallback(
    (next: SaveV3 | null): boolean => {
      if (!next) return false;
      applySave(next);
      return true;
    },
    [applySave],
  );

  /**
   * The save, with anything the run has earned already in the wallet.
   *
   * **Every verb starts here rather than from `save`**, and that is what makes
   * a purchase cost something. The player's spendable balance was read as the
   * wallet plus the run's unbanked earnings, while a purchase deducted from
   * the wallet alone and floored it at zero — so an empty wallet with a
   * million unbanked gold bought seven facility levels and still read a
   * million. Measured, not reasoned about.
   *
   * Banking first means the wallet *is* the balance at the moment anything is
   * charged, so there is no second place holding the same coin. Queries below
   * still read `save` directly: they change nothing, and a price is a price.
   */
  const live = useCallback((): SaveV3 => {
    const banked = loopRef.current?.bank();
    if (banked === undefined || !worthBanking(banked)) return saveRef.current;
    const next = bankInto(saveRef.current, banked, Date.now(), Math.random);
    applySave(next);
    return next;
  }, [applySave]);

  const actions = useMemo(
    () => ({
      summon: (pay: SummonPayment) => {
        const outcome = summonOnce({ save: live(), pay, nowMs: Date.now(), random: Math.random });
        if (outcome) applySave(outcome.save);
        return outcome;
      },
      canSummon: (pay: SummonPayment) => canSummon(save, pay),
      priceOfSummon: (pay: SummonPayment) => priceOfSummon(save, pay),
      sparkExchange: (optionId: string) => {
        const outcome = sparkExchange({ save: live(), optionId, nowMs: Date.now(), random: Math.random });
        if (outcome) applySave(outcome.save);
        return outcome;
      },
      canAffordSpark: (optionId: string) => canAffordSpark(save, optionId),
      useItem: (itemId: string, amount: number | 'all' = 1) => {
        /*
         * The one action whose result is not entirely a save. A potion heals
         * the *running fight* — the team's health is not stored — so the
         * fraction goes to the loop and everything else goes to the save.
         */
        const outcome = useItem(live(), itemId, amount);
        if (outcome === null) return false;
        applySave(outcome.save);
        loopRef.current?.heal(outcome.healFraction);
        return true;
      },
      spendOnHero: (uid: string, spend: HeroSpend) => applying(rosterActions.spendOnHero(live(), uid, spend)),
      batchLevel: (uids: readonly string[], addLevels: number | 'max') =>
        applying(rosterActions.batchLevel(live(), uids, addLevels)),
      recycle: (uid: string) => applying(rosterActions.recycle(live(), uid)),
      fieldTeam: (requested: readonly string[]) => applying(rosterActions.fieldTeam(live(), requested)),
      fieldBest: () => applying(rosterActions.fieldBest(live())),
      place: (uid: string, role: FormationRole) => applying(rosterActions.place(live(), uid, role)),
      storeLoadout: (slot: number) => applying(rosterActions.storeLoadout(live(), slot)),
      recallLoadout: (slot: number) => applying(rosterActions.recallLoadout(live(), slot)),
      buySlot: () => applying(rosterActions.buySlot(live())),
      toggleRelic: (uid: string) => applying(rosterActions.toggleRelic(live(), uid)),
      equip: (id: string) => applying(equipmentActions.equip(live(), id)),
      unequip: (slot: EquipmentSlot) => applying(equipmentActions.unequip(live(), slot)),
      dismantle: (id: string) => applying(equipmentActions.dismantle(live(), id)),
      sweep: () => applying(equipmentActions.sweep(live())),
      setSweepFloor: (floor: EquipmentRarity) => applying(equipmentActions.setFloor(live(), floor)),
      craft: (slot: EquipmentSlot) => {
        const outcome = equipmentActions.craft({ save: live(), nowMs: Date.now(), random: Math.random }, slot);
        if (outcome) applySave(outcome.save);
        return outcome;
      },
      upgrade: (id: string) => {
        const outcome = equipmentActions.upgrade({ save: live(), nowMs: Date.now(), random: Math.random }, id);
        if (outcome) applySave(outcome.save);
        return outcome;
      },
      refineEssence: (count?: number) => applying(equipmentActions.refineEssence(live(), count)),
      refineShards: (count?: number) => applying(equipmentActions.refineShards(live(), count)),
      previewRebirth: () => prestigeActions.preview(save),
      rebirth: () => applying(prestigeActions.rebirth(live())),
      priceOfPath: (path: PrestigePath) => prestigeActions.priceOfPath(save, path),
      spendCore: (path: PrestigePath) => applying(prestigeActions.spendCore(live(), path)),
      priceOfMeta: (path: PrestigePath) => prestigeActions.priceOfMeta(save, path),
      spendEssence: (path: PrestigePath) => applying(prestigeActions.spendEssence(live(), path)),
      priceOfFacility: (facilityId: FacilityId) => prestigeActions.priceOfFacility(save, facilityId),
      upgradeFacility: (facilityId: FacilityId) => {
        /*
         * Priced off the banked wallet rather than off `heldGold`, which adds
         * the run's tally to it. Once `live()` has moved that tally into the
         * wallet the two would be the same coin counted twice — the very bug
         * this banking exists to close, reappearing on the one line that
         * spends the largest sums.
         */
        const current = live();
        return applying(prestigeActions.upgradeFacility(current, facilityId, current.wallet.gold));
      },
      buyOffer: (id: string) => {
        const outcome = shopActions.buy({ save: live(), nowMs: Date.now(), random: Math.random }, id);
        if (outcome) applySave(outcome.save);
        return outcome;
      },
      buyUnits: (itemId: string, amount: number) => {
        const outcome = shopActions.buyUnits(live(), itemId, amount);
        if (outcome) applySave(outcome.save);
        return outcome;
      },
      claimVip: (level: number) => {
        const claim = shopActions.claimVip(live(), level);
        if (claim === null) return false;
        applySave(claim.save);
        return true;
      },
      recordCodex: () => {
        const swept = shopActions.recordCodex(live());
        if (swept.recorded > 0) applySave(swept.save);
        return swept.recorded;
      },
      // A query: it counts what a sweep would record without recording it, so
      // the disabled button and any badge can both ask the same function.
      claimableCodex: () => shopActions.claimableCodexEntries(save),
    }),
    [save, applySave, applying, live],
  );

  const select = (id: string) => {
    if (id === 'more') {
      setRailOpen(true);
      return;
    }
    setRailOpen(false);
    setOpenId(id);
  };

  /*
   * The renderer, which outlives a team change.
   *
   * Split from the loop below for exactly that reason: disposing a Babylon
   * engine and building another costs hundreds of milliseconds, and a player
   * who swapped a hero would pay it every time. The diorama takes a new cast
   * through `setCast`; it does not need to be rebuilt to draw different people.
   *
   * Its dependencies are a subset of the loop's, so any run of this effect is
   * followed by a run of that one — which is what guarantees a freshly built
   * diorama is handed a cast before it draws.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const diorama = new Diorama(canvas, { profile: device.profile });
    dioramaRef.current = diorama;

    const onResize = () => diorama.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      dioramaRef.current = null;
      diorama.dispose();
    };
  }, [device.profile]);

  useEffect(() => {
    const diorama = dioramaRef.current;
    if (!diorama) return;

    // Read through a ref rather than taken as a dependency: the object is
    // rebuilt on every save change, and only the signature says whether the
    // fight would notice.
    const roster = rosterRef.current;
    diorama.setCast(roster.cast);

    /*
     * The run, and how long the player was gone.
     *
     * Read here rather than at mount, and deliberately: `loadRun` restamps
     * the mark as it reads, so if this effect ever runs twice — a device
     * profile change, a development double-invoke — the second read finds a
     * fresh mark and credits nothing, instead of handing out the same
     * absence again.
     */
    const store = browserStore();
    const restored = loadRun(store, Date.now());
    const saver = new RunSaver(store);
    /*
     * Seeded from the ref rather than the value, so a toggle does not belong
     * in this effect's deps — it would restart the fight from wave one every
     * time the player flipped a switch.
     */
    const loop = new GameLoop({
      heroes: roster.heroes,
      // Derived from whichever roster answered — a save's or the starting one.
      // Both go through the same `teamMaxHp`, so a returning player and a new
      // one are measured by one rule rather than two.
      teamMaxHp: new Decimal(roster.teamMaxHp),
      // The whole mitigation chain, derived. It used to be a flat `1` handed
      // over by `demoSimulationOptions` — the team taking a monster's damage
      // raw, which against the shipped chain is up to ten times too much.
      incomingMult: roster.incomingMult,
      casters: roster.casters,
      // The gold and EXP chains. This option has existed since Phase 8 with
      // nothing supplying it, so every kill paid a flat 1x; `ui/architecture`
      // now refuses a `LoadedRoster` field the loop takes and the shell drops.
      rates: roster.rates,
      autoBurst: autoBurstRef.current,
      autoCast: autoCastRef.current,
      // The one place the real generator enters the fight. The engine's own
      // default is seeded, so a shell that forgot this would run a repeating
      // campaign rather than no campaign — quiet, and worth not being quiet.
      random: Math.random,
      resume: restored.resume ?? undefined,
      awayMs: restored.awayMs,
    });
    loopRef.current = loop;

    const unsubscribe = loop.subscribe(next => {
      diorama.render(next);
      setSnapshot(next);
      /*
       * Banked on the same throttle the run is saved on, so an idle player
       * levels too. Without this a player who never pressed anything would
       * earn gold that stayed in the run forever and heroes who never
       * levelled — every verb banks, and a player at rest presses no verbs.
       */
      if (saver.tick(next, Date.now())) {
        const banked = live();
        /*
         * And the save-side automations, on the same cadence and after the
         * bank — an automatic summon spends the boss tears the run just
         * earned, so running it against an unbanked wallet would refuse a
         * purchase the player can afford.
         */
        const ran = runAutomations(
          activeRef.current,
          {
            save: banked,
            elapsedMs: SAVE_INTERVAL_MS,
            nowMs: Date.now(),
            random: Math.random,
          },
          automationStateRef.current,
        );
        automationStateRef.current = ran.state;
        if (ran.save !== null) applySave(ran.save);
      }
    });
    loop.start();

    /*
     * `pagehide` rather than `beforeunload`: on iOS a backgrounded tab is
     * frozen and may never unload at all, so `beforeunload` is the one event
     * that does not fire for the players most likely to be away long enough
     * for the away credit to matter.
     */
    const onHide = () => saver.flush(loop.read(), Date.now());
    window.addEventListener('pagehide', onHide);

    return () => {
      window.removeEventListener('pagehide', onHide);
      /*
       * Flushed on the way out, which is what makes a rebuild continue rather
       * than restart: the next run of this effect reads it straight back
       * through `loadRun`. The mark is restamped by that read, so the gap
       * between the two — a few milliseconds — credits nothing.
       */
      saver.flush(loop.read(), Date.now());
      unsubscribe();
      loop.stop();
      loopRef.current = null;
    };
  }, [fightKey, device.profile, live]);

  /*
   * The one place a preference reaches the simulation, and deliberately below
   * the effect that builds the loop: React runs effects in declaration order,
   * so above it this fired against a null ref on mount and the player's saved
   * choice was dropped until they toggled something.
   */
  useEffect(() => {
    autoBurstRef.current = autoBurst;
    loopRef.current?.setAutoBurst(autoBurst);
  }, [autoBurst]);

  useEffect(() => {
    autoCastRef.current = autoCast;
    loopRef.current?.setAutoCastHeroActives(autoCast);
  }, [autoCast]);

  /*
   * Auto-potion is the one automation that is neither purely in-fight nor
   * purely save-side: the loop watches the health and this decides what comes
   * out of the bag. `choosePotion` owns the rule; nothing about *when* or
   * *which* is decided here.
   *
   * It must not call `loopRef.heal` the way the manual press does — the loop
   * applies what this returns, and healing twice would make an automatic
   * potion worth double a hand-pressed one.
   */
  const drink = useCallback(
    (hpRatio: number) => {
      const current = live();
      const itemId = choosePotion({
        hpRatio,
        held: current.usables,
        threshold: autoPotionThresholdFromLegacy(current),
      });
      if (itemId === null) return 0;
      const outcome = useItem(current, itemId, 1);
      if (outcome === null) return 0;
      applySave(outcome.save);
      return outcome.healFraction;
    },
    [live, applySave],
  );

  useEffect(() => {
    loopRef.current?.setAutoUsePotion(autoUsePotion ? drink : null);
  }, [autoUsePotion, drink]);

  /*
   * New numbers for the fight in progress. Below the effect that builds the
   * loop, for the reason the two above are: effects run in declaration order,
   * and above it this would retune a loop that does not exist yet.
   *
   * Keyed on the string rather than the roster, because `rosterFromSave` hands
   * back a fresh object every time the save moves — a summon that changed
   * nothing the fight reads would otherwise retune it on every press.
   */
  useEffect(() => {
    loopRef.current?.retune(fightTuning(rosterRef.current));
  }, [tuningKey]);

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.stage} />
      <header className={styles.status}>
        <span className={styles.brand}>SIMPLYIDLE</span>
        <span className={styles.phase}>Phase 3 shell</span>
        <span className={styles.clock}>{(snapshot.elapsedMs / 1000).toFixed(1)}s</span>
      </header>
      <Ticker snapshot={snapshot} profile={profile} />
      <SurfaceHost
        destination={open}
        snapshot={snapshot}
        profile={profile}
        cast={cast}
        device={device}
        pinnedIds={pinnedIds}
        automation={automation}
        actions={actions}
        save={save}
        onDismiss={() => setOpenId(null)}
      />
      {railOpen && (
        <Rail
          registry={REGISTRY}
          snapshot={snapshot}
          pinnedIds={pinnedIds}
          onSelect={select}
          onTogglePin={toggle}
          onDismiss={() => setRailOpen(false)}
        />
      )}
      {/*
        Last, so it paints over the surface and the rail. There is not one
        `z-index` in the tree — paint order is DOM order — and both halves of
        that are pinned by `ui/architecture.test.ts`.

        A wipe offer has to survive an open surface. It stands eight seconds
        and then lapses in silence, so one raised while the player was reading
        Heroes expired unseen and the retreat stood unanswered: most of the way
        back to the silent teleport this phase exists to end.

        BURST does not need the same and is gated on the surface being closed.
        A lapsed window keeps its charge and re-arms, so a player who is
        reading loses the peak and nothing else — where a pulsing control over
        the thing they opened would cost them the reading.
      */}
      <div className={styles.verbs}>
        {snapshot.wipe !== null && (
          <WipeOffer
            offer={snapshot.wipe}
            onRally={() => loopRef.current?.decideWipe('rally')}
            onDismiss={() => loopRef.current?.decideWipe('retreat')}
          />
        )}
        {open === null && snapshot.boss !== null && (
          <BossTell boss={snapshot.boss} onAnswer={() => loopRef.current?.answerTell()} />
        )}
        {open === null && (
          <AbilityBar
            abilities={snapshot.abilities}
            cast={cast}
            automatic={autoCast}
            earned={earned.has('castHeroActives')}
            onCast={uid => loopRef.current?.castHeroActive(uid)}
            onToggleAuto={() => automation.toggle('castHeroActives')}
          />
        )}
        {open === null && <BurstControl burst={snapshot.burst} onSpend={() => loopRef.current?.spendBurst()} />}
      </div>
      <Shelf registry={REGISTRY} snapshot={snapshot} pinnedIds={pinnedIds} onSelect={select} />
    </div>
  );
}
