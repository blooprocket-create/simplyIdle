import type { SaveV3 } from '../engine/save/schema';

/**
 * Service interfaces and their adapters.
 *
 * Firebase stays, and stays behind this seam. The seam was first justified by
 * making a future swap to Supabase one adapter rather than a rewrite; that
 * migration is not happening, and the seam is worth having anyway for the
 * reason that does not depend on it — **the engine never learns what a
 * network is.** That is what keeps the simulation runnable in a bare Node
 * test, which is what the parity suite depends on.
 *
 * Phase 0 reserved the layer and Phase 6 fills in the first port. `SavePort`
 * is implemented by `remoteSave.ts`, which reads and writes the documents the
 * shipped game already keeps — the seam is what lets the save format be proven
 * against a fake store instead of a live project.
 */
export interface SavePort {
  /**
   * The stored payload, exactly as stored. Not a `SaveV3`: what a stored
   * payload means is `readSave`'s decision, and a port that formed its own
   * opinion would be a second reader with different bounds.
   *
   * Null means there is no save at that slot. An empty object means the slot
   * exists and holds nothing, which is a player who emptied their roster
   * rather than one who never had one — `saveStore.ts` explains why the two
   * cannot be collapsed.
   */
  load(slot: string): Promise<unknown | null>;

  /**
   * Store a save. Takes a `SaveV3` rather than a payload because the adapter
   * has to convert on the way out — the shipped game reads the same documents,
   * and `legacyPayload.ts` says what happens if it finds a v3 there.
   */
  save(slot: string, save: SaveV3): Promise<void>;
}
