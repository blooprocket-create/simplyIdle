import { useState, useCallback, useEffect, useRef } from 'react';
import { isCurrentUserAdmin } from '../services/adminAccess';
import { getCharacterSaveSlot, getDpsBreakdown } from '../useGameState';
import { deleteOnlineSave, loadOnlineSave, loadOnlineSaveForUid, writeOnlineSaveForUid } from '../services/onlineSave';
import { getFirebaseAuth, getFirebaseFirestore } from '../services/firebase';
import { collectionGroup, getDocs, getDoc, doc as firestoreDoc } from 'firebase/firestore';
import { CLASSES, PlayerClass, getMonsterMaxHp } from '../gameConfig';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type SnapshotData = {
  ts: number;
  wave: number;
  level: number;
  gold: number;
  totalGold: number;
  totalKills: number;
  essence: number;
  dps: number;
  playerDps: number;
  heroDps: number;
  totalMult: number;
  monsterHp: number;
  facilities: Record<string, number>;
  meta: { damage: number; economy: number; survival: number };
  heroLevels: number[];
  prestigeCount: number;
  achievements: number;
};

function formatSnapshot(snap: SnapshotData, label: string): string {
  const lines = [
    `── ${label} ──`,
    `Wave ${snap.wave} | Level ${snap.level} | Prestige ${snap.prestigeCount}`,
    `DPS: ${Math.floor(snap.dps).toLocaleString()} (player ${Math.floor(snap.playerDps).toLocaleString()} + hero ${Math.floor(snap.heroDps).toLocaleString()}) × ${snap.totalMult.toFixed(2)}`,
    `Monster HP: ${Math.floor(snap.monsterHp).toLocaleString()} | TTK: ${(snap.monsterHp / snap.dps).toFixed(1)}s`,
    `Gold: ${Math.floor(snap.gold).toLocaleString()} | Essence: ${snap.essence}`,
    `Facilities: T${snap.facilities.tactics} Tr${snap.facilities.training} Ty${snap.facilities.treasury} F${snap.facilities.forge}`,
    `Meta: dmg${snap.meta.damage} eco${snap.meta.economy} surv${snap.meta.survival}`,
    `Heroes (${snap.heroLevels.length}): levels [${snap.heroLevels.join(', ')}]`,
    `Achievements: ${snap.achievements} | Kills: ${snap.totalKills.toLocaleString()}`,
  ];
  return lines.join('\n');
}

type CharacterSnapshot = {
  account: string;
  uid: string;
  saveSlotId: string;
  classId: PlayerClass;
  playerName: string;
  level: number;
  highestWaveReached: number;
  lastActiveAt: number;
  isOnline: boolean;
};

type SaveMailboxEntry = {
  id: string;
  subject: string;
  message: string;
  from: string;
  sentAt: number;
  attachments: {
    shards: number;
    gold: number;
    diamonds: number;
    tears: number;
    essence: number;
  };
  claimedAttachments?: {
    shards: number;
    gold: number;
    diamonds: number;
    tears: number;
    essence: number;
  };
};

interface DevConsoleState {
  characterCreated: boolean;
  playerName: string | null;
  level: number;
  highestWaveReached: number;
  playerClass: PlayerClass | null;
  wave: number;
  gold: number;
  essence: number;
  totalKills: number;
  totalGold: number;
  prestigeCount: number;
  heroRoster: {
    uid: string;
    id: string;
    name: string;
    heroClass: string;
    level: number;
    rank: number;
    rarity: string;
  }[];
  activeTeamHeroIds: string[];
  guildhallFacilities: Record<'training' | 'treasury' | 'forge' | 'tactics', { level: number }>;
  metaDamageLevel: number;
  metaEconomyLevel: number;
  metaSurvivalLevel: number;
  monsterHp: number;
  monsterMaxHp: number;
  vipLevel: number;
  combatTempo: number;
  exp: number;
  unspentStatPoints: number;
  rebirthDamagePath: number;
  rebirthEconomyPath: number;
  teamSlotsUnlocked: number;
  achievements: { size: number };
}

