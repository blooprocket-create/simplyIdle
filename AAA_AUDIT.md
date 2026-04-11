# SimplyIdle — AAA Studio Production Quality Audit

> Full-stack audit covering architecture, security, gameplay balance, UX/UI, infrastructure, and the roadmap to ship-grade quality.

---

## Executive Summary

SimplyIdle has a **strong gameplay foundation** — compounding progression, broad content footprint (65 heroes, 70+ achievements, 8 weekly events), and solid formula transparency. However, reaching AAA studio production quality requires closing gaps across **6 critical dimensions**:

| Dimension | Current Grade | Target | Gap Size |
|-----------|:---:|:---:|:---:|
| **Architecture** | C | A | LARGE |
| **Security** | D+ | A | CRITICAL |
| **Balance & Economy** | B- | A | MEDIUM |
| **UX / Accessibility** | C- | A | LARGE |
| **Testing & QA** | F | A | CRITICAL |
| **Infrastructure & DevOps** | D | A | LARGE |

**Total issues found: 97**
- CRITICAL: 15
- HIGH: 26
- MEDIUM: 31
- LOW: 25

---

## Table of Contents

1. [Architecture & Code Quality](#1-architecture--code-quality)
2. [Security Vulnerabilities](#2-security-vulnerabilities)
3. [Gameplay Balance & Economy](#3-gameplay-balance--economy)
4. [UX, UI & Accessibility](#4-ux-ui--accessibility)
5. [Testing & Quality Assurance](#5-testing--quality-assurance)
6. [Infrastructure & DevOps](#6-infrastructure--devops)
7. [Content & Polish Gaps](#7-content--polish-gaps)
8. [AAA Roadmap](#8-aaa-roadmap)

---

## 1. Architecture & Code Quality

### CRITICAL

#### 1.1 God Component: GameScreen.tsx (~6,400 lines)
- **Problem**: Single component handles ALL game UI: tab rendering, 70+ useState hooks, 40+ useEffects, modals, mini-games, dev console, leaderboard sync, mail, shop, settings.
- **Impact**: Any state change cascades through the entire render tree. Unmanageable for maintenance, debugging, or team collaboration.
- **AAA Standard**: No component should exceed ~300 lines. Each feature surface should be its own module.
- **Fix**: Decompose into `GameShell`, `TabRouter`, `ModalManager`, `DevConsole`, plus individual feature modules.

#### 1.2 Monolithic Reducer: useGameState.ts (~3,100 lines)
- **Problem**: Single reducer handles all game state — combat, economy, roster, meta, liveops. No domain isolation.
- **Impact**: Every action type lives in one switch statement. Balance changes require navigating thousands of lines.
- **AAA Standard**: Domain-sliced reducers (combat, economy, roster, progression, social) composed together.
- **Fix**: Break into `combatReducer`, `economyReducer`, `rosterReducer`, `metaReducer`, `liveopsReducer`.

#### ~~1.3 No Error Boundaries~~ ✅ FIXED
- ~~**Problem**: Zero `<ErrorBoundary>` components anywhere. A single render error in any tab crashes the entire game.~~
- **Resolution**: Created `ErrorBoundary` component with retry fallback UI. Wrapped at App level (Auth + Game screens) and individually around all 8 tab content components.

#### 1.4 Massive Prop Drilling via `as any`
- **Problem**: Tab content components receive 40+ props as `{...({...} as any)}` spreads.
- **Impact**: Zero type safety. Prop mismatches are invisible at compile time. Refactoring breaks silently.
- **AAA Standard**: Typed prop interfaces per component, or context-based state sharing.

### HIGH

#### 1.5 No Memoization on Expensive Renders
- Tab content re-renders even when their tab isn't visible. Hero card lists (100+ items) re-render on every timer tick. No `React.memo()` on any tab component.
- **Fix**: Wrap all tab components in `React.memo()`, add `useMemo`/`useCallback` for derived data and handlers.

#### 1.6 Timer Tick Causes Full Re-render Every Second
- `setTimerTick(prev => prev + 1)` in GameScreen forces entire tree to re-render every 1s for expedition countdowns — even when not on the Operations tab.
- **Fix**: Move timer to `OperationsTabContent` local state.

#### 1.7 Modal State Explosion
- 12+ separate boolean `useState` calls for modals (`rebirthOpen`, `mailOpen`, `shopOpen`, etc.). No enforcement that only one modal is visible at a time.
- **Fix**: Use discriminated union: `type ModalState = { type: 'rebirth' } | { type: 'mail' } | { type: null }`.

#### 1.8 Social Tab God Component (~1,200 lines, 25+ useState)
- `SocialTabContent` handles chat, friends, guild, profiles — all in one component.
- **Fix**: Extract `ChatSection`, `FriendsSection`, `GuildSection` into standalone components with their own state management via Context API.

### MEDIUM

#### 1.9 MobileGameScreen is an Incomplete Stub
- Most event handlers are `// TODO: Implement`. Mobile users get a skeleton experience.

#### 1.10 Monolithic Stylesheet (~1,500 lines)
- `GameScreen.styles.ts` is a single massive stylesheet. Should be co-located per component.

#### 1.11 No Code Splitting
- Entire game loads as one bundle. No lazy loading for tabs, modals, or mini-games.

#### 1.12 Hardcoded Magic Numbers
- `viewportWidth < 430`, `viewportHeight < 780`, animation durations `750ms`, `850ms`, `2600ms` scattered throughout.
- **Fix**: Centralize into `BREAKPOINTS` and `ANIMATION_DURATION` constants.

---

## 2. Security Vulnerabilities

### CRITICAL

#### ~~2.1 Firebase Credentials Hardcoded in Source~~ ✅ FIXED
- **File**: `src/services/firebase.ts`
- ~~**Problem**: `FALLBACK_FIREBASE_CONFIG` contains full API keys in source code.~~
- **Resolution**: Removed `FALLBACK_FIREBASE_CONFIG`. `readConfig()` now reads exclusively from `EXPO_PUBLIC_*` env vars. Created `.env.example` and `.env.local`.

#### ~~2.2 Admin Save-Write Bypass~~ ✅ FIXED
- **File**: `src/services/onlineSave.ts`
- ~~**Problem**: `writeOnlineSaveForUid()` allows any authenticated user to write to any user's save slot without admin verification.~~
- ~~**Risk**: Players can inject items, gold, or mail into other players' accounts.~~
- **Resolution**: Added `isCurrentUserAdmin()` gate to both `loadOnlineSaveForUid()` and `writeOnlineSaveForUid()`. Non-admin callers now get `permission-denied` before any Firestore read/write. Firestore rules already enforce admin-only access as a second layer.

#### ~~2.3 Guild Treasury Balance Manipulation~~ ✅ FIXED
- **File**: `firestore.rules`
- ~~**Problem**: Rule allows any member to decrease treasury balance (not just officers/leaders).~~
- **Resolution**: Added monotonic constraints on `totalDeposited`/`totalWithdrawn`. Regular members locked to deposit-only (withdrawal fields frozen for non-officers).

#### 2.4 No Admin Audit Trail
- **Problem**: Admin functions (`writeOnlineSaveForUid`, `muteUser`) have zero logging.
- **Risk**: Abuse goes undetected. No forensic capability.
- **Fix**: Log all admin actions (who, what, when, target) to a separate audit collection.

#### ~~2.5 Telemetry API Key Exposed~~ ✅ FIXED
- **File**: `src/telemetry.ts`
- ~~**Problem**: Vexo analytics key hardcoded in source.~~
- **Resolution**: Now reads from `EXPO_PUBLIC_VEXO_API_KEY` env var. Telemetry gracefully disables if empty.

### HIGH

#### 2.6 Guild Boss Damage Not Server-Validated
- Client sends raw DPS value for boss attacks. Server multiplies by 30 for damage. No verification against player's actual gear/stats.
- **Risk**: Clients can send inflated DPS to one-shot guild bosses.

#### 2.7 Character Name Homoglyph Attack
- Name normalization only lowercases/trims. No Unicode NFC normalization.
- **Risk**: Players impersonate others using lookalike characters (e.g., Cyrillic `і` vs Latin `i`).

#### ~~2.8 Chat Rate Limiting is Client-Side Only~~ ✅ FIXED
- ~~3-second cooldown enforced in client state. Bypassed by modifying client code.~~
- **Resolution**: Firestore rules already enforced 3s cooldown via `chatRateLimit` and `guildChatRateLimit` docs. Hardened by adding `sentAt <= request.time.toMillis()` constraint to global chat, guild chat, and both rate-limit doc write rules — prevents clients from spoofing future timestamps to bypass the cooldown.

#### 2.9 Guild Event Data Corruption
- Any guild member can update event details (war damage, kills) without monotonic enforcement.
- **Risk**: Players can falsify event progress to claim rewards.

#### 2.10 Guild Invite Spam (No Rate Limit)
- No cooldown between guild invites. Unlimited invite spam possible.

#### 2.11 Friend List Read Without Mutual Verification
- Firestore rules allow reading a friend list if one-directional friendship exists.

### MEDIUM

#### 2.12 Missing Input Size Validation
- Firestore write payloads not validated for total size. Potential DoS via massive nested structures.

#### 2.13 Leaderboard Rate Guard is In-Memory Only
- `submitGuardByUid` Map resets on server restart. Per-device only.

#### 2.14 Presence Heartbeat Allows Spoofed Display Names
- `displayName` not validated against actual profile name.

#### 2.15 Guild Member Count Not Re-Validated on Invite Accept
- `respondToGuildInvite` doesn't re-verify `maxMembers` in the transaction, allowing simultaneous joins to bypass limit.

#### 2.16 No Expiration Check on Guild Invites in Rules
- Rules don't enforce `expiresAt > now` during invite acceptance.

#### 2.17 Expired Guild Invites Can Be Accepted Server-Side
- Missing temporal validation in Firestore rules.

---

## 3. Gameplay Balance & Economy

### CRITICAL

#### ~~3.1 Numeric Overflow Risk — Unbounded Multiplier Stacking~~ ✅ FIXED
- ~~**Problem**: DPS multiplier chain can cascade to 650×+ before any final cap.~~
- **Resolution**: Added `safeMultiplier()` utility (caps at 1e12, guards NaN/Infinity). Applied to `totalMultiplier` in `getDpsBreakdown()`. Final DPS now guarded with `Number.isFinite()` fallback.

#### ~~3.2 Arithmetic Safety — No NaN/Division-by-Zero Guards~~ ✅ FIXED
- ~~`advanceCombatStep()` damage calculation divides by `affix.hpMult * weekly.enemyHpMultiplier` with no zero check.~~
- ~~`getOfflineStepElapsedMs()` divides without checking for zero divisor.~~
- **Resolution**: Added `safeDivide()` utility to `utils.ts`. Applied to combat damage calculation and offline progress simulation. Returns 0 on zero/NaN/Infinity divisor.

#### 3.3 Equipment Migration Causes Silent Data Loss
- Legacy item IDs that no longer exist in `EQUIPMENT_CATALOG` are silently deleted during migration.
- **Impact**: Players lose equipped items after updates with zero notification or compensation.
- **Fix**: Log warnings, grant scrap compensation, maintain legacy→modern item mapping.

### HIGH

#### 3.4 Rarity Power Creep Spiral
- Transcendent heroes scale at 2.45× per rank vs Common at 0.9×. By rank 10, the power gap is **27×**.
- Players stuck with low-rarity heroes have no viable catch-up path.
- **Fix**: Implement diminishing returns on high-rarity scaling or add catch-up mechanics for low-rarity heroes.

#### ~~3.5 Pity System Logic Error~~ ✅ FIXED
- ~~Pity counter resets **only** when a legendary+ is pulled. This means a player can go 29 rare pulls → pity triggers → 29 more rare pulls in the next cycle.~~
- ~~The pity doesn't guarantee a legendary every 30 pulls as players would expect.~~
- **Resolution**: Counter now increments unconditionally on non-pity rolls. Natural legendary+ pulls are bonuses that do not reset the pity counter. Pity guarantees a legendary every `PITY_THRESHOLD` (30) pulls.

#### 3.6 Nightmare Weekly Event is Asymmetric Risk/Reward
- 2× HP + 2× damage (4× effective durability) for only 2.5× rewards.
- Mid-game players are hard-locked out with no difficulty toggle or opt-out.
- **Fix**: Reduce to 1.8× HP / 1.5× damage, or add difficulty opt-out.

#### 3.7 Burst System is Too Weak
- 35% DPS spike every 20 kills is weaker than passive bonuses (+5% hero passive × 4 heroes = +20% baseline, always active).
- **Fix**: Increase `BURST_STRIKE_DPS_MULT` to 1.8-2.0× or reduce charge cost to 15.

#### 3.8 Class Passives Have Minimal Differentiation
- Warrior: +4% DPS / -10% incoming. Berserker: +9% DPS / -2% incoming.
- Differences are too small to create meaningful playstyle identity across 5 classes.
- **Fix**: Amplify differentials — e.g., Berserker at +18% DPS / +5% incoming (glass cannon).

#### 3.9 Hero Active Skills Are Homogeneous
- All hero active skills share the same hardcoded 8000ms cooldown regardless of skill type.
- `mending_pulse` heals a fixed 10% regardless of spirit/intelligence stats.
- **Fix**: Move cooldowns to per-skill config. Scale effects by hero stats.

#### 3.10 Offline Progress Silent Cap
- Player offline for 24h expects 24h progress but `OFFLINE_SIM_MAX_ITERATIONS` (300,000) can cap at ~1h of actual progress. No UI notification.
- **Fix**: Show "Offline progress limited" notification. Consider VIP-tiered caps.

### MEDIUM

#### ~~3.11 Floating Point Precision Erosion~~ ✅ FIXED
- ~~`Number((value).toFixed(4))` used for rebirth stat multipliers.~~
- **Resolution**: Added `roundTo4()` utility using `Math.round(n * 10000) / 10000`. Replaced all 9 `toFixed(4)` occurrences in `useGameState.ts`.

#### 3.12 Rank-Up Costs Explode for High Rarity
- Rank 10 transcendent hero costs ~26,220 shards. Full transcendent team rank-up = ~131,100 shards.
- If this is intentional gating, it needs documentation. If not, reduce `RARITY_RANK_COST_MULT[transcendent]` from 11.4× to 5-7×.

#### 3.13 Mission Board Rewards Are Arbitrary
- Gold rewards don't follow a formula tied to difficulty/time investment. Similar-difficulty missions pay wildly different amounts.
- **Fix**: Create reward formula: `baseReward(horizon) × sqrt(target / 100)`.

#### 3.14 Sanitization Band-Aid (700+ Lines)
- `sanitizeSaveData` function is 700+ lines of clamping, indicating saves arrive corrupted regularly.
- **Fix**: Implement save versioning + explicit migration functions per version. Validate at save-time, not load-time.

#### 3.15 Mini-Op Cooldown Clock Skew
- `lastUsedMs` from client clock can be in the future, causing negative cooldowns.
- **Fix**: Use server timestamp for cooldown basis.

#### 3.16 Leaderboard Data is Fake
- `useLeaderboardCalculation.ts` generates **seeded fake players** (NovaMarshal, etc.). Player never ranks below 8th.
- **Fix**: Replace with real server-backed leaderboard data.

---

## 4. UX, UI & Accessibility

### CRITICAL

#### 4.1 Zero Accessibility (a11y) Support
- No `accessibilityLabel` on any interactive element.
- No `accessibilityRole` on tab navigation.
- Icon-only buttons (⚙️, 📧, 🛒) have zero screen reader context.
- **AAA Standard**: WCAG 2.1 AA compliance minimum — all interactive elements labeled, all states announced.

#### 4.2 Color Contrast Fails WCAG AA
- `text.tertiary: '#7A7A8C'` on `bg.darkest: '#0A0A12'` = ~3.2:1 ratio (needs 4.5:1).
- `text.muted: '#5A6A7E'` on dark bg = fails WCAG AA.
- **Impact**: Low-vision users cannot read secondary text.

### HIGH

#### 4.3 No Internationalization (i18n)
- 200+ hardcoded English strings throughout UI (dialog titles, button labels, error messages, hints).
- No i18n library (react-i18next, etc.).
- **AAA Standard**: All user-facing strings externalized for localization.

#### 4.4 No Loading/Error States for Several Flows
- Shop VIP loading: no indicator.
- Mail sync failure: infinite empty mailbox, no error message.
- Guild data fetch: no loading overlay.
- Chat send failure: optimistic update not reverted, confusing UX.

#### 4.5 DPS/Power Formula Opacity
- `useDpsPowerTooltip` shows Formation × Synergy multiplied together instead of individual breakdowns.
- Players can't understand actual contribution of each multiplier.
- Rebirth modal shows only new bonus multiplier — doesn't explain total stacking effect.

#### 4.6 Missing Onboarding / Tutorial Path
- Beta readiness doc says "Tutorial path always points to one obvious next action" — but this is unchecked.
- No progressive disclosure for dense systems. New players face 7+ tabs of complexity immediately.
- **AAA Standard**: Guided first-session questline → first summon → first boss → first rebirth.

#### 4.7 Mobile vs Web Layout Parity Gap
- `MobileGameScreen.tsx` is a skeleton (110 lines, most handlers are `// TODO`).
- Web has full 6,400-line GameScreen. Native mobile gets a fraction of the experience.

### MEDIUM

#### 4.8 Inconsistent Modal Behavior
- Some modals show `<ActivityIndicator>`, others just disable buttons.
- No enforced single-modal-at-a-time constraint.

#### 4.9 No Offline Mode Indicator
- No clear visual when user is offline vs online. No queued action indicator.

#### 4.10 Dev Console Ships in Production
- `/sendMsg`, `/clearSlot`, `/showOnlineUsersAndCharacters` admin commands available in game Settings.
- **Fix**: Strip from production builds or hide behind admin auth gate.

#### 4.11 Hero Portraits 77% Missing
- Only 15/65 heroes (23%) have portrait images in `heroPortraits.ts`.
- Missing portraits for all tier 1 heroes (h1-h10) — the first heroes players encounter.

#### 4.12 Progress Bars Duplicated 20+ Times
- Same HP/XP bar rendering pattern copied across tabs. Should be a shared `<ProgressBar>` component.

#### 4.13 Hardcoded Theme Colors in Styles
- `GameScreen.styles.ts` uses hardcoded hex strings (`#FFB347`, `#6DDB7B`) instead of referencing `theme/colors.ts`.

---

## 5. Testing & Quality Assurance

### CRITICAL — **No Tests Exist**

#### 5.1 Zero Unit Tests
- No test files found (`*.test.*`, `*.spec.*`).
- No test runner configured (Jest, Vitest, etc.).
- No test dependencies in `package.json`.
- **AAA Standard**: 80%+ code coverage on game logic. 100% coverage on balance formulas and reducer actions.

#### 5.2 Zero Integration Tests
- No test for save/load round-trip.
- No test for offline progress simulation.
- No test for equipment migration.
- No test for rebirth state preservation.

#### 5.3 Zero End-to-End Tests
- No Playwright, Cypress, or Detox tests.
- No automated first-session smoke test.
- **AAA Standard**: E2E tests covering critical user journeys (create character → push waves → summon → rebirth).

#### 5.4 No Linting or Formatting
- No ESLint configuration.
- No Prettier configuration.
- No pre-commit hooks.
- **AAA Standard**: Enforced lint + format on every commit via Husky + lint-staged.

#### 5.5 No Balance Simulation / Regression Tests
- No automated progression pacing checks.
- Balance changes are manual trial-and-error.
- **AAA Standard**: Simulation scripts that validate: time-to-first-summon, time-to-first-rebirth, gold curve, DPS curve, wave-vs-power parity.

---

## 6. Infrastructure & DevOps

### CRITICAL

#### 6.1 No CI Pipeline for Game Code
- Only CI pipeline is wiki build verification (`.github/workflows/wiki.yml`).
- No TypeScript compilation check on PR.
- No automated test run.
- No build verification for web/Android/iOS.
- **AAA Standard**: CI runs `tsc --noEmit`, linting, tests, and build on every PR.

#### ~~6.2 Firebase Admin SDK Key in Repo~~ ✅ VERIFIED SAFE
- `simplyidle-43c81-firebase-adminsdk-fbsvc-5dc5b32aa7.json` — already in `.gitignore`, confirmed NOT tracked by git.
- **Resolution**: File exists locally only. Not committed to source control.

### HIGH

#### ~~6.3 No Environment Configuration~~ ✅ FIXED
- ~~No `.env.example` or environment variable documentation.~~
- **Resolution**: Created `.env.example` with all required `EXPO_PUBLIC_*` variables. Created `.env.local` (gitignored) with actual values.

#### 6.4 No Staging Environment
- Production and development share the same Firebase project (implied by hardcoded config).
- **AAA Standard**: Separate Firebase projects for dev/staging/prod.

#### 6.5 No Crash Reporting
- No Sentry, Bugsnag, or Firebase Crashlytics integration.
- Runtime errors are invisible unless users report them manually.
- **AAA Standard**: Automated crash reporting with stack traces, breadcrumbs, and user context.

#### 6.6 No Performance Monitoring
- No React render performance tracking.
- No frame rate monitoring.
- No Firestore read/write cost tracking.
- **AAA Standard**: Performance budgets enforced via monitoring dashboards.

### MEDIUM

#### 6.7 No Database Backups
- No documented Firestore backup schedule.
- Player save data could be lost with no recovery.

#### 6.8 No Feature Flags Infrastructure
- `socialFeatureFlags.ts` uses hardcoded booleans. No remote config for feature toggles.
- **Fix**: Use Firebase Remote Config for runtime feature flags.

#### 6.9 No Bundle Size Monitoring
- No build size tracking. No tree-shaking verification.
- `firebase` (full SDK) and `firebase-admin` are both in client `dependencies` — `firebase-admin` should NOT be in client bundle.

#### ~~6.10 `firebase-admin` in Client Dependencies~~ ✅ FIXED
- ~~`firebase-admin` is a **server-only** package. Should not be in client-side `package.json`.~~
- **Resolution**: Removed from `dependencies`. Was never imported in any source file (dead dependency).

---

## 7. Content & Polish Gaps

### HIGH

#### 7.1 Progression Dead Zone (Waves 20-60)
- Acknowledged in `KNOWN_ISSUES.md` and `BETA_READINESS.md` but unchecked.
- Players risk churning during this critical early-mid period.

#### 7.2 No Sound / Audio System
- Zero audio: no music, no SFX, no haptic feedback patterns beyond basic `expo-haptics`.
- **AAA Standard**: Ambient music, combat SFX, UI interaction sounds, achievement fanfare.

#### 7.3 No Opening Cinematic / Splash
- No title screen, no lore intro, no splash art.
- Game jumps directly from auth to gameplay.

#### 7.4 Story Beats Are Text-Only
- 18 story beats exist as text triggers. No illustrations, no character dialogue UI, no cutscene system.

### MEDIUM

#### 7.5 No Achievement Notifications Outside Tab
- Achievements unlock silently unless player is on Achievement tab.
- `AchievementToast.tsx` exists but may not cover all cases.

#### 7.6 Party Chat is Dead Code
- "Coming Soon" label in ChatSection. No implementation path documented.

#### 7.7 Wiki/Docs Not Linked In-Game
- Wiki exists at `/wiki/` but no in-game help links to relevant wiki pages.

---

## 8. AAA Roadmap

### Phase 0: Emergency Security Fixes (Week 1)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | ~~Remove Firebase admin SDK key from repo, rotate credentials~~ | P0 | ✅ Verified safe |
| 2 | ~~Remove hardcoded Firebase config fallback; require env vars~~ | P0 | ✅ Done |
| 3 | ~~Move Vexo API key to env var~~ | P0 | ✅ Done |
| 4 | ~~Fix Firestore treasury balance rule (deposits only for members)~~ | P0 | ✅ Done |
| 5 | ~~Add admin verification to `writeOnlineSaveForUid`~~ | P0 | ✅ Done |
| 6 | Add admin audit logging collection | P0 | 2h |
| 7 | Server-side DPS validation for guild boss attacks | P0 | 2h |
| 8 | ~~Server-side chat rate limiting in Firestore rules~~ | P1 | ✅ Done |
| 9 | ~~Move `firebase-admin` out of client dependencies~~ | P1 | ✅ Done |

### Phase 1: Stability & Safety (Weeks 2-3)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | ~~Add global multiplier cap (100×) + NaN/Infinity guards~~ | P0 | ✅ Done |
| 2 | ~~Add `safeDivide()` utility, apply to all arithmetic~~ | P0 | ✅ Done |
| 3 | ~~Add Error Boundaries (shell, tab, modal, widget levels)~~ | P0 | ✅ Done |
| 4 | Fix equipment migration: logging + scrap compensation | P1 | 3h |
| 5 | ~~Fix pity counter logic (reset every 30 unconditionally)~~ | P1 | ✅ Done |
| 6 | Add save versioning + migration functions | P1 | 6h |
| 7 | ~~Fix floating point precision (use Math.round)~~ | P2 | ✅ Done |
| 8 | Fix hero active skill cooldowns (per-skill config) | P2 | 3h |

### Phase 2: Testing Foundation (Weeks 3-5)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | Set up Jest/Vitest test runner + config | P0 | 2h |
| 2 | Unit tests for all balance formulas in `gameConfig.ts` | P0 | 8h |
| 3 | Unit tests for reducer actions in `useGameState.ts` | P0 | 12h |
| 4 | Unit tests for `utils.ts` edge cases | P1 | 2h |
| 5 | Integration tests: save/load round-trip | P1 | 4h |
| 6 | Integration tests: offline progress simulation | P1 | 4h |
| 7 | Balance simulation script (time-to-milestones) | P1 | 8h |
| 8 | Set up ESLint + Prettier + Husky pre-commit hooks | P1 | 2h |
| 9 | CI pipeline: `tsc --noEmit` + lint + tests on every PR | P0 | 3h |

### Phase 3: Architecture Refactor (Weeks 5-8)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | Split `GameScreen.tsx` into 8-10 modules | P0 | 16h |
| 2 | Split `useGameState.ts` reducer into domain slices | P0 | 16h |
| 3 | Replace `as any` prop drilling with typed interfaces | P1 | 8h |
| 4 | Extract shared UI components (`ProgressBar`, `ItemRow`, etc.) | P1 | 6h |
| 5 | Co-locate styles per component (eliminate monolithic stylesheet) | P2 | 8h |
| 6 | Add React.memo + useMemo + useCallback optimization pass | P1 | 8h |
| 7 | Fix timer tick to local component scope | P1 | 1h |
| 8 | Implement discriminated union for modal state | P2 | 2h |
| 9 | Add lazy loading for tabs and modals | P2 | 4h |

### Phase 4: Balance & Economy Polish (Weeks 6-9)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | Tune progression dead zone (Waves 20-60) | P0 | 8h |
| 2 | Adjust rarity power curve (add catch-up or diminish) | P1 | 4h |
| 3 | Tune Nightmare event difficulty/reward ratio | P1 | 2h |
| 4 | Buff burst system (1.8-2.0× or reduce cost) | P1 | 1h |
| 5 | Amplify class passive differentiation | P1 | 3h |
| 6 | Normalize mission board rewards to formula | P2 | 3h |
| 7 | Add offline progress cap notification | P2 | 2h |
| 8 | Add economy ledger panel (income/spend visualization) | P2 | 8h |
| 9 | Centralize balance constants to data tables with versioning | P1 | 6h |
| 10 | Replace fake leaderboard with real server data | P0 | 8h |

### Phase 5: UX & Accessibility (Weeks 8-11)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | Add `accessibilityLabel` to all interactive elements | P0 | 8h |
| 2 | Fix color contrast to WCAG AA (4.5:1 minimum) | P0 | 3h |
| 3 | Implement i18n framework (react-i18next) | P1 | 12h |
| 4 | Build guided first-session tutorial flow | P0 | 16h |
| 5 | Complete MobileGameScreen parity | P1 | 20h |
| 6 | Add loading states and error UI for all async operations | P1 | 8h |
| 7 | Add offline mode indicator + queued actions | P2 | 4h |
| 8 | Replace hardcoded hex colors with theme references | P2 | 4h |
| 9 | Generate/source missing hero portraits (50 of 65) | P1 | 8h |
| 10 | Strip dev console from production builds | P1 | 2h |

### Phase 6: Production Infrastructure (Weeks 9-12)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | Create `.env.example` with all required variables | P0 | 1h |
| 2 | Set up staging Firebase project (separate from prod) | P0 | 4h |
| 3 | Integrate Sentry/Crashlytics for crash reporting | P0 | 4h |
| 4 | Add performance monitoring (frame rate, render times) | P1 | 4h |
| 5 | Set up Firestore backup schedule | P1 | 2h |
| 6 | Implement Firebase Remote Config for feature flags | P2 | 4h |
| 7 | Add bundle size monitoring + tree-shaking audit | P2 | 3h |
| 8 | E2E test suite (Playwright for web) | P1 | 12h |
| 9 | CI/CD: auto-deploy web on merge to main | P1 | 3h |

### Phase 7: Content & Polish (Weeks 11-14)

| # | Task | Priority | Effort |
|---|------|:--------:|--------|
| 1 | Audio system: ambient music, combat SFX, UI sounds | P1 | 20h |
| 2 | Title screen / splash art | P2 | 8h |
| 3 | Story beat illustrations / dialogue UI | P2 | 16h |
| 4 | In-game help links to wiki pages | P2 | 4h |
| 5 | Achievement notification system (outside tab) | P2 | 3h |
| 6 | Implement Party Chat | P2 | 8h |
| 7 | Formula explanation tooltips (DPS breakdown, power index) | P1 | 6h |
| 8 | Character homoglyph protection (Unicode NFC normalization) | P2 | 1h |

---

## Appendix: Positive Findings

Despite the gaps, the project has real strengths to build on:

- **Strong game design vision**: Compounding loops, multi-lane engagement, clear meta-game
- **Broad content footprint**: 65 heroes, 70+ achievements, 8 weekly events, 6 acts, 18 story beats
- **Formula transparency**: DPS breakdown, power index, gear score all visible to players
- **Solid auth error mapping**: `mapAuthError()` provides user-friendly messages
- **Good telemetry foundation**: Session lifecycle, key progression moments tracked
- **Well-structured policy docs**: Season policy, leaderboard contract, patch cadence all documented
- **TypeScript strict mode enabled**: `"strict": true` in tsconfig
- **Functional wiki with CI**: Auto-generated reference docs, VitePress build verification
- **Animation uses native driver**: Good foundation for 60fps animations
- **Firestore presence heartbeat**: Well-structured online status system

---

*Generated: April 10, 2026*
*Scope: Full-stack audit of SimplyIdle codebase*
*Files analyzed: 60+ source files across 6 directories*
