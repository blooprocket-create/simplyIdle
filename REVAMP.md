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

The Expo app also stays *on the web*, not just in the repo. There are inactive accounts holding real saves, those saves live behind Firebase, and the rewrite reads local storage only — so until `ports/SavePort` has a Firebase adapter, `/legacy` is the only route by which those players reach their own game. Removing it is **Phase 13**, and it waits on the whole parity run below, not on this phase.

What the new stack does *not* have is a native path of its own: it is Vite and Babylon, so an APK of the rewrite means a WebView wrapper and a real question about WebGL performance on mid-range Android. That is separate work and no part of this phase. Meanwhile the Expo app's native builds are untouched and keep working.

**Phases 0–5: roughly 10–11 weeks.** Phases 2 and 3 are where it stops being a menu simulator.

---

## 5b. Parity — Phases 6 to 13

**Phases 0–5 never ported the game.** They ported the *fight*: an engine, a diorama, a shell, four verbs, and a deploy swap. That was the plan as written, and the plan as written stops well short of what the shipped game does. Said plainly so nobody reads a green Phase 5 as a finished port:

| | shipped | rewrite |
| --- | --- | --- |
| lines | 54,446 | 11,007 |
| nav destinations built | — | 7 of 19 |
| player actions | **85 reducer actions** | 4 |
| account / social services | 18 files, 6,090 lines | 0 |

Everything you can click in the rewrite today: spend BURST, answer a wipe, answer a boss tell, toggle one automation, and navigate. **No surface changes your character.** You cannot equip, level, summon, rebirth, spend a stat point, or buy anything. Where a word like `rebirth` appears in the new engine it is a *saved field* read so the damage maths is right, not a system.

The phases below end at parity. They are ordered by what unblocks what, not by what is fun — the first two are unglamorous and everything else waits on them.

### Phase 6 — The save round-trip *(~2 weeks)* — **done, bar one binding**
A v3 reader that bounds a stored payload as hard as `migrateSave` bounds a v2 one, the writer to pair with it, and the adapter behind `ports/SavePort`. `saveStore.ts` shipped read-only because `migrateSave` reads the *v2* shape and would silently empty a v3 payload.

**Everything downstream needs this.** Without it no system below can persist what it changes, and returning accounts cannot reach their saves — which is the sole reason `/legacy` cannot be retired.

Delivered: `engine/save/v3.ts` (reader, writer, version dispatcher), `engine/save/legacyPayload.ts` (the trip back to v2), `ports/remoteSave.ts` (the save documents), `saveStore.writeSave`. The bounding is *shared* with the migration rather than restated, so "as hard as" is a fact about the call graph.

Three bugs the round-trip laws caught, none visible by reading the code:

- **Unspent stat points inflated on every load.** v2 stores `unspentStatPoints` as a pool held *on top of* the level budget; a `SaveV3` has already done that sum. A level-100 character would gain 495 points by loading their own save, and again on the next load.
- **The shipped game re-equips a relic you took off.** `equippedByUid: null` does not mean "unequipped" to `sanitizeSaveData` — it tests for a string first and falls through to `boundedBoolean(equipped, true)`, and its own writer stopped emitting that flag.
- **Writing v3 into the shared document is silent, not loud.** The shipped reader is total, so it reads a `SaveV3` as a valid save with nothing in it and hands the player a new account.

**Not done, and moved to Phase 12:** binding `SaveDocStore` to `firebase/firestore`. `users/{uid}/saveSlots/{slot}` needs a uid and the rewrite has no auth at all, so that binding would be a dependency and a file nothing could exercise, added in front of the thing it waits on. Around thirty lines once `onlineAuth` lands.

### Phase 7 — The character *(~2 weeks)* — **done**
`ALLOCATE_STAT`, `ALLOCATE_STAT_N`, `ALLOCATE_STAT_MAX`, `CREATE_CHARACTER`, and the engine layer underneath: `derivedStats`, `getMetaSurvivalMultiplier`, `getRebirthSurvivalMultiplier`, the mastery ceiling and the tactics stack. Team health was a flat `2000` with a note saying nothing derived it, which left every later balance number unanchored.

Fixture-backed like the Phase 1 ports, against `useGameState`, before anything read them.

