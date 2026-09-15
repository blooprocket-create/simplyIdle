import type { HeroModelSpec } from '../src/game/heroModel/spec';

/**
 * Specs read off the portraits, one hero at a time. This file is the preview
 * set; the full roster lands in `src/content` once the look is settled.
 */
export const PREVIEW_SPECS: HeroModelSpec[] = [
  {
    // Kael Ironheart (h1, warrior, tier 1). Middle-aged, greying beard and
    // short hair, worn steel pauldrons over a green gambeson, brown leather
    // straps crossing the chest, a battered wooden kite shield with a steel
    // rim and boss. Grounded and muted — no glow anywhere on him.
    heroId: 'h1',
    name: 'Kael Ironheart',
    build: 'broad',
    height: 1.85,
    skin: '#c99d7a',
    hair: { style: 'short', colour: '#6b5c4a' },
    beard: { colour: '#7a6f63', length: 0.7 },
    head: { gear: 'none' },
    torso: { armour: 'plate', primary: '#3f6b36', secondary: '#77797d' },
    pauldrons: { size: 1.2, spikes: 0, colour: '#7d7f83' },
    legs: { style: 'trousers', colour: '#4a3b2c' },
    weapon: { kind: 'sword', length: 2.0, colour: '#9aa3ad' },
    offhand: { kind: 'kite', colour: '#6b5335', trim: '#9aa3ad' },
  },
];
