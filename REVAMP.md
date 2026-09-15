# SimplyIdle — Revamp Plan

The core of this game is good. The problem is that it's wearing the wrong clothes: an Expo/React Native app whose combat is one arithmetic expression, wrapped in ~50 menus because menus are the only surface that accepts input.

This plan ports it onto the stack used everywhere else in this account, and rebuilds the architecture around a real combat simulation — reusing the package decomposition already proven in **WayfinderIsle**.

**Status:** plan. Nothing below is implemented yet. Docs and wiki were cleared to start from a clean slate.

---

## 1. Why port

| | WayfinderIsle | autofighter | simplyIdle (today) |
| --- | --- | --- | --- |
| Build | Vite 8 + pnpm + turbo | Vite 8 | Expo / Metro / npm |
| Language | TS 5.9, project refs | TS 5.9 | TS 5.9 |
| Render | Three.js | **Phaser 3** | react-native-web |
| UI | React 19 | — | React Native |
| Backend | Supabase + Colyseus | — | Firebase |
| Tests | Vitest | — | Jest |

simplyIdle shares the language and nothing else. Every habit, script and mental model from the other projects stops at its door.

The decisive part isn't the tooling though — it's that **WayfinderIsle already contains the architecture this game needs**:

```
packages/
  combat-engine    economy-engine   skill-engine    simulation
  game-core        game-renderer    game-ui         game-content
  math             shared           telemetry       validation
```

Pure engine packages, with renderer and UI layered on top. simplyIdle's central defect is that it has no combat engine at all — `advanceCombatStep` subtracts `dps × dt` from a single scalar inside a 5,900-line React hook. Porting isn't inventing a structure. It's adopting the one that already works next door.

## 2. Decisions taken

| Decision | Choice | Why |
| --- | --- | --- |
| Renderer | **Phaser 3 + React 19 UI** | Matches `autofighter`. Phaser owns the combat canvas; React owns HUD and menus over it. |
| Platform | **Web first**, native wrapper later | Vite → Vercel, as today. Capacitor stays an option, not a constraint. |
| Backend | **Keep Firebase**, behind a port interface | Live player data survives. Supabase swap becomes a later, separate pass. |
| Docs | **Cleared**, including `wiki/` | This file is the only design doc. Wiki build stripped from `build:web`, Vercel rewrites and CI. |

## 3. Target shape

```
simplyidle/
├─ apps/
│  └─ client/              Vite + React 19 shell, mounts Phaser + UI
├─ packages/
│  ├─ game-core/           tick loop, state container, save/load, selectors
│  ├─ combat-engine/       entities, targeting, abilities, damage resolution
│  ├─ economy-engine/      gold/exp/gacha/gear, all currency math
│  ├─ progression-engine/  levels, rebirth, meta upgrades, achievements
│  ├─ game-content/        heroes, gear, acts, monsters, skills (data only)
│  ├─ game-renderer/       Phaser 3 scenes, sprites, effects
│  ├─ game-ui/             React components, HUD, overlays
│  ├─ ports/               service interfaces + Firebase adapter
│  ├─ math/                formatting, curves, safe arithmetic
│  └─ shared/              types shared across packages
└─ pnpm-workspace.yaml     + turbo.json, vitest, eslint, prettier
```

Dependency rule, enforced by lint: **engines never import renderer or UI.** `combat-engine` must be runnable in a bare Node test with no DOM. That single constraint is what makes the sim testable, the offline simulation trivial, and a future server-authoritative mode possible.

### The state split

The current design spreads a ~120-field `GameState` object ten times a second and hands it to all eight tabs, which are wrapped in `React.memo` with no comparator — so every tab re-renders 10×/sec whether visible or not. That is why the UI can only afford text and progress bars.

After the port:

- **`CombatState`** — hot. ~15 fields: entities, HP, cooldowns, timers, buffs. Ticks at 30 Hz inside the engine, never through React. Phaser reads it directly each frame.
- **`MetaState`** — cold. Roster, inventory, currencies, unlocks. Changes on player action only. React subscribes via selectors, so a gold change re-renders the gold chip and nothing else.

React stops being the game loop and goes back to being the UI.

## 4. What carries over

Most of the value in this repo is content and balance, and all of it survives the port — it's plain TypeScript data with no React in it:

- `gameConfig.ts` (4,639 lines) → split into `game-content/` modules: 66 heroes, 92 achievements, 7 acts, the gear catalog, usable items, mission goals.
- The damage/economy formulas in `useGameState.ts` → lifted into `combat-engine` and `economy-engine` as pure functions. **Same numbers.** A parity test pins new-vs-old DPS across a wave sweep so balance doesn't silently drift.
- `services/` (~6,000 lines of Firebase: guild, chat, leaderboard, friends, DMs, presence, cloud save) → moves behind `ports/` largely unchanged.
- Save format. `SAVE_SCHEMA_VERSION` goes to 3 with a migration from 2; existing players keep their progress.