Two shipped details pinned because they are easy to miss by reading quickly: heroes contribute their **class** base vitality, not their template's — `computeStats` prefers the template for display and `getTeamMaxHp` never does — and the six multipliers compose by multiplication, which is within a few percent of addition at low levels and wrong by a lot in the deep game.

One deliberate divergence: `ALLOCATE_STAT_N` computes `Math.min(amount, unspent)` with no floor, so a negative amount adds points back and drives the stat below zero, repeatable. Nothing sends one today, but these are engine functions now rather than one component's private handler. The fixture records the shipped behaviour and the port clamps at zero.

Class mastery and the tactics facility are **read** out of the `legacy` bag rather than claimed: claiming a key changes every stored save's meaning, and both belong to the phases that own the systems granting them.

The starting team lands on **843** against the old 2000, and still climbs into the forties within a minute and sawtooths there — which the derivation was not tuned to preserve.

Equipment is the one term still missing from `derivedStats`; it is Phase 9, and the function takes it as an argument so that phase adds a caller rather than editing it.

### Phase 8 — The roster *(~3 weeks)*
Summoning and everything that shapes a team: `SUMMON_HERO` with banners, rate-ups, soft pity and milestones; `SPARK_EXCHANGE`; `LEVEL_UP_HERO_GOLD`, `BATCH_LEVEL_HEROES`, `RANK_UP_HERO` and its max/rebirth variants; `REBIRTH_HERO`, `RECYCLE_HERO`; `SET_ACTIVE_TEAM`, `SET_HERO_FORMATION`, `SAVE_TEAM_LOADOUT`, `LOAD_TEAM_LOADOUT`, `UNLOCK_TEAM_SLOT`.

Content: `RANK_CONFIGS`, `FEATURED_SUMMON_BANNERS`, `GACHA_SUMMON_COST`, `DIAMOND_SUMMON_COST`, `HERO_LEVEL_EXP_FORMULA`, `SPARK_TOKEN_BY_RARITY`, `SPARK_EXCHANGE_OPTIONS`, `BANNER_RATE_UP_BY_RARITY`, `SUMMON_MILESTONES`, `SOFT_PITY_*`, `VIP_SUMMON_DISCOUNT*`.

**Engine layer done, and reachable.** Summoning with both pity systems, the template pick and tier clamp, milestones, spark tokens and the spark exchange; levelling, ranking, rebirth and recycling; team selection, formation, loadouts, slot unlocks and batch levelling.

The rules were complete and *uncallable* for a while, which is its own lesson: they take a hero pool, a milestone list and a `random` as arguments, and nothing was passing them. Four layers closed that — `content/summon.ts` for the catalogue, `roster/summonSave.ts`, `roster/sparkSave.ts` and `roster/rosterSave.ts` for "the save before and the save after", and a closed set of verbs on `SurfaceProps` for the screens. Every one of them now has a screen: Summon for pulling, Roster for levelling, ranking, recycling and the spark exchange, Party for formation and lineups.

#### The spark exchange, and why it is not a summon

`spendSpark` was the purse rule and nothing else — find the option, check the balance, subtract — and the half that hands over a hero did not exist. Routing that half through `applySummon` would look like reuse and would be wrong four ways: it would move the pity counter, count towards the milestone track, draw three or four values instead of one or two, and pay duplicate spark *back*. The `spark_free_charge` option does not even grant a summon; it grants a **charge**, and does not claim `firstGiven` — setting that would cost a new player the opening pull the flag exists to guarantee them.

The draw order is the contract here as it is for a pull, and the recorded exchanges pin it: **two values untargeted, one when the player names a hero.** The skipped value is the *first*, so a port that drew the pick and discarded it would hand over the same hero with a different uid — and the uid is its own namespace, `<template>_<ms>_spark_<n>` rather than a summon's `<template>_<ms>_<n>`.

One finding worth recording: **the tier clamp is in the path and the shipped catalogue never reaches it.** `spark_rare` and `spark_epic` draw from tiers 2-3, whose bands run `common..legendary` and `rare..godly`; `spark_mythic` draws from tiers 3-4, which reach transcendent. So deleting the clamp leaves every fixture assertion green, and the test that catches it builds a pool to force one — *retiered* rather than filtered, because the bands are index ranges and a pool of twenty tier-one heroes makes `slice(40, 60)` empty, at which point the exchange refuses instead of clamping.

