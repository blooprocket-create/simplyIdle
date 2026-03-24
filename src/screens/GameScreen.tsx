import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Pressable,
  Platform,
  StatusBar,
  TextInput,
  Modal,
} from 'react-native';
import { useGameState } from '../useGameState';
import {
  ACHIEVEMENTS,
  CLASSES,
  PlayerClass,
  StatKey,
  EquipmentSlot,
  RARITIES,
  GACHA_SUMMON_COST,
  ACTIVE_TEAM_SIZE,
  REBIRTH_WAVE_THRESHOLD,
  TUTORIAL_QUESTS,
  TutorialEvent,
  getEquipmentItem,
  equipmentRarityConfig,
  getMonsterForWave,
  getActForWave,
  getBossUnlockForWave,
  unlockLabel,
  getMonsterAffixes,
  getMonsterGold,
  getMonsterExp,
  getMonsterDamage,
  rarityConfig,
  getClassConfig,
  getClassPassive,
  getHeroPassiveTraitInfo,
  getHeroActiveArchetypeInfo,
  WEEKLY_TRACK_MILESTONES,
  MISSION_BOARD_GOALS,
  calculateShardReward,
  getRankConfig,
  getUsableItem,
} from '../gameConfig';
import { fmt } from '../utils';
import AchievementToast from '../components/AchievementToast';
import RebirthModal from '../components/PrestigeModal';

type Tab = 'warroom' | 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment';

interface GameScreenProps {
  accountName: string;
  onLogout: () => void;
}

const STAT_LABELS = {
  strength: 'STR',
  vitality: 'VIT',
  agility: 'AGI',
  intelligence: 'INT',
  spirit: 'SPR',
} as const;

const TAB_META: Record<Tab, { icon: string; label: string; mood: string }> = {
  warroom: { icon: '🛰️', label: 'War Room', mood: 'All Systems' },
  battle: { icon: '⚔️', label: 'Warfront', mood: 'Push Waves' },
  heroes: { icon: '👥', label: 'Roster', mood: 'Squad Ops' },
  stats: { icon: '📊', label: 'Growth', mood: 'Power Grid' },
  equipment: { icon: '🎒', label: 'Armory', mood: 'Forge Gear' },
  achievements: { icon: '🏆', label: 'Legends', mood: 'Milestones' },
};

const ACH_BONUS_PER_UNLOCK_PCT = 3;
const ACH_BONUS_CAP_PCT = 75;

