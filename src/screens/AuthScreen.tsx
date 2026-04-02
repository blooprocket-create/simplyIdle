import React, { useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  StatusBar,
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
import { getFirebaseAuth } from '../services/firebase';
import {
  getCachedPublicUsername,
  isPublicUsernameAvailable,
  loadPublicUsername,
  normalizePublicUsername,
  PUBLIC_USERNAME_MAX,
  PUBLIC_USERNAME_MIN,
  reservePublicUsername,
  validatePublicUsername,
} from '../services/publicProfile';

WebBrowser.maybeCompleteAuthSession();

interface AuthScreenProps {
  onAuthenticated: (username: string) => void;
}

interface NativeGoogleButtonProps {
  disabled: boolean;
  googleConfig: ReturnType<typeof getGoogleAuthConfig>;
  onSuccess: (accountName: string) => Promise<void>;
  onError: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
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
    case 'auth/unauthorized-domain':
      return 'This web address is not allowed by Firebase Auth yet. Add the current site to Firebase Authentication > Settings > Authorized domains.';
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

function NativeGoogleButton({
  disabled,
  googleConfig,
  onSuccess,
  onError,
  onBusyChange,
}: NativeGoogleButtonProps) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: googleConfig.expoClientId || googleConfig.androidClientId || googleConfig.iosClientId,
    androidClientId: googleConfig.androidClientId || undefined,
    iosClientId: googleConfig.iosClientId || undefined,
    scopes: ['openid', 'profile', 'email'],
    selectAccount: true,
  });

  React.useEffect(() => {
    if (!response) return;

    if (response.type !== 'success') {
      if (response.type === 'error') {
        onError('Google sign-in failed. Please try again.');
      }
      onBusyChange(false);
      return;
    }

    void (async () => {
      try {
        const idToken = response.authentication?.idToken ?? response.params?.id_token;
        const accessToken = response.authentication?.accessToken ?? response.params?.access_token;
        const authenticatedName = await loginOnlineWithGoogleTokens(idToken, accessToken);
        await onSuccess(authenticatedName);
      } catch (error) {
        onError(mapAuthError(error));
      } finally {
        onBusyChange(false);
      }
    })();
  }, [onBusyChange, onError, onSuccess, response]);

  return (
    <Pressable
      style={[styles.googleBtn, disabled && styles.buttonDisabled]}
      disabled={disabled || !request}
      onPress={async () => {
        onBusyChange(true);
        const result = await promptAsync();
        if (result.type !== 'success') {
          onBusyChange(false);
        }
      }}
    >
      <Text style={styles.googleBtnText}>Continue with Google</Text>
    </Pressable>
  );
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [publicUsername, setPublicUsername] = useState('');
  const [googleNeedsUsername, setGoogleNeedsUsername] = useState(false);
  const [pendingGoogleAccountName, setPendingGoogleAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [knownUsernames, setKnownUsernames] = useState<string[]>([]);
  const onlineAuthEnabled = isOnlineAuthAvailable();
  const googleAuthEnabled = isGoogleAuthAvailable();
  const googleConfig = getGoogleAuthConfig();
  const hasNativeGoogleConfig = !!(googleConfig.expoClientId || googleConfig.androidClientId || googleConfig.iosClientId);

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
      if (mode === 'register') {
        if (password !== confirmPassword) return false;
        if (validatePublicUsername(publicUsername) !== null) return false;
      }
      return true;
    }

    if (cleanIdentifier.length < USERNAME_MIN_LENGTH) return false;
    if (password.length < PASSWORD_MIN_LENGTH) return false;
    if (mode === 'register' && password !== confirmPassword) return false;
    if (isUsernameTaken) return false;
    return true;
  }, [busy, onlineAuthEnabled, normalizedEmail, password, mode, confirmPassword, cleanIdentifier, isUsernameTaken, publicUsername]);

  async function completeOnlineLogin(accountName: string, provider: 'email' | 'google', authMode: 'login' | 'register') {
    await AsyncStorage.setItem(SESSION_KEY, accountName);
    // Refresh the public username cache in the background (non-blocking).
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (uid) {
      void loadPublicUsername(uid);
    }
    debugLog('auth', 'Online auth successful', { mode: authMode, provider, username: accountName });
    void trackGameplayAction(authMode === 'register' ? 'auth_register_success' : 'auth_login_success', {
      username: accountName,
      provider,
    }, 0);
    onAuthenticated(accountName);
  }

  async function continueGoogleAuth(authenticatedName: string) {
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (!uid) {
      await completeOnlineLogin(authenticatedName, 'google', 'login');
      return;
    }

    const existingPublic = await loadPublicUsername(uid);
    if (existingPublic && existingPublic.trim()) {
      await completeOnlineLogin(authenticatedName, 'google', 'login');
      return;
    }

    setPendingGoogleAccountName(authenticatedName);
    setGoogleNeedsUsername(true);
    setPublicUsername('');
    setError('Choose a public username to finish Google account setup. This name will be visible on leaderboards.');
  }

  async function handleCompleteGoogleUsername() {
    if (!pendingGoogleAccountName) return;

    setBusy(true);
    setError(null);
    try {
      const formatError = validatePublicUsername(publicUsername);
      if (formatError) {
        setError(formatError);
        return;
      }

      const available = await isPublicUsernameAvailable(publicUsername);
      if (!available) {
        setError('That username is already taken. Please choose another.');
        return;
      }

      const uid = getFirebaseAuth()?.currentUser?.uid;
      if (!uid) {
        setError('Google session expired. Please continue with Google again.');
        setGoogleNeedsUsername(false);
        setPendingGoogleAccountName(null);
        return;
      }

      const reservation = await reservePublicUsername(publicUsername.trim(), uid);
      if (!reservation.ok) {
        setError(reservation.error ?? 'Could not reserve username. Please try again.');
        return;
      }

      setGoogleNeedsUsername(false);
      const accountName = pendingGoogleAccountName;
      setPendingGoogleAccountName(null);
      await completeOnlineLogin(accountName, 'google', 'register');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    debugLog('auth', 'Submit attempt', { mode, identifier: cleanIdentifier, onlineAuthEnabled });

    try {
      if (onlineAuthEnabled) {
        if (mode === 'register') {
          // Validate format first (canSubmit also guards this, but double-check).
          const formatError = validatePublicUsername(publicUsername);
          if (formatError) {
            setError(formatError);
            return;
          }
          // Pre-check uniqueness (non-transactional, catches most conflicts early).
          const available = await isPublicUsernameAvailable(publicUsername);
          if (!available) {
            setError('That username is already taken. Please choose another.');
            return;
          }
        }

        const authenticatedName = mode === 'register'
          ? await registerOnline(normalizedEmail, password)
          : await loginOnline(normalizedEmail, password);

        if (mode === 'register') {
          const uid = getFirebaseAuth()?.currentUser?.uid;
          if (uid) {
            const result = await reservePublicUsername(publicUsername.trim(), uid);
            if (!result.ok) {
              // Rare race condition — account is created but username was sniped.
              // Proceed with login; the user can update their display name later.
              debugLog('auth', 'Public username reservation failed after account creation', { error: result.error });
            }
          }
        }

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
    if (busy || !onlineAuthEnabled || googleNeedsUsername) return;

    setBusy(true);
    setError(null);
    debugLog('auth', 'Google auth requested', { platform: Platform.OS });

    try {
      if (Platform.OS === 'web') {
        const authenticatedName = await loginOnlineWithGooglePopup();
        await continueGoogleAuth(authenticatedName);
        setBusy(false);
        return;
      }

      if (!hasNativeGoogleConfig) {
        throw new Error('Google sign-in is not configured for this build. Add Google client IDs to Expo public env vars.');
      }

      setBusy(false);
    } catch (googleError) {
      setError(mapAuthError(googleError));
      setBusy(false);
    }
  }

  const identityLabel = onlineAuthEnabled ? 'Email' : 'Username';
  const identityPlaceholder = onlineAuthEnabled ? 'commander@domain.com' : 'your_username';
  const submitLabel = busy ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account';
  const supportingNote = onlineAuthEnabled
    ? 'Firebase auth is active. Use email/password or continue with Google.'
    : 'Offline fallback mode is active. Accounts are stored only on this device.';
  const googleNote = Platform.OS === 'web'
    ? 'Google sign-in uses the Firebase web popup flow configured in Firebase.'
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
                  setPublicUsername('');
                }}
              >
                <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>Log In</Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('register');
                  setError(null);
                  setPublicUsername('');
                }}
              >
                <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>Create</Text>
              </Pressable>
            </View>

            {onlineAuthEnabled && (
              <>
                {Platform.OS === 'web' || !hasNativeGoogleConfig ? (
                  <Pressable
                    style={[styles.googleBtn, (busy || googleNeedsUsername || (Platform.OS !== 'web' && !hasNativeGoogleConfig)) && styles.buttonDisabled]}
                    disabled={busy || googleNeedsUsername || (Platform.OS !== 'web' && !hasNativeGoogleConfig)}
                    onPress={handleGoogleContinue}
                  >
                    {busy ? <ActivityIndicator color="#08131E" /> : <Text style={styles.googleBtnText}>Continue with Google</Text>}
                  </Pressable>
                ) : (
                  <NativeGoogleButton
                    disabled={busy || googleNeedsUsername}
                    googleConfig={googleConfig}
                    onBusyChange={setBusy}
                    onError={setError}
                    onSuccess={async (authenticatedName: string) => {
                      await continueGoogleAuth(authenticatedName);
                    }}
                  />
                )}
                <Text style={styles.helperText}>{googleNote}</Text>
                {googleNeedsUsername && (
                  <>
                    <Text style={styles.fieldLabel}>Choose Public Username</Text>
                    <TextInput
                      value={publicUsername}
                      onChangeText={setPublicUsername}
                      style={styles.input}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="username"
                      placeholder="your_username"
                      placeholderTextColor="#6D7A90"
                      maxLength={PUBLIC_USERNAME_MAX}
                    />
                    <Text style={[styles.helperText, publicUsername.length > 0 && validatePublicUsername(publicUsername) !== null && styles.helperTextError]}>
                      {publicUsername.length > 0 && validatePublicUsername(publicUsername)
                        ? validatePublicUsername(publicUsername) ?? ''
                        : `${PUBLIC_USERNAME_MIN}-${PUBLIC_USERNAME_MAX} characters. This name is your public identity online.`}
                    </Text>
                    <Pressable
                      style={[styles.submitBtn, (busy || validatePublicUsername(publicUsername) !== null) && styles.buttonDisabled]}
                      disabled={busy || validatePublicUsername(publicUsername) !== null}
                      onPress={handleCompleteGoogleUsername}
                    >
                      {busy ? <ActivityIndicator color="#08131E" /> : <Text style={styles.submitBtnText}>Finish Google Signup</Text>}
                    </Pressable>
                  </>
                )}
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
              autoComplete={onlineAuthEnabled ? 'email' : 'username'}
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
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
                  autoComplete="new-password"
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

            {mode === 'register' && onlineAuthEnabled && (
              <>
                <Text style={styles.fieldLabel}>Public Username</Text>
                <TextInput
                  value={publicUsername}
                  onChangeText={setPublicUsername}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  placeholder="your_username"
                  placeholderTextColor="#6D7A90"
                  maxLength={PUBLIC_USERNAME_MAX}
                />
                <Text style={[styles.helperText, publicUsername.length > 0 && validatePublicUsername(publicUsername) !== null && styles.helperTextError]}>
                  {publicUsername.length > 0 && validatePublicUsername(publicUsername)
                    ? validatePublicUsername(publicUsername) ?? ''
                    : `${PUBLIC_USERNAME_MIN}–${PUBLIC_USERNAME_MAX} characters, letters/numbers/underscores. This name is shown publicly on the leaderboard.`}
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
  buttonDisabled: {
    opacity: 0.55,
  },
});
