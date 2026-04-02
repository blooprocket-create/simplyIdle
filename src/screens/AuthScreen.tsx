import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { debugLog, trackGameplayAction } from '../telemetry';
import {
  getGoogleAuthConfig,
  isGoogleAuthAvailable,
  isOnlineAuthAvailable,
  loginOnline,
  loginOnlineWithGooglePopup,
  loginOnlineWithGoogleTokens,
  registerOnline,
} from '../services/onlineAuth';

WebBrowser.maybeCompleteAuthSession();

interface AuthScreenProps {
  onAuthenticated: (username: string) => void;
}

interface AccountRecord {
  username: string;
  createdAt: number;
  hashVersion: 1;
  passwordHash: string;
  passwordSalt: string;
  password?: string;
}

const ACCOUNTS_KEY = 'idlerpg_accounts_v1';
const SESSION_KEY = 'idlerpg_current_account_v1';
const STORAGE_PREFIXES_TO_CLEAR = ['idlerpg_', 'simplyidle_'];
const HASH_ROUNDS = 12000;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 24;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function randomSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(24);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  let current = `${salt}:${password}`;
  for (let i = 0; i < HASH_ROUNDS; i++) {
    current = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, current);
  }
  return current;
}

async function verifyPassword(record: AccountRecord, password: string): Promise<boolean> {
  if (record.passwordHash && record.passwordSalt) {
    const digest = await hashPassword(password, record.passwordSalt);
    return digest === record.passwordHash;
  }

  return !!record.password && record.password === password;
}

async function migrateLegacyRecord(record: AccountRecord): Promise<AccountRecord> {
  if (record.passwordHash && record.passwordSalt) return record;
  const salt = await randomSalt();
  const passwordHash = await hashPassword(record.password ?? '', salt);
  return {
    ...record,
    hashVersion: 1,
    passwordHash,
    passwordSalt: salt,
    password: undefined,
  };
}

async function loadAccounts(): Promise<AccountRecord[]> {
  const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as AccountRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAccounts(accounts: AccountRecord[]): Promise<void> {
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function mapAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code: unknown }).code) : '';

  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email is already registered. Log in instead or use Google.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Invalid email or password.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Google sign-in was canceled.';
    case 'auth/account-exists-with-different-credential':
      return 'That email already exists with another sign-in method.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      if (error instanceof Error && error.message.trim()) return error.message;
      return 'Authentication failed. Please try again.';
  }
}

