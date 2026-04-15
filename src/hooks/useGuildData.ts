import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  disbandGuild,
  fetchActiveBoss,
  fetchGuildBrowse,
  fetchGuildEvents,
  fetchGuildInfo,
  fetchGuildMembers,
  GuildBossState,
  GuildBrowseRow,
  GuildEventState,
  GuildMember,
  GuildSummary,
  kickGuildMember,
  subscribeGuildMembership,
  transferGuildLeadership,
} from '../services/guild';
import { trackEvent } from '../telemetry';

const GUILD_POLL_MS = 60_000;

export interface UseGuildDataReturn {
  // Core guild state
  myGuild: GuildSummary | null;
  guildMembers: GuildMember[];
  guildBoss: GuildBossState | null;
  guildEvents: GuildEventState[];
  guildList: GuildBrowseRow[];

  // Loading / errors
  guildBusy: boolean;
  guildError: string | null;
  guildLoadedOnce: boolean;

  // Guild search / creation inputs
  guildSearchInput: string;
  setGuildSearchInput: (value: string) => void;
  guildNameInput: string;
  setGuildNameInput: (value: string) => void;
  guildTagInput: string;
  setGuildTagInput: (value: string) => void;
  guildDescInput: string;
  setGuildDescInput: (value: string) => void;

  // Sub-tab
  guildSubTab: GuildSubTab;
  setGuildSubTab: (tab: GuildSubTab) => void;

  // Setters exposed for child components
  setGuildBoss: (boss: GuildBossState | null) => void;
  setGuildBusy: (busy: boolean) => void;
  setGuildError: (error: string | null) => void;

  // Actions
  refreshGuildData: () => Promise<void>;

  // Confirmation state
  confirmKickMember: GuildMember | null;
  setConfirmKickMember: (member: GuildMember | null) => void;
  confirmTransferLeader: GuildMember | null;
  setConfirmTransferLeader: (member: GuildMember | null) => void;
  confirmDisbandGuild: boolean;
  setConfirmDisbandGuild: (show: boolean) => void;

  // Confirm actions
  executeKick: () => Promise<void>;
  executeTransfer: () => Promise<void>;
  executeDisband: () => Promise<void>;

  // Derived state
  myGuildRole: 'leader' | 'officer' | 'member' | null;
  isLeader: boolean;
  isOfficer: boolean;
  canInviteToGuild: boolean;
}

export type GuildSubTab = 'home' | 'boss' | 'events' | 'treasury';

/**
 * Encapsulates all guild state: membership, members, boss, events,
 * browse, search, creation inputs, confirmation modals, and actions.
 */
