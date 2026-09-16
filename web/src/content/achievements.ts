/**
 * The shipped achievement list, ported verbatim.
 *
 * Each entry keeps the id, name, description and emoji the shipped game used,
 * so a dormant player's unlocks still read the way they remember. What is not
 * ported is the condition: the shipped ones are closures over a state shape
 * this rewrite does not have, so each is carried as the *signal* it watched
 * and the threshold it wanted, and `ui/achievements/measure.ts` decides what
 * that signal means now.
 *
 * Three of the ninety-one are compound — "wave 100 with exactly one hero
 * equipped" — and carry no signal. They are still listed, because a ledger
 * that quietly omitted them would be telling the player they have ninety-one
 * achievements when the game has ninety-four.
 *
 * `SIGNAL` is deliberately wider than what the engine can currently measure.
 * A signal nothing feeds yet is shown as untracked rather than as zero
 * progress, because "you have made no progress" and "this is not wired up"
 * are different things to tell someone.
 */

export type AchievementSignal =
  | 'activeTeamClassCount'
  | 'bossTears'
  | 'codexClaimCount'
  | 'dailyLoginStreak'
  | 'epicPlusEquipmentCount'
  | 'equipmentScrap'
  | 'equippedCount'
  | 'essence'
  | 'facilityTotalLevel'
  | 'forgeFacilityLevel'
  | 'godlyHeroCount'
  | 'heroRosterCount'
  | 'heroShards'
  | 'highestWaveReached'
  | 'level'
  | 'maxHeroLevelCount'
  | 'maxHeroRankCount'
  | 'mythicPlusEquipmentCount'
  | 'permanentUnlockCount'
  | 'prestigeCount'
  | 'teamSlotCount'
  | 'totalGold'
  | 'totalKills'
  | 'totalSummons'
  | 'transcendentEquipmentCount'
  | 'transcendentHeroCount'
  | 'uniqueEquippedCount'
  | 'uniqueForgedCount'
  | 'uniqueMaxRankCount'
  | 'unlockedCount'
  | 'vipLevel'
  | 'wave';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** What the shipped condition watched, or null for a compound one. */
  signal: AchievementSignal | null;
  /** The value the signal had to reach. Null when the signal is. */
  goal: number | null;
}

