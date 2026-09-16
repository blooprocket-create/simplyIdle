import type { AutomationId } from '../../content/automation';
import { AUTOMATIONS } from '../../content/automation';
import type { PreferenceStore } from './store';

/**
 * Which earned automations the player has actually switched on.
 *
 * Earning one makes it available; this is the separate question of whether
 * they want it. REVAMP asks for "automation as an earned reward rather than
 * a default", and a reward that applies itself the moment it is earned is a
 * default that took longer to arrive.
 *
 * Defensive for the same reasons as the pinned shelf: read from storage a
 * player can edit, written by a version that may have renamed an automation,
 * and kept somewhere allowed to throw on both read and write.
 */

export const AUTOMATION_KEY = 'simplyidle.automation.enabled';

const KNOWN: ReadonlySet<string> = new Set(AUTOMATIONS.map(entry => entry.id));

/** The usable ids in `raw`, deduped. Empty for every shape of rubbish. */
export function parseAutomation(raw: unknown): AutomationId[] {
  if (!Array.isArray(raw)) return [];
  const enabled: AutomationId[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || !KNOWN.has(entry)) continue;
    const id = entry as AutomationId;
    if (!enabled.includes(id)) enabled.push(id);
  }
  return enabled;
}

/**
 * What is stored, with anything no longer earned filtered out.
 *
 * A player who switched something on and then prestiged past the signal that
 * earned it should not keep the benefit silently — and a stored id for an
 * automation this build cannot honour must not read as on.
 */
export function loadAutomation(store: PreferenceStore, earned: ReadonlySet<AutomationId>): AutomationId[] {
  return parseAutomation(readJson(store, AUTOMATION_KEY)).filter(id => earned.has(id));
}

export function saveAutomation(store: PreferenceStore, ids: readonly AutomationId[]): void {
  try {
    store.write(AUTOMATION_KEY, JSON.stringify([...ids]));
  } catch {
    // A preference that cannot be saved lasts one session. Worse game, not a
    // broken one.
  }
}

export function toggleAutomation(current: readonly AutomationId[], id: AutomationId): AutomationId[] {
  return current.includes(id) ? current.filter(entry => entry !== id) : [...current, id];
}

function readJson(store: PreferenceStore, key: string): unknown {
  try {
    const raw = store.read(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}
