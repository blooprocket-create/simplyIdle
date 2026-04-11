import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  writeBatch,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';
import { SOCIAL_FEATURE_FLAGS } from '../socialFeatureFlags';

export type GuildMemberRank = 'leader' | 'officer' | 'member';

export interface GuildSummary {
  guildId: string;
  name: string;
  tag: string;
  description: string;
  leaderId: string;
  leaderName: string;
  level: number;
  memberCount: number;
  maxMembers: number;
  isPublic: boolean;
  minPeakProgressToJoin: number;
  createdAt: number;
}

export interface GuildMember {
  uid: string;
  displayName: string;
  rank: GuildMemberRank;
  joinedAt: number;
  guildContribution: number;
  lastBossAttackAt: number;
}

export interface GuildBossState {
  bossId: string;
  name: string;
  tier: number;
  maxHp: number;
  currentHp: number;
  status: 'active' | 'defeated' | 'expired';
  startedAt: number;
  expiresAt: number;
  participantUids: string[];
}

export interface GuildEventState {
  eventId: string;
  type: 'war' | 'expedition';
  status: 'active' | 'completed' | 'expired';
  startedAt: number;
  endsAt: number;
  details: Record<string, unknown>;
}

export interface GuildEventContributor {
  uid: string;
  totalContributed: number;
  lastContribution: number;
  lastContributedAt: number;
}

export interface GuildChatMessage {
  id: string;
  uid: string;
  displayName: string;
  text: string;
  sentAt: number;
}

export interface GuildBrowseRow {
  guildId: string;
  name: string;
  tag: string;
  leaderName: string;
  memberCount: number;
  level: number;
  isPublic: boolean;
}

export interface GuildTreasuryState {
  balance: number;
  totalDeposited: number;
  totalWithdrawn: number;
  dailyWithdrawn: number;
  dailyWindowStart: number;
  updatedAt: number;
  updatedByUid: string;
}

export interface GuildTreasuryEntry {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  actorUid: string;
  actorName: string;
  actorRank: GuildMemberRank;
  reason: string;
  createdAt: number;
}

export interface GuildTreasuryTransactionResult {
  treasury: GuildTreasuryState;
  playerGold: number;
}

const GUILD_COLLECTION = 'guilds';
const GUILD_LOOKUP_COLLECTION = 'guildLookup';
const USER_GUILD_COLLECTION = 'userGuild';
const GUILD_CHAT_RATE_LIMIT_COLLECTION = 'guildChatRateLimit';
const GUILD_TREASURY_STATE_COLLECTION = 'treasuryState';
const GUILD_TREASURY_LEDGER_COLLECTION = 'treasuryLedger';
const GUILD_INVITES_COLLECTION = 'guildInvites';
const BOSS_ATTACK_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const BOSS_DURATION_MS = 5 * 24 * 60 * 60 * 1000;
const WAR_DURATION_MS = 48 * 60 * 60 * 1000;
const EXPEDITION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const GUILD_CHAT_COOLDOWN_MS = 3000;
const EVENT_CONTRIBUTION_COOLDOWN_MS = 5 * 60 * 1000;
const TREASURY_DAILY_WITHDRAW_CAP_LEADER = 25_000_000;
const TREASURY_DAILY_WITHDRAW_CAP_OFFICER = 5_000_000;
const GUILD_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface GuildInvite {
  id: string;
  guildId: string;
  guildName: string;
  guildTag: string;
  inviterUid: string;
  inviterName: string;
  invitedUid: string;
  minPeakProgressToJoin: number;
  isPublic: boolean;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
}

function guildTreasuryEnabled(): boolean {
  return SOCIAL_FEATURE_FLAGS.guildTreasury === true;
}

function requireDb() {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Guild service unavailable.');
  return db;
}

function normalizeGuildName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 32);
}

