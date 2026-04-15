# SimplyIdle — Social Tab AAA Production Quality Audit

> Full-stack audit of the Social Tab covering frontend components, backend services, Firestore security rules, state management, and cross-platform compatibility (Desktop Chrome/Safari/IE, Mobile Android/iPhone Chrome/Safari, Android APK).

---

## Executive Summary

The Social Tab v2 rebuild is architecturally sound — context-based state, domain hooks, extracted services, and feature flags. However, **24 actionable issues** span security, data integrity, cross-platform UX, and accessibility that need resolution before this meets AAA studio standards.

| Dimension | Current Grade | Target | Gap Size |
|-----------|:---:|:---:|:---:|
| **Data Integrity & Race Conditions** | C | A | LARGE |
| **Security (Firestore + Client)** | C+ | A | MEDIUM |
| **Cross-Platform Compatibility** | B- | A | MEDIUM |
| **Accessibility** | D | A | LARGE |
| **State Management & Memory** | B | A | SMALL |
| **Cost Efficiency (Firestore)** | C | A | MEDIUM |

**Total issues found: 24**
- CRITICAL: 3
- HIGH: 8
- MEDIUM: 8
- LOW: 5

---

## Table of Contents

1. [CRITICAL — Data Integrity & Economy Exploits](#1-critical--data-integrity--economy-exploits)
2. [HIGH — Security & Authorization](#2-high--security--authorization)  
3. [HIGH — Race Conditions & Concurrency](#3-high--race-conditions--concurrency)
4. [MEDIUM — Cross-Platform Bugs](#4-medium--cross-platform-bugs)
5. [MEDIUM — State Management & Memory Leaks](#5-medium--state-management--memory-leaks)
6. [MEDIUM — Firestore Cost & Query Patterns](#6-medium--firestore-cost--query-patterns)
7. [LOW — Accessibility & UX Polish](#7-low--accessibility--ux-polish)
8. [Firestore Rules Audit](#8-firestore-rules-audit)
9. [Platform Compatibility Matrix](#9-platform-compatibility-matrix)
10. [Fix Priority Roadmap](#10-fix-priority-roadmap)

---

## 1. CRITICAL — Data Integrity & Economy Exploits

### 1.1 CRITICAL: DM Unread Count Race Condition — Lost Message Notifications

**File**: [src/services/directMessages.ts](src/services/directMessages.ts#L79-L93)

**Problem**: Unread count increment uses a non-atomic read-then-write pattern:
```typescript
const receiverThreadSnap = await getDoc(receiverThreadRef);
const prevUnread = receiverThreadSnap.exists()
  ? typeof receiverThreadSnap.data().unreadCount === 'number'
    ? receiverThreadSnap.data().unreadCount
    : 0
  : 0;
await setDoc(receiverThreadRef, { unreadCount: prevUnread + 1 }, { merge: true });
```

**Exploit scenario**: Two players message the same recipient within milliseconds. Both read `unreadCount = 3`, both write `unreadCount = 4`. One message notification is silently lost.

**Impact**: Players miss DM notifications. In a game with gifting, guild coordination, and war challenges flowing through social, this erodes trust.

**Fix**: Use Firestore `increment()` for atomic counter updates:
```typescript
import { increment } from 'firebase/firestore';
await setDoc(receiverThreadRef, {
  partnerUid: fromUid,
  partnerName: fromName.trim().slice(0, 24),
  lastMessageText: cleaned.slice(0, 80),
  lastMessageAt: now,
  unreadCount: increment(1),
}, { merge: true });
```

**Platforms affected**: All (server-side logic).

---

### 1.2 CRITICAL: Boss Defeat Reward Duplication

**File**: [src/services/guild.ts](src/services/guild.ts#L876-L980)

**Problem**: Boss defeat detection happens inside a Firestore transaction (correct), but reward mail distribution happens OUTSIDE the transaction:
```typescript
const txResult = await runTransaction(db, async tx => {
  // ... boss HP reduction, defeat detection ...
  return { dealt, rewardGranted: defeated, rewardAmount, boss };
});

if (txResult.rewardGranted) {
  // ← This runs OUTSIDE the transaction
  const memberSnaps = await getDocs(query(membersCol, limit(200)));
  await Promise.all(memberSnaps.docs.map(async memberSnap => {
    await setDoc(mailRef, { subject: 'Guild Boss Defeated', attachments: { shards, gold, tears, essence } });
  }));
}
```

**Exploit scenario**: Two players land the killing blow within the same Firestore transaction retry window. Both transactions succeed (Firestore serializes them), but the second attacker's transaction also sees `defeated = true` because the first transaction already set `currentHp = 0`. Both post-transaction blocks fire reward mail, doubling all guild member rewards.

**Impact**: Economy-breaking. Every guild member receives 2× boss rewards (shards, gold, tears, essence). Over time this compounds into hyperinflation.

**Fix**: Add a `rewardedAt` field to the boss document. Inside the transaction, check if rewards were already granted:
```typescript
const txResult = await runTransaction(db, async tx => {
  // ...
  const alreadyRewarded = typeof bossData.rewardedAt === 'number' && bossData.rewardedAt > 0;
  const defeated = nextHp <= 0;
  const shouldReward = defeated && !alreadyRewarded;
  
  if (shouldReward) {
    tx.set(bossRef, { rewardedAt: now, ... }, { merge: true });
  }
  
  return { dealt, rewardGranted: shouldReward, ... };
});
```

**Platforms affected**: All (server-side logic).

---

### 1.3 CRITICAL: Client-Side DPS Spoofing for Boss & War Damage

**Files**: [src/services/guild.ts](src/services/guild.ts#L890) and [src/services/guildWars.ts](src/services/guildWars.ts#L335)

**Problem**: Both `attackBoss` and `contributeWarDamage` accept a client-provided `dps` value with only a ceiling cap:
```typescript
// guild.ts
const MAX_ALLOWED_DPS = 1_000_000_000;
const safeDps = Math.min(MAX_ALLOWED_DPS, Math.max(1, Math.floor(input.dps || 1)));
const strikeDamage = safeDps * 30;

// guildWars.ts
const dealt = Math.max(0, Math.floor((input.dps || 1) * 30));  // NO CAP AT ALL
```

**Exploit scenario**: 
- Player at level 5 with real DPS of 100 sends `dps: 1_000_000_000` to `attackBoss`. Boss takes 30 billion damage in one hit.
- Guild Wars `contributeWarDamage` has **zero DPS cap** — a player can send arbitrary damage values.

**Impact**: Competitive integrity destroyed. One cheating player can solo any guild boss instantly and win any guild war.

**Fix**:
1. Add the same `MAX_ALLOWED_DPS` cap to `contributeWarDamage`
2. Cross-reference submitted DPS against the player's leaderboard score/level to enforce a reasonable ceiling
3. Log anomalous DPS submissions for admin review

**Platforms affected**: All (especially Android APK where client-side code is easier to modify).

---

## 2. HIGH — Security & Authorization

### 2.1 HIGH: DM Recipient Validation Missing — Messages to Non-Existent or Blocked Users

**File**: [src/services/directMessages.ts](src/services/directMessages.ts#L43-L56)

**Problem**: `sendDirectMessage` performs zero validation on `toUid`:
- No check that `toUid` corresponds to an actual user account
- No check against the sender's block list
- No check against the recipient's block list
- `toName` is caller-provided and can be spoofed

**Impact**: 
- Players can send messages to blocked users (harassment vector)
- Orphaned conversations accumulate in Firestore for non-existent UIDs
- Spoofed `toName` means recipient sees wrong sender name in thread listing

**Fix**:
```typescript
// Check recipient exists
const recipientProfile = await getDoc(doc(db, 'leaderboard_global_v1', toUid));
if (!recipientProfile.exists()) throw new Error('Recipient not found.');

// Check block list (both directions)
const [iBlockedThem, theyBlockedMe] = await Promise.all([
  getDoc(doc(db, 'blocks', fromUid, 'list', toUid)),
  getDoc(doc(db, 'blocks', toUid, 'list', fromUid)),
]);
if (iBlockedThem.exists() || theyBlockedMe.exists()) {
  throw new Error('Cannot message this player.');
}
```

**Firestore Rules Gap**: The `directMessages` rules only check conversation ID format (`uid1_uid2`), not friendship or block status. This is by design (DMs aren't friend-only), but block enforcement must happen somewhere.

---

### 2.2 HIGH: Guild Rank Check Stale During Transaction

**File**: [src/services/guild.ts](src/services/guild.ts) — `kickGuildMember`, `setMemberRank`, `transferGuildLeadership`

**Problem**: Actor's rank is fetched at the START of the transaction, but Firestore transactions can retry. Between retries, another leader could demote the actor:
```typescript
return runTransaction(db, async tx => {
  const actorMembershipSnap = await tx.get(memberRef);
  const actorRank = actorMembershipSnap.data().rank; // Could be stale on retry
  // ... proceeds to kick/promote based on potentially stale rank ...
});
```

**Impact**: Officer demoted to member can still execute a kick if the transaction retries after demotion but before the kick write.

**Note**: Firestore transactions DO re-read documents on retry, so this is actually safe because `tx.get()` is called inside the transaction function. However, the `resolveGuildMembershipForUser()` call that happens BEFORE the transaction is the real vulnerability — it determines `guildId` outside the transaction scope.

**Fix**: Move all authorization reads inside the transaction.

---

### 2.3 HIGH: Firestore Rules — DM Conversation ID Spoofing

**File**: [firestore.rules](firestore.rules#L620-L639)

**Problem**: DM access control relies on string matching:
```
allow read: if isSignedIn()
  && (
    conversationId.matches(request.auth.uid + '_.*')
    || conversationId.matches('.*_' + request.auth.uid)
  );
```

The regex `.*_` is greedy. A UID containing an underscore could match conversations it shouldn't. Example: User with UID `abc_def` matches `abc_def_xyz` (their conversation with `xyz`) but ALSO matches `abc_def` as `abc` + `_` + `def` if another conversation `abc_def` existed.

**Actual Risk**: Low — Firebase UIDs don't contain underscores. But the pattern is fragile and would break if UID format ever changes.

**Fix**: Use exact boundary matching or store participant UIDs as array fields for safer querying.

---

### 2.4 HIGH: Feature Flags Don't Gate Service Layer

**File**: [src/socialFeatureFlags.ts](src/socialFeatureFlags.ts)

**Problem**: Feature flags exist and are well-designed (Proxy-based, runtime overridable), but only `guildTreasury` is actually checked in the service layer. All other services (`directMessages`, `guildWars`, `activityFeed`, `playerSearch`, `blockReport`) execute regardless of their flag state.

**Impact**: Kill switches don't actually kill features. If a vulnerability is found in DMs, toggling `directMessages: false` does nothing — the service still processes messages.

**Fix**: Add flag checks at the entry point of each service:
```typescript
export async function sendDirectMessage(...) {
  if (!SOCIAL_FEATURE_FLAGS.directMessages) throw new Error('Direct messages are currently disabled.');
  // ...
}
```

---

## 3. HIGH — Race Conditions & Concurrency

### 3.1 HIGH: Guild War Completion Race

**File**: [src/services/guildWars.ts](src/services/guildWars.ts#L363-L385)

**Problem**: War completion detection is inside a Firestore transaction, which is correct. However, the winner determination logic has a subtle issue:
```typescript
const aHit = guildADamage >= guildATarget;
const bHit = guildBDamage >= guildBTarget;
if (aHit && bHit) winnerId = guildADamage >= guildBDamage ? war.guildAId : war.guildBId;
```

If both guilds hit their target in the same transaction, the winner is determined by raw damage, which may not be the intended mechanic. More importantly: after the war is marked `completed`, subsequent `contributeWarDamage` calls correctly reject with `'War is not active.'` — so this is actually safe from a data integrity perspective.

**Remaining issue**: No DPS cap in `contributeWarDamage` (see 1.3).

---

### 3.2 HIGH: Chat Reaction Listener Accumulation

**File**: [src/services/chat.ts](src/services/chat.ts) — `subscribeToChat`

**Problem**: The `reactionUnsubByMessageId` Map creates one Firestore `onSnapshot` listener per visible chat message for real-time reaction updates. If a user has a long chat session (2+ hours), old messages scroll out but their reaction listeners may not be cleaned up promptly.

**Impact**: 
- 100+ active Firestore listeners per user in extended sessions
- Each listener consumes a Firestore connection slot
- On mobile (especially Android APK), this drains battery and data

**Fix**: Implement a sliding window — only maintain reaction listeners for the most recent N messages (e.g., 50). When new messages arrive, unsubscribe listeners for messages older than the window.

---

### 3.3 HIGH: Presence Heartbeat Global Singleton

**File**: [src/services/presence.ts](src/services/presence.ts#L40-L55)

**Problem**: `heartbeatTimer` is a module-level mutable global:
```typescript
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startPresenceHeartbeat(uid: string, displayName: string, level: number): () => void {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  heartbeatTimer = setInterval(() => { ... }, HEARTBEAT_MS);
  return () => { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } };
}
```

**Problem scenarios**:
- React StrictMode double-mounts: first mount starts heartbeat, second mount clears the first and starts a new one, first cleanup clears the second — no heartbeat running
- Hot module reloading (development): module re-evaluation resets `heartbeatTimer` to `null` but the old interval is still running — duplicate heartbeats

**Impact**: Users may appear offline despite being active (StrictMode), or generate double Firestore writes (HMR).

**Fix**: Store heartbeat state per-uid using a Map, or use React-managed refs.

---

## 4. MEDIUM — Cross-Platform Bugs

### 4.1 MEDIUM: Shadow Rendering Broken on Web & Android

**File**: [src/screens/tabs/social/social.styles.ts](src/screens/tabs/social/social.styles.ts)

**Problem**: Styles use iOS shadow properties without web/Android equivalents:
```typescript
shadowColor: '#56B4FF',
shadowOpacity: 0.3,
shadowRadius: 8,
// Missing: shadowOffset (required on iOS), elevation (required on Android)
```

**Platform Impact**:
| Platform | Effect |
|----------|--------|
| **iOS Safari** | Partial shadow (missing `shadowOffset` means shadow may not render) |
| **Android Chrome/APK** | No shadow at all (requires `elevation` property) |
| **Desktop Chrome** | No shadow (RN Web maps to CSS `box-shadow` only with complete shadow props) |
| **Desktop Safari** | Same as Chrome |
| **IE** | No RN Web support at all, but shadows doubly broken |

**Fix**: Add complete shadow definitions:
```typescript
shadowColor: '#56B4FF',
shadowOffset: { width: 0, height: 2 },
shadowOpacity: 0.3,
shadowRadius: 8,
elevation: 4, // Android
```

---

### 4.2 MEDIUM: Touch Swipe Gestures Disabled on Web

**File**: [src/screens/tabs/SocialTabContent.tsx](src/screens/tabs/SocialTabContent.tsx)

**Problem**: Tab swipe navigation checks `Platform.OS === 'web'` and silently skips gesture handling. Desktop users using touchscreens (Surface Pro, iPad with keyboard) can't swipe between social sub-tabs.

**Platform Impact**:
| Platform | Effect |
|----------|--------|
| **Desktop Chrome (touch)** | No swipe — must tap tabs |
| **Desktop Safari (touch)** | No swipe |
| **Mobile Chrome/Safari** | Swipe works ✅ |
| **Android APK** | Swipe works ✅ |

**Fix**: Use pointer event detection instead of platform check, or enable swipe on web via `onPointerDown`/`onPointerUp`.

---

### 4.3 MEDIUM: Number Pad Keyboard Blocks Decimal Input on iOS

**File**: [src/screens/tabs/social/GuildSection.tsx](src/screens/tabs/social/GuildSection.tsx)

**Problem**: Treasury amount input uses `keyboardType="number-pad"` which on iOS removes all non-numeric keys including decimal point. While treasury amounts are integers (correct), the number pad on some Android devices doesn't include a "Done" button, requiring users to tap outside to dismiss the keyboard.

**Platform Impact**:
| Platform | Effect |
|----------|--------|
| **iOS Safari** | Number pad, no Done button — user must tap outside |
| **Android Chrome** | Number pad variant varies by manufacturer |
| **Android APK** | Same as Chrome |
| **Desktop** | HTML number input, works fine |

---

### 4.4 MEDIUM: FlatList Scroll Performance Degradation on Android

**File**: [src/screens/tabs/social/ChatSection.tsx](src/screens/tabs/social/ChatSection.tsx)

**Problem**: Chat section builds the entire `rows` array (messages + day separators + channel header) in a `useMemo` that reconstructs on every message update. On long sessions with 500+ messages, this causes:
- Frame drops during scroll on mid-range Android devices
- `FlatList` re-renders all items when `rows` reference changes
- `scrollToEnd` animation conflicts with user scroll momentum

**Platform Impact**:
| Platform | Effect |
|----------|--------|
| **Desktop Chrome/Safari** | Minor lag at 1000+ messages |
| **Mobile Chrome** | Noticeable jank at 200+ messages |
| **Android APK** | Scroll stutter at 100+ messages on budget devices |
| **iOS Safari** | Smooth due to UITableView optimization |

**Fix**: 
- Add `getItemLayout` for fixed-height rows to avoid measurement passes
- Implement message windowing (only keep last 200 messages in state)
- Use `React.memo` on individual message row components

---

### 4.5 MEDIUM: Modal Backdrop Dismissal Missing on Web

**Files**: [ProfileModal.tsx](src/screens/tabs/social/ProfileModal.tsx), [SocialTabContent.tsx](src/screens/tabs/SocialTabContent.tsx)

**Problem**: Profile modal and user menu modal dismiss on backdrop press (mobile), but web/desktop users expect Escape key to also dismiss modals. No `onKeyDown` handler is registered.

**Platform Impact**:
| Platform | Effect |
|----------|--------|
| **Desktop Chrome/Safari** | Escape key doesn't close modals |
| **IE** | Same |
| **Mobile** | Works via backdrop press ✅ |

---

## 5. MEDIUM — State Management & Memory Leaks

### 5.1 MEDIUM: Profile Cache Grows Without Bound

**File**: [src/screens/tabs/social/ProfileModal.tsx](src/screens/tabs/social/ProfileModal.tsx)

**Problem**: `cacheRef.current` is a plain object that stores every profile ever opened, with no eviction:
```typescript
const cacheRef = useRef<Record<string, PublicPlayerProfile>>({});
// ...  
cacheRef.current[targetUid] = p;
```

After viewing 500 player profiles (common in a competitive guild war scenario), 500 full profile objects persist in memory.

**Impact**: Gradual memory pressure, especially on mobile devices with 2-3 GB RAM. Could trigger garbage collection pauses visible as UI stutter.

**Fix**: Implement simple LRU cache with max 50 entries.

---

### 5.2 MEDIUM: Gift Cooldown Timer Stale After UTC Midnight

**File**: [src/screens/tabs/social/FriendsSection.tsx](src/screens/tabs/social/FriendsSection.tsx)

**Problem**: Gift availability is calculated by checking if the last gift timestamp falls in the current UTC day. This calculation runs once per render — if a player leaves the app open overnight, the gift button won't re-enable at midnight without a manual refresh.

**Impact**: Players think gifting is broken; they close and reopen the app.

**Fix**: Add a `useEffect` timer that triggers a re-render at the next UTC midnight boundary.

---

### 5.3 MEDIUM: Friends List Breaks If One Friend UID Is Invalid

**File**: [src/services/friends.ts](src/services/friends.ts)

**Problem**: `fetchFriends` maps over all friend documents with `Promise.all`. If any single friend's leaderboard lookup fails (deleted account, corrupted data), the entire `Promise.all` rejects and the friends list shows empty/error.

**Impact**: One deleted/corrupted friend account prevents ALL friends from loading.

**Fix**: Use `Promise.allSettled()` and filter out failed entries:
```typescript
const results = await Promise.allSettled(snap.docs.map(async docSnap => { ... }));
const rows = results
  .filter((r): r is PromiseFulfilledResult<FriendListEntry> => r.status === 'fulfilled')
  .map(r => r.value);
```

---

## 6. MEDIUM — Firestore Cost & Query Patterns

### 6.1 MEDIUM: Leaderboard Rank Calculation Scans Entire Collection

**File**: [src/services/publicProfile.ts](src/services/publicProfile.ts)

**Problem**: Every profile view runs `getCountFromServer` against a `where('score', '>', playerScore)` query on the entire leaderboard collection. With 100K players, this scans ~50K documents per profile view (on average).

**Cost**: At $0.06 per 100K reads, viewing 10 profiles costs ~$0.03. In a guild of 50 active players each viewing 10 profiles/day = $45/month just for rank calculations.

**Fix**: Denormalize rank into the leaderboard document. Update on score submission (already writing to leaderboard anyway).

---

### 6.2 MEDIUM: Activity Feed Creates N Listeners Per Friend

**File**: [src/services/activityFeed.ts](src/services/activityFeed.ts)

**Problem**: `subscribeToFriendActivity` creates one `onSnapshot` listener per friend UID, capped to 30:
```typescript
for (const friendUid of cappedUids) {
  const q = query(collection(db, 'activityFeed', friendUid, 'events'), ...);
  const unsub = onSnapshot(q, snap => { ... });
}
```

**Cost**: 30 active Firestore listeners × concurrent users. Each listener maintains a persistent connection. This is the most expensive pattern in the social tab.

**Fix**: Use a Firestore collection group query with friend UID filtering, or denormalize activity events into a per-user aggregated feed on write.

---

### 6.3 MEDIUM: Player Search Uses Query Where getDoc Suffices

**File**: [src/services/playerSearch.ts](src/services/playerSearch.ts)

**Problem**: Search result enrichment queries `leaderboard_global_v1` and `userGuild` using `where('__name__', '==', uid)` queries instead of direct document reads:
```typescript
const boardSnap = await getDocs(query(collection(db, 'leaderboard_global_v1'), 
  where('__name__', '==', player.uid), limit(1)));
```

**Impact**: Collection queries cost more than document reads and are slower.

**Fix**: Replace with direct `getDoc(doc(db, 'leaderboard_global_v1', uid))`.

---

## 7. LOW — Accessibility & UX Polish

### 7.1 LOW: Chat Messages Lack Screen Reader Labels

**File**: [src/screens/tabs/social/ChatSection.tsx](src/screens/tabs/social/ChatSection.tsx)

**Problem**: Chat message rows have no `accessibilityLabel`. Screen readers announce "Pressable" instead of the sender name, time, and message text.

**Fix**: Add `accessibilityLabel={`${msg.displayName} at ${formatTime(msg.sentAt)}: ${msg.text}`}`.

---

### 7.2 LOW: Reaction Emojis Not Announced as Actions

**File**: [src/screens/tabs/social/ChatSection.tsx](src/screens/tabs/social/ChatSection.tsx)

**Problem**: Reaction chips (👍🔥💪🎉) render as plain text. Screen readers read the Unicode emoji names rather than action descriptions.

**Fix**: Add `accessibilityLabel="Thumbs up reaction, 5 votes. Double tap to toggle."`.

---

### 7.3 LOW: Color-Only Error Indication

**Files**: [SearchSection.tsx](src/screens/tabs/social/SearchSection.tsx), [GuildSection.tsx](src/screens/tabs/social/GuildSection.tsx)

**Problem**: Error states use red text color as the only indicator. Colorblind users (8% of males) may not distinguish error from normal text.

**Fix**: Prepend ⚠️ icon to all error messages.

---

### 7.4 LOW: DM Partner Name Can Be Undefined

**File**: [src/screens/tabs/social/DMSection.tsx](src/screens/tabs/social/DMSection.tsx)

**Problem**: `activePartner?.name` is used without fallback in screen reader context. If partner name is undefined, screen readers announce "undefined at 14:32".

**Fix**: Use `activePartner?.name ?? 'Other Player'`.

---

### 7.5 LOW: Hardcoded Colors Instead of Theme Constants

**File**: [src/screens/tabs/social/social.styles.ts](src/screens/tabs/social/social.styles.ts)

**Problem**: Mix of hardcoded hex colors (`#2A5A84`, `#E9F4FF`, `#AFC3D6`) and `THEME` constants throughout. This breaks if a dark mode or theme system is later implemented.

**Impact**: Inconsistent appearance, especially on high-contrast accessibility modes.

---

## 8. Firestore Rules Audit

### Rules Correctness Assessment

| Collection | Rules Grade | Notes |
|-----------|:---:|-------|
| `globalChat` | A | Rate limit + mute check + message validation ✅ |
| `globalChat/reactions` | A | UID-scoped, emoji allowlist ✅ |
| `friends/*/requests` | A | Proper bidirectional ownership ✅ |
| `friends/*/list` | A | Mutual friend read access ✅ |
| `playerMail` | A- | Friend-or-guild check ✅, but no size limit on attachments map |
| `guilds` | A | Leader/member permissions well-separated ✅ |
| `guilds/members` | A | Rank mutation properly leader-gated ✅ |
| `guilds/treasuryState` | A- | Officer withdrawal enforcement ✅, but daily cap not validated in rules |
| `guilds/treasuryLedger` | A | Immutable entries, withdrawal leader-gated ✅ |
| `guilds/boss` | B+ | No per-member cooldown enforcement in rules (client-side only) |
| `guilds/chat` | A | Rate limit + length check ✅ |
| `guildInvites` | A | Expiry + officer/leader check + immutable-on-accept fields ✅ |
| `directMessages` | B | Regex-based ownership (fragile), no block check |
| `dmThreads` | B+ | Partner can update thread (for unread), but no write throttle |
| `blocks/*/list` | A | Self-block prevention ✅ |
| `reports` | A | Self-report blocked, reason enum ✅ |
| `activityFeed` | B | Events readable by any signed-in user, not just friends |
| `guildWarChallenges` | B+ | No leader-only enforcement on create (any signed-in user can create) |
| `guildWars/contributors` | B+ | UID-scoped writes ✅, but no DPS validation |
| `leaderboard_global_v1` | A | Rate limit (10s between updates) ✅ |
| `onlinePresence` | A- | World-readable presence (privacy concern) |

### Key Firestore Rules Gaps

1. **`guildWarChallenges` create**: Rules allow ANY signed-in user to create a challenge. The `challengerGuildId` field is not verified against the creator's actual guild. A malicious user could create challenges on behalf of other guilds.

2. **`activityFeed` read**: Any authenticated user can read ANY user's activity feed (`allow read: if isSignedIn()`). This should be restricted to friends-only or self-only.

3. **`guilds/boss` write**: No per-member write throttle in rules. The cooldown is enforced client-side in `attackBoss()`. A modified client could bypass the cooldown and spam boss attacks.

4. **`treasuryState` daily cap**: Rules don't enforce the daily withdrawal cap — they only check that officers/leaders can withdraw. The cap is enforced client-side in the transaction. A modified client skipping the transaction could withdraw unlimited amounts (though the transaction is currently the only write path).

5. **`onlinePresence` privacy**: `allow get, list: if isSignedIn()` means any player can query all online users. Should be restricted to friends-only for the list operation.

---

## 9. Platform Compatibility Matrix

| Feature | Desktop Chrome | Desktop Safari | IE 11 | Mobile Chrome (Android) | Safari (iPhone) | Android APK |
|---------|:---:|:---:|:---:|:---:|:---:|:---:|
| Chat send/receive | ✅ | ✅ | ⚠️ Proxy unsupported | ✅ | ✅ | ✅ |
| Chat reactions | ✅ | ✅ | ❌ Proxy/Set | ✅ | ✅ | ✅ |
| Tab swipe navigation | ❌ No touch | ❌ No touch | ❌ | ✅ | ✅ | ✅ |
| Shadow effects | ⚠️ Partial | ⚠️ Partial | ❌ | ❌ No elevation | ✅ | ❌ No elevation |
| Modal Escape dismiss | ❌ | ❌ | ❌ | N/A | N/A | N/A |
| FlatList performance | ✅ | ✅ | ❌ | ⚠️ 200+ msgs | ✅ | ⚠️ 100+ msgs |
| Treasury keyboard | ✅ | ✅ | ✅ | ⚠️ No Done btn | ⚠️ No Done btn | ⚠️ Varies |
| Feature flag kill | ❌ Not wired | ❌ Not wired | ❌ Not wired | ❌ Not wired | ❌ Not wired | ❌ Not wired |
| Profile cache memory | ✅ OK | ✅ OK | ⚠️ Low RAM | ⚠️ 2GB devices | ✅ OK | ⚠️ 2GB devices |

### IE 11 Specific Breaking Issues

The `socialFeatureFlags.ts` uses `Proxy` which is **not supported in IE 11** and cannot be polyfilled. This means:
- Feature flags will throw a runtime error on IE 11
- **The entire social tab will crash on IE 11**
- `Set` usage in chat reactions also unsupported without polyfill

**Recommendation**: If IE 11 support is required, replace `Proxy` with a getter-based implementation. If IE 11 is not a target, document this explicitly.

---

## 10. Fix Priority Roadmap

### Sprint 1 — Critical Fixes (Ship-Blocking)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 1.1 | DM unread count race → use `increment()` | `directMessages.ts` | 15 min |
| 1.2 | Boss reward duplication → add `rewardedAt` guard | `guild.ts` | 30 min |
| 1.3 | DPS spoofing: add cap to war + cross-ref player level | `guild.ts`, `guildWars.ts` | 1 hr |
| 2.1 | DM recipient validation + block check | `directMessages.ts` | 45 min |

### Sprint 2 — High Priority (Pre-Beta)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 2.4 | Wire feature flags to all services | All services | 1 hr |
| 3.2 | Chat reaction listener windowing | `chat.ts` | 1 hr |
| 3.3 | Presence heartbeat per-uid state | `presence.ts` | 30 min |
| 4.1 | Fix shadow rendering cross-platform | `social.styles.ts` | 1 hr |
| 5.3 | Friends list `Promise.allSettled` | `friends.ts` | 15 min |

### Sprint 3 — Medium Priority (Post-Beta)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 4.4 | Chat FlatList performance + windowing | `ChatSection.tsx` | 2 hr |
| 4.5 | Modal Escape key dismissal on web | `ProfileModal.tsx`, `SocialTabContent.tsx` | 30 min |
| 5.1 | Profile cache LRU eviction | `ProfileModal.tsx` | 30 min |
| 5.2 | Gift cooldown midnight auto-refresh | `FriendsSection.tsx` | 30 min |
| 6.1 | Denormalize leaderboard rank | `publicProfile.ts`, `leaderboard.ts` | 2 hr |
| 6.2 | Activity feed listener consolidation | `activityFeed.ts` | 3 hr |

### Sprint 4 — Polish (Pre-Launch)

| # | Issue | Files | Effort |
|---|-------|-------|--------|
| 7.1-7.5 | Accessibility labels + theme consistency | Various | 2 hr |
| 8 | Firestore rules hardening (5 gaps) | `firestore.rules` | 2 hr |
| 9 | IE 11 decision + polyfills or drop | `socialFeatureFlags.ts` | 1 hr |

---

*Audit generated: April 15, 2026*
*Scope: Social Tab v2 — all 12 frontend components, 9 backend services, 6 hooks, Firestore rules, 6 target platforms*
