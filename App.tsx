import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GameScreen from './src/screens/GameScreen.tsx';
import AuthScreen, { AUTH_STORAGE_KEYS, getValidStoredSession } from './src/screens/AuthScreen.tsx';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.height = '100%';
    html.style.overflow = 'auto';
    body.style.height = '100%';
    body.style.minHeight = '100%';
    body.style.overflowX = 'hidden';
    body.style.overflowY = 'auto';
    body.style.touchAction = 'pan-y pinch-zoom';
    body.style.setProperty('-webkit-overflow-scrolling', 'touch');
    body.style.overscrollBehaviorY = 'contain';

    if (root) {
      root.style.minHeight = '100%';
      root.style.overflow = 'visible';
      root.style.touchAction = 'pan-y pinch-zoom';
    }
  }, []);

  useEffect(() => {
    getValidStoredSession()
      .then(name => setAccountName(name))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!accountName) {
    return <AuthScreen onAuthenticated={setAccountName} />;
  }

  return (
    <GameScreen
      accountName={accountName}
      onLogout={async () => {
        await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.session);
        setAccountName(null);
      }}
    />
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A18',
  },
  loadingText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