function normalizeGuildTag(tag: string): string {
  return tag.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function makeGuildId(normalizedName: string): string {
  const base = normalizedName.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'guild';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

function parseGuildSummary(guildId: string, data: Record<string, unknown>): GuildSummary {
  const minPeakProgressToJoin = typeof data.minPeakProgressToJoin === 'number'
    ? Math.max(1, Math.floor(data.minPeakProgressToJoin))
    : typeof data.minLevelToJoin === 'number'
      ? Math.max(1, Math.floor(data.minLevelToJoin))
      : 1;

  return {
    guildId,
    name: typeof data.name === 'string' ? data.name : 'Guild',
    tag: typeof data.tag === 'string' ? data.tag : 'TAG',
    description: typeof data.description === 'string' ? data.description : '',
    leaderId: typeof data.leaderId === 'string' ? data.leaderId : '',
    leaderName: typeof data.leaderName === 'string' ? data.leaderName : 'Leader',
    level: typeof data.level === 'number' ? data.level : 1,
    memberCount: typeof data.memberCount === 'number' ? data.memberCount : 1,
    maxMembers: typeof data.maxMembers === 'number' ? data.maxMembers : 30,
    isPublic: data.isPublic !== false,
    minPeakProgressToJoin,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
  };
}

function bossHpForTier(tier: number): number {
  return Math.max(1, Math.floor(Math.max(1, tier) * 500_000_000_000));
}

function sanitizeMessage(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

function pickBossName(tier: number): string {
  if (tier >= 10) return 'Eternal Colossus';
  if (tier >= 5) return 'Storm Tyrant';
  return 'Ashen Behemoth';
}

async function resolveGuildIdForUser(uid: string): Promise<string | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, USER_GUILD_COLLECTION, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  return typeof data.guildId === 'string' ? data.guildId : null;
}

async function resolveGuildMembershipForUser(uid: string): Promise<{ guildId: string; rank: GuildMemberRank } | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, USER_GUILD_COLLECTION, uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const guildId = typeof data.guildId === 'string' ? data.guildId : '';
  if (!guildId) return null;
  const rank = data.rank === 'leader' || data.rank === 'officer' ? data.rank : 'member';
  return { guildId, rank };
}

function startOfCurrentUtcDay(nowMs: number): number {
  const now = new Date(nowMs);
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
}

function clampTreasuryAmount(amount: number): number {
  return Math.max(1, Math.min(500_000_000, Math.floor(amount)));
}

function parseGuildTreasuryState(data: Record<string, unknown>): GuildTreasuryState {
  return {
    balance: typeof data.balance === 'number' ? Math.max(0, Math.floor(data.balance)) : 0,
    totalDeposited: typeof data.totalDeposited === 'number' ? Math.max(0, Math.floor(data.totalDeposited)) : 0,
    totalWithdrawn: typeof data.totalWithdrawn === 'number' ? Math.max(0, Math.floor(data.totalWithdrawn)) : 0,
    dailyWithdrawn: typeof data.dailyWithdrawn === 'number' ? Math.max(0, Math.floor(data.dailyWithdrawn)) : 0,
    dailyWindowStart: typeof data.dailyWindowStart === 'number' ? data.dailyWindowStart : 0,
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
    updatedByUid: typeof data.updatedByUid === 'string' ? data.updatedByUid : '',
  };
}

function parseGuildInvite(inviteId: string, data: Record<string, unknown>): GuildInvite {
  const statusRaw = typeof data.status === 'string' ? data.status : 'pending';
  const status: GuildInvite['status'] = statusRaw === 'accepted'
    ? 'accepted'
    : statusRaw === 'declined'
      ? 'declined'
      : statusRaw === 'expired'
        ? 'expired'
        : 'pending';
  return {
    id: inviteId,
    guildId: typeof data.guildId === 'string' ? data.guildId : '',
    guildName: typeof data.guildName === 'string' ? data.guildName : 'Guild',
    guildTag: typeof data.guildTag === 'string' ? data.guildTag : 'TAG',
    inviterUid: typeof data.inviterUid === 'string' ? data.inviterUid : '',
    inviterName: typeof data.inviterName === 'string' ? data.inviterName : 'Leader',
    invitedUid: typeof data.invitedUid === 'string' ? data.invitedUid : '',
    minPeakProgressToJoin: typeof data.minPeakProgressToJoin === 'number'
      ? Math.max(1, Math.floor(data.minPeakProgressToJoin))
      : typeof data.minLevelToJoin === 'number'
        ? Math.max(1, Math.floor(data.minLevelToJoin))
        : 1,
    isPublic: data.isPublic !== false,
    status,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
    respondedAt: typeof data.respondedAt === 'number' ? data.respondedAt : null,
  };
}

function readGoldFromSavePayload(payload: Record<string, unknown>): number {
  const value = payload.gold;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export async function fetchPlayerTreasuryGold(uid: string, saveSlotId: string): Promise<number> {
  const db = requireDb();
  const cleanUid = uid.trim();
  const cleanSlot = saveSlotId.trim();
  if (!cleanUid || !cleanSlot) throw new Error('Missing treasury wallet parameters.');

  const saveRef = doc(db, 'users', cleanUid, 'saveSlots', cleanSlot);
  const snap = await getDoc(saveRef);
  if (!snap.exists()) return 0;
  const saveData = snap.data() as { payload?: Record<string, unknown> };
  return readGoldFromSavePayload((saveData.payload ?? {}) as Record<string, unknown>);
}

export async function createGuild(input: {
  uid: string;
  displayName: string;
  saveSlotId: string;
  guildName: string;
  guildTag: string;
  description?: string;
  minPeakProgressToJoin?: number;
  isPublic?: boolean;
}): Promise<GuildSummary> {
  const db = requireDb();
  const uid = input.uid.trim();
  const displayName = input.displayName.trim().slice(0, 24) || 'Leader';
  const saveSlotId = input.saveSlotId.trim();
  const name = input.guildName.trim().slice(0, 32);
  const normalizedName = normalizeGuildName(name);
  const tag = normalizeGuildTag(input.guildTag);
  const now = Date.now();
  const CREATE_GUILD_DIAMOND_COST = 2500;

  if (!uid) throw new Error('Missing user id.');
  if (!saveSlotId) throw new Error('Missing save slot id.');
  if (name.length < 3) throw new Error('Guild name must be at least 3 characters.');
  if (tag.length < 2) throw new Error('Guild tag must be 2 to 5 characters.');

  const guildId = makeGuildId(normalizedName);
  const guildRef = doc(db, GUILD_COLLECTION, guildId);
  const lookupRef = doc(db, GUILD_LOOKUP_COLLECTION, normalizedName);
  const userGuildRef = doc(db, USER_GUILD_COLLECTION, uid);
  const memberRef = doc(db, GUILD_COLLECTION, guildId, 'members', uid);
  const saveRef = doc(db, 'users', uid, 'saveSlots', saveSlotId);

  const minPeakProgressToJoin = Math.max(1, Math.floor(input.minPeakProgressToJoin ?? 1));

  await runTransaction(db, async tx => {
    const [existingMembership, existingName, saveSnap] = await Promise.all([
      tx.get(userGuildRef),
      tx.get(lookupRef),
      tx.get(saveRef),
    ]);

    if (existingMembership.exists()) {
      throw new Error('You are already in a guild.');
    }
    if (existingName.exists()) {
      throw new Error('Guild name is already taken.');
    }
    if (!saveSnap.exists()) {
      throw new Error('Save slot not found.');
    }

    const saveData = saveSnap.data() as { revision?: unknown; payload?: Record<string, unknown>; schemaVersion?: unknown; saveSlot?: unknown };
    const payload = (saveData.payload ?? {}) as Record<string, unknown>;
    const currentDiamonds = typeof payload.diamonds === 'number' ? payload.diamonds : 0;
    if (currentDiamonds < CREATE_GUILD_DIAMOND_COST) {
      throw new Error('Not enough diamonds. Requires 2500.');
    }
    const nextRevision = typeof saveData.revision === 'number' ? saveData.revision + 1 : 1;

    tx.set(saveRef, {
      revision: nextRevision,
      updatedAt: now,
      schemaVersion: typeof saveData.schemaVersion === 'number' ? saveData.schemaVersion : 1,
      saveSlot: typeof saveData.saveSlot === 'string' ? saveData.saveSlot : saveSlotId,
      payload: {
        ...payload,
        diamonds: Math.max(0, Math.floor(currentDiamonds - CREATE_GUILD_DIAMOND_COST)),
      },
    });

    tx.set(guildRef, {
      name,
      normalizedName,
      tag,
      description: (input.description ?? '').trim().slice(0, 140),
      leaderId: uid,
      leaderName: displayName,
      level: 1,
      exp: 0,
      memberCount: 1,
      maxMembers: 30,
      createdAt: now,
      isPublic: input.isPublic !== false,
      minPeakProgressToJoin,
      minLevelToJoin: minPeakProgressToJoin,
      updatedAt: now,
    });

    tx.set(lookupRef, {
      guildId,
      displayName: name,
      normalizedName,
      tag,
      memberCount: 1,
      leaderId: uid,
      leaderName: displayName,
      level: 1,
      isPublic: input.isPublic !== false,
      updatedAt: now,
    });

    tx.set(userGuildRef, {
      guildId,
      guildName: name,
      rank: 'leader',
      joinedAt: now,
    });

    tx.set(memberRef, {
      displayName,
      rank: 'leader',
      joinedAt: now,
      guildContribution: 0,
      lastBossAttackAt: 0,
    });
  });

  return {
    guildId,
    name,
    tag,
    description: (input.description ?? '').trim().slice(0, 140),
    leaderId: uid,
    leaderName: displayName,
    level: 1,
    memberCount: 1,
    maxMembers: 30,
    isPublic: input.isPublic !== false,
    minPeakProgressToJoin,
    createdAt: now,
  };
}

export async function joinGuild(input: {
  uid: string;
  displayName: string;
  guildId: string;
  playerPeakProgress: number;
}): Promise<void> {
  const db = requireDb();
  const uid = input.uid.trim();
  const guildId = input.guildId.trim();
  const now = Date.now();
  if (!uid || !guildId) throw new Error('Missing guild join parameters.');

  const userGuildRef = doc(db, USER_GUILD_COLLECTION, uid);
  const guildRef = doc(db, GUILD_COLLECTION, guildId);
  const memberRef = doc(db, GUILD_COLLECTION, guildId, 'members', uid);

  await runTransaction(db, async tx => {
    const [membershipSnap, guildSnap] = await Promise.all([
      tx.get(userGuildRef),
      tx.get(guildRef),
    ]);

    if (membershipSnap.exists()) {
      throw new Error('You are already in a guild.');
    }
    if (!guildSnap.exists()) {
      throw new Error('Guild not found.');
    }

    const guild = guildSnap.data();
    const memberCount = typeof guild.memberCount === 'number' ? guild.memberCount : 0;
    const maxMembers = typeof guild.maxMembers === 'number' ? guild.maxMembers : 30;
    const minPeakProgress = typeof guild.minPeakProgressToJoin === 'number'
      ? Math.max(1, Math.floor(guild.minPeakProgressToJoin))
      : typeof guild.minLevelToJoin === 'number'
        ? Math.max(1, Math.floor(guild.minLevelToJoin))
        : 1;

    if (memberCount >= maxMembers) throw new Error('Guild is full.');
    if (input.playerPeakProgress < minPeakProgress) throw new Error(`Peak progress ${minPeakProgress}+ required to join.`);

    tx.set(memberRef, {
      displayName: input.displayName.trim().slice(0, 24) || 'Member',
      rank: 'member',
      joinedAt: now,
      guildContribution: 0,
      lastBossAttackAt: 0,
    });

    tx.set(userGuildRef, {
      guildId,
      guildName: typeof guild.name === 'string' ? guild.name : 'Guild',
      rank: 'member',
      joinedAt: now,
    });

    const nextCount = memberCount + 1;
    tx.set(guildRef, { memberCount: nextCount, updatedAt: now }, { merge: true });
  });
}

export async function leaveGuild(input: { uid: string }): Promise<void> {
  const db = requireDb();
  const uid = input.uid.trim();
  if (!uid) throw new Error('Missing user id.');
  const now = Date.now();

  const userGuildRef = doc(db, USER_GUILD_COLLECTION, uid);

  await runTransaction(db, async tx => {
    const membershipSnap = await tx.get(userGuildRef);
    if (!membershipSnap.exists()) throw new Error('You are not in a guild.');

    const membership = membershipSnap.data();
    const guildId = typeof membership.guildId === 'string' ? membership.guildId : '';
    const rank = typeof membership.rank === 'string' ? membership.rank : 'member';
    if (!guildId) throw new Error('Guild data invalid.');
    if (rank === 'leader') throw new Error('Leader cannot leave. Transfer leadership first.');

    const guildRef = doc(db, GUILD_COLLECTION, guildId);
    const memberRef = doc(db, GUILD_COLLECTION, guildId, 'members', uid);
    const guildSnap = await tx.get(guildRef);
    if (!guildSnap.exists()) {
      tx.delete(userGuildRef);
      tx.delete(memberRef);
      return;
    }

    const guild = guildSnap.data();
    const memberCount = typeof guild.memberCount === 'number' ? guild.memberCount : 1;
    tx.delete(memberRef);
    tx.delete(userGuildRef);
    const nextCount = Math.max(1, memberCount - 1);
    tx.set(guildRef, { memberCount: nextCount, updatedAt: now }, { merge: true });

    const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';
    if (normalizedName) {
      tx.set(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName), { memberCount: nextCount, updatedAt: now }, { merge: true });
    }
  });
}

export async function kickMember(): Promise<never> {
  requireDb();
  throw new Error('Use kickGuildMember with actor and target user ids.');
}

export async function promoteMember(): Promise<never> {
  requireDb();
  throw new Error('Use setMemberRank with actor and target user ids.');
}

export async function kickGuildMember(input: { actorUid: string; targetUid: string }): Promise<void> {
  const db = requireDb();
  const actorUid = input.actorUid.trim();
  const targetUid = input.targetUid.trim();
  if (!actorUid || !targetUid) throw new Error('Missing member kick parameters.');
  if (actorUid === targetUid) throw new Error('Use leave to exit your own guild.');

  const now = Date.now();
  const actorMembershipRef = doc(db, USER_GUILD_COLLECTION, actorUid);
  const targetMembershipRef = doc(db, USER_GUILD_COLLECTION, targetUid);

  await runTransaction(db, async tx => {
    const [actorMembershipSnap, targetMembershipSnap] = await Promise.all([
      tx.get(actorMembershipRef),
      tx.get(targetMembershipRef),
    ]);
    if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');
    if (!targetMembershipSnap.exists()) throw new Error('Target is not in a guild.');

    const actorMembership = actorMembershipSnap.data();
    const targetMembership = targetMembershipSnap.data();
    const guildId = typeof actorMembership.guildId === 'string' ? actorMembership.guildId : '';
    const actorRank = typeof actorMembership.rank === 'string' ? actorMembership.rank : 'member';
    const targetGuildId = typeof targetMembership.guildId === 'string' ? targetMembership.guildId : '';
    if (!guildId || guildId !== targetGuildId) throw new Error('Target is not in your guild.');
    if (actorRank !== 'leader') throw new Error('Only leader can kick members.');

    const guildRef = doc(db, GUILD_COLLECTION, guildId);
    const targetMemberRef = doc(db, GUILD_COLLECTION, guildId, 'members', targetUid);
    const guildSnap = await tx.get(guildRef);
    if (!guildSnap.exists()) throw new Error('Guild not found.');
    const guild = guildSnap.data();

    const targetRank = typeof targetMembership.rank === 'string' ? targetMembership.rank : 'member';
    if (targetRank === 'leader') throw new Error('Cannot kick the leader.');

    const memberCount = typeof guild.memberCount === 'number' ? guild.memberCount : 1;
    const nextCount = Math.max(1, memberCount - 1);
    const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';

    tx.delete(targetMemberRef);
    tx.delete(targetMembershipRef);
    tx.set(guildRef, { memberCount: nextCount, updatedAt: now }, { merge: true });
    if (normalizedName) {
      tx.set(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName), { memberCount: nextCount, updatedAt: now }, { merge: true });
    }
  });
}

