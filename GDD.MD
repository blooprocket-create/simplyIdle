# SimplyIdle - Game Design Document (Current State)

## 1. Project Summary
- Title: SimplyIdle
- Genre: Idle RPG / incremental auto-battler
- Platforms: Web, Android, iOS (Expo + React Native + react-native-web)
- Core fantasy: Build a compounding war machine across endless waves, unlock classes and gear power spikes, and loop through rebirth for permanent scaling.
- Session profile: Short burst sessions (check-ins) plus longer optimization sessions.

## 2. Product Pillars
- Compounding progression: Every subsystem feeds long-term growth (stats, heroes, gear, meta, rebirth, achievements).
- Frequent rewards: Constant drops, mini-op cooldown rewards, weekly/missions, and visible milestone feedback.
- Readable systems: Tooltips and chips expose formulas (DPS breakdown, power, gear score).
- Multi-lane engagement: Battle lane + management lanes (roster, equipment, operations, achievements).

## 3. Architecture and Tech
- App shell: App.tsx routes to AuthScreen or GameScreen based on local session.
- Auth model: Local account storage with salted iterative SHA-256 hashing (legacy plaintext migration path).
- State model: Single reducer-driven game state in useGameState.ts.
- Persistence: AsyncStorage save key per character slot and class.
- Tick loop: 100 ms simulation tick with periodic autosave.
- Telemetry: Firebase Analytics.
- UI: Large monolithic GameScreen plus extracted tab content components.

## 4. Player Journey
- Start: Create character in one of five class slots.
- Early game: Build team, push waves, unlock first boss gates, begin summoning and item usage.
- Mid game: Optimize team comp and gear, use mini-ops/expeditions, complete missions, use essence and rebirth cores.
- Late game: High-wave loops, frequent rebirth cycles, high-tier gear/hero progression, leaderboard/season optimization.

## 5. Core Gameplay Loops

### 5.1 Moment-to-Moment Combat Loop
- All combat attacks run automatically (commander + heroes + buildings).
- Kill monster -> grant gold, EXP, weekly/affix-modified rewards.
- Wave increments after kill.
- Every 10th wave is boss with amplified reward and progression implications.
- Team HP is restored after wave win (run pacing remains push-focused, not attrition-locked).

### 5.2 Build and Optimize Loop
- Summon heroes (single, x10, cinematic x10).
- Select active team and formation roles.
- Equip or optimize gear.
- Allocate stat points and meta upgrades.
- Use consumables and automation toggles.
- Push further wave thresholds and rebirth at strategic points.

### 5.3 Meta Loop
- Rebirth converts deep run progress into rebirth cores and resets run-level progress while preserving key progression elements.
- Spend essence and rebirth cores into permanent tracks.
- Accumulate achievements for global multiplicative bonuses.
- Repeat with stronger baseline.

## 6. Combat and Progression Math (Current)

### 6.1 Enemy Scaling
- Monster HP base: floor(30 * 1.14^(wave-1)); boss HP multiplier x5.
- Monster gold base: max(8, floor(8 * 1.14^(wave-1))); boss gold multiplier x7.
- Monster EXP base: max(5, floor(5 * 1.10^(wave-1))); boss EXP multiplier x4.
- Monster DPS base: max(0.5, floor(0.8 * 1.12^(wave-1))/10); boss damage multiplier x2.5.

### 6.2 Reward Multipliers
- Gold uses stacked multipliers from: rebirth bonus, achievements, affixes, meta economy, rebirth economy path, hero passives, synergies, mastery, weekly event, VIP, treasury facility.
- EXP uses stacked multipliers from: achievements, affixes, hero passives, synergies, weekly event, VIP, training facility.

### 6.3 Seasonal Scoring
- Per kill: +12 season points.
- Boss bonus: +80 additional season points.
- Rebirth bonus: +250 season points.
- Rank thresholds:
- Bronze: < 1000
- Silver: 1000-4999
- Gold: 5000-14999
- Diamond: 15000-39999
- Legend: 40000+

### 6.4 Power Index and Tier
- Power index formula: floor(DPS * 0.45 + TeamHP * 0.25 + Defense * 7 + GearScore * 15).
- Tier thresholds:
- Recruit: < 12000
- Elite: 12000-54999
- Mythic: 55000-179999
- Ascendant: 180000+

### 6.5 Rebirth
- Requirement: highestWaveReached >= ceil(100 * 1.12^prestigeCount).
- Core gain: base + surplus-wave scaling.
- Rebirth currently preserves key progression areas such as gold, skills, and several buff/cooldown states.

