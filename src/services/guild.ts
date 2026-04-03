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

function ensureGuildServiceAvailable(): void {
  if (!getFirebaseFirestore()) {
    throw new Error('Guild service unavailable.');
  }
}

export async function createGuild(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild creation is not implemented yet.');
}

export async function joinGuild(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild join is not implemented yet.');
}

export async function leaveGuild(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild leave is not implemented yet.');
}

export async function kickMember(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild member kick is not implemented yet.');
}

export async function promoteMember(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild member promotion is not implemented yet.');
}

export async function attackBoss(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild boss attack is not implemented yet.');
}

export async function fetchGuildInfo(): Promise<GuildSummary | null> {
  ensureGuildServiceAvailable();
  return null;
}

export async function fetchGuildMembers(): Promise<GuildMember[]> {
  ensureGuildServiceAvailable();
  return [];
}

export async function fetchActiveBoss(): Promise<GuildBossState | null> {
  ensureGuildServiceAvailable();
  return null;
}

export async function startEvent(): Promise<never> {
  ensureGuildServiceAvailable();
  throw new Error('Guild event start is not implemented yet.');
}

export async function fetchGuildBrowse(): Promise<GuildBrowseRow[]> {
  ensureGuildServiceAvailable();
  return [];
}
