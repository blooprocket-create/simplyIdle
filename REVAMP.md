# SimplyIdle — Revamp Plan

The core of this game is good. The problem is that combat is one arithmetic expression, so there is nothing to look at, so ~50 menus became the entire experience.

**Evercast already solved this.** Same genre, same author, shipped: a 2.5D incremental game where the fight is a Babylon diorama, the HUD is four buttons, and every menu in the game lives one tap behind one of them. This plan merges that approach into SimplyIdle rather than inventing one.

The goal, in the shortest form: **keep the million menus, stop making them the game.**

**Status:** plan. Nothing below is implemented yet.

---

## 1. What Evercast already proves

Read from `blooprocket-create/evercast` @ `7e88c44`.

### The navigation answer

`src/ui/nav/destinations.ts`:

```ts
/**
 * The shelf holds this many destinations plus one More slot, forever. It is a
 * fixed cost no matter how large the game gets; growth goes to the rail.
 */
export const SHELF_SLOTS = 3;
```

Three pinned buttons plus **More**, and that never changes. Every other surface lives in the rail behind More, filed into four closed groups (`power`, `companion`, `world`, `record`) and five closed archetypes (`dashboard`, `ledger`, `graph`, `detail`, `moment`):

> Adding a sixth is a deliberate design decision, not something a feature does on its way past.

Badges from everything behind More merge upward (`mergeBadges`) so nothing gets lost back there, and `available(snapshot)` hides a destination until the engine says it exists.

**This is the whole fix for SimplyIdle's 8 tabs + 17 sub-tabs + 15 modals.** The menus don't get deleted — they get filed. Navigation cost becomes constant.

### The architecture answer

```
src/content   authored enemies, zones, gear, spell-tree data
src/engine    deterministic state/rules — may not import React, Babylon or browser APIs
src/ui        React presentation, and presentation-only geometry
src/game      Babylon rendering, animation, VFX — reacts to snapshots, never decides outcomes
src/app       browser lifecycle, persistence, offline catch-up
```

And the rules are **enforced as tests**, not documented and forgotten. `src/engine/architecture.test.ts`:

```ts
expect(source, file).not.toMatch(/from ['"]react/);
expect(source, file).not.toMatch(/@babylonjs/);
expect(source, file).not.toMatch(/\bdocument\./);
expect(source, file).not.toMatch(/\bwindow\./);
expect(source, file).not.toMatch(/\blocalStorage\b/);
```

```ts
it('keeps EvercastSimulation as a coordinator instead of a god file', () => {
  expect(source.split('\n').length).toBeLessThan(300);
});
```

`EvercastSimulation.ts` is **293 lines**. SimplyIdle's `useGameState.ts` is **5,901**. That test is the difference, and it is three lines long.

`src/ui/architecture.test.ts` does the same for presentation: every colour must come from the token sheet, no surface owns a scroll container, no surface is positioned by hardcoded pixels, no grid track count is hardcoded, `SHELF_SLOTS` stays 3, the archetype and group sets stay closed.

### The scale of the files

| | Evercast | SimplyIdle |
| --- | --- | --- |
| Largest file | 970 lines | 5,901 lines |
| Files | 292 | ~90 |
| Total lines | ~44,000 | ~54,000 |

Similar size games. Evercast spreads it across small files behind enforced seams; SimplyIdle concentrates it in four enormous ones.

### Everything else worth taking

- **`break_eternity.js`.** Evercast displays `4.55e53` gold without blinking. SimplyIdle caps at `SAFE_INTEGER_CAP = Number.MAX_VALUE` and uses raw JS numbers — a genre-standard ceiling problem, already solved next door.
- **Companions are real combatants.** *"They swing on their own timers, soak the blows aimed at the mage, and can be knocked out for the rest of an encounter."* That is precisely what SimplyIdle's 66 heroes need to become instead of addends summed into one `dps` scalar.
- **`useSnapshotSelector`.** Selector-based subscription — a component reads `s.gold.display`, not the world. This is the Phase 0 fix, already built.
- **`DeviceProfile` + `FrameGovernor`.** *"The problem on a handheld is heat rather than frame rate."* Tiered budgets plus resolution scaling from measured frame times. An idle game runs for hours; this is not optional.
- **The boot gate.** Title, loading and first-run onboarding as one screen — and the button that opens it is also the gesture browsers require before audio can play, *"which an idle game otherwise never collects."*
- **Derived onboarding.** One hint at a time, each a question about live state, each retiring because the player did the thing rather than because a flag recorded a view. SimplyIdle has `seenHintIds` — a flag list.
- **`SaveGuards`.** Every field bounded on the way in, so no save can produce a state the simulation could not have reached. SimplyIdle's `sanitizeSaveData` is the same instinct; Evercast's is the more complete version.
- **The art pipeline.** `art/` holds Blender sources; `public/models/` holds built GLBs with a manifest. 39 environment props, an articulated cast, five animation clips. SimplyIdle renders monsters as emoji.

