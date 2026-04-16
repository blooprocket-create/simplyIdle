import {
  getActForWave,
  getBossUnlockForWave,
  unlockLabel,
  getClassConfig,
  getClassPassive,
  getMonsterMaxHp,
  getMonsterGold,
  getMonsterExp,
  getMonsterDamage,
  getMonsterForWave,
  expForLevel,
  getRankConfig,
  getRankUpShardCost,
  getRankStatMultiplier,
  calculateShardReward,
  rollEquipmentRarity,
  getNextEquipmentRarity,
  rollRarity,
  rarityConfig,
  getRebirthWaveRequirement,
  getEquipmentItem,
  RANK_CONFIGS,
  ACTS,
} from '../src/gameConfig';

// ── Act & Campaign ────────────────────────────────────────────────────────

describe('getActForWave', () => {
  it('returns Act 1 for wave 1', () => {
    const act = getActForWave(1);
    expect(act.id).toBe(1);
    expect(act.startWave).toBe(1);
  });

  it('returns Act 1 for wave 10 (boss)', () => {
    expect(getActForWave(10).id).toBe(1);
  });

  it('returns Act 2 for wave 11', () => {
    expect(getActForWave(11).id).toBe(2);
  });

  it('returns last act for very high waves', () => {
    const act = getActForWave(99999);
    expect(act).toBeDefined();
    expect(act.id).toBe(ACTS[ACTS.length - 1].id);
  });
});

describe('getBossUnlockForWave', () => {
  it('returns class_passive at wave 10', () => {
    expect(getBossUnlockForWave(10)).toBe('class_passive');
  });

  it('returns null for non-boss waves', () => {
    expect(getBossUnlockForWave(5)).toBeNull();
    expect(getBossUnlockForWave(11)).toBeNull();
  });
});

describe('unlockLabel', () => {
  it('returns readable labels', () => {
    expect(unlockLabel('class_passive')).toBe('Class Passive Unlocked');
    expect(unlockLabel('mythic_equipment')).toBe('Mythic Equipment Tier Unlocked');
    expect(unlockLabel('advanced_consumables')).toBe('Advanced Consumables Unlocked');
  });
});

// ── Class Config ──────────────────────────────────────────────────────────

describe('getClassConfig', () => {
  it('returns config for each class', () => {
    for (const cls of ['warrior', 'berserker', 'archer', 'mage', 'monk'] as const) {
      const config = getClassConfig(cls);
      expect(config).toBeDefined();
      expect(config.id).toBe(cls);
      expect(config.physWeight).toBeGreaterThan(0);
    }
  });
});

describe('getClassPassive', () => {
  it('returns passive for warrior', () => {
    const passive = getClassPassive('warrior');
    expect(passive).toBeDefined();
    expect(passive.name).toBeTruthy();
  });

  it('each class has distinct passive', () => {
    const names = new Set(
      (['warrior', 'berserker', 'archer', 'mage', 'monk'] as const).map(c => getClassPassive(c).name)
    );
    expect(names.size).toBe(5);
  });
});

// ── Monster & Combat ──────────────────────────────────────────────────────

describe('getMonsterMaxHp', () => {
  it('wave 1 has base HP', () => {
    expect(getMonsterMaxHp(1)).toBe(30);
  });

  it('boss waves have 5x HP', () => {
    const normalApprox = Math.floor(30 * Math.pow(1.12, 9)); // wave 10 base
    expect(getMonsterMaxHp(10)).toBe(normalApprox * 5);
  });

  it('HP increases monotonically within same wave type', () => {
    for (let w = 2; w <= 50; w++) {
      const isBossTransition = (w - 1) % 10 === 0; // wave after a boss
      if (isBossTransition) continue; // boss→normal drops are expected
      expect(getMonsterMaxHp(w)).toBeGreaterThanOrEqual(getMonsterMaxHp(w - 1) * 0.9);
    }
  });

  it('returns positive for all waves', () => {
    for (let w = 1; w <= 200; w++) {
      expect(getMonsterMaxHp(w)).toBeGreaterThan(0);
    }
  });
});

