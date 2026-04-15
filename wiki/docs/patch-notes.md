---
title: Patch Notes
---

# Patch Notes

<span class="status-badge live">Live</span>

Last reviewed: 2026-04-15

## Patch Schedule

| Phase | Patch Days | Hotfix SLA |
|-------|-----------|------------|
| Beta Phase 1 (Closed) | Tuesday + Friday | 24 hours |
| Beta Phase 2 (Expanded) | Wednesday + Saturday | 24 hours |

## Every Patch Includes
- Build version number
- Concise changelog
- Rollback notes
- Type safety check (`tsc --noEmit`)
- Web startup sanity test
- Save/load smoke test

---

## v0.9.4 — 2026-04-15

### Social & Permissions
- Fixed DMs not sending between non-friends
- Fixed Player Search only returning friends — now searches leaderboard accounts too
- Fixed "Player not found" when adding friend from profile — now uses UID-based requests
- Fixed "Missing or insufficient permissions" on guild invites — officers/leaders can now check for duplicate invites
- Fixed Guild Wars failing to load — added required composite Firestore indexes

### Infrastructure
- Deployed updated Firestore security rules
- Deployed 4 composite indexes for guild war queries
- Created `firestore.indexes.json` for index management

### Wiki
- Full wiki v2 overhaul — new theme, navigation, and content pages
- Added back-to-game navigation button
- Dark mode support

---

## v0.9.3 — 2026-04-03

### Social Tab
- 24 social tab issues fixed (prior sprint)
- Guild chat, friend gifting, and presence system stabilized
- Activity feed and player search launched

---

*Older patch notes will be added as they are compiled from the project history.*