export async function setMemberRank(input: { actorUid: string; targetUid: string; rank: 'officer' | 'member' }): Promise<void> {
  const db = requireDb();
  const actorUid = input.actorUid.trim();
  const targetUid = input.targetUid.trim();
  if (!actorUid || !targetUid) throw new Error('Missing rank parameters.');
  if (actorUid === targetUid) throw new Error('Cannot change your own rank here.');

  const actorMembershipRef = doc(db, USER_GUILD_COLLECTION, actorUid);
  const targetMembershipRef = doc(db, USER_GUILD_COLLECTION, targetUid);

  await runTransaction(db, async tx => {
    const [actorMembershipSnap, targetMembershipSnap] = await Promise.all([
      tx.get(actorMembershipRef),
      tx.get(targetMembershipRef),
    ]);
    if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');
    if (!targetMembershipSnap.exists()) throw new Error('Target is not in a guild.');

    const actorMembership = actorMembershipSnap.data();
    const targetMembership = targetMembershipSnap.data();
    const guildId = typeof actorMembership.guildId === 'string' ? actorMembership.guildId : '';
    const actorRank = typeof actorMembership.rank === 'string' ? actorMembership.rank : 'member';
    const targetGuildId = typeof targetMembership.guildId === 'string' ? targetMembership.guildId : '';
    if (!guildId || guildId !== targetGuildId) throw new Error('Target is not in your guild.');
    if (actorRank !== 'leader') throw new Error('Only leader can change member rank.');

    const targetMemberRef = doc(db, GUILD_COLLECTION, guildId, 'members', targetUid);
    const targetMemberSnap = await tx.get(targetMemberRef);
    if (!targetMemberSnap.exists()) throw new Error('Target member not found.');

    tx.set(targetMemberRef, { rank: input.rank }, { merge: true });
    tx.set(targetMembershipRef, { rank: input.rank }, { merge: true });
  });
}

export async function transferGuildLeadership(input: { actorUid: string; newLeaderUid: string }): Promise<void> {
  const db = requireDb();
  const actorUid = input.actorUid.trim();
  const newLeaderUid = input.newLeaderUid.trim();
  if (!actorUid || !newLeaderUid) throw new Error('Missing leadership transfer parameters.');
  if (actorUid === newLeaderUid) throw new Error('You are already the leader.');
  const now = Date.now();

  const actorMembershipRef = doc(db, USER_GUILD_COLLECTION, actorUid);
  const newLeaderMembershipRef = doc(db, USER_GUILD_COLLECTION, newLeaderUid);

  await runTransaction(db, async tx => {
    const [actorMembershipSnap, newLeaderMembershipSnap] = await Promise.all([
      tx.get(actorMembershipRef),
      tx.get(newLeaderMembershipRef),
    ]);
    if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');
    if (!newLeaderMembershipSnap.exists()) throw new Error('Target is not in a guild.');

    const actorMembership = actorMembershipSnap.data();
    const newLeaderMembership = newLeaderMembershipSnap.data();
    const guildId = typeof actorMembership.guildId === 'string' ? actorMembership.guildId : '';
    const actorRank = typeof actorMembership.rank === 'string' ? actorMembership.rank : 'member';
    const newLeaderGuildId = typeof newLeaderMembership.guildId === 'string' ? newLeaderMembership.guildId : '';

    if (!guildId || guildId !== newLeaderGuildId) throw new Error('Target is not in your guild.');
    if (actorRank !== 'leader') throw new Error('Only current leader can transfer leadership.');

    const guildRef = doc(db, GUILD_COLLECTION, guildId);
    const actorMemberRef = doc(db, GUILD_COLLECTION, guildId, 'members', actorUid);
    const newLeaderMemberRef = doc(db, GUILD_COLLECTION, guildId, 'members', newLeaderUid);

    const [guildSnap, newLeaderMemberSnap] = await Promise.all([
      tx.get(guildRef),
      tx.get(newLeaderMemberRef),
    ]);
    if (!guildSnap.exists()) throw new Error('Guild not found.');
    if (!newLeaderMemberSnap.exists()) throw new Error('Target member not found.');

    const guild = guildSnap.data();
    const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';
    const newLeaderMember = newLeaderMemberSnap.data();
    const newLeaderName = typeof newLeaderMember.displayName === 'string' ? newLeaderMember.displayName : 'Leader';

    tx.set(newLeaderMemberRef, { rank: 'leader' }, { merge: true });
    tx.set(actorMemberRef, { rank: 'officer' }, { merge: true });
    tx.set(newLeaderMembershipRef, { rank: 'leader' }, { merge: true });
    tx.set(actorMembershipRef, { rank: 'officer' }, { merge: true });
    tx.set(guildRef, {
      leaderId: newLeaderUid,
      leaderName: newLeaderName,
      updatedAt: now,
    }, { merge: true });

    if (normalizedName) {
      tx.set(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName), {
        leaderId: newLeaderUid,
        leaderName: newLeaderName,
        updatedAt: now,
      }, { merge: true });
    }
  });
}

