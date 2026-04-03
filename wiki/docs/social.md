---
title: Social Systems
---

# Social Systems

## Scope

- Friends and gifting
- Guild membership and roles
- Global and guild chat
- Presence and online status
- Cloud mail delivery

## Core Rules Snapshot

- Friend gifts use cooldown gating.
- Chat is rate-limited and moderation-aware.
- Guild actions are role-sensitive.
- Presence is heartbeat-based.

## Live Service Safety Notes

- Some systems are feature-flagged or operationally partial.
- Any page that references not-fully-live behavior should be marked Planned.

## Implementation Sources

- src/services/friends.ts
- src/services/guild.ts
- src/services/chat.ts
- src/services/presence.ts
- src/services/cloudMail.ts
- firestore.rules

Status: Live with partial areas
