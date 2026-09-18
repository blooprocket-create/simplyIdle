import { currentEvent, weeklyTrack, type TrackRung } from '../../app/calendarActions';
import type { SaveV3 } from '../../engine/save/schema';
import { formatDamage } from '../../format/bigNumber';
import type { SurfaceProps } from './SurfaceProps';
import { Meter, Row, Rows, Section } from './parts/parts';

/**
 * The week: which event is running, the track it is measured on, and the
 * login streak that brought the player here.
 *
 * A `dashboard` — a few big numbers and their controls, no list to scroll.
 * The track is four rows, which is a table rather than a list.
 *
 * **The week turns over on a Thursday**, because the shipped week number is
 * whole weeks since the Unix epoch and 1 January 1970 was one. That is said
 * here rather than left as a surprise, since a player planning a push at the
 * top of the track needs to know when their kills reset.
 */

export interface WeekView {
  eventName: string;
  eventDescription: string;
  kills: number;
  streak: number;
  insurance: number;
  rungs: TrackRung[];
  claimable: number;
}

export function weekView(save: SaveV3): WeekView {
  const event = currentEvent(save);
  const rungs = weeklyTrack(save);
  return {
    eventName: event.name,
    eventDescription: event.description,
    kills: save.calendar.weeklyKills,
    streak: save.calendar.streak,
    insurance: save.calendar.insuranceCharges,
    rungs,
    claimable: rungs.filter(rung => rung.claimable).length,
  };
}

/** What a rung says under its title: the reward, or that it is collected. */
export function rungHint(rung: TrackRung): string {
  if (rung.claimed) return 'Collected';
  return `${formatDamage(rung.reward.gold)} gold · ${rung.reward.shards} shards · ${rung.reward.essence} essence`;
}

export function EventsSurface({ save, actions }: SurfaceProps) {
  const week = weekView(save);

  return (
    <>
      <Section title="This week">
        <Rows>
          <Row label={week.eventName} hint={week.eventDescription}>
            {formatDamage(week.kills)} kills
          </Row>
          {/*
            Named rather than left to be discovered. A player pushing for the
            top rung needs to know when the count resets, and "Thursday" is
            not something anyone would guess.
          */}
          <Row label="Resets" hint="Thursday, midnight UTC">
            Weekly
          </Row>
        </Rows>
      </Section>

      <Section title="Weekly track">
        <Rows>
          {week.rungs.map(rung => (
            <Row key={rung.milestone} label={`${rung.milestone} kills`} hint={rungHint(rung)}>
              {rung.claimable ? (
                <button type="button" onClick={() => actions.claimWeeklyTrack(rung.milestone)}>
                  Claim
                </button>
              ) : (
                <Meter fraction={rung.fraction} label={`${formatDamage(week.kills)} / ${rung.milestone}`} />
              )}
            </Row>
          ))}
        </Rows>
      </Section>

      <Section title="Login streak">
        <Rows>
          <Row
            label="Days in a row"
            hint={week.streak >= 10 ? 'The reward stops climbing after the tenth' : 'Each day pays more than the last'}
          >
            {week.streak}
          </Row>
          {/*
            The charge covers a gap of exactly one missed day — not two, and
            not "some slack". Saying which is the difference between a player
            who trusts it and one who finds out.
          */}
          <Row label="Streak insurance" hint="Covers exactly one missed day">
            {week.insurance}
          </Row>
        </Rows>
      </Section>
    </>
  );
}