export default function GameScreen({ accountName, onLogout }: GameScreenProps) {
  const {
    state,
    stats,
    createCharacter,
    notifyQuestEvent,
    setActiveTeam,
    summonHero,
    summonHeroX10,
    autoEquipBestHeroes,
    saveTeamLoadout,
    loadTeamLoadout,
    autoRecycleHeroes,
    setAutoRecycleMaxRarity,
    setAutoRecycleEnabled,
    toggleEquipHero,
    allocateStat,
    allocateStatMax,
    equipItem,
    recycleHero,
    rankUpHero,
    convertShardsToEssence,
    convertShardsToScrap,
    spendRebirthCore,
    useUsableItem,
    dismantleEquipment,
    craftEquipment,
    upgradeEquipmentRarity,
    setAutoUsePotion,
    setAutoUsePotionThreshold,
    setAutoSummonEnabled,
    setAutoSummonMode,
    setAutoSummonReserveGold,
    spendEssenceUpgrade,
    claimWeeklyTrack,
    claimMission,
    markHintSeen,
    clearAchievement,
    clearRewardPopup,
    rebirth,
    getEssenceCost,
    getRebirthCoreCost,
    getShardForgeCosts,
    getUpgradePlan,
    getWeeklyEvent,
    getMissionProgress,
  } = useGameState(accountName);

  const [tab, setTab] = useState<Tab>('warroom');
  const [rebirthOpen, setRebirthOpen] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftClass, setDraftClass] = useState<PlayerClass>('warrior');
  const [teamSelectionMode, setTeamSelectionMode] = useState(false);
  const [tempTeam, setTempTeam] = useState<string[]>(state.activeTeamHeroIds);
  const [expandedHeroes, setExpandedHeroes] = useState<Set<string>>(new Set());
  const [recycleConfirmUid, setRecycleConfirmUid] = useState<string | null>(null);
  const [recycleDropdownOpen, setRecycleDropdownOpen] = useState(false);
  const [warPanels, setWarPanels] = useState({
    frontline: true,
    roster: true,
    armory: false,
    growth: false,
    objectives: true,
  });

  const classConfig = getClassConfig(state.playerClass ?? 'warrior');
  const classPassive = getClassPassive(state.playerClass ?? 'warrior');

  const monster = getMonsterForWave(state.wave);
  const monsterAffixes = getMonsterAffixes(state.wave);
  const affixTotals = monsterAffixes.reduce((acc, affix) => ({
    hpMult: acc.hpMult * affix.enemyHpMultiplier,
    dmgMult: acc.dmgMult * affix.enemyDamageMultiplier,
  }), { hpMult: 1, dmgMult: 1 });
  const isBoss = state.wave % 10 === 0;
  const currentAct = getActForWave(state.wave);
  const actProgressPct = Math.max(0, Math.min(1, (state.wave - currentAct.startWave + 1) / (currentAct.endWave - currentAct.startWave + 1))) * 100;
  const nextBossUnlock = getBossUnlockForWave(currentAct.bossWave);
  const monsterHpPct = Math.max(0, Math.min(1, state.monsterHp / state.monsterMaxHp)) * 100;
  const teamHpPct = Math.max(0, Math.min(1, state.teamHp / state.teamMaxHp)) * 100;
  const activeTeamSet = useMemo(() => new Set(state.activeTeamHeroIds), [state.activeTeamHeroIds]);
  const usableInventory = useMemo(
    () => Object.entries(state.usableItemCounts)
      .map(([id, count]) => ({ item: getUsableItem(id), count }))
      .filter(entry => entry.item && entry.count > 0),
    [state.usableItemCounts],
  );

  const canGachaOnce = state.freeSummonCharges > 0 || state.gold >= GACHA_SUMMON_COST;
  const gachaX10Cost = Math.max(0, 10 - state.freeSummonCharges) * GACHA_SUMMON_COST;
  const canGachaX10 = state.freeSummonCharges >= 10 || state.gold >= gachaX10Cost;
  const pityRemaining = Math.max(0, 30 - state.gachaPityCounter);
  const summonTimeline = state.summonHistory.slice(0, 12);
  const hasStatsNotification = state.unspentStatPoints > 0;
  const hasGachaNotification = canGachaOnce;

  const currentQuest = state.tutorialEnabled
    ? TUTORIAL_QUESTS[state.tutorialCurrentQuestIndex] ?? null
    : null;
  const weeklyEvent = getWeeklyEvent();
  const shardForgeCosts = getShardForgeCosts();
  const rebirthDamageCost = getRebirthCoreCost('damage');
  const rebirthEconomyCost = getRebirthCoreCost('economy');
  const rebirthSurvivalCost = getRebirthCoreCost('survival');
  const missionCards = MISSION_BOARD_GOALS.map(m => ({
    mission: m,
    progress: getMissionProgress(m),
    claimed: state.claimedMissionIds.includes(m.id),
  }));

  const hintCandidates = useMemo(() => {
    const list: Array<{ id: string; title: string; detail: string }> = [];
    if (!state.seenHintIds.includes('hint_mission_board')) {
      list.push({
        id: 'hint_mission_board',
        title: 'Mission Board Online',
        detail: 'Check Achievements for short/medium/long goals and claim rewards when complete.',
      });
    }
    if (state.permanentUnlocks.includes('advanced_consumables') && !state.seenHintIds.includes('hint_consumables')) {
      list.push({
        id: 'hint_consumables',
        title: 'Advanced Consumables Unlocked',
        detail: 'New consumables now drop in battles. Use them from the Battle tab.',
      });
    }
    if (state.permanentUnlocks.includes('mythic_equipment') && !state.seenHintIds.includes('hint_mythic_tier')) {
      list.push({
        id: 'hint_mythic_tier',
        title: 'Mythic Tier Online',
        detail: 'You can now drop and upgrade into Mythic equipment in the Equipment tab.',
      });
    }
    return list;
  }, [state.permanentUnlocks, state.seenHintIds]);
  const activeHint = hintCandidates[0] ?? null;

  const tutorialProgressLabel = `${Math.min(state.tutorialCurrentQuestIndex, TUTORIAL_QUESTS.length)}/${TUTORIAL_QUESTS.length}`;
  const rewardPopup = state.rewardQueue[0] ?? null;
  const canRebirthNow = state.wave >= REBIRTH_WAVE_THRESHOLD;
  const rebirthProgressPct = Math.max(0, Math.min(1, state.wave / REBIRTH_WAVE_THRESHOLD)) * 100;
  const rebirthWavesLeft = Math.max(0, REBIRTH_WAVE_THRESHOLD - state.wave);
  const nextGuidance = useMemo(() => {
    if (canRebirthNow) {
      return { title: 'Rebirth Ready', detail: 'Open Battle and trigger Rebirth to reset for permanent power.', tab: 'battle' as Tab };
    }
    if (state.activeTeamHeroIds.length < ACTIVE_TEAM_SIZE) {
      return { title: 'Build Full Team', detail: 'Go to Heroes and equip 4 heroes for stable progression.', tab: 'heroes' as Tab };
    }
    if (state.unspentStatPoints > 0) {
      return { title: 'Spend Stat Points', detail: 'Allocate your unspent points to keep scaling damage and survival.', tab: 'stats' as Tab };
    }
    const firstUnclaimedMission = missionCards.find(m => !m.claimed && m.progress.done);
    if (firstUnclaimedMission) {
      return { title: 'Claim Mission Reward', detail: `Claim \"${firstUnclaimedMission.mission.title}\" in Achievements.`, tab: 'achievements' as Tab };
    }
    return { title: 'Push Act Boss', detail: `Advance to Wave ${currentAct.bossWave} for permanent unlock progress.`, tab: 'battle' as Tab };
  }, [canRebirthNow, state.activeTeamHeroIds.length, state.unspentStatPoints, missionCards, currentAct.bossWave]);
  const effectiveTeamDps = Math.max(1, stats.dps / affixTotals.hpMult);
  const ttkSeconds = state.monsterHp / effectiveTeamDps;
  const baseEnemyDps = getMonsterDamage(state.wave) * affixTotals.dmgMult;
  const incomingAfterDefense = baseEnemyDps * (1 - Math.min(0.8, stats.teamDefense / (stats.teamDefense + 100)));
  const incomingAfterBuffs = incomingAfterDefense * (1 - stats.damageReductionBuffPct);
  const dangerScore = Math.max(0, Math.min(100, (incomingAfterBuffs / Math.max(1, state.teamHp)) * 120));
  const dangerLabel = dangerScore < 25 ? 'Low' : dangerScore < 55 ? 'Moderate' : dangerScore < 80 ? 'High' : 'Critical';
  const damageEssenceCost = getEssenceCost('damage');
  const economyEssenceCost = getEssenceCost('economy');
  const survivalEssenceCost = getEssenceCost('survival');
  const tabSignals: Record<Tab, string> = {
    warroom: canRebirthNow ? 'READY' : 'LIVE',
    battle: `W${state.wave}`,
    heroes: `${state.heroRoster.length}`,
    stats: state.unspentStatPoints > 0 ? `+${state.unspentStatPoints}` : 'OK',
    equipment: `${state.inventoryItemIds.length}`,
    achievements: `${state.achievements.size}/${ACHIEVEMENTS.length}`,
  };

  useEffect(() => {
    if (!rewardPopup) return;
    const timer = setTimeout(() => {
      clearRewardPopup();
    }, 3200);
    return () => clearTimeout(timer);
  }, [rewardPopup, clearRewardPopup]);

  const onTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    const eventMap: Record<Tab, TutorialEvent | null> = {
      warroom: null,
      battle: 'open_battle_tab',
      heroes: 'open_heroes_tab',
      stats: 'open_stats_tab',
      equipment: null,
      achievements: 'open_achievements_tab',
    };
    const event = eventMap[nextTab];
    if (event) notifyQuestEvent(event);
  };

  const toggleWarPanel = (key: keyof typeof warPanels) => {
    setWarPanels(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Character creation screen
  if (!state.characterCreated) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
        <ScrollView contentContainerStyle={styles.createWrap}>
          <Text style={styles.createTitle}>Forge Your Hero</Text>
          <Text style={styles.createSubtitle}>Choose your class. Summon allies. Rise as their leader.</Text>

          <Text style={styles.fieldLabel}>Hero Name</Text>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            style={styles.input}
            placeholder="Enter hero name"
            placeholderTextColor="#7575A8"
            maxLength={24}
          />

          <Text style={styles.fieldLabel}>Class</Text>
          <View style={styles.classList}>
            {CLASSES.map(c => {
              const selected = draftClass === c.id;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.classCard, selected && styles.classCardSelected]}
                  onPress={() => setDraftClass(c.id)}
                >
                  <Text style={styles.className}>{c.emoji} {c.name}</Text>
                  <Text style={styles.classFantasy}>{c.fantasy}</Text>
                  <Text style={styles.classStyle}>{c.style}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.startBtn, draftName.trim().length === 0 && styles.startBtnDisabled]}
            disabled={draftName.trim().length === 0}
            onPress={() => createCharacter(draftName, draftClass)}
          >
            <Text style={styles.startBtnText}>Start Adventure</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A18" />
      <View pointerEvents="none" style={styles.sceneDecor}>
        <View style={styles.sceneOrbA} />
        <View style={styles.sceneOrbB} />
        <View style={styles.sceneGrid} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.gold}>💰 {fmt(state.gold)}</Text>
          <Text style={styles.shardLabel}>💎 {fmt(state.heroShards)} shards</Text>
          <Text style={styles.essenceLabel}>🜂 {fmt(state.essence)} essence</Text>
          <Text style={styles.dpsLabel}>Team DPS {fmt(stats.dps)}</Text>
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.playerLabel}>{state.playerName}</Text>
          <Text style={styles.classLabel}>{stats.className} • Lv {state.level}</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.accountLabel}>@{accountName}</Text>
          <Text style={styles.headerStat}>{fmt(state.exp)}/{fmt(stats.expNeeded)} EXP</Text>
          <Text style={styles.headerStat}>🏆 Bonus +{(stats.achievementBonusPercent * 100).toFixed(0)}%</Text>
          <Text style={styles.headerStat}>📅 Streak {state.dailyLoginStreak}</Text>
          {state.unspentStatPoints > 0 && (
            <Text style={styles.headerHighlight}>+{state.unspentStatPoints} Pts</Text>
          )}
          <Pressable style={styles.logoutBtn} onPress={onLogout}>
            <Text style={styles.logoutBtnText}>Logout</Text>
          </Pressable>
        </View>
      </View>

      {currentQuest && (
        <View style={styles.questBanner}>
          <View style={styles.questBannerHeader}>
            <Text style={styles.questBannerTitle}>📜 Tutorial Quest</Text>
            <Text style={styles.questProgress}>{tutorialProgressLabel}</Text>
          </View>
          <Text style={styles.questName}>{currentQuest.title}</Text>
          <Text style={styles.questDesc}>{currentQuest.description}</Text>
          <Text style={styles.questHint}>Go to: {currentQuest.targetTab.toUpperCase()} tab</Text>
        </View>
      )}

      {activeHint && (
        <View style={styles.hintBanner}>
          <View style={styles.hintBannerTop}>
            <Text style={styles.hintBannerTitle}>💡 {activeHint.title}</Text>
            <Pressable onPress={() => markHintSeen(activeHint.id)} style={styles.hintDismissBtn}>
              <Text style={styles.hintDismissBtnText}>Dismiss</Text>
            </Pressable>
          </View>
          <Text style={styles.hintBannerText}>{activeHint.detail}</Text>
        </View>
      )}

      <View style={styles.nextStepBanner}>
        <View style={styles.nextStepHeader}>
          <Text style={styles.nextStepTitle}>Next Step: {nextGuidance.title}</Text>
          <Pressable style={styles.nextStepBtn} onPress={() => onTabChange(nextGuidance.tab)}>
            <Text style={styles.nextStepBtnText}>Open</Text>
          </Pressable>
        </View>
        <Text style={styles.nextStepDesc}>{nextGuidance.detail}</Text>
      </View>

      <View style={styles.rebirthBanner}>
        <View style={styles.rebirthBannerTop}>
          <Text style={styles.rebirthBannerTitle}>Ascension Status</Text>
          <Pressable
            style={[styles.rebirthBannerBtn, !canRebirthNow && styles.rebirthBannerBtnDisabled]}
            disabled={!canRebirthNow}
            onPress={() => {
              onTabChange('battle');
              setRebirthOpen(true);
            }}
          >
            <Text style={styles.rebirthBannerBtnText}>{canRebirthNow ? 'Rebirth Now' : 'Locked'}</Text>
          </Pressable>
        </View>
        <Text style={styles.rebirthBannerInfo}>
          {canRebirthNow ? `Ready at Wave ${state.wave}. Use Rebirth for permanent cores.` : `${rebirthWavesLeft} waves until Rebirth unlock (Wave ${REBIRTH_WAVE_THRESHOLD}).`}
        </Text>
        <View style={styles.hpBarBg}>
          <View style={[styles.hpBarFill, { width: `${rebirthProgressPct}%`, backgroundColor: canRebirthNow ? '#FF5B8A' : '#6E7EA8' }]} />
        </View>
      </View>

      {/* Team HP Bar */}
      <View style={styles.hpSection}>
        <View style={styles.hpRow}>
          <Text style={styles.hpLabel}>💪 Team</Text>
          <View style={styles.hpBarBg}>
            <View
              style={[
                styles.hpBarFill,
                { 
                  width: `${teamHpPct}%`,
                  backgroundColor: teamHpPct > 30 ? '#33CC55' : '#EE3333',
                },
              ]}
            />
          </View>
          <Text style={styles.hpText}>{Math.ceil(state.teamHp)}/{Math.ceil(state.teamMaxHp)}</Text>
        </View>
      </View>

      {/* Monster Zone */}
      <View style={styles.monsterZone}>
        <Text style={styles.waveLabel}>Wave {state.wave} {isBoss ? '👑' : ''}</Text>
        <Text style={styles.monsterEmoji}>{monster.emoji}</Text>
        <Text style={styles.monsterName}>{monster.name}</Text>
        <View style={styles.hpBarBg}>
          <View
            style={[
              styles.hpBarFill,
              {
                width: `${monsterHpPct}%`,
                backgroundColor: monsterHpPct > 50 ? '#33CC55' : monsterHpPct > 25 ? '#FFCC00' : '#EE3333',
              },
            ]}
          />
        </View>
        <Text style={styles.hpText}>{Math.ceil(state.monsterHp)}/{Math.ceil(state.monsterMaxHp)} HP</Text>
      </View>

      {/* Team Selection */}
      <View style={styles.teamInfo}>
        <View style={styles.teamHeader}>
          <Text style={styles.teamTitle}>⚔️ Active Team (+ You)</Text>
          <Pressable
            onPress={() => {
              setTempTeam([...state.activeTeamHeroIds]);
              setTeamSelectionMode(!teamSelectionMode);
            }}
            style={styles.editBtn}
          >
            <Text style={styles.editBtnText}>{teamSelectionMode ? 'Cancel' : 'Edit'}</Text>
          </Pressable>
        </View>

        {teamSelectionMode ? (
          <View>
            <Text style={styles.selectMsg}>Select up to {ACTIVE_TEAM_SIZE} heroes ({tempTeam.length}/{ACTIVE_TEAM_SIZE})</Text>
            <ScrollView style={styles.heroSelector}>
              {state.heroRoster.map(hero => {
                const isSelected = tempTeam.includes(hero.uid);
                return (
                  <Pressable
                    key={hero.uid}
                    style={[styles.heroSelectCard, isSelected && styles.heroSelectCardSelected]}
                    onPress={() => {
                      setTempTeam(prev => {
                        if (prev.includes(hero.uid)) {
                          return prev.filter(id => id !== hero.uid);
                        } else if (prev.length < ACTIVE_TEAM_SIZE) {
                          return [...prev, hero.uid];
                        }
                        return prev;
                      });
                    }}
                  >
                    <View style={[styles.selectCheckbox, isSelected && styles.selectCheckboxChecked]} />
                    <View style={styles.heroSelectInfo}>
                      <Text style={styles.heroSelectName}>{hero.emoji} {hero.name} Lv{hero.level}</Text>
                      <Text style={{ color: rarityConfig(hero.rarity).color, fontSize: 12 }}>
                        {hero.rarity} • {hero.heroClass}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={styles.confirmBtn}
              onPress={() => {
                setActiveTeam(tempTeam);
                setTeamSelectionMode(false);
              }}
            >
              <Text style={styles.confirmBtnText}>Confirm Team ({tempTeam.length})</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.activeTeamDisplay}>
            {state.activeTeamHeroIds.length === 0 ? (
              <Text style={styles.noTeamMsg}>No heroes selected. Tap Edit to choose your team.</Text>
            ) : (
              state.activeTeamHeroIds.map((heroId, idx) => {
                const hero = state.heroRoster.find(h => h.uid === heroId);
                if (!hero) return null;
                const cls = getClassConfig(hero.heroClass);
                return (
                  <View key={heroId} style={styles.activeTeamCard}>
                    <Text style={styles.slotIdx}>#{idx + 1}</Text>
                    <View style={styles.activeTeamCardContent}>
                      <Text style={styles.activeTeamHeroName}>{hero.emoji} {hero.name}</Text>
                      <Text style={styles.activeTeamHeroClass}>
                        <Text style={{ color: rarityConfig(hero.rarity).color }}>{hero.rarity}</Text>
                        {' • '}
                        {cls.name} Lv{hero.level}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </View>

      {/* Command Deck */}
      <View style={styles.tabBar}>
        {(['warroom', 'battle', 'heroes', 'stats', 'equipment', 'achievements'] as const).map(t => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => onTabChange(t)}
          >
            <View style={styles.tabIconWrap}>
              <Text style={[styles.tabIcon, tab === t && styles.tabIconActive]}>{TAB_META[t].icon}</Text>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{TAB_META[t].label}</Text>
              <Text style={[styles.tabSubText, tab === t && styles.tabSubTextActive]}>{TAB_META[t].mood}</Text>
              <View style={styles.tabSignalPill}>
                <Text style={styles.tabSignalText}>{tabSignals[t]}</Text>
              </View>
              {((t === 'stats' && hasStatsNotification) || (t === 'heroes' && hasGachaNotification)) && (
                <View style={styles.redDot} />
              )}
            </View>
          </Pressable>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView style={styles.tabContent}>
        {tab === 'warroom' && (
          <View style={styles.warRoomTab}>
            <Text style={styles.sectionTitle}>🛰️ War Room Command</Text>
            <Text style={styles.warRoomIntro}>One-screen operations hub. Expand panels for details, jump to deep tabs when needed.</Text>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('frontline')}>
                <Text style={styles.warPanelTitle}>⚔️ Frontline</Text>
                <Text style={styles.warPanelChevron}>{warPanels.frontline ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.frontline && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>Wave {state.wave} • {monster.name} {isBoss ? '(Boss)' : ''}</Text>
                  <Text style={styles.warPanelStat}>Team HP: {Math.ceil(state.teamHp)} / {state.teamMaxHp}</Text>
                  <Text style={styles.warPanelStat}>Danger: {dangerLabel} ({dangerScore.toFixed(0)}%)</Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('battle')}>
                      <Text style={styles.warPanelActionText}>Open Warfront</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.warPanelActionBtn, !canRebirthNow && styles.warPanelActionBtnDisabled]}
                      disabled={!canRebirthNow}
                      onPress={() => setRebirthOpen(true)}
                    >
                      <Text style={styles.warPanelActionText}>{canRebirthNow ? 'Rebirth' : `Rebirth @ W${REBIRTH_WAVE_THRESHOLD}`}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('roster')}>
                <Text style={styles.warPanelTitle}>👥 Roster</Text>
                <Text style={styles.warPanelChevron}>{warPanels.roster ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.roster && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>Active Team: {state.activeTeamHeroIds.length}/{ACTIVE_TEAM_SIZE}</Text>
                  <Text style={styles.warPanelStat}>Total Heroes: {state.heroRoster.length}</Text>
                  <Text style={styles.warPanelStat}>Shards: {fmt(state.heroShards)}</Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={autoEquipBestHeroes}>
                      <Text style={styles.warPanelActionText}>Auto Equip</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('heroes')}>
                      <Text style={styles.warPanelActionText}>Manage Roster</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('armory')}>
                <Text style={styles.warPanelTitle}>🎒 Armory</Text>
                <Text style={styles.warPanelChevron}>{warPanels.armory ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.armory && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>Items: {state.inventoryItemIds.length}</Text>
                  <Text style={styles.warPanelStat}>Scrap: {fmt(state.equipmentScrap)} • Essence: {fmt(state.essence)}</Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => craftEquipment('weapon')}>
                      <Text style={styles.warPanelActionText}>Craft Weapon</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('equipment')}>
                      <Text style={styles.warPanelActionText}>Open Armory</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('growth')}>
                <Text style={styles.warPanelTitle}>📈 Growth</Text>
                <Text style={styles.warPanelChevron}>{warPanels.growth ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.growth && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>Level {state.level} • Unspent: {state.unspentStatPoints}</Text>
                  <Text style={styles.warPanelStat}>Achievement Bonus: +{(stats.achievementBonusPercent * 100).toFixed(0)}%</Text>
                  <Text style={styles.warPanelStat}>Rebirth Cores: {state.rebirthCores}</Text>
                  <View style={styles.warPanelActionRow}>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('stats')}>
                      <Text style={styles.warPanelActionText}>Power Grid</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                      <Text style={styles.warPanelActionText}>Legends</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('objectives')}>
                <Text style={styles.warPanelTitle}>🎯 Objectives</Text>
                <Text style={styles.warPanelChevron}>{warPanels.objectives ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.objectives && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>Weekly Kills: {state.weeklyKills}</Text>
                  <Text style={styles.warPanelStat}>Missions Ready: {missionCards.filter(m => !m.claimed && m.progress.done).length}</Text>
                  <Text style={styles.warPanelStat}>Current Event: {weeklyEvent.emoji} {weeklyEvent.name}</Text>
                  <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                    <Text style={styles.warPanelActionText}>Open Objectives</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        )}

        {tab === 'battle' && (
          <View style={styles.battleTab}>
            <Text style={styles.sectionTitle}>⚔️ Battle Overview</Text>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>♾️ Rebirth</Text>
              <Text style={styles.rebirthInlineText}>
                {canRebirthNow
                  ? 'You can rebirth now. This resets run progress for permanent cores and scaling.'
                  : `Reach Wave ${REBIRTH_WAVE_THRESHOLD} to unlock rebirth. ${rebirthWavesLeft} waves remaining.`}
              </Text>
              <Pressable
                style={[styles.rebirthInlineBtn, !canRebirthNow && styles.rebirthInlineBtnDisabled]}
                disabled={!canRebirthNow}
                onPress={() => setRebirthOpen(true)}
              >
                <Text style={styles.rebirthInlineBtnText}>{canRebirthNow ? 'Open Rebirth' : 'Rebirth Locked'}</Text>
              </Pressable>
            </View>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Act Progression</Text>
              <Text style={styles.actTitle}>{currentAct.emoji} Act {currentAct.id}: {currentAct.name}</Text>
              <Text style={styles.actTheme}>{currentAct.theme}</Text>
              <View style={styles.hpBarBg}>
                <View style={[styles.hpBarFill, { width: `${actProgressPct}%`, backgroundColor: '#5DA8FF' }]} />
              </View>
              <Text style={styles.actProgress}>Wave {state.wave} • Boss at Wave {currentAct.bossWave}</Text>
              {nextBossUnlock ? (
                <Text style={styles.actUnlockHint}>Next boss unlock: {unlockLabel(nextBossUnlock)}</Text>
              ) : (
                <Text style={styles.actUnlockHint}>Boss reward: bonus essence cache</Text>
              )}
              <Text style={styles.actUnlockOwned}>
                Unlocks: {state.permanentUnlocks.length === 0 ? 'None yet' : state.permanentUnlocks.map(unlockLabel).join(' • ')}
              </Text>
            </View>
            
            {/* Enemy Info */}
            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Enemy {isBoss ? '👹 BOSS' : '🦹'}</Text>
              <Text style={styles.battleMonsterName}>{monster.name} {isBoss && '(Boss)' }</Text>
              <Text style={styles.battleMonsterWave}>Wave {state.wave} {isBoss && '- 10x Danger'}</Text>
              <View style={styles.affixRow}>
                {monsterAffixes.map(affix => (
                  <View key={affix.id} style={[styles.affixChip, { borderColor: affix.color }]}>
                    <Text style={[styles.affixChipText, { color: affix.color }]}>{affix.name}</Text>
                  </View>
                ))}
              </View>
              {monsterAffixes.map(affix => (
                <Text key={`${affix.id}_desc`} style={styles.affixDesc}>{affix.description}</Text>
              ))}
            </View>

            {/* Team Composition */}
            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Your Team ({state.activeTeamHeroIds.length}/{ACTIVE_TEAM_SIZE})</Text>
              {state.activeTeamHeroIds.length === 0 ? (
                <Text style={styles.emptyMsg}>No team selected! Tap "Edit Team" above to assemble your squad.</Text>
              ) : (
                state.activeTeamHeroIds.map((heroId, idx) => {
                  const hero = state.heroRoster.find(h => h.uid === heroId);
                  if (!hero) return null;
                  const cls = getClassConfig(hero.heroClass);
                  const detail = stats.heroDetails[hero.uid];
                  return (
                    <View key={heroId} style={styles.battleHeroRow}>
                      <Text style={styles.battleHeroSlot}>#{idx + 1}</Text>
                      <Text style={styles.battleHeroInfo}>
                        {hero.emoji} {hero.name}
                      </Text>
                      <Text style={styles.battleHeroStats}>
                        ⭐{hero.rank} Lv{hero.level} • {cls.name}
                      </Text>
                      {detail && <Text style={styles.battleHeroDps}>{Math.floor(detail.dps)} DPS</Text>}
                    </View>
                  );
                })
              )}
            </View>

            {/* Combat Stats */}
            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Combat Stats</Text>
              <View style={styles.battleStatRow}>
                <Text style={styles.battleStatLabel}>Team DPS:</Text>
                <Text style={styles.battleStatValue}>{Math.floor(stats.dps)}</Text>
              </View>
              <View style={styles.battleStatRow}>
                <Text style={styles.battleStatLabel}>Team HP:</Text>
                <Text style={styles.battleStatValue}>{Math.ceil(state.teamHp)} / {state.teamMaxHp}</Text>
              </View>
              <View style={styles.battleStatRow}>
                <Text style={styles.battleStatLabel}>Enemy HP:</Text>
                <Text style={styles.battleStatValue}>{Math.ceil(state.monsterHp)} / {state.monsterMaxHp}</Text>
              </View>
              {(stats.damageBuffPct > 0 || stats.damageReductionBuffPct > 0) && (
                <Text style={styles.buffText}>
                  Buffs: {stats.damageBuffPct > 0 ? `+${Math.round(stats.damageBuffPct * 100)}% DPS ` : ''}
                  {stats.damageReductionBuffPct > 0 ? `• -${Math.round(stats.damageReductionBuffPct * 100)}% incoming` : ''}
                </Text>
              )}
            </View>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Forecast</Text>
              <View style={styles.battleStatRow}>
                <Text style={styles.battleStatLabel}>Expected TTK:</Text>
                <Text style={styles.battleStatValue}>{ttkSeconds >= 99 ? '99s+' : `${ttkSeconds.toFixed(1)}s`}</Text>
              </View>
              <View style={styles.battleStatRow}>
                <Text style={styles.battleStatLabel}>Danger:</Text>
                <Text style={[styles.battleStatValue, dangerScore >= 80 ? styles.dangerCritical : dangerScore >= 55 ? styles.dangerHigh : styles.dangerLow]}>
                  {dangerLabel} ({dangerScore.toFixed(0)}%)
                </Text>
              </View>
              <View style={styles.hpBarBg}>
                <View
                  style={[
                    styles.hpBarFill,
                    {
                      width: `${dangerScore}%`,
                      backgroundColor: dangerScore >= 80 ? '#FF5B8A' : dangerScore >= 55 ? '#FFB347' : '#6DDB7B',
                    },
                  ]}
                />
              </View>
            </View>

            {/* Wave Rewards */}
            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Wave Rewards</Text>
              <Text style={styles.battleRewardLabel}>
                💰 {fmt(getMonsterGold(state.wave))} gold
              </Text>
              <Text style={styles.battleRewardLabel}>
               ✨ {fmt(getMonsterExp(state.wave))} EXP
              </Text>
              {isBoss && (
                <Text style={styles.battleBossReward}>👹 Bonus drops on boss defeat!</Text>
              )}
            </View>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>🧰 Usable Items</Text>
              <View style={styles.autoPotionRow}>
                <Pressable
                  style={[styles.autoPotionToggle, state.autoUsePotionEnabled && styles.autoPotionToggleActive]}
                  onPress={() => setAutoUsePotion(!state.autoUsePotionEnabled)}
                >
                  <Text style={styles.autoPotionToggleText}>
                    Auto Potion: {state.autoUsePotionEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
                <View style={styles.autoPotionThresholdWrap}>
                  <Pressable
                    style={styles.autoPotionAdjustBtn}
                    onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct - 0.05)}
                  >
                    <Text style={styles.autoPotionAdjustText}>-</Text>
                  </Pressable>
                  <Text style={styles.autoPotionThresholdText}>HP {(state.autoUsePotionThresholdPct * 100).toFixed(0)}%</Text>
                  <Pressable
                    style={styles.autoPotionAdjustBtn}
                    onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct + 0.05)}
                  >
                    <Text style={styles.autoPotionAdjustText}>+</Text>
                  </Pressable>
                </View>
              </View>
              {usableInventory.length === 0 ? (
                <Text style={styles.emptyMsg}>No consumables yet. Keep pushing waves for drops.</Text>
              ) : (
                usableInventory.map(({ item, count }) => {
                  if (!item) return null;
                  return (
                    <View key={item.id} style={styles.usableRow}>
                      <View style={styles.usableInfo}>
                        <Text style={styles.usableName}>{item.emoji} {item.name} x{count}</Text>
                        <Text style={styles.usableDesc}>{item.description}</Text>
                      </View>
                      <Pressable style={styles.useItemBtn} onPress={() => useUsableItem(item.id)}>
                        <Text style={styles.useItemBtnText}>Use</Text>
                      </Pressable>
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.battleSection}>
              <Text style={styles.battleSectionTitle}>Live Combat Log</Text>
              {state.combatLog.length === 0 ? (
                <Text style={styles.emptyMsg}>No events yet. Start attacking to see crits and skill triggers.</Text>
              ) : (
                state.combatLog.slice(0, 8).map((line, idx) => (
                  <Text key={`${idx}_${line}`} style={styles.combatLogLine}>{line}</Text>
                ))
              )}
            </View>

            {state.activeTeamHeroIds.length === 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>⚠️ No team selected! Tap the Edit Team button above to assemble your squad.</Text>
              </View>
            )}
          </View>
        )}

        {tab === 'heroes' && (
          <View style={styles.heroesTab}>
            <View style={styles.gachaSection}>
              <Text style={styles.sectionTitle}>✨ Gacha Summon</Text>
              <Text style={styles.pityLabel}>Pity: {state.gachaPityCounter}/30 • {pityRemaining} until guaranteed Legendary+</Text>
              {state.freeSummonCharges > 0 ? (
                <Text style={styles.gachaFree}>Free Summon Ready ({state.freeSummonCharges})</Text>
              ) : (
                <Text style={styles.gachaCost}>Cost: 💰 {fmt(GACHA_SUMMON_COST)}</Text>
              )}
              <View style={styles.gachaBtnRow}>
                <Pressable
                  style={[
                    styles.gachaBtn,
                    !canGachaOnce && styles.gachaBtnDisabled,
                    hasGachaNotification && styles.gachaBtnNotify,
                  ]}
                  disabled={!canGachaOnce}
                  onPress={summonHero}
                >
                  <Text style={styles.gachaBtnText}>{state.freeSummonCharges > 0 ? 'Use Free Summon' : 'Summon Hero'}</Text>
                  {hasGachaNotification && <View style={styles.gachaBtnDot} />}
                </Pressable>
                <Pressable
                  style={[styles.gachaBtn, styles.gachaBtnX10, !canGachaX10 && styles.gachaBtnDisabled]}
                  disabled={!canGachaX10}
                  onPress={summonHeroX10}
                >
                  <Text style={[styles.gachaBtnText, styles.gachaBtnTextLight]}>Summon x10</Text>
                  <Text style={styles.gachaX10Cost}>💰 {fmt(gachaX10Cost)}</Text>
                </Pressable>
              </View>
              <View style={styles.rarityInfo}>
                {RARITIES.map(r => (
                  <View key={r.id} style={styles.rarityRow}>
                    <View style={[styles.rarityDot, { backgroundColor: r.color }]} />
                    <Text style={styles.rarityLabel}>{r.label}</Text>
                    <Text style={styles.rarityChance}>{(r.chance * 100).toFixed(1)}%</Text>
                  </View>
                ))}
              </View>

              <View style={styles.summonHistoryBox}>
                <Text style={styles.summonHistoryTitle}>Recent Summons</Text>
                <View style={styles.timelineRow}>
                  {summonTimeline.length === 0 ? (
                    <Text style={styles.timelineEmpty}>No summons yet</Text>
                  ) : (
                    summonTimeline.map(entry => {
                      const rarity = rarityConfig(entry.rarity);
                      return (
                        <View key={entry.id} style={[styles.timelineDot, { backgroundColor: rarity.color }]} />
                      );
                    })
                  )}
                </View>
                {state.summonHistory[0] && (
                  <Text style={styles.lastSummonText}>
                    Last: {state.summonHistory[0].heroEmoji} {state.summonHistory[0].heroName} • {state.summonHistory[0].rarity}
                    {state.summonHistory[0].pityTriggered ? ' (Pity)' : ''}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.heroRosterHeader}>
              <Text style={styles.sectionTitle}>📇 Hero Roster</Text>
              <View style={styles.heroRosterActions}>
                <Pressable style={styles.autoRecycleBtn} onPress={autoRecycleHeroes}>
                  <Text style={styles.autoRecycleBtnText}>Auto Recycle</Text>
                </Pressable>
                <Pressable style={styles.autoEquipBtn} onPress={autoEquipBestHeroes}>
                  <Text style={styles.autoEquipBtnText}>Auto Equip Best</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.recyclePickerWrap}>
              <Text style={styles.recyclePickerLabel}>Recycle rarity threshold (and below):</Text>
              <View style={styles.recycleToggleRow}>
                <Text style={styles.recycleToggleLabel}>Background Auto Recycle</Text>
                <Pressable
                  style={[styles.recycleToggleBtn, state.autoRecycleEnabled && styles.recycleToggleBtnActive]}
                  onPress={() => setAutoRecycleEnabled(!state.autoRecycleEnabled)}
                >
                  <Text style={styles.recycleToggleBtnText}>{state.autoRecycleEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.recyclePickerBtn}
                onPress={() => setRecycleDropdownOpen(prev => !prev)}
              >
                <Text style={styles.recyclePickerBtnText}>▼ {state.autoRecycleMaxRarity.toUpperCase()}</Text>
              </Pressable>
              {recycleDropdownOpen && (
                <View style={styles.recycleDropdown}>
                  {RARITIES.map(r => (
                    <Pressable
                      key={r.id}
                      style={[styles.recycleOption, state.autoRecycleMaxRarity === r.id && styles.recycleOptionActive]}
                      onPress={() => {
                        setAutoRecycleMaxRarity(r.id);
                        setRecycleDropdownOpen(false);
                      }}
                    >
                      <Text style={[styles.recycleOptionText, { color: r.color }]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.shardForgeCard}>
              <Text style={styles.shardForgeTitle}>🔧 Shard Forge</Text>
              <Text style={styles.shardForgeDesc}>Spend overflow shards for persistent value.</Text>
              <View style={styles.shardForgeRow}>
                <Pressable
                  style={[styles.shardForgeBtn, state.heroShards < shardForgeCosts.essenceCost && styles.shardForgeBtnDisabled]}
                  disabled={state.heroShards < shardForgeCosts.essenceCost}
                  onPress={convertShardsToEssence}
                >
                  <Text style={styles.shardForgeBtnText}>{shardForgeCosts.essenceCost} 💎 → +1 🜂</Text>
                </Pressable>
                <Pressable
                  style={[styles.shardForgeBtn, state.heroShards < shardForgeCosts.scrapCost && styles.shardForgeBtnDisabled]}
                  disabled={state.heroShards < shardForgeCosts.scrapCost}
                  onPress={convertShardsToScrap}
                >
                  <Text style={styles.shardForgeBtnText}>{shardForgeCosts.scrapCost} 💎 → +140 🔩</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.autoSummonCard}>
              <Text style={styles.shardForgeTitle}>🤖 Auto Summon Rules</Text>
              <View style={styles.autoSummonTopRow}>
                <Pressable
                  style={[styles.autoSummonToggle, state.autoSummonEnabled && styles.autoSummonToggleActive]}
                  onPress={() => setAutoSummonEnabled(!state.autoSummonEnabled)}
                >
                  <Text style={styles.autoSummonToggleText}>Auto Summon: {state.autoSummonEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable
                  style={styles.autoSummonModeBtn}
                  onPress={() => setAutoSummonMode(state.autoSummonMode === 'single' ? 'x10' : 'single')}
                >
                  <Text style={styles.autoSummonModeText}>Mode: {state.autoSummonMode.toUpperCase()}</Text>
                </Pressable>
              </View>
              <View style={styles.autoSummonReserveRow}>
                <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoSummonReserveGold(state.autoSummonReserveGold - 1000)}>
                  <Text style={styles.autoPotionAdjustText}>-</Text>
                </Pressable>
                <Text style={styles.autoSummonReserveText}>Reserve Gold: {fmt(state.autoSummonReserveGold)}</Text>
                <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoSummonReserveGold(state.autoSummonReserveGold + 1000)}>
                  <Text style={styles.autoPotionAdjustText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.rosterCount}>
              {state.heroRoster.length} heroes • {state.activeTeamHeroIds.length}/{ACTIVE_TEAM_SIZE} in active team
            </Text>
            <View style={styles.loadoutRow}>
              {[0, 1, 2].map(slot => (
                <View key={slot} style={styles.loadoutCell}>
                  <Text style={styles.loadoutLabel}>L{slot + 1}</Text>
                  <View style={styles.loadoutBtnsWrap}>
                    <Pressable style={styles.loadoutSaveBtn} onPress={() => saveTeamLoadout(slot)}>
                      <Text style={styles.loadoutBtnText}>Save</Text>
                    </Pressable>
                    <Pressable style={styles.loadoutLoadBtn} onPress={() => loadTeamLoadout(slot)}>
                      <Text style={styles.loadoutBtnText}>Load</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
            {state.heroRoster.length === 0 ? (
              <Text style={styles.emptyMsg}>Summon your first hero!</Text>
            ) : (
              state.heroRoster.map(hero => {
                const inActiveTeam = activeTeamSet.has(hero.uid);
                const cls = getClassConfig(hero.heroClass);
                const rarity = rarityConfig(hero.rarity);
                const details = stats.heroDetails[hero.uid];
                const isExpanded = expandedHeroes.has(hero.uid);
                const shardValue = calculateShardReward(hero.rarity, hero.level);
                const nextRankConfig = hero.rank < 10 ? getRankConfig(hero.rank + 1) : null;
                const canRankUp = nextRankConfig && state.heroShards >= nextRankConfig.shardCostToRankUp;
                const trait = getHeroPassiveTraitInfo(hero.passiveTrait);
                const activeArchetype = getHeroActiveArchetypeInfo(hero.activeSkillArchetype);
                return (
                  <View key={hero.uid} style={[styles.heroCard, inActiveTeam && styles.heroCardActive]}>
                    <View style={[styles.heroCardRarityBar, { backgroundColor: rarity.color }]} />
                    <View style={styles.heroCardBody}>
                      {/* Main row */}
                      <View style={styles.heroCardTopRow}>
                        <Text style={styles.heroEmoji}>{hero.emoji}</Text>
                        <View style={styles.heroCardInfo}>
                          <Text style={styles.heroName}>{hero.name}</Text>
                          <Text style={styles.heroDetail}>
                            <Text style={{ color: rarity.color }}>{hero.rarity}</Text>
                            {' • '}{cls.name}
                          </Text>
                          <Text style={styles.heroRank}>⭐ Rank {hero.rank}/10</Text>
                        </View>
                        <View style={styles.heroCardRight}>
                          <Text style={styles.heroLevel}>Lv {hero.level}</Text>
                          <Pressable
                            style={[styles.toggleBtn, inActiveTeam && styles.toggleBtnActive]}
                            onPress={() => toggleEquipHero(hero.uid)}
                          >
                            <Text style={styles.toggleBtnText}>{inActiveTeam ? '✔ Team' : '+ Add'}</Text>
                          </Pressable>
                        </View>
                      </View>

                      {/* Rank up section */}
                      {nextRankConfig && (
                        <View style={styles.rankUpSection}>
                          <Text style={styles.rankUpLabel}>Rank Up Cost: {nextRankConfig.shardCostToRankUp} 💎</Text>
                          <Pressable
                            style={[styles.rankUpBtn, !canRankUp && styles.rankUpBtnDisabled]}
                            disabled={!canRankUp}
                            onPress={() => rankUpHero(hero.uid)}
                          >
                            <Text style={styles.rankUpBtnText}>{canRankUp ? 'Rank Up' : `Need ${nextRankConfig.shardCostToRankUp - state.heroShards} more`}</Text>
                          </Pressable>
                        </View>
                      )}
                      {hero.rank === 10 && <Text style={styles.maxRankMsg}>✓ Max Rank!</Text>}

                      {/* Stats badges */}
                      {details && (
                        <View style={styles.heroStatsRow}>
                          <View style={styles.heroStatBadge}>
                            <Text style={styles.heroStatBadgeLabel}>DPS</Text>
                            <Text style={styles.heroStatBadgeValue}>{details.dps.toFixed(1)}</Text>
                          </View>
                          <View style={styles.heroStatBadge}>
                            <Text style={styles.heroStatBadgeLabel}>HP</Text>
                            <Text style={styles.heroStatBadgeValue}>{details.hp}</Text>
                          </View>
                          <View style={styles.heroStatBadge}>
                            <Text style={styles.heroStatBadgeLabel}>Boost</Text>
                            <Text style={styles.heroStatBadgeValue}>+{(hero.teamBoost * 100).toFixed(1)}%</Text>
                          </View>
                          <Pressable
                            style={styles.expandBtn}
                            onPress={() => setExpandedHeroes(prev => {
                              const s = new Set(prev);
                              if (s.has(hero.uid)) s.delete(hero.uid); else s.add(hero.uid);
                              return s;
                            })}
                          >
                            <Text style={styles.expandBtnText}>{isExpanded ? '▲' : '▼'}</Text>
                          </Pressable>
                        </View>
                      )}

                      <View style={styles.heroIdentityBox}>
                        <Text style={styles.heroIdentityLine}>Passive: {trait.name}</Text>
                        <Text style={styles.heroIdentitySub}>{trait.description}</Text>
                        <Text style={styles.heroIdentityLine}>Active: {activeArchetype.name}</Text>
                        <Text style={styles.heroIdentitySub}>{activeArchetype.description}</Text>
                      </View>

                      {/* Expanded stat detail */}
                      {isExpanded && details && (
                        <View style={styles.heroExpandedStats}>
                          {(['STR', 'VIT', 'AGI', 'INT', 'SPR'] as const).map((lbl, i) => {
                            const val = [details.str, details.vit, details.agi, details.int, details.spr][i];
                            return (
                              <View key={lbl} style={styles.heroStatItem}>
                                <Text style={styles.heroStatItemLabel}>{lbl}</Text>
                                <Text style={styles.heroStatItemValue}>{val}</Text>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* Recycle button */}
                      <Pressable
                        style={styles.recycleBtn}
                        onPress={() => setRecycleConfirmUid(hero.uid)}
                      >
                        <Text style={styles.recycleBtnText}>♻️ Recycle for {shardValue} 💎</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'stats' && (
          <View style={styles.statsTab}>
            <Text style={styles.sectionTitle}>⬆️ Stat Allocation</Text>
            <Text style={styles.unspentLabel}>
              Unspent Points: <Text style={styles.unspentCount}>{state.unspentStatPoints}</Text>
            </Text>

            <View style={styles.statsGrid}>
              {(Object.keys(STAT_LABELS) as Array<keyof typeof STAT_LABELS>).map(stat => {
                const val = stats.combined[stat];
                const desc = classConfig.statDescriptions[stat as StatKey];
                return (
                  <View key={stat} style={styles.statRow}>
                    <View style={styles.statRowTop}>
                      <View style={styles.statLabel}>
                        <Text style={styles.statAbr}>{STAT_LABELS[stat]}</Text>
                        <Text style={styles.statValue}>{val}</Text>
                      </View>
                      <View style={styles.statBtnGroup}>
                        <Pressable
                          style={[styles.statBtn, state.unspentStatPoints === 0 && styles.statBtnDisabled]}
                          disabled={state.unspentStatPoints === 0}
                          onPress={() => allocateStat(stat as any)}
                        >
                          <Text style={styles.statBtnText}>+1</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.statBtn, styles.statBtnMax, state.unspentStatPoints === 0 && styles.statBtnDisabled]}
                          disabled={state.unspentStatPoints === 0}
                          onPress={() => allocateStatMax(stat as any)}
                        >
                          <Text style={styles.statBtnText}>+MAX</Text>
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.statDesc}>{desc}</Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.heroBoostBox}>
              <Text style={styles.heroBoostLabel}>💪 Hero Boost (Equipped Heroes)</Text>
              <Text style={styles.heroBoostValue}>
                +{(stats.teamBoostPercent * 100).toFixed(2)}% to Team DPS
              </Text>
            </View>

            <View style={styles.metaBox}>
              <Text style={styles.sectionTitle}>🧭 Permanent Progression</Text>
              <Text style={styles.metaEssence}>Essence: {fmt(state.essence)}</Text>
              <View style={styles.passiveBanner}>
                <Text style={styles.passiveTitle}>Class Passive: {classPassive.name}</Text>
                <Text style={styles.passiveDesc}>{classPassive.description}</Text>
                <Text style={styles.passiveState}>
                  {state.permanentUnlocks.includes('class_passive') ? 'Unlocked' : 'Locked (Defeat Act 1 Boss)'}
                </Text>
              </View>

              <View style={styles.metaUpgradeRow}>
                <View style={styles.metaUpgradeInfo}>
                  <Text style={styles.metaUpgradeName}>Damage Path Lv {state.metaDamageLevel}</Text>
                  <Text style={styles.metaUpgradeDesc}>+5% all DPS per level</Text>
                </View>
                <Pressable
                  style={[styles.metaUpgradeBtn, state.essence < damageEssenceCost && styles.metaUpgradeBtnDisabled]}
                  disabled={state.essence < damageEssenceCost}
                  onPress={() => spendEssenceUpgrade('damage')}
                >
                  <Text style={styles.metaUpgradeBtnText}>{damageEssenceCost} 🜂</Text>
                </Pressable>
              </View>

              <View style={styles.metaUpgradeRow}>
                <View style={styles.metaUpgradeInfo}>
                  <Text style={styles.metaUpgradeName}>Economy Path Lv {state.metaEconomyLevel}</Text>
                  <Text style={styles.metaUpgradeDesc}>+5% gold gains per level</Text>
                </View>
                <Pressable
                  style={[styles.metaUpgradeBtn, state.essence < economyEssenceCost && styles.metaUpgradeBtnDisabled]}
                  disabled={state.essence < economyEssenceCost}
                  onPress={() => spendEssenceUpgrade('economy')}
                >
                  <Text style={styles.metaUpgradeBtnText}>{economyEssenceCost} 🜂</Text>
                </Pressable>
              </View>

              <View style={styles.metaUpgradeRow}>
                <View style={styles.metaUpgradeInfo}>
                  <Text style={styles.metaUpgradeName}>Survival Path Lv {state.metaSurvivalLevel}</Text>
                  <Text style={styles.metaUpgradeDesc}>+5% team HP/defense per level</Text>
                </View>
                <Pressable
                  style={[styles.metaUpgradeBtn, state.essence < survivalEssenceCost && styles.metaUpgradeBtnDisabled]}
                  disabled={state.essence < survivalEssenceCost}
                  onPress={() => spendEssenceUpgrade('survival')}
                >
                  <Text style={styles.metaUpgradeBtnText}>{survivalEssenceCost} 🜂</Text>
                </Pressable>
              </View>

              <View style={styles.rebirthTreeCard}>
                <Text style={styles.rebirthTreeTitle}>♾️ Rebirth Tree</Text>
                <Text style={styles.rebirthTreeCores}>Cores: {state.rebirthCores}</Text>
                <View style={styles.metaUpgradeRow}>
                  <View style={styles.metaUpgradeInfo}>
                    <Text style={styles.metaUpgradeName}>Damage Branch Lv {state.rebirthDamagePath}</Text>
                    <Text style={styles.metaUpgradeDesc}>+7% DPS per level</Text>
                  </View>
                  <Pressable
                    style={[styles.metaUpgradeBtn, state.rebirthCores < rebirthDamageCost && styles.metaUpgradeBtnDisabled]}
                    disabled={state.rebirthCores < rebirthDamageCost}
                    onPress={() => spendRebirthCore('damage')}
                  >
                    <Text style={styles.metaUpgradeBtnText}>{rebirthDamageCost} Core</Text>
                  </Pressable>
                </View>
                <View style={styles.metaUpgradeRow}>
                  <View style={styles.metaUpgradeInfo}>
                    <Text style={styles.metaUpgradeName}>Economy Branch Lv {state.rebirthEconomyPath}</Text>
                    <Text style={styles.metaUpgradeDesc}>+7% gold per level</Text>
                  </View>
                  <Pressable
                    style={[styles.metaUpgradeBtn, state.rebirthCores < rebirthEconomyCost && styles.metaUpgradeBtnDisabled]}
                    disabled={state.rebirthCores < rebirthEconomyCost}
                    onPress={() => spendRebirthCore('economy')}
                  >
                    <Text style={styles.metaUpgradeBtnText}>{rebirthEconomyCost} Core</Text>
                  </Pressable>
                </View>
                <View style={styles.metaUpgradeRow}>
                  <View style={styles.metaUpgradeInfo}>
                    <Text style={styles.metaUpgradeName}>Survival Branch Lv {state.rebirthSurvivalPath}</Text>
                    <Text style={styles.metaUpgradeDesc}>+7% HP/defense per level</Text>
                  </View>
                  <Pressable
                    style={[styles.metaUpgradeBtn, state.rebirthCores < rebirthSurvivalCost && styles.metaUpgradeBtnDisabled]}
                    disabled={state.rebirthCores < rebirthSurvivalCost}
                    onPress={() => spendRebirthCore('survival')}
                  >
                    <Text style={styles.metaUpgradeBtnText}>{rebirthSurvivalCost} Core</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={styles.equipmentBox}>
              <Text style={styles.sectionTitle}>🧰 Equipment Bonuses</Text>
              <Text style={styles.equipmentDesc}>Manage equip/upgrade actions in the Equipment tab.</Text>
              <View style={styles.equipmentBonusRow}>
                <Text style={styles.equipmentBonusText}>+STR {stats.equipmentBonus.strength}</Text>
                <Text style={styles.equipmentBonusText}>+VIT {stats.equipmentBonus.vitality}</Text>
                <Text style={styles.equipmentBonusText}>+AGI {stats.equipmentBonus.agility}</Text>
                <Text style={styles.equipmentBonusText}>+INT {stats.equipmentBonus.intelligence}</Text>
                <Text style={styles.equipmentBonusText}>+SPR {stats.equipmentBonus.spirit}</Text>
              </View>
            </View>
          </View>
        )}

        {tab === 'equipment' && (
          <View style={styles.equipmentTab}>
            <Text style={styles.sectionTitle}>🎒 Equipment Inventory</Text>
            <Text style={styles.equipInventoryCount}>
              Total: {state.inventoryItemIds.length} items • Shards: <Text style={{ color: '#FFB347' }}>{state.heroShards}</Text>
            </Text>
            <Text style={styles.scrapLabel}>🔩 Scrap: {fmt(state.equipmentScrap)}</Text>
            <Text style={styles.mythicTierLabel}>
              Mythic Tier: {state.permanentUnlocks.includes('mythic_equipment') ? 'Unlocked' : 'Locked (Defeat Act 3 Boss)'}
            </Text>
            <View style={styles.craftRow}>
              {(['weapon', 'armor', 'accessory'] as EquipmentSlot[]).map(slot => {
                const cost = slot === 'weapon' ? 130 : slot === 'armor' ? 120 : 100;
                const canCraft = state.equipmentScrap >= cost;
                return (
                  <Pressable
                    key={slot}
                    style={[styles.craftBtn, !canCraft && styles.craftBtnDisabled]}
                    disabled={!canCraft}
                    onPress={() => craftEquipment(slot)}
                  >
                    <Text style={styles.craftBtnText}>{slot.toUpperCase()}</Text>
                    <Text style={styles.craftCostText}>{cost}🔩</Text>
                  </Pressable>
                );
              })}
            </View>
            {state.inventoryItemIds.length === 0 ? (
              <Text style={styles.emptyMsg}>No equipment yet! Kill monsters to find better gear.</Text>
            ) : (
              state.inventoryItemIds.map(itemId => {
                const item = getEquipmentItem(itemId);
                if (!item) return null;
                const isEquipped = Object.values(state.equippedItems).includes(itemId);
                const rarity = equipmentRarityConfig(item.rarity);
                const upgradePlan = getUpgradePlan(item.id);
                return (
                  <View key={itemId} style={[styles.invEquipCard, isEquipped && styles.invEquipCardEquipped]}>
                    <View style={[styles.invEquipRarity, { backgroundColor: rarity.color }]} />
                    <View style={styles.invEquipContent}>
                      <View style={styles.invEquipHeader}>
                        <Text style={styles.invEquipName}>{item.emoji} {item.name}</Text>
                        <Text style={[styles.invEquipRarity2, { color: rarity.color }]}>{item.rarity}</Text>
                      </View>
                      <Text style={styles.invEquipSlot}>{item.slot.toUpperCase()}</Text>
                      <Text style={styles.invEquipBonus}>
                        {Object.entries(item.bonus)
                          .filter(([_, v]) => v)
                          .map(([k, v]) => `+${v} ${k === 'strength' ? 'STR' : k === 'vitality' ? 'VIT' : k === 'agility' ? 'AGI' : k === 'intelligence' ? 'INT' : 'SPR'}`)
                          .join(' • ')}
                      </Text>
                      {isEquipped && <Text style={styles.invEquipActive}>✓ Equipped</Text>}
                      <View style={styles.equipActionRow}>
                        {!isEquipped && (
                          <Pressable style={styles.equipNowBtn} onPress={() => equipItem(item.id)}>
                            <Text style={styles.equipNowBtnText}>Equip</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={[styles.upgradeGearBtn, !upgradePlan.canUpgrade && styles.upgradeGearBtnDisabled]}
                          disabled={!upgradePlan.canUpgrade}
                          onPress={() => upgradeEquipmentRarity(item.id)}
                        >
                          <Text style={styles.upgradeGearBtnText}>
                            {upgradePlan.targetRarity
                              ? `Upgrade → ${upgradePlan.targetRarity.toUpperCase()} (${upgradePlan.scrapCost}🔩 ${upgradePlan.essenceCost}🜂)`
                              : 'Upgrade Unavailable'}
                          </Text>
                        </Pressable>
                      </View>
                      {!isEquipped && (
                        <Pressable style={styles.dismantleBtn} onPress={() => dismantleEquipment(item.id)}>
                          <Text style={styles.dismantleBtnText}>Dismantle</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {tab === 'achievements' && (
          <View style={styles.achievementsTab}>
            <View style={styles.achievementBonusCard}>
              <View style={styles.achievementBonusHeader}>
                <Text style={styles.achievementBonusTitle}>Legacy Bonus Engine</Text>
                <Text style={styles.achievementBonusValue}>+{(stats.achievementBonusPercent * 100).toFixed(0)}%</Text>
              </View>
              <Text style={styles.achievementBonusDesc}>
                Each unlocked achievement grants +{ACH_BONUS_PER_UNLOCK_PCT}% global combat/economy power.
              </Text>
              <Text style={styles.achievementBonusDesc}>
                Cap: +{ACH_BONUS_CAP_PCT}% • Unlocked: {state.achievements.size}/{ACHIEVEMENTS.length}
              </Text>
            </View>

            <View style={styles.weeklyEventCard}>
              <Text style={styles.weeklyEventTitle}>{weeklyEvent.emoji} Weekly Event: {weeklyEvent.name}</Text>
              <Text style={styles.weeklyEventDesc}>{weeklyEvent.description}</Text>
              <Text style={styles.weeklyProgressLabel}>Weekly Kills: {state.weeklyKills}</Text>
              {WEEKLY_TRACK_MILESTONES.map(ms => {
                const done = state.weeklyKills >= ms;
                const claimed = state.weeklyTrackClaimed.includes(ms);
                return (
                  <View key={ms} style={styles.weeklyTrackRow}>
                    <Text style={styles.weeklyTrackText}>Milestone {ms}</Text>
                    <Pressable
                      style={[
                        styles.weeklyClaimBtn,
                        (!done || claimed) && styles.weeklyClaimBtnDisabled,
                      ]}
                      disabled={!done || claimed}
                      onPress={() => claimWeeklyTrack(ms)}
                    >
                      <Text style={styles.weeklyClaimBtnText}>{claimed ? 'Claimed' : done ? 'Claim' : 'Locked'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <View style={styles.missionBoardCard}>
              <Text style={styles.sectionTitle}>🎯 Mission Board</Text>
              {missionCards.map(({ mission, progress, claimed }) => (
                <View key={mission.id} style={styles.missionRow}>
                  <View style={styles.missionInfo}>
                    <Text style={styles.missionTitle}>{mission.title} ({mission.horizon})</Text>
                    <Text style={styles.missionDesc}>{mission.description}</Text>
                    <Text style={styles.missionProgress}>{Math.min(progress.value, mission.target)}/{mission.target}</Text>
                  </View>
                  <Pressable
                    style={[styles.missionClaimBtn, (!progress.done || claimed) && styles.missionClaimBtnDisabled]}
                    disabled={!progress.done || claimed}
                    onPress={() => claimMission(mission.id)}
                  >
                    <Text style={styles.missionClaimBtnText}>{claimed ? 'Claimed' : progress.done ? 'Claim' : 'Locked'}</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>🏆 Achievements</Text>
            {ACHIEVEMENTS.map(ach => {
              const unlocked = state.achievements.has(ach.id);
              return (
                <View key={ach.id} style={[styles.achCard, unlocked && styles.achCardUnlocked]}>
                  <Text style={styles.achEmoji}>{ach.emoji}</Text>
                  <View style={styles.achCardInfo}>
                    <Text style={[styles.achName, unlocked && styles.achNameUnlocked]}>{ach.name}</Text>
                    <Text style={styles.achDesc}>{ach.description}</Text>
                    <Text style={[styles.achBonusLine, unlocked && styles.achBonusLineUnlocked]}>
                      {unlocked ? `+${ACH_BONUS_PER_UNLOCK_PCT}% Applied` : `+${ACH_BONUS_PER_UNLOCK_PCT}% on Unlock`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {rewardPopup && (
        <Pressable style={[styles.rewardToast, styles.rewardToastActive]} onPress={clearRewardPopup}>
          <Text style={styles.rewardToastSparkle}>✨</Text>
          <View>
            <Text style={styles.rewardToastTitle}>{rewardPopup.title}</Text>
            <Text style={styles.rewardToastDetail}>{rewardPopup.detail}</Text>
          </View>
          <Text style={styles.rewardToastSparkle}>✨</Text>
        </Pressable>
      )}

      {/* Achievement Toast */}
      <AchievementToast
        achievementId={state.newAchievement}
        onDismiss={clearAchievement}
      />

      {/* Recycle Confirmation Modal */}
      {recycleConfirmUid && (() => {
        const hero = state.heroRoster.find(h => h.uid === recycleConfirmUid);
        if (!hero) return null;
        const shardValue = calculateShardReward(hero.rarity, hero.level);
        return (
          <Modal
            visible={true}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setRecycleConfirmUid(null)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalBox}>
                <Text style={styles.modalTitle}>Recycle Hero?</Text>
                <Text style={styles.modalContent}>
                  {hero.emoji} {hero.name} will be sacrificed for {shardValue} 💎
                </Text>
                <Text style={styles.modalWarning}>
                  This is irreversible!
                </Text>
                <View style={styles.modalButtons}>
                  <Pressable
                    style={[styles.modalBtn, styles.modalBtnCancel]}
                    onPress={() => setRecycleConfirmUid(null)}
                  >
                    <Text style={styles.modalBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.modalBtn, styles.modalBtnConfirm]}
                    onPress={() => {
                      recycleHero(recycleConfirmUid);
                      setRecycleConfirmUid(null);
                    }}
                  >
                    <Text style={styles.modalBtnTextConfirm}>Recycle</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}

      {/* Rebirth Modal */}
      <RebirthModal
        visible={rebirthOpen}
        wave={state.wave}
        prestigeCount={state.prestigeCount}
        onConfirm={rebirth}
        onCancel={() => setRebirthOpen(false)}
      />
    </SafeAreaView>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#060B12',
  },
  sceneDecor: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  sceneOrbA: {
    position: 'absolute',
    top: -80,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#18455D',
    opacity: 0.28,
  },
  sceneOrbB: {
    position: 'absolute',
    top: 90,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: '#7A3F1F',
    opacity: 0.22,
  },
  sceneGrid: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
    borderTopColor: '#1A2A34',
    opacity: 0.2,
  },

  // Character Creation
  createWrap: {
    padding: 20,
    paddingTop: 40,
  },
  createTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  createSubtitle: {
    fontSize: 14,
    color: '#AAA',
    marginBottom: 24,
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#AAA',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#4A4A7A',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#15151F',
    color: '#FFF',
    fontSize: 16,
    marginBottom: 8,
  },
  classList: {
    gap: 8,
  },
  classCard: {
    borderWidth: 1,
    borderColor: '#4A4A7A',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#15151F',
    marginBottom: 8,
  },
  classCardSelected: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  className: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  classFantasy: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 2,
  },
  classStyle: {
    fontSize: 11,
    color: '#777',
    fontStyle: 'italic',
  },
  startBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#6DDB7B',
    borderRadius: 8,
    alignItems: 'center',
  },
  startBtnDisabled: {
    opacity: 0.5,
  },
  startBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0F1722',
    borderBottomWidth: 1,
    borderBottomColor: '#2F4358',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    zIndex: 1,
  },
  gold: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 2,
  },
  shardLabel: {
    fontSize: 11,
    color: '#7ad1ff',
    marginBottom: 2,
  },
  essenceLabel: {
    fontSize: 11,
    color: '#FF9F7A',
    marginBottom: 2,
  },
  dpsLabel: {
    fontSize: 11,
    color: '#9bb9d1',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  playerLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  buffText: {
    marginTop: 6,
    fontSize: 10,
    color: '#8BD39E',
    fontWeight: '700',
  },
  dangerLow: {
    color: '#8BDB9D',
  },
  dangerHigh: {
    color: '#FFB347',
  },
  dangerCritical: {
    color: '#FF6B86',
  },
  combatLogLine: {
    fontSize: 10,
    color: '#B3C2DA',
    marginBottom: 4,
    lineHeight: 14,
  },
  classLabel: {
    fontSize: 11,
    color: '#9BB3C6',
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  accountLabel: {
    fontSize: 10,
    color: '#6DDB7B',
    marginBottom: 2,
  },
  headerStat: {
    fontSize: 11,
    color: '#A5BED1',
    marginBottom: 2,
  },
  headerHighlight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFB347',
  },
  logoutBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2A2A4A',
  },
  logoutBtnText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },

  questBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#6DDB7B',
    backgroundColor: '#131D1A',
  },
  questBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  questBannerTitle: {
    fontSize: 11,
    color: '#6DDB7B',
    fontWeight: '700',
  },
  questProgress: {
    fontSize: 10,
    color: '#AAC9B0',
  },
  questName: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '700',
    marginBottom: 2,
  },
  questDesc: {
    fontSize: 11,
    color: '#B7C8BC',
    lineHeight: 16,
  },
  questHint: {
    fontSize: 10,
    color: '#6DDB7B',
    marginTop: 4,
  },
  hintBanner: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1C1A2C',
    borderLeftWidth: 3,
    borderLeftColor: '#8DA7FF',
  },
  hintBannerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  hintBannerTitle: {
    fontSize: 11,
    color: '#D8E0FF',
    fontWeight: '700',
  },
  hintBannerText: {
    fontSize: 10,
    color: '#A9B8DD',
    lineHeight: 15,
  },
  hintDismissBtn: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#32365A',
  },
  hintDismissBtnText: {
    fontSize: 10,
    color: '#EAF0FF',
    fontWeight: '700',
  },
  nextStepBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1A2226',
    borderLeftWidth: 3,
    borderLeftColor: '#7BD9A8',
  },
  nextStepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nextStepTitle: {
    fontSize: 11,
    color: '#CFFFE4',
    fontWeight: '700',
  },
  nextStepDesc: {
    fontSize: 10,
    color: '#A8D8BF',
    lineHeight: 15,
  },
  nextStepBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2E5843',
  },
  nextStepBtnText: {
    fontSize: 10,
    color: '#E3FFEF',
    fontWeight: '700',
  },
  rebirthBanner: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5E3B56',
    backgroundColor: '#231926',
  },
  rebirthBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  rebirthBannerTitle: {
    fontSize: 11,
    color: '#FFD2E2',
    fontWeight: '700',
  },
  rebirthBannerInfo: {
    fontSize: 10,
    color: '#D5B2C2',
    marginBottom: 6,
  },
  rebirthBannerBtn: {
    borderRadius: 4,
    backgroundColor: '#6A2E4A',
    borderWidth: 1,
    borderColor: '#C17295',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rebirthBannerBtnDisabled: {
    opacity: 0.5,
  },
  rebirthBannerBtnText: {
    fontSize: 10,
    color: '#FFE7F1',
    fontWeight: '700',
  },

  // HP Section
  hpSection: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#0A0A18',
  },
  hpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hpLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    minWidth: 50,
  },
  hpBarBg: {
    flex: 1,
    height: 18,
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  hpText: {
    fontSize: 10,
    color: '#AAA',
    minWidth: 70,
    textAlign: 'right',
  },

  // Monster Zone
  monsterZone: {
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#10101C',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4A',
    marginBottom: 8,
  },
  waveLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginBottom: 4,
  },
  monsterEmoji: {
    fontSize: 48,
    marginBottom: 4,
  },
  monsterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },

  // Team Info
  teamInfo: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#15151F',
    marginBottom: 8,
    borderRadius: 8,
    marginHorizontal: 12,
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  teamTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  selectMsg: {
    fontSize: 11,
    color: '#AAA',
    marginBottom: 8,
  },
  heroSelector: {
    maxHeight: 250,
    marginBottom: 8,
  },
  heroSelectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  heroSelectCardSelected: {
    backgroundColor: '#1a2a20',
    borderColor: '#6DDB7B',
  },
  selectCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#4A4A7A',
    marginRight: 8,
  },
  selectCheckboxChecked: {
    backgroundColor: '#6DDB7B',
    borderColor: '#6DDB7B',
  },
  heroSelectInfo: {
    flex: 1,
  },
  heroSelectName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  confirmBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#6DDB7B',
    borderRadius: 4,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },

  activeTeamDisplay: {
    gap: 6,
  },
  noTeamMsg: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    paddingVertical: 12,
  },
  activeTeamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB347',
  },
  slotIdx: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFB347',
    marginRight: 8,
    minWidth: 20,
  },
  activeTeamCardContent: {
    flex: 1,
  },
  activeTeamHeroName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  activeTeamHeroClass: {
    fontSize: 10,
    color: '#AAA',
  },

  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0E1622',
    borderTopWidth: 1,
    borderTopColor: '#2A4055',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 6,
    gap: 6,
    zIndex: 1,
  },
  tab: {
    flex: 1,
    minHeight: 72,
    paddingVertical: 7,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2C3D4E',
    borderRadius: 8,
    backgroundColor: '#101B29',
  },
  tabActive: {
    borderColor: '#8FD2FF',
    backgroundColor: '#15334A',
  },
  tabIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  tabIconActive: {
    transform: [{ scale: 1.05 }],
  },
  tabText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8FA7BC',
  },
  tabTextActive: {
    color: '#E6F8FF',
  },
  tabSubText: {
    fontSize: 9,
    color: '#6F8BA1',
    marginTop: 1,
  },
  tabSubTextActive: {
    color: '#BFE9FF',
  },
  tabIconWrap: {
    position: 'relative',
    minWidth: 22,
    alignItems: 'center',
  },
  tabSignalPill: {
    marginTop: 5,
    borderRadius: 10,
    backgroundColor: '#1F2F40',
    borderWidth: 1,
    borderColor: '#3E5C77',
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  tabSignalText: {
    fontSize: 9,
    color: '#CDE5F7',
    fontWeight: '700',
  },
  redDot: {
    position: 'absolute',
    top: -1,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
  },
  smallText: {
    fontSize: 11,
  },

  // Tab Content
  tabContent: {
    flex: 1,
    padding: 12,
    marginHorizontal: 10,
    marginBottom: 10,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2B4258',
    backgroundColor: '#0C131D',
  },

  // Battle Tab
  warRoomTab: {
    gap: 10,
  },
  warRoomIntro: {
    fontSize: 11,
    color: '#9EB6C8',
    marginTop: -6,
    marginBottom: 4,
  },
  warPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#31506A',
    backgroundColor: '#101C2A',
    overflow: 'hidden',
  },
  warPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#162839',
  },
  warPanelTitle: {
    fontSize: 12,
    color: '#D6ECFF',
    fontWeight: '700',
  },
  warPanelChevron: {
    fontSize: 16,
    color: '#99C4E1',
    fontWeight: '700',
  },
  warPanelBody: {
    padding: 10,
    gap: 6,
  },
  warPanelStat: {
    fontSize: 11,
    color: '#B3CADB',
  },
  warPanelActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  warPanelActionBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5D88AD',
    backgroundColor: '#21364A',
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  warPanelActionBtnDisabled: {
    opacity: 0.5,
  },
  warPanelActionText: {
    fontSize: 10,
    color: '#D9ECFB',
    fontWeight: '700',
  },
  battleTab: {
    gap: 12,
  },
  warningBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#3a2a1a',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB347',
  },
  warningText: {
    fontSize: 12,
    color: '#FFB347',
    lineHeight: 18,
  },
  usableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0A0A18',
    borderWidth: 1,
    borderColor: '#2A2A4A',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  usableInfo: {
    flex: 1,
  },
  usableName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EDEDED',
    marginBottom: 2,
  },
  usableDesc: {
    fontSize: 10,
    color: '#99A3B2',
  },
  useItemBtn: {
    backgroundColor: '#355a3b',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  useItemBtnText: {
    fontSize: 11,
    color: '#C7FFD2',
    fontWeight: '700',
  },
  autoPotionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  autoPotionToggle: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#54657A',
    backgroundColor: '#1A2230',
  },
  autoPotionToggleActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1f3a2a',
  },
  autoPotionToggleText: {
    color: '#D5E3FF',
    fontSize: 10,
    fontWeight: '700',
  },
  autoPotionThresholdWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoPotionAdjustBtn: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: '#263348',
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoPotionAdjustText: {
    color: '#d3e0ff',
    fontSize: 12,
    fontWeight: '700',
  },
  autoPotionThresholdText: {
    color: '#AFC7F4',
    fontSize: 10,
    minWidth: 56,
    textAlign: 'center',
  },

  // Heroes Tab
  heroesTab: {
    gap: 16,
  },
  gachaSection: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#15151F',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4A4A7A',
  },
  gachaCost: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  gachaFree: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6DDB7B',
    marginBottom: 8,
  },
  pityLabel: {
    fontSize: 11,
    color: '#BFC7FF',
    marginBottom: 8,
  },
  gachaBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  gachaBtn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#6DDB7B',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gachaBtnNotify: {
    borderWidth: 1,
    borderColor: '#ff6b6b',
  },
  gachaBtnDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
  },
  gachaBtnX10: {
    backgroundColor: '#4A4A7A',
  },
  gachaBtnDisabled: {
    opacity: 0.5,
  },
  gachaBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  gachaBtnTextLight: {
    color: '#F2F4FF',
  },
  gachaX10Cost: {
    fontSize: 11,
    color: '#E8E8FF',
    marginTop: 3,
    fontWeight: '600',
  },
  rarityInfo: {
    gap: 6,
  },
  summonHistoryBox: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a3350',
    paddingTop: 8,
  },
  summonHistoryTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DCE6FF',
    marginBottom: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    minHeight: 12,
    marginBottom: 6,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineEmpty: {
    fontSize: 10,
    color: '#7f8ba7',
  },
  lastSummonText: {
    fontSize: 10,
    color: '#B5C5EA',
  },
  rarityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rarityDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  rarityLabel: {
    flex: 1,
    fontSize: 11,
    color: '#AAA',
  },
  rarityChance: {
    fontSize: 10,
    color: '#777',
  },

  heroRosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroRosterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoEquipBtn: {
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  autoEquipBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  autoRecycleBtn: {
    backgroundColor: '#294135',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  autoRecycleBtnText: {
    color: '#9ae8bf',
    fontSize: 10,
    fontWeight: '700',
  },
  rosterCount: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  recyclePickerWrap: {
    marginBottom: 8,
    backgroundColor: '#111728',
    borderWidth: 1,
    borderColor: '#2a3654',
    borderRadius: 6,
    padding: 8,
  },
  recyclePickerLabel: {
    fontSize: 10,
    color: '#99A9C9',
    marginBottom: 6,
  },
  recycleToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recycleToggleLabel: {
    fontSize: 10,
    color: '#AFC4EA',
  },
  recycleToggleBtn: {
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#2D3550',
  },
  recycleToggleBtnActive: {
    backgroundColor: '#2d5b3e',
  },
  recycleToggleBtnText: {
    fontSize: 10,
    color: '#E8F0FF',
    fontWeight: '700',
  },
  recyclePickerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 5,
    backgroundColor: '#1B2640',
    borderWidth: 1,
    borderColor: '#3a4f82',
    alignSelf: 'flex-start',
  },
  recyclePickerBtnText: {
    color: '#DCE8FF',
    fontSize: 11,
    fontWeight: '700',
  },
  recycleDropdown: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#304062',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#0F1524',
  },
  recycleOption: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2a43',
  },
  recycleOptionActive: {
    backgroundColor: '#1b2a20',
  },
  recycleOptionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  shardForgeCard: {
    marginBottom: 8,
    backgroundColor: '#1B2132',
    borderWidth: 1,
    borderColor: '#394971',
    borderRadius: 6,
    padding: 8,
  },
  shardForgeTitle: {
    fontSize: 11,
    color: '#DCE8FF',
    fontWeight: '700',
    marginBottom: 4,
  },
  shardForgeDesc: {
    fontSize: 10,
    color: '#A4B6D8',
    marginBottom: 6,
  },
  shardForgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  shardForgeBtn: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6382B4',
    backgroundColor: '#253957',
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  shardForgeBtnDisabled: {
    opacity: 0.45,
  },
  shardForgeBtnText: {
    fontSize: 10,
    color: '#E3EEFF',
    fontWeight: '700',
  },
  autoSummonCard: {
    marginBottom: 8,
    backgroundColor: '#15282B',
    borderWidth: 1,
    borderColor: '#2B5960',
    borderRadius: 6,
    padding: 8,
  },
  autoSummonTopRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  autoSummonToggle: {
    flex: 1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#426E78',
    backgroundColor: '#1D3940',
    paddingVertical: 7,
    alignItems: 'center',
  },
  autoSummonToggleActive: {
    backgroundColor: '#2c6a55',
    borderColor: '#5bb58f',
  },
  autoSummonToggleText: {
    color: '#D8FFF0',
    fontSize: 10,
    fontWeight: '700',
  },
  autoSummonModeBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#617CA3',
    backgroundColor: '#2A3956',
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  autoSummonModeText: {
    color: '#E4ECFF',
    fontSize: 10,
    fontWeight: '700',
  },
  autoSummonReserveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  autoSummonReserveText: {
    fontSize: 10,
    color: '#BBE9DF',
    fontWeight: '700',
  },
  loadoutRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  loadoutCell: {
    flex: 1,
    backgroundColor: '#151d30',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2c3a5b',
    padding: 6,
  },
  loadoutLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9FB8E8',
    marginBottom: 4,
  },
  loadoutBtnsWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  loadoutSaveBtn: {
    flex: 1,
    backgroundColor: '#3b4f74',
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
  },
  loadoutLoadBtn: {
    flex: 1,
    backgroundColor: '#355a3b',
    borderRadius: 4,
    paddingVertical: 5,
    alignItems: 'center',
  },
  loadoutBtnText: {
    fontSize: 10,
    color: '#f2f6ff',
    fontWeight: '700',
  },
  emptyMsg: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  heroCard: {
    flexDirection: 'row',
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 8,
    overflow: 'hidden',
  },
  heroCardActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  heroCardRarityBar: {
    width: 4,
    borderRadius: 0,
  },
  heroCardBody: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  heroCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  heroCardInfo: {
    flex: 1,
  },
  heroCardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  heroLevel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFB347',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroStatBadge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  heroStatBadgeLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: '#777',
    textTransform: 'uppercase',
  },
  heroStatBadgeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 1,
  },
  expandBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: '#2A2A4A',
    borderRadius: 4,
  },
  expandBtnText: {
    fontSize: 10,
    color: '#AAA',
  },
  heroExpandedStats: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },
  heroIdentityBox: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2F3754',
    backgroundColor: '#0D1121',
  },
  heroIdentityLine: {
    fontSize: 10,
    color: '#DCE6FF',
    fontWeight: '700',
    marginBottom: 2,
  },
  heroIdentitySub: {
    fontSize: 10,
    color: '#91A7CD',
    marginBottom: 4,
    lineHeight: 13,
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: '#0E0E1E',
    borderRadius: 4,
  },
  heroStatItemLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6DDB7B',
  },
  heroStatItemValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 2,
  },
  heroEmoji: {
    fontSize: 24,
  },
  heroName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  heroDetail: {
    fontSize: 10,
    color: '#AAA',
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  toggleBtnActive: {
    backgroundColor: '#6DDB7B',
  },
  toggleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },

  // Stats Tab
  statsTab: {
    gap: 16,
  },
  unspentLabel: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 8,
  },
  unspentCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFB347',
  },
  statsGrid: {
    gap: 8,
  },
  statRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  statRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statLabel: {
    flex: 1,
  },
  statAbr: {
    fontSize: 10,
    color: '#777',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 2,
  },
  statDesc: {
    fontSize: 11,
    color: '#9090B8',
    lineHeight: 16,
  },
  statBtnGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  statBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#4A4A7A',
    borderRadius: 4,
  },
  statBtnMax: {
    backgroundColor: '#355a3b',
  },
  statBtnDisabled: {
    opacity: 0.5,
  },
  statBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  heroBoostBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB347',
  },
  heroBoostLabel: {
    fontSize: 11,
    color: '#AAA',
    marginBottom: 4,
  },
  heroBoostValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFB347',
  },
  metaBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#16172A',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#303564',
    gap: 8,
  },
  metaEssence: {
    fontSize: 12,
    color: '#FFB68D',
    fontWeight: '700',
  },
  passiveBanner: {
    backgroundColor: '#0E1120',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A335A',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  passiveTitle: {
    fontSize: 11,
    color: '#DCE6FF',
    fontWeight: '700',
    marginBottom: 2,
  },
  passiveDesc: {
    fontSize: 10,
    color: '#9CB0D4',
    marginBottom: 4,
  },
  passiveState: {
    fontSize: 10,
    color: '#8bd39e',
    fontWeight: '700',
  },
  metaUpgradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0F1120',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2C3158',
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  metaUpgradeInfo: {
    flex: 1,
  },
  metaUpgradeName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E6EDFF',
    marginBottom: 2,
  },
  metaUpgradeDesc: {
    fontSize: 10,
    color: '#9FB0D3',
  },
  metaUpgradeBtn: {
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#2f6d4f',
    borderWidth: 1,
    borderColor: '#5ea97b',
  },
  metaUpgradeBtnDisabled: {
    opacity: 0.45,
  },
  metaUpgradeBtnText: {
    fontSize: 11,
    color: '#D6FFE7',
    fontWeight: '700',
  },
  rebirthTreeCard: {
    marginTop: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4A3664',
    backgroundColor: '#191227',
    padding: 8,
    gap: 6,
  },
  rebirthTreeTitle: {
    fontSize: 11,
    color: '#E9D6FF',
    fontWeight: '700',
  },
  rebirthTreeCores: {
    fontSize: 10,
    color: '#D9B6FF',
    fontWeight: '700',
  },
  equipmentBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    gap: 8,
  },
  equipmentDesc: {
    fontSize: 11,
    color: '#999',
    marginTop: -4,
  },
  equipSlotRow: {
    borderTopWidth: 1,
    borderTopColor: '#24243A',
    paddingTop: 8,
    gap: 6,
  },
  equipSlotTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6DDB7B',
  },
  equipSlotCurrent: {
    fontSize: 11,
    color: '#DDD',
  },
  equipChoices: {
    gap: 6,
  },
  equipChoiceBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3B3B5F',
    backgroundColor: '#10101C',
  },
  equipChoiceBtnActive: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  equipChoiceText: {
    fontSize: 11,
    color: '#EEE',
  },
  equipmentBonusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  equipmentBonusText: {
    fontSize: 10,
    color: '#AAB4D1',
  },

  // Achievements Tab
  achievementsTab: {
    gap: 8,
  },
  achievementBonusCard: {
    backgroundColor: '#17232B',
    borderWidth: 1,
    borderColor: '#385A66',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  achievementBonusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  achievementBonusTitle: {
    fontSize: 12,
    color: '#D5F2FF',
    fontWeight: '700',
  },
  achievementBonusValue: {
    fontSize: 14,
    color: '#7EE2A9',
    fontWeight: '800',
  },
  achievementBonusDesc: {
    fontSize: 10,
    color: '#A6C8D4',
    lineHeight: 15,
  },
  weeklyEventCard: {
    backgroundColor: '#121f2e',
    borderWidth: 1,
    borderColor: '#2f4d71',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  weeklyEventTitle: {
    fontSize: 12,
    color: '#DCEFFF',
    fontWeight: '700',
    marginBottom: 4,
  },
  weeklyEventDesc: {
    fontSize: 10,
    color: '#AFC5DD',
    marginBottom: 8,
    lineHeight: 15,
  },
  weeklyProgressLabel: {
    fontSize: 11,
    color: '#90D0FF',
    marginBottom: 6,
    fontWeight: '700',
  },
  weeklyTrackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  weeklyTrackText: {
    fontSize: 11,
    color: '#D2E0F0',
  },
  weeklyClaimBtn: {
    backgroundColor: '#2e6948',
    borderWidth: 1,
    borderColor: '#5ea280',
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  weeklyClaimBtnDisabled: {
    opacity: 0.45,
  },
  weeklyClaimBtnText: {
    fontSize: 10,
    color: '#d8ffeb',
    fontWeight: '700',
  },
  missionBoardCard: {
    backgroundColor: '#1A182B',
    borderWidth: 1,
    borderColor: '#3A3161',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  missionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#2B254A',
  },
  missionInfo: {
    flex: 1,
  },
  missionTitle: {
    fontSize: 11,
    color: '#E3DBFF',
    fontWeight: '700',
    marginBottom: 2,
  },
  missionDesc: {
    fontSize: 10,
    color: '#B7ADDC',
    marginBottom: 2,
  },
  missionProgress: {
    fontSize: 10,
    color: '#8ED5FF',
    fontWeight: '700',
  },
  missionClaimBtn: {
    backgroundColor: '#3B3D73',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#7C82D3',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  missionClaimBtnDisabled: {
    opacity: 0.45,
  },
  missionClaimBtnText: {
    fontSize: 10,
    color: '#E8E9FF',
    fontWeight: '700',
  },
  achCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#121B28',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A4257',
    marginBottom: 8,
    opacity: 0.6,
  },
  achCardUnlocked: {
    opacity: 1,
    borderColor: '#68D69D',
    backgroundColor: '#152723',
  },
  achEmoji: {
    fontSize: 20,
  },
  achCardInfo: {
    flex: 1,
  },
  achName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#95A8B7',
    marginBottom: 2,
  },
  achNameUnlocked: {
    color: '#EDFFF6',
  },
  achDesc: {
    fontSize: 10,
    color: '#8DA3B5',
  },
  achBonusLine: {
    marginTop: 3,
    fontSize: 10,
    color: '#8CB2C4',
    fontWeight: '700',
  },
  achBonusLineUnlocked: {
    color: '#79D89F',
  },

  // Rebirth
  rebirthInlineText: {
    fontSize: 11,
    color: '#D0C2E8',
    lineHeight: 16,
    marginBottom: 8,
  },
  rebirthInlineBtn: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    backgroundColor: '#6A2E4A',
    borderWidth: 1,
    borderColor: '#C17295',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  rebirthInlineBtnDisabled: {
    opacity: 0.5,
  },
  rebirthInlineBtnText: {
    fontSize: 11,
    color: '#FFE7F1',
    fontWeight: '700',
  },
  rewardToast: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1A2A1F',
    borderLeftWidth: 3,
    borderLeftColor: '#6DDB7B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rewardToastActive: {
    shadowColor: '#6DDB7B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 5,
  },
  rewardToastSparkle: {
    fontSize: 16,
  },
  rewardToastTitle: {
    color: '#E9FFE5',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  rewardToastDetail: {
    color: '#B7D0BB',
    fontSize: 11,
  },
  // Sections
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 12,
    color: '#AAA',
    lineHeight: 18,
    marginBottom: 12,
  },

  // Battle Tab  
  battleSection: {
    backgroundColor: '#121C29',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C4156',
  },
  battleSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6DDB7B',
    marginBottom: 8,
  },
  battleMonsterName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  battleMonsterWave: {
    fontSize: 11,
    color: '#AAA',
  },
  affixRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: 4,
  },
  affixChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    backgroundColor: '#101728',
  },
  affixChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  affixDesc: {
    fontSize: 10,
    color: '#94a3bc',
    marginTop: 2,
  },
  battleHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#0A0A18',
    paddingHorizontal: 8,
    borderRadius: 4,
    marginBottom: 4,
    gap: 8,
  },
  battleHeroSlot: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFB347',
    minWidth: 25,
  },
  battleHeroInfo: {
    flex: 1,
    fontSize: 11,
    color: '#FFF',
  },
  battleHeroStats: {
    fontSize: 10,
    color: '#AAA',
  },
  battleHeroDps: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6DDB7B',
    minWidth: 55,
    textAlign: 'right',
  },
  battleStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  battleStatLabel: {
    fontSize: 11,
    color: '#AAA',
  },
  battleStatValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  battleRewardLabel: {
    fontSize: 11,
    color: '#DDD',
    marginVertical: 4,
  },
  battleBossReward: {
    fontSize: 11,
    color: '#FF5B8A',
    fontWeight: '600',
    marginTop: 4,
  },
  actTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8EEFF',
    marginBottom: 2,
  },
  actTheme: {
    fontSize: 10,
    color: '#96a5bf',
    marginBottom: 8,
  },
  actProgress: {
    fontSize: 10,
    color: '#c2d2f4',
    marginTop: 6,
  },
  actUnlockHint: {
    fontSize: 10,
    color: '#8dd0ff',
    marginTop: 3,
  },
  actUnlockOwned: {
    fontSize: 10,
    color: '#9fcf9d',
    marginTop: 4,
  },

  // Equipment Tab
  equipmentTab: {
    gap: 12,
  },
  equipInventoryCount: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  scrapLabel: {
    fontSize: 12,
    color: '#B6D6FF',
    marginBottom: 8,
  },
  mythicTierLabel: {
    fontSize: 11,
    color: '#FF7EA1',
    marginBottom: 8,
  },
  craftRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  craftBtn: {
    flex: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#6e86a8',
    backgroundColor: '#233147',
    paddingVertical: 8,
    alignItems: 'center',
  },
  craftBtnDisabled: {
    opacity: 0.45,
  },
  craftBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EAF2FF',
  },
  craftCostText: {
    fontSize: 10,
    color: '#A8C2E9',
    marginTop: 2,
  },
  invEquipCard: {
    flexDirection: 'row',
    backgroundColor: '#15151F',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    marginBottom: 8,
    overflow: 'hidden',
  },
  invEquipCardEquipped: {
    borderColor: '#6DDB7B',
    backgroundColor: '#1a2a20',
  },
  invEquipRarity: {
    width: 4,
  },
  invEquipContent: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  invEquipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  invEquipName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  invEquipRarity2: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  invEquipSlot: {
    fontSize: 10,
    color: '#AAA',
    marginBottom: 4,
    fontWeight: '600',
  },
  invEquipBonus: {
    fontSize: 11,
    color: '#6DDB7B',
    marginBottom: 4,
  },
  invEquipActive: {
    fontSize: 10,
    color: '#6DDB7B',
    fontWeight: '700',
  },
  equipActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  equipNowBtn: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 4,
    backgroundColor: '#2E5A38',
    borderWidth: 1,
    borderColor: '#6DBB83',
  },
  equipNowBtnText: {
    fontSize: 10,
    color: '#DFFFE8',
    fontWeight: '700',
  },
  upgradeGearBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#294353',
    borderWidth: 1,
    borderColor: '#5b97c0',
  },
  upgradeGearBtnDisabled: {
    opacity: 0.45,
  },
  upgradeGearBtnText: {
    color: '#d8edff',
    fontSize: 10,
    fontWeight: '700',
  },
  dismantleBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#4a2f2f',
    borderWidth: 1,
    borderColor: '#b46464',
  },
  dismantleBtnText: {
    color: '#ffd6d6',
    fontSize: 10,
    fontWeight: '700',
  },

  // Hero Card Extensions
  heroRank: {
    fontSize: 10,
    color: '#FFB347',
    marginTop: 2,
  },
  rankUpSection: {
    backgroundColor: '#0A0A18',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  rankUpLabel: {
    fontSize: 10,
    color: '#AAA',
    marginBottom: 6,
  },
  rankUpBtn: {
    backgroundColor: '#FFB347',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  rankUpBtnDisabled: {
    backgroundColor: '#4A4A4A',
    opacity: 0.6,
  },
  rankUpBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  maxRankMsg: {
    fontSize: 11,
    color: '#6DDB7B',
    fontWeight: '700',
    marginBottom: 8,
  },
  recycleBtn: {
    backgroundColor: '#3A4A3A',
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#6DDB7B',
  },
  recycleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6DDB7B',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#15151F',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    minWidth: '70%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalContent: {
    fontSize: 13,
    color: '#DDD',
    marginBottom: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalWarning: {
    fontSize: 12,
    color: '#FF5B8A',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 100,
  },
  modalBtnCancel: {
    backgroundColor: '#2A2A4A',
  },
  modalBtnConfirm: {
    backgroundColor: '#FF5B8A',
  },
  modalBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#AAA',
  },
  modalBtnTextConfirm: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
});
