import 'react-native-reanimated';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import GameScreen from './src/screens/GameScreen';
import AuthScreen from './src/screens/AuthScreen';
import { debugLog, identifyTelemetryDevice, initTelemetry, trackEvent, trackTelemetryHeartbeat } from './src/telemetry';
import { getValidOnlineSession, isOnlineAuthAvailable, logoutOnline } from './src/services/onlineAuth';
import { getFirebaseAuth } from './src/services/firebase';
import { markPresenceOffline, startPresenceHeartbeat } from './src/services/presence';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState<string | null>(null);

  useEffect(() => {
    initTelemetry();
    void trackEvent('app_boot', {
      platform: Platform.OS,
      source: 'App.tsx',
    });
    void trackTelemetryHeartbeat('app_boot');
  }, []);

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
    (async () => {
      if (isOnlineAuthAvailable()) {
        const online = await getValidOnlineSession();
        if (online) {
          setAccountName(online);
          return;
        }
      }

    })()
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    debugLog('app', 'Session resolution complete', { hasAccount: !!accountName });
    void trackEvent('auth_session_resolved', {
      hasAccount: !!accountName,
      platform: Platform.OS,
    });
    void trackTelemetryHeartbeat('auth_session_resolved');
  }, [loading, accountName]);

  useEffect(() => {
    void identifyTelemetryDevice(accountName);
  }, [accountName]);

  useEffect(() => {
    if (!accountName) return;
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (!uid) return;

    const stop = startPresenceHeartbeat(uid, accountName, 1);
    return () => {
      stop();
      void markPresenceOffline(uid);
    };
  }, [accountName]);

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
        const uid = getFirebaseAuth()?.currentUser?.uid;
        if (uid) {
          await markPresenceOffline(uid);
        }
        if (isOnlineAuthAvailable()) {
          await logoutOnline();
        }
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
