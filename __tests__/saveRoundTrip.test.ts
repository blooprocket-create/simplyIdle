import { DEFAULT_STATE, serialize, sanitizeSaveData, GameState } from '../src/useGameState';

// ── Save / Load Round-Trip ────────────────────────────────────────────────

describe('serialize → sanitizeSaveData round-trip', () => {
  it('default state survives a full round-trip', () => {
    const saved = serialize(DEFAULT_STATE);
    const restored = sanitizeSaveData(saved);

    // Scalar fields must match exactly
    expect(restored.playerName).toBe(DEFAULT_STATE.playerName);
    expect(restored.playerClass).toBe(DEFAULT_STATE.playerClass);
    expect(restored.gold).toBe(DEFAULT_STATE.gold);
    expect(restored.diamonds).toBe(DEFAULT_STATE.diamonds);
    expect(restored.level).toBe(DEFAULT_STATE.level);
    expect(restored.wave).toBe(DEFAULT_STATE.wave);
    expect(restored.prestigeCount).toBe(DEFAULT_STATE.prestigeCount);
    expect(restored.heroShards).toBe(DEFAULT_STATE.heroShards);
    expect(restored.essence).toBe(DEFAULT_STATE.essence);
    expect(restored.vipLevel).toBe(DEFAULT_STATE.vipLevel);
  });

  it('preserves modified scalar state', () => {
    const modified: GameState = {
      ...DEFAULT_STATE,
      playerName: 'TestHero',
      playerClass: 'warrior',
      characterCreated: true,
      gold: 99999,
      diamonds: 42,
      level: 25,
      wave: 15,
      highestWaveReached: 15,
      prestigeCount: 3,
      heroShards: 500,
      essence: 200,
    };

    const saved = serialize(modified);
    const restored = sanitizeSaveData(saved);

    expect(restored.playerName).toBe('TestHero');
    expect(restored.playerClass).toBe('warrior');
    expect(restored.characterCreated).toBe(true);
    expect(restored.gold).toBe(99999);
    expect(restored.diamonds).toBe(42);
    expect(restored.level).toBe(25);
    expect(restored.wave).toBe(15);
    expect(restored.prestigeCount).toBe(3);
    expect(restored.heroShards).toBe(500);
    expect(restored.essence).toBe(200);
  });

  it('preserves stat allocation', () => {
    const modified: GameState = {
      ...DEFAULT_STATE,
      statsAlloc: { strength: 10, vitality: 5, agility: 3, intelligence: 2, spirit: 1 },
    };

    const saved = serialize(modified);
    const restored = sanitizeSaveData(saved);

    expect(restored.statsAlloc).toEqual({ strength: 10, vitality: 5, agility: 3, intelligence: 2, spirit: 1 });
  });

  it('converts Set<string> fields through serialization', () => {
    const modified: GameState = {
      ...DEFAULT_STATE,
      skills: new Set(['skill_a', 'skill_b']),
      achievements: new Set(['ach_1', 'ach_2', 'ach_3']),
    };

    const saved = serialize(modified);

    // serialize converts Sets to arrays
    expect(Array.isArray(saved.skills)).toBe(true);
    expect(Array.isArray(saved.achievements)).toBe(true);
    expect(saved.skills).toContain('skill_a');
    expect(saved.achievements).toContain('ach_1');

    // sanitizeSaveData returns arrays (the reducer LOAD case converts back to Sets)
    const restored = sanitizeSaveData(saved);
    expect(Array.isArray(restored.skills)).toBe(true);
    expect(Array.isArray(restored.achievements)).toBe(true);
  });

  it('handles empty payload gracefully (migration from scratch)', () => {
    const restored = sanitizeSaveData({});

    // Should produce valid defaults, not crash
    expect(restored.playerName).toBe('');
    expect(restored.gold).toBe(0);
    expect(restored.level).toBe(1);
    expect(restored.wave).toBe(1);
    expect(restored.skills).toEqual([]);
    expect(restored.achievements).toEqual([]);
  });

  it('clamps playerName to 24 characters', () => {
    const longName = 'A'.repeat(50);
    const saved = serialize({ ...DEFAULT_STATE, playerName: longName });
    const restored = sanitizeSaveData(saved);

    expect(restored.playerName.length).toBeLessThanOrEqual(24);
  });

  it('rejects invalid playerClass', () => {
    const saved = serialize(DEFAULT_STATE);
    // Force invalid class
    (saved as unknown as Record<string, unknown>).playerClass = 'hacker';
    const restored = sanitizeSaveData(saved);

    expect(restored.playerClass).toBeNull();
  });

  it('preserves equipment inventory', () => {
    const modified: GameState = {
      ...DEFAULT_STATE,
      inventoryItemIds: ['inst_001'],
      equipmentInventory: {
        'inst_001': {
          id: 'inst_001',
          baseItemId: 'w_warrior_blade',
          name: 'Iron Vanguard Blade',
          emoji: '⚔️',
          slot: 'weapon',
          rarity: 'common',
          allowedClasses: ['warrior'],
          description: 'Test',
          bonus: { strength: 3 },
          itemLevel: 1,
          source: 'drop',
        },
      },
      equippedItems: { weapon: 'inst_001', armor: null, accessory: null },
    };

    const saved = serialize(modified);
    const restored = sanitizeSaveData(saved);

    expect(restored.equipmentInventory['inst_001']).toBeDefined();
    expect(restored.equippedItems.weapon).toBe('inst_001');
  });

  it('preserves seen story beat ids', () => {
    const modified: GameState = {
      ...DEFAULT_STATE,
      seenStoryBeatIds: ['prologue_ash', 'chapter_1_raiders'],
    };

    const saved = serialize(modified);
    const restored = sanitizeSaveData(saved);

    expect(restored.seenStoryBeatIds).toEqual(['prologue_ash', 'chapter_1_raiders']);
  });
});
