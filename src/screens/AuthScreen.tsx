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
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { debugLog, trackEvent, trackGameplayAction } from '../telemetry';
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
  isPublicUsernameAvailable,
  loadPublicUsername,
  PUBLIC_USERNAME_MAX,
  PUBLIC_USERNAME_MIN,
  reservePublicUsername,
  validatePublicUsername,
} from '../services/publicProfile';
import { t } from '../i18n';

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

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 64;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      return 'Sign-in is not available from this web address. Please use the official site.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      if (error instanceof Error && error.message.trim()) return error.message;
      return 'Authentication failed. Please try again.';
  }
}

export async function getValidStoredSession(): Promise<string | null> {
  // Local account system removed. Session is managed by Firebase Auth only.
  return null;
}

function NativeGoogleButton({ disabled, googleConfig, onSuccess, onError, onBusyChange }: NativeGoogleButtonProps) {
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
  const onlineAuthEnabled = isOnlineAuthAvailable();
  const googleAuthEnabled = isGoogleAuthAvailable();
  const googleConfig = getGoogleAuthConfig();
  const hasNativeGoogleConfig = !!(
    googleConfig.expoClientId ||
    googleConfig.androidClientId ||
    googleConfig.iosClientId
  );

  const cleanIdentifier = identifier.trim();
  const normalizedEmail = cleanIdentifier.toLowerCase();

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (!onlineAuthEnabled) return false;
    if (!EMAIL_REGEX.test(normalizedEmail)) return false;
    if (password.length < PASSWORD_MIN_LENGTH) return false;
    if (mode === 'register') {
      if (password !== confirmPassword) return false;
      if (validatePublicUsername(publicUsername) !== null) return false;
    }
    return true;
  }, [busy, onlineAuthEnabled, normalizedEmail, password, mode, confirmPassword, publicUsername]);

  async function completeOnlineLogin(
    accountName: string,
    provider: 'email' | 'google',
    authMode: 'login' | 'register',
  ) {
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (uid) {
      void loadPublicUsername(uid);
    }
    debugLog('auth', 'Online auth successful', { mode: authMode, provider, username: accountName });
    void trackGameplayAction(
      authMode === 'register' ? 'auth_register_success' : 'auth_login_success',
      {
        username: accountName,
        provider,
      },
      0,
    );
    void trackEvent('auth_success', {
      mode: authMode,
      provider,
    });
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

        const authenticatedName =
          mode === 'register'
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
    } catch (submitError) {
      const mappedError = mapAuthError(submitError);
      setError(mappedError);
      void trackEvent('auth_failure', {
        mode,
        provider: 'email',
        reason: mappedError.slice(0, 80),
      });
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
        throw new Error('Google sign-in is not available on this device.');
      }

      setBusy(false);
    } catch (googleError) {
      const mappedError = mapAuthError(googleError);
      setError(mappedError);
      void trackEvent('auth_failure', {
        mode: 'login',
        provider: 'google',
        reason: mappedError.slice(0, 80),
      });
      setBusy(false);
    }
  }

  const identityLabel = t('auth.identityLabel');
  const identityPlaceholder = t('auth.identityPlaceholder');
  const submitLabel = busy
    ? t('auth.submitPleaseWait')
    : mode === 'login'
      ? t('auth.modeLogin')
      : t('auth.submitCreateAccount');
  const supportingNote = onlineAuthEnabled ? t('auth.supportingOnline') : t('auth.supportingOffline');
  const firebaseMissingNote = !onlineAuthEnabled
    ? 'Online features are temporarily unavailable. Please try again later.'
    : null;
  const googleNote =
    Platform.OS === 'web'
      ? t('auth.googleNoteWeb')
      : googleAuthEnabled
        ? t('auth.googleNoteNativeReady')
        : t('auth.googleNoteNativeMissing');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#07111F" />
      <View style={styles.bgOrbA} />
      <View style={styles.bgOrbB} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.heroBlock}>
            <Text style={styles.eyebrow}>{t('auth.onlineCommandAccess')}</Text>
            <Text style={styles.title}>{t('auth.appName')}</Text>
            <Text style={styles.subtitle}>{t('auth.heroSubtitle')}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <View style={styles.cardCopy}>
                <Text style={styles.cardTitle}>
                  {mode === 'login' ? t('auth.returnToCommand') : t('auth.openNewLedger')}
                </Text>
                <Text style={styles.cardBody}>{supportingNote}</Text>
                {firebaseMissingNote ? <Text style={styles.helperTextError}>{firebaseMissingNote}</Text> : null}
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{t('auth.statusFirebase')}</Text>
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
                <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
                  {t('auth.modeLogin')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.modeBtn, mode === 'register' && styles.modeBtnActive]}
                onPress={() => {
                  setMode('register');
                  setError(null);
                  setPublicUsername('');
                }}
              >
                <Text style={[styles.modeBtnText, mode === 'register' && styles.modeBtnTextActive]}>
                  {t('auth.modeCreate')}
                </Text>
              </Pressable>
            </View>

            {onlineAuthEnabled && (
              <>
                {Platform.OS === 'web' || !hasNativeGoogleConfig ? (
                  <Pressable
                    style={[
                      styles.googleBtn,
                      (busy || googleNeedsUsername || (Platform.OS !== 'web' && !hasNativeGoogleConfig)) &&
                        styles.buttonDisabled,
                    ]}
                    disabled={busy || googleNeedsUsername || (Platform.OS !== 'web' && !hasNativeGoogleConfig)}
                    onPress={handleGoogleContinue}
                  >
                    {busy ? (
                      <ActivityIndicator color="#08131E" />
                    ) : (
                      <Text style={styles.googleBtnText}>{t('auth.continueWithGoogle')}</Text>
                    )}
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
                    <Text style={styles.fieldLabel}>{t('auth.choosePublicUsername')}</Text>
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
                    <Text
                      style={[
                        styles.helperText,
                        publicUsername.length > 0 &&
                          validatePublicUsername(publicUsername) !== null &&
                          styles.helperTextError,
                      ]}
                    >
                      {publicUsername.length > 0 && validatePublicUsername(publicUsername)
                        ? (validatePublicUsername(publicUsername) ?? '')
                        : t('auth.publicUsernameGoogleRange', { min: PUBLIC_USERNAME_MIN, max: PUBLIC_USERNAME_MAX })}
                    </Text>
                    <Pressable
                      style={[
                        styles.submitBtn,
                        (busy || validatePublicUsername(publicUsername) !== null) && styles.buttonDisabled,
                      ]}
                      disabled={busy || validatePublicUsername(publicUsername) !== null}
                      onPress={handleCompleteGoogleUsername}
                    >
                      {busy ? (
                        <ActivityIndicator color="#08131E" />
                      ) : (
                        <Text style={styles.submitBtnText}>{t('auth.finishGoogleSignup')}</Text>
                      )}
                    </Pressable>
                  </>
                )}
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>{t('auth.orUseEmail')}</Text>
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
              autoComplete="email"
              keyboardType="email-address"
              placeholder={identityPlaceholder}
              placeholderTextColor="#6D7A90"
              maxLength={120}
            />
            <Text style={styles.helperText}>{t('auth.identityHelper')}</Text>

            <Text style={styles.fieldLabel}>{t('auth.passwordLabel')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={t('auth.passwordPlaceholder')}
              placeholderTextColor="#6D7A90"
              maxLength={PASSWORD_MAX_LENGTH}
            />
            <Text style={styles.helperText}>{t('auth.passwordHelper', { min: PASSWORD_MIN_LENGTH })}</Text>

            {mode === 'register' && (
              <>
                <Text style={styles.fieldLabel}>{t('auth.confirmPasswordLabel')}</Text>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  style={styles.input}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  placeholderTextColor="#6D7A90"
                  maxLength={PASSWORD_MAX_LENGTH}
                />
                <Text
                  style={[
                    styles.helperText,
                    confirmPassword.length > 0 && password !== confirmPassword && styles.helperTextError,
                  ]}
                >
                  {confirmPassword.length === 0 || password === confirmPassword
                    ? t('auth.confirmPasswordHelperOk')
                    : t('auth.confirmPasswordHelperMismatch')}
                </Text>
              </>
            )}

            {mode === 'register' && onlineAuthEnabled && (
              <>
                <Text style={styles.fieldLabel}>{t('auth.publicUsernameLabel')}</Text>
                <TextInput
                  value={publicUsername}
                  onChangeText={setPublicUsername}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  placeholder={t('auth.publicUsernamePlaceholder')}
                  placeholderTextColor="#6D7A90"
                  maxLength={PUBLIC_USERNAME_MAX}
                />
                <Text
                  style={[
                    styles.helperText,
                    publicUsername.length > 0 &&
                      validatePublicUsername(publicUsername) !== null &&
                      styles.helperTextError,
                  ]}
                >
                  {publicUsername.length > 0 && validatePublicUsername(publicUsername)
                    ? (validatePublicUsername(publicUsername) ?? '')
                    : t('auth.publicUsernameRange', { min: PUBLIC_USERNAME_MIN, max: PUBLIC_USERNAME_MAX })}
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
