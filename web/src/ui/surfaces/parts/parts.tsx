import type { ReactNode } from 'react';
import styles from './parts.module.css';

/**
 * The pieces every surface is built from.
 *
 * A surface describes data; the archetype owns geometry. These sit on the
 * surface side of that line deliberately — they lay out *within* the space
 * they are given and none of them scrolls, positions itself absolutely, or
 * names a colour. `src/ui/architecture.test.ts` holds them to it, the same as
 * any other file under `surfaces/`.
 *
 * Kept together rather than split one-per-file because they are read as a set:
 * the question a surface author asks is "what can I use here", and the answer
 * should fit on a screen.
 */

/** A label and a figure, for facts that come in pairs. */
export function Rows({ children }: { children: ReactNode }) {
  return <dl className={styles.rows}>{children}</dl>;
}

export function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className={styles.row}>
      <dt className={styles.label}>
        {label}
        {hint !== undefined && <span className={styles.hint}>{hint}</span>}
      </dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}

/**
 * A grid that fits as many cards as the width allows. Never a fixed track
 * count — `repeat(4, …)` is what orphans the fifth card when a sixth arrives,
 * and the architecture test refuses it.
 */
export function Cards({ children }: { children: ReactNode }) {
  return <div className={styles.cards}>{children}</div>;
}

export function Card({ title, badge, children }: { title: ReactNode; badge?: ReactNode; children?: ReactNode }) {
  return (
    <article className={styles.card}>
      <header className={styles.cardHead}>
        <span className={styles.cardTitle}>{title}</span>
        {badge !== undefined && <span className={styles.cardBadge}>{badge}</span>}
      </header>
      {children !== undefined && <div className={styles.cardBody}>{children}</div>}
    </article>
  );
}

/** A proportion, shown. `fraction` is clamped, so a bad ratio cannot overrun. */
export function Meter({ fraction, tone = 'neutral', label }: { fraction: number; tone?: Tone; label: string }) {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return (
    <div
      className={styles.meter}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safe * 100)}
    >
      <div className={`${styles.meterFill} ${TONE_CLASS[tone]}`} style={{ inlineSize: `${safe * 100}%` }} />
    </div>
  );
}

export type Tone = 'neutral' | 'good' | 'warn' | 'gold';

const TONE_CLASS: Record<Tone, string> = {
  neutral: styles.toneNeutral,
  good: styles.toneGood,
  warn: styles.toneWarn,
  gold: styles.toneGold,
};

/** A short, non-interactive marker: a class, a rarity, a rank. */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`${styles.tag} ${TONE_CLASS[tone]}`}>{children}</span>;
}

/**
 * What a surface shows when it has nothing to show.
 *
 * Says why rather than sitting blank: an empty roster because nothing has been
 * summoned reads very differently from an empty roster because loading failed,
 * and a player can act on the first.
 */
export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/** A heading inside a surface, for a list that has more than one part. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}
