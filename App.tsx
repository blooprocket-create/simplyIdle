import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GameScreen from './src/screens/GameScreen.tsx';
import AuthScreen, { AUTH_STORAGE_KEYS, getValidStoredSession } from './src/screens/AuthScreen.tsx';

// Conditionally import Analytics for web platform only
let Analytics: React.ComponentType | null = null;
if (Platform.OS === 'web') {
  try {
    // @ts-ignore - dynamic import for web platform
    const { Analytics: WebAnalytics } = require('@vercel/analytics/react');
    Analytics = WebAnalytics;
  } catch (e) {
    console.warn('Vercel Analytics not available:', e);
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    getValidStoredSession()
      .then(name => setAccountName(name))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>Loading...</Text>
        {Analytics && <Analytics />}
      </View>
    );
  }

  if (!accountName) {
    return (
      <>
        <AuthScreen onAuthenticated={setAccountName} />
        {Analytics && <Analytics />}
      </>
    );
  }

  return (
    <>
      <GameScreen
        accountName={accountName}
        onLogout={async () => {
          await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.session);
          setAccountName(null);
        }}
      />
      {Analytics && <Analytics />}
    </>
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
