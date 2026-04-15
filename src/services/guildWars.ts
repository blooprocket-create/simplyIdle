import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseFirestore } from './firebase';

// ─── Constants ─────────────────────────────────────────────────────────────

const WAR_CHALLENGE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 h
const WAR_DURATION_MS = 48 * 60 * 60 * 1000; // 48 h
const WAR_CONTRIBUTION_COOLDOWN_MS = 5 * 60 * 1000; // 5 min
const WAR_HISTORY_MAX = 20;

// ─── Types ─────────────────────────────────────────────────────────────────

export type WarChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type ActiveWarStatus = 'active' | 'completed';

export interface WarChallenge {
  challengeId: string;
  challengerGuildId: string;
  challengerName: string;
  challengerTag: string;
  challengerLevel: number;
  defenderGuildId: string;
  defenderName: string;
  defenderTag: string;
  defenderLevel: number;
  status: WarChallengeStatus;
  createdAt: number;
  expiresAt: number;
  respondedAt: number | null;
}

export interface ActiveWar {
  warId: string;
  guildAId: string;
  guildAName: string;
  guildATag: string;
  guildADamage: number;
  guildATarget: number;
  guildBId: string;
  guildBName: string;
  guildBTag: string;
  guildBDamage: number;
  guildBTarget: number;
  status: ActiveWarStatus;
  startedAt: number;
  endsAt: number;
  winnerId: string | null;
  completedAt: number | null;
}

export interface WarContributor {
  uid: string;
  displayName: string;
  totalDamage: number;
  lastContributedAt: number;
}

export interface WarHistoryEntry {
  warId: string;
  opponentName: string;
  opponentTag: string;
  result: 'win' | 'loss' | 'draw';
  myGuildDamage: number;
  opponentDamage: number;
  completedAt: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function requireDb() {
  const db = getFirebaseFirestore();
  if (!db) throw new Error('Firestore not available.');
  return db;
}

async function resolveGuildForUser(uid: string): Promise<{
  guildId: string;
  rank: string;
  guildName: string;
  guildTag: string;
  guildLevel: number;
} | null> {
  const db = requireDb();
  const snap = await getDoc(doc(db, 'userGuild', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const guildId = typeof data.guildId === 'string' ? data.guildId : '';
  if (!guildId) return null;
  const guildSnap = await getDoc(doc(db, 'guilds', guildId));
  if (!guildSnap.exists()) return null;
  const guild = guildSnap.data();
  return {
    guildId,
    rank: typeof data.rank === 'string' ? data.rank : 'member',
    guildName: typeof guild.name === 'string' ? guild.name : 'Guild',
    guildTag: typeof guild.tag === 'string' ? guild.tag : '???',
    guildLevel: typeof guild.level === 'number' ? guild.level : 1,
  };
}

function warTargetForLevel(level: number): number {
  return Math.max(1, Math.floor(Math.max(1, level) * 500_000_000_000));
}

// ─── API ───────────────────────────────────────────────────────────────────

/** Find guilds near your level that can be challenged. */
export async function findMatchableGuilds(uid: string): Promise<
  Array<{
    guildId: string;
    name: string;
    tag: string;
    level: number;
    memberCount: number;
  }>
> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) throw new Error('You are not in a guild.');

  const snap = await getDocs(query(collection(db, 'guildLookup'), orderBy('level', 'desc'), limit(40)));

  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        guildId: typeof data.guildId === 'string' ? data.guildId : '',
        name: typeof data.displayName === 'string' ? data.displayName : 'Guild',
        tag: typeof data.tag === 'string' ? data.tag : '???',
        level: typeof data.level === 'number' ? data.level : 1,
        memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
      };
    })
    .filter(g => g.guildId && g.guildId !== me.guildId);
}