export async function getValidStoredSession(): Promise<string | null> {
  const rawSession = await AsyncStorage.getItem(SESSION_KEY);
  if (!rawSession) return null;

  const normalizedSession = rawSession.trim().toLowerCase();
  if (!normalizedSession) {
    await AsyncStorage.removeItem(SESSION_KEY);
    return null;
  }

  const accounts = await loadAccounts();
  if (accounts.some(account => account.username === normalizedSession)) {
    return normalizedSession;
  }

  await AsyncStorage.removeItem(SESSION_KEY);
  return null;
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [knownUsernames, setKnownUsernames] = useState<string[]>([]);
  const onlineAuthEnabled = isOnlineAuthAvailable();
  const googleAuthEnabled = isGoogleAuthAvailable();
  const googleConfig = getGoogleAuthConfig();

  const [googleRequest, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    clientId: googleConfig.expoClientId || undefined,
    androidClientId: googleConfig.androidClientId || undefined,
    iosClientId: googleConfig.iosClientId || undefined,
    webClientId: googleConfig.webClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
  });

  React.useEffect(() => {
    let cancelled = false;
    void loadAccounts().then(accounts => {
      if (cancelled) return;
      setKnownUsernames(accounts.map(account => account.username));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!googleResponse) return;

    if (googleResponse.type !== 'success') {
      if (googleResponse.type === 'error') {
        setError('Google sign-in failed. Please try again.');
      }
      setBusy(false);
      return;
    }

    void (async () => {
      try {
        const idToken = googleResponse.authentication?.idToken ?? googleResponse.params?.id_token;
        const accessToken = googleResponse.authentication?.accessToken ?? googleResponse.params?.access_token;
        const authenticatedName = await loginOnlineWithGoogleTokens(idToken, accessToken);
        await AsyncStorage.setItem(SESSION_KEY, authenticatedName);
        void trackGameplayAction('auth_login_success', { username: authenticatedName, provider: 'google' }, 0);
        onAuthenticated(authenticatedName);
      } catch (nextError) {
        setError(mapAuthError(nextError));
      } finally {
        setBusy(false);
      }
    })();
  }, [googleResponse, onAuthenticated]);

  const cleanIdentifier = identifier.trim();
  const normalizedEmail = cleanIdentifier.toLowerCase();
  const normalizedUsername = cleanIdentifier.toLowerCase();

  const isUsernameTaken = !onlineAuthEnabled
    && mode === 'register'
    && normalizedUsername.length >= USERNAME_MIN_LENGTH
    && knownUsernames.includes(normalizedUsername);

  const canSubmit = useMemo(() => {
    if (busy) return false;

    if (onlineAuthEnabled) {
      if (!EMAIL_REGEX.test(normalizedEmail)) return false;
      if (password.length < PASSWORD_MIN_LENGTH) return false;
      if (mode === 'register' && password !== confirmPassword) return false;
      return true;
    }

    if (cleanIdentifier.length < USERNAME_MIN_LENGTH) return false;
    if (password.length < PASSWORD_MIN_LENGTH) return false;
    if (mode === 'register' && password !== confirmPassword) return false;
    if (isUsernameTaken) return false;
    return true;
  }, [busy, onlineAuthEnabled, normalizedEmail, password, mode, confirmPassword, cleanIdentifier, isUsernameTaken]);

  async function completeOnlineLogin(accountName: string, provider: 'email' | 'google', authMode: 'login' | 'register') {
    await AsyncStorage.setItem(SESSION_KEY, accountName);
    debugLog('auth', 'Online auth successful', { mode: authMode, provider, username: accountName });
    void trackGameplayAction(authMode === 'register' ? 'auth_register_success' : 'auth_login_success', {
      username: accountName,
      provider,
    }, 0);
    onAuthenticated(accountName);
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    debugLog('auth', 'Submit attempt', { mode, identifier: cleanIdentifier, onlineAuthEnabled });

    try {
      if (onlineAuthEnabled) {
        const authenticatedName = mode === 'register'
          ? await registerOnline(normalizedEmail, password)
          : await loginOnline(normalizedEmail, password);

        await completeOnlineLogin(authenticatedName, 'email', mode);
        return;
      }

      const accounts = await loadAccounts();
      const existing = accounts.find(a => a.username === normalizedUsername);

      if (mode === 'register') {
        if (existing) {
          setError('Username already exists. Try logging in.');
          return;
        }

        const salt = await randomSalt();
        const passwordHash = await hashPassword(password, salt);
        const nextAccounts: AccountRecord[] = [
          ...accounts,
          {
            username: normalizedUsername,
            createdAt: Date.now(),
            hashVersion: 1,
            passwordHash,
            passwordSalt: salt,
          },
        ];
        await saveAccounts(nextAccounts);
        setKnownUsernames(nextAccounts.map(account => account.username));
        await AsyncStorage.setItem(SESSION_KEY, normalizedUsername);
        void trackGameplayAction('auth_register_success', { username: normalizedUsername, provider: 'local' }, 0);
        onAuthenticated(normalizedUsername);
        return;
      }

      if (!existing || !(await verifyPassword(existing, password))) {
        setError('Invalid username or password.');
        return;
      }

      if (!existing.passwordHash || !existing.passwordSalt) {
        const upgraded = await migrateLegacyRecord(existing);
        const nextAccounts = accounts.map(a => a.username === normalizedUsername ? upgraded : a);
        await saveAccounts(nextAccounts);
      }

      await AsyncStorage.setItem(SESSION_KEY, normalizedUsername);
      void trackGameplayAction('auth_login_success', { username: normalizedUsername, provider: 'local' }, 0);
      onAuthenticated(normalizedUsername);
    } catch (submitError) {
      setError(mapAuthError(submitError));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleContinue() {
    if (busy || !onlineAuthEnabled) return;

    setBusy(true);
    setError(null);
    debugLog('auth', 'Google auth requested', { platform: Platform.OS });

    try {
      if (Platform.OS === 'web') {
        const authenticatedName = await loginOnlineWithGooglePopup();
        await completeOnlineLogin(authenticatedName, 'google', 'login');
        setBusy(false);
        return;
      }

      if (!googleAuthEnabled || !googleRequest) {
        throw new Error('Google sign-in is not configured for this build. Add Google client IDs to Expo public env vars.');
      }

      const result = await promptGoogleAsync();
      if (result.type !== 'success') {
        setBusy(false);
      }
    } catch (googleError) {
      setError(mapAuthError(googleError));
      setBusy(false);
    }
  }

  function requestWipeAllData() {
    if (busy) return;
    Alert.alert(
      'Delete Local Data?',
      'This erases local accounts, sessions, cached saves, and telemetry on this device. It does not delete Firebase accounts.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              const keys = await AsyncStorage.getAllKeys();
              const scopedKeys = keys.filter(key => STORAGE_PREFIXES_TO_CLEAR.some(prefix => key.startsWith(prefix)));
              if (scopedKeys.length > 0) {
                await AsyncStorage.multiRemove(scopedKeys);
              }
              setKnownUsernames([]);
              setIdentifier('');
              setPassword('');
              setConfirmPassword('');
              setMode('login');
              setError(`Local data wiped. Removed ${scopedKeys.length} storage keys.`);
            } catch {
              setError('Failed to wipe local data. Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  const identityLabel = onlineAuthEnabled ? 'Email' : 'Username';
  const identityPlaceholder = onlineAuthEnabled ? 'commander@domain.com' : 'your_username';
  const submitLabel = busy ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account';
  const supportingNote = onlineAuthEnabled
    ? 'Firebase auth is active. Use email/password or continue with Google.'
    : 'Offline fallback mode is active. Accounts are stored only on this device.';
  const googleNote = Platform.OS === 'web'
    ? 'Google sign-in uses the Firebase web popup flow.'
    : googleAuthEnabled
      ? 'Google sign-in is ready for this build.'
      : 'Google sign-in needs Expo Google client IDs in your public env vars for native builds.';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#07111F" />
      <View style={styles.bgOrbA} />
      <View style={styles.bgOrbB} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.heroBlock}>
            <Text style={styles.eyebrow}>Online Command Access</Text>
            <Text style={styles.title}>SimplyIdle</Text>
            <Text style={styles.subtitle}>Use real Firebase auth, keep progress tied to your account, and let players enter with Google or email instead of the old local-only form.</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>{mode === 'login' ? 'Return to Command' : 'Open a New Ledger'}</Text>
                <Text style={styles.cardBody}>{supportingNote}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{onlineAuthEnabled ? 'Firebase' : 'Local'}</Text>
              </View>
            </View>

            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('login');
                  setError(null);
                }}
              >
                <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>Log In</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('register');
                  setError(null);
                }}
              >
                <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>Create</Text>
              </Pressable>
            </View>

            {onlineAuthEnabled && (
              <>
                <Pressable
                  style={[styles.googleBtn, (busy || !googleAuthEnabled) && styles.buttonDisabled]}
                  disabled={busy || !googleAuthEnabled}
                  onPress={handleGoogleContinue}
                >
                  {busy ? <ActivityIndicator color="#08131E" /> : <Text style={styles.googleBtnText}>Continue with Google</Text>}
                </Pressable>
                <Text style={styles.helperText}>{googleNote}</Text>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or use email</Text>
                  <View style={styles.dividerLine} />
                </View>
              </>
            )}

            <Text style={styles.fieldLabel}>{identityLabel}</Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={onlineAuthEnabled ? 'email-address' : 'default'}
              placeholder={identityPlaceholder}
              placeholderTextColor="#6D7A90"
              maxLength={onlineAuthEnabled ? 120 : USERNAME_MAX_LENGTH}
            />
            <Text style={[styles.helperText, isUsernameTaken && styles.helperTextError]}>
              {onlineAuthEnabled
                ? 'Use the same email whenever you log in or sign up.'
                : `Username: ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.${isUsernameTaken ? ' This username is already taken.' : ''}`}
            </Text>

            <Text style={styles.fieldLabel}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              placeholder="Enter password"
              placeholderTextColor="#6D7A90"
              maxLength={PASSWORD_MAX_LENGTH}
            />
            <Text style={styles.helperText}>Password: minimum {PASSWORD_MIN_LENGTH} characters.</Text>

            {mode === 'register' && (
              <>
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="Repeat password"
                  placeholderTextColor="#6D7A90"
                  maxLength={PASSWORD_MAX_LENGTH}
                />
                <Text style={[styles.helperText, confirmPassword.length > 0 && password !== confirmPassword && styles.helperTextError]}>
                  {confirmPassword.length === 0 || password === confirmPassword
                    ? 'Confirmation must match exactly.'
                    : 'Passwords do not match.'}
                </Text>
              </>
            )}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              style={[styles.submitBtn, !canSubmit && styles.buttonDisabled]}
              disabled={!canSubmit}
              onPress={handleSubmit}
            >
              {busy ? <ActivityIndicator color="#08131E" /> : <Text style={styles.submitBtnText}>{submitLabel}</Text>}
            </Pressable>

            <Pressable style={[styles.wipeBtn, busy && styles.buttonDisabled]} disabled={busy} onPress={requestWipeAllData}>
              <Text style={styles.wipeBtnText}>Delete Local Cache</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const AUTH_STORAGE_KEYS = {
  accounts: ACCOUNTS_KEY,
  session: SESSION_KEY,
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#07111F',
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  bgOrbA: {
    position: 'absolute',
    top: -40,
    right: -20,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#143A59',
    opacity: 0.38,
  },
  bgOrbB: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#3F6B4E',
    opacity: 0.22,
  },
  heroBlock: {
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#D9C07A',
    marginBottom: 8,
  },
  title: {
    fontSize: 38,
    fontWeight: '900',
    color: '#F4F7FB',
    marginBottom: 10,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#AAB6CA',
    maxWidth: 560,
  },
  card: {
    backgroundColor: 'rgba(10, 20, 34, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(135, 155, 183, 0.2)',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 18,
  },
  cardCopy: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#F4F7FB',
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 19,
    color: '#9EB0C7',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#12273B',
    borderWidth: 1,
    borderColor: '#274763',
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#DCE9F8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#274763',
    backgroundColor: '#0D1828',
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#14314B',
    borderColor: '#6CB1E7',
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8295AF',
  },
  modeBtnTextActive: {
    color: '#F4F7FB',
  },
  googleBtn: {
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#E8EEF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  googleBtnText: {
    color: '#08131E',
    fontSize: 15,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1F3348',
  },
  dividerText: {
    fontSize: 11,
    color: '#7387A3',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DCE9F8',
    marginBottom: 8,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#274763',
    borderRadius: 14,
    backgroundColor: '#0A1624',
    color: '#F4F7FB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 11,
    color: '#8194AD',
    lineHeight: 17,
    marginBottom: 12,
  },
  helperTextError: {
    color: '#FF98A5',
  },
  error: {
    color: '#FF98A5',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
    fontWeight: '700',
  },
  submitBtn: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#7CD8A4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#08131E',
    fontSize: 15,
    fontWeight: '900',
  },
  wipeBtn: {
    minHeight: 46,
    borderRadius: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#60323B',
    backgroundColor: '#231218',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wipeBtnText: {
    color: '#FFBAC2',
    fontSize: 12,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
