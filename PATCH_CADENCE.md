# Patch Cadence Plan

## Beta Phase 1 (Closed)
- Patch window: Tuesday + Friday
- Hotfix SLA for blockers: within 24 hours
- Scope: crash fixes, progression blockers, save/load issues

## Beta Phase 2 (Expanded)
- Patch window: Wednesday + Saturday
- Hotfix SLA for blockers: within 24 hours
- Scope: stability, pacing, economy, leaderboard iteration

## Release Governance
- Every patch has:
  - build version
  - concise changelog
  - rollback note
- Every patch review checks:
  - type safety (`npx tsc --noEmit`)
  - startup sanity on web
  - save/load smoke test
