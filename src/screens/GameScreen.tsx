import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Rarity,
} from '../gameConfig';
import { fmt } from '../utils';
import AchievementToast from '../components/AchievementToast';
import RebirthModal from '../components/PrestigeModal';

type Tab = 'warroom' | 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment';
type HeroesSubTab = 'summon' | 'roster' | 'forge';
type EquipmentSubTab = 'inventory' | 'craft';
type AchievementsSubTab = 'overview' | 'weekly' | 'missions' | 'achievements' | 'collection' | 'codex';

type MomentCue = 'none' | 'mythic' | 'boss' | 'rebirth' | 'ultimate';

type SummonReveal = {
  id: string;
  heroName: string;
  emoji: string;
  rarity: Rarity;
};

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
    attack,
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
    setHeroFormation,
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [heroesSubTab, setHeroesSubTab] = useState<HeroesSubTab>('summon');
  const [equipmentSubTab, setEquipmentSubTab] = useState<EquipmentSubTab>('inventory');
  const [achievementsSubTab, setAchievementsSubTab] = useState<AchievementsSubTab>('overview');
  const [eventsOpen, setEventsOpen] = useState(false);
  const [chapterMapOpen, setChapterMapOpen] = useState(false);
  const [compareItemId, setCompareItemId] = useState<string | null>(null);
  const [momentCue, setMomentCue] = useState<MomentCue>('none');
  const [ultimateTagline, setUltimateTagline] = useState('LIMIT BREAK');
  const [summonReveal, setSummonReveal] = useState<SummonReveal | null>(null);
  const [idleChestReady, setIdleChestReady] = useState(false);
  const [idleChestOpen, setIdleChestOpen] = useState(false);
  const [idleChestReward, setIdleChestReward] = useState<{ title: string; detail: string } | null>(null);
  const [battleSpeed, setBattleSpeed] = useState<1 | 2 | 4>(1);
  const lastSummonIdRef = useRef<string | null>(null);
  const [warPanels, setWarPanels] = useState({
    frontline: true,
    roster: true,
    armory: false,
    growth: false,
    objectives: true,
    prestige: false,
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
  const classCutinTone = useMemo(() => {
    const byClass: Record<PlayerClass, { stripe: string; glow: string; callout: string }> = {
      warrior: { stripe: '#6E7FA8', glow: '#9AB3E6', callout: 'Aegis Impact' },
      berserker: { stripe: '#A0472A', glow: '#E77A50', callout: 'Rage Breaker' },
      archer: { stripe: '#3C8C63', glow: '#7FD7A6', callout: 'Skyline Volley' },
      mage: { stripe: '#5B4AA6', glow: '#A993F0', callout: 'Astral Collapse' },
      monk: { stripe: '#B19135', glow: '#EACE77', callout: 'Zen Tempest' },
    };
    return byClass[state.playerClass ?? 'warrior'];
  }, [state.playerClass]);
  const canRebirthNow = state.wave >= REBIRTH_WAVE_THRESHOLD;
  const rebirthProgressPct = Math.max(0, Math.min(1, state.wave / REBIRTH_WAVE_THRESHOLD)) * 100;
  const rebirthWavesLeft = Math.max(0, REBIRTH_WAVE_THRESHOLD - state.wave);
  const guidanceList = useMemo(() => {
    const recs: Array<{ title: string; detail: string; tab: Tab }> = [];
    if (canRebirthNow) {
      recs.push({ title: 'Rebirth Ready', detail: 'Reset now for permanent cores and stronger scaling.', tab: 'battle' });
    }
    if (state.activeTeamHeroIds.length < ACTIVE_TEAM_SIZE) {
      recs.push({ title: 'Build Full Team', detail: 'Equip 4 heroes to stabilize damage and survival.', tab: 'heroes' });
    }
    if (state.unspentStatPoints > 0) {
      recs.push({ title: 'Spend Stat Points', detail: 'Use unspent points to increase immediate power.', tab: 'stats' });
    }
    const firstUnclaimedMission = missionCards.find(m => !m.claimed && m.progress.done);
    if (firstUnclaimedMission) {
      recs.push({ title: 'Claim Mission Reward', detail: `Claim \"${firstUnclaimedMission.mission.title}\" for instant resources.`, tab: 'achievements' });
    }
    recs.push({ title: 'Push Act Boss', detail: `Advance to Wave ${currentAct.bossWave} for permanent unlock progress.`, tab: 'battle' });
    return recs.slice(0, 3);
  }, [canRebirthNow, state.activeTeamHeroIds.length, state.unspentStatPoints, missionCards, currentAct.bossWave]);
  const nextGuidance = guidanceList[0];
  const extraGuidanceCount = Math.max(0, guidanceList.length - 1);
  const equippedItemsForScore = useMemo(
    () => Object.values(state.equippedItems).map(id => (id ? getEquipmentItem(id) : null)).filter(Boolean),
    [state.equippedItems],
  );
  const gearScore = useMemo(() => {
    const rarityPoints: Record<string, number> = { common: 40, rare: 90, epic: 170, legendary: 280, mythic: 430 };
    return equippedItemsForScore.reduce((sum, item) => {
      if (!item) return sum;
      const statValue = Object.values(item.bonus).reduce((s, v) => s + (v ?? 0), 0);
      return sum + (rarityPoints[item.rarity] ?? 0) + statValue * 12;
    }, 0);
  }, [equippedItemsForScore]);
  const teamPowerIndex = Math.floor(stats.dps * 0.45 + state.teamMaxHp * 0.25 + stats.teamDefense * 7 + gearScore * 15);
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
  const claimableWeeklyMilestones = WEEKLY_TRACK_MILESTONES.filter(ms => state.weeklyKills >= ms && !state.weeklyTrackClaimed.includes(ms));
  const claimableMissionIds = missionCards.filter(m => !m.claimed && m.progress.done).map(m => m.mission.id);
  const hasClaimableRewards = claimableWeeklyMilestones.length > 0 || claimableMissionIds.length > 0;
  const expPct = Math.floor((state.exp / Math.max(1, stats.expNeeded)) * 100);
  const topStatChips = [
    { id: 'gold', label: 'Gold', value: fmt(state.gold) },
    { id: 'shards', label: 'Shards', value: fmt(state.heroShards) },
    { id: 'essence', label: 'Essence', value: fmt(state.essence) },
    { id: 'dps', label: 'DPS', value: fmt(stats.dps) },
    { id: 'power', label: 'Power', value: fmt(teamPowerIndex) },
    { id: 'gear', label: 'Gear', value: fmt(gearScore) },
    { id: 'bonus', label: 'Bonus', value: `+${(stats.achievementBonusPercent * 100).toFixed(0)}%` },
    { id: 'exp', label: 'EXP', value: `${expPct}%` },
    { id: 'streak', label: 'Streak', value: `${state.dailyLoginStreak}` },
  ];

  useEffect(() => {
    if (!rewardPopup) return;
    const text = `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase();
    if (text.includes('offline progress')) return;
    const timer = setTimeout(() => {
      clearRewardPopup();
    }, 3200);
    return () => clearTimeout(timer);
  }, [rewardPopup, clearRewardPopup]);

  useEffect(() => {
    if (!rewardPopup) return;
    const t = `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase();
    if (t.includes('mythic drop')) setMomentCue('mythic');
    else if (t.includes('boss defeated')) setMomentCue('boss');
    else if (t.includes('rebirth complete') || t.includes('shockwave')) {
      setUltimateTagline('REBIRTH ASCENSION');
      setMomentCue('ultimate');
    } else if (t.includes('offline progress')) {
      setIdleChestReward(rewardPopup);
      setIdleChestReady(true);
      return;
    }
    else return;
    const timer = setTimeout(() => setMomentCue('none'), 900);
    return () => clearTimeout(timer);
  }, [rewardPopup]);

  useEffect(() => {
    const latest = state.summonHistory[0];
    if (!latest) return;
    if (lastSummonIdRef.current === latest.id) return;
    lastSummonIdRef.current = latest.id;
    setSummonReveal({ id: latest.id, heroName: latest.heroName, emoji: latest.heroEmoji, rarity: latest.rarity });
    const timer = setTimeout(() => setSummonReveal(null), 2000);
    return () => clearTimeout(timer);
  }, [state.summonHistory]);

  useEffect(() => {
    if (!rewardPopup && !idleChestOpen) {
      setIdleChestReady(false);
      setIdleChestReward(null);
    }
  }, [rewardPopup, idleChestOpen]);

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

  const claimAllRewards = () => {
    claimableWeeklyMilestones.forEach(ms => claimWeeklyTrack(ms));
    claimableMissionIds.forEach(id => claimMission(id));
  };
  const cycleAutoRecycleRarity = () => {
    const idx = RARITIES.findIndex(r => r.id === state.autoRecycleMaxRarity);
    const next = RARITIES[(idx + 1) % RARITIES.length];
    setAutoRecycleMaxRarity(next.id);
  };

  const canCraftWeapon = state.equipmentScrap >= 130;

  const optimizeEquipment = () => {
    const slots: EquipmentSlot[] = ['weapon', 'armor', 'accessory'];
    const rarityOrder: Record<string, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
    slots.forEach(slot => {
      const slotItems = state.inventoryItemIds
        .map(id => getEquipmentItem(id))
        .filter((item): item is NonNullable<ReturnType<typeof getEquipmentItem>> => !!item && item.slot === slot);
      if (slotItems.length === 0) return;
      const best = [...slotItems].sort((a, b) => {
        const rd = (rarityOrder[b.rarity] ?? 0) - (rarityOrder[a.rarity] ?? 0);
        if (rd !== 0) return rd;
        const aVal = Object.values(a.bonus).reduce((s, v) => s + (v ?? 0), 0);
        const bVal = Object.values(b.bonus).reduce((s, v) => s + (v ?? 0), 0);
        return bVal - aVal;
      })[0];
      if (best) equipItem(best.id);
    });
  };

  const seasonScore = state.seasonPoints;
  const seasonRank = seasonScore < 1000 ? '🥉 Bronze' : seasonScore < 5000 ? '🥈 Silver' : seasonScore < 15000 ? '🥇 Gold' : seasonScore < 40000 ? '💎 Diamond' : '👑 Legend';
  const classMasteryLevel = Math.floor((state.playerClass ? state.classMasteryXp[state.playerClass] : 0) / 100);
  const campaignChapter = Math.floor((Math.max(1, state.wave) - 1) / 20) + 1;
  const campaignStage = ((Math.max(1, state.wave) - 1) % 20) + 1;
  const campaignBossStage = 20;
  const powerTier = teamPowerIndex < 12000 ? 'Recruit' : teamPowerIndex < 55000 ? 'Elite' : teamPowerIndex < 180000 ? 'Mythic' : 'Ascendant';
  const guildRank = state.totalKills < 500 ? 'Bronze Order' : state.totalKills < 2500 ? 'Silver Order' : state.totalKills < 9000 ? 'Gold Order' : 'Eternal Order';
  const isBossImminent = state.wave % 10 >= 8;
  const burstChargePct = Math.min(100, (((state.totalKills % 25) + 1) / 25) * 100);
  const canBurst = burstChargePct >= 96;
  const prestige1Done = (state.prestigeCount ?? 0) >= 1;
  const prestige5Done = (state.prestigeCount ?? 0) >= 5;
  const prestige10Done = (state.prestigeCount ?? 0) >= 10;
  const prestige25Done = (state.prestigeCount ?? 0) >= 25;
  const prestige50Done = (state.prestigeCount ?? 0) >= 50;

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
      {summonReveal && (
        <View pointerEvents="none" style={styles.summonRevealOverlay}>
          <View style={[
            styles.summonRevealCard,
            {
              borderColor: rarityConfig(summonReveal.rarity).color,
              shadowColor: rarityConfig(summonReveal.rarity).color,
            },
          ]}>
            <Text style={styles.summonRevealLabel}>{rarityConfig(summonReveal.rarity).label.toUpperCase()} RECRUIT</Text>
            <Text style={styles.summonRevealEmoji}>{summonReveal.emoji}</Text>
            <Text style={styles.summonRevealName}>{summonReveal.heroName}</Text>
            <Text style={styles.summonRevealSub}>Joined your squad</Text>
          </View>
        </View>
      )}
      {momentCue !== 'none' && (
        <View pointerEvents="none" style={[
          styles.momentCueOverlay,
          momentCue === 'mythic'
            ? styles.momentCueMythic
            : momentCue === 'boss'
              ? styles.momentCueBoss
              : momentCue === 'ultimate'
                ? styles.momentCueUltimate
                : styles.momentCueRebirth,
        ]}>
          {momentCue === 'ultimate' && <View style={[styles.momentCueSlash, { backgroundColor: classCutinTone.stripe }]} />}
          <Text style={styles.momentCueText}>
            {momentCue === 'mythic'
              ? 'MYTHIC'
              : momentCue === 'boss'
                ? 'BOSS DOWN'
                : momentCue === 'ultimate'
                  ? `${classConfig.name.toUpperCase()} ULT`
                  : 'REBIRTH'}
          </Text>
          {momentCue === 'ultimate' && (
            <Text style={[styles.momentCueSubText, { color: classCutinTone.glow }]}>{ultimateTagline} • {classCutinTone.callout}</Text>
          )}
        </View>
      )}

      {/* Header */}
      <View style={styles.headerCompact}>
        <View style={styles.headerTopRow}>
          <View style={styles.identityCluster}>
            <Text style={styles.playerLabel}>{state.playerName}</Text>
            <Text style={styles.classLabel}>{stats.className} • Lv {state.level} • @{accountName}</Text>
          </View>
          <View style={styles.headerActionRow}>
            <Pressable style={styles.headerActionBtn} onPress={() => setEventsOpen(true)}>
              <Text style={styles.headerActionBtnText}>🗓️</Text>
            </Pressable>
            <Pressable style={styles.headerActionBtn} onPress={() => setSettingsOpen(true)}>
              <Text style={styles.headerActionBtnText}>⚙️</Text>
            </Pressable>
            <Pressable style={[styles.headerActionBtn, styles.headerActionBtnLogout]} onPress={onLogout}>
              <Text style={styles.headerActionBtnText}>⎋</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView horizontal={true} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statChipRail}>
          {topStatChips.map(chip => (
            <View key={chip.id} style={styles.statChip}>
              <Text style={styles.statChipLabel}>{chip.label}</Text>
              <Text style={styles.statChipValue}>{chip.value}</Text>
            </View>
          ))}
          {state.unspentStatPoints > 0 && (
            <View style={[styles.statChip, styles.statChipHighlight]}>
              <Text style={styles.statChipLabel}>Spend</Text>
              <Text style={[styles.statChipValue, styles.statChipValueWarn]}>+{state.unspentStatPoints} Pts</Text>
            </View>
          )}
        </ScrollView>
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
          <Text style={styles.nextStepTitle}>Command Recommendations</Text>
          <Pressable style={styles.nextStepBtn} onPress={() => onTabChange(nextGuidance.tab)}>
            <Text style={styles.nextStepBtnText}>Open</Text>
          </Pressable>
        </View>
        <Pressable style={styles.nextStepItem} onPress={() => onTabChange(nextGuidance.tab)}>
          <View style={styles.nextStepItemTop}>
            <Text style={styles.nextStepItemIndex}>1</Text>
            <Text style={styles.nextStepItemTitle}>{nextGuidance.title}</Text>
          </View>
          <Text style={styles.nextStepItemDetail}>{nextGuidance.detail}</Text>
        </Pressable>
        {extraGuidanceCount > 0 && (
          <Text style={styles.nextStepMore}>+{extraGuidanceCount} more recommendations available after this action.</Text>
        )}
      </View>

      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        style={styles.metaStripScroll}
        contentContainerStyle={styles.metaStripRail}
      >
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Campaign</Text>
          <Text style={styles.metaChipValue}>Ch {campaignChapter} • {campaignStage}/{campaignBossStage}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Season</Text>
          <Text style={styles.metaChipValue}>{seasonRank} • {fmt(seasonScore)}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Order</Text>
          <Text style={styles.metaChipValue}>{guildRank}</Text>
        </View>
        <View style={styles.metaChip}>
          <Text style={styles.metaChipLabel}>Power Tier</Text>
          <Text style={styles.metaChipValue}>{powerTier}</Text>
        </View>
        <Pressable style={[styles.metaChip, styles.metaChipAction]} onPress={() => setChapterMapOpen(true)}>
          <Text style={styles.metaChipLabel}>Campaign Map</Text>
          <Text style={styles.metaChipValue}>Open Route</Text>
        </Pressable>
      </ScrollView>

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
        {isBossImminent && !isBoss && <Text style={styles.bossImminentText}>⚠️ Boss Approaching</Text>}
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
                    <Pressable
                      style={styles.formationBadge}
                      onPress={() => {
                        const roles: Array<'front' | 'mid' | 'back'> = ['front', 'mid', 'back'];
                        const cur = state.heroFormationByUid[heroId] ?? (hero.heroClass === 'warrior' || hero.heroClass === 'berserker' ? 'front' : hero.heroClass === 'archer' || hero.heroClass === 'mage' ? 'back' : 'mid');
                        const next = roles[(roles.indexOf(cur) + 1) % roles.length];
                        setHeroFormation(heroId, next);
                      }}
                    >
                      <Text style={styles.formationBadgeText}>
                        {(state.heroFormationByUid[heroId] ?? (hero.heroClass === 'warrior' || hero.heroClass === 'berserker' ? 'front' : hero.heroClass === 'archer' || hero.heroClass === 'mage' ? 'back' : 'mid')) === 'front' ? '🛡️ Front' : (state.heroFormationByUid[heroId] ?? 'mid') === 'mid' ? '⚔️ Mid' : '🏹 Back'}
                      </Text>
                    </Pressable>
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

            <View style={styles.campaignRail}>
              <View style={styles.campaignRailCard}>
                <Text style={styles.campaignRailLabel}>Campaign</Text>
                <Text style={styles.campaignRailValue}>Chapter {campaignChapter} • Stage {campaignStage}</Text>
                <View style={styles.hpBarBg}>
                  <View style={[styles.hpBarFill, { width: `${(campaignStage / campaignBossStage) * 100}%`, backgroundColor: '#5DA8FF' }]} />
                </View>
              </View>
              <View style={styles.campaignRailCard}>
                <Text style={styles.campaignRailLabel}>Boss Gate</Text>
                <Text style={styles.campaignRailValue}>Stage {campaignBossStage} • Every 10 Waves</Text>
                <Text style={styles.campaignRailHint}>{isBossImminent ? 'Pressure Rising' : 'Stabilize & Push'}</Text>
              </View>
              <View style={styles.campaignRailCard}>
                <Text style={styles.campaignRailLabel}>Legion Score</Text>
                <Text style={styles.campaignRailValue}>{fmt(teamPowerIndex)} ({powerTier})</Text>
                <Text style={styles.campaignRailHint}>Aim for next tier via gear + mastery</Text>
              </View>
            </View>

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
                  <View style={styles.warPanelActionRow}>
                    <Pressable
                      style={[styles.warPanelActionBtn, !hasClaimableRewards && styles.warPanelActionBtnDisabled]}
                      disabled={!hasClaimableRewards}
                      onPress={claimAllRewards}
                    >
                      <Text style={styles.warPanelActionText}>Claim All ({claimableWeeklyMilestones.length + claimableMissionIds.length})</Text>
                    </Pressable>
                    <Pressable style={styles.warPanelActionBtn} onPress={() => onTabChange('achievements')}>
                      <Text style={styles.warPanelActionText}>Open Objectives</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.warPanel}>
              <Pressable style={styles.warPanelHeader} onPress={() => toggleWarPanel('prestige')}>
                <Text style={styles.warPanelTitle}>♾️ Prestige Milestones</Text>
                <Text style={styles.warPanelChevron}>{warPanels.prestige ? '−' : '+'}</Text>
              </Pressable>
              {warPanels.prestige && (
                <View style={styles.warPanelBody}>
                  <Text style={styles.warPanelStat}>Rebirths Completed: {state.prestigeCount ?? 0}</Text>
                  {[
                    { n: 1, label: '1st Rebirth', bonus: 'Unlock Core Tree', done: prestige1Done },
                    { n: 5, label: '5th Rebirth', bonus: '+5% all stats', done: prestige5Done },
                    { n: 10, label: '10th Rebirth', bonus: 'Legendary Aura visual', done: prestige10Done },
                    { n: 25, label: '25th Rebirth', bonus: '+15% core efficiency', done: prestige25Done },
                    { n: 50, label: '50th Rebirth', bonus: 'Grand Ascendant title', done: prestige50Done },
                  ].map(m => (
                    <View key={m.n} style={styles.prestigeMilestoneRow}>
                      <Text style={[styles.prestigeMilestoneCheck, m.done && styles.prestigeMilestoneDone]}>{m.done ? '✅' : '○'}</Text>
                      <View>
                        <Text style={styles.prestigeMilestoneLabel}>{m.label}</Text>
                        <Text style={styles.prestigeMilestoneBonus}>{m.bonus}</Text>
                      </View>
                    </View>
                  ))}
                  <View style={styles.warPanelActionRow}>
                    <Pressable
                      style={[styles.warPanelActionBtn, !canRebirthNow && styles.warPanelActionBtnDisabled]}
                      disabled={!canRebirthNow}
                      onPress={() => setRebirthOpen(true)}
                    >
                      <Text style={styles.warPanelActionText}>{canRebirthNow ? 'Rebirth Now' : `Rebirth @ W${REBIRTH_WAVE_THRESHOLD}`}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {tab === 'battle' && (
          <View style={styles.battleTab}>
            <Text style={styles.sectionTitle}>⚔️ Battle Overview</Text>

            <View style={styles.battleTempoCard}>
              <View style={styles.battleTempoHeader}>
                <Text style={styles.battleTempoTitle}>Combat Tempo</Text>
                <View style={styles.battleTempoRow}>
                  {([1, 2, 4] as const).map(mult => (
                    <Pressable
                      key={mult}
                      style={[styles.battleTempoBtn, battleSpeed === mult && styles.battleTempoBtnActive]}
                      onPress={() => setBattleSpeed(mult)}
                    >
                      <Text style={[styles.battleTempoBtnText, battleSpeed === mult && styles.battleTempoBtnTextActive]}>{mult}x</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.burstRow}>
                <View style={styles.burstInfo}>
                  <Text style={styles.burstTitle}>Burst Gauge</Text>
                  <Text style={styles.burstSub}>Charge from kills • consume for rapid strikes</Text>
                </View>
                <Pressable
                  style={[styles.burstBtn, !canBurst && styles.burstBtnDisabled]}
                  disabled={!canBurst}
                  onPress={() => {
                    const hits = 4 * battleSpeed;
                    for (let i = 0; i < hits; i += 1) attack();
                    setUltimateTagline('LIMIT BREAK');
                    setMomentCue('ultimate');
                    setTimeout(() => setMomentCue('none'), 700);
                  }}
                >
                  <Text style={styles.burstBtnText}>{canBurst ? `Burst x${4 * battleSpeed}` : 'Charging'}</Text>
                </Pressable>
              </View>
              <View style={styles.hpBarBg}>
                <View style={[styles.hpBarFill, { width: `${burstChargePct}%`, backgroundColor: '#FFB347' }]} />
              </View>
            </View>

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
              <Text style={styles.sectionHelperText}>Automation toggles moved to Settings.</Text>
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
            <View style={styles.subTabBar}>
              {(['summon', 'roster', 'forge'] as const).map(st => (
                <Pressable key={st} style={[styles.subTabBtn, heroesSubTab === st && styles.subTabBtnActive]} onPress={() => setHeroesSubTab(st)}>
                  <Text style={[styles.subTabBtnText, heroesSubTab === st && styles.subTabBtnTextActive]}>
                    {st === 'summon' ? 'Summon Bay' : st === 'roster' ? 'Roster' : 'Forge'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {heroesSubTab === 'summon' && (
              <View style={styles.gachaSection}>
                <Text style={styles.sectionTitle}>✨ Gacha Summon</Text>
                <View style={styles.featuredSummonCard}>
                  <Text style={styles.featuredSummonTitle}>🌌 Featured Banner: Astral Vanguard</Text>
                  <Text style={styles.featuredSummonDesc}>Higher odds for EPIC+ drops during this rotation. Mythic trigger creates full-screen flash.</Text>
                  <View style={styles.featuredSummonMeterRow}>
                    <Text style={styles.featuredSummonMeterLabel}>Legendary Pity</Text>
                    <Text style={styles.featuredSummonMeterValue}>{state.gachaPityCounter}/30</Text>
                  </View>
                  <View style={styles.hpBarBg}>
                    <View style={[styles.hpBarFill, { width: `${Math.min(100, (state.gachaPityCounter / 30) * 100)}%`, backgroundColor: '#C77DFF' }]} />
                  </View>
                  <Pressable
                    style={[styles.featuredSummonBtn, !canGachaX10 && styles.featuredSummonBtnDisabled]}
                    disabled={!canGachaX10}
                    onPress={summonHeroX10}
                  >
                    <Text style={styles.featuredSummonBtnText}>Cinematic x10 Summon</Text>
                  </Pressable>
                </View>
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
                        return <View key={entry.id} style={[styles.timelineDot, { backgroundColor: rarity.color }]} />;
                      })
                    )}
                  </View>
                </View>
              </View>
            )}

            {heroesSubTab === 'forge' && (
              <>
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
                <Text style={styles.sectionHelperText}>All automation toggles are in ⚙️ Settings.</Text>
              </>
            )}

            {heroesSubTab === 'roster' && (
              <>
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
                const faction = hero.heroClass === 'warrior' || hero.heroClass === 'berserker'
                  ? 'Vanguard'
                  : hero.heroClass === 'archer'
                    ? 'Ranger'
                    : hero.heroClass === 'mage'
                      ? 'Arcanum'
                      : 'Aegis';
                    return (
                      <View key={hero.uid} style={[styles.heroCard, inActiveTeam && styles.heroCardActive]}>
                    <View style={[styles.heroCardRarityBar, { backgroundColor: rarity.color }]} />
                    <View style={styles.heroCardBody}>
                      {/* Main row */}
                      <View style={styles.heroCardTopRow}>
                        <View style={[styles.heroPortraitFrame, { borderColor: rarity.color }]}>
                          <Text style={styles.heroEmoji}>{hero.emoji}</Text>
                        </View>
                        <View style={styles.heroCardInfo}>
                          <Text style={styles.heroName}>{hero.name}</Text>
                          <Text style={styles.heroDetail}>
                            <Text style={{ color: rarity.color }}>{hero.rarity}</Text>
                            {' • '}{cls.name}
                          </Text>
                          <View style={styles.heroTagRow}>
                            <Text style={styles.heroFactionTag}>{faction}</Text>
                            <Text style={styles.heroArchetypeTag}>{activeArchetype.name}</Text>
                          </View>
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
              </>
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

            <View style={styles.masteryCard}>
              <Text style={styles.masteryTitle}>⚡ Class Mastery: {stats.className}</Text>
              <Text style={styles.masteryLevel}>Mastery Level {classMasteryLevel} <Text style={styles.masteryLevelSub}>(1 level per 100 mastery XP)</Text></Text>
              <View style={styles.hpBarBg}>
                <View style={[styles.hpBarFill, { width: `${((state.playerClass ? state.classMasteryXp[state.playerClass] : 0) % 100)}%`, backgroundColor: '#7BD9A8' }]} />
              </View>
              <Text style={styles.masteryHint}>{(state.playerClass ? state.classMasteryXp[state.playerClass] : 0) % 100}/100 mastery XP to next level</Text>
              {[
                { lvl: 1, perk: '+10% class stat bonus', done: classMasteryLevel >= 1 },
                { lvl: 5, perk: '+5% gold gains', done: classMasteryLevel >= 5 },
                { lvl: 10, perk: '+15% DPS from passive skills', done: classMasteryLevel >= 10 },
                { lvl: 25, perk: 'Mastery Aura: team-wide +8% HP', done: classMasteryLevel >= 25 },
                { lvl: 50, perk: 'Grand Mastery: unlock legendary passive', done: classMasteryLevel >= 50 },
              ].map(m => (
                <View key={m.lvl} style={styles.masteryMilestoneRow}>
                  <Text style={[styles.masteryMilestoneCheck, m.done && styles.masteryMilestoneDone]}>{m.done ? '✅' : '○'}</Text>
                  <View>
                    <Text style={styles.masteryMilestoneLvl}>Lv {m.lvl}</Text>
                    <Text style={styles.masteryMilestonePerk}>{m.perk}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {tab === 'equipment' && (
          <View style={styles.equipmentTab}>
            <View style={styles.equipHeaderRow}>
              <Text style={styles.sectionTitle}>🎒 Equipment Inventory</Text>
              <Pressable style={styles.equipOptimizeBtnHeader} onPress={optimizeEquipment}>
                <Text style={styles.equipOptimizeBtnHeaderText}>⚡ Optimize</Text>
              </Pressable>
            </View>
            <View style={styles.subTabBar}>
              {(['inventory', 'craft'] as const).map(st => (
                <Pressable key={st} style={[styles.subTabBtn, equipmentSubTab === st && styles.subTabBtnActive]} onPress={() => setEquipmentSubTab(st)}>
                  <Text style={[styles.subTabBtnText, equipmentSubTab === st && styles.subTabBtnTextActive]}>
                    {st === 'inventory' ? 'Inventory' : 'Crafting'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.equipInventoryCount}>
              Total: {state.inventoryItemIds.length} items • Shards: <Text style={{ color: '#FFB347' }}>{state.heroShards}</Text>
            </Text>
            <Text style={styles.scrapLabel}>🔩 Scrap: {fmt(state.equipmentScrap)}</Text>
            <Text style={styles.mythicTierLabel}>
              Mythic Tier: {state.permanentUnlocks.includes('mythic_equipment') ? 'Unlocked' : 'Locked (Defeat Act 3 Boss)'}
            </Text>
            {equipmentSubTab === 'inventory' && (
              <View style={styles.equipOptimizeRow}>
                <Pressable style={styles.equipOptimizeBtn} onPress={optimizeEquipment}>
                  <Text style={styles.equipOptimizeBtnText}>⚡ Optimize Gear</Text>
                </Pressable>
                <Text style={styles.equipOptimizeHint}>Auto-equips best item per slot</Text>
              </View>
            )}
            {equipmentSubTab === 'craft' && (
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
            )}
            {equipmentSubTab === 'inventory' && state.inventoryItemIds.length === 0 ? (
              <Text style={styles.emptyMsg}>No equipment yet! Kill monsters to find better gear.</Text>
            ) : equipmentSubTab === 'inventory' ? (
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
                          <>
                            <Pressable style={styles.equipNowBtn} onPress={() => equipItem(item.id)}>
                              <Text style={styles.equipNowBtnText}>Equip</Text>
                            </Pressable>
                            <Pressable style={styles.compareBtn} onPress={() => setCompareItemId(compareItemId === item.id ? null : item.id)}>
                              <Text style={styles.compareBtnText}>vs</Text>
                            </Pressable>
                          </>
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
                      {!isEquipped && compareItemId === item.id && (() => {
                        const curId = state.equippedItems[item.slot as EquipmentSlot];
                        const curItem = curId ? getEquipmentItem(curId) : null;
                        const allStats = ['strength', 'vitality', 'agility', 'intelligence', 'spirit'] as const;
                        return (
                          <View style={styles.comparePanel}>
                            <Text style={styles.comparePanelTitle}>vs Current: {curItem ? `${curItem.name} (${curItem.rarity})` : 'Empty slot'}</Text>
                            <View style={styles.compareStatRow}>
                              {allStats.map(stat => {
                                const nv = item.bonus[stat] ?? 0;
                                const cv = curItem?.bonus[stat] ?? 0;
                                const diff = nv - cv;
                                if (nv === 0 && cv === 0) return null;
                                return (
                                  <Text key={stat} style={[
                                    styles.compareStat,
                                    diff > 0 ? styles.compareStatUp : diff < 0 ? styles.compareStatDown : styles.compareStatNeutral,
                                  ]}>
                                    {stat.slice(0, 3).toUpperCase()}: {diff >= 0 ? '+' : ''}{diff}
                                  </Text>
                                );
                              })}
                            </View>
                          </View>
                        );
                      })()}
                      {!isEquipped && (
                        <Pressable style={styles.dismantleBtn} onPress={() => dismantleEquipment(item.id)}>
                          <Text style={styles.dismantleBtnText}>Dismantle</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.sectionHelperText}>Select Inventory to manage equipped items and upgrades.</Text>
            )}
          </View>
        )}

        {tab === 'achievements' && (
          <View style={styles.achievementsTab}>
            <View style={styles.subTabBar}>
              {(['overview', 'weekly', 'missions', 'achievements', 'collection', 'codex'] as const).map(st => (
                <Pressable key={st} style={[styles.subTabBtn, achievementsSubTab === st && styles.subTabBtnActive]} onPress={() => setAchievementsSubTab(st)}>
                  <Text style={[styles.subTabBtnText, achievementsSubTab === st && styles.subTabBtnTextActive]}>
                    {st === 'overview' ? 'Overview' : st === 'weekly' ? 'Weekly' : st === 'missions' ? 'Missions' : st === 'achievements' ? 'Records' : st === 'collection' ? 'Collection' : 'Codex'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'weekly' || achievementsSubTab === 'missions') && (
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
                <View style={styles.claimAllRow}>
                  <Text style={styles.claimAllInfo}>Claimable: {claimableWeeklyMilestones.length + claimableMissionIds.length}</Text>
                  <Pressable
                    style={[styles.claimAllBtn, !hasClaimableRewards && styles.claimAllBtnDisabled]}
                    disabled={!hasClaimableRewards}
                    onPress={claimAllRewards}
                  >
                    <Text style={styles.claimAllBtnText}>Claim All Rewards</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'weekly') && (
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
            )}

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'missions') && (
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
            )}

            {(achievementsSubTab === 'overview' || achievementsSubTab === 'achievements') && <Text style={styles.sectionTitle}>🏆 Achievements</Text>}
            {(achievementsSubTab === 'overview' || achievementsSubTab === 'achievements') && ACHIEVEMENTS.map(ach => {
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

            {achievementsSubTab === 'collection' && (
              <View>
                <Text style={styles.sectionTitle}>📚 Collection Log</Text>
                <Text style={styles.sectionHelperText}>Track everything you've collected. Completion grants bonus power.</Text>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>👥 Heroes</Text>
                  <Text style={styles.collectionStat}>{state.heroRoster.length} heroes summoned</Text>
                  {(['common','rare','epic','legendary','mythic'] as const).map(r => {
                    const count = state.heroRoster.filter(h => h.rarity === r).length;
                    return count > 0 ? (
                      <Text key={r} style={styles.collectionStat}> • {r}: {count}</Text>
                    ) : null;
                  })}
                  {state.heroRoster.length >= 10 && <Text style={styles.collectionBonus}>✅ Bonus: +5% team DPS</Text>}
                  {state.heroRoster.length >= 25 && <Text style={styles.collectionBonus}>✅ Bonus: +10% hero boost</Text>}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>🎒 Equipment</Text>
                  <Text style={styles.collectionStat}>{state.inventoryItemIds.length} items held</Text>
                  <Text style={styles.collectionStat}>{Object.values(state.equippedItems).filter(Boolean).length} / 3 slots filled</Text>
                  {state.permanentUnlocks.includes('mythic_equipment') && <Text style={styles.collectionBonus}>✅ Mythic Tier Unlocked</Text>}
                  {!state.permanentUnlocks.includes('mythic_equipment') && <Text style={styles.collectionHint}>🔒 Defeat Act 3 Boss to unlock Mythic</Text>}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>👑 Bosses Defeated</Text>
                  <Text style={styles.collectionStat}>Highest wave: {state.wave}</Text>
                  <Text style={styles.collectionStat}>Boss waves cleared: {Math.floor(state.wave / 10)}</Text>
                  {Math.floor(state.wave / 10) >= 5 && <Text style={styles.collectionBonus}>✅ Boss Veteran: +5% gold</Text>}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>🔓 Unlocks & Relics</Text>
                  {state.permanentUnlocks.length === 0 ? (
                    <Text style={styles.collectionStat}>No unlocks yet. Defeat bosses to progress.</Text>
                  ) : (
                    state.permanentUnlocks.map(u => (
                      <Text key={u} style={styles.collectionBonus}>✅ {u.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                    ))
                  )}
                </View>

                <View style={styles.collectionCard}>
                  <Text style={styles.collectionCardTitle}>♾️ Rebirths</Text>
                  <Text style={styles.collectionStat}>Times ascended: {state.prestigeCount ?? 0}</Text>
                  <Text style={styles.collectionStat}>Rebirth Cores: {state.rebirthCores}</Text>
                  {(state.prestigeCount ?? 0) >= 1 && <Text style={styles.collectionBonus}>✅ First Rebirth: Unlocked Core Tree</Text>}
                  {(state.prestigeCount ?? 0) >= 5 && <Text style={styles.collectionBonus}>✅ Veteran: +5% core efficiency</Text>}
                </View>
              </View>
            )}

            {achievementsSubTab === 'codex' && (
              <View>
                <Text style={styles.sectionTitle}>📖 Legacy Codex</Text>
                <Text style={styles.sectionHelperText}>Long-term milestones that define your legend. Each grants a permanent title.</Text>
                {[
                  { id: 'codex_wave100', title: 'Warlord', desc: 'Reach Wave 100', done: state.wave >= 100, reward: 'Title: Warlord' },
                  { id: 'codex_wave500', title: 'Conqueror', desc: 'Reach Wave 500', done: state.wave >= 500, reward: 'Title: Conqueror' },
                  { id: 'codex_wave1000', title: 'Legend', desc: 'Reach Wave 1000', done: state.wave >= 1000, reward: 'Title: Legend' },
                  { id: 'codex_rebirth1', title: 'Reborn', desc: 'Complete 1 Rebirth', done: (state.prestigeCount ?? 0) >= 1, reward: 'Title: Reborn' },
                  { id: 'codex_rebirth10', title: 'Eternal', desc: 'Complete 10 Rebirths', done: (state.prestigeCount ?? 0) >= 10, reward: 'Title: Eternal' },
                  { id: 'codex_rebirth25', title: 'Immortal', desc: 'Complete 25 Rebirths', done: (state.prestigeCount ?? 0) >= 25, reward: 'Title: Immortal' },
                  { id: 'codex_heroes25', title: 'Commander', desc: 'Summon 25 heroes', done: state.heroRoster.length >= 25, reward: 'Title: Commander' },
                  { id: 'codex_ach10', title: 'Achiever', desc: 'Unlock 10 achievements', done: state.achievements.size >= 10, reward: 'Title: Achiever' },
                  { id: 'codex_allunlocks', title: 'Sovereign', desc: 'Collect all permanent unlocks', done: state.permanentUnlocks.length >= 5, reward: 'Title: Sovereign' },
                  { id: 'codex_streak30', title: 'Devoted', desc: 'Maintain a 30-day login streak', done: (state.dailyLoginStreak ?? 0) >= 30, reward: 'Title: Devoted' },
                ].map(entry => (
                  <View key={entry.id} style={[styles.codexEntry, entry.done && styles.codexEntryDone]}>
                    <View style={styles.codexEntryLeft}>
                      <Text style={[styles.codexTitle, entry.done && styles.codexTitleDone]}>{entry.done ? '✅' : '🔒'} {entry.title}</Text>
                      <Text style={styles.codexDesc}>{entry.desc}</Text>
                      <Text style={styles.codexReward}>{entry.reward}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {rewardPopup && !idleChestReady && (
        <Pressable style={[styles.rewardToast, styles.rewardToastActive]} onPress={clearRewardPopup}>
          <Text style={styles.rewardToastSparkle}>✨</Text>
          <View>
            <Text style={styles.rewardToastTitle}>{rewardPopup.title}</Text>
            <Text style={styles.rewardToastDetail}>{rewardPopup.detail}</Text>
          </View>
          <Text style={styles.rewardToastSparkle}>✨</Text>
        </Pressable>
      )}

      {idleChestReady && idleChestReward && (
        <Pressable
          style={styles.idleChestPopIn}
          onPress={() => {
            setIdleChestOpen(true);
            setIdleChestReady(false);
          }}
        >
          <Text style={styles.idleChestEmoji}>🎁</Text>
          <View style={styles.idleChestInfo}>
            <Text style={styles.idleChestTitle}>Idle Rewards Ready</Text>
            <Text style={styles.idleChestDetail}>Tap to open your return chest</Text>
          </View>
          <Text style={styles.idleChestOpenText}>Open</Text>
        </Pressable>
      )}

      {/* Achievement Toast */}
      <AchievementToast
        achievementId={state.newAchievement}
        onDismiss={clearAchievement}
      />

      <Modal
        visible={chapterMapOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setChapterMapOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.chapterMapModalBox}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>🧭 Campaign Route</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setChapterMapOpen(false)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.chapterMapSubtitle}>Chapter {campaignChapter} • Stage {campaignStage}/{campaignBossStage}</Text>
            <View style={styles.chapterNodesWrap}>
              {Array.from({ length: campaignBossStage }, (_, i) => i + 1).map(stage => {
                const done = stage < campaignStage;
                const active = stage === campaignStage;
                const boss = stage === campaignBossStage;
                const chest = !boss && stage % 5 === 0;
                return (
                  <View
                    key={stage}
                    style={[
                      styles.chapterNode,
                      done && styles.chapterNodeDone,
                      active && styles.chapterNodeActive,
                      boss && styles.chapterNodeBoss,
                    ]}
                  >
                    <Text style={styles.chapterNodeText}>{boss ? '👑' : chest ? '🎁' : stage}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={styles.chapterMapHint}>Every 5 stages: chest node • Stage 20: boss gate</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={idleChestOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setIdleChestOpen(false);
          setIdleChestReward(null);
          clearRewardPopup();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.idleChestModalBox}>
            <Text style={styles.idleChestModalTitle}>🎁 Return Chest</Text>
            <Text style={styles.idleChestModalLine}>{idleChestReward?.title ?? 'Offline Progress'}</Text>
            <Text style={styles.idleChestModalLine}>{idleChestReward?.detail ?? ''}</Text>
            <Pressable
              style={styles.idleChestClaimBtn}
              onPress={() => {
                setIdleChestOpen(false);
                setIdleChestReward(null);
                clearRewardPopup();
              }}
            >
              <Text style={styles.idleChestClaimText}>Claim Rewards</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Events Modal */}
      <Modal
        visible={eventsOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEventsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.eventsModalBox}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>🗓️ Events & Seasons</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setEventsOpen(false)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.settingsScroll}>

              {/* Streak Insurance */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🔥 Login Streak</Text>
                <Text style={styles.eventsStatLine}>Current Streak: {state.dailyLoginStreak ?? 0} days</Text>
                <Text style={styles.eventsStatLine}>Streak Insurance Charges: {state.streakInsuranceCharges}</Text>
                <View style={styles.hpBarBg}>
                  <View style={[styles.hpBarFill, { width: `${Math.min(100, ((state.dailyLoginStreak ?? 0) / 30) * 100)}%`, backgroundColor: '#FFB347' }]} />
                </View>
                <Text style={styles.eventsHint}>{Math.max(0, 30 - (state.dailyLoginStreak ?? 0))} days to streak milestone (30 days). Gain +1 insurance every 7-day streak.</Text>
              </View>

              {/* Daily Quest Chain */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>📋 Daily Chain</Text>
                <Text style={styles.eventsSubtitle}>Complete all 3 for bonus essence cache</Text>
                {[
                  { id: 'd1', title: 'Wave Pusher', desc: `Defeat ${Math.ceil(state.wave / 10) * 10 + 10} waves`, progress: state.wave, target: Math.ceil(state.wave / 10) * 10 + 10, reward: '10 Shards' },
                  { id: 'd2', title: 'Recruiter', desc: 'Have 5 heroes in your roster', progress: state.heroRoster.length, target: 5, reward: '200 Gold' },
                  { id: 'd3', title: 'Gear Up', desc: 'Fill all 3 equipment slots', progress: Object.values(state.equippedItems).filter(Boolean).length, target: 3, reward: '50 Scrap' },
                ].map(q => {
                  const done = q.progress >= q.target;
                  return (
                    <View key={q.id} style={[styles.dailyQuestRow, done && styles.dailyQuestRowDone]}>
                      <Text style={styles.dailyQuestCheck}>{done ? '✅' : '○'}</Text>
                      <View style={styles.dailyQuestInfo}>
                        <Text style={styles.dailyQuestTitle}>{q.title}</Text>
                        <Text style={styles.dailyQuestDesc}>{q.desc}</Text>
                        <Text style={styles.dailyQuestProgress}>{Math.min(q.progress, q.target)}/{q.target}</Text>
                        <View style={styles.hpBarBg}>
                          <View style={[styles.hpBarFill, { width: `${Math.min(100, (q.progress / q.target) * 100)}%`, backgroundColor: done ? '#6DDB7B' : '#5DA8FF' }]} />
                        </View>
                      </View>
                      <Text style={styles.dailyQuestReward}>{q.reward}</Text>
                    </View>
                  );
                })}
              </View>

              {/* Weekly Event */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>{weeklyEvent.emoji} Weekly Event: {weeklyEvent.name}</Text>
                <Text style={styles.eventsStatLine}>{weeklyEvent.description}</Text>
                <Text style={styles.eventsStatLine}>Weekly Kills: {state.weeklyKills}</Text>
                <Text style={styles.eventsHint}>Earn kills to claim milestone rewards on the Achievements tab.</Text>
                <Pressable style={styles.eventsActionBtn} onPress={() => { setEventsOpen(false); onTabChange('achievements'); setAchievementsSubTab('weekly'); }}>
                  <Text style={styles.eventsActionBtnText}>View Weekly Track</Text>
                </Pressable>
              </View>

              {/* Seasonal Ladder */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>🏆 Season Ladder</Text>
                <Text style={styles.eventsSubtitle}>Season score: {fmt(seasonScore)} pts</Text>
                <Text style={styles.eventsStatLine}>Best this season: {fmt(state.bestSeasonPoints)} pts</Text>
                <Text style={[styles.seasonRankBadge]}>{seasonRank}</Text>
                <Text style={styles.eventsHint}>Score based on wave progression + rebirths. Top ranks earn cosmetic banners at season end.</Text>
                {[
                  { rank: '🥉 Bronze', threshold: 0, banner: 'Iron Commander' },
                  { rank: '🥈 Silver', threshold: 1000, banner: 'Silver Vanguard' },
                  { rank: '🥇 Gold', threshold: 5000, banner: 'Gold Legion' },
                  { rank: '💎 Diamond', threshold: 15000, banner: 'Diamond Warlord' },
                  { rank: '👑 Legend', threshold: 40000, banner: 'Eternal Legend' },
                ].map(tier => (
                  <View key={tier.rank} style={[styles.ladderTierRow, seasonScore >= tier.threshold && styles.ladderTierActive]}>
                    <Text style={styles.ladderTierRank}>{tier.rank}</Text>
                    <Text style={styles.ladderTierInfo}>{tier.threshold > 0 ? `${fmt(tier.threshold)} pts` : 'Start'} — Banner: {tier.banner}</Text>
                  </View>
                ))}
              </View>

              {/* Formation Info */}
              <View style={styles.eventsCard}>
                <Text style={styles.eventsCardTitle}>⚔️ Formation Bonuses</Text>
                <Text style={styles.eventsSubtitle}>Assign hero roles in your active team (tap badge to cycle)</Text>
                {[
                  { role: '🛡️ Front', perk: '+20% HP for this hero' },
                  { role: '⚔️ Mid', perk: '+10% DPS, balanced' },
                  { role: '🏹 Back', perk: '+15% DPS, takes less damage' },
                ].map(row => (
                  <View key={row.role} style={styles.formationInfoRow}>
                    <Text style={styles.formationInfoRole}>{row.role}</Text>
                    <Text style={styles.formationInfoPerk}>{row.perk}</Text>
                  </View>
                ))}
              </View>

            </ScrollView>
          </View>
        </View>
      </Modal>

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

      <Modal
        visible={settingsOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModalBox}>
            <View style={styles.settingsHeaderRow}>
              <Text style={styles.modalTitle}>⚙️ Settings & Automation</Text>
              <Pressable style={styles.settingsCloseBtn} onPress={() => setSettingsOpen(false)}>
                <Text style={styles.settingsCloseBtnText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.settingsScroll}>
              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Potion</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoUsePotionEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => setAutoUsePotion(!state.autoUsePotionEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoUsePotionEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Trigger HP</Text>
                  <View style={styles.settingsAdjustWrap}>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct - 0.05)}>
                      <Text style={styles.autoPotionAdjustText}>-</Text>
                    </Pressable>
                    <Text style={styles.settingsValueText}>{(state.autoUsePotionThresholdPct * 100).toFixed(0)}%</Text>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoUsePotionThreshold(state.autoUsePotionThresholdPct + 0.05)}>
                      <Text style={styles.autoPotionAdjustText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Recycle</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoRecycleEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => setAutoRecycleEnabled(!state.autoRecycleEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoRecycleEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Max Rarity</Text>
                  <Pressable style={styles.settingsCycleBtn} onPress={cycleAutoRecycleRarity}>
                    <Text style={styles.settingsCycleBtnText}>{state.autoRecycleMaxRarity.toUpperCase()}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.settingsCard}>
                <Text style={styles.settingsCardTitle}>Auto Summon</Text>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Enabled</Text>
                  <Pressable
                    style={[styles.settingsToggleBtn, state.autoSummonEnabled && styles.settingsToggleBtnActive]}
                    onPress={() => setAutoSummonEnabled(!state.autoSummonEnabled)}
                  >
                    <Text style={styles.settingsToggleText}>{state.autoSummonEnabled ? 'ON' : 'OFF'}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Mode</Text>
                  <Pressable style={styles.settingsCycleBtn} onPress={() => setAutoSummonMode(state.autoSummonMode === 'single' ? 'x10' : 'single')}>
                    <Text style={styles.settingsCycleBtnText}>{state.autoSummonMode.toUpperCase()}</Text>
                  </Pressable>
                </View>
                <View style={styles.settingsRowBetween}>
                  <Text style={styles.settingsLabel}>Reserve Gold</Text>
                  <View style={styles.settingsAdjustWrap}>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoSummonReserveGold(state.autoSummonReserveGold - 1000)}>
                      <Text style={styles.autoPotionAdjustText}>-</Text>
                    </Pressable>
                    <Text style={styles.settingsValueText}>{fmt(state.autoSummonReserveGold)}</Text>
                    <Pressable style={styles.autoPotionAdjustBtn} onPress={() => setAutoSummonReserveGold(state.autoSummonReserveGold + 1000)}>
                      <Text style={styles.autoPotionAdjustText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

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
  momentCueOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentCueMythic: {
    backgroundColor: 'rgba(130, 60, 10, 0.28)',
  },
  momentCueBoss: {
    backgroundColor: 'rgba(120, 10, 18, 0.25)',
  },
  momentCueRebirth: {
    backgroundColor: 'rgba(255, 90, 138, 0.22)',
  },
  momentCueUltimate: {
    backgroundColor: 'rgba(20, 28, 44, 0.5)',
  },
  momentCueSlash: {
    width: 240,
    height: 12,
    transform: [{ rotate: '-11deg' }],
    borderRadius: 12,
    marginBottom: 8,
    opacity: 0.88,
  },
  momentCueText: {
    fontSize: 28,
    color: '#FFF4D6',
    fontWeight: '800',
    letterSpacing: 2,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  momentCueSubText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  summonRevealOverlay: {
    position: 'absolute',
    top: 88,
    left: 14,
    right: 14,
    zIndex: 5,
    alignItems: 'center',
  },
  summonRevealCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#101828',
    alignItems: 'center',
    paddingVertical: 10,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
    elevation: 10,
  },
  summonRevealLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#DCE8FF',
  },
  summonRevealEmoji: {
    fontSize: 28,
    marginTop: 2,
  },
  summonRevealName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F6F8FF',
  },
  summonRevealSub: {
    fontSize: 11,
    color: '#A9C0E8',
    marginTop: 2,
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
  headerCompact: {
    backgroundColor: '#0F1722',
    borderBottomWidth: 1,
    borderBottomColor: '#2F4358',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 7,
    zIndex: 1,
    gap: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  identityCluster: {
    flex: 1,
    minWidth: 0,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerActionBtn: {
    width: 28,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#1D2D41',
    borderWidth: 1,
    borderColor: '#345270',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionBtnLogout: {
    backgroundColor: '#2C2338',
    borderColor: '#614C84',
  },
  headerActionBtnText: {
    fontSize: 12,
    color: '#E6F1FF',
    fontWeight: '700',
  },
  statChipRail: {
    gap: 6,
    paddingRight: 8,
  },
  statChip: {
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#2F4760',
    backgroundColor: '#122131',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statChipHighlight: {
    borderColor: '#83602A',
    backgroundColor: '#2C2412',
  },
  statChipLabel: {
    fontSize: 9,
    color: '#8DB4D2',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  statChipValue: {
    fontSize: 11,
    color: '#E3F4FF',
    fontWeight: '700',
  },
  statChipValueWarn: {
    color: '#FBD484',
  },
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
  settingsBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#2E4363',
  },
  settingsBtnText: {
    fontSize: 10,
    color: '#E8F2FF',
    fontWeight: '700',
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
  nextStepItem: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#335646',
    backgroundColor: '#132A21',
  },
  nextStepItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  nextStepItemIndex: {
    width: 16,
    height: 16,
    textAlign: 'center',
    lineHeight: 16,
    borderRadius: 8,
    overflow: 'hidden',
    fontSize: 10,
    color: '#E8FFF3',
    backgroundColor: '#2D5744',
    fontWeight: '700',
  },
  nextStepItemTitle: {
    fontSize: 10,
    color: '#D5FBE9',
    fontWeight: '700',
  },
  nextStepItemDetail: {
    fontSize: 10,
    color: '#A6D9C2',
    lineHeight: 14,
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
  nextStepMore: {
    marginTop: 5,
    fontSize: 10,
    color: '#8FC7AE',
  },
  metaStripScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  metaStripRail: {
    marginHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingRight: 10,
  },
  metaChip: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#345470',
    backgroundColor: '#122131',
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  metaChipLabel: {
    fontSize: 9,
    color: '#8DB4D2',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  metaChipValue: {
    fontSize: 10,
    color: '#E3F4FF',
    fontWeight: '700',
  },
  metaChipAction: {
    borderColor: '#5D7EA0',
    backgroundColor: '#1A3048',
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
  uiModeCard: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#36506A',
    backgroundColor: '#111F2E',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  uiModeTitle: {
    fontSize: 11,
    color: '#D8EEFF',
    fontWeight: '700',
  },
  uiModeDesc: {
    fontSize: 10,
    color: '#9DBDD6',
    marginTop: 2,
  },
  uiModeBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5F9FCF',
    backgroundColor: '#23405A',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  uiModeBtnAlt: {
    borderColor: '#7CB08E',
    backgroundColor: '#2D5743',
  },
  uiModeBtnText: {
    fontSize: 10,
    color: '#E7F5FF',
    fontWeight: '700',
  },
  sectionToggle: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#35516D',
    backgroundColor: '#152536',
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  sectionToggleText: {
    fontSize: 10,
    color: '#CFE6FA',
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
  bossImminentText: {
    fontSize: 11,
    color: '#FF8FA6',
    fontWeight: '800',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
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
  subTabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  subTabBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3a5471',
    backgroundColor: '#16283B',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  subTabBtnActive: {
    borderColor: '#7fd0a6',
    backgroundColor: '#214435',
  },
  subTabBtnText: {
    fontSize: 10,
    color: '#b8d2e6',
    fontWeight: '700',
  },
  subTabBtnTextActive: {
    color: '#e6fff1',
  },
  sectionHelperText: {
    fontSize: 10,
    color: '#98b2c8',
    marginBottom: 8,
  },
  primaryActionBar: {
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#35516B',
    backgroundColor: '#132132',
    padding: 8,
  },
  primaryActionTitle: {
    fontSize: 10,
    color: '#B7D4EA',
    fontWeight: '700',
    marginBottom: 6,
  },
  primaryActionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryActionBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#567A9A',
    backgroundColor: '#1D3248',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  primaryActionBtnAccent: {
    borderColor: '#71BF9A',
    backgroundColor: '#214A3C',
  },
  primaryActionBtnDisabled: {
    opacity: 0.45,
  },
  primaryActionBtnText: {
    fontSize: 10,
    color: '#E5F1FA',
    fontWeight: '700',
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
  campaignRail: {
    gap: 8,
    marginBottom: 2,
  },
  campaignRailCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#39597A',
    backgroundColor: '#0F1E2E',
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  campaignRailLabel: {
    fontSize: 10,
    color: '#9ABED9',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  campaignRailValue: {
    fontSize: 12,
    color: '#E5F4FF',
    fontWeight: '700',
    marginBottom: 5,
  },
  campaignRailHint: {
    fontSize: 10,
    color: '#78A6C9',
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
  battleTempoCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5C6F87',
    backgroundColor: '#172432',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
  },
  battleTempoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  battleTempoTitle: {
    fontSize: 11,
    color: '#D9ECFF',
    fontWeight: '700',
  },
  battleTempoRow: {
    flexDirection: 'row',
    gap: 6,
  },
  battleTempoBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#536B86',
    backgroundColor: '#22364C',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  battleTempoBtnActive: {
    borderColor: '#8FD2FF',
    backgroundColor: '#2F5275',
  },
  battleTempoBtnText: {
    fontSize: 10,
    color: '#BFD7EC',
    fontWeight: '700',
  },
  battleTempoBtnTextActive: {
    color: '#EDFAFF',
  },
  burstRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  burstInfo: {
    flex: 1,
  },
  burstTitle: {
    fontSize: 10,
    color: '#FFDFA8',
    fontWeight: '700',
  },
  burstSub: {
    fontSize: 10,
    color: '#A7BDD4',
  },
  burstBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D18F45',
    backgroundColor: '#6C4323',
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  burstBtnDisabled: {
    opacity: 0.45,
  },
  burstBtnText: {
    fontSize: 10,
    color: '#FFECD0',
    fontWeight: '800',
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
  featuredSummonCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#694AA8',
    backgroundColor: '#1B1532',
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  featuredSummonTitle: {
    fontSize: 12,
    color: '#E8D9FF',
    fontWeight: '700',
    marginBottom: 3,
  },
  featuredSummonDesc: {
    fontSize: 10,
    color: '#B7A5D7',
    marginBottom: 8,
  },
  featuredSummonMeterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  featuredSummonMeterLabel: {
    fontSize: 10,
    color: '#C9B6F0',
    fontWeight: '600',
  },
  featuredSummonMeterValue: {
    fontSize: 10,
    color: '#F0E4FF',
    fontWeight: '700',
  },
  featuredSummonBtn: {
    marginTop: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A785E8',
    backgroundColor: '#4A2F7A',
    alignItems: 'center',
    paddingVertical: 8,
  },
  featuredSummonBtnDisabled: {
    opacity: 0.45,
  },
  featuredSummonBtnText: {
    fontSize: 11,
    color: '#F6ECFF',
    fontWeight: '800',
    letterSpacing: 0.4,
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
  heroPortraitFrame: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1523',
  },
  heroTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 2,
    marginBottom: 2,
  },
  heroFactionTag: {
    fontSize: 9,
    color: '#DDF0FF',
    backgroundColor: '#27435F',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
    fontWeight: '700',
  },
  heroArchetypeTag: {
    fontSize: 9,
    color: '#EFE1FF',
    backgroundColor: '#4D3A67',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 1,
    overflow: 'hidden',
    fontWeight: '700',
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
  claimAllRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  claimAllInfo: {
    fontSize: 10,
    color: '#B5D5E5',
    fontWeight: '700',
  },
  claimAllBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6DA98B',
    backgroundColor: '#264A3A',
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  claimAllBtnDisabled: {
    opacity: 0.5,
  },
  claimAllBtnText: {
    fontSize: 10,
    color: '#DBFFEC',
    fontWeight: '700',
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
  idleChestPopIn: {
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#7A6231',
    backgroundColor: '#2A2111',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#E6B75D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  idleChestEmoji: {
    fontSize: 20,
  },
  idleChestInfo: {
    flex: 1,
  },
  idleChestTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFEFC3',
  },
  idleChestDetail: {
    fontSize: 11,
    color: '#D9C68F',
  },
  idleChestOpenText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F8D985',
  },
  idleChestModalBox: {
    width: '82%',
    maxWidth: 380,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#8A6A2A',
    backgroundColor: '#1B1408',
    paddingVertical: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  idleChestModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFE6A6',
    marginBottom: 10,
  },
  idleChestModalLine: {
    fontSize: 12,
    color: '#E8D7AC',
    marginBottom: 4,
    textAlign: 'center',
  },
  idleChestClaimBtn: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7B56D',
    backgroundColor: '#5A4519',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  idleChestClaimText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF1CA',
    letterSpacing: 0.5,
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
  settingsModalBox: {
    backgroundColor: '#121A26',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2E425A',
    width: '88%',
    maxHeight: '80%',
    padding: 14,
  },
  settingsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingsCloseBtn: {
    borderRadius: 5,
    backgroundColor: '#314A66',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  settingsCloseBtnText: {
    fontSize: 10,
    color: '#E5F2FF',
    fontWeight: '700',
  },
  settingsScroll: {
    maxHeight: 520,
  },
  settingsCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#304761',
    backgroundColor: '#162336',
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  settingsCardTitle: {
    fontSize: 12,
    color: '#D8EDFF',
    fontWeight: '700',
  },
  settingsRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  settingsLabel: {
    fontSize: 11,
    color: '#A9C4DB',
  },
  settingsToggleBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#567795',
    backgroundColor: '#243C57',
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  settingsToggleBtnActive: {
    borderColor: '#6FC59B',
    backgroundColor: '#27503F',
  },
  settingsToggleText: {
    fontSize: 10,
    color: '#E3F4FF',
    fontWeight: '700',
  },
  settingsCycleBtn: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#6A84A4',
    backgroundColor: '#273B55',
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  settingsCycleBtnText: {
    fontSize: 10,
    color: '#E7F0FF',
    fontWeight: '700',
  },
  settingsAdjustWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingsValueText: {
    minWidth: 72,
    textAlign: 'center',
    fontSize: 10,
    color: '#CFE6FF',
    fontWeight: '700',
  },
  chapterMapModalBox: {
    backgroundColor: '#0F1A2A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3A5278',
    width: '92%',
    maxHeight: '70%',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chapterMapSubtitle: {
    fontSize: 11,
    color: '#B9D4E9',
    marginBottom: 8,
    textAlign: 'center',
  },
  chapterNodesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 8,
  },
  chapterNode: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#4B6684',
    backgroundColor: '#1B2C40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chapterNodeDone: {
    borderColor: '#67AE7A',
    backgroundColor: '#234632',
  },
  chapterNodeActive: {
    borderColor: '#99D2FF',
    backgroundColor: '#2F5376',
    transform: [{ scale: 1.06 }],
  },
  chapterNodeBoss: {
    borderColor: '#D98DAA',
    backgroundColor: '#4A2E40',
  },
  chapterNodeText: {
    fontSize: 11,
    color: '#EFF7FF',
    fontWeight: '700',
  },
  chapterMapHint: {
    fontSize: 10,
    color: '#8FAECC',
    textAlign: 'center',
  },

  // Events button
  eventsBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#3C2E5C',
    borderWidth: 1,
    borderColor: '#7B5FC0',
  },
  eventsBtnText: {
    fontSize: 10,
    color: '#E0D0FF',
    fontWeight: '700',
  },

  // Events modal
  eventsModalBox: {
    backgroundColor: '#0F1A2A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#3A5278',
    width: '94%',
    maxHeight: '88%',
    paddingTop: 4,
    overflow: 'hidden',
  },
  eventsCard: {
    backgroundColor: '#131F30',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4563',
    padding: 12,
    marginBottom: 10,
  },
  eventsCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E6F0FF',
    marginBottom: 6,
  },
  eventsSubtitle: {
    fontSize: 10,
    color: '#8BAEC8',
    marginBottom: 8,
  },
  eventsStatLine: {
    fontSize: 11,
    color: '#B3CCE5',
    marginBottom: 4,
  },
  eventsHint: {
    fontSize: 10,
    color: '#7899B5',
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 6,
  },
  eventsActionBtn: {
    alignSelf: 'flex-start',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#5A80A8',
    backgroundColor: '#1E3450',
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  eventsActionBtnText: {
    fontSize: 10,
    color: '#D4EAFF',
    fontWeight: '700',
  },

  // Daily quest rows
  dailyQuestRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E3348',
  },
  dailyQuestRowDone: {
    opacity: 0.7,
  },
  dailyQuestCheck: {
    fontSize: 14,
    paddingTop: 2,
    minWidth: 20,
  },
  dailyQuestInfo: {
    flex: 1,
    gap: 3,
  },
  dailyQuestTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DDEFFF',
  },
  dailyQuestDesc: {
    fontSize: 10,
    color: '#9ABBD5',
  },
  dailyQuestProgress: {
    fontSize: 10,
    color: '#7FA3BF',
  },
  dailyQuestReward: {
    fontSize: 10,
    color: '#FFD98A',
    fontWeight: '700',
    alignSelf: 'center',
  },

  // Seasonal ladder
  seasonRankBadge: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFE080',
    marginBottom: 6,
  },
  ladderTierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    borderRadius: 5,
    paddingHorizontal: 6,
    marginBottom: 3,
    opacity: 0.5,
  },
  ladderTierActive: {
    backgroundColor: '#1C3250',
    opacity: 1,
    borderWidth: 1,
    borderColor: '#3F6899',
  },
  ladderTierRank: {
    fontSize: 12,
    minWidth: 80,
    fontWeight: '700',
    color: '#DDF1FF',
  },
  ladderTierInfo: {
    fontSize: 10,
    color: '#A4C0D8',
    flex: 1,
  },

  // Formation info (in events modal)
  formationInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#1D3248',
  },
  formationInfoRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D5ECFF',
    minWidth: 80,
  },
  formationInfoPerk: {
    fontSize: 10,
    color: '#93B9D6',
    flex: 1,
  },

  // Formation badge (active team display)
  formationBadge: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#3E5C7A',
    backgroundColor: '#192A3D',
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: 'center',
  },
  formationBadgeText: {
    fontSize: 10,
    color: '#C8DEF0',
    fontWeight: '700',
  },

  // Equipment optimize
  equipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  equipOptimizeBtnHeader: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5FA870',
    backgroundColor: '#1E3D2C',
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  equipOptimizeBtnHeaderText: {
    fontSize: 10,
    color: '#AFFFCA',
    fontWeight: '700',
  },
  equipOptimizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  equipOptimizeBtn: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#5FA870',
    backgroundColor: '#1E3D2C',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  equipOptimizeBtnText: {
    fontSize: 10,
    color: '#AFFFCA',
    fontWeight: '700',
  },
  equipOptimizeHint: {
    fontSize: 10,
    color: '#6FA880',
    fontStyle: 'italic',
  },

  // Compare UI
  compareBtn: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4A6A9A',
    backgroundColor: '#152B48',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  compareBtnText: {
    fontSize: 10,
    color: '#C5DEFF',
    fontWeight: '700',
  },
  comparePanel: {
    backgroundColor: '#0C1B2C',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2E4F70',
    padding: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  comparePanelTitle: {
    fontSize: 10,
    color: '#A8C8E8',
    fontWeight: '700',
    marginBottom: 6,
  },
  compareStatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  compareStat: {
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#182A3E',
  },
  compareStatUp: {
    color: '#7DFF9A',
  },
  compareStatDown: {
    color: '#FF7D7D',
  },
  compareStatNeutral: {
    color: '#A0BAD0',
  },

  // Collection Log
  collectionCard: {
    backgroundColor: '#111E2C',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2A4260',
    padding: 10,
    marginBottom: 8,
  },
  collectionCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DAEEFF',
    marginBottom: 6,
  },
  collectionStat: {
    fontSize: 11,
    color: '#9BB6CC',
    marginBottom: 2,
  },
  collectionBonus: {
    fontSize: 10,
    color: '#7DFF9A',
    marginTop: 3,
    fontWeight: '700',
  },
  collectionHint: {
    fontSize: 10,
    color: '#AA8855',
    marginTop: 3,
    fontStyle: 'italic',
  },

  // Legacy Codex
  codexEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A3C55',
    backgroundColor: '#0F1A28',
    marginBottom: 6,
    opacity: 0.6,
  },
  codexEntryDone: {
    opacity: 1,
    borderColor: '#4A8E6A',
    backgroundColor: '#122218',
  },
  codexEntryLeft: {
    flex: 1,
  },
  codexTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A0C0DD',
    marginBottom: 2,
  },
  codexTitleDone: {
    color: '#7DFF9A',
  },
  codexDesc: {
    fontSize: 10,
    color: '#7A9BB5',
    marginBottom: 2,
  },
  codexReward: {
    fontSize: 10,
    color: '#FFD88A',
    fontWeight: '700',
  },

  // Mastery Tracks
  masteryCard: {
    backgroundColor: '#111D2C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2E4A6A',
    padding: 12,
    marginTop: 10,
  },
  masteryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C8E6FF',
    marginBottom: 4,
  },
  masteryLevel: {
    fontSize: 11,
    color: '#A5C8E0',
    marginBottom: 6,
  },
  masteryLevelSub: {
    fontSize: 10,
    color: '#6A90B0',
    fontStyle: 'italic',
  },
  masteryHint: {
    fontSize: 10,
    color: '#7BA0BC',
    marginBottom: 8,
    marginTop: 4,
  },
  masteryMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1E324A',
  },
  masteryMilestoneCheck: {
    fontSize: 12,
    color: '#6A90B0',
    paddingTop: 2,
    minWidth: 18,
  },
  masteryMilestoneDone: {
    color: '#7DFF9A',
  },
  masteryMilestoneLvl: {
    fontSize: 10,
    color: '#FFD98A',
    fontWeight: '700',
  },
  masteryMilestonePerk: {
    fontSize: 10,
    color: '#9ABCD8',
  },

  // Prestige Milestones (War Room)
  prestigeMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1A2E42',
  },
  prestigeMilestoneCheck: {
    fontSize: 12,
    color: '#6080A0',
    minWidth: 18,
    paddingTop: 2,
  },
  prestigeMilestoneDone: {
    color: '#7DFF9A',
  },
  prestigeMilestoneLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D0E8FF',
  },
  prestigeMilestoneBonus: {
    fontSize: 10,
    color: '#8AAFCC',
  },
});