---

## 2. Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Renderer | **Babylon.js + React 19** | Matches Evercast, whose visuals are the target. See the reversal below. |
| Build | Vite + TypeScript, Vitest | Matches Evercast and `autofighter` |
| Platform | Web first on Vercel | Native wrapping stays open via Capacitor |
| Backend | **Keep Firebase**, behind a port interface | Inactive accounts still hold real saves |
| Numbers | **`break_eternity.js`** | Removes the `Number.MAX_VALUE` ceiling |
| Docs | This file only | |

### Reversing the Phaser recommendation

An earlier version of this plan said Phaser 3, reasoning from `autofighter`. **That was the wrong comparison.** `autofighter` is a 2D sprite game; Evercast is an incremental game with a persistent 3D diorama, which is the shape SimplyIdle is trying to become — and it is the one whose look is actually wanted here. Taking Babylon also inherits the shader work (`Atmosphere`, `WorldBackdrop`, `WorldHorizon`), the framing rules, the device tiering, and the Blender→GLB pipeline. Phaser inherits none of that.

### On the backend

**Decided: Firebase stays, and the Supabase migration is dropped.** Not deferred — dropped. The earlier plan justified keeping Firebase with *"live player data survives."* There are no *active* players, but there are **inactive accounts holding real saves**, so that reason holds in weaker form. The scope argument was independent and stronger: a Supabase migration on top of a combat rewrite is two risky projects at once. What settles it is that nobody produced a reason to move at all — Firebase already carries the accounts, guilds, chat and leaderboards, and a migration that buys nothing is a migration that can only cost.

Firebase stays behind `ports/` regardless. That seam's remaining justification is the one that never depended on a swap: the engine never learns what a network is, which is what keeps the simulation runnable in a bare Node test, which is what the parity suite depends on.

Note that Evercast is **serverless with no accounts** — three `localStorage` keys, `connect-src 'self'`. SimplyIdle has Firebase, accounts, guilds, chat and leaderboards, so its save and privacy model cannot be copied wholesale. `SaveGuards`' field-bounding is portable; the architecture around it is not.

---

## 3. Target shape

Mirroring Evercast's layout, because it is proven and because two projects sharing one structure is worth more than either having a bespoke one.

```
simplyidle/
├─ src/
│  ├─ content/      heroes, gear, acts, monsters, skills — authored data only
│  ├─ engine/       deterministic rules; no React, no Babylon, no browser APIs
│  │  ├─ combat/    entities, targeting, abilities, damage resolution
│  │  ├─ economy/   gold, exp, gacha, gear
│  │  ├─ progression/ levels, rebirth, meta, achievements
│  │  ├─ roster/    heroes as combatants
│  │  ├─ offline/   closed-form catch-up
│  │  ├─ save/      codec, guards, migration
│  │  └─ snapshot/  the read model the UI and renderer subscribe to
│  ├─ ui/           React: HUD, shelf, rail, surfaces, theme tokens
│  ├─ game/         Babylon: scene, actors, vfx, world, audio
│  ├─ app/          lifecycle, persistence, away clock
│  └─ ports/        service interfaces + Firebase adapter
```

Enforced from day one by `src/engine/architecture.test.ts` and `src/ui/architecture.test.ts`, ported from Evercast — including the god-file line guard, which is the single cheapest defence against how this codebase got here.

### The navigation, concretely

SimplyIdle's ~50 destinations filed into Evercast's model:

| Group | Destinations |
| --- | --- |
| `power` | Character/Stats, Equipment, Skills, Rebirth |
| `companion` | Roster, Party/Formation, Summon |
| `world` | Campaign, Operations, Expeditions, Dungeons, Events |
| `record` | Achievements, Missions, Codex, Leaderboard, Settings |

