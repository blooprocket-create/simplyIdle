import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';
import MobileCard from '../../components/MobileCard';
import SectionHeader from '../../components/SectionHeader';
import MobileScrollContainer from '../../components/MobileScrollContainer';
import { fmt } from '../../utils';

interface WarfrontTabProps {
  wave: number;
  monsterName: string;
  teamHp: number;
  teamMaxHp: number;
  monsterHp: number;
  monsterMaxHp: number;
  teamDps: number;
  dangerScore: number;
  dangerLabel: string;
  isBoss: boolean;
  canBurst: boolean;
  burstCharge: number;
  burstCost: number;
  canRebirth: boolean;
  rebirthWavesLeft: number;
  rebirthThreshold: number;
  activeTeamCount: number;
  teamSlotCap: number;
  onBurst: () => void;
  onRebirth: () => void;
  onEditTeam: () => void;
  onOpenStats: () => void;
  combatLog: string[];
}

export default function WarfrontTab(props: WarfrontTabProps) {
  const teamHpPct = Math.max(0, Math.min(1, props.teamHp / Math.max(1, props.teamMaxHp))) * 100;
  const monsterHpPct = Math.max(0, Math.min(1, props.monsterHp / Math.max(1, props.monsterMaxHp))) * 100;

  return (
    <MobileScrollContainer>
      <SectionHeader icon="⚔️" title="Combat" />

      {/* Primary combat display */}
      <View style={styles.combatDisplay}>
        <View style={styles.combatSide}>
          <Text style={styles.sideLabel}>Your Team</Text>
          <Text style={styles.sideName}>Wave {props.wave}</Text>
          <View style={styles.hpBar}>
            <View style={[styles.hpFill, { width: `${teamHpPct}%`, backgroundColor: theme.status.positive }]} />
          </View>
          <Text style={styles.hpText}>{Math.ceil(props.teamHp)} / {props.teamMaxHp}</Text>
        </View>

        <View style={styles.vs}>
          <Text style={styles.vsText}>VS</Text>
        </View>

        <View style={styles.combatSide}>
          <Text style={styles.sideLabel}>{props.isBoss ? '👹 BOSS' : 'Enemy'}</Text>
          <Text style={styles.sideName}>{props.monsterName}</Text>
          <View style={styles.hpBar}>
            <View style={[styles.hpFill, { width: `${monsterHpPct}%`, backgroundColor: theme.status.danger }]} />
          </View>
          <Text style={styles.hpText}>{Math.ceil(props.monsterHp)} / {props.monsterMaxHp}</Text>
        </View>
      </View>

      {/* Quick stats */}
      <View style={styles.quickStatsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>DPS</Text>
          <Text style={styles.statValue}>{fmt(Math.floor(props.teamDps))}</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Danger</Text>
          <Text style={[styles.statValue, getDangerColor(props.dangerScore)]}>
            {props.dangerLabel}
          </Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statLabel}>Team</Text>
          <Text style={styles.statValue}>{props.activeTeamCount}/{props.teamSlotCap}</Text>
        </View>
      </View>

      {/* Burst mechanics */}
      <MobileCard
        icon="⚡"
        title="Burst Meter"
        sections={[
          {
            items: [
              {
                label: 'Charge',
                value: `${props.burstCharge}/${props.burstCost}`,
                highlight: props.canBurst,
              },
            ],
          },
        ]}
        action={{
          label: props.canBurst ? 'BURST!' : `${props.burstCost - props.burstCharge} to charge`,
          onPress: props.onBurst,
          disabled: !props.canBurst,
          variant: props.canBurst ? 'primary' : 'secondary',
        }}
      />

      {/* Team status */}
      <MobileCard
        icon="👥"
        title="Team Status"
        sections={[
          {
            items: [
              {
                label: 'Active Heroes',
                value: `${props.activeTeamCount}/${props.teamSlotCap}`,
              },
            ],
          },
        ]}
        action={{
          label: 'Manage Team',
          onPress: props.onEditTeam,
          variant: 'secondary',
        }}
      />

      {/* Rebirth option */}
      <MobileCard
        icon="♾️"
        title="Prestige System"
        sections={[
          {
            items: [
              {
                label: 'Status',
                value: props.canRebirth ? 'Ready!' : `${props.rebirthWavesLeft} waves left`,
                color: props.canRebirth ? theme.status.positive : theme.text.secondary,
              },
            ],
          },
        ]}
        action={{
          label: props.canRebirth ? 'Rebirth Now' : `Rebirth @ W${props.rebirthThreshold}`,
          onPress: props.onRebirth,
          disabled: !props.canRebirth,
          variant: props.canRebirth ? 'danger' : 'secondary',
        }}
      />

      {/* Combat log */}
      <MobileCard
        icon="📋"
        title="Combat Log"
        sections={[
          {
            items: props.combatLog.slice(0, 5).map((line, idx) => ({
              label: `Event ${props.combatLog.length - idx}`,
              value: line,
            })),
          },
        ]}
        footer={props.combatLog.length === 0 ? 'No events yet' : undefined}
      />
    </MobileScrollContainer>
  );
}

function getDangerColor(score: number) {
  if (score >= 80) return { color: theme.status.critical };
  if (score >= 55) return { color: theme.status.warning };
  return { color: theme.status.positive };
}

const styles = StyleSheet.create({
  combatDisplay: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    alignItems: 'center',
  },
  combatSide: {
    flex: 1,
    backgroundColor: theme.bg.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border.light,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  sideLabel: {
    color: theme.text.tertiary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: theme.spacing.xs,
  },
  sideName: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  hpBar: {
    width: '100%',
    height: 6,
    backgroundColor: theme.bg.darker,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
  },
  hpFill: {
    height: '100%',
    borderRadius: 3,
  },
  hpText: {
    color: theme.text.secondary,
    fontSize: 11,
    fontWeight: '600',
  },
  vs: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  vsText: {
    color: theme.text.tertiary,
    fontSize: 12,
    fontWeight: '700',
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  statChip: {
    flex: 1,
    backgroundColor: theme.bg.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border.light,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  statLabel: {
    color: theme.text.tertiary,
    fontSize: 10,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  statValue: {
    color: theme.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
});
