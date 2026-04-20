import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';

export interface GoogleAuthConfig {
  webClientId: string;
  expoClientId: string;
  androidClientId: string;
  iosClientId: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizeAccountName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 24);
}

function emailLocalPart(email: string): string {
  const atIndex = email.indexOf('@');
  return atIndex > 0 ? email.slice(0, atIndex) : email;
}

function getAccountNameFromUser(user: User): string {
  const displayName = sanitizeAccountName(user.displayName ?? '');
  if (displayName) return displayName;

  const email = normalizeEmail(user.email ?? '');
  const emailName = sanitizeAccountName(emailLocalPart(email));
  if (emailName) return emailName;

  return sanitizeAccountName(user.uid) || 'player';
}

function getDefaultDisplayName(email: string): string {
  return sanitizeAccountName(emailLocalPart(normalizeEmail(email))) || 'player';
}

export function getGoogleAuthConfig(): GoogleAuthConfig {
  return {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
    expoClientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID || '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  };
}

export function isGoogleAuthAvailable(): boolean {
  if (!isOnlineAuthAvailable()) return false;
  if (Platform.OS === 'web') return true;

  const cfg = getGoogleAuthConfig();
  return !!(cfg.expoClientId || cfg.androidClientId || cfg.iosClientId);
}

export function isOnlineAuthAvailable(): boolean {
  return isFirebaseConfigured();
}

export async function getValidOnlineSession(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) return null;

  return getAccountNameFromUser(auth.currentUser);
}

export async function registerOnline(email: string, password: string): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Online auth is not configured.');

  const normalizedEmail = normalizeEmail(email);
  const cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
  await updateProfile(cred.user, { displayName: getDefaultDisplayName(normalizedEmail) });
  return getAccountNameFromUser(cred.user);
}

export async function loginOnline(email: string, password: string): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Online auth is not configured.');

  const normalizedEmail = normalizeEmail(email);
  const cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
  return getAccountNameFromUser(cred.user);
}

export async function loginOnlineWithGooglePopup(): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Online auth is not configured.');

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return getAccountNameFromUser(cred.user);
}

export async function loginOnlineWithGoogleTokens(
  idToken?: string | null,
  accessToken?: string | null,
): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Online auth is not configured.');
  if (!idToken && !accessToken) throw new Error('Google sign-in did not return a usable token.');

  const credential = GoogleAuthProvider.credential(idToken ?? undefined, accessToken ?? undefined);
  const cred = await signInWithCredential(auth, credential);
  return getAccountNameFromUser(cred.user);
}

export async function logoutOnline(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}