/** Send a war challenge to another guild. Leader only. */
export async function sendWarChallenge(uid: string, targetGuildId: string): Promise<WarChallenge> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) throw new Error('You are not in a guild.');
  if (me.rank !== 'leader') throw new Error('Only guild leaders can declare war.');
  if (me.guildId === targetGuildId) throw new Error('Cannot challenge your own guild.');

  const targetGuildSnap = await getDoc(doc(db, 'guilds', targetGuildId));
  if (!targetGuildSnap.exists()) throw new Error('Target guild not found.');
  const targetGuild = targetGuildSnap.data();

  const now = Date.now();
  const challengeId = `${me.guildId}_${targetGuildId}_${now}`;
  const challenge: WarChallenge = {
    challengeId,
    challengerGuildId: me.guildId,
    challengerName: me.guildName,
    challengerTag: me.guildTag,
    challengerLevel: me.guildLevel,
    defenderGuildId: targetGuildId,
    defenderName: typeof targetGuild.name === 'string' ? targetGuild.name : 'Guild',
    defenderTag: typeof targetGuild.tag === 'string' ? targetGuild.tag : '???',
    defenderLevel: typeof targetGuild.level === 'number' ? targetGuild.level : 1,
    status: 'pending',
    createdAt: now,
    expiresAt: now + WAR_CHALLENGE_EXPIRY_MS,
    respondedAt: null,
  };

  await setDoc(doc(db, 'guildWarChallenges', challengeId), challenge);
  return challenge;
}

/** Fetch incoming war challenges for your guild. */
export async function fetchIncomingChallenges(uid: string): Promise<WarChallenge[]> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) return [];

  const snap = await getDocs(
    query(
      collection(db, 'guildWarChallenges'),
      where('defenderGuildId', '==', me.guildId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(10),
    ),
  );

  return snap.docs.map(d => parseChallenge(d.id, d.data())).filter(c => c.expiresAt > Date.now());
}

/** Fetch outgoing war challenges from your guild. */
export async function fetchOutgoingChallenges(uid: string): Promise<WarChallenge[]> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) return [];

  const snap = await getDocs(
    query(
      collection(db, 'guildWarChallenges'),
      where('challengerGuildId', '==', me.guildId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      limit(10),
    ),
  );

  return snap.docs.map(d => parseChallenge(d.id, d.data())).filter(c => c.expiresAt > Date.now());
}

/** Accept a war challenge — starts the active war. Leader only. */
export async function acceptWarChallenge(uid: string, challengeId: string): Promise<ActiveWar> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) throw new Error('You are not in a guild.');
  if (me.rank !== 'leader') throw new Error('Only guild leaders can accept war challenges.');

  const challengeRef = doc(db, 'guildWarChallenges', challengeId);
  const now = Date.now();

  return runTransaction(db, async tx => {
    const cSnap = await tx.get(challengeRef);
    if (!cSnap.exists()) throw new Error('Challenge not found.');
    const c = cSnap.data();
    if (c.status !== 'pending') throw new Error('Challenge is no longer pending.');
    if (c.defenderGuildId !== me.guildId) throw new Error('This challenge was not sent to your guild.');
    if (typeof c.expiresAt === 'number' && c.expiresAt <= now) throw new Error('Challenge has expired.');

    const warId = `war_${c.challengerGuildId}_${me.guildId}_${now}`;
    const target = warTargetForLevel(
      Math.max(
        typeof c.challengerLevel === 'number' ? c.challengerLevel : 1,
        typeof c.defenderLevel === 'number' ? c.defenderLevel : 1,
      ),
    );

    const war: ActiveWar = {
      warId,
      guildAId: typeof c.challengerGuildId === 'string' ? c.challengerGuildId : '',
      guildAName: typeof c.challengerName === 'string' ? c.challengerName : 'Guild A',
      guildATag: typeof c.challengerTag === 'string' ? c.challengerTag : '???',
      guildADamage: 0,
      guildATarget: target,
      guildBId: me.guildId,
      guildBName: me.guildName,
      guildBTag: me.guildTag,
      guildBDamage: 0,
      guildBTarget: target,
      status: 'active',
      startedAt: now,
      endsAt: now + WAR_DURATION_MS,
      winnerId: null,
      completedAt: null,
    };

    tx.set(doc(db, 'guildWars', warId), { ...war, updatedAt: now });
    tx.set(challengeRef, { status: 'accepted', respondedAt: now, warId, updatedAt: now }, { merge: true });

    return war;
  });
}

