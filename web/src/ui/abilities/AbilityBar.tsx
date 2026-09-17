import type { Cast } from '../../game/models/cast';
import type { AbilityView } from '../../engine/combat/HeroActiveClock';
import { ARCHETYPE_HINT, ARCHETYPE_NAME, UNIQUE_HINT, UNIQUE_NAME } from '../copy/abilities';
import styles from './AbilityBar.module.css';

/**
 * The team's abilities, as things to press.
 *
 * The fifth unported system's last mile. Abilities reached the fight one
 * commit ago and have been firing themselves ever since — which is how they
 * shipped, and is exactly why nobody could tell they were missing for five
 * phases: `autoCastHeroActivesEnabled` is on by default, so a team quietly
 * casts four skills and the only evidence is that the numbers do not match a
 * hand calculation.
 *
 * Auto-cast stays on, and the bar is not a chore bolted beside it. A pressed
 * ability goes through the same seam the automatic one does, so pressing is
 * never worse than leaving it alone — the player is buying *timing*, the same
 * trade BURST offers: hold `mending_pulse` through a full health bar and spend
 * it on the wave that would have wiped them.
 *
 * Gated on no surface being open, like BURST and unlike the wipe offer. A
 * cooldown that comes up while the player is reading stays up, so reading
 * costs nothing — where a wipe offer lapses in silence and must paint over.
 */

/** The bench is not drawn. A benched hero's ability is not a verb. */
export function pressable(abilities: readonly AbilityView[]): AbilityView[] {
  return abilities.filter(ability => ability.fielded);
}

export function AbilityBar({
  abilities,
  cast,
  automatic,
  earned,
  onCast,
  onToggleAuto,
}: {
  abilities: readonly AbilityView[];
  cast: Cast;
  automatic: boolean;
  /** Whether auto-cast has been unlocked. Before that there is nothing to switch. */
  earned: boolean;
  onCast: (uid: string) => void;
  onToggleAuto: () => void;
}) {
  const shown = pressable(abilities);
  if (shown.length === 0) return null;

  const nameOf = (uid: string) => cast.find(member => member.uid === uid)?.name ?? 'Hero';

  return (
    <div className={styles.bar}>
      <div className={styles.slots}>
        {shown.map(ability => {
          const skill =
            ability.uniqueType === null ? ARCHETYPE_NAME[ability.archetype] : UNIQUE_NAME[ability.uniqueType];
          const hint =
            ability.uniqueType === null ? ARCHETYPE_HINT[ability.archetype] : UNIQUE_HINT[ability.uniqueType];
          return (
            <button
              key={ability.uid}
              type="button"
              className={ability.ready ? `${styles.slot} ${styles.ready}` : styles.slot}
              disabled={!ability.ready}
              onClick={() => onCast(ability.uid)}
              title={`${nameOf(ability.uid)} — ${hint}`}
              aria-label={
                ability.ready
                  ? `${nameOf(ability.uid)}: ${skill} ready. ${hint}`
                  : `${nameOf(ability.uid)}: ${skill}, ${Math.ceil(ability.remainingMs / 1000)} seconds`
              }
            >
              {/*
                Drawn from the engine's own countdown rather than a timer of
                the bar's own, so a ring that looks full is a press that is
                accepted — the mismatch `HeroActiveClock.view` exists to stop.
              */}
              <span className={styles.fill} style={{ blockSize: `${ability.progress * 100}%` }} />
              <span className={styles.skill}>{skill}</span>
              <span className={styles.who}>
                {ability.ready ? nameOf(ability.uid) : `${Math.ceil(ability.remainingMs / 1000)}s`}
              </span>
            </button>
          );
        })}
      </div>
      {/*
        Only once it is earned, because an automation that is not is not a
        switch — `useAutomation` filters the stored choice against `earned` on
        every read, so a control shown earlier would be pressed and do nothing.
        Until then the bar is the whole verb, which is the intended order: the
        one automation whose shipped default was *on* is hand-played first
        here, and automated when the player has earned the right to stop.
      */}
      {earned && (
        <button type="button" className={styles.auto} onClick={onToggleAuto} aria-pressed={automatic}>
          Auto {automatic ? 'on' : 'off'}
        </button>
      )}
    </div>
  );
}
