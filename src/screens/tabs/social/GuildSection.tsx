import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  attackBoss,
  contributeToGuildEvent,
  createGuild,
  ensureActiveBoss,
  GuildBossState,
  GuildBrowseRow,
  GuildEventContributor,
  GuildEventState,
  fetchGuildEventContributors,
  GuildMember,
  GuildSummary,
  joinGuild,
  isGuildTreasuryEnabled,
  setMemberRank,
  startEvent,
  transactGuildTreasury,
  leaveGuild,
  updateGuildDescription,
  fetchGuildTreasuryLedger,
  fetchGuildTreasuryState,
  GuildTreasuryEntry,
  GuildTreasuryState,
} from '../../../services/guild';
import { SocialAsyncState, SocialCard, SocialInput, SocialPrimaryButton, SocialProgressBar } from './SocialPrimitives';

type GuildSubTab = 'home' | 'boss' | 'events' | 'treasury';

const BOSS_ATTACK_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const EVENT_CONTRIBUTION_COOLDOWN_MS = 5 * 60 * 1000;
const TREASURY_DAILY_WITHDRAW_CAP_LEADER = 25_000_000;
const TREASURY_DAILY_WITHDRAW_CAP_OFFICER = 5_000_000;

function formatCooldownHoursMinutes(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
}

function formatCooldownMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function parseCooldownMinutes(errorMessage: string): number | null {
  const match = /\((\d+)m remaining\)/i.exec(errorMessage);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseCooldownSeconds(errorMessage: string): number | null {
  const match = /\((\d+)s remaining\)/i.exec(errorMessage);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.floor(value)}`;
}

function parsePositiveInt(raw: string): number {
  const parsed = Number(raw.replace(/[^0-9]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

interface GuildSectionProps {
  styles: any;
  me: {
    uid: string;
    name: string;
    level: number;
  };
  diamonds: number;
  saveSlotId: string;
  level: number;
  error: string | null;
  isLoading: boolean;
  guildBusy: boolean;
  guildNameInput: string;
  setGuildNameInput: (value: string) => void;
  guildTagInput: string;
  setGuildTagInput: (value: string) => void;
  guildDescInput: string;
  setGuildDescInput: (value: string) => void;
  guildSearchInput: string;
  setGuildSearchInput: (value: string) => void;
  guildSubTab: GuildSubTab;
  setGuildSubTab: (tab: GuildSubTab) => void;
  guildList: GuildBrowseRow[];
  myGuild: GuildSummary | null;
  guildMembers: GuildMember[];
  guildBoss: GuildBossState | null;
  setGuildBoss: (boss: GuildBossState | null) => void;
  guildEvents: GuildEventState[];
  setError: (value: string | null) => void;
  setGuildBusy: (value: boolean) => void;
  refreshGuildData: () => Promise<void>;
  setConfirmKickMember: (member: GuildMember) => void;
  setConfirmTransferLeader: (member: GuildMember) => void;
  setConfirmDisbandGuild: (value: boolean) => void;
  onViewProfile: (uid: string) => void;
}

export function GuildSection({
  styles,
  me,
  diamonds,
  saveSlotId,
  level,
  error,
  isLoading,
  guildBusy,
  guildNameInput,
  setGuildNameInput,
  guildTagInput,
  setGuildTagInput,
  guildDescInput,
  setGuildDescInput,
  guildSearchInput,
  setGuildSearchInput,
  guildSubTab,
  setGuildSubTab,
  guildList,
  myGuild,
  guildMembers,
  guildBoss,
  setGuildBoss,
  guildEvents,
  setError,
  setGuildBusy,
  refreshGuildData,
  setConfirmKickMember,
  setConfirmTransferLeader,
  setConfirmDisbandGuild,
  onViewProfile,
}: GuildSectionProps) {
  const [pendingEventRestartType, setPendingEventRestartType] = useState<'war' | 'expedition' | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localBossCooldownUntil, setLocalBossCooldownUntil] = useState(0);
  const [eventCooldownUntilById, setEventCooldownUntilById] = useState<Record<string, number>>({});
  const [eventContribByEventId, setEventContribByEventId] = useState<Record<string, GuildEventContributor[]>>({});
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [treasuryState, setTreasuryState] = useState<GuildTreasuryState | null>(null);
  const [treasuryLedger, setTreasuryLedger] = useState<GuildTreasuryEntry[]>([]);
  const [treasuryAmountInput, setTreasuryAmountInput] = useState('50000');
  const [treasuryReasonInput, setTreasuryReasonInput] = useState('');
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const treasuryEnabled = isGuildTreasuryEnabled();

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalBossCooldownUntil(0);
    setEventCooldownUntilById({});
    setEventContribByEventId({});
    setDescriptionDraft(myGuild?.description ?? '');
    setIsEditingDescription(false);
  }, [myGuild?.guildId, me.uid]);

  useEffect(() => {
    if (!myGuild) {
      setDescriptionDraft('');
      return;
    }
    setDescriptionDraft(myGuild.description || '');
  }, [myGuild?.description, myGuild?.guildId]);

  useEffect(() => {
    setEventCooldownUntilById(prev => {
      const activeEventIds = new Set(guildEvents.map(event => event.eventId));
      const next: Record<string, number> = {};
      for (const [eventId, cooldownUntil] of Object.entries(prev)) {
        if (activeEventIds.has(eventId) && cooldownUntil > nowMs) {
          next[eventId] = cooldownUntil;
        }
      }
      return next;
    });
  }, [guildEvents, nowMs]);

  useEffect(() => {
    if (guildSubTab !== 'events' || !me.uid || !myGuild) return;

    const eventIds = guildEvents
      .map(event => event.eventId)
      .filter(id => !!id);

    if (eventIds.length === 0) {
      setEventContribByEventId({});
      return;
    }

    let cancelled = false;
    void Promise.all(eventIds.map(async eventId => {
      const rows = await fetchGuildEventContributors(me.uid, eventId, 12).catch(() => []);
      return { eventId, rows };
    })).then(results => {
      if (cancelled) return;
      const next: Record<string, GuildEventContributor[]> = {};
      for (const result of results) {
        next[result.eventId] = result.rows;
      }
      setEventContribByEventId(next);
    });

    return () => {
      cancelled = true;
    };
  }, [guildEvents, guildSubTab, me.uid, myGuild]);

  useEffect(() => {
    if (!myGuild || guildSubTab !== 'treasury' || !me.uid || !treasuryEnabled) return;
    let cancelled = false;
    setTreasuryLoading(true);
    setError(null);
    void Promise.all([
      fetchGuildTreasuryState(me.uid),
      fetchGuildTreasuryLedger(me.uid, 18),
    ]).then(([state, ledger]) => {
      if (cancelled) return;
      setTreasuryState(state);
      setTreasuryLedger(ledger);
    }).catch(err => {
      if (cancelled) return;
      const msg = err instanceof Error ? err.message : 'Failed to load guild treasury.';
      setError(msg);
    }).finally(() => {
      if (!cancelled) setTreasuryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [guildSubTab, me.uid, myGuild, setError, treasuryEnabled]);

  const myGuildMember = useMemo(
    () => guildMembers.find(member => member.uid === me.uid) ?? null,
    [guildMembers, me.uid],
  );

  const isLeader = !!myGuild && myGuild.leaderId === me.uid;
  const isOfficer = myGuildMember?.rank === 'officer';
  const canWithdrawFromTreasury = isLeader || isOfficer;
  const treasuryDailyCap = isLeader
    ? TREASURY_DAILY_WITHDRAW_CAP_LEADER
    : isOfficer
      ? TREASURY_DAILY_WITHDRAW_CAP_OFFICER
      : 0;
  const treasuryRemainingWithdrawToday = Math.max(0, treasuryDailyCap - (treasuryState?.dailyWithdrawn ?? 0));
  const roleLabel = isLeader ? 'Leader' : isOfficer ? 'Officer' : 'Member';

  const persistedBossCooldownUntil = (myGuildMember?.lastBossAttackAt ?? 0) + BOSS_ATTACK_COOLDOWN_MS;
  const bossCooldownUntil = Math.max(localBossCooldownUntil, persistedBossCooldownUntil);
  const bossCooldownRemainingMs = Math.max(0, bossCooldownUntil - nowMs);
  const canAttackBoss = !guildBusy && !!guildBoss && guildBoss.status === 'active' && bossCooldownRemainingMs <= 0;
  const attackButtonLabel = !guildBoss || guildBoss.status !== 'active'
    ? 'Attack Unavailable'
    : bossCooldownRemainingMs > 0
      ? `Attack ${formatCooldownHoursMinutes(bossCooldownRemainingMs)}`
      : 'Attack Ready';

  const activeEvents = useMemo(
    () => guildEvents.filter(event => event.status === 'active'),
    [guildEvents],
  );

  const activeWarEvent = useMemo(
    () => guildEvents.find(event => event.type === 'war' && event.status === 'active') ?? null,
    [guildEvents],
  );

  const activeExpeditionEvent = useMemo(
    () => guildEvents.find(event => event.type === 'expedition' && event.status === 'active') ?? null,
    [guildEvents],
  );

  const recentCompletedEvents = useMemo(
    () => guildEvents.filter(event => event.status === 'completed').slice(0, 3),
    [guildEvents],
  );

  const topRaiders = useMemo(
    () => [...guildMembers]
      .sort((a, b) => b.guildContribution - a.guildContribution)
      .slice(0, 3),
    [guildMembers],
  );

  const totalBossDamage = useMemo(
    () => guildMembers.reduce((acc, member) => acc + Math.max(0, member.guildContribution), 0),
    [guildMembers],
  );

  const activityFeed = useMemo(() => {
    const items: Array<{ label: string; detail: string; timestamp: number }> = [];

    if (guildBoss) {
      items.push({
        label: `Boss ${guildBoss.status === 'active' ? 'Active' : guildBoss.status === 'defeated' ? 'Defeated' : 'Expired'}`,
        detail: `${guildBoss.name} • Tier ${guildBoss.tier} • Raiders ${guildBoss.participantUids.length}`,
        timestamp: guildBoss.status === 'active' ? guildBoss.startedAt : guildBoss.expiresAt,
      });
    }

    for (const event of guildEvents.slice(0, 4)) {
      items.push({
        label: `${event.type === 'war' ? 'Warfront' : 'Expedition'} ${event.status}`,
        detail: event.status === 'active'
          ? `Ends ${new Date(event.endsAt).toLocaleString()}`
          : `Started ${new Date(event.startedAt).toLocaleString()}`,
        timestamp: event.startedAt,
      });
    }

    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  }, [guildBoss, guildEvents]);

  const canSaveDescription = isLeader
    && !guildBusy
    && !!myGuild
    && isEditingDescription
    && descriptionDraft.trim().slice(0, 140) !== (myGuild.description || '');

  const startGuildEvent = async (type: 'war' | 'expedition', forceRestart = false) => {
    if (!me.uid) return;
    setGuildBusy(true);
    setError(null);
    try {
      await startEvent({ uid: me.uid, type, forceRestart });
      setPendingEventRestartType(null);
      await refreshGuildData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to start ${type}.`;
      setError(msg);
    } finally {
      setGuildBusy(false);
    }
  };

  return (
    <>
      {!myGuild && (
        <SocialCard styles={styles} title="Guild Command" subtitle="Create Guild Cost: 2,500 Diamonds.">
          <SocialAsyncState styles={styles} isLoading={isLoading} variant="inline" />
          <Text style={styles.metaText}>Your Diamonds: {diamonds}</Text>
          {guildBusy && <Text style={styles.metaText}>Syncing guild actions...</Text>}
        </SocialCard>
      )}

      <SocialAsyncState styles={styles} error={error} onRetry={() => void refreshGuildData()} />

      {!myGuild && (
        <SocialCard styles={styles} title="Create Guild">
          <SocialInput
            styles={styles}
            value={guildNameInput}
            onChangeText={setGuildNameInput}
            placeholder="Guild Name"
            editable={!guildBusy}
            maxLength={32}
          />
          <SocialInput
            styles={styles}
            value={guildTagInput}
            onChangeText={setGuildTagInput}
            placeholder="Tag (2-5 chars)"
            editable={!guildBusy}
            autoCapitalize="characters"
            maxLength={5}
          />
          <SocialInput
            styles={styles}
            value={guildDescInput}
            onChangeText={setGuildDescInput}
            placeholder="Description"
            editable={!guildBusy}
            maxLength={140}
          />
          <SocialPrimaryButton
            styles={styles}
            label="Create Guild"
            disabled={guildBusy || diamonds < 2500 || !guildNameInput.trim() || !guildTagInput.trim()}
            onPress={async () => {
              if (!me.uid) return;
              setGuildBusy(true);
              setError(null);
              try {
                await createGuild({
                  uid: me.uid,
                  displayName: me.name,
                  saveSlotId,
                  guildName: guildNameInput,
                  guildTag: guildTagInput,
                  description: guildDescInput,
                  minLevelToJoin: 1,
                  isPublic: true,
                });
                setGuildNameInput('');
                setGuildTagInput('');
                setGuildDescInput('');
                await refreshGuildData();
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to create guild.';
                setError(msg);
              } finally {
                setGuildBusy(false);
              }
            }}
          />
        </SocialCard>
      )}

      {myGuild && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Guild: [{myGuild.tag}] {myGuild.name}</Text>
          <Text style={styles.metaText}>Your Role: {roleLabel}</Text>
          <View style={styles.prefRow} accessibilityRole="tablist">
            <Pressable
              style={[styles.prefBtn, guildSubTab === 'home' && styles.prefBtnActive]}
              onPress={() => setGuildSubTab('home')}
              accessibilityRole="tab"
              accessibilityState={{ selected: guildSubTab === 'home' }}
              accessibilityLabel="Guild home tab"
            >
              <Text style={styles.prefBtnText}>Home</Text>
            </Pressable>
            <Pressable
              style={[styles.prefBtn, guildSubTab === 'boss' && styles.prefBtnActive]}
              onPress={() => setGuildSubTab('boss')}
              accessibilityRole="tab"
              accessibilityState={{ selected: guildSubTab === 'boss' }}
              accessibilityLabel="Guild boss tab"
            >
              <Text style={styles.prefBtnText}>Boss</Text>
            </Pressable>
            <Pressable
              style={[styles.prefBtn, guildSubTab === 'events' && styles.prefBtnActive]}
              onPress={() => setGuildSubTab('events')}
              accessibilityRole="tab"
              accessibilityState={{ selected: guildSubTab === 'events' }}
              accessibilityLabel="Guild events tab"
            >
              <Text style={styles.prefBtnText}>Events</Text>
            </Pressable>
            <Pressable
              style={[styles.prefBtn, guildSubTab === 'treasury' && styles.prefBtnActive]}
              onPress={() => setGuildSubTab('treasury')}
              accessibilityRole="tab"
              accessibilityState={{ selected: guildSubTab === 'treasury' }}
              accessibilityLabel="Guild treasury tab"
            >
              <Text style={styles.prefBtnText}>Treasury</Text>
            </Pressable>
          </View>
        </View>
      )}

      {myGuild && guildSubTab === 'home' && (
        <>
          <SocialCard styles={styles} title="Ops Snapshot" subtitle="Rapid overview of guild posture.">
            <View style={styles.metricGrid}>
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>Boss Front</Text>
                <Text style={styles.metricValue}>{guildBoss ? `${guildBoss.name} (${guildBoss.status})` : 'No active boss'}</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>Active Ops</Text>
                <Text style={styles.metricValue}>{activeEvents.length}</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>Recent Wins</Text>
                <Text style={styles.metricValue}>{recentCompletedEvents.length}</Text>
              </View>
              <View style={styles.metricChip}>
                <Text style={styles.metricLabel}>Boss Damage Pool</Text>
                <Text style={styles.metricValue}>{formatCompactNumber(totalBossDamage)}</Text>
              </View>
            </View>
          </SocialCard>

          <SocialCard styles={styles} title="Guild Command Center">
            {!isEditingDescription && (
              <>
                <View style={styles.friendRow}>
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>Guild Description</Text>
                    <Text style={styles.metaText}>{myGuild.description || 'No description set.'}</Text>
                  </View>
                  {isLeader && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.smallBtn,
                        guildBusy && styles.sendBtnDisabled,
                        pressed && !guildBusy && styles.smallBtnPressed,
                      ]}
                      disabled={guildBusy}
                      onPress={() => setIsEditingDescription(true)}
                    >
                      <Text style={styles.smallBtnText}>✏️ Edit</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}

            {isEditingDescription && isLeader && (
              <>
                <SocialInput
                  styles={styles}
                  value={descriptionDraft}
                  onChangeText={setDescriptionDraft}
                  placeholder="Set guild description and strategy notes"
                  editable={!guildBusy}
                  maxLength={140}
                />
                <View style={styles.friendActions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.smallBtn,
                      guildBusy && styles.sendBtnDisabled,
                      pressed && !guildBusy && styles.smallBtnPressed,
                    ]}
                    disabled={guildBusy}
                    onPress={() => {
                      setDescriptionDraft(myGuild.description || '');
                      setIsEditingDescription(false);
                    }}
                  >
                    <Text style={styles.smallBtnText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.smallBtn,
                      !canSaveDescription && styles.sendBtnDisabled,
                      pressed && canSaveDescription && styles.smallBtnPressed,
                    ]}
                    disabled={!canSaveDescription}
                    onPress={async () => {
                      if (!me.uid || !myGuild) return;
                      setGuildBusy(true);
                      setError(null);
                      try {
                        await updateGuildDescription({
                          uid: me.uid,
                          description: descriptionDraft,
                        });
                        setIsEditingDescription(false);
                        await refreshGuildData();
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : 'Failed to update description.';
                        setError(msg);
                      } finally {
                        setGuildBusy(false);
                      }
                    }}
                  >
                    <Text style={styles.smallBtnText}>Save</Text>
                  </Pressable>
                </View>
              </>
            )}

            <Text style={styles.metaText}>Leader: {myGuild.leaderName} • Members: {myGuild.memberCount}/{myGuild.maxMembers}</Text>
            <Text style={styles.metaText}>Min Join Level: {myGuild.minLevelToJoin} • Public: {myGuild.isPublic ? 'Yes' : 'No'}</Text>
            <Text style={styles.metaText}>Boss Damage Pool: {formatCompactNumber(totalBossDamage)} • Active Ops: {activeEvents.length}</Text>
            {guildBoss && (
              <Text style={styles.metaText}>Boss Front: {guildBoss.name} ({guildBoss.status}) • Tier {guildBoss.tier}</Text>
            )}
            {recentCompletedEvents.length > 0 && (
              <Text style={styles.metaText}>Recent Wins: {recentCompletedEvents.map(event => event.type === 'war' ? 'Warfront' : 'Expedition').join(', ')}</Text>
            )}
          </SocialCard>

          <SocialCard styles={styles} title="Role Matrix" subtitle="Clear authority lines reduce guild chaos.">
            <Text style={styles.metaText}>Leader: full control, role assignments, disband, event launch.</Text>
            <Text style={styles.metaText}>Officer: combat specialist and roster anchor (expanded command tools planned).</Text>
            <Text style={styles.metaText}>Member: contributes in boss/events and strengthens guild progression.</Text>
            <Text style={styles.metaText}>Current Access: {isLeader ? 'Full Command' : isOfficer ? 'Combat Operations' : 'Participant'}</Text>
          </SocialCard>

          <SocialCard styles={styles} title="Top Raiders" subtitle="Highest recorded boss damage contributors.">
            {topRaiders.length === 0 && <Text style={styles.metaText}>No boss damage recorded yet.</Text>}
            {topRaiders.map((member, index) => (
              <View key={member.uid} style={styles.friendRow}>
                <View style={styles.friendMeta}>
                  <Text style={styles.friendName}>#{index + 1} {member.displayName}</Text>
                  <Text style={styles.metaText}>{member.rank} • Boss Damage {formatCompactNumber(member.guildContribution)}</Text>
                </View>
                <Pressable style={styles.smallBtn} onPress={() => onViewProfile(member.uid)}>
                  <Text style={styles.smallBtnText}>Profile</Text>
                </Pressable>
              </View>
            ))}
          </SocialCard>

          <SocialCard styles={styles} title="Roster" subtitle="Boss Damage tracks boss-only impact. Event progress is shown in Events tab.">
            {guildMembers.slice(0, 12).map(member => (
              <View key={member.uid} style={styles.friendRow}>
                <View style={styles.friendMeta}>
                  <Text style={styles.friendName}>{member.displayName}</Text>
                  <View style={styles.statusRow}>
                    <Text style={styles.statusBadge}>{member.rank.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.metaText}>{member.rank} • Boss Damage {Math.floor(member.guildContribution).toLocaleString()}</Text>
                </View>
                {isLeader && member.uid !== me.uid && (
                  <View style={styles.friendActions}>
                    <Pressable
                      style={styles.smallBtn}
                      disabled={guildBusy}
                      onPress={() => onViewProfile(member.uid)}
                    >
                      <Text style={styles.smallBtnText}>Profile</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallBtn}
                      disabled={guildBusy}
                      onPress={async () => {
                        if (!me.uid) return;
                        setGuildBusy(true);
                        setError(null);
                        try {
                          await setMemberRank({
                            actorUid: me.uid,
                            targetUid: member.uid,
                            rank: member.rank === 'officer' ? 'member' : 'officer',
                          });
                          await refreshGuildData();
                        } catch (err) {
                          const msg = err instanceof Error ? err.message : 'Failed to update member rank.';
                          setError(msg);
                        } finally {
                          setGuildBusy(false);
                        }
                      }}
                    >
                      <Text style={styles.smallBtnText}>{member.rank === 'officer' ? 'Demote' : 'Promote'}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallBtn}
                      disabled={guildBusy}
                      onPress={() => setConfirmTransferLeader(member)}
                    >
                      <Text style={styles.smallBtnText}>Leader</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      disabled={guildBusy}
                      onPress={() => setConfirmKickMember(member)}
                    >
                      <Text style={styles.smallBtnText}>Kick</Text>
                    </Pressable>
                  </View>
                )}
                {!isLeader && (
                  <View style={styles.friendActions}>
                    <Pressable style={styles.smallBtn} disabled={guildBusy} onPress={() => onViewProfile(member.uid)}>
                      <Text style={styles.smallBtnText}>Profile</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
            {!isLeader && (
              <Pressable
                style={[styles.smallBtn, styles.smallBtnDanger]}
                disabled={guildBusy}
                onPress={async () => {
                  if (!me.uid) return;
                  setGuildBusy(true);
                  setError(null);
                  try {
                    await leaveGuild({ uid: me.uid });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to leave guild.';
                    setError(msg);
                  } finally {
                    setGuildBusy(false);
                  }
                }}
              >
                <Text style={styles.smallBtnText}>Leave Guild</Text>
              </Pressable>
            )}
            {isLeader && (
              <>
                <Text style={styles.metaText}>Leaders can transfer leadership to another member, or disband the guild.</Text>
                <Pressable
                  style={[styles.smallBtn, styles.smallBtnDanger]}
                  disabled={guildBusy}
                  onPress={() => setConfirmDisbandGuild(true)}
                >
                  <Text style={styles.smallBtnText}>Disband Guild</Text>
                </Pressable>
              </>
            )}
          </SocialCard>

          <SocialCard styles={styles} title="Recent Activity" subtitle="Live ops timeline for guild awareness.">
            {activityFeed.length === 0 && <Text style={styles.metaText}>No guild activity yet.</Text>}
            {activityFeed.map((item, index) => (
              <View key={`${item.label}_${index}`} style={styles.friendRow}>
                <View style={styles.friendMeta}>
                  <Text style={styles.friendName}>{item.label}</Text>
                  <Text style={styles.metaText}>{item.detail}</Text>
                </View>
              </View>
            ))}
          </SocialCard>
        </>
      )}

      {myGuild && guildSubTab === 'boss' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Guild Boss</Text>
          {!guildBoss && <Text style={styles.metaText}>No active boss right now.</Text>}
          {guildBoss && (
            <>
              <Text style={styles.metaText}>{guildBoss.name} • Tier {guildBoss.tier}</Text>
              <Text style={styles.metaText}>HP: {Math.floor(guildBoss.currentHp).toLocaleString()} / {Math.floor(guildBoss.maxHp).toLocaleString()}</Text>
              <SocialProgressBar
                styles={styles}
                progress={guildBoss.currentHp / Math.max(1, guildBoss.maxHp)}
                label={`${Math.floor((guildBoss.currentHp / Math.max(1, guildBoss.maxHp)) * 100)}% Boss HP`}
                tint={guildBoss.currentHp / Math.max(1, guildBoss.maxHp) < 0.25 ? '#FF7A90' : '#7EC8FF'}
              />
              <Text style={styles.metaText}>Status: {guildBoss.status} • Expires: {new Date(guildBoss.expiresAt).toLocaleString()}</Text>
              <Text style={styles.metaText}>Participants: {guildBoss.participantUids.length}</Text>
            </>
          )}
          <View style={styles.friendActions}>
            <Pressable
              style={({ pressed }) => [
                styles.smallBtn,
                guildBusy && styles.sendBtnDisabled,
                pressed && !guildBusy && styles.smallBtnPressed,
              ]}
              disabled={guildBusy}
              onPress={async () => {
                if (!me.uid) return;
                setGuildBusy(true);
                setError(null);
                try {
                  const boss = await ensureActiveBoss(me.uid);
                  setGuildBoss(boss);
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Failed to start boss.';
                  setError(msg);
                } finally {
                  setGuildBusy(false);
                }
              }}
            >
              <Text style={styles.smallBtnText}>Summon / Refresh</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.smallBtn,
                !canAttackBoss && styles.sendBtnDisabled,
                pressed && canAttackBoss && styles.smallBtnPressed,
              ]}
              disabled={!canAttackBoss}
              onPress={async () => {
                if (!me.uid) return;
                setGuildBusy(true);
                setError(null);
                try {
                  const result = await attackBoss({
                    uid: me.uid,
                    displayName: me.name,
                    dps: Math.max(1, Math.floor(me.level * 10_000_000)),
                  });
                  setGuildBoss(result.boss);
                  setLocalBossCooldownUntil(Date.now() + BOSS_ATTACK_COOLDOWN_MS);
                  await refreshGuildData();
                  if (result.rewardGranted) setError('Boss defeated. Guild rewards sent by mail.');
                } catch (err) {
                  const msg = err instanceof Error ? err.message : 'Failed to attack boss.';
                  const minutesLeft = parseCooldownMinutes(msg);
                  if (minutesLeft) setLocalBossCooldownUntil(Date.now() + minutesLeft * 60_000);
                  setError(msg);
                } finally {
                  setGuildBusy(false);
                }
              }}
            >
              <Text style={styles.smallBtnText}>{attackButtonLabel}</Text>
            </Pressable>
          </View>
          {guildBoss && guildBoss.status === 'active' && bossCooldownRemainingMs > 0 && (
            <Text style={styles.metaText}>Boss attack cooldown active. Ready in {formatCooldownHoursMinutes(bossCooldownRemainingMs)}.</Text>
          )}
        </View>
      )}

      {myGuild && guildSubTab === 'events' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Guild Events</Text>
          <Text style={styles.metaText}>Coordinate and contribute before event timers expire.</Text>
          <View style={styles.friendActions}>
            <Pressable
              style={({ pressed }) => [
                styles.smallBtn,
                (!isLeader || guildBusy) && styles.sendBtnDisabled,
                pressed && isLeader && !guildBusy && styles.smallBtnPressed,
              ]}
              disabled={!isLeader || guildBusy}
              onPress={() => {
                if (activeWarEvent) {
                  setPendingEventRestartType('war');
                  return;
                }
                void startGuildEvent('war', false);
              }}
            >
              <Text style={styles.smallBtnText}>{activeWarEvent ? 'Restart War' : 'Start War'}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.smallBtn,
                (!isLeader || guildBusy) && styles.sendBtnDisabled,
                pressed && isLeader && !guildBusy && styles.smallBtnPressed,
              ]}
              disabled={!isLeader || guildBusy}
              onPress={() => {
                if (activeExpeditionEvent) {
                  setPendingEventRestartType('expedition');
                  return;
                }
                void startGuildEvent('expedition', false);
              }}
            >
              <Text style={styles.smallBtnText}>{activeExpeditionEvent ? 'Restart Expedition' : 'Start Expedition'}</Text>
            </Pressable>
          </View>
          {!isLeader && (
            <Text style={styles.metaText}>Only guild leader can launch new events in the current ruleset.</Text>
          )}
          {!!pendingEventRestartType && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Forfeit Current Progress?</Text>
              <Text style={styles.metaText}>
                {pendingEventRestartType === 'war'
                  ? 'Restarting Warfront will reset current war progress and start over.'
                  : 'Restarting Expedition will reset current expedition progress and start over.'}
              </Text>
              <Text style={styles.metaText}>
                {pendingEventRestartType === 'war'
                  ? (() => {
                    const total = Number(activeWarEvent?.details.totalDamage ?? 0);
                    const target = Number(activeWarEvent?.details.targetDamage ?? 1);
                    const pct = Math.min(100, Math.floor((total / Math.max(1, target)) * 100));
                    return `Current progress: ${total.toLocaleString()} / ${target.toLocaleString()} (${pct}%)`;
                  })()
                  : (() => {
                    const total = Number(activeExpeditionEvent?.details.totalKills ?? 0);
                    const target = Number(activeExpeditionEvent?.details.targetKills ?? 1);
                    const pct = Math.min(100, Math.floor((total / Math.max(1, target)) * 100));
                    return `Current progress: ${total.toLocaleString()} / ${target.toLocaleString()} (${pct}%)`;
                  })()}
              </Text>
              <View style={styles.friendActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.smallBtn,
                    guildBusy && styles.sendBtnDisabled,
                    pressed && !guildBusy && styles.smallBtnPressed,
                  ]}
                  disabled={guildBusy}
                  onPress={() => setPendingEventRestartType(null)}
                >
                  <Text style={styles.smallBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.smallBtn,
                    styles.smallBtnDanger,
                    guildBusy && styles.sendBtnDisabled,
                    pressed && !guildBusy && styles.smallBtnPressed,
                  ]}
                  disabled={guildBusy}
                  onPress={() => {
                    if (!pendingEventRestartType) return;
                    void startGuildEvent(pendingEventRestartType, true);
                  }}
                >
                  <Text style={styles.smallBtnText}>Forfeit & Restart</Text>
                </Pressable>
              </View>
            </View>
          )}
          {guildEvents.length === 0 && <Text style={styles.metaText}>No guild events yet.</Text>}
          {guildEvents.map(event => {
            const isWar = event.type === 'war';
            const total = Number(event.details[isWar ? 'totalDamage' : 'totalKills'] ?? 0);
            const target = Number(event.details[isWar ? 'targetDamage' : 'targetKills'] ?? 1);
            const pct = Math.min(100, Math.floor((total / Math.max(1, target)) * 100));
            const contributors = eventContribByEventId[event.eventId] ?? [];
            const contributorsLoaded = eventContribByEventId[event.eventId] !== undefined;
            const myContributionRow = contributors.find(row => row.uid === me.uid) ?? null;
            const persistedCooldownUntil = (myContributionRow?.lastContributedAt ?? 0) + EVENT_CONTRIBUTION_COOLDOWN_MS;
            const localCooldownUntil = eventCooldownUntilById[event.eventId] ?? 0;
            const eventCooldownRemainingMs = Math.max(0, Math.max(persistedCooldownUntil, localCooldownUntil) - nowMs);
            const canContribute = !guildBusy && contributorsLoaded && event.status === 'active' && eventCooldownRemainingMs <= 0;
            const topContributors = contributors.slice(0, 3);
            return (
              <View key={event.eventId} style={styles.friendRow}>
                <View style={styles.friendMeta}>
                  <Text style={styles.friendName}>{isWar ? 'Warfront Assault' : 'Expedition'} • {event.status}</Text>
                  <Text style={styles.metaText}>Progress: {total.toLocaleString()} / {target.toLocaleString()} ({pct}%)</Text>
                  <SocialProgressBar
                    styles={styles}
                    progress={pct / 100}
                    label={`${pct}% completion`}
                    tint={pct >= 100 ? '#67E6B6' : '#7EC8FF'}
                  />
                  <Text style={styles.metaText}>Ends: {new Date(event.endsAt).toLocaleString()}</Text>
                  {myContributionRow && (
                    <Text style={styles.metaText}>Your total contribution: {formatCompactNumber(myContributionRow.totalContributed)}</Text>
                  )}
                  {topContributors.length > 0 && (
                    <Text style={styles.metaText}>
                      Top contributors: {topContributors
                        .map((row, idx) => {
                          const memberName = guildMembers.find(member => member.uid === row.uid)?.displayName ?? row.uid.slice(0, 8);
                          return `#${idx + 1} ${memberName} ${formatCompactNumber(row.totalContributed)}`;
                        })
                        .join(' • ')}
                    </Text>
                  )}
                  {!contributorsLoaded && event.status === 'active' && (
                    <Text style={styles.metaText}>Syncing your cooldown status...</Text>
                  )}
                  {eventCooldownRemainingMs > 0 && (
                    <Text style={styles.metaText}>Your cooldown: {formatCooldownMinutesSeconds(eventCooldownRemainingMs)}</Text>
                  )}
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.smallBtn,
                    !canContribute && styles.sendBtnDisabled,
                    pressed && canContribute && styles.smallBtnPressed,
                  ]}
                  disabled={!canContribute}
                  onPress={async () => {
                    if (!me.uid) return;
                    setGuildBusy(true);
                    setError(null);
                    try {
                      await contributeToGuildEvent({
                        uid: me.uid,
                        eventId: event.eventId,
                        dps: isWar ? Math.max(1, Math.floor(me.level * 10_000_000)) : undefined,
                        kills: isWar ? undefined : Math.max(1, Math.floor(me.level * 12)),
                      });
                      setEventCooldownUntilById(prev => ({
                        ...prev,
                        [event.eventId]: Date.now() + EVENT_CONTRIBUTION_COOLDOWN_MS,
                      }));
                      await refreshGuildData();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Contribution failed.';
                      const secondsLeft = parseCooldownSeconds(msg);
                      if (secondsLeft) {
                        setEventCooldownUntilById(prev => ({
                          ...prev,
                          [event.eventId]: Date.now() + secondsLeft * 1000,
                        }));
                      }
                      setError(msg);
                    } finally {
                      setGuildBusy(false);
                    }
                  }}
                >
                  <Text style={styles.smallBtnText}>
                    {!contributorsLoaded && event.status === 'active'
                      ? 'Syncing...'
                      : eventCooldownRemainingMs > 0
                        ? `Contribute ${formatCooldownMinutesSeconds(eventCooldownRemainingMs)}`
                        : 'Contribute'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {myGuild && guildSubTab === 'treasury' && (
        <>
          {!treasuryEnabled && (
            <SocialCard styles={styles} title="Guild Treasury" subtitle="Staged rollout in progress.">
              <Text style={styles.metaText}>Treasury is currently disabled by feature flag for this build.</Text>
            </SocialCard>
          )}

          {treasuryEnabled && (
            <SocialCard styles={styles} title="Guild Treasury" subtitle="Shared reserves with role-gated withdrawals.">
              <SocialAsyncState styles={styles} isLoading={treasuryLoading} variant="inline" />
              <View style={styles.metricGrid}>
                <View style={styles.metricChip}>
                  <Text style={styles.metricLabel}>Balance</Text>
                  <Text style={styles.metricValue}>{(treasuryState?.balance ?? 0).toLocaleString()}</Text>
                </View>
                <View style={styles.metricChip}>
                  <Text style={styles.metricLabel}>Deposited</Text>
                  <Text style={styles.metricValue}>{(treasuryState?.totalDeposited ?? 0).toLocaleString()}</Text>
                </View>
                <View style={styles.metricChip}>
                  <Text style={styles.metricLabel}>Withdrawn</Text>
                  <Text style={styles.metricValue}>{(treasuryState?.totalWithdrawn ?? 0).toLocaleString()}</Text>
                </View>
                <View style={styles.metricChip}>
                  <Text style={styles.metricLabel}>Daily Outflow</Text>
                  <Text style={styles.metricValue}>{(treasuryState?.dailyWithdrawn ?? 0).toLocaleString()}</Text>
                </View>
              </View>

              <SocialInput
                styles={styles}
                value={treasuryAmountInput}
                onChangeText={setTreasuryAmountInput}
                placeholder="Amount"
                editable={!guildBusy && !treasuryLoading}
                maxLength={12}
                keyboardType="number-pad"
              />
              <SocialInput
                styles={styles}
                value={treasuryReasonInput}
                onChangeText={setTreasuryReasonInput}
                placeholder="Reason (optional)"
                editable={!guildBusy && !treasuryLoading}
                maxLength={80}
              />

              <View style={styles.friendActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.smallBtn,
                    (guildBusy || treasuryLoading || parsePositiveInt(treasuryAmountInput) <= 0) && styles.sendBtnDisabled,
                    pressed && !guildBusy && !treasuryLoading && parsePositiveInt(treasuryAmountInput) > 0 && styles.smallBtnPressed,
                  ]}
                  disabled={guildBusy || treasuryLoading || parsePositiveInt(treasuryAmountInput) <= 0}
                  onPress={async () => {
                    if (!me.uid) return;
                    const amount = parsePositiveInt(treasuryAmountInput);
                    if (amount <= 0) {
                      setError('Enter a valid treasury amount.');
                      return;
                    }
                    setGuildBusy(true);
                    setError(null);
                    try {
                      const nextState = await transactGuildTreasury({
                        uid: me.uid,
                        displayName: me.name,
                        type: 'deposit',
                        amount,
                        reason: treasuryReasonInput,
                      });
                      setTreasuryState(nextState);
                      const nextLedger = await fetchGuildTreasuryLedger(me.uid, 18);
                      setTreasuryLedger(nextLedger);
                      setTreasuryReasonInput('');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Deposit failed.';
                      setError(msg);
                    } finally {
                      setGuildBusy(false);
                    }
                  }}
                >
                  <Text style={styles.smallBtnText}>Deposit</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    styles.smallBtn,
                    (!canWithdrawFromTreasury || guildBusy || treasuryLoading || parsePositiveInt(treasuryAmountInput) <= 0) && styles.sendBtnDisabled,
                    pressed && canWithdrawFromTreasury && !guildBusy && !treasuryLoading && parsePositiveInt(treasuryAmountInput) > 0 && styles.smallBtnPressed,
                  ]}
                  disabled={!canWithdrawFromTreasury || guildBusy || treasuryLoading || parsePositiveInt(treasuryAmountInput) <= 0}
                  onPress={async () => {
                    if (!me.uid) return;
                    const amount = parsePositiveInt(treasuryAmountInput);
                    if (amount <= 0) {
                      setError('Enter a valid treasury amount.');
                      return;
                    }
                    setGuildBusy(true);
                    setError(null);
                    try {
                      const nextState = await transactGuildTreasury({
                        uid: me.uid,
                        displayName: me.name,
                        type: 'withdrawal',
                        amount,
                        reason: treasuryReasonInput,
                      });
                      setTreasuryState(nextState);
                      const nextLedger = await fetchGuildTreasuryLedger(me.uid, 18);
                      setTreasuryLedger(nextLedger);
                      setTreasuryReasonInput('');
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Withdrawal failed.';
                      setError(msg);
                    } finally {
                      setGuildBusy(false);
                    }
                  }}
                >
                  <Text style={styles.smallBtnText}>Withdraw</Text>
                </Pressable>
              </View>

              {!canWithdrawFromTreasury && (
                <Text style={styles.metaText}>Withdrawals require officer or leader rank.</Text>
              )}
              {canWithdrawFromTreasury && (
                <Text style={styles.metaText}>
                  Daily withdrawal cap: {treasuryDailyCap.toLocaleString()} • Remaining today: {treasuryRemainingWithdrawToday.toLocaleString()}
                </Text>
              )}
            </SocialCard>
          )}

          {treasuryEnabled && (
            <SocialCard styles={styles} title="Treasury Ledger" subtitle="Transparent guild fund activity.">
              <SocialAsyncState
                styles={styles}
                isLoading={treasuryLoading}
                isEmpty={!treasuryLoading && treasuryLedger.length === 0}
                emptyTitle="No Treasury Activity"
                emptySubtitle="Deposits and withdrawals will appear here."
                variant="inline"
              />
              {treasuryLedger.map(entry => (
                <View key={entry.id} style={styles.friendRow}>
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>{entry.type === 'deposit' ? 'Deposit' : 'Withdrawal'} • {entry.amount.toLocaleString()}</Text>
                    <Text style={styles.metaText}>{entry.actorName} ({entry.actorRank}) • {new Date(entry.createdAt).toLocaleString()}</Text>
                    {!!entry.reason && <Text style={styles.metaText}>Reason: {entry.reason}</Text>}
                  </View>
                </View>
              ))}
            </SocialCard>
          )}
        </>
      )}

      {!myGuild && (
        <SocialCard styles={styles} title="Browse Guilds">
          <SocialInput
            styles={styles}
            value={guildSearchInput}
            onChangeText={setGuildSearchInput}
            placeholder="Search guilds"
            editable={!guildBusy}
            maxLength={32}
          />
          <SocialAsyncState
            styles={styles}
            isEmpty={guildList.length === 0}
            emptyTitle="No Guilds Found"
            emptySubtitle="Try a different search term or create your own guild."
            variant="inline"
          />
          {guildList.map(row => (
            <View key={row.guildId} style={styles.friendRow}>
              <View style={styles.friendMeta}>
                <Text style={styles.friendName}>[{row.tag}] {row.name}</Text>
                <Text style={styles.metaText}>Leader: {row.leaderName} • Members: {row.memberCount} • Lv.{row.level}</Text>
              </View>
              <Pressable
                style={styles.smallBtn}
                disabled={guildBusy || level < 1}
                onPress={async () => {
                  if (!me.uid) return;
                  setGuildBusy(true);
                  setError(null);
                  try {
                    await joinGuild({
                      uid: me.uid,
                      displayName: me.name,
                      guildId: row.guildId,
                      playerLevel: me.level,
                    });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to join guild.';
                    setError(msg);
                  } finally {
                    setGuildBusy(false);
                  }
                }}
              >
                <Text style={styles.smallBtnText}>Join</Text>
              </Pressable>
            </View>
          ))}
        </SocialCard>
      )}
    </>
  );
}
