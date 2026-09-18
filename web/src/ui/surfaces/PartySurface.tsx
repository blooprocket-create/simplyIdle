import { TEAM_LOADOUT_COUNT } from '../../engine/save/migrate';
import { MAX_FORMATION_ROLE_HEROES } from '../../engine/roster/team';
import { VALID_FORMATION_ROLES_FOR_CLASS, type FormationRole } from '../../engine/combat/formation';
import { formatDamage } from '../../format/bigNumber';
import { CLASS_COPY } from '../copy/classes';
import type { RosterEntry } from '../profile/playerProfile';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Meter, Row, Rows, Section, Tag } from './parts/parts';
import styles from './PartySurface.module.css';

/**
 * Where the team stands, and the lineups they can be saved as. A `ledger`: it
 * lists the party and then the bench, so the host gives it the screen and one
 * axis of scroll.
 *
 * It reads the cast for who is on the field and the snapshot for what they are
 * doing, which is the same split the renderer makes — a hero's name is not
 * per-frame state and a swing timer is nothing else. The verbs come from
 * `rosterSave.ts` through `SurfaceProps`, so this file decides what a press
 * asks for and nothing about whether it is allowed.
 *
 * Every placement button is gated on the rule that would refuse it, because
 * `placeHero` **refuses** rather than replaying — unlike `fieldTeam`, which
 * takes a request and normalises it. A button the engine will always refuse is
 * a button that does nothing.
 */

const RANK_LABEL: Record<FormationRole, string> = {
  front: 'Front',
  mid: 'Middle',
  back: 'Back',
};

const RANKS: readonly FormationRole[] = ['front', 'mid', 'back'];

/**
 * A short line about what a rank is for, because "front" and "back" do not say
 * it. These are the shipped formation bonuses in words rather than numbers —
 * the numbers are in `engine/combat/formation.ts` and move with balance.
 */
const RANK_HINT: Record<FormationRole, string> = {
  front: 'Holds the line. More health, and less damage taken.',
  mid: 'Between the two. A little of both.',
  back: 'Out of reach. More damage, and nothing to soak with.',
};

/** Whether a class has anywhere else to stand. Only the monk does. */
export function canMove(hero: RosterEntry): boolean {
  return VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass].length > 1;
}

/**
 * Which ranks a hero may be moved to from where they are.
 *
 * The cap is the subtlety, and it is the shipped one: a rank already holding
 * its two refuses a **fielded** hero and accepts a benched one, because
 * `setFormationRole` takes the count against the active line the hero is not
 * in. That is not an oversight to tidy — it is what lets a player arrange a
 * second formation on the bench before swapping it in.
 *
 * Takes the whole roster and picks the fielded line out of it, rather than
 * asking the caller for the line. Handing it a pre-filtered list works right
 * up until somebody passes the roster instead, at which point the gate
 * silently over-refuses and the symptom is a button that is greyed out for no
 * reason a player can see.
 */
export function openRanks(hero: RosterEntry, roster: readonly RosterEntry[]): FormationRole[] {
  return VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass].filter(role => {
    if (role === hero.role) return false;
    if (!hero.active) return true;
    // `setFormationRole` excludes the moving hero from the count by uid; here
    // the line above has already done it, because a rank they are standing in
    // is not a rank they can be moved to. Repeating the uid check would be a
    // branch no input can reach, and so a branch no test can hold to account.
    const standing = roster.filter(other => other.active && other.role === role);
    return standing.length < MAX_FORMATION_ROLE_HEROES;
  });
}

