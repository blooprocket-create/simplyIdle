---
title: Heroes & Summoning
---

# Heroes & Summoning

<span class="status-badge live">Live</span>

Last reviewed: 2026-04-15

## Overview

SimplyIdle features a roster of **65 heroes** across 6 classes. Each hero has a class identity, passive trait, active archetype, and a base team boost ranging from 5% to 10%.

## Hero Classes

| Class | Role |
|-------|------|
| Warrior | Frontline durability and team protection |
| Berserker | High burst damage, lower survivability |
| Archer | Sustained ranged DPS |
| Mage | Arcane burst and utility |
| Monk | Hybrid support — healing, buffs, and moderate damage |

## Rarity Ladder

| Rarity | Summon Rate | Stat Multiplier |
|--------|-------------|-----------------|
| Common | 49.9% | 1.0× |
| Uncommon | 25.0% | 1.15× |
| Rare | 13.0% | 1.35× |
| Epic | 7.0% | 1.6× |
| Legendary | 3.0% | 1.95× |
| Mythic | 1.5% | 2.35× |
| Godly | 0.5% | 3.0× |
| Transcendent | 0.1% | 3.55× |

## Summoning System

### Summon Costs
- **Boss Tears Summon:** 500 tears (free summon every 10th boss kill)
- **Diamond Summon:** 500 diamonds (VIP 3+ pays 450)
- **Free charges:** 1 per 10 kills, first one free

### Soft Pity
Starting at pull **20**, the Legendary+ rate gains **+3% cumulative** per pull. Resets on Legendary+ pull.

### Spark Token System

Duplicate and extra summons convert to Spark Tokens:

| Rarity | Tokens Earned |
|--------|--------------|
| Common | 1 |
| Uncommon | 3 |
| Rare | 8 |
| Epic | 20 |
| Legendary | 50 |
| Mythic | 120 |
| Godly | 300 |
| Transcendent | 600 |

### Spark Exchange

| Option | Cost |
|--------|------|
| 1 Free Summon Charge | 50 tokens |
| Choose a Rare Hero | 150 tokens |
| Choose an Epic Hero | 500 tokens |
| Choose a Legendary Hero | 1,500 tokens |
| Choose a Mythic+ Hero | 5,000 tokens |

### Summon Milestones

| Total Summons | Reward |
|---------------|--------|
| 10 | 5 Free Charges |
| 50 | Guaranteed Epic+ next pull |
| 100 | 500 Spark Tokens |
| 250 | Guaranteed Legendary+ next pull |
| 500 | 2,000 Spark Tokens + Unique Gear |
| 1,000 | Guaranteed Mythic+ next pull |

## Hero Ranking

Heroes gain power through ranking. Each rank costs shards scaled by the hero's rarity.

| Rank | Base Shard Cost | Stat Multiplier |
|------|----------------|-----------------|
| 1 | 0 | 1.00× |
| 2 | 10 | 1.05× |
| 3 | 25 | 1.10× |
| 4 | 50 | 1.15× |
| 5 | 100 | 1.20× |
| 6 | 200 | 1.25× |
| 7 | 350 | 1.30× |
| 8 | 525 | 1.35× |
| 9 | 750 | 1.40× |
| 10 | 1,000 | 1.45× |

**Rarity cost multipliers:** Common 1.0× · Uncommon 1.25× · Rare 1.7× · Epic 2.45× · Legendary 3.7× · Mythic 5.3× · Godly 7.8× · Transcendent 11.4×

## Hero Leveling

$$
\text{EXP for level } L = \lfloor 50 \times 1.18^{(L-1)} \rfloor
$$

**Level cap:** 999

## Shard Recycling

Dismiss a hero to recover shards. Base values:

| Rarity | Base Shards |
|--------|-------------|
| Common | 5 |
| Uncommon | 15 |
| Rare | 40 |
| Epic | 100 |
| Legendary | 250 |
| Mythic | 600 |
| Godly | 1,500 |
| Transcendent | 3,200 |

**Level bonus:** × $(1 + \max(1, \text{level}-1) \times 0.15)$

## Unique Weapons

Each hero has a unique weapon that scales through 10 ranks:

$$
\text{Power} = \text{base} \times (1 + (\text{rank}-1) \times 0.12)
$$

### Effect Families (Examples)

| Family | DPS Base | DPS/Rank | Special |
|--------|----------|----------|---------|
| Bastion | +10% | +3.2% | +9% mitigation (+1.8%/rank) |
| Onslaught | +15% | +4.4% | — |
| Harvest | +7% | +2.6% | +11% gold, +4% EXP |
| Oracle | +11% | +3.4% | +10% EXP (+2.0%/rank) |

## Passive Traits & Active Archetypes

Each hero has one **passive trait** and one **active archetype**:

- **Passive Traits:** Bulwark Instinct, Fortune Hunter, Sage Instinct, Warpath Instinct
- **Active Archetypes:** Battle Chant, Burst Volley, Frontline Ward, Mending Pulse

See the [Hero Database](/heroes-database) for every hero's exact trait and archetype.

## Practical Build Rules

1. Stabilize one primary carry and one defensive anchor early.
2. Cover multiple classes for role-specific passive synergy.
3. Use formation slots to protect fragile high-output heroes in the back row.
4. Don't over-invest in ranking Common heroes — save shards for Epic+ pulls.
