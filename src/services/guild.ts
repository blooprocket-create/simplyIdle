import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

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
  minLevelToJoin: number;
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

export interface GuildBrowseRow {
  guildId: string;
  name: string;
  tag: string;
  leaderName: string;
  memberCount: number;
  level: number;
  isPublic: boolean;
}

const GUILD_COLLECTION = 'guilds';
const GUILD_LOOKUP_COLLECTION = 'guildLookup';
const USER_GUILD_COLLECTION = 'userGuild';

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
    minLevelToJoin: typeof data.minLevelToJoin === 'number' ? data.minLevelToJoin : 1,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
  };
}

export async function createGuild(input: {
  uid: string;
  displayName: string;
  saveSlotId: string;
  guildName: string;
  guildTag: string;
  description?: string;
  minLevelToJoin?: number;
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
      minLevelToJoin: Math.max(1, Math.floor(input.minLevelToJoin ?? 1)),
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
    minLevelToJoin: Math.max(1, Math.floor(input.minLevelToJoin ?? 1)),
    createdAt: now,
  };
}

export async function joinGuild(input: {
  uid: string;
  displayName: string;
  guildId: string;
  playerLevel: number;
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
    const minLevel = typeof guild.minLevelToJoin === 'number' ? guild.minLevelToJoin : 1;

    if (memberCount >= maxMembers) throw new Error('Guild is full.');
    if (input.playerLevel < minLevel) throw new Error(`Level ${minLevel}+ required to join.`);

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

    const normalizedName = typeof guild.normalizedName === 'string' ? guild.normalizedName : '';
    if (normalizedName) {
      tx.set(doc(db, GUILD_LOOKUP_COLLECTION, normalizedName), { memberCount: nextCount, updatedAt: now }, { merge: true });
    }
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
  throw new Error('Guild member kick is not implemented yet.');
}

export async function promoteMember(): Promise<never> {
  requireDb();
  throw new Error('Guild member promotion is not implemented yet.');
}

export async function attackBoss(): Promise<never> {
  requireDb();
  throw new Error('Guild boss attack is not implemented yet.');
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

export async function fetchActiveBoss(): Promise<GuildBossState | null> {
  requireDb();
  return null;
}

export async function startEvent(): Promise<never> {
  requireDb();
  throw new Error('Guild event start is not implemented yet.');
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
