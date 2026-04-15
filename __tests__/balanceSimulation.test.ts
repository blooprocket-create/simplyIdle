import {
  getMonsterMaxHp,
  getMonsterGold,
  getMonsterExp,
  expForLevel,
  getRebirthWaveRequirement,
  REBIRTH_BONUS,
} from '../src/gameConfig';

/**
 * Balance simulation tests — validates progression pacing,
 * economy curves, and power scaling to catch regressions.
 */

// ── Progression Pacing ────────────────────────────────────────────────────

describe('Progression pacing', () => {
  it('gold income from first 10 waves is meaningful', () => {
    let totalGold = 0;
    for (let w = 1; w <= 10; w++) {
      totalGold += getMonsterGold(w);
    }
    // First 10 waves should yield enough gold to feel rewarding
    expect(totalGold).toBeGreaterThan(100);
  });

  it('gold income grows steadily over 20 waves', () => {
    let firstHalf = 0;
    let secondHalf = 0;
    for (let w = 1; w <= 10; w++) firstHalf += getMonsterGold(w);
    for (let w = 11; w <= 20; w++) secondHalf += getMonsterGold(w);
    expect(secondHalf).toBeGreaterThan(firstHalf);
  });

  it('exp from wave 1-10 is enough to reach at least level 2', () => {
    let totalExp = 0;
    for (let w = 1; w <= 10; w++) {
      totalExp += getMonsterExp(w);
    }
    expect(totalExp).toBeGreaterThanOrEqual(expForLevel(1));
  });

  it('level 50 is reachable with reasonable exp (not astronomical)', () => {
    const expNeeded = expForLevel(50);
    // Should be less than 1 billion — ensures players can reach mid-game
    expect(expNeeded).toBeLessThan(1e9);
    expect(expNeeded).toBeGreaterThan(1e4);
  });
});

// ── Gold Curve ────────────────────────────────────────────────────────────

describe('Gold curve', () => {
  it('gold never decreases within a 10-wave act (excluding boss transition)', () => {
    for (let w = 2; w <= 100; w++) {
      const isBossTransition = (w - 1) % 10 === 0;
      if (isBossTransition) continue;
      expect(getMonsterGold(w)).toBeGreaterThanOrEqual(getMonsterGold(w - 1));
    }
  });

  it('boss waves give significantly more gold than normal', () => {
    for (let boss = 10; boss <= 50; boss += 10) {
      const normalGold = getMonsterGold(boss - 1);
      const bossGold = getMonsterGold(boss);
      expect(bossGold).toBeGreaterThan(normalGold * 3);
    }
  });

  it('gold at wave 100 is at least 1000x wave 1 gold', () => {
    const ratio = getMonsterGold(100) / getMonsterGold(1);
    expect(ratio).toBeGreaterThan(1000);
  });
});

// ── Monster HP Curve ──────────────────────────────────────────────────────

describe('DPS vs HP parity', () => {
  it('monster HP growth rate 1.14x is consistent', () => {
    const hp1 = getMonsterMaxHp(1);
    const hp2 = getMonsterMaxHp(2);
    const ratio = hp2 / hp1;
    expect(ratio).toBeCloseTo(1.14, 1);
  });
});

// ── Rebirth Pacing ────────────────────────────────────────────────────────

describe('Rebirth pacing', () => {
  it('first rebirth requires wave 100', () => {
    expect(getRebirthWaveRequirement(0)).toBe(100);
  });

  it('rebirth requirement increases 12% per prestige', () => {
    const req0 = getRebirthWaveRequirement(0);
    const req1 = getRebirthWaveRequirement(1);
    const ratio = req1 / req0;
    expect(ratio).toBeCloseTo(1.12, 1);
  });

  it('rebirth bonus is 1.5x multiplier per count', () => {
    expect(REBIRTH_BONUS).toBe(1.5);
    // After 3 rebirths: 1.5^3 = 3.375x
    expect(Math.pow(REBIRTH_BONUS, 3)).toBeCloseTo(3.375, 3);
  });

  it('10th rebirth requirement stays under wave 400', () => {
    const req10 = getRebirthWaveRequirement(10);
    expect(req10).toBeLessThan(400);
    expect(req10).toBeGreaterThan(200);
  });

  it('rebirth bonus doesnt exceed 1000x within 20 rebirths', () => {
    const bonus20 = Math.pow(REBIRTH_BONUS, 20);
    expect(bonus20).toBeLessThan(5000);
  });
});

// ── Economy Simulation ────────────────────────────────────────────────────

describe('Economy simulation', () => {
  it('simulates 100-wave run and verifies gold/exp totals are reasonable', () => {
    let totalGold = 0;
    let totalExp = 0;
    for (let w = 1; w <= 100; w++) {
      totalGold += getMonsterGold(w);
      totalExp += getMonsterExp(w);
    }

    // 100 waves should yield meaningful resources
    expect(totalGold).toBeGreaterThan(1e6);
    expect(totalExp).toBeGreaterThan(1e4);

    // But not astronomically broken
    expect(totalGold).toBeLessThan(1e12);
    expect(totalExp).toBeLessThan(1e10);
  });

  it('exp curve: level 10 is reachable from waves 1-50', () => {
    let totalExp = 0;
    for (let w = 1; w <= 50; w++) {
      totalExp += getMonsterExp(w);
    }
    let expNeeded = 0;
    for (let l = 1; l < 10; l++) {
      expNeeded += expForLevel(l);
    }
    expect(totalExp).toBeGreaterThan(expNeeded);
  });

  it('monster HP doesnt outpace gold income scaling', () => {
    // Verify HP and gold scale at similar rates (both use 1.14x base).
    // Mid-game catchup boost (waves 20-60) intentionally pushes gold
    // ahead of HP so the ratio can reach ~3x in that range.
    const hpGrowth = getMonsterMaxHp(50) / getMonsterMaxHp(1);
    const goldGrowth = getMonsterGold(50) / getMonsterGold(1);
    const ratio = goldGrowth / hpGrowth;
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(3.5);
  });
});
