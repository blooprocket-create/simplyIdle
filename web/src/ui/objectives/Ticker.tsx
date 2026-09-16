import type { SimulationSnapshot } from '../../engine/types';
import type { PlayerProfile } from '../profile/playerProfile';
import { tracks } from '../achievements/measure';
import styles from './Ticker.module.css';

/**
 * One objective, in the HUD, over the fight.
 *
 * The thing it replaces is a screen you had to go and check — which meant a
 * goal three kills away was invisible unless you navigated to it, and
 * navigating to it stopped the battle. One line, always the nearest thing,
 * and nothing to open.
 *
 * It reads the same achievement catalogue the ledger does. An earlier version
 * had a hand-written list of five objectives of its own, which meant the HUD
 * and the Achievements screen could disagree about what the player was
 * working towards — and the whole point of the ticker is that it saves you
 * the trip to that screen.
 */
export function Ticker({ snapshot, profile }: { snapshot: SimulationSnapshot; profile: PlayerProfile }) {
  // Sorted nearest-first, so the head is the thing closest to done.
  const [objective] = tracks(profile, snapshot).filter(entry => !entry.done);
  // Nothing left is nothing shown. A ticker that looped back to the first
  // would read as progress being taken away.
  if (objective === undefined) return null;

  return (
    <div className={styles.ticker}>
      <div className={styles.line}>
        <span className={styles.label}>
          {objective.emoji} {objective.name}
        </span>
        <span className={styles.detail}>{objective.detail}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-label={objective.description}
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
