import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from './firebase';

function usernameToSyntheticEmail(username: string): string {
  return `${username.trim().toLowerCase()}@simplyidle.local`;
}

export function isOnlineAuthAvailable(): boolean {
  return isFirebaseConfigured();
}

export async function getValidOnlineSession(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) return null;

  const displayName = auth.currentUser.displayName?.trim().toLowerCase();
  if (displayName) return displayName;

  const email = auth.currentUser.email?.trim().toLowerCase() ?? '';
  if (!email) return null;
  const atIndex = email.indexOf('@');
  return atIndex > 0 ? email.slice(0, atIndex) : null;
}

export async function registerOnline(username: string, password: string): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Online auth is not configured.');

  const normalized = username.trim().toLowerCase();
  const syntheticEmail = usernameToSyntheticEmail(normalized);
  const cred = await createUserWithEmailAndPassword(auth, syntheticEmail, password);
  await updateProfile(cred.user, { displayName: normalized });
  return normalized;
}

export async function loginOnline(username: string, password: string): Promise<string> {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Online auth is not configured.');

  const normalized = username.trim().toLowerCase();
  const syntheticEmail = usernameToSyntheticEmail(normalized);
  await signInWithEmailAndPassword(auth, syntheticEmail, password);
  return normalized;
}

export async function logoutOnline(): Promise<void> {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}
