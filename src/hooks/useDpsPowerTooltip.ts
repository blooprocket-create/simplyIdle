import { useMemo } from 'react';
import { getDpsBreakdown, GameState } from '../useGameState';
import { fmt } from '../utils';

interface Stats {
  dps: number;
  teamDefense: number;
}

interface AffixTotals {
  hpMult: number;
  dmgMult: number;
}

export interface DpsPowerTooltip {
  title: string;
  lines: string[];
}

interface DpsBreakdownResult {
  playerBaseDps: number;
  heroBaseDps: number;
  totalMultiplier: number;
  multipliers: {
    rebirthLegacy: number;
    achievementLegacy: number;
    metaDamage: number;
    rebirthDamagePath: number;
    classPassive: number;
    heroPassives: number;
    formation: number;
    synergy: number;
    vipDamage: number;
    mastery: number;
    temporaryBuff: number;
  };
}

export function useDpsPowerTooltip(
  hoveredTopChipId: string | null,
  state: GameState,
  stats: Stats,
  _affixTotals: AffixTotals,
  gearScore: number,
  gearScoreRows: Array<{ name: string; rarityPoints: number; statPoints: number; total: number }>,
  teamPowerIndex: number,
) {
  return useMemo<DpsPowerTooltip | null>(() => {
    function multLine(label: string, mult: number): string {
      const deltaPct = (mult - 1) * 100;
      const sign = deltaPct >= 0 ? '+' : '';
      return `${label}: x${mult.toFixed(2)} (${sign}${deltaPct.toFixed(1)}%)`;
    }

    const dpsBreakdown = getDpsBreakdown(state) as DpsBreakdownResult;
    const powerFromDps = stats.dps * 0.45;
    const powerFromHp = state.teamMaxHp * 0.25;
    const powerFromDefense = stats.teamDefense * 7;
    const powerFromGear = gearScore * 15;

    if (hoveredTopChipId === 'dps') {
      return {
        title: 'DPS Breakdown',
        lines: [
          `Base player DPS: ${fmt(Math.floor(dpsBreakdown.playerBaseDps))}`,
          `Base hero DPS: ${fmt(Math.floor(dpsBreakdown.heroBaseDps))}`,
          `Total multiplier: x${dpsBreakdown.totalMultiplier.toFixed(2)}`,
          multLine('Rebirth legacy', dpsBreakdown.multipliers.rebirthLegacy),
          multLine('Achievement legacy', dpsBreakdown.multipliers.achievementLegacy),
          multLine('Meta damage path', dpsBreakdown.multipliers.metaDamage),
          multLine('Rebirth damage branch', dpsBreakdown.multipliers.rebirthDamagePath),
          multLine('Class passive', dpsBreakdown.multipliers.classPassive),
          multLine('Hero passives', dpsBreakdown.multipliers.heroPassives),
          multLine('Formation', dpsBreakdown.multipliers.formation),
          multLine('Synergy', dpsBreakdown.multipliers.synergy),
          multLine('VIP protocol', dpsBreakdown.multipliers.vipDamage),
          multLine('Mastery', dpsBreakdown.multipliers.mastery),
          multLine('Temporary buff', dpsBreakdown.multipliers.temporaryBuff),
        ],
      };
    }

    if (hoveredTopChipId === 'power') {
      return {
        title: 'Power Formula',
        lines: [
          'Power = floor(DPS*0.45 + TeamHP*0.25 + Defense*7 + Gear*15)',
          `DPS term: ${fmt(Math.floor(powerFromDps))} (${fmt(stats.dps)} * 0.45)`,
          `Team HP term: ${fmt(Math.floor(powerFromHp))} (${fmt(state.teamMaxHp)} * 0.25)`,
          `Defense term: ${fmt(Math.floor(powerFromDefense))} (${fmt(stats.teamDefense)} * 7)`,
          `Gear term: ${fmt(Math.floor(powerFromGear))} (${fmt(gearScore)} * 15)`,
          `Final power: ${fmt(teamPowerIndex)}`,
        ],
      };
    }

    if (hoveredTopChipId === 'gear') {
      const rows =
        gearScoreRows.length === 0
          ? ['No equipped gear in the 3 slots.']
          : gearScoreRows.map(
              row =>
                `${row.name}: rarity ${fmt(row.rarityPoints)} + stats ${fmt(Math.floor(row.statPoints))} = ${fmt(Math.floor(row.total))}`,
            );
      return {
        title: 'Gear Score Sources',
        lines: ['Per item: rarity points + (sum of item stats * 12)', ...rows],
      };
    }

    return null;
  }, [hoveredTopChipId, state, stats, gearScore, gearScoreRows, teamPowerIndex]);
}