export async function disbandGuild(input: { actorUid: string }): Promise<void> {
  const db = requireDb();
  const actorUid = input.actorUid.trim();
  if (!actorUid) throw new Error('Missing disband parameters.');

  const actorMembershipSnap = await getDoc(doc(db, USER_GUILD_COLLECTION, actorUid));
  if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');
  const membership = actorMembershipSnap.data();
  const guildId = typeof membership.guildId === 'string' ? membership.guildId : '';
  const rank = typeof membership.rank === 'string' ? membership.rank : 'member';
  if (!guildId) throw new Error('Guild data invalid.');
  if (rank !== 'leader') throw new Error('Only guild leader can disband.');

  const guildRef = doc(db, GUILD_COLLECTION, guildId);
  const guildSnap = await getDoc(guildRef);
  if (!guildSnap.exists()) {
    await deleteDoc(doc(db, USER_GUILD_COLLECTION, actorUid));
    return;
  }

  const guild = guildSnap.data() as Record<string, unknown>;
  const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';
  const [memberSnaps, eventSnaps, chatSnaps, treasuryLedgerSnaps] = await Promise.all([
    getDocs(collection(db, GUILD_COLLECTION, guildId, 'members')),
    getDocs(collection(db, GUILD_COLLECTION, guildId, 'events')),
    getDocs(query(collection(db, GUILD_COLLECTION, guildId, 'chat'), limit(300))),
    getDocs(query(collection(db, GUILD_COLLECTION, guildId, GUILD_TREASURY_LEDGER_COLLECTION), limit(300))),
  ]);

  const memberUids = memberSnaps.docs.map(s => s.id);
  const chunkSize = 200;
  for (let i = 0; i < memberUids.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = memberUids.slice(i, i + chunkSize);
    chunk.forEach(uid => {
      batch.delete(doc(db, USER_GUILD_COLLECTION, uid));
      batch.delete(doc(db, GUILD_COLLECTION, guildId, 'members', uid));
    });
    await batch.commit();
  }

  for (let i = 0; i < eventSnaps.docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = eventSnaps.docs.slice(i, i + chunkSize);
    chunk.forEach(eventDoc => batch.delete(eventDoc.ref));
    await batch.commit();
  }

  for (let i = 0; i < chatSnaps.docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = chatSnaps.docs.slice(i, i + chunkSize);
    chunk.forEach(chatDoc => batch.delete(chatDoc.ref));
    await batch.commit();
  }

  for (let i = 0; i < treasuryLedgerSnaps.docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = treasuryLedgerSnaps.docs.slice(i, i + chunkSize);
    chunk.forEach(entryDoc => batch.delete(entryDoc.ref));
    await batch.commit();
  }

  const bossRef = doc(db, GUILD_COLLECTION, guildId, 'boss', 'active');
  const treasuryStateRef = doc(db, GUILD_COLLECTION, guildId, GUILD_TREASURY_STATE_COLLECTION, 'active');
  const finalBatch = writeBatch(db);
  finalBatch.delete(bossRef);
  finalBatch.delete(treasuryStateRef);
  if (normalizedName) finalBatch.delete(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName));
  finalBatch.delete(guildRef);
  await finalBatch.commit();
}

export async function ensureActiveBoss(uid: string): Promise<GuildBossState> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(uid);
  if (!guildId) throw new Error('You are not in a guild.');

  const guildRef = doc(db, GUILD_COLLECTION, guildId);
  const bossRef = doc(db, GUILD_COLLECTION, guildId, 'boss', 'active');
  const now = Date.now();

  return runTransaction(db, async tx => {
    const [guildSnap, bossSnap] = await Promise.all([tx.get(guildRef), tx.get(bossRef)]);
    if (!guildSnap.exists()) throw new Error('Guild not found.');

    const guild = guildSnap.data();
    const tier = Math.max(1, Math.floor((typeof guild.level === 'number' ? guild.level : 1)));
    const maxHp = bossHpForTier(tier);

    if (bossSnap.exists()) {
      const bossData = bossSnap.data();
      const status = (bossData.status === 'defeated' || bossData.status === 'expired') ? bossData.status : 'active';
      const expiresAt = typeof bossData.expiresAt === 'number' ? bossData.expiresAt : now;
      if (status === 'active' && expiresAt > now) {
        return {
          bossId: 'active',
          name: typeof bossData.name === 'string' ? bossData.name : pickBossName(tier),
          tier: typeof bossData.tier === 'number' ? bossData.tier : tier,
          maxHp: typeof bossData.maxHp === 'number' ? bossData.maxHp : maxHp,
          currentHp: typeof bossData.currentHp === 'number' ? bossData.currentHp : maxHp,
          status: 'active',
          startedAt: typeof bossData.startedAt === 'number' ? bossData.startedAt : now,
          expiresAt,
          participantUids: Array.isArray(bossData.participantUids) ? bossData.participantUids.filter(v => typeof v === 'string') as string[] : [],
        };
      }
    }

    const nextBoss: GuildBossState = {
      bossId: 'active',
      name: pickBossName(tier),
      tier,
      maxHp,
      currentHp: maxHp,
      status: 'active',
      startedAt: now,
      expiresAt: now + BOSS_DURATION_MS,
      participantUids: [],
    };

    tx.set(bossRef, {
      ...nextBoss,
      updatedAt: now,
    });

    return nextBoss;
  });
}

export async function attackBoss(input: { uid: string; displayName: string; dps: number }): Promise<{ dealt: number; boss: GuildBossState; rewardGranted: boolean }> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(input.uid);
  if (!guildId) throw new Error('You are not in a guild.');

  const now = Date.now();
  const memberRef = doc(db, GUILD_COLLECTION, guildId, 'members', input.uid);
  const bossRef = doc(db, GUILD_COLLECTION, guildId, 'boss', 'active');
  // Cap DPS to prevent inflated client values (1 billion ceiling)
  const MAX_ALLOWED_DPS = 1_000_000_000;
  const safeDps = Math.min(MAX_ALLOWED_DPS, Math.max(1, Math.floor(input.dps || 1)));
  const strikeDamage = safeDps * 30;

  const txResult = await runTransaction<{ dealt: number; rewardGranted: boolean; rewardAmount: number; boss: GuildBossState }>(db, async tx => {
    const [memberSnap, bossSnap] = await Promise.all([tx.get(memberRef), tx.get(bossRef)]);
    if (!memberSnap.exists()) throw new Error('Guild membership not found.');
    if (!bossSnap.exists()) throw new Error('No active boss.');

    const memberData = memberSnap.data();
    const bossData = bossSnap.data();
    const bossStatus = bossData.status === 'defeated' || bossData.status === 'expired' ? bossData.status : 'active';
    const expiresAt = typeof bossData.expiresAt === 'number' ? bossData.expiresAt : 0;

    if (bossStatus !== 'active' || expiresAt <= now) {
      throw new Error('Boss is not active.');
    }

    const lastAttackAt = typeof memberData.lastBossAttackAt === 'number' ? memberData.lastBossAttackAt : 0;
    if (now - lastAttackAt < BOSS_ATTACK_COOLDOWN_MS) {
      const minutesLeft = Math.ceil((BOSS_ATTACK_COOLDOWN_MS - (now - lastAttackAt)) / 60_000);
      throw new Error(`Attack cooldown active (${minutesLeft}m remaining).`);
    }

    const currentHp = Math.max(0, typeof bossData.currentHp === 'number' ? bossData.currentHp : 0);
    const maxHp = Math.max(1, typeof bossData.maxHp === 'number' ? bossData.maxHp : 1);
    // Clamp strike damage: cannot exceed remaining HP (prevents inflated contribution)
    const effectiveDamage = Math.min(strikeDamage, currentHp);
    const nextHp = Math.max(0, currentHp - effectiveDamage);
    const participantUids = Array.isArray(bossData.participantUids)
      ? [...new Set((bossData.participantUids as unknown[]).filter(v => typeof v === 'string') as string[]) ]
      : [];
    if (!participantUids.includes(input.uid)) participantUids.push(input.uid);

    tx.set(memberRef, {
      lastBossAttackAt: now,
      guildContribution: (typeof memberData.guildContribution === 'number' ? memberData.guildContribution : 0) + effectiveDamage,
      displayName: input.displayName.trim().slice(0, 24) || memberData.displayName || 'Member',
    }, { merge: true });

    const defeated = nextHp <= 0;
    tx.set(bossRef, {
      currentHp: nextHp,
      status: defeated ? 'defeated' : 'active',
      participantUids,
      defeatedAt: defeated ? now : null,
      updatedAt: now,
    }, { merge: true });

    return {
      dealt: Math.min(strikeDamage, currentHp),
      rewardGranted: defeated,
      rewardAmount: Math.max(100, Math.floor(maxHp / 5_000_000_000)),
      boss: {
        bossId: 'active',
        name: typeof bossData.name === 'string' ? bossData.name : 'Guild Boss',
        tier: typeof bossData.tier === 'number' ? bossData.tier : 1,
        maxHp,
        currentHp: nextHp,
        status: defeated ? 'defeated' : 'active',
        startedAt: typeof bossData.startedAt === 'number' ? bossData.startedAt : now,
        expiresAt,
        participantUids,
      },
    };
  });

  if (txResult.rewardGranted) {
    const membersCol = collection(db, GUILD_COLLECTION, guildId, 'members');
    const memberSnaps = await getDocs(query(membersCol, limit(200)));
    await Promise.all(memberSnaps.docs.map(async memberSnap => {
      const memberUid = memberSnap.id;
      const mailRef = doc(db, 'playerMail', memberUid, 'messages', `guild_boss_${guildId}_${now}_${memberUid.slice(0, 6)}`);
      await setDoc(mailRef, {
        subject: 'Guild Boss Defeated',
        message: `Your guild defeated ${txResult.boss.name}!`,
        from: 'Guild Command',
        sentAt: now,
        kind: 'guild_reward',
        guildId,
        attachments: {
          shards: txResult.rewardAmount,
          gold: txResult.rewardAmount * 1000,
          diamonds: 0,
          tears: Math.max(1, Math.floor(txResult.rewardAmount / 50)),
          essence: Math.max(1, Math.floor(txResult.rewardAmount / 4)),
        },
      });
    }));
  }

  return {
    dealt: txResult.dealt,
    rewardGranted: txResult.rewardGranted,
    boss: txResult.boss,
  };
}

