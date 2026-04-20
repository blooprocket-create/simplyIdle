import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { getIdTokenResult } from 'firebase/auth';
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from './firebase';

interface AdminDocRecord {
  active?: unknown;
}

function hasAdminClaim(claims: Record<string, unknown>): boolean {
  return claims.admin === true || claims.role === 'admin';
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user) return false;

  try {
    const tokenResult = await getIdTokenResult(user, true);
    if (hasAdminClaim(tokenResult.claims as Record<string, unknown>)) {
      return true;
    }
  } catch {
    // Ignore token refresh failures and continue with Firestore fallback.
  }

  const db = getFirebaseFirestore();
  if (!db) return false;

  try {
    const adminRef = doc(db, 'adminUsers', user.uid);
    const adminSnap = await getDoc(adminRef);
    if (!adminSnap.exists()) return false;

    const payload = adminSnap.data() as AdminDocRecord;
    return payload.active === true;
  } catch {
    return false;
  }
}

/**
 * Writes an immutable audit log entry to the `adminAuditLog` collection.
 * Best-effort — failures are silently caught so they don't block admin actions.
 */
export async function logAdminAction(action: string, details: Record<string, unknown>): Promise<void> {
  try {
    const db = getFirebaseFirestore();
    const auth = getFirebaseAuth();
    const user = auth?.currentUser;
    if (!db || !user) return;
    await addDoc(collection(db, 'adminAuditLog'), {
      adminUid: user.uid,
      adminEmail: user.email ?? null,
      action,
      details,
      timestamp: Date.now(),
    });
  } catch {
    // Audit logging is best-effort; never block the admin action.
  }
}
