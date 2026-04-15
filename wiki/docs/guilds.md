---
title: Guilds
---

# Guilds

<span class="status-badge live">Live</span>

Last reviewed: 2026-04-15

## Overview

Guilds are persistent player groups with shared progression, treasury, boss raids, events, and competitive wars. Guild features are role-gated with leader, officer, and member permissions.

## Creating a Guild

Any player not currently in a guild can create one. Required fields:
- **Name** — unique, normalized for lookup
- **Tag** — short identifier displayed beside your name
- **Public/Private** — public guilds appear in search; private require invites

## Roles & Permissions

| Role | Invite | Kick | Treasury Withdraw | Start War | Edit Settings |
|------|--------|------|-------------------|-----------|---------------|
| Leader | ✅ | ✅ | ✅ | ✅ | ✅ |
| Officer | ✅ | ❌ | ✅ (capped) | ❌ | ❌ |
| Member | ❌ | ❌ | Deposit only | ❌ | ❌ |

- **Max members:** 30 per guild
- **Leader transfer** and **guild disband** are leader-only actions

## Guild Treasury

A shared gold pool that members contribute to and officers/leaders can withdraw from.

### Rules
- **Any member** can deposit gold (increases balance)
- **Officers and leaders** can withdraw, capped at **25,000,000 gold per day**
- All transactions are logged in the treasury ledger with actor name and timestamp

## Guild Boss Raids

Cooperative boss encounters where guild members contribute damage.

- Boss state is tracked per guild with damage and HP persistence
- All members can attack and contribute damage
- Boss data updates are timestamped and attributed to the acting member

## Guild Events

Time-limited contribution events run by the guild leader:

- **Creation:** Leader sets event type, start time, and end time
- **Contribution:** Members contribute to event goals (tracked per-member)
- **Status:** Active events show progress; completed events are archived

### Contribution Rules
- Contributions are additive (can only increase, never decrease)
- Each contribution is timestamped
- Leader can create or delete events

## Guild Chat

Real-time messaging within the guild:
- **Rate limited:** 3 seconds between messages
- **Max length:** 300 characters
- Messages are attributed to the sender's display name
- Leaders can moderate (delete messages)

## Guild Invites

Officers and leaders can invite players to join:
- **Rate limited:** 10 seconds between invites
- **Expiry:** Invites expire after a set TTL
- **Duplicate protection:** Can't re-invite a player with a pending invite
- Invited players see incoming invites and can accept, decline, or let them expire

### Joining Requirements
Guilds can set minimum requirements:
- **Minimum level** to join
- **Minimum peak progress** (highest wave reached)
- Public guilds can be joined directly if requirements are met

## Guild Wars

Competitive PvP between guilds. See the war flow below.

### Declaring War
1. **Leader only** — Only guild leaders can send war challenges
2. **Target selection** — Browse matchable guilds (sorted by level)
3. **Challenge sent** — Pending for 24 hours
4. **Defender responds** — Accept or decline

### Active War
- Duration: **48 hours** from acceptance
- Each guild races to deal damage to a shared target
- **Target HP** scales with the higher guild's level: `level × 500,000,000,000`
- **Contribution cooldown:** 5 minutes between contributions per player

### War Damage
Each contribution deals damage based on the player's DPS:
- DPS is capped at the lower of `1,000,000,000` or `10× leaderboard score`
- Damage per contribution: `safeDPS × 30`

### Victory
- First guild to reach their target wins
- If both reach simultaneously, higher total damage wins
- Completed wars are stored in history (up to 20 most recent)

### War History
Each guild's last 20 wars are visible with:
- Opponent name and tag
- Win/loss/draw result
- Damage totals
- Completion timestamp