/** Signals the current engine and save can actually produce a figure for. */
export const TRACKED_SIGNALS: ReadonlySet<AchievementSignal> = new Set([
  'activeTeamClassCount',
  'bossTears',
  'equipmentScrap',
  'equippedCount',
  'essence',
  'godlyHeroCount',
  'heroRosterCount',
  'heroShards',
  'highestWaveReached',
  'level',
  'maxHeroLevelCount',
  'maxHeroRankCount',
  'prestigeCount',
  'teamSlotCount',
  'totalGold',
  'totalKills',
  'transcendentHeroCount',
  'wave',
]);

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first_blood',
    name: 'Ashen First Blood',
    description: 'Break the line and defeat your first monster.',
    emoji: '🗡️',
    signal: 'totalKills',
    goal: 1,
  },
  {
    id: 'kills_25',
    name: 'Skirmish Doctrine',
    description: 'Defeat 25 monsters.',
    emoji: '⚔️',
    signal: 'totalKills',
    goal: 25,
  },
  {
    id: 'kills_100',
    name: 'Frontier Reaper',
    description: 'Defeat 100 monsters.',
    emoji: '☠️',
    signal: 'totalKills',
    goal: 100,
  },
  {
    id: 'kills_500',
    name: 'Warpath Unbroken',
    description: 'Defeat 500 monsters.',
    emoji: '🩸',
    signal: 'totalKills',
    goal: 500,
  },
  {
    id: 'kills_2500',
    name: 'Apex Exterminator',
    description: 'Defeat 2,500 monsters.',
    emoji: '💀',
    signal: 'totalKills',
    goal: 2500,
  },
  {
    id: 'kills_10k',
    name: 'Legion Harrower',
    description: 'Defeat 10,000 monsters.',
    emoji: '⚔️',
    signal: 'totalKills',
    goal: 10000,
  },
  {
    id: 'kills_100k',
    name: 'Cataclysm Standard',
    description: 'Defeat 100,000 monsters.',
    emoji: '🌪️',
    signal: 'totalKills',
    goal: 100000,
  },
  {
    id: 'wave_10',
    name: 'Gatebreaker',
    description: 'Push the current run to wave 10.',
    emoji: '🚪',
    signal: 'wave',
    goal: 10,
  },
  {
    id: 'wave_25',
    name: 'Frontline Surge',
    description: 'Push the current run to wave 25.',
    emoji: '🌊',
    signal: 'wave',
    goal: 25,
  },
  {
    id: 'wave_50',
    name: 'Siege Veteran',
    description: 'Push the current run to wave 50.',
    emoji: '⚔️',
    signal: 'wave',
    goal: 50,
  },
  {
    id: 'wave_100',
    name: 'Century Siege',
    description: 'Push the current run to wave 100.',
    emoji: '🏰',
    signal: 'wave',
    goal: 100,
  },
  {
    id: 'wave_250',
    name: 'Storm Marshal',
    description: 'Push the current run to wave 250.',
    emoji: '🌩️',
    signal: 'wave',
    goal: 250,
  },
  {
    id: 'wave_500',
    name: 'Infinite March',
    description: 'Push the current run to wave 500.',
    emoji: '∞',
    signal: 'wave',
    goal: 500,
  },
  {
    id: 'highest_wave_300',
    name: 'Last Bastion',
    description: 'Reach wave 300 in any run.',
    emoji: '🧱',
    signal: 'highestWaveReached',
    goal: 300,
  },
  {
    id: 'highest_wave_1k',
    name: 'Epoch Conqueror',
    description: 'Reach wave 1,000 in any run.',
    emoji: '👑',
    signal: 'highestWaveReached',
    goal: 1000,
  },
  {
    id: 'highest_wave_2500',
    name: 'Thronefall Survivor',
    description: 'Reach wave 2,500 in any run.',
    emoji: '🜂',
    signal: 'highestWaveReached',
    goal: 2500,
  },
  {
    id: 'level_10',
    name: 'Battle-Hardened',
    description: 'Raise your commander to level 10.',
    emoji: '🛡️',
    signal: 'level',
    goal: 10,
  },
  {
    id: 'level_25',
    name: 'Ascendant Standard',
    description: 'Raise your commander to level 25.',
    emoji: '⭐',
    signal: 'level',
    goal: 25,
  },
  {
    id: 'level_50',
    name: 'Myth-Forged',
    description: 'Raise your commander to level 50.',
    emoji: '🌟',
    signal: 'level',
    goal: 50,
  },
  {
    id: 'level_100',
    name: 'Godborne Office',
    description: 'Raise your commander to level 100.',
    emoji: '🌌',
    signal: 'level',
    goal: 100,
  },
  {
    id: 'level_250',
    name: 'Eternal Regent',
    description: 'Raise your commander to level 250.',
    emoji: '👑',
    signal: 'level',
    goal: 250,
  },
  {
    id: 'gold_100k',
    name: 'Coin Current',
    description: 'Accumulate 100,000 total gold across all runs.',
    emoji: '🪙',
    signal: 'totalGold',
    goal: 100000,
  },
  {
    id: 'gold_1m',
    name: 'Gold Baron',
    description: 'Accumulate 1,000,000 total gold across all runs.',
    emoji: '💰',
    signal: 'totalGold',
    goal: 1000000,
  },
  {
    id: 'gold_10m',
    name: 'Imperial Treasury',
    description: 'Earn 10,000,000 total gold.',
    emoji: '🏦',
    signal: 'totalGold',
    goal: 10000000,
  },
  {
    id: 'gold_100m',
    name: 'Dynastic Wealth',
    description: 'Accumulate 100,000,000 total gold across all runs.',
    emoji: '🏆',
    signal: 'totalGold',
    goal: 100000000,
  },
  {
    id: 'gold_1b',
    name: 'Infinite Treasury',
    description: 'Accumulate 1,000,000,000 total gold across all runs.',
    emoji: '🤑',
    signal: 'totalGold',
    goal: 1000000000,
  },
  {
    id: 'summon_1',
    name: 'Recruitment Opened',
    description: 'Summon your first hero.',
    emoji: '📯',
    signal: 'totalSummons',
    goal: 1,
  },
  {
    id: 'summon_10',
    name: 'Banner Collector',
    description: 'Summon 10 heroes.',
    emoji: '🎴',
    signal: 'totalSummons',
    goal: 10,
  },
  {
    id: 'summon_50',
    name: 'Warband Architect',
    description: 'Summon 50 heroes.',
    emoji: '🧬',
    signal: 'totalSummons',
    goal: 50,
  },
  {
    id: 'summon_200',
    name: 'Legion Broker',
    description: 'Summon 200 heroes.',
    emoji: '👑',
    signal: 'totalSummons',
    goal: 200,
  },
  {
    id: 'summon_1k',
    name: 'Infinite Bannerlord',
    description: 'Summon 1,000 heroes.',
    emoji: '🌠',
    signal: 'totalSummons',
    goal: 1000,
  },
  {
    id: 'godly_hero_1',
    name: 'Myth Walks',
    description: 'Own a Godly hero.',
    emoji: '🌟',
    signal: 'godlyHeroCount',
    goal: 1,
  },
  {
    id: 'transcendent_hero_1',
    name: 'Beyond the Banner',
    description: 'Own a Transcendent hero.',
    emoji: '🕳️',
    signal: 'transcendentHeroCount',
    goal: 1,
  },
  {
    id: 'transcendent_hero_5',
    name: 'Court of the Beyond',
    description: 'Own 5 Transcendent heroes.',
    emoji: '🜏',
    signal: 'transcendentHeroCount',
    goal: 5,
  },
  {
    id: 'roster_12',
    name: 'Field Locker',
    description: 'Own 12 heroes at once.',
    emoji: '🗃️',
    signal: 'heroRosterCount',
    goal: 12,
  },
  {
    id: 'roster_30',
    name: 'Banner Hall',
    description: 'Own 30 heroes at once.',
    emoji: '🏳️',
    signal: 'heroRosterCount',
    goal: 30,
  },
  {
    id: 'roster_60',
    name: 'Eternal Legion',
    description: 'Own 60 heroes at once.',
    emoji: '⚔️',
    signal: 'heroRosterCount',
    goal: 60,
  },
  {
    id: 'team_full',
    name: 'War Council',
    description: 'Field a full five-hero active team.',
    emoji: '🪖',
    signal: 'equippedCount',
    goal: 5,
  },
  {
    id: 'team_diverse',
    name: 'Grand Coalition',
    description: 'Deploy 4 different hero classes at once.',
    emoji: '🧭',
    signal: 'activeTeamClassCount',
    goal: 4,
  },
  {
    id: 'team_slots_5',
    name: 'Expanded Command',
    description: 'Unlock all team slots.',
    emoji: '🪑',
    signal: 'teamSlotCount',
    goal: 5,
  },
  {
    id: 'rank_10_1',
    name: 'Crowned Veteran',
    description: 'Raise a hero to Rank 10.',
    emoji: '👑',
    signal: 'maxHeroRankCount',
    goal: 1,
  },
  {
    id: 'rank_10_5',
    name: 'Pantheon Vanguard',
    description: 'Raise 5 heroes to Rank 10.',
    emoji: '🏛️',
    signal: 'maxHeroRankCount',
    goal: 5,
  },
  {
    id: 'hero_cap_1',
    name: 'Limit Breaker',
    description: 'Raise a hero to the level cap.',
    emoji: '📈',
    signal: 'maxHeroLevelCount',
    goal: 1,
  },
  {
    id: 'hero_cap_5',
    name: 'Endgame Battalion',
    description: 'Raise 5 heroes to the level cap.',
    emoji: '🧱',
    signal: 'maxHeroLevelCount',
    goal: 5,
  },
  {
    id: 'lone_banner',
    name: 'Lone Banner',
    description: 'Reach wave 100 while fielding only one active hero.',
    emoji: '🕯️',
    signal: null,
    goal: null,
  },
  {
    id: 'mono_legion',
    name: 'Monoculture Doctrine',
    description: 'Field a full team without class diversity.',
    emoji: '🪞',
    signal: null,
    goal: null,
  },
  {
    id: 'equip_5',
    name: 'Forward Detachment',
    description: 'Field at least 4 active heroes.',
    emoji: '🧩',
    signal: 'equippedCount',
    goal: 4,
  },
  {
    id: 'gear_epic',
    name: 'Epic Armorsmith',
    description: 'Own an Epic-or-better equipment piece.',
    emoji: '🎨',
    signal: 'epicPlusEquipmentCount',
    goal: 1,
  },
  {
    id: 'gear_mythic',
    name: 'Mythic Artisan',
    description: 'Own a Mythic-or-better equipment piece.',
    emoji: '✨',
    signal: 'mythicPlusEquipmentCount',
    goal: 1,
  },
  {
    id: 'scrap_1k',
    name: 'Scrapyard Baron',
    description: 'Hold 1,000 equipment scrap.',
    emoji: '🔩',
    signal: 'equipmentScrap',
    goal: 1000,
  },
  {
    id: 'scrap_10k',
    name: 'Iron Mountain',
    description: 'Hold 10,000 equipment scrap.',
    emoji: '⛰️',
    signal: 'equipmentScrap',
    goal: 10000,
  },
  {
    id: 'gear_mythic_plus_3',
    name: 'High Armory',
    description: 'Own 3 Mythic or better equipment pieces.',
    emoji: '🛠️',
    signal: 'mythicPlusEquipmentCount',
    goal: 3,
  },
  {
    id: 'gear_transcendent_1',
    name: 'Transcendent Arsenal',
    description: 'Own a Transcendent equipment piece.',
    emoji: '🗡️',
    signal: 'transcendentEquipmentCount',
    goal: 1,
  },
  {
    id: 'gear_transcendent_3',
    name: 'Starvault Arsenal',
    description: 'Own 3 Transcendent equipment pieces.',
    emoji: '🌌',
    signal: 'transcendentEquipmentCount',
    goal: 3,
  },
  {
    id: 'shards_1000',
    name: 'Shard Banker',
    description: 'Hold 1,000 hero shards at once.',
    emoji: '💠',
    signal: 'heroShards',
    goal: 1000,
  },
  {
    id: 'shards_10k',
    name: 'Crystalline Hoard',
    description: 'Hold 10,000 hero shards at once.',
    emoji: '💠',
    signal: 'heroShards',
    goal: 10000,
  },
  {
    id: 'essence_25',
    name: 'Essence Channel',
    description: 'Own 25 essence.',
    emoji: '✨',
    signal: 'essence',
    goal: 25,
  },
  {
    id: 'essence_100',
    name: 'Eternal Conduit',
    description: 'Own 100 essence.',
    emoji: '✨',
    signal: 'essence',
    goal: 100,
  },
  {
    id: 'boss_tears_10',
    name: 'Tear Vault',
    description: 'Hold 10 Boss Tears at once.',
    emoji: '💧',
    signal: 'bossTears',
    goal: 10,
  },
  {
    id: 'boss_tears_100',
    name: 'Abyss Reservoir',
    description: 'Hold 100 Boss Tears at once.',
    emoji: '🌊',
    signal: 'bossTears',
    goal: 100,
  },
  {
    id: 'boss_tears_250',
    name: 'Blackwell Reservoir',
    description: 'Hold 250 Boss Tears at once.',
    emoji: '🌑',
    signal: 'bossTears',
    goal: 250,
  },
  { id: 'vip_1', name: 'Patron Sigil', description: 'Reach VIP level 1.', emoji: '👑', signal: 'vipLevel', goal: 1 },
  { id: 'vip_5', name: 'Imperial Patron', description: 'Reach VIP level 5.', emoji: '💎', signal: 'vipLevel', goal: 5 },
  {
    id: 'vip_10',
    name: 'Throne Benefactor',
    description: 'Reach VIP level 10.',
    emoji: '🏰',
    signal: 'vipLevel',
    goal: 10,
  },
  {
    id: 'unlocks_3',
    name: 'Relic Keeper',
    description: 'Unlock your first permanent feature.',
    emoji: '🔓',
    signal: 'permanentUnlockCount',
    goal: 1,
  },
  {
    id: 'unlocks_10',
    name: 'Vault Master',
    description: 'Unlock all permanent features.',
    emoji: '🔑',
    signal: 'permanentUnlockCount',
    goal: 3,
  },
  {
    id: 'facilities_20',
    name: 'Guildhall Clerk',
    description: 'Reach 20 total facility levels.',
    emoji: '🏗️',
    signal: 'facilityTotalLevel',
    goal: 20,
  },
  {
    id: 'facilities_80',
    name: 'Citadel Quartermaster',
    description: 'Reach 80 total facility levels.',
    emoji: '🏰',
    signal: 'facilityTotalLevel',
    goal: 80,
  },
  {
    id: 'forge_10',
    name: 'Forge Supremacy',
    description: 'Upgrade the Forge facility to level 10.',
    emoji: '🔥',
    signal: 'forgeFacilityLevel',
    goal: 10,
  },
  {
    id: 'facilities_200',
    name: 'Imperial Works',
    description: 'Reach 200 total facility levels.',
    emoji: '🏛️',
    signal: 'facilityTotalLevel',
    goal: 200,
  },
  {
    id: 'streak_7',
    name: 'Habit of Steel',
    description: 'Reach a 7-day login streak.',
    emoji: '📅',
    signal: 'dailyLoginStreak',
    goal: 7,
  },
  {
    id: 'streak_30',
    name: 'Devoted Guardian',
    description: 'Reach a 30-day login streak.',
    emoji: '🗓️',
    signal: 'dailyLoginStreak',
    goal: 30,
  },
  {
    id: 'rebirth_1',
    name: 'Reborn',
    description: 'Complete your first rebirth.',
    emoji: '♾️',
    signal: 'prestigeCount',
    goal: 1,
  },
  {
    id: 'rebirth_5',
    name: 'Soul Cycler',
    description: 'Complete 5 Rebirths.',
    emoji: '🌀',
    signal: 'prestigeCount',
    goal: 5,
  },
  {
    id: 'rebirth_15',
    name: 'Eternal Cadence',
    description: 'Complete 15 Rebirths.',
    emoji: '🌌',
    signal: 'prestigeCount',
    goal: 15,
  },
  {
    id: 'rebirth_50',
    name: 'Infinite Returner',
    description: 'Complete 50 Rebirths.',
    emoji: '∞',
    signal: 'prestigeCount',
    goal: 50,
  },
  {
    id: 'rebirth_100',
    name: 'Godborne',
    description: 'Complete 100 Rebirths. You transcend mortality.',
    emoji: '👑',
    signal: 'prestigeCount',
    goal: 100,
  },
  {
    id: 'rebirth_250',
    name: 'Cycle Tyrant',
    description: 'Complete 250 rebirths.',
    emoji: '🜃',
    signal: 'prestigeCount',
    goal: 250,
  },
  {
    id: 'unique_1',
    name: 'Relic Awakened',
    description: 'Forge your first hero unique weapon.',
    emoji: '🗡️',
    signal: 'uniqueForgedCount',
    goal: 1,
  },
  {
    id: 'unique_10',
    name: 'Armory Curator',
    description: 'Forge 10 hero unique weapons.',
    emoji: '🗃️',
    signal: 'uniqueForgedCount',
    goal: 10,
  },
  {
    id: 'unique_25',
    name: 'Dynastic Relic Hall',
    description: 'Forge 25 hero unique weapons.',
    emoji: '🏛️',
    signal: 'uniqueForgedCount',
    goal: 25,
  },
  {
    id: 'unique_50',
    name: 'Imperial Reliquary',
    description: 'Forge 50 hero unique weapons.',
    emoji: '👑',
    signal: 'uniqueForgedCount',
    goal: 50,
  },
  {
    id: 'unique_equipped_5',
    name: 'Relic Doctrine',
    description: 'Have 5 unique weapons equipped at once.',
    emoji: '⚜️',
    signal: 'uniqueEquippedCount',
    goal: 5,
  },
  {
    id: 'unique_rank_10',
    name: 'Masterpiece Armament',
    description: 'Raise a unique weapon to Rank 10.',
    emoji: '🌟',
    signal: 'uniqueMaxRankCount',
    goal: 1,
  },
  {
    id: 'codex_claims_10',
    name: 'Lorekeeper',
    description: 'Claim 10 codex rewards.',
    emoji: '📚',
    signal: 'codexClaimCount',
    goal: 10,
  },
  {
    id: 'codex_claims_40',
    name: 'Archivist Supreme',
    description: 'Claim 40 codex rewards.',
    emoji: '📖',
    signal: 'codexClaimCount',
    goal: 40,
  },
  {
    id: 'unique_rank_10_5',
    name: 'Relic Pantheon',
    description: 'Raise 5 unique weapons to Rank 10.',
    emoji: '🌠',
    signal: 'uniqueMaxRankCount',
    goal: 5,
  },
  {
    id: 'codex_claims_100',
    name: 'Black Archive',
    description: 'Claim 100 codex rewards.',
    emoji: '🕮',
    signal: 'codexClaimCount',
    goal: 100,
  },
  {
    id: 'legend_slate',
    name: 'Legend Slate',
    description: 'Unlock 20 achievements.',
    emoji: '📜',
    signal: 'unlockedCount',
    goal: 20,
  },
  {
    id: 'pantheon_ascend',
    name: 'Pantheon Ascendant',
    description: 'Unlock 50 achievements.',
    emoji: '⭐',
    signal: 'unlockedCount',
    goal: 50,
  },
  {
    id: 'ultimate_champion',
    name: 'Ultimate Champion',
    description: 'Unlock all achievements. You are eternal.',
    emoji: '🏆',
    signal: null,
    goal: null,
  },
];

export const ACHIEVEMENT_COUNT = ACHIEVEMENTS.length;

/** The ones this build can show real progress for. */
export function trackedAchievements(): Achievement[] {
  return ACHIEVEMENTS.filter(
    entry => entry.signal !== null && entry.goal !== null && TRACKED_SIGNALS.has(entry.signal),
  );
}

export function isTracked(entry: Achievement): boolean {
  return entry.signal !== null && entry.goal !== null && TRACKED_SIGNALS.has(entry.signal);
}