export async function fetchGuildInfo(uid: string): Promise<GuildSummary | null> {
  const db = requireDb();
  const userGuildSnap = await getDoc(doc(db, USER_GUILD_COLLECTION, uid));
  if (!userGuildSnap.exists()) return null;
  const membership = userGuildSnap.data();
  const guildId = typeof membership.guildId === 'string' ? membership.guildId : '';
  if (!guildId) return null;

  const guildSnap = await getDoc(doc(db, GUILD_COLLECTION, guildId));
  if (!guildSnap.exists()) return null;
  return parseGuildSummary(guildId, guildSnap.data() as Record<string, unknown>);
}

export function subscribeGuildMembership(
  uid: string,
  onGuildChange: (guild: GuildSummary | null) => void,
  onError?: (error: Error) => void,
): () => void {
  const db = getFirebaseFirestore();
  if (!db || !uid) return () => {};

  let active = true;
  const unsubscribe = onSnapshot(
    doc(db, USER_GUILD_COLLECTION, uid),
    () => {
      void fetchGuildInfo(uid)
        .then(guild => {
          if (!active) return;
          onGuildChange(guild);
        })
        .catch(err => {
          if (!active || !onError) return;
          if (err instanceof Error) onError(err);
          else onError(new Error('Guild membership sync failed.'));
        });
    },
    err => {
      if (!active || !onError) return;
      onError(err instanceof Error ? err : new Error('Guild membership listener failed.'));
    },
  );

  return () => {
    active = false;
    unsubscribe();
  };
}

export async function updateGuildDescription(input: { uid: string; description: string }): Promise<void> {
  const db = requireDb();
  const actorUid = input.uid.trim();
  if (!actorUid) throw new Error('Missing user id.');

  const description = input.description.trim().slice(0, 140);
  const actorMembershipRef = doc(db, USER_GUILD_COLLECTION, actorUid);
  const now = Date.now();

  await runTransaction(db, async tx => {
    const actorMembershipSnap = await tx.get(actorMembershipRef);
    if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');

    const actorMembership = actorMembershipSnap.data();
    const guildId = typeof actorMembership.guildId === 'string' ? actorMembership.guildId : '';
    const actorRank = typeof actorMembership.rank === 'string' ? actorMembership.rank : 'member';
    if (!guildId) throw new Error('Guild data invalid.');
    if (actorRank !== 'leader') throw new Error('Only guild leader can edit description.');

    const guildRef = doc(db, GUILD_COLLECTION, guildId);
    const guildSnap = await tx.get(guildRef);
    if (!guildSnap.exists()) throw new Error('Guild not found.');

    tx.set(guildRef, { description, updatedAt: now }, { merge: true });
  });
}

export async function updateGuildSettings(input: {
  uid: string;
  minPeakProgressToJoin: number;
  isPublic: boolean;
}): Promise<void> {
  const db = requireDb();
  const actorUid = input.uid.trim();
  if (!actorUid) throw new Error('Missing user id.');

  const minPeakProgressToJoin = Math.max(1, Math.min(999_999, Math.floor(input.minPeakProgressToJoin || 1)));
  const isPublic = input.isPublic !== false;
  const actorMembershipRef = doc(db, USER_GUILD_COLLECTION, actorUid);
  const now = Date.now();

  await runTransaction(db, async tx => {
    const actorMembershipSnap = await tx.get(actorMembershipRef);
    if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');

    const actorMembership = actorMembershipSnap.data();
    const guildId = typeof actorMembership.guildId === 'string' ? actorMembership.guildId : '';
    const actorRank = typeof actorMembership.rank === 'string' ? actorMembership.rank : 'member';
    if (!guildId) throw new Error('Guild data invalid.');
    if (actorRank !== 'leader') throw new Error('Only guild leader can edit join requirements.');

    const guildRef = doc(db, GUILD_COLLECTION, guildId);
    const guildSnap = await tx.get(guildRef);
    if (!guildSnap.exists()) throw new Error('Guild not found.');

    const guild = guildSnap.data();
    const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';

    tx.set(guildRef, {
      minPeakProgressToJoin,
      minLevelToJoin: minPeakProgressToJoin,
      isPublic,
      updatedAt: now,
    }, { merge: true });

    if (normalizedName) {
      tx.set(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName), { isPublic, updatedAt: now }, { merge: true });
    }
  });
}

export async function sendGuildInvite(input: {
  actorUid: string;
  targetUid: string;
  actorDisplayName: string;
}): Promise<void> {
  const db = requireDb();
  const actorUid = input.actorUid.trim();
  const targetUid = input.targetUid.trim();
  const actorDisplayName = input.actorDisplayName.trim().slice(0, 24) || 'Leader';
  if (!actorUid || !targetUid) throw new Error('Missing invite parameters.');
  if (actorUid === targetUid) throw new Error('Cannot invite yourself.');

  const now = Date.now();
  const expiresAt = now + GUILD_INVITE_TTL_MS;
  const actorMembershipRef = doc(db, USER_GUILD_COLLECTION, actorUid);
  const targetMembershipRef = doc(db, USER_GUILD_COLLECTION, targetUid);

  await runTransaction(db, async tx => {
    const [actorMembershipSnap, targetMembershipSnap] = await Promise.all([
      tx.get(actorMembershipRef),
      tx.get(targetMembershipRef),
    ]);

    if (!actorMembershipSnap.exists()) throw new Error('You are not in a guild.');
    if (targetMembershipSnap.exists()) throw new Error('Player is already in a guild.');

    const actorMembership = actorMembershipSnap.data();
    const guildId = typeof actorMembership.guildId === 'string' ? actorMembership.guildId : '';
    const actorRank = typeof actorMembership.rank === 'string' ? actorMembership.rank : 'member';
    if (!guildId) throw new Error('Guild data invalid.');
    if (actorRank !== 'leader' && actorRank !== 'officer') throw new Error('Only leader or officer can invite players.');

    const guildRef = doc(db, GUILD_COLLECTION, guildId);
    const guildSnap = await tx.get(guildRef);
    if (!guildSnap.exists()) throw new Error('Guild not found.');
    const guild = guildSnap.data();

    const memberCount = typeof guild.memberCount === 'number' ? guild.memberCount : 0;
    const maxMembers = typeof guild.maxMembers === 'number' ? guild.maxMembers : 30;
    if (memberCount >= maxMembers) throw new Error('Guild is full.');

    const inviteRef = doc(db, GUILD_INVITES_COLLECTION, targetUid, 'incoming', guildId);
    const existingInviteSnap = await tx.get(inviteRef);
    if (existingInviteSnap.exists()) {
      const existing = existingInviteSnap.data();
      const existingStatus = typeof existing.status === 'string' ? existing.status : 'pending';
      const existingExpiresAt = typeof existing.expiresAt === 'number' ? existing.expiresAt : 0;
      if (existingStatus === 'pending' && existingExpiresAt > now) {
        throw new Error('Invite already pending for this player.');
      }
    }

    tx.set(inviteRef, {
      guildId,
      guildName: typeof guild.name === 'string' ? guild.name : 'Guild',
      guildTag: typeof guild.tag === 'string' ? guild.tag : 'TAG',
      inviterUid: actorUid,
      inviterName: actorDisplayName,
      invitedUid: targetUid,
      minPeakProgressToJoin: typeof guild.minPeakProgressToJoin === 'number'
        ? Math.max(1, Math.floor(guild.minPeakProgressToJoin))
        : typeof guild.minLevelToJoin === 'number'
          ? Math.max(1, Math.floor(guild.minLevelToJoin))
          : 1,
      minLevelToJoin: typeof guild.minPeakProgressToJoin === 'number'
        ? Math.max(1, Math.floor(guild.minPeakProgressToJoin))
        : typeof guild.minLevelToJoin === 'number'
          ? Math.max(1, Math.floor(guild.minLevelToJoin))
          : 1,
      isPublic: guild.isPublic !== false,
      status: 'pending',
      createdAt: now,
      expiresAt,
      updatedAt: now,
      respondedAt: null,
    }, { merge: true });
  });
}

