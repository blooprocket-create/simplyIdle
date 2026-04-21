import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/colors';
import MobileCard from '../../components/MobileCard';
import SectionHeader from '../../components/SectionHeader';
import MobileScrollContainer from '../../components/MobileScrollContainer';
import { FeedbackPressable as Pressable } from '../../components/FeedbackPressable';

interface Hero {
  uid: string;
  name: string;
  emoji: string;
  level: number;
  rarity: string;
  heroClass: string;
  rank: number;
  inActiveTeam: boolean;
}

interface RosterTabProps {
  heroCount: number;
  activeTeamCount: number;
  teamSlotCap: number;
  heroShards: number;
  heroes: Hero[];
  onAutoEquip: () => void;
  onAutoRecycle: () => void;
  onToggleHero: (uid: string) => void;
  onEditTeam: () => void;
  onSummon: () => void;
  canSummon: boolean;
  summonCostType: 'free' | 'tears' | 'diamonds';
  summonCost: number;
  bossTearsOwned: number;
}

export default function RosterTab(props: RosterTabProps) {
  const [expandedHeroId, setExpandedHeroId] = useState<string | null>(null);

  return (
    <MobileScrollContainer>
      <SectionHeader
        icon="👥"
        title="Roster"
        subtitle={`${props.heroCount} heroes • ${props.activeTeamCount}/${props.teamSlotCap} active`}
      />

      {/* Summon card */}
      <MobileCard
        icon="✨"
        title="Summon"
        sections={[
          {
            items: [
              {
                label: 'Cost',
                value:
                  props.summonCostType === 'free'
                    ? 'FREE'
                    : props.summonCostType === 'tears'
                      ? `${props.summonCost} 💧 (${props.bossTearsOwned} owned)`
                      : `${props.summonCost} 💎`,
              },
            ],
          },
        ]}
        action={{
          label: 'Summon Hero',
          onPress: props.onSummon,
          disabled: !props.canSummon,
          variant: 'primary',
        }}
      />

      {/* Team management */}
      <MobileCard
        icon="⚙️"
        title="Team Setup"
        sections={[
          {
            items: [
              {
                label: 'Active Team',
                value: `${props.activeTeamCount}/${props.teamSlotCap}`,
              },
              {
                label: 'Total Roster',
                value: props.heroCount,
              },
            ],
          },
        ]}
        actions={[
          {
            label: 'Auto Equip Best',
            onPress: props.onAutoEquip,
            variant: 'secondary',
          },
          {
            label: 'Edit Team',
            onPress: props.onEditTeam,
            variant: 'primary',
          },
        ]}
      />

      {/* Hero list */}
      {props.heroes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>🔍</Text>
          <Text style={styles.emptyStateText}>No heroes yet. Use Summon to recruit your first hero!</Text>
        </View>
      ) : (
        <View>
          <Text style={styles.heroListTitle}>Your Heroes</Text>
          {props.heroes.map(hero => (
            <HeroCard
              key={hero.uid}
              hero={hero}
              isExpanded={expandedHeroId === hero.uid}
              onToggleExpand={() => setExpandedHeroId(expandedHeroId === hero.uid ? null : hero.uid)}
              onToggle={() => props.onToggleHero(hero.uid)}
            />
          ))}
        </View>
      )}
    </MobileScrollContainer>
  );
}

function HeroCard({
  hero,
  isExpanded,
  onToggleExpand,
  onToggle,
}: {
  hero: Hero;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
}) {
  return (
    <Pressable style={styles.heroCard} onPress={onToggleExpand}>
      <View style={[styles.heroCardHeader, hero.inActiveTeam && styles.heroCardHeaderActive]}>
        <View style={styles.heroCardLeft}>
          <Text style={styles.heroEmoji}>{hero.emoji}</Text>
          <View style={styles.heroCardInfo}>
            <Text style={styles.heroName}>{hero.name}</Text>
            <Text style={styles.heroMeta}>
              Lv{hero.level} • {hero.heroClass} • ⭐{hero.rank}
            </Text>
          </View>
        </View>
        <Pressable onPress={onToggle} style={[styles.heroToggle, hero.inActiveTeam && styles.heroToggleActive]}>
          <Text style={styles.heroToggleText}>{hero.inActiveTeam ? '✓' : '+'}</Text>
        </Pressable>
      </View>
      {isExpanded && (
        <View style={styles.heroCardExpanded}>
          <View style={styles.heroRarityBadge}>
            <Text style={styles.heroRarityText}>{hero.rarity.toUpperCase()}</Text>
          </View>
          <Text style={styles.heroDetailText}>More details available in full version</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl * 2,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: theme.spacing.md,
  },
  emptyStateText: {
    color: theme.text.secondary,
    fontSize: 13,
    textAlign: 'center',
  },
  heroListTitle: {
    color: theme.text.primary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  heroCard: {
    backgroundColor: theme.bg.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border.light,
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  heroCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  heroCardHeaderActive: {
    backgroundColor: 'rgba(123, 104, 255, 0.1)',
  },
  heroCardLeft: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    flex: 1,
    alignItems: 'center',
  },
  heroEmoji: {
    fontSize: 32,
  },
  heroCardInfo: {
    flex: 1,
  },
  heroName: {
    color: theme.text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  heroMeta: {
    color: theme.text.secondary,
    fontSize: 11,
    marginTop: theme.spacing.xs,
  },
  heroToggle: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: theme.bg.darker,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.border.medium,
  },
  heroToggleActive: {
    backgroundColor: theme.accent.primary,
    borderColor: theme.accent.primary,
  },
  heroToggleText: {
    color: theme.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  heroCardExpanded: {
    borderTopWidth: 1,
    borderTopColor: theme.border.subtle,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.bg.darker,
  },
  heroRarityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.rarity.legendary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 4,
    marginBottom: theme.spacing.sm,
  },
  heroRarityText: {
    color: theme.bg.deepestBlack,
    fontSize: 10,
    fontWeight: '700',
  },
  heroDetailText: {
    color: theme.text.secondary,
    fontSize: 11,
  },
});
