import { FACILITY_IDS, type FacilityId } from '../../engine/prestige/facilities';
import { PRESTIGE_PATHS, REBIRTH_BONUS, type PrestigePath } from '../../engine/prestige/rebirth';
import { formatDamage } from '../../format/bigNumber';
import { heldGold } from '../profile/playerProfile';
import type { SurfaceProps } from './SurfaceProps';
import { Meter, Row, Rows, Section } from './parts/parts';
import styles from './RebirthSurface.module.css';

/**
 * Prestige: the wall, the reset, and the two trees it pays for. A `ledger` —
 * and that is a correction to my first filing, which was `moment`.
 *
 * The *press* is a moment: irreversible, and it ends a run of two hundred
 * waves. But the screen around it is two upgrade trees and four facilities,
 * which is a list to spend down — and a `moment` does not scroll, so sixteen
 * rows under one would sit below the fold with no way to reach them. The same
 * correction `party` needed. The irreversibility is carried by the button's
 * own styling instead.
 *
 * Every figure here is one the fight has been reading for five phases with no
 * way to move it. `prestigeCount` multiplies damage, the three rebirth paths
 * feed damage, economy and survival, the three meta levels feed all of them,
 * and the tactics facility is in the health and defence chains.
 */

const PATH_LABEL: Record<PrestigePath, string> = {
  damage: 'Damage',
  economy: 'Economy',
  survival: 'Survival',
};

const FACILITY_LABEL: Record<FacilityId, string> = {
  training: 'Training hall',
  treasury: 'Treasury',
  forge: 'Forge',
  tactics: 'War room',
};

/** What each facility does, in words. The numbers are in `facilities.ts`. */
const FACILITY_EFFECT: Record<FacilityId, string> = {
  training: 'More EXP a kill',
  treasury: 'More gold a kill',
  forge: 'Stronger crafted gear',
  tactics: 'More team power',
};

export function RebirthSurface({ save, profile, snapshot, actions }: SurfaceProps) {
  const preview = actions.previewRebirth();
  const gold = heldGold(profile, snapshot).toNumber();
  const cores = save.wallet.rebirthCores;
  const essence = save.wallet.essence;

  const pathLevel = (path: PrestigePath) =>
    path === 'damage'
      ? save.progression.rebirthDamagePath
      : path === 'economy'
        ? save.progression.rebirthEconomyPath
        : save.progression.rebirthSurvivalPath;

  const metaLevel = (path: PrestigePath) =>
    path === 'damage'
      ? save.progression.metaDamageLevel
      : path === 'economy'
        ? save.progression.metaEconomyLevel
        : save.progression.metaSurvivalLevel;

  return (
    <>
      <Section title="Rebirth">
        <Meter
          fraction={profile.highestWave / preview.requirement}
          tone={preview.ready ? 'gold' : 'neutral'}
          label={`Wave ${profile.highestWave} of ${preview.requirement}`}
        />
        <Rows>
          <Row label="The wall" hint="Twelve percent deeper each time">
            Wave {formatDamage(preview.requirement)}
          </Row>
          <Row label="Deepest reached">{formatDamage(profile.highestWave)}</Row>
          {/*
            The surplus is most of the reward, so it is shown rather than
            folded into the core count: one core at the wall, twenty-one three
            hundred waves past it. That is the decision the screen exists for.
          */}
          <Row label="Past the wall" hint="Every stride past it is another core">
            {formatDamage(preview.surplus)}
          </Row>
          <Row label="Rebirths" hint={`Each one is ${REBIRTH_BONUS}× damage`}>
            {save.progression.prestigeCount}
          </Row>
          <Row label="Reset" hint="Level, exp and wave. Nothing else.">
            <button
              type="button"
              className={`${styles.verb} ${styles.commit}`}
              disabled={!preview.ready}
              onClick={() => actions.rebirth()}
            >
              {preview.ready ? `Rebirth · +${formatDamage(preview.cores)}◈` : 'Not yet'}
            </button>
          </Row>
        </Rows>
      </Section>

      <Section title="Rebirth tree">
        {/*
          Priced off the level being left, so the button shows what the *next*
          step costs rather than what the last one did — and the cost grows as
          a square, which is what stops a deep account buying out a path in one
          rebirth.
        */}
        <Rows>
          <Row label="Cores">{formatDamage(cores)}</Row>
          {PRESTIGE_PATHS.map(path => {
            const cost = actions.priceOfPath(path);
            return (
              <Row key={path} label={PATH_LABEL[path]} hint={`Level ${pathLevel(path)}`}>
                <button
                  type="button"
                  className={styles.verb}
                  disabled={cores < cost}
                  onClick={() => actions.spendCore(path)}
                >
                  {formatDamage(cost)}◈
                </button>
              </Row>
            );
          })}
        </Rows>
      </Section>

      <Section title="Essence tree">
        <Rows>
          <Row label="Essence" hint="Refined from equipment scrap">
            {formatDamage(essence)}
          </Row>
          {PRESTIGE_PATHS.map(path => {
            const cost = actions.priceOfMeta(path);
            return (
              <Row key={path} label={PATH_LABEL[path]} hint={`Level ${metaLevel(path)}`}>
                <button
                  type="button"
                  className={styles.verb}
                  disabled={essence < cost}
                  onClick={() => actions.spendEssence(path)}
                >
                  {formatDamage(cost)}✦
                </button>
              </Row>
            );
          })}
        </Rows>
      </Section>

      <Section title="Guildhall">
        <Rows>
          <Row label="Gold" hint="Banked, plus this run">
            {formatDamage(gold)}
          </Row>
          {FACILITY_IDS.map(id => {
            const cost = actions.priceOfFacility(id);
            return (
              <Row key={id} label={FACILITY_LABEL[id]} hint={`${FACILITY_EFFECT[id]} · level ${save.facilities[id]}`}>
                <button
                  type="button"
                  className={styles.verb}
                  disabled={!Number.isFinite(cost) || gold < cost}
                  onClick={() => actions.upgradeFacility(id)}
                >
                  {Number.isFinite(cost) ? `${formatDamage(cost)}🪙` : 'Maxed'}
                </button>
              </Row>
            );
          })}
        </Rows>
      </Section>
    </>
  );
}