export async function fetchGuildInvites(uid: string): Promise<GuildInvite[]> {
  const db = requireDb();
  const cleanUid = uid.trim();
  if (!cleanUid) return [];
  const now = Date.now();

  const snap = await getDocs(query(
    collection(db, GUILD_INVITES_COLLECTION, cleanUid, 'incoming'),
    orderBy('createdAt', 'desc'),
    limit(25),
  ));

  const invites = snap.docs
    .map(docSnap => parseGuildInvite(docSnap.id, docSnap.data() as Record<string, unknown>))
    .map(invite => {
      if (invite.status === 'pending' && invite.expiresAt > 0 && invite.expiresAt <= now) {
        return { ...invite, status: 'expired' as const };
      }
      return invite;
    });

  return invites;
}

export async function respondToGuildInvite(input: {
  uid: string;
  inviteId: string;
  action: 'accept' | 'decline';
  displayName: string;
  playerPeakProgress: number;
}): Promise<void> {
  const db = requireDb();
  const uid = input.uid.trim();
  const inviteId = input.inviteId.trim();
  const displayName = input.displayName.trim().slice(0, 24) || 'Member';
  const now = Date.now();
  if (!uid || !inviteId) throw new Error('Missing invite response parameters.');

  const inviteRef = doc(db, GUILD_INVITES_COLLECTION, uid, 'incoming', inviteId);
  const userGuildRef = doc(db, USER_GUILD_COLLECTION, uid);

  await runTransaction(db, async tx => {
    const [inviteSnap, existingMembershipSnap] = await Promise.all([
      tx.get(inviteRef),
      tx.get(userGuildRef),
    ]);

    if (!inviteSnap.exists()) throw new Error('Invite not found.');
    if (existingMembershipSnap.exists()) throw new Error('You are already in a guild.');

    const invite = parseGuildInvite(inviteSnap.id, inviteSnap.data() as Record<string, unknown>);
    if (invite.invitedUid !== uid) throw new Error('Invite target mismatch.');
    if (invite.status !== 'pending') throw new Error('Invite already processed.');
    if (invite.expiresAt <= now) {
      tx.set(inviteRef, { status: 'expired', respondedAt: now, updatedAt: now }, { merge: true });
      throw new Error('Invite expired.');
    }

    if (input.action === 'decline') {
      tx.set(inviteRef, { status: 'declined', respondedAt: now, updatedAt: now }, { merge: true });
      return;
    }

    const guildRef = doc(db, GUILD_COLLECTION, invite.guildId);
    const guildSnap = await tx.get(guildRef);
    if (!guildSnap.exists()) throw new Error('Guild no longer exists.');
    const guild = guildSnap.data();

    const memberCount = typeof guild.memberCount === 'number' ? guild.memberCount : 0;
    const maxMembers = typeof guild.maxMembers === 'number' ? guild.maxMembers : 30;
    const minPeakProgressToJoin = typeof guild.minPeakProgressToJoin === 'number'
      ? Math.max(1, Math.floor(guild.minPeakProgressToJoin))
      : typeof guild.minLevelToJoin === 'number'
        ? Math.max(1, Math.floor(guild.minLevelToJoin))
        : 1;
    if (memberCount >= maxMembers) throw new Error('Guild is full.');
    if (Math.max(1, Math.floor(input.playerPeakProgress || 1)) < minPeakProgressToJoin) {
      throw new Error(`Peak progress ${minPeakProgressToJoin}+ required to join.`);
    }

    const memberRef = doc(db, GUILD_COLLECTION, invite.guildId, 'members', uid);
    const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';
    const nextCount = memberCount + 1;

    tx.set(memberRef, {
      displayName,
      rank: 'member',
      joinedAt: now,
      guildContribution: 0,
      lastBossAttackAt: 0,
    });

    tx.set(userGuildRef, {
      guildId: invite.guildId,
      guildName: typeof guild.name === 'string' ? guild.name : invite.guildName,
      rank: 'member',
      joinedAt: now,
    });

    tx.set(guildRef, { memberCount: nextCount, updatedAt: now }, { merge: true });
    if (normalizedName) {
      tx.set(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName), { memberCount: nextCount, updatedAt: now }, { merge: true });
    }

    tx.set(inviteRef, { status: 'accepted', respondedAt: now, updatedAt: now }, { merge: true });
  });
}

export async function fetchGuildMembers(guildId: string): Promise<GuildMember[]> {
  const db = requireDb();
  const snap = await getDocs(collection(db, GUILD_COLLECTION, guildId, 'members'));
  return snap.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      uid: docSnap.id,
      displayName: typeof data.displayName === 'string' ? data.displayName : 'Member',
      rank: data.rank === 'leader' || data.rank === 'officer' ? data.rank : 'member',
      joinedAt: typeof data.joinedAt === 'number' ? data.joinedAt : 0,
      guildContribution: typeof data.guildContribution === 'number' ? data.guildContribution : 0,
      lastBossAttackAt: typeof data.lastBossAttackAt === 'number' ? data.lastBossAttackAt : 0,
    } satisfies GuildMember;
  }).sort((a, b) => {
    const rankWeight = (rank: GuildMemberRank) => rank === 'leader' ? 3 : rank === 'officer' ? 2 : 1;
    return rankWeight(b.rank) - rankWeight(a.rank) || a.displayName.localeCompare(b.displayName);
  });
}

export async function fetchActiveBoss(uid: string): Promise<GuildBossState | null> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(uid);
  if (!guildId) return null;
  const bossSnap = await getDoc(doc(db, GUILD_COLLECTION, guildId, 'boss', 'active'));
  if (!bossSnap.exists()) return null;
  const data = bossSnap.data();
  return {
    bossId: 'active',
    name: typeof data.name === 'string' ? data.name : 'Guild Boss',
    tier: typeof data.tier === 'number' ? data.tier : 1,
    maxHp: typeof data.maxHp === 'number' ? data.maxHp : 1,
    currentHp: typeof data.currentHp === 'number' ? data.currentHp : 1,
    status: data.status === 'defeated' || data.status === 'expired' ? data.status : 'active',
    startedAt: typeof data.startedAt === 'number' ? data.startedAt : 0,
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
    participantUids: Array.isArray(data.participantUids) ? data.participantUids.filter(v => typeof v === 'string') as string[] : [],
  };
}

export async function startEvent(input: { uid: string; type: 'war' | 'expedition'; forceRestart?: boolean }): Promise<GuildEventState> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(input.uid);
  if (!guildId) throw new Error('You are not in a guild.');
  const guildSnap = await getDoc(doc(db, GUILD_COLLECTION, guildId));
  if (!guildSnap.exists()) throw new Error('Guild not found.');
  const guild = guildSnap.data();
  if (guild.leaderId !== input.uid) throw new Error('Only guild leader can start events.');

  const now = Date.now();
  const eventId = `${input.type}_active`;
  const endsAt = now + (input.type === 'war' ? WAR_DURATION_MS : EXPEDITION_DURATION_MS);
  const eventRef = doc(db, GUILD_COLLECTION, guildId, 'events', eventId);

  const existingEventSnap = await getDoc(eventRef);
  if (existingEventSnap.exists()) {
    const existing = existingEventSnap.data();
    const isActive = existing.status === 'active' && typeof existing.endsAt === 'number' && existing.endsAt > now;
    if (isActive && !input.forceRestart) {
      throw new Error(`Active ${input.type} event in progress. Restarting will forfeit current progress.`);
    }
  }

  const details = input.type === 'war'
    ? { totalDamage: 0, targetDamage: 2_000_000_000_000 }
    : { totalKills: 0, targetKills: 250_000 };

  await setDoc(eventRef, {
    eventId,
    type: input.type,
    status: 'active',
    startedAt: now,
    endsAt,
    details,
    updatedAt: now,
  }, { merge: true });

  return {
    eventId,
    type: input.type,
    status: 'active',
    startedAt: now,
    endsAt,
    details,
  };
}

export async function fetchGuildEvents(uid: string): Promise<GuildEventState[]> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(uid);
  if (!guildId) return [];
  const snap = await getDocs(collection(db, GUILD_COLLECTION, guildId, 'events'));
  return snap.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      eventId: typeof data.eventId === 'string' ? data.eventId : docSnap.id,
      type: data.type === 'war' ? 'war' : 'expedition',
      status: data.status === 'completed' || data.status === 'expired' ? data.status : 'active',
      startedAt: typeof data.startedAt === 'number' ? data.startedAt : 0,
      endsAt: typeof data.endsAt === 'number' ? data.endsAt : 0,
      details: data.details && typeof data.details === 'object' ? data.details as Record<string, unknown> : {},
    } satisfies GuildEventState;
  }).sort((a, b) => b.startedAt - a.startedAt);
}

