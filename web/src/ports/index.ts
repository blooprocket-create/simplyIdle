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
 * Phase 1 fills this in; Phase 0 only reserves the layer.
 */
export interface SavePort {
  load(slot: string): Promise<unknown | null>;
  save(slot: string, payload: unknown): Promise<void>;
}
