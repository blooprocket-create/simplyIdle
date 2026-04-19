# SimplyIdle V2 — Game Design Document

> **Version**: 2.0 Draft  
> **Date**: April 19, 2026  
> **Status**: Design Phase  
> **Predecessor**: [GDD.MD](GDD.MD) (SimplyIdle V1)

---

## Table of Contents

1. [Game Identity](#1-game-identity)
2. [Design Pillars](#2-design-pillars)
3. [Core Idle Loop (Evolved)](#3-core-idle-loop-evolved)
4. [Rift Runs — Roguelike Mode](#4-rift-runs--roguelike-mode)
5. [Crucible — Async PvP Arena](#5-crucible--async-pvp-arena)
6. [Stronghold — Tower Defense](#6-stronghold--tower-defense)
7. [Hero System V2](#7-hero-system-v2)
8. [Prestige Paths](#8-prestige-paths)
9. [Economy V2](#9-economy-v2)
10. [Progression Arc](#10-progression-arc)
11. [UI/UX Architecture](#11-uiux-architecture)
12. [Audio & Visual Direction](#12-audio--visual-direction)
13. [Anti-Cheat & Server Authority](#13-anti-cheat--server-authority)
14. [Seasonal Structure](#14-seasonal-structure)
15. [V1 → V2 Migration Summary](#15-v1--v2-migration-summary)

---

## 1. Game Identity

| Field | Value |
|-------|-------|
| **Title** | SimplyIdle V2 |
| **Genre** | Hybrid Idle/Active Auto-Battler with Roguelike, Arena, and Tower Defense modes |
| **Platforms** | Web (primary), Android, iOS |
| **Session Profile** | 2-minute idle check-ins + 10–30 minute active sessions |
| **Core Fantasy** | Build a compounding war machine through idle accumulation, then deploy it across three distinct active combat modes |
| **V1 → V2 Shift** | "Watch numbers go up" → "Idle to earn, play to spend" |

**Elevator Pitch**: SimplyIdle V2 keeps the addictive idle loop that made V1 work — auto-combat, wave pushing, hero collection, prestige — and answers the question V1 never could: *"What do I actually do with all this power I've been accumulating?"* Three new active modes (Rift Runs, Crucible Arena, Stronghold Defense) consume resources built during idle play, creating a satisfying earn → spend → earn rhythm where both halves make each other better.

---

## 2. Design Pillars

### 2.1 The Idle/Active Rhythm

Idle is the engine. Active modes are the steering wheel.

A new resource called **Momentum** bridges the two halves:
- Regenerates at **1 per minute** while the player is offline or idle
- Cap: **60 + (prestigeCount × 10)**
- Spent to enter active modes (5–15 Momentum per entry)
- Every minute AFK = 1 more unit of active content when you return

This creates a natural session rhythm: check in → claim idle rewards → spend Momentum on Rifts/Arena/Stronghold → close app → idle regenerates Momentum + waves + passive resources → repeat.

### 2.2 Horizontal Over Vertical

V1 has **14 multiplicative DPS layers** that create exponential power creep and balance nightmares. V2 caps multiplicative stacking at **3 layers**:

| Layer | Formula |
|-------|---------|
| 1. Base | `(playerDPS + heroDPS)` |
| 2. Prestige | Path-dependent multiplier (see §8) |
| 3. Gear | `1 + (gearScore × 0.0008)` |

V1's remaining 11 multiplier layers become **utility bonuses** instead of raw DPS:

| V1 Layer | V2 Conversion |
|----------|---------------|
| Achievement Legacy (+3% DPS per) | +1% cooldown reduction per achievement |
| Meta Damage Path (+8% per level) | +5% Rift augment quality per level |
| Tactics Facility (+1.5% per level) | +2% Stronghold building effectiveness per level |
| Class Passive (2–18% DPS) | Mode-specific utility (Warrior: +Taunt range, Archer: +Mark duration, etc.) |
| Hero Passive Traits (+3% DPS) | Unchanged in idle, adds Rift/Stronghold ability bonuses |
| Formation Multiplier (+5% per hero) | +Stronghold placement range per hero |
| Team Synergy (+8% full team) | Utility synergies (see §7) |
| Mastery Multiplier (+1% per level) | Ability variant unlocks (see §7) |
| VIP Damage Bonus (+3% per level) | Removed — no VIP power advantages |
| Unique Relic Bonus (10–35% DPS) | Unchanged (stays as gear layer component) |
| Temporary Buff (+18% DPS) | Unchanged (stays as temporary effect) |

New power comes from **options** — more heroes, more abilities, more builds, more modes — not bigger numbers.

### 2.3 Decision Density

Every session should include at least one meaningful choice. V1 has near-zero decisions after initial setup. V2 adds:

- **Rift Runs**: Path selection at every junction, augment draft (pick 1 of 3) after every fight, risk/retreat timing, rest room choices
- **Crucible**: Hero ban selection, team composition against scouted opponent, pre-set ban priority configuration
- **Stronghold**: Hero placement on hex grid, building placement and upgrades, repositioning between waves
- **Prestige**: Path specialization (Warlord / Merchant / Champion) — defines your playstyle identity

### 2.4 Async Competition

No real-time multiplayer requirement. All competitive features work through ghost/replay/snapshot mechanics:

- **Arena**: Fight AI-controlled snapshots of other players' teams
- **Guild Raids**: Contribution-based damage races against defender snapshots (48h window)
- **Seasonal Leaderboards**: Composite scoring across all modes
- **Tournaments**: 8-player async brackets with 24h per round

---

## 3. Core Idle Loop (Evolved)

### 3.1 What Stays from V1

The idle loop that works remains unchanged:

**Wave Combat** (100ms tick, 10 ticks/sec):
- Monster HP: `floor(30 × 1.12^(wave-1))` — Boss: ×5
- Gold Drop: `max(8, floor(8 × 1.14^(wave-1)))` — Boss: ×7
- EXP Drop: `max(5, floor(5 × 1.12^(wave-1)))` — Boss: ×4
- Damage/sec: `max(0.5, floor(0.8 × 1.12^(wave-1)) / 10)` — Boss: ×2.5
- Boss every 10th wave
- 5 monster affixes rotating (Armored, Berserk, Swift, Hoarder, Arcane)

**Heat/Tempo System**:
- 3 speeds: 1x (normal), 2x (fast), 4x (ultra)
- Heat builds at 7/sec when tempo > 1x, recovers at 4.62/sec at 1x
- Max heat: `100 + (level - 1) × 2`
- Overheat forces 1x

**Burst Mechanic**:
- 1 charge per kill, 3 on bosses, costs 15 to activate
- 4 × tempo amplified strikes at 1.8x DPS

**Offline Simulation**:
- Up to 8 hours simulated
- 300,000 iteration cap
- 1-second slices with batch optimization

### 3.2 What Changes

**Simplified DPS Formula** (3 layers instead of 14):

```
Base DPS:
  playerPhysical = (STR × 3.2 + AGI × (1.6 + classPhysWeight × 0.95) + level × 1.6)
  playerMagic    = (INT × (2 + classMagicWeight × 1.2) + SPI × (1.3 + classMagicWeight × 0.75) + level × 1.2)
  playerBase     = (physical × physWeight × 0.72 + magic × magicWeight × 0.52) / 1.85
  heroBase       = sum of active hero DPS contributions

Layer 1 — Base:     (playerBase + heroBase)
Layer 2 — Prestige: path-specific multiplier (see §8)
Layer 3 — Gear:     (1 + gearScore × 0.0008)

Final DPS = Layer1 × Layer2 × Layer3
```

**Momentum System** (new):
- Regeneration: +1 per minute while offline/idle
- Cap: `60 + (prestigeCount × 10)`
- Display: Visible in header alongside Gold/Shards/Essence
- Spend: Active mode entry costs (see each mode's section)
- Strategic tension: Do you spend Momentum on a Rift Run or save it for an Arena tournament?

**Mid-Game Gold Boost** (carried from V1):
- Waves 20–60: Base gold × `1.5 + 0.5 × ((wave - 20) / 40)`
- Smooths the early progression valley

---

## 4. Rift Runs — Roguelike Mode

### 4.1 Concept

Take your idle-built team into a procedurally generated dungeon. Combat auto-resolves using your team's stats, but **you** make all strategic decisions: which path to take, which augments to draft, when to push and when to retreat.

**Entry Cost**: 10 Momentum (Tiers 1–5), 15 Momentum (Tiers 6–10)

### 4.2 Node Map Generation

Slay the Spire–style branching paths:

```
[START]
   ├── Combat ── Elite ── Shop ──┐
   ├── Combat ── Rest  ── Combat ├── [FLOOR BOSS]
   └── Event  ── Combat ── Mystery┘
```

- **5 floors per run**, each floor = 3–5 rooms
- **3–4 columns wide** with branching connections
- Path choice at every junction — player sees room types before choosing
- Floor boss at end of each floor (mandatory, no routing around it)

**Room Type Distribution per Floor**:

| Type | Frequency | Icon |
|------|-----------|------|
| Combat | 50% | ⚔️ |
| Elite | 15% | 👹 |
| Shop | 10% | 🏪 |
| Rest | 10% | 🏕️ |
| Event | 10% | ❓ |
| Mystery | 5% | 🌀 |

### 4.3 Room Types

#### ⚔️ Combat Room
- Auto-resolve: Your team DPS vs monster HP. 10-second timer.
- Victory: Gold + chance of augment draft (60%)
- Defeat: Lose 20% team HP, room marked as failed, can retry or route around

#### 👹 Elite Room
- Harder enemy: 2x HP, 1.5x damage
- **Guaranteed** augment draft on victory + bonus loot (Rift Tokens, Shards)
- Higher risk, higher reward

#### 🏪 Shop Room
- Spend **Rift Coins** (earned from combat rooms, ~10–30 per fight)
- Buy: Specific augments (50–150 coins), team heal 20% (30 coins), temporary buff next fight (40 coins)
- Prices scale with floor number (+20% per floor)

#### 🏕️ Rest Room
Choose one:
- **Heal**: Restore 30% team max HP
- **Upgrade**: Promote one owned augment (Common → Rare or Rare → Epic)

Cannot do both. Creates meaningful choice.

#### ❓ Event Room
Narrative choice with risk/reward. Examples:
- *"A cursed chest glows in the corner. Open it?"* → 60% rare augment, 40% curse debuff (-10% DPS for 3 rooms)
- *"A wounded traveler offers a trade: 30% of your HP for a guaranteed Epic augment."*
- *"Shortcut through the collapsed tunnel: skip 2 rooms but enter the boss at -15% max HP."*

Events are drawn from a pool of 30, with floor-appropriate difficulty.

#### 🌀 Mystery Room
Random room type revealed only on entry. Could be any of the above — including a second boss or a free augment with no fight.

#### 🏰 Floor Boss (every floor end)
- Unique mechanic per floor:
  - Floor 1: Standard boss (intro)
  - Floor 2: Regenerates 5% HP per second (DPS check)
  - Floor 3: Reflects 20% damage back (survival check)
  - Floor 4: Summons adds every 5 seconds (AoE check)
  - Floor 5: All mechanics combined (final challenge)
- 20-second timer (longer than normal)
- Major loot: Rift Tokens + Gold + floor completion bonus
- Defeat: Run ends (but you keep all loot earned so far)

### 4.4 Augment System

The core strategic depth of Rift Runs. 60 augments across 4 categories, 3 tiers.

#### Categories

**Offense (15 augments)**:
| Name | Tier | Effect |
|------|------|--------|
| Sharpened Edge | Common | +8% DPS |
| Piercing Rounds | Common | Ignore 15% enemy defense |
| Critical Focus | Common | +12% crit chance |
| Vital Strike | Rare | Crits deal 2.5x instead of 1.8x |
| Execute Protocol | Rare | Enemies below 20% HP take 2x damage |
| Fury Cascade | Rare | Each kill in a room grants +3% DPS (stacks, resets between rooms) |
| Overcharge | Epic | +25% DPS, but +10% damage taken |
| Annihilate | Epic | First hit in each room deals 50% of enemy max HP |
| Infinite Edge | Epic | DPS increases by 2% per room completed this run |
| *(6 more)* | Mixed | Varied offensive effects |

**Defense (15 augments)**:
| Name | Tier | Effect |
|------|------|--------|
| Iron Skin | Common | -8% damage taken |
| Regeneration | Common | Heal 3% max HP after each room |
| Last Stand | Rare | When HP drops below 25%, gain 50% damage reduction for 5s |
| Lifesteal | Rare | Heal for 8% of damage dealt |
| Immortal Guard | Epic | Survive one killing blow per floor (1 HP) |
| *(10 more)* | Mixed | Varied defensive effects |

**Economy (15 augments)**:
| Name | Tier | Effect |
|------|------|--------|
| Scavenger | Common | +20% Rift Coin drops |
| Lucky Find | Common | +15% loot quality |
| Double Down | Rare | Shop items cost 30% less |
| Treasure Sense | Rare | Mystery rooms always reveal as Shop or Event |
| Midas Touch | Epic | Gold rewards from Rift tripled |
| *(10 more)* | Mixed | Varied economy effects |

**Synergy (15 augments)**:
| Name | Tier | Effect |
|------|------|--------|
| Warrior's Bond | Common | If 2+ Warriors: +15% team HP |
| Arcane Resonance | Common | If 2+ Mages: +12% DPS |
| Pack Tactics | Rare | If all 5 classes represented: +1 augment choice (pick 1 of 4) |
| Monk's Meditation | Rare | If 1+ Monk: heal 5% HP per room |
| Ultimate Formation | Epic | If full team synergy active: all augments gain +1 tier |
| *(10 more)* | Mixed | Class-conditional effects |

#### Tier Progression
- **Common** (gray): Base effects
- **Rare** (blue): ~1.8x the power of Common
- **Epic** (gold): ~2.5x the power of Common, often with unique mechanics

#### Draft Mechanic
- After each Combat/Elite room: Pick 1 of 3 random augments
- Offered augments are weighted by floor: higher floors = more Rare/Epic offers
- At Rest rooms: upgrade 1 owned augment by 1 tier
- Max augments held: 12 per run (forces prioritization)

#### Synergy Combos
Specific augment pairs unlock hidden bonus effects:
- **Piercing Rounds** + **Vital Strike** → "Armor Breaker": Crits ignore 100% defense
- **Regeneration** + **Lifesteal** → "Eternal Spring": Heal 15% max HP per room
- **Scavenger** + **Double Down** → "Merchant King": One free shop item per floor
- **Iron Skin** + **Overcharge** → "Glass Cannon Protocol": Negate Overcharge's downside
- 12 combo pairs total — discovering them is part of the fun

### 4.5 Difficulty Tiers

| Tier | HP Scale | Dmg Scale | Augment Pool | Curses | Unlock |
|------|----------|-----------|-------------|--------|--------|
| 1 | 1.0x | 1.0x | Common only | 0 | Default |
| 2 | 1.3x | 1.2x | Common + Rare | 0 | Clear Tier 1 |
| 3 | 1.7x | 1.4x | Common + Rare | 0 | Clear Tier 2 |
| 4 | 2.0x | 1.6x | All tiers | 0 | Clear Tier 3 |
| 5 | 2.5x | 1.8x | All tiers | 0 | Clear Tier 4 |
| 6 | 3.0x | 2.0x | All tiers | 1 | Clear Tier 5 + Prestige 2 |
| 7 | 4.0x | 2.5x | All tiers | 1 | Clear Tier 6 |
| 8 | 5.0x | 3.0x | All tiers | 2 | Clear Tier 7 + Prestige 5 |
| 9 | 7.0x | 4.0x | All tiers | 2 | Clear Tier 8 |
| 10 | 10.0x | 5.0x | All tiers | 3 + time pressure | Clear Tier 9 + Prestige 10 |

### 4.6 Curse Modifiers

8 curses, randomly assigned at Tier 6+:

| Curse | Effect |
|-------|--------|
| **Withering** | Team loses 1% max HP per room |
| **Greed Tax** | Shop prices doubled |
| **Fog of War** | Can't see room types until entered |
| **Fragile Augments** | Augments downgrade 1 tier every 5 rooms |
| **Boss Rush** | Every 3rd room is a boss |
| **No Rest** | Rest rooms replaced with Combat |
| **Countdown** | 90-second timer per floor (exceed = forced retreat) |
| **Mirror** | Enemies copy your team's class composition |

### 4.7 Rewards

| Source | Reward |
|--------|--------|
| Combat room | 10–30 Rift Coins (run-only) + Gold |
| Elite room | 20–50 Rift Coins + Gold + Shards |
| Floor Boss | 50–100 Rift Tokens (permanent) + Gold + Shards |
| Run completion | Bonus Rift Tokens (scales with tier × rooms completed) |
| Tier 5+ clear | 1 **Rift Relic** (permanent minor bonus) |

**Rift Relics** (20 total, one-time unlocks):
- Examples: +2% Momentum regen rate, +5% Rift Coin drops, +1% team HP in all modes, +3% Gold from idle waves, +10% Stronghold building HP
- Each relic is unique — once you have it, it's permanent

**On Death**: Keep all loot earned so far. Lose remaining rooms. No permanent penalty.

### 4.8 Rift Leaderboard

Per-season rankings:
- **Highest tier cleared** (primary)
- **Fastest clear time per tier** (secondary)
- **Most rooms completed in a single run** (tertiary)

---

## 5. Crucible — Async PvP Arena

### 5.1 Concept

ELO-rated async arena. Fight AI-controlled **snapshots** of other players' teams. No real-time connection required — there's always someone to fight, any time of day.

**Entry Cost**: 5 Momentum per match, 15 Momentum per tournament entry

### 5.2 Match Flow

#### Step 1: Matchmaking
- ELO ± 150 range
- System presents 3 opponent options within your range
- You see: opponent name, ELO, power index, class distribution — then choose who to fight

#### Step 2: Scout Phase (10 seconds)
- See opponent's 6-hero team snapshot:
  - Class icons, rarity stars, hero rank
  - Total gear score and power index
  - **NOT** visible: specific stat allocation, augments, or ability variants
- Plan your counter-composition

#### Step 3: Ban Phase
- You ban **1** of their heroes (remove from their snapshot)
- They auto-ban **1** of yours based on their **pre-set ban priority list**
  - Players configure this in Arena settings: ordered list of your own heroes
  - Bottom of list = first to be banned by opponents
  - Strategic: do you protect your carry by putting it high on the list (opponents ban something weaker) or bait by putting it low?

#### Step 4: Deploy Phase
- Select your 6 heroes from remaining roster
- Assign formation (Front / Mid / Back):
  - **Front**: +6% HP, -5% incoming damage
  - **Mid**: +3% DPS, +2% HP
  - **Back**: +5% DPS, +3% incoming damage (glass cannon)
  - Max 2 per row

#### Step 5: Combat
- Auto-resolves. **Best of 3 rounds.**
- Each round uses a different random seed (creates variance — crits, skill procs)
- Round timer: 30 seconds
- If both teams alive after 30s: higher remaining HP% wins the round
- Winning 2 of 3 rounds wins the match

### 5.3 Rating System

| Parameter | Value |
|-----------|-------|
| Starting ELO | 1000 |
| Win gain | +25 base (adjusted ±5–15 by opponent ELO delta) |
| Loss penalty | -20 base (same adjustment) |
| Win streak bonus | +5 per consecutive win (caps at +15 bonus) |
| Loss floor | Cannot drop below 0 ELO |

**Soft power cap per bracket**: If your power index exceeds the bracket's 95th percentile, diminishing returns apply to stats above the threshold (prevents whale domination while allowing natural progression advantage).

### 5.4 Rank Tiers & Season Rewards

| Tier | ELO Range | Season Reward |
|------|-----------|---------------|
| **Bronze** | 0–1199 | 50 Arena Marks |
| **Silver** | 1200–1499 | 150 Arena Marks + Silver banner |
| **Gold** | 1500–1799 | 300 Arena Marks + Gold banner |
| **Diamond** | 1800–2099 | 500 Arena Marks + Diamond banner + exclusive hero skin |
| **Legend** | 2100+ | 800 Arena Marks + Legend banner + exclusive hero |

**Seasons**: 14 days. ELO soft-resets at season end: compressed 50% toward 1000 (a 1600-rated player starts next season at 1300).

### 5.5 Weekly Tournaments

- **Format**: 8-player single-elimination bracket
- **Pace**: 24 hours per round (3 rounds = 3 days total)
- **Matches**: Best of 5 (instead of normal best of 3)
- **Entry**: 15 Momentum + 100 Arena Marks
- **Matchmaking**: Random seeding from entrants within ±200 ELO
- **Prizes**:
  - Winner: Exclusive title + 500 Arena Marks + tournament-only hero skin
  - Runner-up: 300 Arena Marks
  - Semi-finalists: 150 Arena Marks
  - All entrants: 50 Arena Marks (participation)

### 5.6 Arena Shop

Spent with **Arena Marks** currency:

| Item | Cost | Notes |
|------|------|-------|
| Exclusive hero (2 per season rotation) | 2,000 Marks | Arena-only heroes, rotates seasonally |
| Hero skins | 500–1,500 Marks | Class-specific cosmetics |
| Banners and titles | 200–800 Marks | Profile decoration |
| Rift augment pack | 300 Marks | Start a Rift Run with 1 pre-selected augment |

### 5.7 Anti-Cheese Measures

- Snapshots update every **6 hours** (can't manipulate team between scout and fight)
- Soft power cap per ELO bracket (see §5.3)
- **Intentional loss detection**: 3+ losses to same opponent in 24h = matchmaking block
- **Win trading detection**: Suspicious ELO patterns flagged for review
- **Minimum games per season**: 10 matches required for season reward eligibility

---

## 6. Stronghold — Tower Defense

### 6.1 Concept

Build and upgrade a persistent hex-based base. Deploy heroes as "towers." Defend against scripted enemy waves. Your base generates **passive resources even when not defending**, connecting tower defense directly to the idle loop.

**Entry Cost**: 8 Momentum per defense session

### 6.2 Base Grid

- **Starting size**: 7×7 hex grid
- **Expandable**: +1 ring per prestige (up to 11×11 at Prestige 5+)
- **Hex types**:
  - 🟩 **Buildable**: Place heroes or construct buildings
  - 🟫 **Path**: Enemy route (fixed, cannot build on)
  - ⬛ **Blocked**: Terrain (fixed, cannot build on)
- **Layout**: 3 enemy entry points, 1 core to defend
- Enemy paths are fixed per map layout
- **3 maps at launch**, more added seasonally

### 6.3 Hero Placement

Heroes from your roster are placed on buildable hexes. Each class has a defense archetype:

| Class | Role | Range | Special Ability |
|-------|------|-------|----------------|
| **Warrior** | Zone Control | 1 hex (melee) | **Taunt** — forces enemies in range to attack this hero first. Absorbs hits. |
| **Berserker** | Melee DPS | 1 hex (melee) | **Cleave** — damages all enemies in hex. 1.5x damage when hero HP < 50%. |
| **Archer** | Single-Target Ranged | 3 hexes | **Mark** — first enemy hit takes 15% more damage from all sources for 5 seconds. |
| **Mage** | AoE Ranged | 2 hexes (splash) | **Detonate** — every 5th attack hits entire hex for 2x damage. |
| **Monk** | Support Aura | 2 hex radius | **Aura** — all friendly heroes in range gain +10% attack speed and +5% damage. |

**Placement limits**: Max heroes = team slot count (6 at start, scales with prestige).

### 6.4 Buildings

Constructed on empty buildable hexes. Cost Gold + Scrap.

| Building | Effect | Max Level | Base Cost |
|----------|--------|-----------|-----------|
| **Wall** | Blocks enemy pathing (forces reroute). 500 HP per level. | 10 | 2,000 Gold + 20 Scrap |
| **Trap** | 50 + 20×level damage when enemy crosses. 30s cooldown. | 10 | 1,500 Gold + 15 Scrap |
| **Barracks** | Auto-spawns 1 minion per wave. Minion blocks enemies for 5s, then dies. | 5 | 5,000 Gold + 40 Scrap |
| **Watchtower** | +1 range to all heroes within 2 hexes. +10% crit chance. | 5 | 4,000 Gold + 35 Scrap |
| **Healing Shrine** | Restores 3% max HP per wave to all heroes within 2 hexes. | 5 | 3,500 Gold + 30 Scrap |

**Upgrade costs**: Each level costs `baseCost × 1.5^(level-1)`.

### 6.5 Defense Waves

**Per Session**: 20 waves

**Wave HP scaling**: `50 × 1.15^(wave-1) × tierMultiplier`

**Enemy Types (4)**:

| Type | HP | Speed | Special |
|------|-----|-------|---------|
| **Grunt** | 1.0x | Normal | None — basic enemy |
| **Brute** | 2.0x | Slow (0.6x) | High HP sponge |
| **Scout** | 0.5x | Fast (1.8x) | Ignores first Wall encountered |
| **Siege** | 3.0x | Slow (0.5x) | Targets buildings instead of core |

**Mini-Boss** (every 5th wave): 5x HP, unique ability per boss type:
- Wave 5 boss: Summons 3 Grunts on death
- Wave 10 boss: Regenerates 3% HP/sec
- Wave 15 boss: Armored — takes 50% reduced damage from non-Mage sources
- Wave 20 boss (final): All abilities combined

**Between waves**: 10-second repositioning window. Move heroes and buildings freely.

**Win condition**: Core survives all 20 waves → session complete, full rewards.
**Loss condition**: Core destroyed → session ends at wave of failure, partial rewards (proportional to waves cleared).

### 6.6 Defense Rating & Passive Generation

**Defense Rating** = `wavesSurvived × 10 + heroesPlaced × 15 + totalBuildingLevels × 5`

**Passive resource generation** (per hour, active while offline):

| Resource | Formula |
|----------|---------|
| Gold | `defenseRating × 8` |
| Shards | `floor(defenseRating × 0.3)` |
| Scrap | `floor(defenseRating × 0.15)` |

This directly connects Stronghold to the idle loop: a better base = more idle income = faster wave pushing = stronger team = better Stronghold defense.

### 6.7 Stronghold Tiers

| Tier | Unlock | HP Scale | Special |
|------|--------|----------|---------|
| 1 | Default | 1.0x | Grunts and Brutes only |
| 2 | Clear Tier 1 | 1.5x | Scouts appear |
| 3 | Clear Tier 2 | 2.2x | Siege enemies appear |
| 4 | Clear Tier 3 + Prestige 2 | 3.5x | Mini-boss abilities rotate randomly |
| 5 | Clear Tier 4 + Prestige 5 | 5.0x | All enemy types + weather effects (fog = reduced range, storm = periodic AoE damage) |

### 6.8 Guild Stronghold Raids

**Concept**: Guilds can asynchronously raid each other's Stronghold layouts.

**Mechanics**:
- Defender's base layout is saved as a **snapshot** (defender loses nothing — it's a copy)
- Attacker's guild members each contribute up to 3 heroes
- Combined attack team fights through the defender's 20-wave layout in reverse (your heroes are the "enemies" pushing through their base)
- Raid window: **48 hours** — guild members contribute damage over time
- Damage is persistent across contributions

**Rewards**:
- Raiding guild: Gold + Arena Marks + exclusive Stronghold cosmetics (base themes)
- Defending guild: Bonus Gold for having a strong defense (scaled by waves the attackers failed to clear)

---

## 7. Hero System V2

### 7.1 Simplified Roster

**40 heroes at launch** (down from V1's 65). Each hero is more mechanically distinct.

**8 heroes per class** (5 classes × 8 = 40):
- Warrior (8), Berserker (8), Archer (8), Mage (8), Monk (8)
- Distributed across 5 rarity tiers (roughly: 3 Common, 2 Rare, 1 Epic, 1 Legendary, 1 Mythic per class)
- Post-launch: 2 new heroes per season (Arena-exclusive)

### 7.2 Rarities (5 tiers, down from 8)

| Rarity | Summon Rate | Power Mult | Rank-Up Shard Cost Mult |
|--------|-----------|-----------|------------------------|
| **Common** | 50% | 1.0x | 1.0x |
| **Rare** | 28% | 1.15x | 1.7x |
| **Epic** | 14% | 1.35x | 2.5x |
| **Legendary** | 6% | 1.6x | 3.7x |
| **Mythic** | 2% | 2.0x | 5.5x |

### 7.3 Pity System

| Parameter | Value |
|-----------|-------|
| Hard pity threshold | 25 pulls |
| Soft pity start | Pull 18 |
| Soft pity boost | +4% Legendary+ chance per pull past 18 |
| Hard pity guarantee | Legendary or Mythic |
| Hard pity distribution | 80% Legendary, 20% Mythic |

### 7.4 Per-Hero Kit (3 Abilities)

Every hero has exactly 3 abilities:

1. **Passive Trait** (always active, all modes):
   - Carried from V1 concept. Examples: "+3% team DPS", "-2% incoming damage", "+4% gold gain"
   - Active in idle wave combat, Rift Runs, Arena, and Stronghold

2. **Rift Ability** (usable in Rift Runs only):
   - Activated manually during Rift events, rest rooms, or pre-combat
   - Cooldown: once per floor
   - Examples:
     - *Scout Ahead* (Archer): Reveal all rooms on current floor
     - *Emergency Heal* (Monk): Restore 25% team max HP
     - *Berserk Charge* (Berserker): Next combat room deals 2x DPS
     - *Arcane Sight* (Mage): See augment options before entering a draft room
     - *Shield Wall* (Warrior): Reduce damage taken by 40% in next combat

3. **Stronghold Ability** (passive while placed in Stronghold):
   - Active only when hero is placed on the hex grid
   - Examples:
     - *Fortify* (Warrior): Adjacent Walls gain +50% HP
     - *Rallying Cry* (Berserker): Adjacent heroes gain +15% attack speed
     - *Overwatch* (Archer): Attack range +1 hex
     - *Chain Lightning* (Mage): Attacks bounce to 1 additional enemy
     - *Tranquil Zone* (Monk): Enemies in aura radius are slowed 20%

### 7.5 Hero Mastery

Using a hero across any mode earns Mastery XP. 10 levels per hero.

| Level | Unlock |
|-------|--------|
| 1 | Hero usable (default) |
| 3 | Passive trait gains secondary effect (e.g., "+3% DPS" becomes "+3% DPS and +1% crit chance") |
| 5 | Rift Ability enhanced version (e.g., Scout Ahead → reveals rooms AND previews augment offers) |
| 7 | Stronghold Ability enhanced version (e.g., Fortify → Walls are also immune to Siege targeting) |
| 10 | Cosmetic mastery crown + all abilities at peak + hero-specific emote |

**Mastery XP sources**:
- Idle waves: 1 XP per wave (active team heroes only)
- Rift Runs: 10 XP per room completed
- Arena matches: 20 XP per match (win or lose)
- Stronghold defense: 5 XP per wave survived

### 7.6 Team Synergies (Utility, Not DPS)

| Synergy | Requirement | Effect |
|---------|------------|--------|
| **Vanguard Shield** | 2+ Warriors | Taunt radius +1 hex in Stronghold |
| **Expose Weakness** | 1 Archer + 1 Mage | Enemies in Rift take +1 extra hit per combat round |
| **Versatility** | 3+ unique classes | +1 augment choice in Rift drafts (pick 1 of 4 instead of 3) |
| **Monoclass Fervor** | 3+ same class | +20% gold in idle waves |
| **Resilience Pact** | 2+ Monks | Team starts Rift with 10% shield |
| **Blood Brothers** | 2+ Berserkers | Cleave damage +30% in Stronghold |
| **Full Spectrum** | All 5 classes | +10% Momentum regen rate |

### 7.7 Summoning (Reworked)

**Cost**: 10,000 Gold per single summon, 90,000 per x10 (10% discount)

No more Boss Tears or Diamonds for summoning. Unified Gold economy keeps things simple.

**Spark Token Exchange** (carried from V1, simplified):
| Item | Cost |
|------|------|
| 1 Free Summon | 50 Sparks |
| Choose Rare hero | 150 Sparks |
| Choose Epic hero | 500 Sparks |
| Choose Legendary hero | 1,500 Sparks |
| Choose Mythic hero | 5,000 Sparks |

Duplicate heroes grant Spark Tokens based on rarity (Common: 1, Rare: 5, Epic: 15, Legendary: 40, Mythic: 100).

---

## 8. Prestige Paths

### 8.1 Core Change

V1's flat `1.5^prestigeCount` multiplier is replaced with **3 specialization paths**. You choose one when you prestige. Can respec for 500 Shards.

### 8.2 Path Definitions

#### ⚔️ Warlord (Combat Specialist)
| Attribute | Value |
|-----------|-------|
| DPS Multiplier | `1.3^prestigeCount` (highest raw DPS) |
| Rift Bonus | +2 rooms per floor, -20% Rift monster HP |
| Idle Bonus | Burst cooldown -30%, heat recovery +25% |
| Arena Bonus | — |
| Stronghold Bonus | — |

Best for: Players who want to push waves and dominate Rifts.

#### 💰 Merchant (Economy Specialist)
| Attribute | Value |
|-----------|-------|
| DPS Multiplier | `1.15^prestigeCount` (lowest raw DPS) |
| Rift Bonus | +30% Rift Coin drops |
| Idle Bonus | +50% gold from all sources |
| Arena Bonus | — |
| Stronghold Bonus | +30% passive resource generation, -25% facility/building upgrade costs |

Best for: Players who want to optimize economy, build the best Stronghold, and outscale over time.

#### 🏆 Champion (Competition Specialist)
| Attribute | Value |
|-----------|-------|
| DPS Multiplier | `1.2^prestigeCount` (mid DPS) |
| Rift Bonus | — |
| Idle Bonus | — |
| Arena Bonus | +50 starting ELO per prestige, +1 hero ban (ban 2 total), tournament entry cost halved |
| Stronghold Bonus | — |

Best for: Players who want to climb Arena and compete in tournaments.

### 8.3 Prestige Requirements (Unchanged from V1)

**Wave requirement**: `ceil(100 × 1.12^prestigeCount)`

| Prestige | Wave Required |
|----------|--------------|
| 0 → 1 | 100 |
| 1 → 2 | 112 |
| 2 → 3 | 125 |
| 5 → 6 | 176 |
| 10 → 11 | 311 |
| 25 → 26 | 1,701 |

### 8.4 What Resets / What Stays

| Resets | Stays |
|--------|-------|
| Wave counter (back to 1) | Hero roster + ranks + mastery |
| Hero levels (back to 1) | Equipment inventory |
| Gold | Shards, Essence, Rift Tokens, Arena Marks |
| Combat heat | Prestige path bonuses (cumulative) |
| Active buffs | Stronghold layout + buildings |
| | Momentum (current amount) |
| | All permanent unlocks |
| | Rift Relics |
| | Arena rating |

---

## 9. Economy V2

### 9.1 Currency Table

| Currency | Source | Sink | Cap |
|----------|--------|------|-----|
| **Gold** | Idle waves, Stronghold passive, Rift combat rooms, weekly events | Hero leveling, summoning, equipment crafting, facilities, Stronghold buildings | None |
| **Shards** | Summon dupes, Rift tier rewards, Stronghold passive | Hero rank-ups, prestige path respec (500) | None |
| **Essence** | Prestige reward, Rift floor bosses, weekly events | Meta upgrades (3 paths: Damage/Economy/Survival, +5% per level) | None |
| **Momentum** | Idle time regen (1/min) | Rift entry (10–15), Arena entry (5), Tournament entry (15), Stronghold entry (8) | 60 + prestige×10 |
| **Scrap** | Equipment dismantle, Stronghold passive | Equipment crafting/upgrade, Stronghold building construction | None |
| **Rift Tokens** | Rift Run completion (scales with tier × rooms) | Rift shop: Relics, cosmetics, augment-start packs | None |
| **Arena Marks** | Arena wins, season rewards, tournaments | Arena shop: exclusive heroes, skins, banners | None |

### 9.2 Removed V1 Currencies

| V1 Currency | V2 Fate |
|-------------|---------|
| Boss Tears | Removed — summoning uses Gold |
| Diamonds | Removed — premium monetization is real-money cosmetics + Momentum refills |
| Rebirth Cores | Merged into Essence (one meta-progression currency) |

### 9.3 Monetization Model

| Revenue Stream | Price | Notes |
|----------------|-------|-------|
| **Battle Pass** (seasonal) | $4.99 | Free track: 10 tiers (Gold/Shards/Scrap). Premium: +10 tiers with cosmetics + Momentum refills + crafting recipes. **No stat advantages.** |
| **Cosmetic Shop** | $0.99–$4.99 | Hero skins, Stronghold base themes, UI themes, summon animations |
| **Momentum Refill** | $0.99 for 30 Momentum | Hard cap: **3 purchases per day** (prevents pay-to-win on leaderboards) |

**Removed from V1**: VIP DPS bonuses, VIP tempo gating (4x speed), diamond-for-power purchases, dollar shop power items.

### 9.4 Economy Flow Diagram

```
                    ┌─────────────┐
                    │  IDLE WAVES  │
                    │  (AFK/Auto)  │
                    └──────┬──────┘
                           │ Gold, EXP, Shards
                           ▼
              ┌────────────────────────┐
              │    HERO ROSTER         │
              │  Level up (Gold)       │
              │  Rank up (Shards)      │
              │  Summon (Gold)         │
              │  Equip gear (Scrap)    │
              └──────┬────┬────┬──────┘
                     │    │    │
          ┌──────────┘    │    └──────────┐
          ▼               ▼               ▼
   ┌──────────┐   ┌──────────┐   ┌──────────────┐
   │ RIFT RUNS │   │ CRUCIBLE │   │  STRONGHOLD  │
   │ (10-15 ⚡) │   │ (5 ⚡)   │   │   (8 ⚡)     │
   └─────┬────┘   └────┬─────┘   └──────┬───────┘
         │              │                │
    Rift Tokens    Arena Marks     Defense Rating
    Gold, Shards   ELO Rating     ──────┤
         │              │         Passive Gold,
         ▼              ▼         Shards, Scrap
   ┌──────────┐  ┌───────────┐        │
   │ Rift Shop │  │Arena Shop │        │
   │ (Relics,  │  │(Heroes,   │        ▼
   │ Cosmetics)│  │ Skins)    │   ┌─────────┐
   └──────────┘  └───────────┘   │  IDLE    │
                                  │  INCOME  │◄── feeds back
                                  └─────────┘
```

---

## 10. Progression Arc

### 10.1 Onboarding — First 2 Hours

| Time | Milestone | What Unlocks |
|------|-----------|-------------|
| 0–5 min | Tutorial wave push | Idle combat, gold earning, first summon at Wave 5 (free) |
| 5–15 min | First hero deployed | Team combat, formation basics |
| 15–30 min | Wave 15 reached | **First guided Rift Run** (Tier 1, hand-held, teaches augment draft) |
| 30–45 min | Wave 25 reached | **Stronghold tutorial** (place 2 heroes, survive 5 waves) |
| 45–75 min | Wave 100 reached | **First prestige** — choose Warlord / Merchant / Champion |
| 75–90 min | Prestige 1 complete | **Arena unlock** — first bot match (guaranteed win for confidence) |
| 90–120 min | Free play begins | All modes unlocked. Momentum system active. Weekly events visible. |

**Design goal**: Time-to-first-prestige under 60 minutes. Time-to-all-modes-unlocked under 2 hours.

### 10.2 Mid-Game — Hours 2–20

- Push idle waves past 200
- Rift tiers 1–5, learn augment synergies
- Build Stronghold to Tier 2–3, establish passive income stream
- Arena placement matches (10 required), find competitive level
- Second prestige with deliberate path specialization
- Mission board + weekly events provide direction
- Build roster to 15–20 heroes, start experimenting with compositions
- First seasonal Battle Pass engagement

### 10.3 Late-Game — Hours 20+

- Rift tiers 6–10 with curse modifiers (mastery test)
- Arena climb toward Diamond/Legend tier
- Stronghold tier 4–5, guild raid participation
- Hero mastery grinding (unlocking ability variants)
- Prestige path mastery (deep investment in one path's advantages)
- Seasonal competition across all three mode leaderboards
- Composite seasonal score optimization
- Discover all augment synergy combos
- Collect all 20 Rift Relics

---

## 11. UI/UX Architecture

### 11.1 Tab Structure (8 Tabs)

| Tab | Icon | V1 Equivalent | V2 Role |
|-----|------|--------------|---------|
| **Battle** | ⚔️ | Battle | Same + Momentum display in header |
| **War Room** | 🛰️ | War Room | Same + Rift/Arena/Stronghold quick-entry buttons + mode leaderboard summaries |
| **Heroes** | 👥 | Heroes | Simplified: 40 heroes, 5 rarities, mastery tracker per hero |
| **Rift** | 🌀 | *(New)* | Node map, augment tracker, tier selector, Rift leaderboard, Rift shop |
| **Crucible** | ⚔️🛡️ | *(New)* | Matchmaking, team builder, ban settings, rating display, Arena shop |
| **Stronghold** | 🏰 | *(New)* | Hex grid editor, defense launcher, passive income dashboard, building management |
| **Gear** | 🎒 | Equipment | Same core: inventory, armory, craft, forge. Simplified rarity ladder (5 tiers). |
| **Codex** | 📖 | Achievements + Operations | Merged: achievements, missions, facilities, expeditions, story beats, collection |

### 11.2 Header (Persistent)

```
┌──────────────────────────────────────────────────────────────────┐
│ SimplyIdle V2          DPS: 12,450    ⚡ 47/80 Momentum         │
│ Wave 156 · Act III     💰 1.2M  💠 4,800  ✨ 230  🔧 890       │
└──────────────────────────────────────────────────────────────────┘
```

- Momentum prominently displayed (it's the session currency)
- Tap DPS → detailed breakdown
- Tap any currency → economy panel with sources/sinks

### 11.3 Mobile Adaptation

Same 8 tabs, but:
- Single-column card layout (no sub-tabs — use collapsible sections)
- Hex grid (Stronghold) renders in full-width portrait mode with pinch-to-zoom
- Rift node map scrolls vertically
- Arena draft uses swipe-to-ban gesture
- Touch swipe between tabs

### 11.4 Key Modals

| Modal | Trigger | Content |
|-------|---------|---------|
| Prestige | Wave requirement met | Path selection, bonus preview, confirmation |
| Rift Augment Draft | After combat/elite room | 3 augment cards, pick 1, synergy highlights |
| Arena Scout | Pre-match | Opponent snapshot, ban selection |
| Stronghold Wave Start | Between waves | Repositioning view, next wave preview |
| Idle Chest | Return from offline | Accumulated rewards + Momentum gained |
| Battle Pass | Season tab | Free + premium track progression |
| Shop | Header button | Cosmetics, Momentum refills |

---

## 12. Audio & Visual Direction

### 12.1 Audio Design

| Context | Style |
|---------|-------|
| **Idle Waves** | Ambient battlefield — subtle clashes, distant drums. Intensity scales with wave tier. |
| **Rift Runs** | Dungeon atmospheric — dripping water, echoing footsteps. Escalates per floor. Boss rooms get orchestral stings. |
| **Crucible** | Competitive tension — rhythmic percussion, crowd ambience on tournament matches. Victory/defeat fanfares. |
| **Stronghold** | Strategic ambient — wind, distant horns. Alert stings on wave start. Building placement has satisfying mechanical clicks. |
| **Menus/UI** | Clean, minimal — taps, swooshes, confirmations. Nothing fatiguing. |

### 12.2 Visual Style

- **2D art** maintained from V1 (works, players are used to it)
- **New rendering needs**:
  - Hex grid for Stronghold (canvas/WebGL overlay)
  - Node map for Rift Runs (SVG or canvas)
  - Arena combat visualization (team vs team, auto-animating)
- **Color language**:
  - Rift: Deep purple/blue tones
  - Crucible: Red/gold competitive tones
  - Stronghold: Green/brown tactical tones
  - Idle: Same warm amber V1 palette

---

## 13. Anti-Cheat & Server Authority

### 13.1 Authority Model

| System | Authority | Rationale |
|--------|-----------|-----------|
| Idle wave push | Client | Non-competitive, same as V1 |
| Rift Runs | Server-validated | Server generates seed, client reports path, server calculates expected rewards |
| Arena combat | Server-authoritative | Deterministic: team snapshot + random seed → server replays combat → verifies result |
| Stronghold defense | Client with server checkpoints | Defense rating snapshot stored server-side for passive gen |
| Stronghold raids | Server-authoritative | Same as Arena — deterministic, verifiable |
| Leaderboards | Server-validated | All submissions require server validation of contributing scores |
| Economy | Hybrid | Idle gold = client. Mode rewards = server-validated. Purchases = server-authoritative. |

### 13.2 Deterministic Combat (Arena + Raids)

Combat is fully deterministic given inputs:
- Team A composition (stats, gear, formation)
- Team B composition (stats, gear, formation)
- Random seed (server-generated, per-round)

Client sends: match ID + claimed result.
Server replays: same inputs + seed → verifies identical outcome.
Mismatch = result rejected + flag for review.

### 13.3 Rift Validation

1. Server generates Rift seed → determines map layout, room contents, augment offers
2. Client plays through, sends: rooms entered (ordered), augments chosen, rewards claimed
3. Server replays: verifies path is valid on generated map, augment choices match what was offered, rewards match room outcomes
4. Invalid submissions rejected

---

## 14. Seasonal Structure

### 14.1 Season Length

**14 days** per season (compressed from V1's 28 days — faster reward cycles, more engagement).

### 14.2 Composite Seasonal Score

```
seasonScore = (idleHighestWave × 12) 
            + (highestRiftTier × 500) 
            + (arenaELO × 2) 
            + (strongholdDefenseRating × 3)
```

All four modes contribute. Specialists in one mode can compete, but generalists who play everything have an edge.

### 14.3 Season Reward Tiers

| Tier | Score Range | Reward |
|------|------------|--------|
| **Bronze** | < 5,000 | 500 Gold + 50 Shards |
| **Silver** | 5,000–14,999 | 2,000 Gold + 150 Shards + Silver emblem |
| **Gold** | 15,000–39,999 | 5,000 Gold + 300 Shards + 20 Essence + Gold emblem |
| **Diamond** | 40,000–99,999 | 10,000 Gold + 500 Shards + 50 Essence + Diamond emblem + exclusive skin |
| **Legend** | 100,000+ | 20,000 Gold + 1,000 Shards + 100 Essence + Legend emblem + exclusive hero |

### 14.4 Per-Season Content Pipeline

Each season introduces:
- **1 new Stronghold map** (new layout, new paths)
- **2 new Arena-exclusive heroes** (purchasable with Arena Marks)
- **5 new Rift augments** (expand the augment pool gradually)
- **1 Battle Pass** (free + premium tracks)
- **Rotating weekly events** (carried from V1 — 8 variants cycle)

### 14.5 Season Reset

| Resets | Stays |
|--------|-------|
| Seasonal score | All currencies |
| Arena ELO (soft-reset: compress 50% toward 1000) | Hero roster, mastery, gear |
| Battle Pass progress | Rift Relics, Arena shop purchases |
| Seasonal leaderboard positions | Prestige paths, Stronghold layout |

---

## 15. V1 → V2 Migration Summary

### 15.1 What's Kept

| System | Status |
|--------|--------|
| Wave-based auto-combat | ✅ Unchanged |
| 100ms tick loop | ✅ Unchanged |
| Monster scaling formulas | ✅ Unchanged |
| Heat/Tempo/Burst system | ✅ Unchanged |
| Offline simulation (8h, 300k cap) | ✅ Unchanged |
| Equipment crafting/forging | ✅ Simplified to 5 rarities |
| Prestige wave requirements | ✅ Same formula |
| Weekly events (8 variants) | ✅ Unchanged |
| Mission board | ✅ Expanded with mode-specific missions |
| Facilities (Training/Treasury/Forge/Tactics) | ✅ Unchanged |
| Social features (chat, friends, guilds) | ✅ Expanded with guild raids |
| Firebase backend | ✅ Extended with server validation |
| Achievement system | ✅ Expanded with mode achievements |

### 15.2 What's Changed

| System | V1 | V2 |
|--------|----|----|
| DPS layers | 14 multiplicative | 3 multiplicative + utility bonuses |
| Prestige reward | Flat 1.5x | 3 specialization paths |
| Heroes | 65 heroes, 8 rarities | 40 heroes, 5 rarities, 3 abilities each |
| Currencies | 7+ (Gold, Diamonds, Tears, Shards, Essence, Cores, Scrap) | 5 core + 2 mode-specific |
| Summoning cost | Boss Tears / Diamonds | Gold |
| Monetization | VIP power + diamonds | Battle Pass + cosmetics (no power purchases) |
| Synergies | Flat DPS% | Utility effects per mode |

### 15.3 What's New

| System | Description |
|--------|-------------|
| **Momentum** | Idle → active bridge resource |
| **Rift Runs** | Roguelike dungeon mode with augment drafting |
| **Crucible** | Async PvP arena with ELO, bans, tournaments |
| **Stronghold** | Tower defense with hex grid, passive resource generation |
| **Hero Mastery** | Per-hero progression that unlocks ability variants |
| **Rift Relics** | Permanent minor bonuses from Rift completion |
| **Guild Raids** | Async Stronghold attack/defense |
| **Battle Pass** | Seasonal progression track |
| **Composite Scoring** | Cross-mode seasonal leaderboard |

### 15.4 What's Removed

| System | Reason |
|--------|--------|
| Boss Tears currency | Unified into Gold economy |
| Diamonds currency | Premium → cosmetics + Momentum refills |
| Rebirth Cores | Merged into Essence |
| VIP power tiers | Removed — no pay-for-power |
| 8 rarity tiers | Compressed to 5 for cleaner balance |
| 25 heroes cut | Roster trimmed for deeper per-hero design |
| 11 DPS multiplier layers | Converted to utility bonuses |

---

## Appendix A: Key Formulas Reference

```
Momentum Cap:       60 + (prestigeCount × 10)
Momentum Regen:     1 per minute (idle)
Prestige Wave Req:  ceil(100 × 1.12^prestigeCount)
DPS (V2):           (playerBase + heroBase) × prestigePathMult × (1 + gearScore × 0.0008)
Monster HP:         floor(30 × 1.12^(wave-1))    [Boss: ×5]
Gold Drop:          max(8, floor(8 × 1.14^(wave-1)))  [Boss: ×7]
EXP Drop:           max(5, floor(5 × 1.12^(wave-1)))  [Boss: ×4]
Defense Rating:     (wavesSurvived × 10) + (heroesPlaced × 15) + (totalBuildingLevels × 5)
Passive Gold/hr:    defenseRating × 8
Passive Shards/hr:  floor(defenseRating × 0.3)
Arena Win ELO:      +25 ± (ELO delta adjustment of 5–15)
Arena Loss ELO:     -20 ± (ELO delta adjustment of 5–15)
Seasonal Score:     (wave × 12) + (riftTier × 500) + (arenaELO × 2) + (defenseRating × 3)
Rift Monster HP:    floor(30 × 1.12^(wave-1) × tierHPScale)
Stronghold Wave HP: 50 × 1.15^(wave-1) × tierMultiplier
Summon Cost:        10,000 Gold (single) / 90,000 Gold (×10)
Building Upgrade:   baseCost × 1.5^(level-1)
```

## Appendix B: Hero Roster V2 (Launch — 40 Heroes)

### Warriors (8)
| ID | Name | Rarity | Passive | Rift Ability | Stronghold Ability |
|----|------|--------|---------|-------------|-------------------|
| w1 | Kael Ironheart | Common | +3% team DPS | Shield Wall (−40% dmg, 1 combat) | Fortify (adj. Walls +50% HP) |
| w2 | Mira Oathguard | Common | −2% incoming damage | Iron Stand (team immune to knockback, 1 room) | Rally Point (adj. heroes +5% dmg) |
| w3 | Borin Stonewall | Common | +4% team HP | Bulwark (absorb first hit in next combat) | Barricade (blocks 1 extra path tile) |
| w4 | Orin Bastionforge | Rare | +3% DPS, +2% HP | Vanguard Charge (skip 1 room, no penalty) | Inspire (adj. buildings +1 level temp) |
| w5 | Selene Ironbanner | Rare | +4% gold gain | Commander's Call (reveal boss mechanics) | Banner (all heroes in 3-hex +8% dmg) |
| w6 | Karthus Soulforge | Epic | +5% DPS | Titan Guard (team takes 0 dmg, 1 hit) | Unbreakable (this hero can't die for 2 waves) |
| w7 | Aethermaw Unbounded | Legendary | +6% DPS, −3% incoming | Dragon's Roar (all enemies −25% HP, 1 room) | Fortress Aura (all buildings in 2-hex +30% HP) |
| w8 | Titan Worldrender | Mythic | +8% DPS, +5% HP | World Shatter (instant-kill non-boss enemy) | Citadel (hero becomes immovable, +100% stats) |

### Berserkers (8)
| ID | Name | Rarity | Passive | Rift Ability | Stronghold Ability |
|----|------|--------|---------|-------------|-------------------|
| b1 | Drogan Ashfury | Common | +4% DPS | Berserk Charge (2x DPS, 1 combat) | Cleave Mastery (+25% cleave radius) |
| b2 | Thorn Bloodhide | Common | −3% incoming, +2% DPS | Blood Rage (gain DPS = 10% of missing HP) | Thorns (enemies take 10% reflected dmg) |
| b3 | Karra Rageborn | Common | +5% DPS, +5% dmg taken | Frenzy (3 extra attacks in next combat) | Berserker Stance (1.5x dmg, takes 1.5x) |
| b4 | Varric Doomhowl | Rare | +4% DPS, +3% crit | Howl (enemies −20% stats, 2 rooms) | Fear Aura (enemies in range move 30% slower) |
| b5 | Morga Chainstorm | Rare | +3% team DPS | Chain Pull (bring elite to you instead of going to it) | Grapple (hold 1 enemy in place for 3s) |
| b6 | Viktor Darkbane | Epic | +6% DPS | Execute (kill any enemy below 25% HP) | Rampage (after kill, attack speed 2x for 5s) |
| b7 | Ragnar Hellborn | Legendary | +7% DPS, −2% incoming | Hellfire (deal 40% max HP AoE to all enemies in room) | Inferno Zone (hex deals constant fire dmg) |
| b8 | Leviathan Depths | Mythic | +9% DPS | Devour (kill enemy, heal 30% team HP) | Tidal Crush (wave of dmg hits entire path) |

### Archers (8)
| ID | Name | Rarity | Passive | Rift Ability | Stronghold Ability |
|----|------|--------|---------|-------------|-------------------|
| a1 | Sylvi Windmark | Common | +3% DPS | Scout Ahead (reveal all rooms, current floor) | Overwatch (+1 hex attack range) |
| a2 | Riven Hawkeye | Common | +4% gold gain | Precision Shot (guaranteed crit, next combat) | Sniper Nest (+2 hex range, −30% attack speed) |
| a3 | Nyx Whisperleaf | Common | +3% EXP gain | Camouflage (avoid 1 combat room, take alternate path) | Ambush (first attack deals 3x damage) |
| a4 | Aela Windpierce | Rare | +4% DPS, +2% crit | Wind Walk (move to any visible room on map) | Multishot (attack hits 2 enemies) |
| a5 | Kestrel Moonshot | Rare | +3% DPS, +3% gold | Moonlit Path (reveal augment offers before entering draft) | Silver Arrows (attacks ignore 50% defense) |
| a6 | Zara Voidarchress | Epic | +5% DPS, +3% crit | Void Arrow (remove 1 curse modifier for current run) | Phase Shot (attacks pass through Walls to hit enemies) |
| a7 | Zephyr Starreacher | Legendary | +6% DPS | Star Barrage (hit all enemies in room for 200% DPS) | Constellation (link to 2 other archers, share targets) |
| a8 | Phoenix Eternal | Mythic | +8% DPS | Rebirth Flame (if team dies, revive at 50% HP once) | Flame Arrows (attacks leave burning ground for 3s) |

### Mages (8)
| ID | Name | Rarity | Passive | Rift Ability | Stronghold Ability |
|----|------|--------|---------|-------------|-------------------|
| m1 | Lunara Frostweave | Common | +3% DPS | Frost Barrier (block 1 enemy attack, next combat) | Frozen Ground (enemies in range slowed 20%) |
| m2 | Aziel Embermind | Common | +4% DPS | Scrying (see 2 floors ahead on node map) | Chain Lightning (attacks bounce to +1 enemy) |
| m3 | Vex Starchant | Common | +3% EXP, +2% DPS | Arcane Sight (see augment tier before picking) | Mana Well (adj. mages +15% damage) |
| m4 | Seris Riftborn | Rare | +4% DPS | Rift Tear (create shortcut — skip 1 room on map) | Warp Zone (teleport enemies back 2 hexes) |
| m5 | Noctis Emberveil | Rare | +3% DPS, +3% gold | Shadow Veil (team invisible, skip 1 elite without fighting) | Dark Zone (enemies in range can't heal) |
| m6 | Iris Veilbearer | Epic | +5% DPS, +4% EXP | Veil of Time (undo last augment choice, re-draft) | Time Slow (enemies in range at 50% speed) |
| m7 | Archaon Time Weaver | Legendary | +7% DPS | Temporal Loop (replay best combat room for double rewards) | Chrono Field (building cooldowns halved in range) |
| m8 | Celestial Architect | Mythic | +9% DPS | Cosmic Rewrite (choose any augment from entire pool) | Singularity (pull all enemies toward this hex) |

### Monks (8)
| ID | Name | Rarity | Passive | Rift Ability | Stronghold Ability |
|----|------|--------|---------|-------------|-------------------|
| k1 | Shen Dawnfist | Common | −2% incoming damage | Emergency Heal (restore 25% team HP) | Tranquil Zone (enemies in range slowed 20%) |
| k2 | Iria Lotusveil | Common | +3% EXP gain | Lotus Shield (absorb damage = 15% max HP, 1 combat) | Healing Aura (adj. heroes regen 2% HP/wave) |
| k3 | Tarin Sunstep | Common | +3% DPS, +2% gold | Sun Blessing (+15% DPS buff, lasts 3 rooms) | Solar Flare (blind enemies in range for 2s at wave start) |
| k4 | Korin Stillwater | Rare | −3% incoming, +2% DPS | Still Mind (team immune to debuffs, 2 rooms) | Reflection Pool (reflect 15% damage to attackers) |
| k5 | Maeve Stormpalm | Rare | +4% DPS | Thunder Palm (stun all enemies, 1 combat round) | Storm Aura (random lightning hits enemies in 3-hex) |
| k6 | Sorena Lightfury | Epic | +5% DPS, −3% incoming | Divine Light (full team heal to 100%) | Sanctified Ground (hex is impassable to enemies) |
| k7 | Luminion Stellarch | Legendary | +6% DPS, +4% HP | Stellar Rebirth (revive team if wiped, once per run) | Star Shield (all heroes in 3-hex take −25% dmg) |
| k8 | Dharma Eternal Cycle | Mythic | +8% DPS, +5% HP | Eternal Cycle (reset all Rift Abilities to ready) | Nirvana (enemies in range deal 0 dmg for 1 wave) |

---

*End of GDD V2*
