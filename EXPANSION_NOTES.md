# SimplyIdle Expansion - Balance & Content Update

## ✅ Completed Changes

### 1. Difficulty Balance
- **Monster HP scaling**: Reduced from 1.18x → 1.14x per wave
- **Monster damage scaling**: Reduced from 1.15x → 1.12x per wave (bosses 3x → 2.5x)
- **Gold rewards**: Increased from 1.12x → 1.14x scaling (bosses 6x → 7x)
- **Effect**: Wave 60 should now be 25-30% easier, making early progression smoother

### 2. New Gear Tier: Transcendent
- Added after Mythic rarity
- Rarity points: 680 (vs Mythic 430)
- Drop rate: 0.01x weight (ultra rare, 1% of mythic rate)
- Use case: Gives endgame shard conversion purpose beyond essence/scrap

### 3. Compacted Recommendations
- Replaced large "Command Recommendations" banner with single compact chip
- Saves ~3-4 rows of vertical space on mobile
- Shows title + arrow, with "+N" badge for additional recommendations
- Still clickable to navigate to the relevant tab

### 4. Forge Tab Reorganized
- **Moved from**: Heroes > Roster > Forge subtab
- **Moved to**: Equipment > Armory > Forge subtab
- **Rationale**: Shard Forge is gear/economy management, not hero management
- **UI**: Streamlined heroes subtabs to just Summon/Roster

## 📋 Pending: Dungeons & Minigames

These would add short-session activities:
- **Dice Roll Minigame**: Simple RNG reward generator (roll 1d20 for loot)
- **Rift Challenge Dungeon**: Once-daily raid with 3-5 waves of harder enemies
- **Location**: War Room tab as collapsible cards
- **Rewards**: Bonus shards, essence, or gold multiplier on next battle

Would require:
1. State additions to useGameState.ts (cooldowns, attempt counts)
2. UI components in GameScreen.tsx (minigame/dungeon cards)
3. Reward distribution logic

## 🎮 Content Summary

### Three Tiers of Content Expansion
1. **Heroes**: 65 total (was 30) — 5 tiers from common to transcendent
2. **Story**: 18 beats (was 10) — extends to Wave 600+, Prestige 25+
3. **Achievements**: 71 total (was 31) — 40 new milestones across all categories
4. **Missions**: 16 goals (was 6) — short/medium/long term progression
5. **Weekly Events**: 8 variants (was 3) — rotating difficulty/reward modifiers

### Progression Depth
- **Early Game**: Waves 1-50 (fresh start → first milestone)
- **Mid Game**: Waves 50-250 (establish teams → first rebirth)
- **Late Game**: Waves 250-600 (prestige scaling → legend status)
- **Endgame**: Prestige 25+ → infinite scaling with transcendent gear