The rows moved to `content/summon.ts` with their labels, the same split `Milestone` and `SummonMilestone` already make, and `spendSpark` takes the table as an argument — a module-level constant in the engine was the engine reading the catalogue.

#### The formation control says which half of it lands

Party is where `SET_HERO_FORMATION` becomes reachable, and its buttons are gated on the rules rather than left to be refused: `placeHero` **refuses** where `fieldTeam` replays, so an ungated placement button is a button that does nothing. The gate is the shipped one including the part that reads like an oversight — a full rank refuses a fielded hero and accepts a benched one, which is what lets a second formation be arranged before it is swapped in, and is why the surface has a Reserve section at all.

And the caveat is on the screen in the player's words rather than in an engine comment. `getFormationRoleForHero` returns the class's first legal rank and never reads the stored choice, so a monk moved to the middle is still counted in the front by the damage chain. The stored rank *is* read when validating team selection, which is why the control looks like it works. The bug is ported deliberately — the contract is that the numbers do not move — but a control whose caveat is invisible is a control that lies.

The strongest parity claim in the rewrite so far: **118 pulls across four recorded runs, matched on rarity and hero id, from one seed.** Every function takes a `random: () => number` rather than reaching for the global, for the same reason the engine may not read the clock — and because the *draw order* is part of the behaviour, so a port with the same distribution but a different order would pass any statistical test and disagree on every pull.

Thirteen shipped behaviours ported deliberately rather than tidied. The ones worth knowing: soft and hard pity draw from **different** tables; the pre-postgame pool sums to 0.999, so one pull in a thousand is silently *common* rather than the best outcome; `calculateShardReward` floors level at `max(1, level - 1)`, so a level-one hero recycles for what a level-two does; batch levelling spends in **roster order**, not the order the caller asked in; and a batch recycle rounds once at the end, so a sweep pays strictly less than the same heroes one at a time.

#### The automation line above was wrong

It said this phase unlocks `summon`, `recycle` and `tempo`. It unlocks none of them, for two different reasons, and the flags stay `available: false`.

`summon` and `recycle` have their rules now, and `available` is a claim that **the shell wires the flag to the running simulation** — `ui/architecture.test.ts` enforces that correspondence directly and caught an attempt to flip them on the strength of the rules alone. The wiring waits on the currencies they move: an automatic summon spends **boss tears** and an automatic recycle pays into **hero shards**, and the simulation earns neither. Nor could it usefully — both are spent as well as earned, and a counter that only ever goes up is not something an automation can draw on. They get switched on in **Phase 10**, with spending.

`tempo` cannot get rules here at all. Auto-tempo raises `combatTempo` when `combatHeat` is zero, and this engine has neither — heat does not exist in it, and `tempo` survives only as a scalar the offline estimator multiplies by. It waits on whichever phase builds heat.

#### A slice of Phase 10, pulled forward: the wallet

The simulation had **no economy at all**. `Simulation` tracked kills, deaths and damage; `awayCredit.ts` carried a note saying "it has no economy yet, so no gold or EXP is awarded here"; and `demoRoster.ts` handed the profile a hardcoded `gold: 8_421_000` in the same spirit as the flat team health Phase 7 replaced. Meanwhile the offline estimator had been computing a window's gold correctly *and throwing the figure away*. So a player who stayed earned nothing and a player who left was told nothing.

That blocks this phase rather than the next one: levelling is priced in gold (`heroGoldLevelCost`, `batchLevel`), so is a team slot (`TEAM_SLOT_UNLOCK_RULES`), and a roster screen that shows what a level costs against a balance that does not exist cannot be built. So gold and EXP land here, in `engine/combat/rewards.ts`, and the plan says so rather than leaving the reordering implied.

What landed is **earning, not spending**: `killReward`, a `RunEarnings` tally on the simulation, `gold` and `exp` on `SimulationSnapshot.totals`, the estimator's figures claimed instead of dropped, and the purse persisted in `RunProgress` — as text, because `Decimal.toString()` outlives the JSON number the shipped save used and the wave curve is explicitly built to pass that point. `ui/profile/playerProfile.ts` gains `heldGold`, which adds the run to the banked balance; before it, the Character screen's gold sat frozen at whatever the save said while the fight went on earning.

