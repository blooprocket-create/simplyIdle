---
title: Core Mechanics
---

# Core Mechanics

<span class="status-badge live">Live</span>

Last reviewed: 2026-04-15

## Wave Combat

Enemies spawn in sequential waves. Each wave increases enemy stats. Boss waves appear at every **10th wave** with amplified HP, damage, and rewards.

## Enemy Scaling Formulas

### Hit Points

$$
\text{HP}(w) = \lfloor 30 \times 1.14^{(w-1)} \rfloor
$$

Boss HP: base × **5**

### Gold Reward

$$
\text{Gold}(w) = \max\!\bigl(8,\; \lfloor 8 \times 1.14^{(w-1)} \rfloor\bigr)
$$

- **Mid-game boost** (waves 20–60): base × $(1.5 + 0.5 \times \frac{w-20}{40})$
- **Boss gold:** base × **7**

### Experience

$$
\text{EXP}(w) = \max\!\bigl(5,\; \lfloor 5 \times 1.10^{(w-1)} \rfloor\bigr)
$$

Boss EXP: base × **4**

### Enemy Damage

$$
\text{DMG}(w) = \max\!\bigl(0.5,\; \lfloor 0.8 \times 1.12^{(w-1)} \rfloor / 10\bigr)
$$

Boss damage: base × **2.5**

## Facilities

Permanent upgrades that persist through prestige cycles. Each starts with fixed costs for levels 1–5, then doubles every level after.

| Facility | Effect | Per Level |
|----------|--------|-----------|
| Training | EXP boost | +5% |
| Treasury | Gold boost | +2% |
| Forge | Stat multiplier | +3% |
| Tactics | Power boost | +1% |

**Max level:** 999

### Cost Table (Levels 1–5)

| Facility | L1 | L2 | L3 | L4 | L5 |
|----------|-----|-------|---------|--------|----------|
| Training | 5,000 | 12,000 | 30,000 | 75,000 | 150,000 |
| Treasury | 4,000 | 10,000 | 25,000 | 60,000 | 120,000 |
| Forge | 6,000 | 15,000 | 40,000 | 90,000 | 180,000 |
| Tactics | 5,000 | 12,000 | 30,000 | 75,000 | 150,000 |

**Level 6+:** Previous cost × 2

## Team Composition

### Hero Slots

- **Default slots:** 4 heroes + player
- **Slot 5:** Unlocks at wave 50 — costs 125,000 gold + 450 shards
- **Slot 6:** Unlocks at wave 100 — costs 550,000 gold + 1,600 shards
- **Formation:** Front / Mid / Back (max 2 per row)

## Meta Tracks

Three progression tracks shape your overall power curve:

| Track | Focus |
|-------|-------|
| Damage | Clear speed and burst output |
| Economy | Income velocity and compound growth |
| Survival | Durability and consistency |

## Achievement Bonuses

Each unlocked achievement grants **+3%** to your global power multiplier, capped at **+75%** total (25 achievements).