export function PartySurface({ cast, snapshot, profile, save, actions }: SurfaceProps) {
  if (cast.length === 0) return <Empty>Nobody on the field. Summon a hero and they appear here.</Empty>;

  const swingByUid = new Map(snapshot.heroes.map(hero => [hero.uid, hero]));
  // The cast says who is on the field and where they stand; it does not carry
  // a class, because the renderer does not need one. The roster does — and it
  // has no row for the player, which is how a card knows not to offer verbs.
  const rowByUid = new Map(profile.roster.map(hero => [hero.uid, hero]));
  const fielded = profile.roster.filter(hero => hero.active);
  const benched = profile.roster.filter(hero => !hero.active);
  const movable = benched.filter(canMove);

  const moves = (hero: RosterEntry) => {
    const open = openRanks(hero, profile.roster);
    if (open.length === 0) return null;
    return (
      <div className={styles.verbs}>
        {open.map(role => (
          <button key={role} type="button" className={styles.verb} onClick={() => actions.place(hero.uid, role)}>
            To {RANK_LABEL[role].toLowerCase()}
          </button>
        ))}
      </div>
    );
  };

  return (
    <>
      {RANKS.map(rank => {
        const inRank = cast.filter(member => member.role === rank);
        if (inRank.length === 0) return null;
        return (
          <Section key={rank} title={`${RANK_LABEL[rank]} rank`}>
            <p className={styles.note}>{RANK_HINT[rank]}</p>
            <Cards>
              {inRank.map(member => {
                const live = swingByUid.get(member.uid);
                const row = rowByUid.get(member.uid);
                return (
                  <Card
                    key={member.uid}
                    title={member.name}
                    badge={row === undefined ? undefined : CLASS_COPY[row.heroClass].emoji}
                  >
                    <Meter fraction={live?.swingProgress ?? 0} tone="good" label={`${member.name} swing timer`} />
                    <span>{live ? `${formatDamage(live.damagePerHit)} a hit` : 'Not swinging'}</span>
                    {/*
                      No row means the player's own combatant, who stands in a
                      rank and is not a hero: they have no roster entry to
                      place, and `placeHero` would refuse a uid it cannot find.
                    */}
                    {row === undefined ? (
                      <Tag>You</Tag>
                    ) : (
                      <>
                        <span>{CLASS_COPY[row.heroClass].name}</span>
                        {moves(row)}
                      </>
                    )}
                  </Card>
                );
              })}
            </Cards>
          </Section>
        );
      })}

      {movable.length > 0 && (
        <Section title="Reserve">
          {/*
            Only the heroes who have somewhere else to stand. Listing the whole
            bench here would repeat the Roster screen with no verb attached to
            most of it — and the reason the bench is placeable at all is the
            shipped rule that the per-rank cap is checked only for a fielded
            hero, which is what lets a second formation be arranged in advance.
          */}
          <p className={styles.note}>Place them now and the rank is set before they are fielded.</p>
          <Cards>
            {movable.map(hero => (
              <Card key={hero.uid} title={`${hero.emoji} ${hero.name}`} badge={RANK_LABEL[hero.role]}>
                <span>{CLASS_COPY[hero.heroClass].name}</span>
                {moves(hero)}
              </Card>
            ))}
          </Cards>
        </Section>
      )}

      <Section title="Lineups">
        <Rows>
          {/*
            One press, and the roster decides. The sort only proposes — the
            selection rules refuse a duplicate, a third hero in a rank and
            anyone past the slots bought — so this can pass over a strong hero
            with a slot still free, and the hint says so rather than leaving a
            player to wonder.
          */}
          <Row label="Field my best" hint="Rarity first, then rebirth, level and boost — where the ranks allow it">
            <button type="button" className={styles.verb} onClick={() => actions.fieldBest()}>
              Auto-pick
            </button>
          </Row>
        </Rows>
        <Rows>
          {Array.from({ length: TEAM_LOADOUT_COUNT }, (_, slot) => {
            const stored = save.roster.loadouts[slot] ?? [];
            const names = stored
              .map(uid => rowByUid.get(uid)?.name)
              .filter((name): name is string => name !== undefined);
            return (
              <Row
                key={slot}
                label={`Lineup ${slot + 1}`}
                // Stored uids and named heroes can differ: a lineup keeps
                // whoever was fielded when it was stored, and a hero recycled
                // since is a uid with nobody behind it. Recalling replays the
                // list through the selection rules, so it fields the rest.
                hint={names.length > 0 ? names.join(', ') : 'Empty'}
              >
                <span className={styles.verbs}>
                  <button type="button" className={styles.verb} onClick={() => actions.storeLoadout(slot)}>
                    Store
                  </button>
                  <button
                    type="button"
                    className={styles.verb}
                    disabled={stored.length === 0}
                    onClick={() => actions.recallLoadout(slot)}
                  >
                    Recall
                  </button>
                </span>
              </Row>
            );
          })}
        </Rows>
      </Section>

      <Section title="This run">
        <Rows>
          <Row label="Fielded" hint={`${profile.slotsUnlocked} slots unlocked`}>
            {fielded.length}
          </Row>
          <Row label="Kills">{snapshot.totals.kills}</Row>
          <Row label="Wipes">{snapshot.totals.deaths}</Row>
          <Row label="Dealt">{formatDamage(snapshot.totals.dealt)}</Row>
          <Row label="Overkill" hint="Lost past the killing blow">
            {formatDamage(snapshot.totals.overkill)}
          </Row>
        </Rows>
      </Section>

      {/*
        Said plainly rather than left for a player to measure. `getFormationRoleForHero`
        in the shipped game returns the class's first legal rank and never reads
        the stored choice, so a monk moved to the middle is still counted in the
        front by the damage chain. The control is not cosmetic — team selection
        does read the stored rank, so it decides who fits — but it is honest to
        say which half of it lands. Ported as-is; fixing it is a balance change
        with its own commit and its own fixture.
      */}
      {movable.length + fielded.filter(canMove).length > 0 && (
        <p className={styles.note}>
          A monk’s rank decides who fits on the team. It does not reach the damage bonuses, which count every monk in
          the front — the same as in the original game.
        </p>
      )}
    </>
  );
}