Two things worth knowing, both ported rather than tidied:

- **The kill reward is rounded up, once, over the whole chain.** The shipped `killMonster` wraps its entire product in a single `Math.ceil`, so a wave-one monster worth 8 gold on the curve and 8.48 after its affix pays **9**. The offline estimator deliberately does *not* round, because it extrapolates repeats and a per-kill ceiling would apply to kills it never simulated — so `RunEarnings.creditAway` takes a block whole rather than re-deriving it from a count.
- **Gold is not linear in kills.** Over the same minute the estimator credits 15% more kills than the live loop and **3.5x** the gold, because the curve grows at 1.14 a wave and the last few waves are most of the purse. The away test asserts the relationship that does hold — a sum of `k` increasing prices sits between `k` times the first and `k` times the last — rather than a ratio that would look like a flake.

`Simulation.ts` was six lines under its 300-line cap, so `teamDps` moved to `entities/HeroEntity.ts`, beside the `nominalDps` it sums. That is what the cap is for: summing a roster's damage is a rule about heroes, and it was living in the coordinator only because it was two lines long.

#### The damage multiplier chain was built and not connected

Found while working out what a running fight can observe about a roster. `engine/combat/` carries `synergy.ts`, `formation.ts`, `heroPassives.ts`, `uniqueRelics.ts` and `progressionMultipliers.ts` — every one ported, every one pinned against a fixture generated from the shipped source. **None of them was called by anything the player ran.** `app/roster.ts` built a hero's damage from `getHeroContribution` and stopped.

So the live fight was missing the whole stack the shipped game applies on top of base damage: team synergy, the formation bonus, hero passives, unique relics, the prestige and meta levels, class mastery, VIP, the achievement bonus and the team boost. It was the same shape as the wallet — rules complete, caller missing — and it was measurable: rarity reached the fight through exactly one channel, `getRankStatMultiplier(rank, rarity)`, which is **1 at rank one whatever the rarity**, so a rank-one legendary and a rank-one common fought identically.

**The player was not fighting either.** `getDpsBreakdown` adds `playerDps` to the hero total before any multiplier, and nothing in the port computed it — a character's class, level and every stat point they had ever spent did nothing. On a fresh account the player is *most* of the damage: 24.6 against about 9 for a level-one common hero.

Three things closed it. `playerDamage.ts` ports the player's own contribution, with its own constants — the shipped formula is not the hero formula and reads the class weights four times rather than once. `teamPower.ts` composes the fourteen factors in the shipped sequence, written out by hand because float multiplication is not associative and `multiplyProgression` reproduces only the progression subset's order. And `heroes.ts` finally carries `passiveTrait` and `activeSkillArchetype`, which it had left behind for four phases on the grounds that nothing read them — two of the fourteen multipliers did, and were unreachable from a real roster for want of two strings a hero.

The player is now a seventh combatant with their own entity, cast member and swing cadence, not a bonus applied to the team. `PLAYER_ATTACK_INTERVAL_MS` was written for exactly that and had sat unused.

Measured on the starting team: DPS goes from 365 to 1,094, of which the player is 222 — more than any single hero. The demo reaches wave 45 in a minute against wave 36, and still meets its first wall at wave 41.

The **mitigation** chain went the same way, and it was wrong in both directions before it was right. `Simulation` defaults `incomingMult` to zero, which made the app's team literally invulnerable — they stalled around wave 59 with the wipe offer unreachable — so the demo handed it a flat `1`. That is a team taking a monster's damage *raw*: no defence, no formation, no synergy, no hero passives, no relics. Against the shipped chain that is up to **ten times** too much, since a deep account's multiplier is 0.10 and even a bare level-one warrior's is 0.97.

Nothing anchored it. Every other multiplier fixture reads through `getDpsBreakdown`, which reports damage only — the synergy fixture's own note says "Iron Mandala moves incoming… none of which the breakdown reports" — so `mitigationFixture` measures the composed scalar off the real combat step instead, the way the offline fixture measures the same quantity.

