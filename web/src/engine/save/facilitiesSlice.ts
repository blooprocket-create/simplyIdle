import { FACILITY_IDS, FACILITY_MAX_LEVEL, type FacilityId } from '../prestige/facilities';
import { boundedInt, isRecord } from './guards';

/**
 * The guildhall facility levels, read once for both readers.
 *
 * The stored shape is a **record of records** — `guildhallFacilities.tactics.level`
 * — one level deeper than it looks. That depth is not a detail: the Phase 7
 * fixture wrote a tactics scenario as a flat map, and the scenario silently
 * measured nothing at all, recording a health figure identical to the one
 * without tactics. A reader that accepted both shapes would hide the same
 * mistake rather than catch it, so this accepts only the nested one.
 */

export function emptyFacilities(): Record<FacilityId, number> {
  return { training: 0, treasury: 0, forge: 0, tactics: 0 };
}

/** The v2 shape: `{ tactics: { level: 3 }, … }`. */
export function readFacilities(raw: unknown): Record<FacilityId, number> {
  const levels = emptyFacilities();
  if (!isRecord(raw)) return levels;
  for (const id of FACILITY_IDS) {
    const entry = raw[id];
    if (!isRecord(entry)) continue;
    levels[id] = boundedInt(entry.level, 0, FACILITY_MAX_LEVEL, 0);
  }
  return levels;
}

/** Our own shape, which is flat: `{ tactics: 3, … }`. */
export function readFacilityLevels(raw: unknown): Record<FacilityId, number> {
  const levels = emptyFacilities();
  if (!isRecord(raw)) return levels;
  for (const id of FACILITY_IDS) {
    levels[id] = boundedInt(raw[id], 0, FACILITY_MAX_LEVEL, 0);
  }
  return levels;
}

/** Back out to the nested shape the shipped reader expects. */
export function facilitiesToLegacy(levels: Record<FacilityId, number>): Record<string, { level: number }> {
  return Object.fromEntries(FACILITY_IDS.map(id => [id, { level: levels[id] }]));
}