interface UseDevConsoleParams {
  accountName: string;
  publicUsername: string;
  selectedCharacterClass: PlayerClass | null;
  state: DevConsoleState;
  appendMailboxMessages: (entries: SaveMailboxEntry[]) => void;
}

export function useDevConsole({
  accountName,
  publicUsername,
  selectedCharacterClass,
  state,
  appendMailboxMessages,
}: UseDevConsoleParams) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkedAccount, setCheckedAccount] = useState<string | null>(null);
  const adminCheckPending = checkedAccount !== accountName;
  const [devCommandInput, setDevCommandInput] = useState('');
  const [devCommandOutput, setDevCommandOutput] = useState<string>('');

  // Admin check on mount / account change
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const allowed = await isCurrentUserAdmin();
      if (cancelled) return;
      setIsAdmin(allowed);
      setCheckedAccount(accountName);
      if (!allowed) {
        setDevCommandInput('');
        setDevCommandOutput('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountName]);

  // ── Snapshot diagnostic state ──────────────────────────────────────────
  const snapshotRef = useRef<SnapshotData | null>(null);

  const captureSnapshot = useCallback((): SnapshotData => {
    const breakdown = getDpsBreakdown(state as Parameters<typeof getDpsBreakdown>[0]);
    const activeHeroes = state.heroRoster.filter(h => state.activeTeamHeroIds.includes(h.uid));
    return {
      ts: Date.now(),
      wave: state.wave,
      level: state.level,
      gold: state.gold,
      totalGold: state.totalGold,
      totalKills: state.totalKills,
      essence: state.essence,
      dps: breakdown.finalDps,
      playerDps: breakdown.playerBaseDps,
      heroDps: breakdown.heroBaseDps,
      totalMult: breakdown.totalMultiplier,
      monsterHp: getMonsterMaxHp(state.wave),
      facilities: {
        tactics: state.guildhallFacilities.tactics.level,
        training: state.guildhallFacilities.training.level,
        treasury: state.guildhallFacilities.treasury.level,
        forge: state.guildhallFacilities.forge.level,
      },
      meta: {
        damage: state.metaDamageLevel,
        economy: state.metaEconomyLevel,
        survival: state.metaSurvivalLevel,
      },
      heroLevels: activeHeroes.map(h => h.level).sort((a, b) => b - a),
      prestigeCount: state.prestigeCount,
      achievements: state.achievements.size,
    };
  }, [state]);

  const collectCharacterSnapshots = useCallback(async (): Promise<CharacterSnapshot[]> => {
    const db = getFirebaseFirestore();
    if (!db) return [];

    const now = Date.now();

    let allDocs: Awaited<ReturnType<typeof getDocs>>;
    try {
      allDocs = await getDocs(collectionGroup(db, 'saveSlots'));
    } catch {
      return [];
    }

    const uids = new Set<string>();
    for (const docSnap of allDocs.docs) {
      const uid = docSnap.ref.parent.parent?.id;
      if (uid) uids.add(uid);
    }

    const uidToUsername = new Map<string, string>();
    await Promise.all(
      Array.from(uids).map(async uid => {
        try {
          const profileSnap = await getDoc(firestoreDoc(db, 'userProfiles', uid));
          if (profileSnap.exists()) {
            const u = profileSnap.data()?.publicUsername;
            if (typeof u === 'string' && u) uidToUsername.set(uid, u);
          }
        } catch {
          // leave unmapped
        }
      }),
    );

    const snapshots: CharacterSnapshot[] = [];
    for (const docSnap of allDocs.docs) {
      const data = docSnap.data() as Record<string, unknown>;
      const payload = (data.payload ?? {}) as Record<string, unknown>;
      if (payload.characterCreated !== true) continue;

      const playerName = typeof payload.playerName === 'string' ? payload.playerName.trim().slice(0, 24) : '';
      if (!playerName) continue;

      const classId = typeof payload.playerClass === 'string' ? payload.playerClass.trim() : '';
      if (!classId || !CLASSES.some(c => c.id === classId)) continue;

      const uid = docSnap.ref.parent.parent?.id ?? '';
      const account = uidToUsername.get(uid) ?? uid.slice(0, 12);

      const level =
        typeof payload.level === 'number' && Number.isFinite(payload.level)
          ? Math.max(1, Math.floor(payload.level))
          : 1;
      const highestWaveReached =
        typeof payload.highestWaveReached === 'number' && Number.isFinite(payload.highestWaveReached)
          ? Math.max(1, Math.floor(payload.highestWaveReached))
          : 1;
      const lastActiveAt =
        typeof payload.lastActiveAt === 'number' && Number.isFinite(payload.lastActiveAt)
          ? Math.max(0, Math.floor(payload.lastActiveAt))
          : typeof data.updatedAt === 'number'
            ? (data.updatedAt as number)
            : 0;
      const isOnline = now - lastActiveAt <= ONLINE_WINDOW_MS;

      snapshots.push({
        account,
        uid,
        saveSlotId: docSnap.id,
        classId: classId as PlayerClass,
        playerName,
        level,
        highestWaveReached,
        lastActiveAt,
        isOnline,
      });
    }

    return snapshots.sort((a, b) => {
      if (a.account !== b.account) return a.account.localeCompare(b.account);
      if (a.playerName !== b.playerName) return a.playerName.localeCompare(b.playerName);
      return a.classId.localeCompare(b.classId);
    });
  }, []);

  const runDevCommand = useCallback(async () => {
    if (!isAdmin) {
      setDevCommandOutput('Admin access required.');
      return;
    }

    const rawCommand = devCommandInput.trim();
    if (!rawCommand) {
      setDevCommandOutput('Enter a command first.');
      return;
    }

    const tokens = rawCommand.split(/\s+/);
    const command = (tokens[0] ?? '').toLowerCase();
    const currentUid = getFirebaseAuth()?.currentUser?.uid ?? '';
    const validClasses: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
    const currentSnapshot =
      state.characterCreated && selectedCharacterClass
        ? ({
            account: publicUsername || accountName,
            uid: currentUid,
            saveSlotId: getCharacterSaveSlot(accountName, selectedCharacterClass),
            classId: selectedCharacterClass,
            playerName: state.playerName,
            level: state.level,
            highestWaveReached: state.highestWaveReached,
            lastActiveAt: Date.now(),
            isOnline: true,
          } as CharacterSnapshot)
        : null;

    if (command === '/devhelp') {
      setDevCommandOutput(
        [
          'Dev commands:',
          '/showOnlineUsersAndCharacters',
          '/sendMsg (sendAll|User|User+CharName) #subject# ##message## $shard X, $gold X, $diamond X, $tears X, $essence X',
          '/clearSlot <classId>',
          '/whoAmI',
          '/showSlot <classId>',
          '/devDiag',
          '/snapshot start — begin tracking progression',
          '/snapshot — show current state vs start (deltas)',
        ].join('\n'),
      );
      return;
    }

    if (command === '/snapshot') {
      if (!state.characterCreated) {
        setDevCommandOutput('No active character.');
        return;
      }

      const subCmd = (tokens[1] ?? '').toLowerCase();

      if (subCmd === 'start') {
        snapshotRef.current = captureSnapshot();
        setDevCommandOutput('Snapshot started. Play for a while, then run /snapshot to see deltas.');
        return;
      }

      const now = captureSnapshot();

      if (!snapshotRef.current) {
        setDevCommandOutput(
          formatSnapshot(now, 'Current State') + '\n\nRun /snapshot start first to track changes over time.',
        );
        return;
      }

      const start = snapshotRef.current;
      const elapsedSec = (now.ts - start.ts) / 1000;
      const elapsedMin = elapsedSec / 60;
      const fmt = (n: number) => Math.floor(n).toLocaleString();

      const wavesGained = now.wave - start.wave;
      const levelsGained = now.level - start.level;
      const killsGained = now.totalKills - start.totalKills;
      const goldGained = now.totalGold - start.totalGold;
      const ttk = now.monsterHp / now.dps;
      const startTtk = start.monsterHp / start.dps;

      const lines = [
        `── Snapshot Delta (${elapsedMin.toFixed(1)} min) ──`,
        '',
        formatSnapshot(start, 'START'),
        '',
        formatSnapshot(now, 'NOW'),
        '',
        `── Changes ──`,
        `Waves: ${start.wave} → ${now.wave} (+${wavesGained}, ${(wavesGained / elapsedMin).toFixed(1)}/min)`,
        `Level: ${start.level} → ${now.level} (+${levelsGained})`,
        `Kills: +${fmt(killsGained)} (${(killsGained / elapsedMin).toFixed(1)}/min)`,
        `Gold earned: +${fmt(goldGained)} (${fmt(goldGained / elapsedMin)}/min)`,
        `DPS: ${fmt(start.dps)} → ${fmt(now.dps)} (+${((now.dps / start.dps - 1) * 100).toFixed(1)}%)`,
        `TTK: ${startTtk.toFixed(1)}s → ${ttk.toFixed(1)}s`,
        `Monster HP: ${fmt(start.monsterHp)} → ${fmt(now.monsterHp)} (+${((now.monsterHp / start.monsterHp - 1) * 100).toFixed(0)}%)`,
        '',
        wavesGained > 0
          ? `DPS grew ${((now.dps / start.dps - 1) * 100).toFixed(1)}% while monster HP grew ${((now.monsterHp / start.monsterHp - 1) * 100).toFixed(0)}%`
          : 'No wave progress — character may be stuck.',
      ];

      setDevCommandOutput(lines.join('\n'));
      return;
    }

    if (command === '/whoami') {
      setDevCommandOutput(
        [
          `uid: ${currentUid || '(none)'}`,
          `account: ${publicUsername || accountName}`,
          `admin: ${isAdmin ? 'yes' : 'no'}`,
          `activeClass: ${selectedCharacterClass ?? '(none)'}`,
        ].join('\n'),
      );
      return;
    }

    if (command === '/showslot') {
      const classArg = (tokens[1] ?? '').trim().toLowerCase() as PlayerClass;
      if (!classArg || !validClasses.includes(classArg)) {
        setDevCommandOutput(`Usage: /showSlot <classId>\nValid classes: ${validClasses.join(', ')}`);
        return;
      }

      const slotId = getCharacterSaveSlot(accountName, classArg);
      const slotResult = await loadOnlineSave<Record<string, unknown>>(slotId);
      if (!slotResult.ok) {
        setDevCommandOutput(`showSlot failed (${slotResult.errorCode ?? 'unknown'}) for ${classArg}.`);
        return;
      }

      if (!slotResult.data) {
        setDevCommandOutput(`Slot ${classArg} is empty in Firestore (slotId: ${slotId}).`);
        return;
      }

      const payload = slotResult.data.payload;
      const playerName = typeof payload.playerName === 'string' ? payload.playerName : '(none)';
      const level = typeof payload.level === 'number' ? Math.floor(payload.level) : 1;
      const wave = typeof payload.highestWaveReached === 'number' ? Math.floor(payload.highestWaveReached) : 1;
      const created = payload.characterCreated === true ? 'yes' : 'no';
      setDevCommandOutput(
        [
          `showSlot ${classArg}`,
          `slotId: ${slotId}`,
          `characterCreated: ${created}`,
          `playerName: ${playerName}`,
          `level: ${level}`,
          `highestWaveReached: ${wave}`,
          `revision: ${slotResult.data.revision}`,
          `updatedAt: ${new Date(slotResult.data.updatedAt).toISOString()}`,
        ].join('\n'),
      );
      return;
    }

    if (command === '/devdiag') {
      const db = getFirebaseFirestore();
      if (!db) {
        setDevCommandOutput('devDiag: Firestore is not configured.');
        return;
      }

      try {
        const allDocs = await getDocs(collectionGroup(db, 'saveSlots'));
        setDevCommandOutput(
          [
            'devDiag',
            `uid: ${currentUid || '(none)'}`,
            `isAdmin: ${isAdmin ? 'yes' : 'no'}`,
            `saveSlotDocsReadable: ${allDocs.size}`,
            `hasCurrentSnapshotFallback: ${currentSnapshot ? 'yes' : 'no'}`,
          ].join('\n'),
        );
      } catch (error) {
        const errorCode =
          typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : 'unknown';
        setDevCommandOutput(`devDiag query failed (${errorCode}). Check Firestore admin rules and auth token refresh.`);
      }
      return;
    }

    if (command === '/showonlineusersandcharacters') {
      const snapshots = await collectCharacterSnapshots();
      const allSnapshots =
        currentSnapshot &&
        !snapshots.some(snapshot => snapshot.uid === currentUid && snapshot.classId === currentSnapshot.classId)
          ? [currentSnapshot, ...snapshots]
          : snapshots;

      if (allSnapshots.length === 0) {
        setDevCommandOutput('No characters found in Firestore, and no active local character is loaded.');
        return;
      }

      const onlineCount = allSnapshots.filter(s => s.isOnline).length;
      const lines = allSnapshots.map(
        snapshot =>
          `${snapshot.isOnline ? 'ONLINE' : 'offline'} • ${snapshot.account} • ${snapshot.playerName} (${snapshot.classId}) • Lv ${snapshot.level} • Wave ${snapshot.highestWaveReached}`,
      );
      setDevCommandOutput(`Users+Characters (${onlineCount}/${allSnapshots.length} online)\n${lines.join('\n')}`);
      return;
    }

    if (command === '/sendmsg') {
      const parsed = rawCommand.match(/^\/sendMsg\s+(\S+)\s+#([^#]+)#\s+##([\s\S]*?)##\s*(.*)$/i);
      if (!parsed) {
        setDevCommandOutput(
          'Usage: /sendMsg (sendAll|User|User+CharName) #subject# ##message## $shard X, $gold X, $diamond X, $tears X, $essence X',
        );
        return;
      }

      const targetSpec = (parsed[1] ?? '').trim();
      const subject = (parsed[2] ?? '').trim();
      const message = (parsed[3] ?? '').trim();
      const attachmentText = (parsed[4] ?? '').trim();
      if (!subject || !message) {
        setDevCommandOutput('Subject and message are required.');
        return;
      }

      const attachments: SaveMailboxEntry['attachments'] = { shards: 0, gold: 0, diamonds: 0, tears: 0, essence: 0 };
      const regex = /\$(shard|gold|diamond|tears|essence)\s+(\d+)/gi;
      let match: RegExpExecArray | null = regex.exec(attachmentText);
      while (match) {
        const key = (match[1] ?? '').toLowerCase();
        const amount = Math.max(0, Math.floor(Number(match[2])));
        if (Number.isFinite(amount) && amount > 0) {
          if (key === 'shard') attachments.shards += amount;
          if (key === 'gold') attachments.gold += amount;
          if (key === 'diamond') attachments.diamonds += amount;
          if (key === 'tears') attachments.tears += amount;
          if (key === 'essence') attachments.essence += amount;
        }
        match = regex.exec(attachmentText);
      }

      const senderName = state.playerName || 'Dev Team';
      const buildMail = (): SaveMailboxEntry => ({
        id: `mail_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        subject: subject.slice(0, 80),
        message: message.slice(0, 280),
        from: senderName,
        sentAt: Date.now(),
        attachments: {
          shards: attachments.shards,
          gold: attachments.gold,
          diamonds: attachments.diamonds,
          tears: attachments.tears,
          essence: attachments.essence,
        },
      });

      const appendMailToSnapshot = async (snapshot: CharacterSnapshot): Promise<SaveMailboxEntry | null> => {
        const loadResult = await loadOnlineSaveForUid<Record<string, unknown>>(snapshot.uid, snapshot.saveSlotId);
        if (!loadResult.ok || !loadResult.data) return null;
        const savePayload = { ...loadResult.data.payload };
        const mailbox = Array.isArray(savePayload.mailbox)
          ? (savePayload.mailbox.filter(entry => !!entry && typeof entry === 'object') as SaveMailboxEntry[])
          : [];
        const outgoingMail = buildMail();
        mailbox.push(outgoingMail);
        savePayload.mailbox = mailbox.slice(-100);
        const writeResult = await writeOnlineSaveForUid(snapshot.uid, snapshot.saveSlotId, savePayload);
        if (!writeResult.ok) return null;
        return outgoingMail;
      };

      const snapshots = await collectCharacterSnapshots();
      const allSnapshots =
        currentSnapshot &&
        !snapshots.some(snapshot => snapshot.uid === currentUid && snapshot.classId === currentSnapshot.classId)
          ? [currentSnapshot, ...snapshots]
          : snapshots;

      if (allSnapshots.length === 0) {
        setDevCommandOutput('No character targets found.');
        return;
      }

      let targets: CharacterSnapshot[] = [];
      if (targetSpec.toLowerCase() === 'sendall') {
        targets = allSnapshots;
      } else if (targetSpec.includes('+')) {
        const [userRaw, charRaw] = targetSpec.split('+');
        const user = (userRaw ?? '').trim().toLowerCase();
        const char = (charRaw ?? '').trim().toLowerCase();
        targets = allSnapshots.filter(
          snapshot =>
            snapshot.account.trim().toLowerCase() === user &&
            (snapshot.classId.toLowerCase() === char || snapshot.playerName.trim().toLowerCase() === char),
        );
      } else {
        const user = targetSpec.trim().toLowerCase();
        targets = allSnapshots.filter(snapshot => snapshot.account.trim().toLowerCase() === user);
      }

      if (targets.length === 0) {
        setDevCommandOutput(`No matching targets for "${targetSpec}".`);
        return;
      }

      let delivered = 0;
      const localMails: SaveMailboxEntry[] = [];
      for (const target of targets) {
        const createdMail = await appendMailToSnapshot(target);
        if (createdMail) {
          delivered += 1;
          if (target.uid === currentUid && target.classId === selectedCharacterClass) {
            localMails.push(createdMail);
          }
        }
      }

      if (localMails.length > 0) {
        appendMailboxMessages(localMails);
      }

      setDevCommandOutput(`Mail sent to ${delivered}/${targets.length} target character(s). Subject: ${subject}`);
      return;
    }

    if (command === '/clearslot') {
      const classArg = (tokens[1] ?? '').trim().toLowerCase() as PlayerClass;
      if (!classArg || !validClasses.includes(classArg)) {
        setDevCommandOutput(`Usage: /clearslot <classId>\nValid classes: ${validClasses.join(', ')}`);
        return;
      }

      const targetSlot = getCharacterSaveSlot(accountName, classArg);
      const remoteResult = await deleteOnlineSave(targetSlot);

      if (remoteResult.ok) {
        setDevCommandOutput(
          `Cleared Firestore save for ${accountName} / ${classArg}.\nReload the page to start fresh.`,
        );
      } else {
        setDevCommandOutput(
          `Firestore delete failed (${remoteResult.errorCode ?? 'unknown'}) — it may have already been empty.`,
        );
      }
      return;
    }

    setDevCommandOutput(`Unknown command: ${tokens[0]}. Use /devHelp for available commands.`);
  }, [
    accountName,
    appendMailboxMessages,
    captureSnapshot,
    collectCharacterSnapshots,
    devCommandInput,
    isAdmin,
    publicUsername,
    selectedCharacterClass,
    state.characterCreated,
    state.highestWaveReached,
    state.level,
    state.playerName,
  ]);

  return {
    isAdmin,
    adminCheckPending,
    devCommandInput,
    setDevCommandInput,
    devCommandOutput,
    collectCharacterSnapshots,
    runDevCommand,
  };
}
