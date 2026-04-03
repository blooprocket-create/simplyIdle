import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  attackBoss,
  contributeToGuildEvent,
  createGuild,
  ensureActiveBoss,
  GuildBossState,
  GuildBrowseRow,
  GuildChatMessage,
  GuildEventState,
  GuildMember,
  GuildSummary,
  joinGuild,
  setMemberRank,
  startEvent,
  sendGuildChatMessage,
  leaveGuild,
} from '../../../services/guild';
import { SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';

type GuildSubTab = 'home' | 'boss' | 'events' | 'chat';

const BOSS_ATTACK_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const EVENT_CONTRIBUTION_COOLDOWN_MS = 5 * 60 * 1000;

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
  guildChat: GuildChatMessage[];
  guildChatDraft: string;
  setGuildChatDraft: (value: string) => void;
  setError: (value: string | null) => void;
  setGuildBusy: (value: boolean) => void;
  refreshGuildData: () => Promise<void>;
  formatTime: (ts: number) => string;
  setConfirmKickMember: (member: GuildMember) => void;
  setConfirmTransferLeader: (member: GuildMember) => void;
  setConfirmDisbandGuild: (value: boolean) => void;
}

export function GuildSection({
  styles,
  me,
  diamonds,
  saveSlotId,
  level,
  error,
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
  guildChat,
  guildChatDraft,
  setGuildChatDraft,
  setError,
  setGuildBusy,
  refreshGuildData,
  formatTime,
  setConfirmKickMember,
  setConfirmTransferLeader,
  setConfirmDisbandGuild,
}: GuildSectionProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [localBossCooldownUntil, setLocalBossCooldownUntil] = useState(0);
  const [eventCooldownUntilById, setEventCooldownUntilById] = useState<Record<string, number>>({});

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setLocalBossCooldownUntil(0);
    setEventCooldownUntilById({});
  }, [myGuild?.guildId, me.uid]);

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

  const myGuildMember = useMemo(
    () => guildMembers.find(member => member.uid === me.uid) ?? null,
    [guildMembers, me.uid],
  );

  const persistedBossCooldownUntil = (myGuildMember?.lastBossAttackAt ?? 0) + BOSS_ATTACK_COOLDOWN_MS;
  const bossCooldownUntil = Math.max(localBossCooldownUntil, persistedBossCooldownUntil);
  const bossCooldownRemainingMs = Math.max(0, bossCooldownUntil - nowMs);
  const canAttackBoss = !guildBusy && !!guildBoss && guildBoss.status === 'active' && bossCooldownRemainingMs <= 0;
  const attackButtonLabel = !guildBoss || guildBoss.status !== 'active'
    ? 'Attack Unavailable'
    : bossCooldownRemainingMs > 0
      ? `Attack ${formatCooldownHoursMinutes(bossCooldownRemainingMs)}`
      : 'Attack Ready';

  return (
    <>
      <SocialCard styles={styles} title="Guild Command" subtitle="Create Guild Cost: 2,500 Diamonds.">
        <Text style={styles.metaText}>Your Diamonds: {diamonds}</Text>
        {guildBusy && <Text style={styles.metaText}>Syncing guild actions...</Text>}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </SocialCard>

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
          <View style={styles.prefRow}>
            <Pressable style={[styles.prefBtn, guildSubTab === 'home' && styles.prefBtnActive]} onPress={() => setGuildSubTab('home')}>
              <Text style={styles.prefBtnText}>Home</Text>
            </Pressable>
            <Pressable style={[styles.prefBtn, guildSubTab === 'boss' && styles.prefBtnActive]} onPress={() => setGuildSubTab('boss')}>
              <Text style={styles.prefBtnText}>Boss</Text>
            </Pressable>
            <Pressable style={[styles.prefBtn, guildSubTab === 'events' && styles.prefBtnActive]} onPress={() => setGuildSubTab('events')}>
              <Text style={styles.prefBtnText}>Events</Text>
            </Pressable>
            <Pressable style={[styles.prefBtn, guildSubTab === 'chat' && styles.prefBtnActive]} onPress={() => setGuildSubTab('chat')}>
              <Text style={styles.prefBtnText}>Chat</Text>
            </Pressable>
          </View>
        </View>
      )}

      {myGuild && guildSubTab === 'home' && (
        <View style={styles.card}>
          <Text style={styles.metaText}>Guild profile and members</Text>
          <Text style={styles.metaText}>{myGuild.description || 'No description set.'}</Text>
          <Text style={styles.metaText}>Leader: {myGuild.leaderName} • Members: {myGuild.memberCount}/{myGuild.maxMembers}</Text>
          <Text style={styles.metaText}>Min Join Level: {myGuild.minLevelToJoin} • Public: {myGuild.isPublic ? 'Yes' : 'No'}</Text>
          {guildMembers.slice(0, 12).map(member => (
            <View key={member.uid} style={styles.friendRow}>
              <View style={styles.friendMeta}>
                <Text style={styles.friendName}>{member.displayName}</Text>
                <Text style={styles.metaText}>{member.rank} • Boss Damage {Math.floor(member.guildContribution).toLocaleString()}</Text>
              </View>
              {myGuild.leaderId === me.uid && member.uid !== me.uid && (
                <View style={styles.friendActions}>
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
            </View>
          ))}
          {myGuild.leaderId !== me.uid && (
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
          {myGuild.leaderId === me.uid && (
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
        </View>
      )}

      {myGuild && guildSubTab === 'boss' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Guild Boss</Text>
          {!guildBoss && <Text style={styles.metaText}>No active boss right now.</Text>}
          {guildBoss && (
            <>
              <Text style={styles.metaText}>{guildBoss.name} • Tier {guildBoss.tier}</Text>
              <Text style={styles.metaText}>HP: {Math.floor(guildBoss.currentHp).toLocaleString()} / {Math.floor(guildBoss.maxHp).toLocaleString()}</Text>
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
          {myGuild.leaderId === me.uid && (
            <View style={styles.friendActions}>
              <Pressable
                style={styles.smallBtn}
                disabled={guildBusy}
                onPress={async () => {
                  if (!me.uid) return;
                  setGuildBusy(true);
                  setError(null);
                  try {
                    await startEvent({ uid: me.uid, type: 'war' });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to start war.';
                    setError(msg);
                  } finally {
                    setGuildBusy(false);
                  }
                }}
              >
                <Text style={styles.smallBtnText}>Start War</Text>
              </Pressable>
              <Pressable
                style={styles.smallBtn}
                disabled={guildBusy}
                onPress={async () => {
                  if (!me.uid) return;
                  setGuildBusy(true);
                  setError(null);
                  try {
                    await startEvent({ uid: me.uid, type: 'expedition' });
                    await refreshGuildData();
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Failed to start expedition.';
                    setError(msg);
                  } finally {
                    setGuildBusy(false);
                  }
                }}
              >
                <Text style={styles.smallBtnText}>Start Expedition</Text>
              </Pressable>
            </View>
          )}
          {guildEvents.length === 0 && <Text style={styles.metaText}>No guild events yet.</Text>}
          {guildEvents.map(event => {
            const isWar = event.type === 'war';
            const total = Number(event.details[isWar ? 'totalDamage' : 'totalKills'] ?? 0);
            const target = Number(event.details[isWar ? 'targetDamage' : 'targetKills'] ?? 1);
            const pct = Math.min(100, Math.floor((total / Math.max(1, target)) * 100));
            return (
              <View key={event.eventId} style={styles.friendRow}>
                <View style={styles.friendMeta}>
                  <Text style={styles.friendName}>{isWar ? 'Warfront Assault' : 'Expedition'} • {event.status}</Text>
                  <Text style={styles.metaText}>Progress: {total.toLocaleString()} / {target.toLocaleString()} ({pct}%)</Text>
                  <Text style={styles.metaText}>Ends: {new Date(event.endsAt).toLocaleString()}</Text>
                </View>
                <Pressable
                  style={({ pressed }) => {
                    const eventCooldownRemainingMs = Math.max(0, (eventCooldownUntilById[event.eventId] ?? 0) - nowMs);
                    const canContribute = !guildBusy && event.status === 'active' && eventCooldownRemainingMs <= 0;
                    return [
                      styles.smallBtn,
                      !canContribute && styles.sendBtnDisabled,
                      pressed && canContribute && styles.smallBtnPressed,
                    ];
                  }}
                  disabled={guildBusy || event.status !== 'active' || Math.max(0, (eventCooldownUntilById[event.eventId] ?? 0) - nowMs) > 0}
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
                    {(() => {
                      const remainingMs = Math.max(0, (eventCooldownUntilById[event.eventId] ?? 0) - nowMs);
                      return remainingMs > 0 ? `Contribute ${formatCooldownMinutesSeconds(remainingMs)}` : 'Contribute';
                    })()}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {myGuild && guildSubTab === 'chat' && (
        <SocialCard styles={styles} title="Guild Chat" subtitle="Tactical channel for your guild.">
          <View style={[styles.card, styles.chatListCard]}>
            {guildChat.length === 0 && <Text style={styles.metaText}>No guild messages yet.</Text>}
            <FlatList
              data={guildChat}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.chatRow}>
                  <View style={styles.chatHeaderRow}>
                    <Text style={styles.chatName}>{item.displayName}</Text>
                    <Text style={styles.chatTime}>{formatTime(item.sentAt)}</Text>
                  </View>
                  <Text style={styles.chatText}>{item.text}</Text>
                </View>
              )}
            />
          </View>
          <SocialInput
            styles={styles}
            value={guildChatDraft}
            onChangeText={setGuildChatDraft}
            placeholder="Message guild..."
            editable={!guildBusy}
            maxLength={300}
          />
          <SocialPrimaryButton
            styles={styles}
            label="Send"
            disabled={!guildChatDraft.trim() || guildBusy}
            onPress={async () => {
              if (!me.uid) return;
              setGuildBusy(true);
              setError(null);
              try {
                await sendGuildChatMessage({ uid: me.uid, displayName: me.name, text: guildChatDraft });
                setGuildChatDraft('');
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to send guild chat.';
                setError(msg);
              } finally {
                setGuildBusy(false);
              }
            }}
          />
        </SocialCard>
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
          {guildList.length === 0 && <Text style={styles.metaText}>No guilds found.</Text>}
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
