import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Text, ScrollView } from 'react-native';
import { THEME, TYPOGRAPHY, SPACING, RADIUS } from '../theme';

interface BattleScreenProps {
  wave: number;
  teamHp: number;
  teamMaxHp: number;
  monsterHp: number;
  monsterMaxHp: number;
  monsterName: string;
  monsterEmoji: string;
  isBoss: boolean;
  
  // Actions
  onAttack: () => void;
  onEditTeam: () => void;
  onTempoChange: (tempo: number) => void;
  
  // Advanced state (optional)
  tempo?: number;
  burst?: number;
  heat?: number;
}

export default function BattleScreen({
  wave,
  teamHp,
  teamMaxHp,
  monsterHp,
  monsterMaxHp,
  monsterName,
  monsterEmoji,
  isBoss,
  onAttack,
  onEditTeam,
  onTempoChange,
  tempo = 1,
  burst = 0,
  heat = 0,
}: BattleScreenProps) {
  const teamHpPct = (teamHp / teamMaxHp) * 100;
  const monsterHpPct = (monsterHp / monsterMaxHp) * 100;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getHpColor = (pct: number) => {
    if (pct > 50) return THEME.status.success;
    if (pct > 25) return THEME.status.warning;
    return THEME.status.error;
  };

  const formatNumber = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return Math.floor(n).toString();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.container}>
      {/* Wave & Monster Info */}
      <View style={styles.monsterSection}>
        <View style={styles.waveHeader}>
          <Text style={styles.waveNumber}>Wave {wave}</Text>
          {isBoss && <Text style={styles.bossBadge}>👑 BOSS</Text>}
        </View>
        
        <Text style={styles.monsterEmoji}>{monsterEmoji}</Text>
        <Text style={styles.monsterName}>{monsterName}</Text>
        
        {/* Monster HP Bar */}
        <View style={styles.hpContainer}>
          <Text style={styles.hpLabel}>Health</Text>
          <View style={styles.hpBarBg}>
            <View
              style={[
                styles.hpBarFill,
                { width: `${Math.max(1, monsterHpPct)}%`, backgroundColor: getHpColor(monsterHpPct) },
              ]}
            />
          </View>
          <Text style={styles.hpValue}>{formatNumber(monsterHp)}/{formatNumber(monsterMaxHp)}</Text>
        </View>
      </View>

      {/* Team HP Section */}
      <View style={styles.teamHpSection}>
        <View style={styles.sectionLabel}>
          <Text style={styles.labelText}>Your Team</Text>
        </View>
        
        <View style={styles.hpBarBg}>
          <View
            style={[
              styles.hpBarFill,
              { width: `${Math.max(1, teamHpPct)}%`, backgroundColor: getHpColor(teamHpPct) },
            ]}
          />
        </View>
        <View style={styles.hpRow}>
          <Text style={styles.hpValue}>{formatNumber(teamHp)}/{formatNumber(teamMaxHp)} HP</Text>
          <Pressable style={styles.editTeamBtn} onPress={onEditTeam}>
            <Text style={styles.editTeamBtnText}>Edit</Text>
          </Pressable>
        </View>
      </View>

      {/* Combat Controls */}
      <View style={styles.controlsSection}>
        <Pressable style={styles.mainAttackBtn} onPress={onAttack}>
          <View style={styles.attackContent}>
            <Text style={styles.attackEmoji}>⚔️</Text>
            <Text style={styles.attackText}>ATTACK</Text>
          </View>
        </Pressable>
      </View>

      {/* Combat Info (Tempo, Burst, Heat) */}
      {showAdvanced && (
        <View style={styles.advancedSection}>
          <View style={styles.statChip}>
            <Text style={styles.statLabel}>Tempo</Text>
            <View style={styles.tempoButtons}>
              {[1, 2, 4].map(t => (
                <Pressable
                  key={t}
                  style={[styles.tempoBtn, tempo === t && styles.tempoBtnActive]}
                  onPress={() => onTempoChange(t)}
                >
                  <Text style={styles.tempoBtnText}>{t}x</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.statChip}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Burst</Text>
              <Text style={styles.statValue}>{Math.min(burst, 20)}/20</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(burst, 20) * 5}%` }]} />
            </View>
          </View>

          <View style={styles.statChip}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Heat</Text>
              <Text style={styles.statValue}>{Math.min(heat, 100)}/100</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.min(heat, 100)}%` }]} />
            </View>
          </View>
        </View>
      )}

      <Pressable style={styles.advancedToggle} onPress={() => setShowAdvanced(!showAdvanced)}>
        <Text style={styles.advancedToggleText}>{showAdvanced ? '▼ Hide Details' : '▶ Show Details'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    gap: SPACING.lg,
    paddingBottom: SPACING.lg,
  },

  monsterSection: {
    backgroundColor: THEME.card.highlight,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  waveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    alignSelf: 'flex-start',
  },
  waveNumber: {
    ...TYPOGRAPHY.section,
    color: THEME.text.secondary,
  },
  bossBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: THEME.status.error,
    backgroundColor: `${THEME.status.error}20`,
    paddingVertical: 2,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  monsterEmoji: {
    fontSize: 64,
  },
  monsterName: {
    ...TYPOGRAPHY.header2,
    color: THEME.text.primary,
    textAlign: 'center',
  },

  hpContainer: {
    width: '100%',
    gap: SPACING.sm,
  },
  hpLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hpBarBg: {
    width: '100%',
    height: 16,
    backgroundColor: `${THEME.text.muted}20`,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: RADIUS.sm,
  },
  hpValue: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.primary,
  },

  teamHpSection: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  sectionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelText: {
    ...TYPOGRAPHY.label,
    color: THEME.text.secondary,
  },
  hpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editTeamBtn: {
    backgroundColor: THEME.nav.active.bg,
    borderRadius: RADIUS.sm,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: THEME.nav.active.border,
  },
  editTeamBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: THEME.nav.active.text,
  },

  controlsSection: {
    gap: SPACING.md,
  },
  mainAttackBtn: {
    backgroundColor: THEME.status.success,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
    ...{
      shadowColor: THEME.status.success,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
  },
  attackContent: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  attackEmoji: {
    fontSize: 32,
  },
  attackText: {
    ...TYPOGRAPHY.section,
    color: '#000',
    letterSpacing: 1.5,
  },

  advancedToggle: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  advancedToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.secondary,
  },

  advancedSection: {
    gap: SPACING.md,
  },
  statChip: {
    backgroundColor: THEME.card.default,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    ...TYPOGRAPHY.label,
    color: THEME.text.secondary,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '800',
    color: THEME.combat.dps,
  },
  progressBar: {
    height: 8,
    backgroundColor: `${THEME.status.warning}20`,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.status.warning,
    borderRadius: RADIUS.sm,
  },

  tempoButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  tempoBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    backgroundColor: THEME.card.highlight,
    borderWidth: 1,
    borderColor: THEME.surface.border,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  tempoBtnActive: {
    backgroundColor: THEME.nav.active.bg,
    borderColor: THEME.nav.active.border,
  },
  tempoBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: THEME.text.primary,
  },
});