/** Decline a war challenge. Leader only. */
export async function declineWarChallenge(uid: string, challengeId: string): Promise<void> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) throw new Error('You are not in a guild.');
  if (me.rank !== 'leader') throw new Error('Only guild leaders can decline war challenges.');

  await setDoc(
    doc(db, 'guildWarChallenges', challengeId),
    { status: 'declined', respondedAt: Date.now(), updatedAt: Date.now() },
    { merge: true },
  );
}

/** Fetch the active war for your guild (if any). */
export async function fetchActiveWar(uid: string): Promise<ActiveWar | null> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) return null;

  // Check wars where we're guild A
  const snapA = await getDocs(
    query(collection(db, 'guildWars'), where('guildAId', '==', me.guildId), where('status', '==', 'active'), limit(1)),
  );
  if (!snapA.empty) return parseWar(snapA.docs[0].data());

  // Check wars where we're guild B
  const snapB = await getDocs(
    query(collection(db, 'guildWars'), where('guildBId', '==', me.guildId), where('status', '==', 'active'), limit(1)),
  );
  if (!snapB.empty) return parseWar(snapB.docs[0].data());

  return null;
}

/** Subscribe to real-time war updates. */
export function subscribeToActiveWar(warId: string, onUpdate: (war: ActiveWar) => void): () => void {
  const db = getFirebaseFirestore();
  if (!db || !warId) return () => {};

  return onSnapshot(doc(db, 'guildWars', warId), snap => {
    if (!snap.exists()) return;
    onUpdate(parseWar(snap.data()));
  });
}

