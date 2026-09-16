/**
 * Where a preference is kept, as a seam rather than a global.
 *
 * Everything here has to survive storage being unavailable. `localStorage`
 * throws on access in a Safari private window, when an origin has site data
 * blocked, and when a quota is exhausted mid-write — none of which should
 * stop a game rendering. So the store is an interface the tests can make
 * hostile, and both ends of it are total.
 */
export interface PreferenceStore {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

/** A store that remembers nothing, for when the browser will not have one. */
export const NULL_STORE: PreferenceStore = {
  read: () => null,
  write: () => {},
};

/**
 * The browser's, or a store that forgets, decided once at call time rather
 * than at module load — `localStorage` can be present and still throw on the
 * first property access, so merely reaching for it is the risky part.
 */
export function browserStore(): PreferenceStore {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return NULL_STORE;
    return {
      read: key => storage.getItem(key),
      write: (key, value) => storage.setItem(key, value),
    };
  } catch {
    return NULL_STORE;
  }
}