export function useGuildData(uid: string, displayName: string, active: boolean): UseGuildDataReturn {
  const [myGuild, setMyGuild] = useState<GuildSummary | null>(null);
  const [guildMembers, setGuildMembers] = useState<GuildMember[]>([]);
  const [guildBoss, setGuildBoss] = useState<GuildBossState | null>(null);
  const [guildEvents, setGuildEvents] = useState<GuildEventState[]>([]);
  const [guildList, setGuildList] = useState<GuildBrowseRow[]>([]);

  const [guildBusy, setGuildBusy] = useState(false);
  const [guildError, setGuildError] = useState<string | null>(null);
  const [guildLoadedOnce, setGuildLoadedOnce] = useState(false);

  const [guildSearchInput, setGuildSearchInput] = useState('');
  const [guildNameInput, setGuildNameInput] = useState('');
  const [guildTagInput, setGuildTagInput] = useState('');
  const [guildDescInput, setGuildDescInput] = useState('');

  const [guildSubTab, setGuildSubTab] = useState<GuildSubTab>('home');

  const [confirmKickMember, setConfirmKickMember] = useState<GuildMember | null>(null);
  const [confirmTransferLeader, setConfirmTransferLeader] = useState<GuildMember | null>(null);
  const [confirmDisbandGuild, setConfirmDisbandGuild] = useState(false);

  // --- Guild membership subscription ---
  useEffect(() => {
    if (!active || !uid) {
      setMyGuild(null);
      return;
    }
    const stopMembership = subscribeGuildMembership(
      uid,
      guildInfo => setMyGuild(guildInfo),
      () => setGuildError('Guild membership sync failed.'),
    );
    return stopMembership;
  }, [active, uid]);

  // --- Refresh guild data ---
  const refreshGuildData = useCallback(async () => {
    if (!uid) return;
    setGuildBusy(true);
    setGuildError(null);
    try {
      const [guildInfo, browseRows] = await Promise.all([fetchGuildInfo(uid), fetchGuildBrowse(guildSearchInput)]);
      setMyGuild(guildInfo);
      setGuildList(browseRows);
      if (guildInfo?.guildId) {
        const [members, boss, events] = await Promise.all([
          fetchGuildMembers(guildInfo.guildId),
          fetchActiveBoss(uid),
          fetchGuildEvents(uid),
        ]);
        setGuildMembers(members);
        setGuildBoss(boss);
        setGuildEvents(events);
      } else {
        setGuildMembers([]);
        setGuildBoss(null);
        setGuildEvents([]);
      }
      setGuildLoadedOnce(true);
      void trackEvent('social_guild_refresh_success', { inGuild: !!guildInfo?.guildId });
    } catch {
      setGuildError('Failed to load guild data.');
    } finally {
      setGuildBusy(false);
      setGuildLoadedOnce(true);
    }
  }, [uid, guildSearchInput]);

  // --- Poll guild data when active and on guild sub-tab ---
  useEffect(() => {
    if (!active || !uid) return;
    void refreshGuildData();
    const timer = setInterval(() => void refreshGuildData(), GUILD_POLL_MS);
    return () => clearInterval(timer);
  }, [active, uid, refreshGuildData]);

  // --- Confirmation actions ---
  const executeKick = useCallback(async () => {
    if (!uid || !confirmKickMember) return;
    setGuildBusy(true);
    setGuildError(null);
    try {
      await kickGuildMember({ actorUid: uid, targetUid: confirmKickMember.uid });
      await refreshGuildData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to kick member.';
      setGuildError(msg);
    } finally {
      setGuildBusy(false);
      setConfirmKickMember(null);
    }
  }, [uid, confirmKickMember, refreshGuildData]);

  const executeTransfer = useCallback(async () => {
    if (!uid || !confirmTransferLeader) return;
    setGuildBusy(true);
    setGuildError(null);
    try {
      await transferGuildLeadership({ actorUid: uid, newLeaderUid: confirmTransferLeader.uid });
      await refreshGuildData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to transfer leadership.';
      setGuildError(msg);
    } finally {
      setGuildBusy(false);
      setConfirmTransferLeader(null);
    }
  }, [uid, confirmTransferLeader, refreshGuildData]);

  const executeDisband = useCallback(async () => {
    if (!uid) return;
    setGuildBusy(true);
    setGuildError(null);
    try {
      await disbandGuild({ actorUid: uid });
      await refreshGuildData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disband guild.';
      setGuildError(msg);
    } finally {
      setGuildBusy(false);
      setConfirmDisbandGuild(false);
    }
  }, [uid, refreshGuildData]);

  // --- Derived state ---
  const myGuildMember = useMemo(() => guildMembers.find(m => m.uid === uid) ?? null, [guildMembers, uid]);
  const myGuildRole = myGuildMember?.rank ?? null;
  const isLeader = myGuild?.leaderId === uid;
  const isOfficer = myGuildRole === 'officer';
  const canInviteToGuild = !!myGuild?.guildId && (isLeader || isOfficer);

  return {
    myGuild,
    guildMembers,
    guildBoss,
    guildEvents,
    guildList,
    guildBusy,
    guildError,
    guildLoadedOnce,
    guildSearchInput,
    setGuildSearchInput,
    guildNameInput,
    setGuildNameInput,
    guildTagInput,
    setGuildTagInput,
    guildDescInput,
    setGuildDescInput,
    guildSubTab,
    setGuildSubTab,
    setGuildBoss,
    setGuildBusy,
    setGuildError,
    refreshGuildData,
    confirmKickMember,
    setConfirmKickMember,
    confirmTransferLeader,
    setConfirmTransferLeader,
    confirmDisbandGuild,
    setConfirmDisbandGuild,
    executeKick,
    executeTransfer,
    executeDisband,
    myGuildRole,
    isLeader,
    isOfficer,
    canInviteToGuild,
  };
}
