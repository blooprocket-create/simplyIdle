# SimplyIdle V2 — Development Roadmap

> **Version**: 2.0 Draft  
> **Date**: April 19, 2026  
> **Reference**: [GDD_V2.MD](GDD_V2.MD)  
> **Predecessor**: [GDD.MD](GDD.MD) (SimplyIdle V1)

---

## Table of Contents

1. [Roadmap Overview](#1-roadmap-overview)
2. [Phase 0 — Foundation](#2-phase-0--foundation-weeks-14)
3. [Phase 1 — Rift Runs](#3-phase-1--rift-runs-weeks-510)
4. [Phase 2 — Stronghold](#4-phase-2--stronghold-weeks-813)
5. [Phase 3 — Crucible Arena](#5-phase-3--crucible-arena-weeks-1116)
6. [Phase 4 — Guild & Social V2](#6-phase-4--guild--social-v2-weeks-1418)
7. [Phase 5 — Seasonal System & Monetization](#7-phase-5--seasonal-system--monetization-weeks-1620)
8. [Phase 6 — Polish & Launch](#8-phase-6--polish--launch-weeks-1824)
9. [Phase Timeline (Gantt)](#9-phase-timeline-gantt)
10. [Technical Decisions](#10-technical-decisions)
11. [Risk Register](#11-risk-register)
12. [Verification & QA Plan](#12-verification--qa-plan)
13. [Post-Launch Cadence](#13-post-launch-cadence)

---

## 1. Roadmap Overview

### 1.1 Summary

SimplyIdle V2 is a **24-week development plan** across 7 phases (Phase 0–6). Phases overlap where dependencies allow parallelism. The critical path runs through Phase 0 → Phase 1 → Phase 3 → Phase 5 → Phase 6.

### 1.2 Phase Map

```
Week:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17  18  19  20  21  22  23  24
       ├───────────────┤
       Phase 0: Foundation
                       ├───────────────────────┤
                       Phase 1: Rift Runs
                                   ├───────────────────────┤
                                   Phase 2: Stronghold
                                               ├───────────────────────┤
                                               Phase 3: Crucible Arena
                                                           ├───────────────────┤
                                                           Phase 4: Guild/Social
                                                                   ├───────────────────┤
                                                                   Phase 5: Seasonal/Monetization
                                                                               ├───────────────────────┤
                                                                               Phase 6: Polish & Launch
```

### 1.3 Key Dependencies

```
Phase 0 ──► Phase 1 (Rift needs idle core + Momentum)
Phase 0 ──► Phase 2 (Stronghold needs hero roster + economy)
Phase 0 ──► Phase 3 (Arena needs hero system + DPS formula)
Phase 1 ──► Phase 3 (Arena server validation reuses Rift's server infra)
Phase 2 ──► Phase 4 (Guild raids need Stronghold)
Phase 1+2+3 ──► Phase 5 (Seasonal scoring needs all modes)
All ──► Phase 6 (Polish)
```

---

## 2. Phase 0 — Foundation (Weeks 1–4)

### 2.1 Goal
Port V1's idle core to V2 architecture. Implement the three foundational changes: simplified DPS formula, Momentum system, and Prestige Paths. Establish the V2 hero system (40 heroes, 5 rarities, 3 abilities per hero).

### 2.2 Deliverables

#### Week 1: Tech Stack & Project Setup
- [ ] **Tech stack decision**: Evaluate Godot, Phaser 4, React Native + Skia (see §10 for criteria)
- [ ] **Project scaffolding**: Repository, build pipeline, CI/CD (lint + typecheck + test gates)
- [ ] **If migrating engines**: Set up project structure, asset pipeline, web + mobile export targets
- [ ] **If staying React Native**: Add `react-native-skia` for canvas rendering (hex grid, node map)
- [ ] **Design system**: Port V1 theme tokens (colors, spacing, typography) to V2 framework
- [ ] **Firebase project**: Create V2 Firebase project (or extend V1 staging) with updated Firestore collections

#### Week 2: Core Idle Loop Port
- [ ] **Wave combat**: Port V1 tick loop (100ms, 10 ticks/sec) with all monster scaling formulas
- [ ] **Simplified DPS formula**: Implement 3-layer DPS (base × prestige × gear) — replace V1's 14-layer chain
- [ ] **V1 multiplier → utility conversion table**: Map each removed DPS multiplier to its new utility effect (code stubs)
- [ ] **Heat/Tempo/Burst system**: Port unchanged from V1
- [ ] **Offline simulation**: Port unchanged from V1 (8h cap, 300k iterations)
- [ ] **Equipment system**: Port with simplified 5-rarity ladder (Common/Rare/Epic/Legendary/Mythic)
- [ ] **Facilities**: Port Training/Treasury/Forge/Tactics unchanged

#### Week 3: Hero System V2 & Economy
- [ ] **40-hero roster**: Define all hero templates (see GDD_V2 Appendix B) with 3 abilities each
- [ ] **5-rarity gacha**: Implement summon rates (50/28/14/6/2) with hard pity at 25 pulls
- [ ] **Gold-based summoning**: Replace Boss Tears/Diamonds with 10,000 Gold per summon
- [ ] **Hero mastery system**: XP tracking per hero across modes, milestone unlocks at levels 3/5/7/10
- [ ] **Spark token exchange**: Port from V1 with adjusted values
- [ ] **Currency consolidation**: Remove Boss Tears, Diamonds, Rebirth Cores. Add Momentum, Rift Tokens, Arena Marks (stubs)
- [ ] **Economy reducer refactor**: Update V1 economyReducer to V2 currency set

#### Week 4: Momentum & Prestige Paths
- [ ] **Momentum system**: Regeneration (1/min idle), cap (60 + prestige×10), display in header, spend hooks for mode entry
- [ ] **Prestige paths**: Warlord (1.3^n DPS + Rift bonuses), Merchant (1.15^n + economy bonuses), Champion (1.2^n + Arena bonuses)
- [ ] **Path selection UI**: Modal on prestige with path comparison, respec option (500 Shards)
- [ ] **Prestige reset logic**: Update what resets vs. stays (Momentum stays, Stronghold layout stays, etc.)
- [ ] **Save system update**: Extend save schema for V2 state (Momentum, prestige path, hero mastery, mode progress)
- [ ] **Unit tests**: All core formulas (DPS, prestige requirements, Momentum cap, economy conversions)

### 2.3 Exit Criteria
- [ ] Idle core playable: wave push, hero summon, equip, prestige loop functional
- [ ] Momentum system active: visible in header, regenerates during idle, cap scales with prestige
- [ ] All 3 prestige paths selectable with correct multipliers
- [ ] 40-hero roster implemented with 3 abilities each (abilities are stubs — activated in later phases)
- [ ] Economy uses Gold/Shards/Essence/Momentum/Scrap (no legacy currencies)
- [ ] CI pipeline: lint + typecheck + tests pass on every commit
- [ ] Save/load round-trip works with V2 schema

---

## 3. Phase 1 — Rift Runs (Weeks 5–10)

### 3.1 Goal
Build the complete Rift Run system: procedural map generation, 7 room types, 60 augments with synergy combos, 10 difficulty tiers, curse modifiers, and Rift-specific rewards.

### 3.2 Deliverables

#### Week 5: Map Generation & Room Framework
- [ ] **Node map generator**: Procedural branching paths (Slay the Spire style), 5 floors × 3–5 rooms, 3–4 columns
- [ ] **Room type distribution**: 50% Combat, 15% Elite, 10% Shop, 10% Rest, 10% Event, 5% Mystery
- [ ] **Map renderer**: Visual node map (canvas/SVG) with path connections, room type icons, current position indicator
- [ ] **Navigation system**: Tap to choose next room, path validation (can only move forward to connected nodes)
- [ ] **Rift entry flow**: Momentum spend → tier selection → map generated → run begins

#### Week 6: Combat Rooms & Core Loop
- [ ] **Combat room**: Auto-resolve mechanic (team DPS vs monster HP, 10s timer)
- [ ] **Elite room**: 2x HP, 1.5x damage, guaranteed augment draft
- [ ] **Victory/defeat handling**: Victory → loot + augment draft. Defeat → 20% HP loss, retry or reroute.
- [ ] **Rift Coin economy**: Earn from combat rooms (10–30 per fight), spend in shops
- [ ] **Floor boss**: Unique mechanic per floor (regen, reflect, adds, combo). 20s timer.
- [ ] **Run death/retreat**: Keep all loot, end run, return to idle

#### Week 7: Augment System
- [ ] **60 augments**: Implement all 4 categories × 3 tiers (Offense/Defense/Economy/Synergy)
- [ ] **Draft mechanic**: After combat/elite room, present 3 random augments (weighted by floor), pick 1
- [ ] **Augment tracker**: Sidebar showing current augments held (max 12)
- [ ] **Rest room upgrade**: Promote 1 augment (Common→Rare or Rare→Epic)
- [ ] **12 synergy combos**: Hidden bonus effects when specific augment pairs are held
- [ ] **Augment pool weighting**: Higher floors = more Rare/Epic offers

#### Week 8: Remaining Room Types & Events
- [ ] **Shop room**: Spend Rift Coins on specific augments, heals, temp buffs. Prices scale +20% per floor.
- [ ] **Rest room**: Choose heal (30% HP) OR upgrade (augment promotion). Mutual exclusion.
- [ ] **Event room**: 30 narrative events with risk/reward choices (60/40 splits, HP trades, shortcuts)
- [ ] **Mystery room**: Random type reveal on entry
- [ ] **Hero Rift Abilities**: Activate all 40 heroes' Rift-specific abilities (once per floor cooldown)

#### Week 9: Difficulty Tiers & Curses
- [ ] **10 difficulty tiers**: HP/damage scaling (1.0x → 10.0x), augment pool restrictions, tier unlock gates
- [ ] **8 curse modifiers**: Implement Withering, Greed Tax, Fog of War, Fragile Augments, Boss Rush, No Rest, Countdown, Mirror
- [ ] **Curse assignment**: Random from pool at Tier 6+ (1 curse at T6–7, 2 at T8–9, 3 at T10)
- [ ] **Tier 10 time pressure**: Global 90s floor timer + 3 curses
- [ ] **Prestige-gated tiers**: T6 requires Prestige 2, T8 requires Prestige 5, T10 requires Prestige 10

#### Week 10: Rewards, Shop, Leaderboard & Polish
- [ ] **Rift Token rewards**: Scale with tier × rooms completed
- [ ] **Rift Relics**: 20 permanent minor bonuses, 1 per Tier 5+ clear (unique, one-time)
- [ ] **Rift shop tab**: Spend Rift Tokens on relics, cosmetics, augment-start packs
- [ ] **Rift leaderboard**: Per-season rankings (highest tier, fastest time, most rooms)
- [ ] **Server-side Rift validation**: Server generates seed → client reports path → server verifies rewards
- [ ] **Rift UI tab**: Complete tab with map view, augment tracker, tier selector, shop, leaderboard
- [ ] **Integration tests**: Map generation validity, augment combo triggers, reward calculations

### 3.3 Exit Criteria
- [ ] Full Rift Run loop playable from Tier 1 through Tier 10
- [ ] All 60 augments functional with 12 synergy combos
- [ ] All 7 room types working with correct mechanics
- [ ] 8 curses applied correctly at Tier 6+
- [ ] All 40 heroes' Rift Abilities functional
- [ ] Rift Tokens earned and spendable in Rift shop
- [ ] Rift Relics persistently saved and applied
- [ ] Server validates Rift reward claims
- [ ] Rift leaderboard displays and updates

---

## 4. Phase 2 — Stronghold (Weeks 8–13)

### 4.1 Goal
Build the hex-based tower defense mode: grid rendering, hero placement, 5 building types, 20-wave defense sessions, defense rating + passive resource generation, 5 difficulty tiers.

*Note: Phase 2 starts in Week 8, overlapping with Phase 1's final weeks. The hex grid renderer and Stronghold game logic are independent from Rift systems.*

### 4.2 Deliverables

#### Week 8–9: Hex Grid & Rendering
- [ ] **Hex grid data model**: 7×7 grid with hex types (Buildable, Path, Blocked)
- [ ] **Hex grid renderer**: Canvas/WebGL hex map with zoom, pan, tap-to-select (mobile: pinch-to-zoom)
- [ ] **3 map layouts**: Design 3 distinct maps with different path configurations and entry/exit points
- [ ] **Grid expansion logic**: +1 ring per prestige (up to 11×11)
- [ ] **Hex interaction**: Tap hex → context menu (place hero, build building, remove, info)

#### Week 10–11: Hero Placement & Buildings
- [ ] **Hero placement**: Assign heroes from roster to buildable hexes, class-based archetypes (Warrior=melee zone, Archer=ranged, etc.)
- [ ] **5 buildings**: Wall (path block), Trap (damage), Barracks (minion spawn), Watchtower (range buff), Healing Shrine (regen)
- [ ] **Building upgrades**: Per-building level (max 5–10), cost scaling at `baseCost × 1.5^(level-1)`
- [ ] **Placement limits**: Max heroes = team slot count, buildings limited by hex availability
- [ ] **Hero Stronghold Abilities**: Activate all 40 heroes' Stronghold-specific passive abilities
- [ ] **Synergy bonuses**: Vanguard Shield (+Taunt range), Blood Brothers (+Cleave damage), etc.

#### Week 11–12: Defense Waves & Combat
- [ ] **Wave system**: 20 waves per session, HP scaling `50 × 1.15^(wave-1) × tierMult`
- [ ] **4 enemy types**: Grunt (normal), Brute (2x HP, slow), Scout (fast, ignores first wall), Siege (targets buildings)
- [ ] **Enemy pathfinding**: A* on hex grid, recalculates when Walls placed/destroyed
- [ ] **Mini-bosses**: Every 5th wave (5x HP, unique ability per boss)
- [ ] **Between-wave repositioning**: 10s window, move heroes and buildings freely
- [ ] **Win/loss conditions**: Core survives 20 waves → full reward. Core destroyed → partial reward.
- [ ] **Momentum cost**: 8 per defense session

#### Week 12–13: Passive Generation, Tiers & UI
- [ ] **Defense Rating formula**: `wavesSurvived × 10 + heroesPlaced × 15 + totalBuildingLevels × 5`
- [ ] **Passive resource generation**: Gold/Shards/Scrap per hour based on defense rating (active while offline)
- [ ] **5 difficulty tiers**: Progressive unlocks with enemy type introductions and weather effects
- [ ] **Stronghold tab UI**: Hex grid editor, defense launcher, passive income dashboard, building management
- [ ] **Save/load Stronghold state**: Layout, building levels, defense rating, tier progress
- [ ] **Integration tests**: Pathfinding, wave spawning, defense rating calculation, passive gen math

### 4.3 Exit Criteria
- [ ] Hex grid renders correctly on web and mobile (7×7 at minimum, 11×11 at max)
- [ ] Heroes placeable with correct class archetypes and abilities
- [ ] All 5 buildings functional with upgrade paths
- [ ] 20-wave defense loop complete with all 4 enemy types + mini-bosses
- [ ] Pathfinding works (enemies reroute around Walls, Scouts ignore first Wall)
- [ ] Defense rating calculated correctly, passive gen active during offline
- [ ] All 5 tiers playable with correct scaling
- [ ] Stronghold layout persists across sessions

---

## 5. Phase 3 — Crucible Arena (Weeks 11–16)

### 5.1 Goal
Build the async PvP arena: team snapshots, ELO matchmaking, ban/draft phase, deterministic combat resolution with server validation, rating system, weekly tournaments, Arena shop.

*Note: Phase 3 starts in Week 11, reusing server infrastructure being built for Rift validation in Phase 1.*

### 5.2 Deliverables

#### Week 11–12: Snapshot & Matchmaking
- [ ] **Team snapshot system**: Save hero team state (stats, gear, formation) as immutable snapshot, update every 6h
- [ ] **Snapshot storage**: Firestore collection with player snapshots indexed by ELO range
- [ ] **ELO matchmaking**: Query snapshots within ±150 ELO, present 3 opponent options
- [ ] **Opponent preview**: Display name, ELO, power index, class distribution (not detailed stats)
- [ ] **Starting ELO**: 1000 for new players

#### Week 13: Ban/Draft Phase
- [ ] **Scout phase UI**: 10s timer, show opponent's 6-hero snapshot with class/rarity/rank
- [ ] **Ban system**: Player bans 1 opponent hero. Opponent auto-bans based on pre-set priority list.
- [ ] **Ban priority settings**: Arena settings screen where player orders their own heroes (bottom = first banned)
- [ ] **Deploy phase**: Select 6 heroes from remaining roster, assign formation (Front/Mid/Back, max 2 per row)
- [ ] **Soft power cap**: Diminishing returns if power index exceeds bracket's 95th percentile

#### Week 14: Deterministic Combat
- [ ] **Server-generated random seeds**: Per-round seed determines all RNG (crits, skill procs)
- [ ] **Deterministic combat engine**: Given team A + team B + seed → produce identical result on client and server
- [ ] **Best of 3 rounds**: Each round uses different seed. 30s timer per round. HP% tiebreaker.
- [ ] **Result submission**: Client sends match ID + claimed result → server replays → verifies
- [ ] **Mismatch handling**: Reject invalid results, flag account

#### Week 15: Rating, Seasons & Tournaments
- [ ] **ELO adjustments**: Win +25 (±5–15 delta), Loss −20 (±5–15 delta), win streak +5/win (cap +15)
- [ ] **Rank tiers**: Bronze/Silver/Gold/Diamond/Legend with ELO thresholds
- [ ] **14-day seasons**: ELO soft-reset (compress 50% toward 1000), reward distribution
- [ ] **Weekly tournaments**: 8-player bracket, 24h per round, best-of-5, entry cost (15 Momentum + 100 Marks)
- [ ] **Anti-cheese**: Intentional loss detection (3+ losses to same opponent/24h), win trading flags
- [ ] **Minimum games**: 10 matches required for season rewards

#### Week 16: Arena Shop, UI & Integration
- [ ] **Arena Marks currency**: Earned from wins + season rewards + tournaments
- [ ] **Arena shop**: Exclusive heroes (2 per season, 2000 Marks), skins, banners, Rift augment packs
- [ ] **Crucible tab UI**: Matchmaking screen, team builder, ban settings, rating display, shop, leaderboard
- [ ] **Arena leaderboard**: Per-season ELO rankings + tournament results
- [ ] **Integration tests**: Deterministic combat replay verification, ELO math, snapshot update cycle
- [ ] **Load testing**: Matchmaking query performance with 1K/10K/100K snapshots

### 5.3 Exit Criteria
- [ ] Full Arena match flow: matchmake → scout → ban → deploy → combat → result
- [ ] Server validates all match results via deterministic replay
- [ ] ELO system working with correct adjustments and rank tier placement
- [ ] Seasons work: soft-reset, reward distribution, minimum game requirement
- [ ] Weekly tournament bracket functional (async, 3 rounds)
- [ ] Arena shop populated with buyable items
- [ ] Anti-cheese measures active
- [ ] Snapshots update on 6h cycle

---

## 6. Phase 4 — Guild & Social V2 (Weeks 14–18)

### 6.1 Goal
Extend V1's social foundation with Guild Stronghold Raids and mode-integrated social features.

### 6.2 Deliverables

#### Week 14–15: Guild Stronghold Raids
- [ ] **Raid declaration**: Guild leader initiates raid against another guild's Stronghold snapshot
- [ ] **Defender snapshot**: Capture defending guild's best Stronghold layout
- [ ] **Attacker contribution**: Each guild member contributes up to 3 heroes, combined team attacks layout
- [ ] **Persistent damage**: Raid lasts 48h, damage accumulates across member contributions
- [ ] **Raid combat**: Reverse tower defense — attacker heroes push through defender's waves
- [ ] **Reward distribution**: Raiding guild splits Gold + Arena Marks + cosmetics. Defenders get bonus for strong defense.

#### Week 16–17: Social Integration
- [ ] **Mode activity in social feed**: Rift completions, Arena wins, Stronghold defenses appear in guild/friend activity
- [ ] **Guild leaderboard**: Aggregate seasonal scores for guild ranking
- [ ] **Friend challenges**: Send Arena challenge to friend (custom match, no ELO impact)
- [ ] **Spectate replays**: View guild members' Arena match replays (deterministic — replay from seed)
- [ ] **Port V1 social**: Chat, friends, DMs, presence, block/report — carry forward with minor updates

#### Week 18: Polish & Edge Cases
- [ ] **Raid matchmaking**: Prevent raiding same guild twice per season
- [ ] **Guild size balancing**: Raid difficulty scales with defender guild size
- [ ] **Notification system**: Push notifications for raid results, tournament rounds, season end
- [ ] **Social tab V2 UI**: Updated with raid status, guild rankings, friend challenges

### 6.3 Exit Criteria
- [ ] Guild Stronghold Raids functional end-to-end (declare → contribute → resolve → rewards)
- [ ] Social feed shows cross-mode activity
- [ ] Friend challenges work (custom Arena matches)
- [ ] V1 social features ported and functional
- [ ] Guild leaderboard aggregates correctly

---

## 7. Phase 5 — Seasonal System & Monetization (Weeks 16–20)

### 7.1 Goal
Implement the composite seasonal scoring system, Battle Pass, cosmetic shop, and Momentum refill IAP. Establish the per-season content pipeline.

### 7.2 Deliverables

#### Week 16–17: Seasonal Scoring & Rewards
- [ ] **Composite score formula**: `(wave × 12) + (riftTier × 500) + (arenaELO × 2) + (defenseRating × 3)`
- [ ] **Season timer**: 14-day seasons with automated rotation
- [ ] **Reward tiers**: Bronze/Silver/Gold/Diamond/Legend with score thresholds
- [ ] **Season-end pipeline**: Calculate scores → determine tiers → distribute rewards → reset → start new season
- [ ] **Reset logic**: Score resets, Arena ELO soft-resets, Battle Pass resets. Everything else stays.

#### Week 18–19: Battle Pass & Monetization
- [ ] **Battle Pass (free track)**: 10 tiers, earn XP from all modes, rewards: Gold, Shards, Scrap
- [ ] **Battle Pass (premium track)**: 10 additional tiers ($4.99), rewards: cosmetics, Momentum refills, crafting recipes. **No stat advantages.**
- [ ] **Battle Pass XP sources**: Idle waves (1 XP/wave), Rift rooms (5 XP/room), Arena matches (10 XP/match), Stronghold waves (3 XP/wave)
- [ ] **Cosmetic shop**: Hero skins, Stronghold base themes, UI themes, summon animations ($0.99–$4.99)
- [ ] **Momentum refill IAP**: $0.99 for 30 Momentum, hard cap 3/day
- [ ] **Payment integration**: App store IAP (mobile) + Stripe/equivalent (web)
- [ ] **Receipt validation**: Server-side receipt verification for all purchases

#### Week 20: Content Pipeline & Tooling
- [ ] **Season content template**: Checklist for each new season's content requirements
- [ ] **Per-season additions**: 1 Stronghold map, 2 Arena heroes, 5 Rift augments, 1 Battle Pass
- [ ] **Content authoring tools**: JSON/config-driven definitions for heroes, augments, maps (no code changes needed)
- [ ] **A/B test framework**: Feature flags for pricing, reward values, and content variations
- [ ] **Analytics dashboards**: Conversion rates, Momentum refill purchases, Battle Pass completion rates

### 7.3 Exit Criteria
- [ ] Full season cycle works: start → score → rewards → reset → new season
- [ ] Battle Pass tracks progress and grants rewards correctly (free + premium)
- [ ] Cosmetic shop functional with real payments
- [ ] Momentum refills work with daily hard cap
- [ ] Per-season content pipeline documented and tooled
- [ ] No pay-for-power: verified that no purchasable item grants combat stats

---

## 8. Phase 6 — Polish & Launch (Weeks 18–24)

### 8.1 Goal
Onboarding redesign, performance optimization, accessibility, balance pass, closed beta, and bug fix sprint to reach launch-ready state.

### 8.2 Deliverables

#### Week 18–19: Onboarding V2
- [ ] **Tutorial flow redesign**: Progressive introduction across all modes (see GDD §10.1)
  - Wave push tutorial (5 min)
  - First summon at Wave 5
  - Guided Rift Run at Wave 15
  - Stronghold tutorial at Wave 25
  - First prestige at Wave 100
  - Arena unlock at Prestige 1
- [ ] **Strategic Advisor update**: Add mode-specific guidance ("Try a Rift Run!", "Your Stronghold needs defenders")
- [ ] **Time-to-first-prestige verification**: Must be under 60 minutes
- [ ] **Time-to-all-modes-unlocked verification**: Must be under 2 hours
- [ ] **New player dead zone fix**: Verify waves 20–60 have smooth progression (mid-game gold boost)

#### Week 20–21: Performance & Platform QA
- [ ] **Hex grid rendering performance**: 60fps on mid-range mobile during Stronghold defense
- [ ] **Node map rendering performance**: Smooth scrolling on Rift map with 25 rooms visible
- [ ] **Offline simulation accuracy**: 48-hour soak test comparing simulated vs. real-time results
- [ ] **Memory profiling**: No leaks during extended play sessions (2+ hours)
- [ ] **Bundle size check**: Web build under 5MB initial load, lazy-load mode-specific assets
- [ ] **Mobile/web parity**: All 8 tabs functional on both platforms, responsive layouts verified
- [ ] **Touch gesture QA**: Stronghold pinch-to-zoom, Rift map scroll, Arena swipe-to-ban

#### Week 21–22: Accessibility & Localization
- [ ] **WCAG AA compliance**: 4.5:1 contrast ratios, focus indicators, keyboard navigation
- [ ] **Screen reader labels**: All interactive elements labeled (carry forward V1's a11y work)
- [ ] **Color-blind modes**: Alternative color schemes for rarity tiers and hex grid
- [ ] **i18n framework**: All user-facing strings in locale files (English complete, framework ready for other languages)
- [ ] **RTL layout support**: Structural readiness (no content required at launch)

#### Week 22–23: Balance Pass
- [ ] **Balance simulation scripts**: Automated runs for:
  - Time-to-first-prestige (target: 45–60 min)
  - Rift clear rates by power level (Tier 1: 95%+, Tier 5: 60%, Tier 10: 15%)
  - Arena ELO distribution (should approximate normal curve around 1000)
  - Stronghold passive gen vs. idle wave income (Stronghold should be 20–40% of total idle income)
  - Momentum economy: average active play time per day (target: 20–30 min with full Momentum spend)
  - Currency bottleneck detection per progression phase
- [ ] **Difficulty tuning**: Adjust formulas based on simulation results
- [ ] **Economy tuning**: Adjust costs/rewards to hit target session lengths
- [ ] **Augment balance**: Win-rate tracking per augment, nerf/buff outliers

#### Week 23–24: Closed Beta & Launch
- [ ] **Closed beta**: 2-week invite-only beta (500–1000 players)
- [ ] **Beta telemetry**: Track time-to-milestones, mode engagement rates, drop-off points, crash rates
- [ ] **Bug fix sprint**: Address all critical/high bugs from beta
- [ ] **Server load testing**: Simulate 10K concurrent users (Arena matchmaking, Rift validation, Stronghold passive gen)
- [ ] **Launch checklist**:
  - [ ] All modes functional
  - [ ] Server validation working for Arena + Rift
  - [ ] Payment processing verified
  - [ ] First season content loaded
  - [ ] Analytics dashboards live
  - [ ] App store listings prepared (if mobile)
  - [ ] Web deployment pipeline verified

### 8.3 Exit Criteria
- [ ] All onboarding milestones hit target times
- [ ] Performance benchmarks met (60fps Stronghold, smooth Rift map, <5MB web bundle)
- [ ] WCAG AA compliant
- [ ] Balance simulation targets within ±15% of goals
- [ ] Closed beta: crash rate < 0.5%, no critical bugs open
- [ ] Server handles 10K concurrent with <200ms response times
- [ ] **Launch-ready build signed off**

---

## 9. Phase Timeline (Gantt)

```
WEEK    1  2  3  4  5  6  7  8  9  10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
─────── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
P0 Found██ ██ ██ ██
P1 Rift             ██ ██ ██ ██ ██ ██
P2 Strong                  ██ ██ ██ ██ ██ ██
P3 Arena                         ██ ██ ██ ██ ██ ██
P4 Guild                                  ██ ██ ██ ██ ██
P5 Season                                       ██ ██ ██ ██ ██
P6 Polish                                             ██ ██ ██ ██ ██ ██ ██
─────── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──
BETA                                                                    ██ ██
LAUNCH                                                                        🚀
```

**Critical Path**: P0 → P1 → P3 (server infra) → P5 (seasons) → P6 (launch)

**Parallel Tracks**:
- P2 (Stronghold) runs parallel with P1 Weeks 8–10
- P4 (Guild) runs parallel with P3 Weeks 14–16
- P5 (Seasonal) runs parallel with P4 Weeks 16–18

---

## 10. Technical Decisions

### 10.1 Engine Evaluation Criteria

Evaluate during Week 1. Decision must be made by end of Week 1 to avoid downstream delays.

| Criterion | Weight | Godot + Web Export | Phaser 4 | React Native + Skia | Unity |
|-----------|--------|-------------------|----------|---------------------|-------|
| Hex grid rendering | High | ✅ Native 2D, built-in tilemap | ✅ Canvas/WebGL | ⚠️ Skia overlay, not native | ✅ Overkill |
| Web performance | High | ✅ WebAssembly export | ✅ Native web | ⚠️ React overhead | ❌ Heavy runtime |
| Mobile support | High | ✅ Native Android/iOS | ⚠️ Capacitor wrapper | ✅ Native | ✅ Native |
| Audio engine | Medium | ✅ Built-in | ✅ Web Audio API | ⚠️ Bolted-on | ✅ Built-in |
| Team familiarity (TS) | Medium | ⚠️ GDScript/C# | ✅ TypeScript | ✅ TypeScript | ⚠️ C# |
| Migration effort | High | ❌ Full rewrite | ⚠️ Partial rewrite | ✅ Incremental | ❌ Full rewrite |
| Bundle size | Medium | ⚠️ ~5MB WASM | ✅ ~1MB | ✅ Existing | ❌ 10MB+ |
| 60fps hex grid (mobile) | High | ✅ GPU-accelerated | ✅ Canvas | ⚠️ Depends on Skia perf | ✅ GPU |

**Recommendation**: **Phaser 4** if web-first priority (TypeScript familiarity, lightweight, fast). **Godot** if aiming for best cross-platform experience. **React Native + Skia** if minimizing migration risk.

### 10.2 Backend Architecture

```
┌─────────────┐     ┌──────────────────────┐
│  Client      │────▶│  Firebase Auth        │
│  (Game)      │     │  Firestore (state)    │
│              │     │  Analytics            │
└──────┬───────┘     └──────────────────────┘
       │
       │  HTTPS (REST)
       ▼
┌──────────────────────────────────────────┐
│  Cloud Functions (Server Validation)      │
│  ├── /v2/rift/validate                   │
│  ├── /v2/arena/validate                  │
│  ├── /v2/arena/matchmake                 │
│  ├── /v2/stronghold/snapshot             │
│  ├── /v2/season/calculate                │
│  ├── /v2/purchase/validate               │
│  └── /v2/leaderboard/submit             │
└──────────────────────────────────────────┘
```

**Key endpoints**:
| Endpoint | Purpose | Phase |
|----------|---------|-------|
| `/v2/rift/validate` | Verify Rift Run rewards match server-generated seed | P1 |
| `/v2/arena/matchmake` | Return 3 opponent snapshots within ELO range | P3 |
| `/v2/arena/validate` | Replay deterministic combat, verify result | P3 |
| `/v2/stronghold/snapshot` | Store defense rating for passive gen calculation | P2 |
| `/v2/season/calculate` | End-of-season score calculation and reward distribution | P5 |
| `/v2/purchase/validate` | Receipt verification for IAP | P5 |
| `/v2/leaderboard/submit` | Validated score submission for all leaderboards | P1+ |

### 10.3 Firestore Collections (V2 Additions)

| Collection | Purpose | Phase |
|------------|---------|-------|
| `rift_seeds` | Server-generated Rift map seeds | P1 |
| `rift_runs` | Completed run records (validation) | P1 |
| `rift_relics_{uid}` | Player's unlocked Rift Relics | P1 |
| `arena_snapshots` | Player team snapshots (updated every 6h) | P3 |
| `arena_matches` | Match records (teams, seed, result) | P3 |
| `arena_ratings` | ELO history per player per season | P3 |
| `arena_tournaments` | Tournament brackets and results | P3 |
| `stronghold_layouts` | Saved base configurations | P2 |
| `stronghold_ratings` | Defense rating snapshots for passive gen | P2 |
| `guild_raids` | Active and completed raid records | P4 |
| `seasons` | Season metadata, scores, rewards | P5 |
| `battle_passes` | Player Battle Pass progress | P5 |
| `purchases` | Validated IAP receipts | P5 |

---

## 11. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| **Engine migration takes longer than 1 week** | Medium | High (delays all phases) | Make decision by Day 3. If unclear, default to React Native + Skia (least migration). |
| **Hex grid performance on low-end mobile** | Medium | Medium | Profile early (Week 8). Fallback: reduce grid size, simplify rendering. |
| **Deterministic combat diverges client/server** | Low | High (Arena broken) | Extensive unit tests on combat engine. Floating-point → integer math only. Same code runs on both sides. |
| **Balance is off at launch** | High | Medium | Run simulation scripts early (Week 22). Closed beta (2 weeks) provides real data. Ship with server-side tuning knobs. |
| **Augment combos create exploits** | Medium | Medium | Cap augment count at 12. Test all 66 possible combo pairs. Server-validate Rift rewards. |
| **Player confusion from 4 modes** | Medium | Medium | Progressive unlock (modes unlock at Wave 15/25/Prestige 1). Strong tutorial per mode. Strategic Advisor guidance. |
| **Matchmaking pool too small at launch** | High | Medium (Arena) | Seed with bot snapshots at various ELO ranges. Gradually phase out as player base grows. |
| **Season content pipeline unsustainable** | Medium | Medium | Minimize per-season requirements (1 map, 2 heroes, 5 augments). Use config-driven authoring (no code changes). |
| **Momentum feels like energy gate / paywall** | Medium | High (player sentiment) | Generous cap (60+ base), fast regen (1/min), refill hard-capped (3/day). Test in beta. Adjust if negative sentiment. |
| **Scope creep** | High | High | GDD is the contract. No features added without GDD amendment. Cut Phase 4 (Guild Raids) before cutting core modes. |

---

## 12. Verification & QA Plan

### 12.1 Testing Pyramid

```
              ┌─────────┐
              │   E2E   │  ← 5–10 smoke tests (per mode happy path)
             ┌┴─────────┴┐
             │Integration │  ← 50+ tests (mode transitions, server validation)
            ┌┴───────────┴┐
            │  Unit Tests  │  ← 200+ tests (formulas, generators, reducers)
            └──────────────┘
```

### 12.2 Unit Tests (200+)

| Area | Tests | Phase |
|------|-------|-------|
| DPS formula (3-layer) | 15 | P0 |
| Momentum regen/cap/spend | 10 | P0 |
| Prestige path multipliers | 12 | P0 |
| Hero mastery XP + milestones | 10 | P0 |
| Gacha rates + pity | 15 | P0 |
| Economy (Gold summoning, currency conversions) | 12 | P0 |
| Rift map generation (valid paths, room distribution) | 20 | P1 |
| Augment draft (pool weighting, synergy combos) | 18 | P1 |
| Rift reward calculation | 10 | P1 |
| Hex grid pathfinding (A*) | 15 | P2 |
| Defense rating calculation | 8 | P2 |
| Passive resource generation | 8 | P2 |
| Building upgrade costs | 6 | P2 |
| Deterministic combat (seed → result) | 20 | P3 |
| ELO math (win/loss/streak/cap) | 12 | P3 |
| Season scoring formula | 8 | P5 |
| Battle Pass XP progression | 8 | P5 |

### 12.3 Integration Tests (50+)

| Area | Tests | Phase |
|------|-------|-------|
| Idle → Rift → Idle (Momentum spend/regen cycle) | 5 | P1 |
| Rift server validation (seed → path → rewards) | 8 | P1 |
| Stronghold defense session → passive gen update | 5 | P2 |
| Arena match flow (matchmake → ban → combat → result → ELO update) | 8 | P3 |
| Arena server validation (replay verification) | 8 | P3 |
| Guild raid lifecycle (declare → contribute → resolve → rewards) | 5 | P4 |
| Season lifecycle (start → score → reward → reset) | 5 | P5 |
| Battle Pass purchase → premium track unlock | 3 | P5 |
| IAP receipt validation | 3 | P5 |

### 12.4 E2E Smoke Tests (per mode)

| Test | Phase |
|------|-------|
| New player: wave push → first summon → deploy hero → push to Wave 25 | P0 |
| Prestige: reach Wave 100 → choose path → verify multiplier | P0 |
| Rift Run: enter Tier 1 → complete 5 rooms → draft augments → beat boss → claim rewards | P1 |
| Stronghold: place 3 heroes → build Wall → survive 5 waves → verify passive gen | P2 |
| Arena: matchmake → scout → ban → deploy → combat → verify ELO change | P3 |
| Season end: verify score → check reward tier → confirm season reset | P5 |
| Battle Pass: earn XP → claim reward tier → purchase premium → claim premium tier | P5 |

### 12.5 Balance Simulation

Automated scripts run nightly from Week 22:

| Simulation | Target | Tolerance |
|------------|--------|-----------|
| Time to first prestige | 45–60 min | ±15% |
| Time to all modes unlocked | Under 2 hours | Hard cap |
| Rift Tier 1 clear rate (new player power) | 95%+ | — |
| Rift Tier 5 clear rate (mid-game power) | 55–65% | ±10% |
| Rift Tier 10 clear rate (endgame power) | 10–20% | ±5% |
| Arena ELO distribution | Normal curve, mean ~1000 | σ < 400 |
| Stronghold passive gen vs. idle income | 20–40% of total | — |
| Average Momentum spend per day | 20–30 min of active play | ±20% |
| Gold bottleneck (hours of play before zero-gold state) | Never (if playing idle) | — |
| Shard bottleneck (hours to max-rank a Legendary hero) | 30–50 hours | ±25% |

### 12.6 Server & Performance Testing

| Test | Target | Phase |
|------|--------|-------|
| Arena matchmaking latency (10K snapshots) | <500ms | P3 |
| Arena matchmaking latency (100K snapshots) | <1s | P3 |
| Rift validation round-trip | <300ms | P1 |
| Stronghold passive gen batch calculation (10K players) | <30s | P2 |
| Season-end calculation (10K players) | <5 min | P5 |
| Concurrent WebSocket connections (chat/presence) | 10K | P4 |
| Web bundle initial load | <5MB | P6 |
| Hex grid 60fps (iPhone 12 equivalent) | Consistent | P2 |
| 48-hour offline soak test accuracy | ±1% vs real-time | P6 |

---

## 13. Post-Launch Cadence

### 13.1 Season Cadence (Every 14 Days)

Each season ships:
- 1 new Stronghold map
- 2 new Arena-exclusive heroes
- 5 new Rift augments
- 1 Battle Pass (free + premium)
- Balance patch (based on telemetry from previous season)
- Bug fixes

### 13.2 Major Update Cadence (Every 3 Months)

Potential major additions (post-launch, not in V2 scope):
- **New Rift room types** (e.g., Puzzle, Boss Rush, Survival)
- **New Stronghold buildings** (e.g., Teleporter, Arsenal, Moat)
- **Arena formats** (e.g., Draft Arena where you pick from a random hero pool, not your roster)
- **6th class** (new heroes, synergies, archetypes)
- **Clan Wars** (guild vs guild Arena tournaments)
- **Story content** (new campaign acts beyond V1's 13 chapters)
- **Additional prestige paths** (e.g., Scholar path for Codex/mastery bonuses)

### 13.3 Live Ops Monitoring

| Metric | Dashboard | Alert Threshold |
|--------|-----------|----------------|
| Daily Active Users | Firebase Analytics | <80% of 7-day average |
| Mode engagement split (Idle/Rift/Arena/Stronghold) | Custom | Any mode <10% engagement |
| Battle Pass completion rate | Custom | <30% free track, <50% premium track |
| Momentum refill purchase rate | Custom | <2% of DAU |
| Average session length | Firebase Analytics | <5 min (too short) or >90 min (too long, risk burnout) |
| Arena matchmaking wait time | Cloud Monitoring | >30 seconds |
| Rift validation failure rate | Cloud Monitoring | >1% (potential exploit) |
| Crash rate | Firebase Crashlytics | >0.5% |
| Server response time (p95) | Cloud Monitoring | >500ms |

---

## Appendix: Phase Dependency Graph

```
                    ┌──────────┐
                    │  PHASE 0 │
                    │Foundation│
                    └────┬─────┘
                    ┌────┼────────────────┐
                    ▼    ▼                ▼
              ┌─────────┐ ┌──────────┐ ┌──────────┐
              │ PHASE 1 │ │ PHASE 2  │ │ PHASE 3  │
              │  Rift   │ │Stronghold│ │  Arena   │
              └────┬────┘ └────┬─────┘ └────┬─────┘
                   │           │             │
                   │      ┌────┘             │
                   │      ▼                  │
                   │ ┌──────────┐            │
                   │ │ PHASE 4  │            │
                   │ │Guild/Soc │            │
                   │ └────┬─────┘            │
                   │      │                  │
                   └──────┼──────────────────┘
                          ▼
                   ┌──────────┐
                   │ PHASE 5  │
                   │ Seasonal │
                   └────┬─────┘
                        ▼
                   ┌──────────┐
                   │ PHASE 6  │
                   │  Polish  │
                   │ & Launch │
                   └──────────┘
```

---

*End of Development Roadmap V2*
