import { useEffect, useMemo, useRef, useState } from 'react';
import { Diorama } from '../game/Diorama';
import { detectCapabilities, profileFor } from '../game/device/DeviceProfile';
import { emptySnapshot, type SimulationSnapshot } from '../engine/types';
import { demoSimulationOptions, startingRoster } from './demoRoster';
import { rosterFromSave } from './roster';
import { loadSave } from './saveStore';
import { GameLoop } from './GameLoop';
import { loadRun, RunSaver } from './runStore';
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

  const open = useMemo(() => REGISTRY.find(destination => destination.id === openId) ?? null, [openId]);
  const knownIds = useMemo(() => new Set(REGISTRY.map(destination => destination.id)), []);
  // Built once: the profile is what does *not* change per frame, which is the
  // whole reason it is a separate read model from the snapshot.
  /*
   * The player's team, from their save when they have one.
   *
   * Read once, because none of it changes per frame — which is the whole
   * reason it is a separate read model from the snapshot. A player with no
   * save gets the starting team instead; both branches return the same
   * shape, so nothing downstream knows which it got.
   *
   * A lazy `useState` rather than a `useMemo`, because reading a save and
   * reading a clock are both impure and `useMemo` is allowed to re-run or
   * throw its result away. This runs exactly once, which is also what makes
   * it safe in the loop effect's dependencies below.
   */
  const [roster] = useState(() => {
    const save = loadSave(browserStore(), Date.now());
    return save === null ? startingRoster() : rosterFromSave(save);
  });
  const cast = roster.cast;
  const profile = roster.profile;
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

  const select = (id: string) => {
    if (id === 'more') {
      setRailOpen(true);
      return;
    }
    setRailOpen(false);
    setOpenId(id);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const diorama = new Diorama(canvas, { profile: device.profile });
    diorama.setCast(cast);

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
     * in this effect's deps — it would tear down the diorama and restart the
     * fight from wave one every time the player flipped a switch.
     */
    const loop = new GameLoop({
      heroes: roster.heroes,
      ...demoSimulationOptions(),
      autoBurst: autoBurstRef.current,
      resume: restored.resume ?? undefined,
      awayMs: restored.awayMs,
    });
    loopRef.current = loop;

    const unsubscribe = loop.subscribe(next => {
      diorama.render(next);
      setSnapshot(next);
      saver.tick(next, Date.now());
    });
    loop.start();

    const onResize = () => diorama.resize();
    window.addEventListener('resize', onResize);

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
      window.removeEventListener('resize', onResize);
      saver.flush(loop.read(), Date.now());
      unsubscribe();
      loop.stop();
      loopRef.current = null;
      diorama.dispose();
    };
  }, [cast, device.profile, roster]);

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
        {open === null && <BurstControl burst={snapshot.burst} onSpend={() => loopRef.current?.spendBurst()} />}
      </div>
      <Shelf registry={REGISTRY} snapshot={snapshot} pinnedIds={pinnedIds} onSelect={select} />
    </div>
  );
}
