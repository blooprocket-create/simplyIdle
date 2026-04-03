---
title: Core Mechanics
---

# Core Mechanics

## Combat and Wave Progression

- Enemies scale each wave.
- Boss waves appear at regular intervals and apply reward multipliers.
- Team output is influenced by hero stats, class passives, formation, and gear.

## Core Formulas

### Enemy HP

HP formula:

$$
\text{HP}(w) = \lfloor 30 \cdot 1.14^{(w-1)} \rfloor
$$

Boss HP modifier: $\times 5$.

### Enemy Gold

$$
\text{Gold}(w) = \max(8, \lfloor 8 \cdot 1.14^{(w-1)} \rfloor)
$$

Boss gold modifier: $\times 7$.

### Enemy EXP

$$
\text{EXP}(w) = \max(5, \lfloor 5 \cdot 1.10^{(w-1)} \rfloor)
$$

Boss EXP modifier: $\times 4$.

### Rebirth Requirement

$$
\text{RequiredWave}(p) = \lceil 100 \cdot 1.12^p \rceil
$$

where $p$ is prestige count.

## Meta Tracks

- Damage track increases clear speed.
- Economy track increases income and progression velocity.
- Survival track improves durability and consistency.

## Facilities

- Training
- Treasury
- Forge
- Tactics

Each facility has fixed early levels then escalates by exponential cost.

## Truth Sources

- src/gameConfig.ts
- src/useGameState.ts
- GDD.MD
