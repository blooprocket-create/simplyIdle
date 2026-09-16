import type { BossView } from '../../engine/types';
import styles from './BossTell.module.css';

/**
 * The boss's mechanic, as something to answer.
 *
 * On screen for the whole boss fight rather than only while a tell is open,
 * which is the difference between a telegraph and an ambush: the player is
 * told what this act's boss does, and *then* asked to do something about it.
 * Between tells it counts down; while one is open it sweeps and can be
 * pressed.
 *
 * It does not shout when the player misses one. Nothing is lost — a missed
 * tell costs the bonus and never the fight — and a control that scolded an
 * idle player for idling would be arguing with the genre.
 */
export function BossTell({ boss, onAnswer }: { boss: BossView; onAnswer: () => void }) {
  if (!boss.open) {
    return (
      <div className={styles.tell} aria-label={`${boss.name}: ${boss.tell}`}>
        <div className={styles.head}>
          <span className={styles.name}>{boss.name}</span>
          {boss.streak > 1 && <span className={styles.streak}>×{boss.streak}</span>}
        </div>
        <span className={styles.line}>{boss.tell}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.tell} ${styles.open}`}
      onClick={onAnswer}
      aria-label={`${boss.name} — answer now`}
    >
      <div className={styles.head}>
        <span className={styles.name}>{boss.name}</span>
        {boss.streak > 1 && <span className={styles.streak}>×{boss.streak}</span>}
        <span className={styles.now}>Break</span>
      </div>
      {/* Drains rather than fills: a bar running out reads as time left, and
          time left is the only thing the player needs from it. */}
      <div className={styles.window}>
        <div className={styles.remaining} style={{ inlineSize: `${Math.max(0, 1 - boss.progress) * 100}%` }} />
      </div>
    </button>
  );
}
