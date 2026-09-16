import type { BurstView } from '../../engine/types';
import styles from './BurstControl.module.css';

/**
 * The BURST verb, as something to press at a moment.
 *
 * The shipped button was always the same: fill the meter, press, collect a
 * flat 1.8x — or let `autoBurst` press it for you the instant it filled.
 * Phase 4 makes the moment matter, so the control has to *show* the moment:
 * a sweep across the window with the peak band marked on it, which is the
 * only way "press at the right time" is a skill rather than a guess.
 *
 * Before the meter fills it is a charge bar and nothing to do. That is
 * deliberate — a button that is pressable but useless trains the player to
 * ignore it, which is the habit the verb needs them not to have.
 */

const QUALITY_WORD: Record<BurstView['quality'], string> = {
  early: 'Too soon',
  good: 'Good',
  perfect: 'Now',
  late: 'Fading',
  missed: '',
};

export function BurstControl({ burst, onSpend }: { burst: BurstView; onSpend: () => void }) {
  if (!burst.ready) {
    const filled = burst.cost === 0 ? 0 : burst.charge / burst.cost;
    return (
      <div className={styles.control} aria-label={`Burst charging, ${burst.charge} of ${burst.cost}`}>
        <div className={styles.charge}>
          <div className={styles.chargeFill} style={{ inlineSize: `${Math.min(1, filled) * 100}%` }} />
        </div>
        <span className={styles.chargeLabel}>
          {burst.charge} / {burst.cost}
        </span>
      </div>
    );
  }

  const open = burst.windowOpen;
  return (
    <button
      type="button"
      className={open ? `${styles.control} ${styles.armed}` : styles.control}
      onClick={onSpend}
      aria-label={open ? `Burst ready — ${QUALITY_WORD[burst.quality] || 'press now'}` : 'Burst charged, waiting'}
    >
      <div className={styles.window}>
        {/* The band is drawn from the engine's own numbers rather than
            restated here, so the mark cannot drift from the payout. */}
        <div
          className={styles.band}
          style={{
            insetInlineStart: `${burst.peak.start * 100}%`,
            inlineSize: `${(burst.peak.end - burst.peak.start) * 100}%`,
          }}
        />
        {open && <div className={styles.sweep} style={{ insetInlineStart: `${burst.progress * 100}%` }} />}
      </div>
      <span className={styles.label}>
        BURST
        {open && QUALITY_WORD[burst.quality] !== '' && (
          <span className={styles.quality}> · {QUALITY_WORD[burst.quality]}</span>
        )}
      </span>
    </button>
  );
}
