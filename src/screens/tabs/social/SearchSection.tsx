import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { searchPlayers, PlayerSearchResult } from '../../../services/playerSearch';
import { SocialCard, SocialInput, SocialPrimaryButton } from './SocialPrimitives';
import { socialStyles as styles } from './social.styles';
import { useSocialMe } from './SocialContext';
import { trackEvent } from '../../../telemetry';

export function SearchSection({ onViewProfile }: { onViewProfile: (uid: string) => void }) {
  const { me } = useSocialMe();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2 || busy) return;

    setBusy(true);
    setError(null);
    try {
      const rows = await searchPlayers(trimmed);
      setResults(rows.filter(r => r.uid !== me.uid));
      setSearched(true);
      void trackEvent('social_player_search', { queryLength: trimmed.length, resultCount: rows.length });
    } catch {
      setError('Search failed. Try again.');
    } finally {
      setBusy(false);
    }
  }, [query, busy, me.uid]);

  const renderItem = useCallback(
    ({ item }: { item: PlayerSearchResult }) => (
      <Pressable style={styles.friendRow} onPress={() => onViewProfile(item.uid)}>
        <View style={styles.friendMeta}>
          <Text style={styles.friendName}>{item.publicUsername}</Text>
          <Text style={styles.metaText}>
            Lv.{item.level ?? '?'}
            {item.guildName ? ` • [${item.guildTag ?? ''}] ${item.guildName}` : ''}
          </Text>
        </View>
        <View style={styles.smallBtn}>
          <Text style={styles.smallBtnText}>Profile</Text>
        </View>
      </Pressable>
    ),
    [onViewProfile],
  );

  return (
    <SocialCard styles={styles} title="Player Search" subtitle="Find players by username">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <SocialInput
          styles={styles}
          style={{ flex: 1 }}
          placeholder="Enter username (min 2 chars)..."
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={doSearch}
          maxLength={24}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <SocialPrimaryButton
          styles={styles}
          label={busy ? '...' : 'Search'}
          onPress={doSearch}
          disabled={busy || query.trim().length < 2}
        />
      </View>

      {!!error && <Text style={styles.errorText}>⚠️ {error}</Text>}

      {searched && results.length === 0 && !error && (
        <Text style={styles.metaText}>No players found matching "{query.trim()}"</Text>
      )}

      {results.length > 0 && (
        <FlatList data={results} keyExtractor={item => item.uid} renderItem={renderItem} scrollEnabled={false} />
      )}
    </SocialCard>
  );
}