### 6.6 Offline Progress
- Trigger path: app background/foreground delta + manual apply function.
- Simulated with cap limits tied to highest wave.
- Current caps:
- Max offline kills: min(12000, max(2000, 1500 + highestWaveReached * 3)).
- Max offline waves: min(500, max(100, 80 + highestWaveReached * 0.8)).

## 7. Class and Team Systems
- Playable classes: warrior, berserker, archer, mage, monk.
- Class identity uses weighted stat contributions and distinct passives.
- Hero roster includes 65 templates across a broad rarity ladder.
- Team slot cap supports expansion up to 6 heroes (+player contextually represented in formulas/UI).
- Formation roles with per-role caps to prevent single-line abuse.

## 8. Content Inventory (Current)
- Acts: 6 named acts with thematic progression and boss gates.
- Permanent unlock gates: class passive, advanced consumables, mythic equipment.
- Heroes: 65 templates (includes top-end transcendent-era entries).
- Equipment rarity ladder: common, rare, epic, legendary, mythic, transcendent.
- Monster affixes: 5 rotating affix archetypes, second affix on boss waves.
- Achievements: 70+ style target matrix across kills, waves, level, economy, summons, roster, rebirth, streak.
- Story beats: campaign + ascension chapters with wave/prestige requirements.
- Weekly events: 8 event variants with distinct reward/difficulty multipliers.
- Mission board: short/medium/long goals with mixed rewards.

## 9. Economy Model

### 9.1 Primary Currencies
- Gold: main run economy for upgrades, facilities, and operations costs.
- Boss tears: summon currency for hero gacha.
- Hero shards: roster progression/rank-ups and forge conversions.
- Essence: permanent progression and some advanced costs.
- Equipment scrap: crafting and gear upgrade currency.
- Diamonds: premium gameplay currency for selected convenience/progression actions.

### 9.2 Supporting Economy Channels
- Daily login streak rewards with streak insurance.
- Weekly track milestones.
- Missions and mini-bounties.
- Mini-ops and rift rewards on cooldown schedules.
- Shop lanes (gold, diamond, simulated-dollar options) and VIP milestone rewards.

## 10. Operations and Side Activities
- Mini-ops (4h cooldown each): Dice, Recon, Lockpick, Target Practice, Mini Bounty draft/claim.
- Rift dungeon: Daily lane with wave-cleared reward scaling.
- Expeditions: Type + rarity contracts, queue system, refresh cost, claim windows.
- Facilities: Training, Treasury, Forge, Tactics with high-level scaling and max cap.

## 11. UX and Feature Surfaces
- Main tabs: Warroom, Battle, Heroes, Stats, Equipment, Achievements, Operations.
- Warroom acts as command center with campaign rail, near-unlocks, and quick action panels.
- Battle tab handles tempo, heat, burst, items, and combat log.
- Hero tab supports summoning, roster management, and batch leveling.
- Equipment tab supports optimize/craft/upgrade/forge workflows.
- Achievements tab merges bonus engine, weeklys, missions, records, collection, codex.
- Operations tab centralizes mini-ops, dungeon ops, facilities, and expeditions.

## 12. Save/Account Model
- Account auth and profile are local-device only.
- Character slots are class-based and independently persisted.
- Save cadence: interval autosave + specific claim/save checkpoints.
- Risk note: local-only storage limits cross-device continuity and anti-cheat guarantees.

## 13. Telemetry and Live Ops Readiness
- Implemented event tracking includes session lifecycle and key progression moments.
- Leaderboard view/rank events are emitted from Events panel flow.
- Existing policy docs define season cadence and reward tiers for future server-backed rollout.

## 14. Current Strengths
- Strong compounding loops with many progression vectors.
- High reward cadence and clear immediate goals.
- Broad content footprint for a beta (heroes/events/missions/story).
- Formula transparency helps user trust and min-max engagement.

## 15. Current Risks and Design Debt
- Scope concentration in GameScreen and large reducer creates maintenance burden.
- Some systems are currently cosmetic labels (for example, certain rank surfaces) without deep gameplay hooks yet.
- Economy complexity is high; onboarding clarity can lag behind feature depth.
- Mobile-vs-web layout parity requires ongoing responsive QA.
- Local-first leaderboard and account model limits competitiveness integrity.

## 16. Design Intent Snapshot
- The game is currently optimized for: sustained progression compulsion, broad system interplay, and visible incremental mastery.
- The next stage should emphasize: sharper thematic identity, cleaner progression communication, and deeper endgame differentiation.
