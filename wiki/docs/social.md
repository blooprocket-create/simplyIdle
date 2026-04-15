---
title: Social Systems
---

# Social Systems

<span class="status-badge live">Live</span>

Last reviewed: 2026-04-15

## Overview

SimplyIdle has a full social layer — friends, gifting, messaging, chat, guilds, player search, activity feeds, and moderation tools. All social features are individually feature-flagged and can be toggled by the team.

## Friends

### Adding Friends
- Search for players by username or find them on the leaderboard
- Send a friend request — the other player can accept or decline
- Mutual acceptance adds both players to each other's friend list

### Friend List
- View all friends with display name, level, and gift preference
- Real-time updates via live listeners
- Sorted alphabetically

### Gifting
Friends can send gifts based on the recipient's **gift preference** (gold, shards, or essence):

| Preference | Amount per Gift |
|------------|----------------|
| Gold | level × 1,000 |
| Shards | level × 10 |
| Essence | level × 5 |

- **Cooldown gated** — one gift per friend per cooldown period
- Gift amounts scale with the recipient's peak progress

## Direct Messages

Private 1-on-1 messaging between any two players:
- **Max length:** 500 characters
- **Message history:** Last 100 messages per conversation
- **Unread tracking:** Badge count updates in real-time
- **Block protection:** Blocked players cannot message you

### Inbox
- Shows all active conversations sorted by most recent
- Unread count per thread
- Quick-start from your friend list

## Global Chat

Real-time global chat visible to all signed-in players:
- **Rate limit:** 3 seconds between messages
- **Max length:** 500 characters
- **Reactions:** 👍 🔥 💪 🎉 (one per message per player)
- **Moderation:** Admin mute system with timed duration

## Player Search

Find any player by username prefix:
- Searches both registered public usernames and leaderboard accounts
- Results show level, VIP tier, and guild affiliation
- Click a result to view their full profile

## Player Profiles

Viewable for any player — shows:
- Level, VIP tier, prestige count, score
- Leaderboard rank, highest wave reached
- Guild name and rank
- Friend count and guild contribution
- Gift preference

### Profile Actions
- **Add Friend** — send a friend request
- **Invite to Guild** — if you're an officer or leader
- **Compare** — level, VIP, and wave deltas vs. you

## Activity Feed

Friends' achievements appear in your activity feed:
- Prestige completed
- Boss defeated
- Achievement unlocked
- Guild joined
- Wave milestones
- Leaderboard rank changes

## Online Presence

Heartbeat-based system showing who's online:
- Display name and level
- Last seen timestamp
- Updates visible to all signed-in players

## Block & Report

### Blocking
- Block any player to prevent them from messaging you
- Blocks are private — only you can see your block list
- Unblock at any time

### Reporting
Reports are submitted with a reason and details:
- **Reasons:** Harassment, Spam, Inappropriate Name, Cheating, Other
- **Details:** Up to 500 characters
- Reports are reviewed by admins

## Cloud Mail

Server-delivered mail for gifts, guild rewards, and system messages:
- Friends can send mail with resource attachments
- Guild members can receive guild reward mail
- Mail is per-player with read tracking
- **Claim All** button lets you collect all attachments from every mail at once

## Feature Flags

All social features can be independently toggled:

| Feature | Default |
|---------|---------|
| Guild Treasury | ✅ On |
| Guild Boss | ✅ On |
| Guild Events | ✅ On |
| Friend Gifting | ✅ On |
| Global Chat | ✅ On |
| Leaderboard | ✅ On |
| Direct Messages | ✅ On |
| Player Search | ✅ On |
| Activity Feed | ✅ On |
| Block & Report | ✅ On |
| Guild Wars | ✅ On |