/** Contribute damage to the active war. */
export async function contributeWarDamage(input: {
  uid: string;
  displayName: string;
  warId: string;
  dps: number;
}): Promise<ActiveWar> {
  const db = requireDb();
  const me = await resolveGuildForUser(input.uid);
  if (!me) throw new Error('You are not in a guild.');

  const warRef = doc(db, 'guildWars', input.warId);
  const contribRef = doc(db, 'guildWars', input.warId, 'contributors', input.uid);
  const now = Date.now();
  const dealt = Math.max(0, Math.floor((input.dps || 1) * 30));

  return runTransaction(db, async tx => {
    const [warSnap, contribSnap] = await Promise.all([tx.get(warRef), tx.get(contribRef)]);
    if (!warSnap.exists()) throw new Error('War not found.');
    const war = warSnap.data();
    if (war.status !== 'active') throw new Error('War is not active.');
    if (typeof war.endsAt === 'number' && war.endsAt <= now) throw new Error('War has ended.');

    const isGuildA = war.guildAId === me.guildId;
    const isGuildB = war.guildBId === me.guildId;
    if (!isGuildA && !isGuildB) throw new Error('Your guild is not part of this war.');

    // Cooldown check
    if (contribSnap.exists()) {
      const lastAt =
        typeof contribSnap.data().lastContributedAt === 'number' ? contribSnap.data().lastContributedAt : 0;
      if (now - lastAt < WAR_CONTRIBUTION_COOLDOWN_MS) {
        const secs = Math.ceil((WAR_CONTRIBUTION_COOLDOWN_MS - (now - lastAt)) / 1000);
        throw new Error(`War contribution cooldown (${secs}s).`);
      }
    }

    const guildADamage = (typeof war.guildADamage === 'number' ? war.guildADamage : 0) + (isGuildA ? dealt : 0);
    const guildBDamage = (typeof war.guildBDamage === 'number' ? war.guildBDamage : 0) + (isGuildB ? dealt : 0);
    const guildATarget = typeof war.guildATarget === 'number' ? war.guildATarget : 1;
    const guildBTarget = typeof war.guildBTarget === 'number' ? war.guildBTarget : 1;
    const aHit = guildADamage >= guildATarget;
    const bHit = guildBDamage >= guildBTarget;
    const completed = aHit || bHit;

    let winnerId: string | null = null;
    if (completed) {
      if (aHit && bHit) winnerId = guildADamage >= guildBDamage ? war.guildAId : war.guildBId;
      else if (aHit) winnerId = war.guildAId;
      else winnerId = war.guildBId;
    }

    tx.set(
      warRef,
      {
        guildADamage,
        guildBDamage,
        status: completed ? 'completed' : 'active',
        winnerId: completed ? winnerId : null,
        completedAt: completed ? now : null,
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(
      contribRef,
      {
        uid: input.uid,
        displayName: input.displayName.trim().slice(0, 24) || 'Member',
        guildId: me.guildId,
        totalDamage:
          (contribSnap.exists() && typeof contribSnap.data().totalDamage === 'number'
            ? contribSnap.data().totalDamage
            : 0) + dealt,
        lastContributedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    return {
      warId: input.warId,
      guildAId: typeof war.guildAId === 'string' ? war.guildAId : '',
      guildAName: typeof war.guildAName === 'string' ? war.guildAName : 'Guild A',
      guildATag: typeof war.guildATag === 'string' ? war.guildATag : '???',
      guildADamage,
      guildATarget,
      guildBId: typeof war.guildBId === 'string' ? war.guildBId : '',
      guildBName: typeof war.guildBName === 'string' ? war.guildBName : 'Guild B',
      guildBTag: typeof war.guildBTag === 'string' ? war.guildBTag : '???',
      guildBDamage,
      guildBTarget,
      status: completed ? ('completed' as const) : ('active' as const),
      startedAt: typeof war.startedAt === 'number' ? war.startedAt : now,
      endsAt: typeof war.endsAt === 'number' ? war.endsAt : now,
      winnerId: completed ? winnerId : null,
      completedAt: completed ? now : null,
    };
  });
}

/** Fetch war contributors (leaderboard). */
export async function fetchWarContributors(warId: string, myGuildId: string): Promise<WarContributor[]> {
  const db = requireDb();
  if (!warId) return [];

  const snap = await getDocs(
    query(collection(db, 'guildWars', warId, 'contributors'), where('guildId', '==', myGuildId), limit(30)),
  );

  return snap.docs
    .map(d => {
      const data = d.data();
      return {
        uid: d.id,
        displayName: typeof data.displayName === 'string' ? data.displayName : 'Member',
        totalDamage: typeof data.totalDamage === 'number' ? data.totalDamage : 0,
        lastContributedAt: typeof data.lastContributedAt === 'number' ? data.lastContributedAt : 0,
      };
    })
    .sort((a, b) => b.totalDamage - a.totalDamage);
}

/** Fetch war history for your guild. */
export async function fetchWarHistory(uid: string): Promise<WarHistoryEntry[]> {
  const db = requireDb();
  const me = await resolveGuildForUser(uid);
  if (!me) return [];

  const [snapA, snapB] = await Promise.all([
    getDocs(
      query(
        collection(db, 'guildWars'),
        where('guildAId', '==', me.guildId),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(WAR_HISTORY_MAX),
      ),
    ),
    getDocs(
      query(
        collection(db, 'guildWars'),
        where('guildBId', '==', me.guildId),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(WAR_HISTORY_MAX),
      ),
    ),
  ]);

  const all = [...snapA.docs, ...snapB.docs]
    .map(d => {
      const data = d.data();
      const isA = data.guildAId === me.guildId;
      const myDamage = isA
        ? typeof data.guildADamage === 'number'
          ? data.guildADamage
          : 0
        : typeof data.guildBDamage === 'number'
          ? data.guildBDamage
          : 0;
      const oppDamage = isA
        ? typeof data.guildBDamage === 'number'
          ? data.guildBDamage
          : 0
        : typeof data.guildADamage === 'number'
          ? data.guildADamage
          : 0;
      const winnerId = typeof data.winnerId === 'string' ? data.winnerId : null;
      const result: 'win' | 'loss' | 'draw' = winnerId === me.guildId ? 'win' : winnerId ? 'loss' : 'draw';
      return {
        warId: d.id,
        opponentName: isA
          ? typeof data.guildBName === 'string'
            ? data.guildBName
            : 'Opponent'
          : typeof data.guildAName === 'string'
            ? data.guildAName
            : 'Opponent',
        opponentTag: isA
          ? typeof data.guildBTag === 'string'
            ? data.guildBTag
            : '???'
          : typeof data.guildATag === 'string'
            ? data.guildATag
            : '???',
        result,
        myGuildDamage: myDamage,
        opponentDamage: oppDamage,
        completedAt: typeof data.completedAt === 'number' ? data.completedAt : 0,
      };
    })
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, WAR_HISTORY_MAX);

  return all;
}

// ─── Parsers ───────────────────────────────────────────────────────────────

function parseChallenge(id: string, data: Record<string, unknown>): WarChallenge {
  return {
    challengeId: id,
    challengerGuildId: typeof data.challengerGuildId === 'string' ? data.challengerGuildId : '',
    challengerName: typeof data.challengerName === 'string' ? data.challengerName : 'Guild',
    challengerTag: typeof data.challengerTag === 'string' ? data.challengerTag : '???',
    challengerLevel: typeof data.challengerLevel === 'number' ? data.challengerLevel : 1,
    defenderGuildId: typeof data.defenderGuildId === 'string' ? data.defenderGuildId : '',
    defenderName: typeof data.defenderName === 'string' ? data.defenderName : 'Guild',
    defenderTag: typeof data.defenderTag === 'string' ? data.defenderTag : '???',
    defenderLevel: typeof data.defenderLevel === 'number' ? data.defenderLevel : 1,
    status:
      data.status === 'accepted' || data.status === 'declined' || data.status === 'expired' ? data.status : 'pending',
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : 0,
    respondedAt: typeof data.respondedAt === 'number' ? data.respondedAt : null,
  };
}

function parseWar(data: Record<string, unknown>): ActiveWar {
  return {
    warId: typeof data.warId === 'string' ? data.warId : '',
    guildAId: typeof data.guildAId === 'string' ? data.guildAId : '',
    guildAName: typeof data.guildAName === 'string' ? data.guildAName : 'Guild A',
    guildATag: typeof data.guildATag === 'string' ? data.guildATag : '???',
    guildADamage: typeof data.guildADamage === 'number' ? data.guildADamage : 0,
    guildATarget: typeof data.guildATarget === 'number' ? data.guildATarget : 1,
    guildBId: typeof data.guildBId === 'string' ? data.guildBId : '',
    guildBName: typeof data.guildBName === 'string' ? data.guildBName : 'Guild B',
    guildBTag: typeof data.guildBTag === 'string' ? data.guildBTag : '???',
    guildBDamage: typeof data.guildBDamage === 'number' ? data.guildBDamage : 0,
    guildBTarget: typeof data.guildBTarget === 'number' ? data.guildBTarget : 1,
    status: data.status === 'completed' ? 'completed' : 'active',
    startedAt: typeof data.startedAt === 'number' ? data.startedAt : 0,
    endsAt: typeof data.endsAt === 'number' ? data.endsAt : 0,
    winnerId: typeof data.winnerId === 'string' ? data.winnerId : null,
    completedAt: typeof data.completedAt === 'number' ? data.completedAt : null,
  };
}
