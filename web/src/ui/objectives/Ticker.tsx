import type { SimulationSnapshot } from '../../engine/types';
import { currentObjective } from './objectives';
import styles from './Ticker.module.css';

/**
 * One objective, in the HUD, over the fight.
 *
 * The thing it replaces is a screen you had to go and check — which meant a
 * goal three kills away was invisible unless you navigated to it, and
 * navigating to it stopped the battle. One line, always the nearest thing,
 * and nothing to open.
 */
export function Ticker({ snapshot }: { snapshot: SimulationSnapshot }) {
  const objective = currentObjective(snapshot);
  // Nothing left is nothing shown. A ticker that looped back to the first
  // objective would read as progress being taken away.
  if (objective === null) return null;

  return (
    <div className={styles.ticker}>
      <div className={styles.line}>
        <span className={styles.label}>{objective.label}</span>
        <span className={styles.detail}>{objective.detail}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={objective.label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(objective.fraction * 100)}
        aria-valuetext={objective.detail}
      >
        <div className={styles.fill} style={{ inlineSize: `${objective.fraction * 100}%` }} />
      </div>
    </div>
  );
}
