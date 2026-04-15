import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import {
  type ActiveWar,
  type WarChallenge,
  type WarContributor,
  type WarHistoryEntry,
  acceptWarChallenge,
  contributeWarDamage,
  declineWarChallenge,
  fetchActiveWar,
  fetchIncomingChallenges,
  fetchOutgoingChallenges,
  fetchWarContributors,
  fetchWarHistory,
  findMatchableGuilds,
  sendWarChallenge,
  subscribeToActiveWar,
} from '../../../services/guildWars';
import { SocialAsyncState, SocialProgressBar } from './SocialPrimitives';
import { socialStyles as styles } from './social.styles';
import { useSocialMe, useSocialGuild } from './SocialContext';
import { trackEvent } from '../../../telemetry';

type WarSubView = 'overview' | 'matchmake' | 'history';

export function GuildWarsSection() {
  const { me } = useSocialMe();
  const guild = useSocialGuild();
  const myGuildId = guild.myGuild?.guildId ?? '';
  const isLeader = guild.isLeader;
  const [subView, setSubView] = useState<WarSubView>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Active war state ---
  const [activeWar, setActiveWar] = useState<ActiveWar | null>(null);
  const [contributors, setContributors] = useState<WarContributor[]>([]);
  const [contributionCooldownUntil, setContributionCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // --- Challenge state ---
  const [incomingChallenges, setIncomingChallenges] = useState<WarChallenge[]>([]);
  const [outgoingChallenges, setOutgoingChallenges] = useState<WarChallenge[]>([]);

  // --- Matchmaking state ---
  const [matchableGuilds, setMatchableGuilds] = useState<
    Array<{
      guildId: string;
      name: string;
      tag: string;
      level: number;
      memberCount: number;
    }>
  >([]);
  const [matchLoading, setMatchLoading] = useState(false);

  // --- History state ---
  const [history, setHistory] = useState<WarHistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // --- clock ---
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- initial load ---
  useEffect(() => {
    if (!me.uid) return;
    let cancelled = false;

    void (async () => {
      setBusy(true);
      try {
        const [war, incoming, outgoing] = await Promise.all([
          fetchActiveWar(me.uid),
          fetchIncomingChallenges(me.uid),
          fetchOutgoingChallenges(me.uid),
        ]);
        if (cancelled) return;
        setActiveWar(war);
        setIncomingChallenges(incoming);
        setOutgoingChallenges(outgoing);
      } catch {
        if (!cancelled) setError('Failed to load war data.');
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me.uid]);

  // --- real-time subscription to active war ---
  useEffect(() => {
    if (!activeWar?.warId) return;
    return subscribeToActiveWar(activeWar.warId, updated => setActiveWar(updated));
  }, [activeWar?.warId]);

  // --- load contributors when we have an active war ---
  useEffect(() => {
    if (!activeWar?.warId || !myGuildId) return;
    let cancelled = false;
    void fetchWarContributors(activeWar.warId, myGuildId).then(rows => {
      if (!cancelled) setContributors(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [activeWar?.warId, activeWar?.guildADamage, activeWar?.guildBDamage, myGuildId]);

  // --- Matchmaking load ---
  const loadMatches = useCallback(async () => {
    if (!me.uid || matchLoading) return;
    setMatchLoading(true);
    setError(null);
    try {
      const guilds = await findMatchableGuilds(me.uid);
      setMatchableGuilds(guilds);
      void trackEvent('guild_wars_matchmake_loaded', { count: guilds.length });
    } catch {
      setError('Failed to load matchable guilds.');
    } finally {
      setMatchLoading(false);
    }
  }, [me.uid, matchLoading]);

  // --- History load ---
  const loadHistory = useCallback(async () => {
    if (!me.uid) return;
    setError(null);
    try {
      const rows = await fetchWarHistory(me.uid);
      setHistory(rows);
      setHistoryLoaded(true);
    } catch {
      setError('Failed to load war history.');
    }
  }, [me.uid]);

  useEffect(() => {
    if (subView === 'matchmake' && matchableGuilds.length === 0 && !matchLoading) {
      void loadMatches();
    }
    if (subView === 'history' && !historyLoaded) {
      void loadHistory();
    }
  }, [subView, matchableGuilds.length, matchLoading, loadMatches, historyLoaded, loadHistory]);

  // --- Actions ---
  const handleDeclareWar = useCallback(
    async (targetGuildId: string) => {
      if (!me.uid || busy) return;
      setBusy(true);
      setError(null);
      try {
        const challenge = await sendWarChallenge(me.uid, targetGuildId);
        setOutgoingChallenges(prev => [challenge, ...prev]);
        setSubView('overview');
        void trackEvent('guild_wars_challenge_sent', { targetGuildId });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send challenge.');
      } finally {
        setBusy(false);
      }
    },
    [me.uid, busy],
  );

  const handleAcceptChallenge = useCallback(
    async (challengeId: string) => {
      if (!me.uid || busy) return;
      setBusy(true);
      setError(null);
      try {
        const war = await acceptWarChallenge(me.uid, challengeId);
        setActiveWar(war);
        setIncomingChallenges(prev => prev.filter(c => c.challengeId !== challengeId));
        void trackEvent('guild_wars_challenge_accepted', { warId: war.warId });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to accept challenge.');
      } finally {
        setBusy(false);
      }
    },
    [me.uid, busy],
  );

  const handleDeclineChallenge = useCallback(
    async (challengeId: string) => {
      if (!me.uid || busy) return;
      setBusy(true);
      try {
        await declineWarChallenge(me.uid, challengeId);
        setIncomingChallenges(prev => prev.filter(c => c.challengeId !== challengeId));
      } catch {
        setError('Failed to decline challenge.');
      } finally {
        setBusy(false);
      }
    },
    [me.uid, busy],
  );

  const handleContribute = useCallback(async () => {
    if (!me.uid || !activeWar?.warId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await contributeWarDamage({
        uid: me.uid,
        displayName: me.name,
        warId: activeWar.warId,
        dps: Math.max(1, Math.floor(me.level * 10_000_000)),
      });
      setActiveWar(updated);
      setContributionCooldownUntil(Date.now() + 5 * 60 * 1000);
      void trackEvent('guild_wars_contributed', { warId: activeWar.warId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to contribute.';
      if (msg.includes('cooldown')) {
        const m = msg.match(/\((\d+)s\)/);
        if (m) setContributionCooldownUntil(Date.now() + parseInt(m[1], 10) * 1000);
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, [me.uid, me.name, me.level, activeWar?.warId, busy]);

  const contribCooldownSecs = Math.max(0, Math.ceil((contributionCooldownUntil - nowMs) / 1000));
  const canContribute = !busy && !!activeWar && activeWar.status === 'active' && contribCooldownSecs <= 0;

  // --- determine which side we are ---
  const weAreA = activeWar?.guildAId === myGuildId;
  const myDamage = activeWar ? (weAreA ? activeWar.guildADamage : activeWar.guildBDamage) : 0;
  const myTarget = activeWar ? (weAreA ? activeWar.guildATarget : activeWar.guildBTarget) : 1;
  const oppDamage = activeWar ? (weAreA ? activeWar.guildBDamage : activeWar.guildADamage) : 0;
  const oppTarget = activeWar ? (weAreA ? activeWar.guildBTarget : activeWar.guildATarget) : 1;
  const oppName = activeWar ? (weAreA ? activeWar.guildBName : activeWar.guildAName) : '';
  const oppTag = activeWar ? (weAreA ? activeWar.guildBTag : activeWar.guildATag) : '';
  const myGuildName = activeWar ? (weAreA ? activeWar.guildAName : activeWar.guildBName) : '';

  const timeRemaining = activeWar ? Math.max(0, activeWar.endsAt - nowMs) : 0;
  const hoursLeft = Math.floor(timeRemaining / 3_600_000);
  const minsLeft = Math.floor((timeRemaining % 3_600_000) / 60_000);

  return (
    <View style={styles.root}>
      {/* Sub-view tabs */}
      <View style={styles.subTabRow}>
        {(['overview', 'matchmake', 'history'] as const).map(tab => (
          <Pressable
            key={tab}
            style={[styles.subTabBtn, subView === tab && styles.subTabBtnActive]}
            onPress={() => setSubView(tab)}
          >
            <Text style={[styles.subTabText, subView === tab && styles.subTabTextActive]}>
              {tab === 'overview' ? 'War Room' : tab === 'matchmake' ? 'Declare War' : 'History'}
            </Text>
            {tab === 'overview' && incomingChallenges.length > 0 && <View style={styles.subTabDot} />}
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* ─── OVERVIEW ──────────────────────────────────────────────────── */}
      {subView === 'overview' && (
        <View style={styles.sectionTransition}>
          {/* Active War card */}
          {activeWar && activeWar.status === 'active' && (
            <View style={styles.heroCard}>
              <View style={styles.heroTitleRow}>
                <Text style={styles.heroTitle}>
                  ⚔️ {myGuildName} vs {oppName}
                </Text>
                <Text style={styles.heroPulse}>LIVE</Text>
              </View>
              <Text style={styles.heroSubtitle}>
                Time remaining: {hoursLeft}h {minsLeft}m
              </Text>

              {/* Our progress */}
              <SocialProgressBar
                styles={styles}
                progress={myDamage / Math.max(1, myTarget)}
                label={`Your Guild — ${formatDmg(myDamage)} / ${formatDmg(myTarget)}`}
                tint="#67E6B6"
              />

              {/* Opponent progress */}
              <SocialProgressBar
                styles={styles}
                progress={oppDamage / Math.max(1, oppTarget)}
                label={`[${oppTag}] ${oppName} — ${formatDmg(oppDamage)} / ${formatDmg(oppTarget)}`}
                tint="#FF7A90"
              />

              {/* Contribute button */}
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
                <Pressable
                  style={({ pressed }) => [
                    styles.sendBtn,
                    !canContribute && styles.sendBtnDisabled,
                    pressed && canContribute && styles.sendBtnPressed,
                  ]}
                  disabled={!canContribute}
                  onPress={handleContribute}
                >
                  <Text style={styles.sendBtnText}>
                    {contribCooldownSecs > 0
                      ? `Cooldown ${Math.floor(contribCooldownSecs / 60)}:${String(contribCooldownSecs % 60).padStart(2, '0')}`
                      : 'Strike!'}
                  </Text>
                </Pressable>
              </View>

              {/* Top contributors */}
              {contributors.length > 0 && (
                <View style={{ marginTop: 8, gap: 4 }}>
                  <Text style={styles.sectionLabel}>Top Warriors</Text>
                  {contributors.slice(0, 5).map((c, i) => (
                    <View key={c.uid} style={styles.friendRow}>
                      <View style={styles.friendMeta}>
                        <Text style={styles.friendName}>
                          #{i + 1} {c.displayName}
                        </Text>
                        <Text style={styles.metaText}>{formatDmg(c.totalDamage)} damage</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Completed war banner */}
          {activeWar && activeWar.status === 'completed' && (
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>{activeWar.winnerId === myGuildId ? '🏆 Victory!' : '💀 Defeat'}</Text>
              <Text style={styles.heroSubtitle}>
                {myGuildName}: {formatDmg(myDamage)} vs [{oppTag}] {oppName}: {formatDmg(oppDamage)}
              </Text>
            </View>
          )}

          {/* No active war */}
          {!activeWar && !busy && (
            <SocialAsyncState
              styles={styles}
              isEmpty
              emptyTitle="No Active War"
              emptySubtitle={
                isLeader
                  ? 'Declare war on another guild from the Declare War tab.'
                  : 'Your guild leader can start a war from the Declare War tab.'
              }
            />
          )}

          {busy && !activeWar && <SocialAsyncState styles={styles} isLoading />}

          {/* Incoming challenges */}
          {incomingChallenges.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🏴 Incoming Challenges</Text>
              {incomingChallenges.map(c => (
                <View key={c.challengeId} style={styles.friendRow}>
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>
                      [{c.challengerTag}] {c.challengerName}
                    </Text>
                    <Text style={styles.metaText}>
                      Level {c.challengerLevel} • Expires {formatTimeLeft(c.expiresAt - nowMs)}
                    </Text>
                  </View>
                  {isLeader && (
                    <View style={styles.friendActions}>
                      <Pressable
                        style={({ pressed }) => [styles.smallBtn, pressed && styles.smallBtnPressed]}
                        onPress={() => handleAcceptChallenge(c.challengeId)}
                        disabled={busy}
                      >
                        <Text style={styles.smallBtnText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [
                          styles.smallBtn,
                          styles.smallBtnDanger,
                          pressed && styles.smallBtnPressed,
                        ]}
                        onPress={() => handleDeclineChallenge(c.challengeId)}
                        disabled={busy}
                      >
                        <Text style={styles.smallBtnText}>Decline</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Outgoing challenges */}
          {outgoingChallenges.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📤 Outgoing Challenges</Text>
              {outgoingChallenges.map(c => (
                <View key={c.challengeId} style={styles.friendRow}>
                  <View style={styles.friendMeta}>
                    <Text style={styles.friendName}>
                      [{c.defenderTag}] {c.defenderName}
                    </Text>
                    <Text style={styles.metaText}>
                      Level {c.defenderLevel} • Expires {formatTimeLeft(c.expiresAt - nowMs)}
                    </Text>
                  </View>
                  <Text style={styles.statusBadge}>Pending</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ─── MATCHMAKING / DECLARE WAR ─────────────────────────────────── */}
      {subView === 'matchmake' && (
        <View style={styles.sectionTransition}>
          {!isLeader && (
            <View style={styles.card}>
              <Text style={styles.metaText}>Only your guild leader can declare war.</Text>
            </View>
          )}
          {isLeader && (
            <>
              <Pressable
                style={({ pressed }) => [styles.smallBtn, pressed && styles.smallBtnPressed]}
                onPress={loadMatches}
                disabled={matchLoading}
              >
                <Text style={styles.smallBtnText}>{matchLoading ? 'Scanning...' : 'Refresh Guilds'}</Text>
              </Pressable>

              {matchLoading && <SocialAsyncState styles={styles} isLoading />}

              {!matchLoading && matchableGuilds.length === 0 && (
                <SocialAsyncState
                  styles={styles}
                  isEmpty
                  emptyTitle="No Guilds Found"
                  emptySubtitle="No other guilds available to challenge right now."
                />
              )}

              <FlatList
                data={matchableGuilds}
                keyExtractor={g => g.guildId}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.friendRow}>
                    <View style={styles.friendMeta}>
                      <Text style={styles.friendName}>
                        [{item.tag}] {item.name}
                      </Text>
                      <Text style={styles.metaText}>
                        Level {item.level} • {item.memberCount} members
                      </Text>
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.smallBtn, pressed && styles.smallBtnPressed]}
                      onPress={() => handleDeclareWar(item.guildId)}
                      disabled={busy}
                    >
                      <Text style={styles.smallBtnText}>⚔️ Challenge</Text>
                    </Pressable>
                  </View>
                )}
              />
            </>
          )}
        </View>
      )}

      {/* ─── HISTORY ───────────────────────────────────────────────────── */}
      {subView === 'history' && (
        <View style={styles.sectionTransition}>
          {!historyLoaded && <SocialAsyncState styles={styles} isLoading />}

          {historyLoaded && history.length === 0 && (
            <SocialAsyncState
              styles={styles}
              isEmpty
              emptyTitle="No War History"
              emptySubtitle="Completed wars will appear here."
            />
          )}

          {history.map(h => (
            <View key={h.warId} style={styles.friendRow}>
              <View style={styles.friendMeta}>
                <Text
                  style={[
                    styles.friendName,
                    {
                      color: h.result === 'win' ? '#67E6B6' : h.result === 'loss' ? '#FF7A90' : '#F9D66D',
                    },
                  ]}
                >
                  {h.result === 'win' ? '🏆 Victory' : h.result === 'loss' ? '💀 Defeat' : '🤝 Draw'}
                </Text>
                <Text style={styles.metaText}>
                  vs [{h.opponentTag}] {h.opponentName}
                </Text>
                <Text style={styles.metaText}>
                  {formatDmg(h.myGuildDamage)} vs {formatDmg(h.opponentDamage)} • {formatDate(h.completedAt)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Formatting helpers ────────────────────────────────────────────────────

function formatDmg(n: number): string {
  if (n >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(ts: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
