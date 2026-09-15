import type { Destination } from './destinations';

/**
 * Phase 0 stand-in. Phase 3 fills this with the ~50 surfaces the old game
 * spread across eight tabs, seventeen sub-tabs and fifteen modals — filed into
 * the four groups, reached from three shelf slots and More.
 *
 * Adding a feature should be one entry here and nothing else.
 */
export const PHASE_0_REGISTRY: readonly Destination[] = [
  { id: 'team', group: 'power', label: 'Team', archetype: 'dashboard' },
  { id: 'gear', group: 'power', label: 'Gear', archetype: 'ledger' },
  { id: 'roster', group: 'companion', label: 'Roster', archetype: 'ledger' },
  { id: 'world', group: 'world', label: 'World', archetype: 'dashboard' },
  { id: 'codex', group: 'record', label: 'Codex', archetype: 'ledger', badge: () => 'dot' },
];