export async function fetchGuildEventContributors(uid: string, eventId: string, maxRows = 20): Promise<GuildEventContributor[]> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(uid);
  if (!guildId) return [];
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) return [];

  const snap = await getDocs(query(
    collection(db, GUILD_COLLECTION, guildId, 'events', normalizedEventId, 'contrib'),
    limit(Math.max(1, Math.min(100, Math.floor(maxRows || 20)))),
  ));

  return snap.docs
    .map(docSnap => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        totalContributed: typeof data.totalContributed === 'number' ? data.totalContributed : 0,
        lastContribution: typeof data.lastContribution === 'number' ? data.lastContribution : 0,
        lastContributedAt: typeof data.lastContributedAt === 'number' ? data.lastContributedAt : 0,
      } satisfies GuildEventContributor;
    })
    .sort((a, b) => b.totalContributed - a.totalContributed || b.lastContributedAt - a.lastContributedAt);
}

export async function contributeToGuildEvent(input: { uid: string; eventId: string; dps?: number; kills?: number }): Promise<GuildEventState> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(input.uid);
  if (!guildId) throw new Error('You are not in a guild.');
  const eventRef = doc(db, GUILD_COLLECTION, guildId, 'events', input.eventId);
  const contribRef = doc(db, GUILD_COLLECTION, guildId, 'events', input.eventId, 'contrib', input.uid);
  const now = Date.now();

  const result = await runTransaction<{ event: GuildEventState; shouldReward: boolean; rewardAmount: number; guildId: string }>(db, async tx => {
    const [eventSnap, contribSnap] = await Promise.all([tx.get(eventRef), tx.get(contribRef)]);
    if (!eventSnap.exists()) throw new Error('Event not found.');
    const data = eventSnap.data();
    if (data.status !== 'active') throw new Error('Event is not active.');
    if (typeof data.endsAt === 'number' && data.endsAt <= now) throw new Error('Event expired.');

    const lastContributedAt = contribSnap.exists() && typeof contribSnap.data().lastContributedAt === 'number'
      ? contribSnap.data().lastContributedAt
      : 0;
    if (now - lastContributedAt < EVENT_CONTRIBUTION_COOLDOWN_MS) {
      const secondsLeft = Math.ceil((EVENT_CONTRIBUTION_COOLDOWN_MS - (now - lastContributedAt)) / 1000);
      throw new Error(`Contribution cooldown active (${secondsLeft}s remaining).`);
    }

    const details = (data.details && typeof data.details === 'object' ? data.details : {}) as Record<string, unknown>;
    let nextDetails: Record<string, unknown> = { ...details };
    let status: 'active' | 'completed' = 'active';
    let rawContribution = 0;

    if (data.type === 'war') {
      const dealt = Math.max(0, Math.floor((input.dps ?? 0) * 30));
      rawContribution = dealt;
      const totalDamage = (typeof details.totalDamage === 'number' ? details.totalDamage : 0) + dealt;
      const targetDamage = typeof details.targetDamage === 'number' ? details.targetDamage : 2_000_000_000_000;
      status = totalDamage >= targetDamage ? 'completed' : 'active';
      nextDetails = { ...details, totalDamage, targetDamage };
    } else {
      const kills = Math.max(0, Math.floor(input.kills ?? 0));
      rawContribution = kills;
      const totalKills = (typeof details.totalKills === 'number' ? details.totalKills : 0) + kills;
      const targetKills = typeof details.targetKills === 'number' ? details.targetKills : 250_000;
      status = totalKills >= targetKills ? 'completed' : 'active';
      nextDetails = { ...details, totalKills, targetKills };
    }

    if (rawContribution <= 0) {
      throw new Error('Contribution amount is too low.');
    }

    const rewardAlreadySent = typeof data.rewardSentAt === 'number' && data.rewardSentAt > 0;
    const shouldReward = status === 'completed' && !rewardAlreadySent;
    tx.set(eventRef, {
      status,
      details: nextDetails,
      updatedAt: now,
      completedAt: status === 'completed' ? now : null,
      rewardSentAt: shouldReward ? now : data.rewardSentAt ?? null,
    }, { merge: true });

    tx.set(contribRef, {
      uid: input.uid,
      totalContributed: (contribSnap.exists() && typeof contribSnap.data().totalContributed === 'number' ? contribSnap.data().totalContributed : 0) + rawContribution,
      lastContribution: rawContribution,
      lastContributedAt: now,
      updatedAt: now,
    }, { merge: true });

    return {
      event: {
        eventId: input.eventId,
        type: data.type === 'war' ? 'war' : 'expedition',
        status,
        startedAt: typeof data.startedAt === 'number' ? data.startedAt : now,
        endsAt: typeof data.endsAt === 'number' ? data.endsAt : now,
        details: nextDetails,
      },
      shouldReward,
      rewardAmount: data.type === 'war' ? 200 : 120,
      guildId,
    };
  });

  if (result.shouldReward) {
    const members = await getDocs(query(collection(db, GUILD_COLLECTION, result.guildId, 'members'), limit(200)));
    await Promise.all(members.docs.map(async member => {
      const memberUid = member.id;
      const mailRef = doc(db, 'playerMail', memberUid, 'messages', `guild_event_${result.event.eventId}_${memberUid}`);
      await setDoc(mailRef, {
        subject: `Guild ${result.event.type === 'war' ? 'War' : 'Expedition'} Complete`,
        message: `Your guild completed the ${result.event.type} event. Rewards enclosed.`,
        from: 'Guild Command',
        sentAt: now,
        kind: 'guild_reward',
        guildId: result.guildId,
        attachments: {
          shards: result.rewardAmount,
          gold: result.rewardAmount * 1000,
          diamonds: 0,
          tears: Math.max(1, Math.floor(result.rewardAmount / 60)),
          essence: Math.max(1, Math.floor(result.rewardAmount / 5)),
        },
      }, { merge: true });
    }));
  }

  return result.event;
}

export async function sendGuildChatMessage(input: { uid: string; displayName: string; text: string }): Promise<void> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(input.uid);
  if (!guildId) throw new Error('You are not in a guild.');
  const now = Date.now();
  const text = sanitizeMessage(input.text);
  if (!text) return;

  const rateRef = doc(db, GUILD_CHAT_RATE_LIMIT_COLLECTION, input.uid);
  const chatRef = doc(collection(db, GUILD_COLLECTION, guildId, 'chat'));
  await runTransaction(db, async tx => {
    const rateSnap = await tx.get(rateRef);
    if (rateSnap.exists()) {
      const rateData = rateSnap.data();
      const lastSentAt = typeof rateData.lastSentAt === 'number' ? rateData.lastSentAt : 0;
      if (now - lastSentAt < GUILD_CHAT_COOLDOWN_MS) {
        throw new Error('Guild chat cooldown active. Please wait a moment.');
      }
    }

    tx.set(rateRef, { uid: input.uid, lastSentAt: now, updatedAt: now }, { merge: true });
    tx.set(chatRef, {
      uid: input.uid,
      displayName: input.displayName.trim().slice(0, 24) || 'Member',
      text,
      sentAt: now,
    });
  });
}

export async function fetchGuildChat(uid: string, maxRows = 60): Promise<GuildChatMessage[]> {
  const db = requireDb();
  const guildId = await resolveGuildIdForUser(uid);
  if (!guildId) return [];
  const snap = await getDocs(query(collection(db, GUILD_COLLECTION, guildId, 'chat'), orderBy('sentAt', 'desc'), limit(maxRows)));
  return snap.docs.map(docSnap => {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      uid: typeof data.uid === 'string' ? data.uid : '',
      displayName: typeof data.displayName === 'string' ? data.displayName : 'Member',
      text: typeof data.text === 'string' ? data.text : '',
      sentAt: typeof data.sentAt === 'number' ? data.sentAt : 0,
    } satisfies GuildChatMessage;
  }).filter(r => !!r.uid && !!r.text).sort((a, b) => a.sentAt - b.sentAt);
}

export function subscribeGuildChat(uid: string, onMessages: (messages: GuildChatMessage[]) => void): () => void {
  const db = requireDb();
  const stopNoop = () => {};
  if (!uid) return stopNoop;

  let unsub: (() => void) | null = null;
  void resolveGuildIdForUser(uid).then(guildId => {
    if (!guildId) return;
    unsub = onSnapshot(
      query(collection(db, GUILD_COLLECTION, guildId, 'chat'), orderBy('sentAt', 'desc'), limit(60)),
      snap => {
        const rows = snap.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            uid: typeof data.uid === 'string' ? data.uid : '',
            displayName: typeof data.displayName === 'string' ? data.displayName : 'Member',
            text: typeof data.text === 'string' ? data.text : '',
            sentAt: typeof data.sentAt === 'number' ? data.sentAt : 0,
          } satisfies GuildChatMessage;
        }).filter(r => !!r.uid && !!r.text).sort((a, b) => a.sentAt - b.sentAt);
        onMessages(rows);
      },
    );
  }).catch(() => {});

  return () => {
    if (unsub) unsub();
  };
}