Shelf: **3 pinned + More.** Battle is not in the list — the battle *is* the screen. Surfaces open as overlays over a running fight, exactly as Evercast's summon reveal does while the combat log keeps printing underneath.

`Stats` stops being a destination and becomes tooltips. `Achievements`' five sub-tabs become one `ledger` surface with an objectives ticker in the HUD.

---

## 4. What carries over from SimplyIdle

Most of the value here is content and balance, and none of it is React-bound:

- `gameConfig.ts` (4,639 lines) → `src/content/`: 66 heroes, 92 achievements, 7 acts, gear catalog, usable items, missions.
- Damage and economy formulas from `useGameState.ts` → `engine/combat` and `engine/economy` as pure functions. **Same numbers**, pinned by a parity suite before any UI work.
- `services/` (~6,000 lines of Firebase) → behind `ports/`, largely unchanged.
- Saves. `SAVE_SCHEMA_VERSION` 2 → 3 with a migration; inactive accounts keep their progress. Note that the shipped version marker is decorative — `sanitizeSaveData` reads it, logs it, and never consults it again, so every migration in there is driven by the shape of a field. The rewrite's reader is shape-driven for the same reason.
- The hero ability system — already made castable on a real cooldown, and already the right shape for entity combat.

Not carried over: `GameScreen.tsx` (4,190 lines), `GameScreen.styles.ts` (5,753), the eight `*TabContent` files, and React Native generally.

---

## 5. Phases

### Phase 0 — Scaffold *(~3 days)*
Vite + TS + Vitest, Evercast's ESLint/Prettier config, the five directories, and **both `architecture.test.ts` files ported and passing on an empty tree**. Babylon renders a placeholder scene. The rules exist before the code does.

### Phase 1 — Engine, headless *(~2 weeks)*
Content and formulas into `content/` and `engine/`. No UI. Deliverable is a parity suite: 10,000 waves matching current balance within tolerance, and a v2→v3 save round-trip. Heroes become entities with their own timers and targets here. `break_eternity.js` goes in at this layer, once, before anything depends on number types.

> **Offline constraint — measured, and not what this section first claimed.** The concern was the 300,000 iteration cap on `simulateOfflineProgress`. Measuring it moved the problem somewhere else: the cap is rarely the binding constraint, and the expensive case is the *stalled* team. With nothing dying and nobody dying, the adaptive step collapses to its one second ceiling and an eight hour window becomes 28,800 full combat steps — **16.8s of blocking work on the load screen**, scaling linearly with the window. A maxed roster parked at wave one, which is what every prestige produces, hits this.
>
> `engine/` ships both paths, with divergence pinned by test. The estimator resolves whole rounds instead of ticks and skips repeats: within 10% of the shipped simulator in the steady state, and up to 4x off across a long climb, because every tenth wave is a boss at 5x HP that the shipped game clears with a burst spent on cue and a whole team's abilities landing together — 112x damage for the millisecond they overlap. A mean cannot spend a cooldown at the right moment. Closing that gap means modelling the cadence rather than its average, which is a combat design decision.
>
> Two things about offline progress that were not obvious from the code: it is a **sawtooth**, not a climb (a defeat retreats to the start of the current twenty-wave chapter), and a player can therefore **come back behind where they left** — 8 of 24 consecutive five minute windows did, worst by 18 waves. `APPLY_OFFLINE_PROGRESS` reports `Math.max(0, delta)`, so every one of those is shown as `+0 waves`.
>
> Evercast's `AwayClock` monotonic high-water mark went in alongside. SimplyIdle had no clock-tamper defence at all: it clamps the *stored* stamp against `now`, which does nothing about `now` itself moving.

### Phase 2 — The diorama *(~3 weeks)*
Babylon scene, hero line, enemies, floating damage numbers, hit reactions, cast bars, boss telegraphs. Port `DeviceProfile` and `FrameGovernor` with it. Art starts as primitives — Evercast's companions are *"procedural placeholder art built from primitives at runtime"* with `modelKey` as the seam for a Blender pack later. Do the same; do not block the renderer on modelling 65 heroes.