**Defence and health are not the same stack**, which is the trap: both scale by meta survival, the rebirth path, formation, synergy and the tactics facility, and health *also* takes class mastery while defence does not. Sharing one function between them would have handed the player a mastery bonus the shipped game does not give.

And the port was off by exactly 0.8 on every scenario with a warrior in it, which turned out not to be mitigation at all: **hero active skills are a fifth unported system**, `autoCastHeroActivesEnabled` is on by default, and every `frontline_ward` hero auto-casts a damage-reduction buff. The fixture switches them off and says why, so the rewrite is measured against the chain rather than against a system it does not have. They belong with `CAST_HERO_ACTIVE` in Phase 10.

Team health, by contrast, was already complete: `teamMaxHp` applies formation and synergy itself.

#### The starting team is a save now, and that fixed four disagreements

`demoRoster.ts` bolted four independently written things together — heroes with hand-written DPS, a cast, a `PlayerProfile` built by hand, and a team health figure derived from *different heroes again* — and each told a different story about the same six people. Building one `SaveV3` and running it through `rosterFromSave` makes that impossible rather than merely fixed, for the reason that function's own comment already gave: a save has three readers, which is three chances to disagree.

What was wrong:

- **The formation was illegal.** Picking one hero of each class gives three whose intended rank is `front` plus a spare that was usually a fourth, and a rank holds two — so the shipped selection rules fielded **four of the six**. The cast path does not check, so the diorama drew all six standing somewhere the game says they cannot stand. The sixth is now a *second archer* rather than an arbitrary spare, and the monk spends their one choice on mid, which is what makes a legal two-two-two.
- **Health measured a different team.** The profile listed them at levels 40–75 with mixed rarities; the health derivation assumed six **level-one commons** and came out at 843 for a team the screens described as veterans. Everything downstream of health — how long they survive, which wave is the wall, where the offline sawtooth turns over — was measured against the wrong one.
- **Damage rested on a presentation decision.** `100 + index * 18`, chosen so the cast bars would visibly run at different rates. Nothing derived it.
- **Every third hero had rank zero.** There is no rank zero; the reader clamps it, so the only symptom was a roster row that would not move.

The starting save is built as a raw payload and read through `readSave`, so it is a save *by construction* — bounded by the same reader every stored save goes through, and subject to the idempotence `v3.test.ts` holds that reader to. A literal could quietly carry exactly the rank of zero the hand-built profile did. `teamBoost` is deliberately left out of the payload, because the reader floors it at the hero's own authored base boost.

It costs the demo 365 DPS against 870, and buys it 3,826 health against 843, both derived from the six heroes actually shown. The demo is **better** for it: over ten minutes it reaches wave 48 against the old wave 43, wiping twice instead of eight times, and both versions meet their first wall at wave 41.

What this does *not* settle is what a genuinely new player should start with. The save still carries the showcase numbers — level 42, 1,482 kills, a seeded wallet — because those are contents rather than structure, and choosing them is a design question for Phase 10 rather than a port. It is now one number in one place to change.

### Phase 9 — Equipment *(~2 weeks)*
`EQUIP_ITEM`, `TOGGLE_EQUIP_HERO`, `CRAFT_EQUIPMENT`, `DISMANTLE_EQUIPMENT`, `UPGRADE_EQUIPMENT_RARITY`, `CONVERT_SCRAP_TO_ESSENCE`, `CONVERT_SCRAP_TO_SHARDS`, `TOGGLE_HERO_UNIQUE_WEAPON`. Content: `EQUIPMENT_CATALOG`, `EQUIPMENT_RARITIES`.

**Done, and on a screen.** The catalogue's seventy-five items and six rarities, the rarity roll and its tier gates, the stat roll, the scrap rates, the forge's prices, all eight actions, the save slice, and an Equipment surface that reaches every one of them. `TOGGLE_EQUIP_HERO` is the exception and is *not* about equipment at all: it fields or benches one hero, which `fieldTeam` already did in Phase 8.

The strongest claim here is the stat roll: **every crafted item the fixture recorded is reproduced bonus for bonus**, across all fifteen class-and-slot combinations plus a forge level and three player levels, from one seed. A craft draws eight values in a fixed order — the rarity, the pick, the instance id, then one per stat — and the id comes *before* the bonus, which is the whole reason `createEquipmentInstance` is one function rather than two calls at a seam.