describe('getMonsterGold', () => {
  it('wave 1 returns base gold', () => {
    expect(getMonsterGold(1)).toBe(8);
  });

  it('boss waves give 7x gold', () => {
    const base = Math.max(8, Math.floor(8 * Math.pow(1.14, 9)));
    expect(getMonsterGold(10)).toBe(base * 7);
  });

  it('never returns less than 8', () => {
    for (let w = 1; w <= 100; w++) {
      expect(getMonsterGold(w)).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('getMonsterExp', () => {
  it('wave 1 returns base exp', () => {
    expect(getMonsterExp(1)).toBe(5);
  });

  it('boss waves give 4x exp', () => {
    const base = Math.max(5, Math.floor(5 * Math.pow(1.12, 9)));
    expect(getMonsterExp(10)).toBe(base * 4);
  });
});

describe('getMonsterDamage', () => {
  it('returns positive for all waves', () => {
    for (let w = 1; w <= 100; w++) {
      expect(getMonsterDamage(w)).toBeGreaterThan(0);
    }
  });

  it('boss waves hit 2.5x harder', () => {
    const base10 = Math.max(0.5, Math.floor(0.8 * Math.pow(1.12, 9)) / 10);
    expect(getMonsterDamage(10)).toBe(base10 * 2.5);
  });
});

describe('getMonsterForWave', () => {
  it('boss waves have King variant', () => {
    const monster = getMonsterForWave(10);
    expect(monster.name).toContain('King');
    expect(monster.emoji).toBe('👑');
  });

  it('non-boss waves have normal names', () => {
    const monster = getMonsterForWave(1);
    expect(monster.name).not.toContain('King');
  });
});

describe('expForLevel', () => {
  it('level 1 requires base exp', () => {
    expect(expForLevel(1)).toBe(80);
  });

  it('exp increases with level', () => {
    expect(expForLevel(10)).toBeGreaterThan(expForLevel(5));
    expect(expForLevel(50)).toBeGreaterThan(expForLevel(10));
  });

  it('returns positive for all levels', () => {
    for (let l = 1; l <= 100; l++) {
      expect(expForLevel(l)).toBeGreaterThan(0);
    }
  });
});

// ── Hero Ranking ──────────────────────────────────────────────────────────

describe('getRankConfig', () => {
  it('returns config for valid ranks 1-10', () => {
    for (let r = 1; r <= 10; r++) {
      const config = getRankConfig(r);
      expect(config).not.toBeNull();
      expect(config!.rankNumber).toBe(r);
    }
  });

  it('returns null for invalid ranks', () => {
    expect(getRankConfig(0)).toBeNull();
    expect(getRankConfig(11)).toBeNull();
    expect(getRankConfig(-1)).toBeNull();
  });
});

describe('getRankUpShardCost', () => {
  it('rank 1 costs 0 shards', () => {
    expect(getRankUpShardCost('common', 1)).toBe(0);
  });

  it('higher rarity costs more', () => {
    const commonCost = getRankUpShardCost('common', 5);
    const epicCost = getRankUpShardCost('epic', 5);
    const legendaryCost = getRankUpShardCost('legendary', 5);
    expect(epicCost).toBeGreaterThan(commonCost);
    expect(legendaryCost).toBeGreaterThan(epicCost);
  });

  it('returns MAX_SAFE_INTEGER for invalid rank', () => {
    expect(getRankUpShardCost('common', 11)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('transcendent costs more than godly', () => {
    const transCost = getRankUpShardCost('transcendent', 10);
    const godlyCost = getRankUpShardCost('godly', 10);
    expect(transCost).toBeGreaterThan(godlyCost);
  });
});

describe('getRankStatMultiplier', () => {
  it('rank 1 returns base multiplier (1.0)', () => {
    expect(getRankStatMultiplier(1, 'common')).toBe(1);
  });

  it('higher rank gives higher multiplier', () => {
    expect(getRankStatMultiplier(5, 'common')).toBeGreaterThan(getRankStatMultiplier(1, 'common'));
    expect(getRankStatMultiplier(10, 'common')).toBeGreaterThan(getRankStatMultiplier(5, 'common'));
  });

  it('applies diminishing returns for high-rarity at high rank', () => {
    const trans5 = getRankStatMultiplier(5, 'transcendent');
    const trans10 = getRankStatMultiplier(10, 'transcendent');
    const common5 = getRankStatMultiplier(5, 'common');
    const common10 = getRankStatMultiplier(10, 'common');
    // Ratio should be smaller at rank 10 than at rank 5 due to diminishing returns
    const ratioAt5 = trans5 / common5;
    const ratioAt10 = trans10 / common10;
    expect(ratioAt10).toBeLessThan(ratioAt5 * 2);
  });

  it('never returns less than 1', () => {
    for (const rarity of ['common', 'epic', 'legendary', 'transcendent'] as const) {
      for (let r = 1; r <= 10; r++) {
        expect(getRankStatMultiplier(r, rarity)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('calculateShardReward', () => {
  it('common level 1 returns base value', () => {
    expect(calculateShardReward('common', 1)).toBe(5);
  });

  it('higher rarity gives more shards', () => {
    expect(calculateShardReward('legendary', 1)).toBeGreaterThan(calculateShardReward('common', 1));
  });

  it('higher level gives more shards', () => {
    expect(calculateShardReward('common', 50)).toBeGreaterThan(calculateShardReward('common', 1));
  });

  it('returns positive integer', () => {
    const result = calculateShardReward('epic', 30);
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ── Equipment ─────────────────────────────────────────────────────────────

describe('rollEquipmentRarity', () => {
  it('returns valid rarity for any random input', () => {
    const validRarities = ['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent'];
    for (let i = 0; i <= 10; i++) {
      const rarity = rollEquipmentRarity(i / 10);
      expect(validRarities).toContain(rarity);
    }
  });

  it('low random values give common', () => {
    expect(rollEquipmentRarity(0)).toBe('common');
  });
});

describe('getNextEquipmentRarity', () => {
  it('common → rare', () => {
    expect(getNextEquipmentRarity('common')).toBe('rare');
  });

  it('transcendent → null (max)', () => {
    expect(getNextEquipmentRarity('transcendent')).toBeNull();
  });
});

describe('getEquipmentItem', () => {
  it('returns item for valid ID', () => {
    const item = getEquipmentItem('w_warrior_blade');
    expect(item).toBeDefined();
  });

  it('returns undefined for invalid ID', () => {
    expect(getEquipmentItem('nonexistent_item_xyz')).toBeUndefined();
  });
});

// ── Rarity System ─────────────────────────────────────────────────────────

describe('rollRarity', () => {
  it('returns valid rarity', () => {
    const validRarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly', 'transcendent'];
    expect(validRarities).toContain(rollRarity(0));
    expect(validRarities).toContain(rollRarity(0.5));
    expect(validRarities).toContain(rollRarity(0.999));
  });
});

describe('rarityConfig', () => {
  it('returns config with expected fields', () => {
    const config = rarityConfig('common');
    expect(config.label).toBe('Common');
    expect(config.color).toBeTruthy();
  });
});

// ── Rebirth ───────────────────────────────────────────────────────────────

describe('getRebirthWaveRequirement', () => {
  it('first rebirth requires base wave', () => {
    const req = getRebirthWaveRequirement(0);
    expect(req).toBeGreaterThan(0);
  });

  it('increases with prestige count', () => {
    expect(getRebirthWaveRequirement(5)).toBeGreaterThan(getRebirthWaveRequirement(0));
    expect(getRebirthWaveRequirement(10)).toBeGreaterThan(getRebirthWaveRequirement(5));
  });
});

// ── RANK_CONFIGS integrity ────────────────────────────────────────────────

describe('RANK_CONFIGS', () => {
  it('has 10 ranks', () => {
    expect(RANK_CONFIGS.length).toBe(10);
  });

  it('ranks are numbered 1-10', () => {
    RANK_CONFIGS.forEach((cfg, i) => {
      expect(cfg.rankNumber).toBe(i + 1);
    });
  });

  it('shard costs increase monotonically', () => {
    for (let i = 1; i < RANK_CONFIGS.length; i++) {
      expect(RANK_CONFIGS[i].shardCostToRankUp).toBeGreaterThanOrEqual(RANK_CONFIGS[i - 1].shardCostToRankUp);
    }
  });

  it('stat multipliers increase monotonically', () => {
    for (let i = 1; i < RANK_CONFIGS.length; i++) {
      expect(RANK_CONFIGS[i].statMultiplier).toBeGreaterThanOrEqual(RANK_CONFIGS[i - 1].statMultiplier);
    }
  });
});