What does **not** carry over: `GameScreen.tsx` (4,190 lines), `GameScreen.styles.ts` (5,753 lines), the eight `*TabContent` files, and the React Native surface generally. That's the part being replaced, and it's the right part.

## 5. Phases

Each phase ends somewhere runnable. No phase is a big-bang cutover.

### Phase 0 — Scaffold *(~3 days)*

pnpm workspace, turbo, Vite, Vitest, ESLint/Prettier mirroring WayfinderIsle's config. Empty packages with the dependency rule enforced. `apps/client` renders "hello" with a Phaser canvas mounted. CI green on the new layout.

### Phase 1 — Engines, headless *(~1.5 weeks)*

Port content and formulas into `game-content`, `combat-engine`, `economy-engine`, `progression-engine`. **No UI.** The deliverable is a test suite: a headless sim runs 10,000 waves and matches current balance within tolerance. Save migration v2→v3 round-trips.

This is where the combat model actually changes: heroes stop being addends in `getDps` and become entities with their own attack timers, targets and ability casts. Same aggregate output, now with structure a renderer can draw.

> **Offline constraint.** `simulateOfflineProgress` currently steps `advanceCombatStep` up to `OFFLINE_SIM_MAX_ITERATIONS = 300,000` times on resume. An entity sim can't be stepped 300k times on app open. `combat-engine` therefore ships two paths: the live entity sim, and a closed-form estimator (essentially today's scalar math) for offline catch-up. A test pins the divergence between them.

### Phase 2 — The fight, rendered *(~2 weeks)*

Phaser scene: hero line, enemy, attack animations, **floating damage numbers, hit reactions, crits that read as crits, cast bars, boss approach telegraphs.** React HUD over the top for HP, wave, currencies.

First point where it stops looking like a spreadsheet.

### Phase 3 — Verbs *(~2 weeks)*

Give the player something to do:

- **Castable hero actives.** Today `tickHeroActives` fires 66 heroes' authored abilities — Shield Wall, Execute, Rallying Cry, Soul Drain — on a `Math.random()` roll per tick, and reports them as a line of text in a combat log. Replace the roll with a real cooldown on the existing `heroActiveCdMs`, surface it on the portrait, let the player fire it. **The content is already written; it just needs a button.**
- **BURST as a timing window** rather than a charge-and-spend button.
- **Bosses hand-played** — 30–60s encounters, one mechanic per act.
- **Automation as an earned reward.** The nine `auto*` flags currently make the game play itself from the start. Each should be unlocked by demonstrating the manual version. Automation you earned is a power fantasy; automation on by default is the game deleting itself.
- **Wipes become a decision** — hold the line or retreat, not a silent teleport.

### Phase 4 — Navigation collapse *(~1.5 weeks)*

~50 destinations → 4. The battle is the app, always on screen, never a tab. Everything else is an overlay over the live fight.

- **Battle** — the app itself
- **Team** — heroes, formation, gear (absorbs Heroes + Equipment + 8 sub-tabs)
- **World** — campaign, operations, expeditions (absorbs Warroom + Operations + Progress)
- **Social** — already self-contained

`Stats` is deleted outright: it is a pure readout, and its content becomes tooltips. `Achievements` (5 sub-tabs, 92 entries) becomes an objectives ticker that surfaces the *next* one inline.

Governing rule: **nothing gets a screen unless the player makes a decision there.** Readouts get a tooltip.

### Phase 5 — Cutover *(~1 week)*

Retire the Expo app. Vercel points at the Vite build. Then, separately and unhurriedly: the Supabase migration behind `ports/`.

**Rough total: 9–10 weeks.** Phases 2 and 3 are where it stops being a menu simulator; everything before them is groundwork, everything after is consolidation.

## 6. Risks

| Risk | Handling |
| --- | --- |
| Balance drift during the engine port | Parity test suite, wave-sweep, before any UI work |
| Losing live players' saves | v2→v3 migration + round-trip tests before cutover |
| Offline sim can't run an entity model 300k steps | Dual-path engine: live sim + closed-form estimator, divergence pinned |
| Rewrite stalls half-finished | Every phase ends runnable; old app keeps shipping until Phase 5 |
| Native store presence lost | Web-first is a deliberate call; Capacitor remains available |
| Firebase and Supabase both half-wired | Backend explicitly out of scope until after cutover |

## 7. Start here

The cheapest proof that this plan is worth 9 weeks is **Phase 3's castable hero actives** — the abilities, the cooldown field and the effects all exist today. Swap the dice roll for a cooldown, put a button on the portrait. It's small, it's reversible, and it demonstrates the single biggest gap between what this game contains and what it lets you do.