#### Five shipped behaviours ported deliberately

| | |
| --- | --- |
| **A roll of exactly 1 returns `common`** | The subtractions leave ~7e-15 above zero for the full table, so the loop ends and the trailing fallback fires: the best possible roll gives the worst item. The gated pools do *not* do it, which is what shows it to be float residue rather than a guard. |
| **A locked tier pushes every boundary up** | The filter removes weight from the *denominator*, so legendary starts at 0.97 with mythic locked against 0.9566 without — and then runs to the ceiling, which is the actual effect. |
| **An unaffordable upgrade still draws a value** | `getEquipmentUpgradePlan` picks its target before the purse is checked. A summon, a spark exchange and a craft all refuse before touching the dice; this one does not. |
| **The last stat takes the remainder** | Rounding each share independently never spends the budget exactly. And the authored stats are floored at one *afterwards*, which can push the total above it — that floor is why an item always shows the stats its description promises. |
| **The relic toggle re-derives its bearer** | `TOGGLE_HERO_UNIQUE_WEAPON` takes a uid to find the *template*, then equips the preferred copy — so pressing on a weak copy hands the relic to the best one, and a relic sitting on an old copy **moves** rather than coming off. Two presses to remove. |

#### A finding from the catalogue rather than the code

I wrote that the upgrade plan's per-step multipliers never bite. **They bite constantly.** Every class has five items per slot across six rarities, so every class-and-slot pair is missing exactly one — the warrior's weapons have no epic, the mage's armour has neither common nor rare. A warrior upgrading a rare weapon lands on legendary, two steps, at 1.55× the scrap. A port that took one step and refused on an empty pool would refuse the most ordinary upgrade in the game — and the same gap is why a craft's rolled rarity is a *preference*: with no item at that rarity the pick falls back to the whole class and slot, so one craft in six hands over something other than what was rolled.

A second one from the catalogue: **a starter set is not three commons.** No accessory is common, so every class starts with a rare there — and the mage with an *epic*, the strongest starter item in the game. That falls out of "sort by rarity and take the first" rather than being chosen.

#### The equipment term, connected

`derivedStats` has taken an equipment argument since Phase 7 with a note saying "Phase 9 adds a caller rather than editing it". That caller is `app/roster.ts`, and it feeds **all three** places the player's stats reach the fight at once — their damage, the team's defence and the team's health — because the shipped `derivedStats` is one function and all three read it. It joins the fight signature for free, since the signature is derived from the built roster rather than from a list of save fields.

The starting save wears its class's starter set as three rolled **instances**, which is what `CREATE_CHARACTER` builds: an instance's stats are rolled against a level rather than taken from the row's authored bonus, and `source: 'starter'` prices them at a fifth when dismantled.

And a pre-instance inventory is converted at the **app layer**, at load, because the shipped `migrateLegacyEquipmentIds` draws *and* reads the catalogue and the engine's reader may do neither. Not cosmetic: a bare row carries its authored three or four points where the instance it becomes is rolled against the player's level — at level 100, an order of magnitude more.

#### The automation line above was wrong, again, and differently

It said this phase unlocks `equipBest` and `dismantle`. Both flags stay `available: false`, and the reason is worth recording because it is the same reason `summon` and `recycle` are still off.

`equipBest` is misnamed: `AUTO_EQUIP_BEST_HEROES` has nothing to do with equipment — it sorts the roster and fields the strongest, which is a Phase 8 roster verb. And `dismantle` runs off the shipped combat tick, so in this build it would run off a snapshot subscription in the shell.

Which is the actual blocker, and it is structural: **every remaining automation touches the save rather than the simulation**, and `ui/architecture.test.ts` gates automations by requiring the shell to call `loopRef.setAuto…` for each one marked available. That gate is exactly right for `burst`, which is an in-fight behaviour, and has no shape for an automation that spends currency or rearranges a roster. Widening it once, for all four, belongs with Phase 10 — where `summon` and `recycle` already wait, and for the same reason. Forcing one through now would mean satisfying the test's regex rather than its intent.