> **Placeholders must be silhouette-matched, not capsules.**
>
> Every hero already has authored portrait art: **65 PNGs in `IMG/HeroIcon/`**, mapped 1:1 to hero ids by `src/heroPortraits.ts` (`h1` → `KaelIronheart.png`, and so on), plus a `HeroIcon.psd` source and per-hero `.mp4` clips in `IMG/HeroAnimate/`.
>
> Use them as reference. Kael Ironheart is armoured bulk with pauldrons and a kite shield; Lunara Frostweave is a hooded cloak and a staff on a slight frame. A capsule for both throws away identity that is already drawn and paid for, and it is identity the player is supposed to recognise on the battle line at a glance.
>
> So a placeholder is a small assembly of primitives whose **outline reads as that hero** at gameplay distance — bulk, stance, headgear and the weapon shape — not a single mesh. That is a constraint on Phase 2's placeholders, not a reason to delay them: it is cheap in primitives and it is what makes the diorama legible before any GLB exists.
>
> One caveat for whoever builds them: the portraits are **busts, chest-up**. They are reference for upper body, weapon, headgear and build; legs and full stance have to be extrapolated.

### Phase 3 — Shell and shelf *(~2 weeks)*
Port the destination registry, shelf, rail and `SurfaceHost`. File all ~50 surfaces into the four groups. Battle becomes the persistent screen. Port the token sheet and the UI architecture test with it, so the surfaces are built under the constraints rather than retrofitted to them.

### Phase 4 — Verbs *(~2 weeks)*
Bosses hand-played, one mechanic per act. BURST as a timing window. Automation as an earned reward rather than a default — the nine `auto*` flags currently let the game play itself from the start. Wipes become a decision instead of a silent teleport to the chapter start.

### Phase 5 — Cutover *(~1 week)*
Vercel points at the Vite build: the rewrite takes the site root and the Expo app moves to `/legacy`. Firebase stays — see *On the backend*; there is no migration pass.

**"Retire the Expo app" was the wrong instruction and is withdrawn.** Expo does two jobs here and only one of them is the cutover. It builds the web bundle served at `/`, and it is also the *entire* native path — `eas.json` carries four EAS profiles including `build:android:apk`, and `app.json` declares android, ios and web. Deleting it to swap a web route would have thrown away APK and iOS shipping as collateral for a four-word plan line. The swap needs no file in `src/` deleted, so none is.

The Expo app also stays *on the web*, not just in the repo. There are inactive accounts holding real saves, those saves live behind Firebase, and the rewrite reads local storage only — so until `ports/SavePort` has a Firebase adapter, `/legacy` is the only route by which those players reach their own game. Removing it is a decision that waits on that adapter, not on this phase.

What the new stack does *not* have is a native path of its own: it is Vite and Babylon, so an APK of the rewrite means a WebView wrapper and a real question about WebGL performance on mid-range Android. That is separate work and no part of this phase. Meanwhile the Expo app's native builds are untouched and keep working.

**Rough total: 10–11 weeks.** Phases 2 and 3 are where it stops being a menu simulator.

---

## 6. Risks

| Risk | Handling |
| --- | --- |
| Balance drift during the engine port | Parity suite before any UI work; now actually runs in CI |
| Inactive accounts lose saves | v2→v3 migration + round-trip tests before cutover |
| Offline sim is too slow to run on a load screen (16.8s for an 8h window) | Dual-path engine, closed-form estimator, accuracy committed per scenario |
| Dormant accounts lose data to a "corrected" save reader | Shipped bounds ported as-is; over-allocated stats and past-2^53 wallets kept, divergences pinned as tests |
| Babylon is heavier than the current bundle | `DeviceProfile` tiers and the boot gate exist for exactly this; Evercast ships ~6MB of models behind one |
| Art becomes the bottleneck | Silhouette-matched primitives first (see Phase 2), `modelKey` seam, GLBs later |
| Rewrite stalls half-finished | Every phase ends runnable; the Expo app keeps shipping until Phase 5 |
| The new structure rots the way this one did | Architecture tests from Phase 0, god-file guard included |

---

## 7. Start here

**Phase 0**, and specifically the two `architecture.test.ts` files. They are the cheapest thing on this list and the only one that prevents a repeat: SimplyIdle did not arrive at a 5,901-line hook by decision, it arrived there because nothing said no.