export async function fetchGuildBrowse(searchTerm = ''): Promise<GuildBrowseRow[]> {
  const db = requireDb();
  const normalized = normalizeGuildName(searchTerm);

  const q = normalized
    ? query(
      collection(db, GUILD_LOOKUP_COLLECTION),
      where('normalizedName', '>=', normalized),
      where('normalizedName', '<=', `${normalized}\uf8ff`),
      limit(20),
    )
    : query(collection(db, GUILD_LOOKUP_COLLECTION), orderBy('memberCount', 'desc'), limit(30));

  const snap = await getDocs(q);
  return snap.docs.map(docSnap => {
    const data = docSnap.data() as Record<string, unknown>;
    return {
      guildId: typeof data.guildId === 'string' ? data.guildId : '',
      name: typeof data.displayName === 'string' ? data.displayName : 'Guild',
      tag: typeof data.tag === 'string' ? data.tag : 'TAG',
      leaderName: typeof data.leaderName === 'string' ? data.leaderName : 'Leader',
      memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
      level: typeof data.level === 'number' ? data.level : 1,
      isPublic: data.isPublic !== false,
    } satisfies GuildBrowseRow;
  }).filter(row => !!row.guildId);
}

export async function fetchGuildTreasuryState(uid: string): Promise<GuildTreasuryState> {
  if (!guildTreasuryEnabled()) {
    throw new Error('Guild treasury is disabled for this rollout.');
  }
  const db = requireDb();
  const membership = await resolveGuildMembershipForUser(uid);
  if (!membership) throw new Error('You are not in a guild.');

  const stateRef = doc(db, GUILD_COLLECTION, membership.guildId, GUILD_TREASURY_STATE_COLLECTION, 'active');
  const stateSnap = await getDoc(stateRef);
  if (!stateSnap.exists()) {
    return {
      balance: 0,
      totalDeposited: 0,
      totalWithdrawn: 0,
      dailyWithdrawn: 0,
      dailyWindowStart: startOfCurrentUtcDay(Date.now()),
      updatedAt: 0,
      updatedByUid: '',
    };
  }
  return parseGuildTreasuryState(stateSnap.data() as Record<string, unknown>);
}

export async function fetchGuildTreasuryLedger(uid: string, maxRows = 25): Promise<GuildTreasuryEntry[]> {
  if (!guildTreasuryEnabled()) {
    throw new Error('Guild treasury is disabled for this rollout.');
  }
  const db = requireDb();
  const membership = await resolveGuildMembershipForUser(uid);
  if (!membership) throw new Error('You are not in a guild.');

  const limitRows = Math.max(1, Math.min(80, Math.floor(maxRows || 25)));
  const snap = await getDocs(query(
    collection(db, GUILD_COLLECTION, membership.guildId, GUILD_TREASURY_LEDGER_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(limitRows),
  ));

  return snap.docs.map(entrySnap => {
    const data = entrySnap.data() as Record<string, unknown>;
    return {
      id: entrySnap.id,
      type: data.type === 'withdrawal' ? 'withdrawal' : 'deposit',
      amount: typeof data.amount === 'number' ? Math.max(0, Math.floor(data.amount)) : 0,
      actorUid: typeof data.actorUid === 'string' ? data.actorUid : '',
      actorName: typeof data.actorName === 'string' ? data.actorName : 'Member',
      actorRank: data.actorRank === 'leader' || data.actorRank === 'officer' ? data.actorRank : 'member',
      reason: typeof data.reason === 'string' ? data.reason : '',
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    } satisfies GuildTreasuryEntry;
  }).filter(entry => !!entry.actorUid && entry.amount > 0);
}

export async function transactGuildTreasury(input: {
  uid: string;
  saveSlotId: string;
  displayName: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  reason?: string;
}): Promise<GuildTreasuryTransactionResult> {
  if (!guildTreasuryEnabled()) {
    throw new Error('Guild treasury is disabled for this rollout.');
  }
  const db = requireDb();
  const uid = input.uid.trim();
  const saveSlotId = input.saveSlotId.trim();
  if (!uid) throw new Error('Missing user id.');
  if (!saveSlotId) throw new Error('Missing save slot id.');

  const membership = await resolveGuildMembershipForUser(uid);
  if (!membership) throw new Error('You are not in a guild.');

  const amount = clampTreasuryAmount(input.amount);
  const now = Date.now();
  const dailyWindowStart = startOfCurrentUtcDay(now);
  const actorName = input.displayName.trim().slice(0, 24) || 'Member';
  const reason = (input.reason ?? '').trim().slice(0, 80);

  const stateRef = doc(db, GUILD_COLLECTION, membership.guildId, GUILD_TREASURY_STATE_COLLECTION, 'active');
  const ledgerRef = doc(collection(db, GUILD_COLLECTION, membership.guildId, GUILD_TREASURY_LEDGER_COLLECTION));
  const saveRef = doc(db, 'users', uid, 'saveSlots', saveSlotId);

  return runTransaction(db, async tx => {
    const [stateSnap, saveSnap] = await Promise.all([
      tx.get(stateRef),
      tx.get(saveRef),
    ]);

    if (!saveSnap.exists()) {
      throw new Error('Active save slot not found.');
    }

    const saveData = saveSnap.data() as {
      revision?: unknown;
      payload?: Record<string, unknown>;
      schemaVersion?: unknown;
      saveSlot?: unknown;
    };
    const savePayload = (saveData.payload ?? {}) as Record<string, unknown>;
    const currentPlayerGold = readGoldFromSavePayload(savePayload);

    const state = stateSnap.exists()
      ? parseGuildTreasuryState(stateSnap.data() as Record<string, unknown>)
      : {
        balance: 0,
        totalDeposited: 0,
        totalWithdrawn: 0,
        dailyWithdrawn: 0,
        dailyWindowStart,
        updatedAt: 0,
        updatedByUid: '',
      };

    const withinToday = state.dailyWindowStart === dailyWindowStart;
    const currentDailyWithdrawn = withinToday ? state.dailyWithdrawn : 0;

    if (input.type === 'withdrawal') {
      if (membership.rank === 'member') {
        throw new Error('Only officers and leaders can withdraw from treasury.');
      }
      if (state.balance < amount) {
        throw new Error('Treasury does not have enough balance for this withdrawal.');
      }

      const cap = membership.rank === 'leader'
        ? TREASURY_DAILY_WITHDRAW_CAP_LEADER
        : TREASURY_DAILY_WITHDRAW_CAP_OFFICER;
      if (currentDailyWithdrawn + amount > cap) {
        throw new Error(`Daily withdrawal cap exceeded (${cap.toLocaleString()}).`);
      }
    } else {
      if (currentPlayerGold < amount) {
        throw new Error('Not enough gold to deposit that amount.');
      }
    }

    const nextPlayerGold = input.type === 'deposit'
      ? currentPlayerGold - amount
      : currentPlayerGold + amount;

    const nextState: GuildTreasuryState = input.type === 'deposit'
      ? {
        balance: state.balance + amount,
        totalDeposited: state.totalDeposited + amount,
        totalWithdrawn: state.totalWithdrawn,
        dailyWithdrawn: currentDailyWithdrawn,
        dailyWindowStart,
        updatedAt: now,
        updatedByUid: uid,
      }
      : {
        balance: Math.max(0, state.balance - amount),
        totalDeposited: state.totalDeposited,
        totalWithdrawn: state.totalWithdrawn + amount,
        dailyWithdrawn: currentDailyWithdrawn + amount,
        dailyWindowStart,
        updatedAt: now,
        updatedByUid: uid,
      };

    const nextRevision = typeof saveData.revision === 'number' ? saveData.revision + 1 : 1;
    tx.set(saveRef, {
      revision: nextRevision,
      updatedAt: now,
      schemaVersion: typeof saveData.schemaVersion === 'number' ? saveData.schemaVersion : 1,
      saveSlot: typeof saveData.saveSlot === 'string' ? saveData.saveSlot : saveSlotId,
      payload: {
        ...savePayload,
        gold: nextPlayerGold,
      },
    });

    tx.set(stateRef, nextState, { merge: true });
    tx.set(ledgerRef, {
      type: input.type,
      amount,
      actorUid: uid,
      actorName,
      actorRank: membership.rank,
      reason,
      createdAt: now,
    });

    return {
      treasury: nextState,
      playerGold: nextPlayerGold,
    };
  });
}

export function isGuildTreasuryEnabled(): boolean {
  return guildTreasuryEnabled();
}
