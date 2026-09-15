/**
 * Service interfaces and their adapters. Firebase stays behind this seam so
 * the swap to Supabase is one adapter rather than a rewrite, and so the engine
 * never learns what a network is.
 *
 * Phase 1 fills this in; Phase 0 only reserves the layer.
 */
export interface SavePort {
  load(slot: string): Promise<unknown | null>;
  save(slot: string, payload: unknown): Promise<void>;
}
