import type { Destination } from './destinations';

/**
 * Every destination in the game, filed into the four groups.
 *
 * The old game reached roughly fifty places through eight bottom tabs,
 * seventeen sub-tabs and fifteen modals, all of which navigated *away* from
 * the fight. Nothing here is deleted; it is filed. Three shelf slots and More
 * reach all of it, and the cost of navigation stops growing with the game.
 *
 * Adding a feature should be one entry in this file and nothing else.
 *
 * Two consolidations from REVAMP, section 3, rather than ports:
 *
 *   - `Stats` is not a destination. It becomes tooltips on the numbers it
 *     describes, where a player is already looking.
 *   - `Achievements`' five sub-tabs become one ledger, with an objectives
 *     ticker in the HUD rather than a screen to go and check.
 */

/**
 * Rebirth stays hidden until it is reachable.
 *
 * A stand-in: the snapshot carries the wave and not yet whether prestige is
 * unlocked, so this asks the question it can answer. It moves to the real
 * signal when the engine exposes one, and the shape of `available` does not
 * change when it does.
 */
export const REBIRTH_VISIBLE_FROM_WAVE = 100;

export const REGISTRY: readonly Destination[] = [
  // Power — what the player is made of.
  { id: 'character', group: 'power', label: 'Character', archetype: 'detail' },
  { id: 'equipment', group: 'power', label: 'Equipment', archetype: 'ledger' },
  { id: 'skills', group: 'power', label: 'Skills', archetype: 'ledger' },
  {
    id: 'rebirth',
    group: 'power',
    label: 'Rebirth',
    archetype: 'moment',
    available: snapshot => snapshot.wave >= REBIRTH_VISIBLE_FROM_WAVE,
  },

  // Companion — who fights alongside them.
  { id: 'roster', group: 'companion', label: 'Roster', archetype: 'ledger' },
  // A ledger, not a dashboard: it lists the team, and a dashboard is "a few
  // big numbers and their controls. No list, so nothing to scroll". Filed as
  // a dashboard first, which put 383px of cards below a panel that cannot
  // scroll — the archetype table was right and the filing was wrong.
  { id: 'party', group: 'companion', label: 'Party', archetype: 'ledger' },
  { id: 'summon', group: 'companion', label: 'Summon', archetype: 'moment' },

  // World — where they fight.
  { id: 'campaign', group: 'world', label: 'Campaign', archetype: 'dashboard' },
  { id: 'operations', group: 'world', label: 'Operations', archetype: 'ledger' },
  { id: 'expeditions', group: 'world', label: 'Expeditions', archetype: 'ledger' },
  { id: 'dungeons', group: 'world', label: 'Dungeons', archetype: 'ledger' },
  { id: 'events', group: 'world', label: 'Events', archetype: 'dashboard' },

  // Record — what they have done, and everything else.
  { id: 'achievements', group: 'record', label: 'Achievements', archetype: 'ledger' },
  { id: 'missions', group: 'record', label: 'Missions', archetype: 'ledger' },
  { id: 'codex', group: 'record', label: 'Codex', archetype: 'ledger' },
  { id: 'leaderboard', group: 'record', label: 'Leaderboard', archetype: 'graph' },

  // Social. REVAMP's table names only Leaderboard, but the shipped game also
  // has guild, friends, chat, DM, feed, search and wars behind one Social tab.
  // Filed here rather than dropped, and collapsed to the three that are
  // destinations — chat, DM, feed and search are views inside Guild and
  // Friends, not places of their own.
  { id: 'guild', group: 'record', label: 'Guild', archetype: 'dashboard' },
  { id: 'friends', group: 'record', label: 'Friends', archetype: 'ledger' },

  { id: 'settings', group: 'record', label: 'Settings', archetype: 'detail' },
];

/**
 * What the shelf shows before a player has chosen. Deliberately the three a
 * new player needs first: who they are, who fights for them, and where.
 */
export const DEFAULT_PINNED: readonly string[] = ['character', 'roster', 'campaign'];
