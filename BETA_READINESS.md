# SimplyIdle Public Beta Readiness

## Release Goal
Ship a stable, fun public beta with clear progression, measurable retention, and low crash risk.

## Current Scope Added
- Multiplayer-style `Beta Leaderboard` panel in Events.
- Persistent `highestWaveReached` stat tracked in save data.
- `Highest Level` surfaced in core UI chips and events progression info.

## 0. Must-Pass Quality Gates
- [ ] TypeScript compile clean (`npx tsc --noEmit`).
- [ ] No startup runtime errors on web.
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
- [ ] Non-battle tabs avoid battle-only visual clutter.
- [ ] Mobile and desktop layouts verified.

## 3. Multiplayer/Leaderboard Readiness
- [ ] Keep current local beta leaderboard as fallback.
- [ ] Define backend leaderboard API contract.
- [ ] Add anti-cheat validations server-side (score bounds, rate limits).
- [ ] Add season reset policy and reward rules.

## 4. Telemetry (Needed Before Public Beta)
- [ ] Track `session_start` / `session_end`.
- [ ] Track `summon_used`, `wave_reached`, `rebirth_done`.
- [ ] Track `leaderboard_viewed` and `leaderboard_rank`.
- [ ] Track `ftue_step_completed` and completion rate.

## 5. Support and Community
- [ ] In-game feedback link (Discord or form).
- [ ] Public known-issues list.
- [ ] Lightweight patch cadence plan (e.g., twice weekly).

## 6. Beta Launch Stages
- [ ] Closed beta (20-50 testers): stability and pacing.
- [ ] Expanded beta (200-500 testers): retention and economy tuning.
- [ ] Public beta: marketing push + active patch loop.

## Suggested Next Implementation Sprint
1. Replace local leaderboard with real backend leaderboard (Firebase/Supabase).
2. Add telemetry events and a simple analytics dashboard.
3. Add an in-game feedback/report button.
4. Perform a focused first-session tuning pass.
