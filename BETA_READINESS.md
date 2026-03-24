# SimplyIdle Public Beta Readiness

## Release Goal
Ship a stable, fun public beta with clear progression, measurable retention, and low crash risk.

## Current Scope Added
- Multiplayer-style `Beta Leaderboard` panel in Events.
- Persistent `highestWaveReached` stat tracked in save data.
- `Highest Wave` surfaced in core UI chips and events progression info.
- Lightweight telemetry events wired for beta analytics.
- In-game feedback link added in Settings.

## 0. Must-Pass Quality Gates
- [x] TypeScript compile clean (`npx tsc --noEmit`).
- [x] No startup runtime errors on web.
- [ ] No blocking issues in first 10 minutes of gameplay.
- [ ] Save/load verified across app restart.

## 1. Gameplay and Balance
- [ ] Time to first summon under 2 minutes.
- [ ] Time to first rebirth under 30 minutes.
- [ ] No progression dead zone between waves 20-60.
- [ ] Economy check: gold/shards/essence pace feels rewarding.

## 2. UX and Onboarding
- [ ] Tutorial path always points to one obvious next action.
- [ ] All modals have consistent spacing and close behavior.
- [x] Non-battle tabs avoid battle-only visual clutter.
- [ ] Mobile and desktop layouts verified.

## 3. Multiplayer/Leaderboard Readiness
- [x] Keep current local beta leaderboard as fallback.
- [x] Define backend leaderboard API contract.
- [x] Add anti-cheat validations server-side (score bounds, rate limits).
- [x] Add season reset policy and reward rules.

## 4. Telemetry (Needed Before Public Beta)
- [x] Track `session_start` / `session_end`.
- [x] Track `summon_used`, `wave_reached`, `rebirth_done`.
- [x] Track `leaderboard_viewed` and `leaderboard_rank`.
- [x] Track `ftue_step_completed` and completion rate.

## 5. Support and Community
- [x] In-game feedback link (Discord or form).
- [x] Public known-issues list.
- [x] Lightweight patch cadence plan (e.g., twice weekly).

## 6. Beta Launch Stages
- [ ] Closed beta (20-50 testers): stability and pacing.
- [ ] Expanded beta (200-500 testers): retention and economy tuning.
- [ ] Public beta: marketing push + active patch loop.

## Suggested Next Implementation Sprint
1. Replace local leaderboard with real backend leaderboard (Firebase/Supabase).
2. Add a simple analytics dashboard over collected telemetry events.
3. Connect feedback form responses to a triage board.
4. Perform a focused first-session tuning pass.
