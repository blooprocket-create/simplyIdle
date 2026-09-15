import { useEffect, useRef, useState } from 'react';
import { Diorama } from '../game/Diorama';
import { EMPTY_SNAPSHOT, type SimulationSnapshot } from '../engine/types';
import { GameLoop } from './GameLoop';
import { Shelf } from '../ui/nav/Shelf';
import { PHASE_0_REGISTRY } from '../ui/nav/registry';
import styles from './App.module.css';

/**
 * Phase 0 shell. The diorama fills the screen and the shelf sits over it —
 * the shape the finished game keeps, with three pinned destinations and More,
 * and nothing that navigates away from the fight.
 */
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(EMPTY_SNAPSHOT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const diorama = new Diorama(canvas);
    const loop = new GameLoop();

    const unsubscribe = loop.subscribe((next) => {
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
      diorama.dispose();
    };
  }, []);

  return (
    <div className={styles.root}>
      <canvas ref={canvasRef} className={styles.stage} />
      <header className={styles.status}>
        <span className={styles.brand}>SIMPLYIDLE</span>
        <span className={styles.phase}>Phase 0 scaffold</span>
        <span className={styles.clock}>{(snapshot.elapsedMs / 1000).toFixed(1)}s</span>
      </header>
      <Shelf registry={PHASE_0_REGISTRY} snapshot={snapshot} />
    </div>
  );
}
