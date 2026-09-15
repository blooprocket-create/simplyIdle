# SimplyIdle — Making It a Game Instead of 10,000 Menus

**Status:** Proposal. Nothing here is implemented yet.
**Scope:** Why the game reads as a stack of menus, what in the architecture forces that, and the order to fix it in.

This document is deliberately *not* another quality audit. `AAA_AUDIT.md` already covers code hygiene, security, and infra, and much of it is done. This one asks a different question: **when a player opens SimplyIdle, what do they actually do?** The answer today is "read numbers and press claim," and that is an architectural outcome, not a content shortfall.

---

## 1. The measured surface

Counted from the current tree, not estimated:

| Thing | Count |
| --- | --- |
| Bottom tabs | 8 |
| Sub-tabs inside those tabs | 17 |
| Modals in `GameScreen.tsx` | 15 |
| Social sections | 10 |
| `Pressable` elements across tabs + GameScreen | 392 |
| **Distinct navigable destinations** | **~50** |

Against that:

| Thing | Count |
| --- | --- |
| Heroes authored in `HERO_POOL` | 66 |
| Achievements | 92 |
| Acts | 7 |
| Lines in `gameConfig.ts` | 4,639 |
| **Skills** | **4** |
| **Combat rules** | **1 formula** |

The content is generous. The *mechanics* are one line of arithmetic. Every time a feature was added, it arrived as a screen rather than as a rule, and ~50 destinations is what that accumulates to.

---

## 2. Diagnosis: four things that force the menus

### 2.1 Combat is an expression, not a scene

`advanceCombatStep()` (`src/useGameState.ts:3878`) is the entire game loop. Stripped down:

```ts
const dps = getDps(working);
const damage = dps * (scaledElapsed / 1000) / (affix.hpMult * weekly.enemyHpMultiplier);
const hp = working.monsterHp - damage;
// ...
if (hp <= 0) return withAchievement(killMonster(working));
```

One monster HP number, one team HP number, subtract `dps × dt`. There are no combatants. There is no targeting, no positioning, no per-hero resolution, no attack timing.

`getDps()` → `getDpsBreakdown()` (`src/useGameState.ts:2001`) loops the active team and **sums every hero into a single scalar**, then multiplies it by fourteen named multipliers (`rebirthLegacy`, `formation`, `synergy`, `vipDamage`, …). A hero is an addend. Six heroes and one hero with 6× the stats are indistinguishable to the simulation.

That has a direct UI consequence. The battle view (`GameScreen.tsx:2280–2330`) can only render what the model contains, and the model contains two scalars — so the "fight" is **one emoji, two progress bars, and a TTK readout.** There is nothing else to draw.

### 2.2 The game is built to play itself

Nine automation flags exist in `GameState`:

```
autoBurstEnabled      autoSummonEnabled     autoRecycleEnabled
autoDismantleEnabled  autoUsePotionEnabled  autoUseCoolantEnabled
autoTempoEnabled      autoTempoTarget       autoSummonMode
```

Every interactive verb in the game has an off switch. `advanceCombatStep` ends with a chain of them — `maybeAutoUsePotion → maybeAutoUseCoolant → maybeAutoRecycleBackground → maybeAutoDismantleTick → maybeAutoSummonTick` — and then:

```ts
if (withSummon.autoBurstEnabled && withSummon.burstCharge >= BURST_COST) {
  return applyBurst(withSummon, 4 * withSummon.combatTempo);
}
```

BURST is the last remaining combat input, and it has an auto toggle too. **With every toggle on, player input during combat is exactly zero.** The menus are not competing with gameplay for the player's attention — once automation is enabled, the menus *are* the gameplay, because they are the only thing left that accepts input.

`KNOWN_ISSUES.md` records this as a fix: *"Wiki referenced manual tapping / tap-to-attack combat."* The wiki was corrected to match a game that removed its last verb.

### 2.3 Authored content is delivered through the weakest possible channel

`tickHeroActives()` (`src/useGameState.ts:1726`) is where 66 heroes' unique weapons and named abilities — Shield Wall, Execute, Rallying Cry, Soul Drain — actually fire:

```ts
const triggerChance = Math.min(0.16, 0.015 + hero.level * 0.00012) * roleTriggerMult * (elapsedMs / 1000);
if (Math.random() > triggerChance) continue;
```

A per-tick dice roll. Not a cooldown the player can read, not a resource they spend, not something they can see coming or cause. When it lands, the payload is:

```ts
nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} — Execute! ${executeDmg} dmg`);
```

A line of text in a scrolling log. This is the single highest-leverage finding in this document: **the game already contains a large, well-authored ability system, and the player can neither trigger it nor watch it happen.** Making these abilities visible and castable adds more felt depth than any amount of new content, because the content is already written.

### 2.4 The render architecture makes a real game impossible

The tick (`src/useGameState.ts:5310`) dispatches into a React reducer at 10 Hz:

```ts
const id = setInterval(() => {
  dispatch({ type: 'TICK', elapsed });
}, TICK_MS);   // TICK_MS = 100
```

`TICK` returns `advanceCombatStep(state, elapsed)`, which spreads a **new `GameState` object with ~120 top-level fields, ten times a second.** All eight tabs receive that object as a `state` prop.

All eight tabs are wrapped in `React.memo(...)` **with no comparator.** Default `memo` is a shallow prop compare, and `state` is a fresh object identity on every tick — so the comparison fails every time, for every tab, forever.

> `AAA_AUDIT.md` §1.5 records this as **"✅ FIXED — All 8 tab components wrapped in `React.memo()`."** It is not fixed. Wrapping a component that receives a freshly-allocated object 10×/sec in bare `React.memo` is a no-op. Every tab re-renders 10 times per second whether or not it is visible. There is no context, no selector, and no `useSyncExternalStore` anywhere in the game state path (`SocialContext` exists but covers only chat/friends/guild).

This is the constraint that closes off every escape route. You cannot put hit sparks, floating damage numbers, screen shake, ability telegraphs, or cast bars on top of a tree that re-renders itself entirely 10×/sec — it will drop frames on a mid-range phone. So the UI stays text and progress bars. And a UI made of text and progress bars is, definitionally, a menu.

**The menus aren't a design preference. They're what's left after the architecture rules out everything else.**

### 2.5 Minor, but telling: failure isn't an event

On a wipe, the team silently teleports to the start of the chapter:

```ts
return { ...working, wave: retreatWave, /* ... */
  combatLog: [`... Team collapsed and retreated to Wave ${retreatWave}`, ...working.combatLog] };
