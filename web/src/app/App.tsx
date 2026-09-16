import { useEffect, useMemo, useRef, useState } from 'react';
import { Diorama } from '../game/Diorama';
import { detectCapabilities, profileFor } from '../game/device/DeviceProfile';
import { emptySnapshot, type SimulationSnapshot } from '../engine/types';
import { demoCast, demoHeroes, demoProfile, demoSimulationOptions } from './demoRoster';
import { GameLoop } from './GameLoop';
import { Rail } from '../ui/nav/Rail';
import { Shelf } from '../ui/nav/Shelf';
import { REGISTRY } from '../ui/nav/registry';
import { BurstControl } from '../ui/burst/BurstControl';
import { WipeOffer } from '../ui/wipe/WipeOffer';
import { Ticker } from '../ui/objectives/Ticker';
import { usePinned } from '../ui/prefs/usePinned';
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
  const cast = useMemo(() => demoCast(), []);
  const profile = useMemo(() => demoProfile(), []);
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
    const loop = new GameLoop({ heroes: demoHeroes(), ...demoSimulationOptions() });
    loopRef.current = loop;

    const unsubscribe = loop.subscribe(next => {
      diorama.render(next);
      setSnapshot(next);
    });
    loop.start();

    const onResize = () => diorama.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      unsubscribe();
      loop.stop();
      loopRef.current = null;
      diorama.dispose();
    };
  }, [cast, device.profile]);

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.stage} />
      <header className={styles.status}>
        <span className={styles.brand}>SIMPLYIDLE</span>
        <span className={styles.phase}>Phase 3 shell</span>
        <span className={styles.clock}>{(snapshot.elapsedMs / 1000).toFixed(1)}s</span>
      </header>
      <Ticker snapshot={snapshot} profile={profile} />
      {open === null && (
        <div className={styles.verbs}>
          {snapshot.wipe !== null && (
            <WipeOffer
              offer={snapshot.wipe}
              onRally={() => loopRef.current?.decideWipe('rally')}
              onDismiss={() => loopRef.current?.decideWipe('retreat')}
            />
          )}
          <BurstControl burst={snapshot.burst} onSpend={() => loopRef.current?.spendBurst()} />
        </div>
      )}
      <SurfaceHost
        destination={open}
        snapshot={snapshot}
        profile={profile}
        cast={cast}
        device={device}
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
      <Shelf registry={REGISTRY} snapshot={snapshot} pinnedIds={pinnedIds} onSelect={select} />
    </div>
  );
}
