import { ACHIEVEMENTS, ACHIEVEMENT_COUNT, isTracked } from '../../content/achievements';
import { tracks } from '../achievements/measure';
import type { SurfaceProps } from './SurfaceProps';
import { Card, Cards, Empty, Meter, Row, Rows, Section } from './parts/parts';

/**
 * One ledger, where the shipped game had five sub-tabs.
 *
 * REVAMP, section 3. The ticker in the HUD shows the nearest one so the
 * player never has to come here to find out they are three kills away; this
 * is where the rest of them live, and it reads the same catalogue the ticker
 * does rather than a second list that could disagree with it.
 *
 * The untracked ones are listed too, and said to be untracked. Thirty-six of
 * the ninety-one watch things this build does not have yet — summons, gear,
 * facilities — and showing them as `0 / 50` would tell the player they have
 * made no progress when the truth is that nothing is counting. Omitting them
 * would be worse still: the game would appear to have fifty-five.
 */
export function AchievementsSurface({ profile, snapshot }: SurfaceProps) {
  const measured = tracks(profile, snapshot);
  const earned = measured.filter(entry => entry.done);
  const untracked = ACHIEVEMENTS.filter(entry => !isTracked(entry));
  const remaining = measured.filter(entry => !entry.done);

  return (
    <>
      <Section title="Progress">
        <Rows>
          <Row label="Earned" hint={`of ${measured.length} this build can measure`}>
            {earned.length}
          </Row>
          <Row label="In the game" hint={`${untracked.length} await the systems that feed them`}>
            {ACHIEVEMENT_COUNT}
          </Row>
        </Rows>
        <Meter
          fraction={measured.length === 0 ? 0 : earned.length / measured.length}
          tone="gold"
          label="Achievements earned"
        />
      </Section>

      {remaining.length > 0 && (
        <Section title="Closest">
          <Cards>
            {remaining.map(entry => (
              <Card key={entry.id} title={`${entry.emoji} ${entry.name}`}>
                <span>{entry.description}</span>
                <Meter fraction={entry.fraction} tone="good" label={entry.name} />
                <span>{entry.detail}</span>
              </Card>
            ))}
          </Cards>
        </Section>
      )}

      {earned.length > 0 && (
        <Section title="Earned">
          <Cards>
            {earned.map(entry => (
              <Card key={entry.id} title={`${entry.emoji} ${entry.name}`} badge="✓">
                <span>{entry.description}</span>
              </Card>
            ))}
          </Cards>
        </Section>
      )}

      <Section title="Not tracked yet">
        <Empty>These watch systems this build does not have. They are listed so the count stays honest.</Empty>
        <Cards>
          {untracked.map(entry => (
            <Card key={entry.id} title={`${entry.emoji} ${entry.name}`}>
              <span>{entry.description}</span>
            </Card>
          ))}
        </Cards>
      </Section>
    </>
  );
}