```

No stakes, no decision, no recovery play, no screen. The most dramatic thing that can happen to a player is a log line. Losing should be the moment the game asks you a question.

---

## 3. The reframe

> An idle game's promise is not "no input." It's **input that compounds.** The player makes a small number of high-leverage decisions, then watches those decisions pay off without them. SimplyIdle currently delivers the watching without the deciding.

Target shape for moment-to-moment play:

- **Idle (player away):** zero input. Unchanged — this already works and is the genre's core promise.
- **Active (player watching):** roughly **one meaningful decision every 10–20 seconds.** Not busywork — a real choice with a visible consequence.
- **Boss / spike moments:** a **30–60 second hand-played encounter** where attention is genuinely rewarded.

And one governing rule for the UI:

> **Nothing gets a screen unless the player makes a decision there.** Pure readouts get a tooltip or an inline chip. This single rule retires most of the ~50 destinations.

---

## 4. The plan

Four phases. Each ships something playable on its own — this is not a big-bang rewrite, and Phase 0 is a hard prerequisite for everything after it.

### Phase 0 — Split hot state from cold state *(prerequisite, ~1 week)*

Nothing else on this list is possible until the 10 Hz full-tree re-render is gone.

- Split `GameState` into:
  - **`CombatState`** — hot, ~15 fields: entities, HP, cooldowns, timers, buffs. Ticks at 10–30 Hz.
  - **`MetaState`** — cold, event-driven: roster, inventory, currencies, unlocks, achievements, social. Changes only on player action.
- Move the combat sim **out of `useReducer`** into a mutable simulation object exposed via `useSyncExternalStore`, with **selector-based subscriptions**. A component that needs `monsterHp` subscribes to `monsterHp`, not to the world.
- Keep `MetaState` on the existing reducer. It's fine there — it changes on events, not on a timer.
- Give the tab components real comparators, or better, have them pull what they need through selectors and stop receiving `state` wholesale.

**Hard constraint discovered during review:** `simulateOfflineProgress` reuses `advanceCombatStep` and steps it in slices (`OFFLINE_SIM_MAX_SLICE_MS`, up to `OFFLINE_SIM_MAX_ITERATIONS = 300_000`). An entity-based sim cannot be stepped 300k times on app resume. **The refactor must keep a closed-form fast path for offline** — the current scalar math, retained as the offline estimator — while the live sim becomes entity-based. Divergence between the two must be bounded and tested, and `__tests__/balanceSimulation.test.ts` is the place to pin it.

Also note `SAVE_SCHEMA_VERSION = 2` and the hand-written field-by-field `LOAD` case: any state reshape needs a migration, and `__tests__/saveRoundTrip.test.ts` needs to cover it.

**Ships:** no visible feature, but the frame budget to build one. Also fixes a real battery/perf bug on mobile.

### Phase 1 — Make combat a scene *(~2 weeks)*

- Model the team as **individual combatants** with their own attack timers, targets, and cast state, instead of summing into one `dps` scalar. The per-hero stat math in `getDps` already exists — stop collapsing it at the end.
- Same numbers, resolved per-entity. Total DPS should be within a tolerance of today's so balance and saves survive; assert it in tests.
- Now that entities exist, render them: hero row, enemy, **floating damage numbers, hit reactions, crits that read as crits, a cast bar when an ability fires.**
- Make the boss approach visible before it lands (`isBossImminent` is already computed and currently renders as the text "⚠️ Boss Approaching").

**Ships:** the game finally *looks* like a fight. Highest perceived-value change on this list.

### Phase 2 — Give the player verbs *(~2–3 weeks)*

- **Hero actives become castable.** `heroActiveCdMs` already exists in state. Replace the `Math.random()` trigger with a real cooldown, show it on the hero's portrait, and let the player fire it. Auto-cast stays available as an *earned* setting.
- **BURST becomes a timing window.** It's already a charge-and-spend resource. Give enemies a telegraph, and make bursting inside the window do something meaningfully different from bursting outside it.
- **Bosses are hand-played.** Waves idle; bosses are a 30–60s encounter with one mechanic per act. `FutureDev.MD` §3.1 already asks for exactly this — *"each new act should introduce one new tactical rule, not just bigger numbers."*
- **Reposition automation as a reward, not a default.** Each `auto*` toggle should be *unlocked* by demonstrating the manual version, and ideally cost something. Automation you earned is a power fantasy; automation that's on by default from the start is just the game deleting itself.
- **Make wipes a decision.** Offer a choice at the moment of failure — spend to hold the line, or retreat and keep partial progress.

**Ships:** an actual skill expression curve, and the 66 authored heroes become things you *use* rather than things you *own*.

### Phase 3 — Collapse the navigation *(~2 weeks)*

- **The battle is the app.** It's persistent and always on screen. It is never a tab you navigate *to*.
- Everything else becomes an **overlay over the live fight**, so the player never loses sight of the game while managing it.
- Target **4 destinations**, down from ~50:
  - **Battle** — the app itself, always visible.
  - **Team** — heroes, formation, gear. (Merges `Heroes` + `Equipment` + their 8 sub-tabs.)
  - **World** — campaign, operations, expeditions. (Merges `Warroom` + `Operations` + `ProgressTab`.)
  - **Social** — already self-contained; leave it alone.
- Apply the §3 rule to the rest:
  - **`Stats` tab → deleted.** It is a pure readout. Its content becomes tooltips on the numbers it explains. `useDpsPowerTooltip` already exists for this.
  - **`Achievements` (5 sub-tabs) → an Objectives ticker.** Surface *the next one*, inline, with a claim button. The browsable archive of 92 entries is a codex link, not a destination.
  - **15 modals → audit each against the §3 rule.** Most are claim-flows that belong inline next to the thing being claimed.

**Ships:** the game stops feeling like an admin console.

### Phase 4 — Depth over breadth *(ongoing)*

Once the loop is real, `FutureDev.MD` already has the right instincts — Order doctrines, hero bonds, act-specific rules. The discipline to hold onto:

> **New content should add a rule, not a screen.** If a feature can't be expressed inside the existing four destinations, it probably isn't a feature yet.

---

## 5. Recommended order

| Phase | Effort | Risk | Player-visible payoff |
| --- | --- | --- | --- |
| 0 — Hot/cold state split | ~1 wk | Medium (save migration) | None directly; unblocks all. Fixes mobile perf. |
| 1 — Combat as a scene | ~2 wk | Medium (balance parity) | **Very high** — it finally looks like a game |
| 2 — Player verbs | ~2–3 wk | Medium (balance) | **Very high** — it finally plays like one |
| 3 — Navigation collapse | ~2 wk | Low (UI only) | High — ~50 destinations → 4 |
| 4 — Depth | ongoing | — | Sustained |

If only one phase ever gets done, do **Phase 1** — but it is not reachable without Phase 0.

If a taste of the payoff is wanted before committing to the refactor, the cheapest real demo is **making hero actives castable** (Phase 2, first bullet). The ability system, the cooldown field, and the effects all already exist; what's missing is a cooldown instead of a dice roll and a button on the portrait. That's small, and it would show what the rest of the plan feels like.

---

## 6. Correction to the existing audit

`AAA_AUDIT.md` §1.5 should be reopened. "All 8 tab components wrapped in `React.memo()`" is recorded as fixed, but bare `React.memo` on a component receiving a newly-allocated ~120-field `state` object at 10 Hz never hits its memo path. Every tab still re-renders 10×/sec, visible or not. It's covered here as Phase 0 rather than tracked separately.

Similarly, §1.1 and §1.2 are marked fixed, but `GameScreen.tsx` is still **4,190 lines with 46 `useState`** and `useGameState.ts` is still **5,901 lines with 91 `useCallback`**. What the extraction achieved was moving *peripheral* concerns (leaderboard, dev console, social sync) into hooks. The core — combat, save/load, and the orchestration of ~50 destinations — is still monolithic, which is the part that matters for this plan.
