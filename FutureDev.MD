# SimplyIdle - Future Development Plan

## 1. Purpose
This document proposes high-value content, system depth, and production improvements based on the current codebase and live feature surface.

## 2. Development Themes
- Deepen long-term motivation beyond numeric scaling.
- Add strategic decision layers that matter run-to-run.
- Turn cosmetic progression labels into gameplay-relevant systems.
- Improve maintainability and data-driven balancing velocity.

## 3. Content Expansion Ideas

### 3.1 Campaign Arc Expansion (Act 7+)
- Add post-Eternal-Eclipse acts with distinct enemy rulesets.
- Add act-specific hazards and blessing picks.
- Add act completion relics that permanently alter one subsystem.
- Design target: each new act should introduce one new tactical rule, not just bigger numbers.

### 3.2 Dynasty and Order System (Lore + Mechanics)
- Evolve "Order" from title-only into a faction progression tree.
- Add Order reputation from kills, campaign clears, and mission chains.
- Add branching doctrines:
- Iron Doctrine (survival)
- Crimson Doctrine (burst damage)
- Obsidian Doctrine (economy/loot)
- Add Order edicts as seasonal modifiers players can choose from.

### 3.3 Cult Influence Layer
- Introduce 3 rival cults tied to campaign acts.
- Players choose diplomacy, purge, or manipulation approach.
- Cult favor unlocks unique passives but triggers tradeoffs.
- This adds political tension and non-linear progression goals.

### 3.4 Hero Identity Expansion
- Add hero bonds/synergy pairs and rivalry penalties.
- Add hero loyalty arcs with mission-triggered outcomes.
- Add active-skill evolution paths at rank milestones.
- Add team doctrine presets that alter formation constraints and bonuses.

### 3.5 Endgame Dungeon Suite
- Expand Dungeon Ops from one active lane to a full suite:
- Gold lane (economy burst)
- Essence lane (meta acceleration)
- Tear lane (summon economy)
- Add weekly mutators and rotating boss mechanics.
- Add leaderboard categories per lane.

## 4. Systems Improvements

### 4.1 Season and Rank Depth
- Keep current season points but add rank rewards that affect playstyle.
- Add rank checkpoints with one-time unlock crates.
- Add seasonal quests that reward emblems and temporary run augments.
- Add anti-cheat server validation once backend leaderboard is live.

### 4.2 Power Tier Utility
- Make power tier unlock challenge ladders and "threat contracts."
- Recruit/Elite/Mythic/Ascendant tiers grant access to distinct contracts.
- Contracts trade risk for specialized rewards.
- Add tier decay resistance via sustained performance to encourage consistency.

### 4.3 Rebirth 2.0
- Introduce rebirth archetypes at prestige milestones:
- Warlord Loop: stronger burst/tempo
- Treasurer Loop: stronger economy loops
- Ascetic Loop: weaker start, stronger scaling
- Preserve current accessibility while adding meaningful identity choices.

### 4.4 Economy Clarity
- Add a dedicated economy ledger panel:
- Gold gain contributors
- Shard spending trends
- Essence conversion efficiency
- Add recommended spend helpers based on progression phase.
- Add overflow sinks for late-game excess currencies.

### 4.5 Mini-op Evolution
- Keep current cooldown model but add mastery levels per mini-op.
- Mastery increases options rather than raw rewards.
- Add risk-reward variants with opt-in difficulty.

## 5. UX and Technical Improvements

### 5.1 UI/UX
- Consolidate responsive design tokens for mobile/web parity.
- Add progressive disclosure for dense systems (show basics first, details on demand).
- Introduce unified icon legend and glossary panel.
- Add clearer first-session questline for first rebirth path.

### 5.2 Architecture
- Continue reducing GameScreen complexity via feature modules.
- Break reducer into domain slices (combat, economy, roster, liveops, meta).
- Centralize formula definitions for balance tuning and telemetry tagging.
- Add scenario-based regression tests for reducer actions.

### 5.3 Data and Balancing Tooling
- Move balance constants to data tables with versioning.
- Build a lightweight simulation script for progression pacing checks.
- Add telemetry dashboards for:
- Time-to-first-summon
- Time-to-first-rebirth
- Wave choke points
- Currency bottlenecks

## 6. Roadmap (Suggested)

### Phase A: Foundation (2-4 weeks)
- Refactor state domains and add reducer tests.
- Add economy ledger UI and onboarding questline.
- Add backend-ready leaderboard adapter interface.

### Phase B: Mid-Core Depth (4-8 weeks)
- Implement Order doctrines and first cult system pass.
- Add two new dungeon lanes with mutators.
- Add season questline and rank checkpoint rewards.

### Phase C: Endgame Identity (8-12 weeks)
- Add post-Act-6 campaign arc.
- Add rebirth archetypes and prestige identity decisions.
- Add hero bond/rival systems and advanced team doctrines.

## 7. High-Impact Quick Wins
- Add explanatory tooltips to Order and Power Tier describing practical value.
- Add "next best action" hints that include expected gain deltas.
- Add one-click compare for meta upgrade paths (damage vs economy vs survival).
- Add optional challenge mode toggle for better reward multipliers.

## 8. Feature Candidates with Strong Theme Fit
- Council of Houses: weekly political event where player aligns with a house for bonuses and consequences.
- Cult Schism Chain: branching missions where suppressing one cult empowers another.
- Throne Legitimacy Meter: based on campaign, rebirth cadence, and mission discipline.
- War Chronicle Decisions: unlock narrative nodes that alter future event pools.

## 9. Success Metrics for Future Work
- +15% increase in D1->D7 retention among rebirthed players.
- Reduced wave-20-60 stagnation events per session.
- Increased mission claim rate and mini-op engagement.
- Increased average sessions per season for mid-core users.

## 10. Implementation Notes
- Prioritize systems that create new decisions over pure multiplier inflation.
- Keep all new systems inspectable with clear formulas and source breakdowns.
- Maintain parity across web/mobile in all new UI surfaces.
- Preserve current progression identity while expanding strategic expression.