### Phase 10 — The economy *(~3 weeks)*
Shops and everything spendable: `BUY_GOLD_SHOP_ITEM`, `BUY_DIAMOND_SHOP_ITEM`, `BUY_PREMIUM_COOLANT`, `USE_USABLE_ITEM`, `SIMULATE_DOLLAR_PURCHASE`; skills via `BUY_SKILL` and `CAST_HERO_ACTIVE`; prestige via `REBIRTH`, `SPEND_REBIRTH_CORE`, `SPEND_ESSENCE_UPGRADE`, `UPGRADE_FACILITY`; VIP via `CLAIM_VIP_REWARD`, `CLAIM_CODEX_HERO_VIP`, `CLAIM_CODEX_UNIQUE_VIP`. Content: `USABLE_ITEMS`, `SKILLS`, `REBIRTH_BONUS`, `REBIRTH_WAVE_THRESHOLD`, `COST_SCALE`, `GIFT_AMOUNTS`.

**All nine `auto*` flags finally have systems** — `usePotion`, `useCoolant` and `castHeroActives` land here, and the earn-then-choose gate built in Phase 4 stops being a policy with one subject.

Gold and EXP arrived early, in Phase 8 — see the note there. What is left for this phase on the currency side is the part that actually needed the shops: **spending**, the seven other currencies, and the multiplier chain itself. `RewardRates` carries that chain as one measured scalar today, exactly as `OfflineConditions` does, so assembling it here means replacing a number rather than rewriting the callers.

### Phase 11 — The loops *(~3 weeks)*
The reasons to log in: `CLAIM_MISSION`; `START_EXPEDITION`, `COMPLETE_EXPEDITION`, `REFRESH_EXPEDITION_CONTRACTS`; `RUN_RIFT_DUNGEON`, `RUN_TREASURY_RAID`; the four minigames and the bounty draft; `APPLY_DAILY_LOGIN`, `APPLY_WEEKLY_ROLLOVER`, `CLAIM_WEEKLY_TRACK`; mail (`APPEND_MAIL_MESSAGES`, `CLAIM_MAIL_ATTACHMENT`, `CLAIM_ALL_MAIL_ATTACHMENTS`); `MARK_STORY_BEAT_SEEN`. Content: `MISSION_BOARD_GOALS`, `WEEKLY_EVENTS`, `WEEKLY_TRACK_MILESTONES`, `STORY_BEATS`.

Clears eight of the twelve placeholder destinations.

### Phase 12 — Accounts and the social layer *(~4 weeks)*
The 6,090 lines nothing has touched: `onlineAuth`, `onlineSave`, `guild`, `guildWars`, `chat`, `directMessages`, `friends`, `leaderboard`, `presence`, `publicProfile`, `activityFeed`, `blockReport`, `characterNameRegistry`, `cloudMail`, `playerSearch`.

Behind `ports/`, as the seam has always promised — the engine still never learns what a network is. Largest phase, and the one with real moderation and privacy surface: `blockReport` and `presence` are not features to port thoughtlessly.

Starts with `onlineAuth`, because `ports/remoteSave.ts` is finished and waiting on a uid. Binding its `SaveDocStore` to `firebase/firestore` is the first thing this phase can do and the last thing Phase 6 needed.

### Phase 13 — Retire `/legacy` *(~3 days)*
Only now. The old app comes off the web when the new one can reach a player's account and do everything they did — which is the condition Phase 5 named and could not meet. `src/` and the EAS native builds are a separate decision, taken then, on evidence.

**Parity total: roughly 19–21 weeks on top of Phases 0–5.** Estimated from the shipped implementation's size and the observed rate of Phases 1–4, so treat it as a shape rather than a schedule. The honest headline: **the fight was about a fifth of the game, and it took eleven weeks.**

### What this plan still does not cover
- **A native path for the rewrite.** Vite and Babylon build a web app; an APK means a WebView wrapper and a genuine question about WebGL on mid-range Android. Expo keeps shipping native throughout, so this is a choice rather than a blocker.
- **Boss mechanics beyond one shape.** Phase 4 shipped one mechanic tuned six ways and said so. Six genuinely distinct mechanics is a design decision, not a port.

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
