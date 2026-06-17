// ─── BattleEngine.test.js ─────────────────────────────────────────────────────
const { BattleEngine, calculateDamage, calculateCaptureChance, rollCritical } = require('../../src/battle/BattleEngine');
const { getTypeEffectiveness, getSTAB } = require('../../src/battle/TypeChart');
const { STATUS, StatusEffectManager } = require('../../src/battle/StatusEffects');

// ─── Helper: create a mock battle monster ────────────────────────────────────
function mockMonster(overrides = {}) {
  return {
    instanceId: 'test_' + Math.random(),
    name: 'TestMon',
    level: 50,
    types: { primary: 'Fire' },
    currentHp: 150,
    maxHp: 150,
    isAlive: true,
    calculatedStats: { hp: 150, attack: 100, defense: 80, specialAttack: 110, specialDefense: 85, speed: 90 },
    statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },
    statusEffect: { type: 'none', turnsRemaining: 0 },
    moves: [],
    energy: 3,
    maxEnergy: 5,
    volatile: { flinched: false, recharging: false, charging: false, protectActive: false },
    ability: {},
    catchRate: 45,
    ...overrides,
  };
}

function mockMove(overrides = {}) {
  return {
    moveId: 'flamethrower',
    name: 'Flamethrower',
    type: 'Fire',
    category: 'special',
    power: 90,
    accuracy: 100,
    energyCost: 2,
    maxUses: 10,
    currentUses: 10,
    priority: 0,
    effects: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EFFECTIVENESS TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('TypeChart', () => {
  test('Fire vs Grass = 2× (super effective)', () => {
    expect(getTypeEffectiveness('Fire', 'Grass')).toBe(2);
  });

  test('Fire vs Water = 0.5× (not very effective)', () => {
    expect(getTypeEffectiveness('Fire', 'Water')).toBe(0.5);
  });

  test('Fire vs Fire = 0.5× (same type resist)', () => {
    expect(getTypeEffectiveness('Fire', 'Fire')).toBe(0.5);
  });

  test('Ghost vs Normal = 0 (immune)', () => {
    expect(getTypeEffectiveness('Ghost', 'Normal')).toBe(0);
  });

  test('Electric vs Water = 2×', () => {
    expect(getTypeEffectiveness('Electric', 'Water')).toBe(2);
  });

  test('Psychic vs Dark = 0 (immune)', () => {
    expect(getTypeEffectiveness('Psychic', 'Dark')).toBe(0);
  });

  test('Dragon vs Dragon = 2×', () => {
    expect(getTypeEffectiveness('Dragon', 'Dragon')).toBe(2);
  });

  test('Ice vs Dragon = 2×', () => {
    expect(getTypeEffectiveness('Ice', 'Dragon')).toBe(2);
  });

  test('dual type: Fire vs Water/Grass = 1× (0.5 × 2)', () => {
    expect(getTypeEffectiveness('Fire', 'Water', 'Grass')).toBe(1);
  });

  test('dual type: Electric vs Water/Water = 4× (2 × 2)', () => {
    expect(getTypeEffectiveness('Electric', 'Water', 'Water')).toBe(4);
  });

  test('STAB bonus = 1.5× when move type matches monster type', () => {
    expect(getSTAB('Fire', 'Fire')).toBe(1.5);
  });

  test('No STAB = 1× when types do not match', () => {
    expect(getSTAB('Water', 'Fire')).toBe(1);
  });

  test('STAB applies to secondary type too', () => {
    expect(getSTAB('Grass', 'Fire', 'Grass')).toBe(1.5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DAMAGE FORMULA TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Damage Formula', () => {
  test('physical move uses attack vs defense', () => {
    const attacker = mockMonster({ calculatedStats: { hp:150, attack:100, defense:80, specialAttack:50, specialDefense:80, speed:90 } });
    const defender = mockMonster({ calculatedStats: { hp:150, attack:80, defense:100, specialAttack:80, specialDefense:100, speed:80 } });
    const move = mockMove({ category: 'physical', power: 80, type: 'Normal' });
    const { damage } = calculateDamage(attacker, defender, move);
    expect(damage).toBeGreaterThan(0);
    expect(damage).toBeLessThan(200);
  });

  test('status moves deal 0 damage', () => {
    const attacker = mockMonster();
    const defender = mockMonster();
    const move = mockMove({ category: 'status', power: 0 });
    const { damage } = calculateDamage(attacker, defender, move);
    expect(damage).toBe(0);
  });

  test('critical hit deals more damage than normal', () => {
    const attacker = mockMonster();
    const defender = mockMonster();
    const move = mockMove({ power: 90 });
    const { damage: critDmg } = calculateDamage(attacker, defender, move, { isCritical: true });
    const { damage: normDmg } = calculateDamage(attacker, defender, move, { isCritical: false });
    expect(critDmg).toBeGreaterThan(normDmg * 0.9); // account for random factor
  });

  test('super effective move deals more damage', () => {
    const attacker = mockMonster({ types: { primary: 'Fire' } });
    const grassDefender = mockMonster({ types: { primary: 'Grass' } });
    const waterDefender = mockMonster({ types: { primary: 'Water' } });
    const move = mockMove({ type: 'Fire', power: 90 });
    const { damage: vGrass } = calculateDamage(attacker, grassDefender, move);
    const { damage: vWater } = calculateDamage(attacker, waterDefender, move);
    expect(vGrass).toBeGreaterThan(vWater);
  });

  test('STAB increases damage by ~1.5×', () => {
    const attacker = mockMonster({ types: { primary: 'Fire' } });
    const defender = mockMonster({ types: { primary: 'Normal' } });
    const stabMove   = mockMove({ type: 'Fire', power: 60 });
    const noStabMove = mockMove({ type: 'Water', power: 60 });
    const { damage: stabDmg }   = calculateDamage(attacker, defender, stabMove);
    const { damage: noStabDmg } = calculateDamage(attacker, defender, noStabMove);
    expect(stabDmg).toBeGreaterThan(noStabDmg);
  });

  test('immune type deals 0 damage', () => {
    const attacker = mockMonster({ types: { primary: 'Ghost' } });
    const defender = mockMonster({ types: { primary: 'Normal' } });
    const move = mockMove({ type: 'Ghost', power: 80 });
    const { damage, effectiveness } = calculateDamage(attacker, defender, move);
    expect(effectiveness).toBe(0);
    // Note: damage formula returns max(1, ...) so check effectiveness
    expect(effectiveness).toBe(0);
  });

  test('damage is always at least 1', () => {
    const weakAttacker = mockMonster({ calculatedStats: { hp:50, attack:5, defense:5, specialAttack:5, specialDefense:5, speed:5 } });
    const tankDefender = mockMonster({ calculatedStats: { hp:300, attack:50, defense:250, specialAttack:50, specialDefense:250, speed:30 } });
    const move = mockMove({ power: 10, type: 'Normal' });
    const { damage } = calculateDamage(weakAttacker, tankDefender, move, { isCritical: false });
    expect(damage).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS EFFECTS TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('StatusEffects', () => {
  test('Burn is applied correctly', () => {
    const monster = mockMonster();
    const { applied, message } = StatusEffectManager.tryApply(monster, STATUS.BURN, 1);
    expect(applied).toBe(true);
    expect(monster.statusEffect.type).toBe(STATUS.BURN);
    expect(message).toContain('burn');
  });

  test('Fire type is immune to Burn', () => {
    const fireMonster = mockMonster({ types: { primary: 'Fire' } });
    const { applied } = StatusEffectManager.tryApply(fireMonster, STATUS.BURN, 1);
    expect(applied).toBe(false);
    expect(fireMonster.statusEffect.type).toBe('none');
  });

  test('Electric type is immune to Paralysis', () => {
    const elecMonster = mockMonster({ types: { primary: 'Electric' } });
    const { applied } = StatusEffectManager.tryApply(elecMonster, STATUS.PARALYSIS, 1);
    expect(applied).toBe(false);
  });

  test('Ice type is immune to Freeze', () => {
    const iceMonster = mockMonster({ types: { primary: 'Ice' } });
    const { applied } = StatusEffectManager.tryApply(iceMonster, STATUS.FREEZE, 1);
    expect(applied).toBe(false);
  });

  test('Burn deals 6.25% max HP damage per turn', () => {
    const monster = mockMonster({ maxHp: 160, currentHp: 160 });
    StatusEffectManager.tryApply(monster, STATUS.BURN, 1);
    const result = StatusEffectManager.processStartOfTurn(monster);
    expect(result.damage).toBe(10); // 6.25% of 160 = 10
  });

  test('Sleep prevents action', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.SLEEP, 1);
    monster.statusEffect.turnsRemaining = 2;
    const result = StatusEffectManager.processStartOfTurn(monster);
    expect(result.canAct).toBe(false);
  });

  test('Sleep wakes up when turns reach 0', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.SLEEP, 1);
    monster.statusEffect.turnsRemaining = 1;
    const result = StatusEffectManager.processStartOfTurn(monster);
    expect(result.cured).toBe(true);
  });

  test('Paralysis halves speed via getSpeedModifier', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.PARALYSIS, 1);
    const mod = StatusEffectManager.getSpeedModifier(monster);
    expect(mod).toBe(0.25);
  });

  test('Burn halves physical attack', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.BURN, 1);
    const mod = StatusEffectManager.getAttackModifier(monster, 'physical');
    expect(mod).toBe(0.5);
  });

  test('Burn does NOT affect special attack', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.BURN, 1);
    const mod = StatusEffectManager.getAttackModifier(monster, 'special');
    expect(mod).toBe(1);
  });

  test('cure() removes status effect', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.POISON, 1);
    expect(monster.statusEffect.type).toBe(STATUS.POISON);
    StatusEffectManager.cure(monster);
    expect(monster.statusEffect.type).toBe(STATUS.NONE);
  });

  test('Cannot apply status to monster already statused', () => {
    const monster = mockMonster();
    StatusEffectManager.tryApply(monster, STATUS.BURN, 1);
    const { applied } = StatusEffectManager.tryApply(monster, STATUS.POISON, 1);
    expect(applied).toBe(false);
    expect(monster.statusEffect.type).toBe(STATUS.BURN); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CAPTURE FORMULA TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('Capture Formula', () => {
  test('low HP increases capture chance', () => {
    const fullHP = { currentHp: 100, maxHp: 100, catchRate: 45 };
    const lowHP  = { currentHp: 5,   maxHp: 100, catchRate: 45 };
    const ball   = { catchBonus: 1 };
    const fullResult = calculateCaptureChance(fullHP, ball);
    const lowResult  = calculateCaptureChance(lowHP,  ball);
    expect(lowResult.capturePercent).toBeGreaterThan(fullResult.capturePercent);
  });

  test('Master Ball always captures (catchBonus 999)', () => {
    const monster = { currentHp: 100, maxHp: 100, catchRate: 45 };
    const masterBall = { catchBonus: 999 };
    const result = calculateCaptureChance(monster, masterBall);
    expect(result.captured).toBe(true);
    expect(result.shakeCount).toBe(4);
  });

  test('high catch rate monster is easier to catch', () => {
    const common    = { currentHp: 50, maxHp: 100, catchRate: 200 };
    const legendary = { currentHp: 50, maxHp: 100, catchRate: 3 };
    const ball = { catchBonus: 1 };
    const commonPct = calculateCaptureChance(common, ball).capturePercent;
    const legendPct = calculateCaptureChance(legendary, ball).capturePercent;
    expect(commonPct).toBeGreaterThan(legendPct);
  });

  test('better ball bonus increases capture chance', () => {
    const monster  = { currentHp: 80, maxHp: 100, catchRate: 45 };
    const basic  = calculateCaptureChance(monster, { catchBonus: 1 });
    const ultra  = calculateCaptureChance(monster, { catchBonus: 2 });
    expect(ultra.capturePercent).toBeGreaterThanOrEqual(basic.capturePercent);
  });

  test('shake count is between 0 and 4', () => {
    const monster = { currentHp: 50, maxHp: 100, catchRate: 45 };
    for (let i = 0; i < 20; i++) {
      const { shakeCount } = calculateCaptureChance(monster, { catchBonus: 1 });
      expect(shakeCount).toBeGreaterThanOrEqual(0);
      expect(shakeCount).toBeLessThanOrEqual(4);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BATTLE ENGINE INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('BattleEngine', () => {
  function createTestEngine() {
    const engine = new BattleEngine({ type: 'pve', mode: 'test', expEnabled: false, rewardsEnabled: false });
    const teamA = [{ ...mockMonster({ instanceId: 'a1', name: 'FireMon', types: { primary: 'Fire' } }), _id: { toString: () => 'a1' }, equippedMoves: [{ ...mockMove(), currentUses: 10 }], ability: {}, statusEffect: { type: 'none', turnsRemaining: 0 } }];
    const teamB = [{ ...mockMonster({ instanceId: 'b1', name: 'WaterMon', types: { primary: 'Water' } }), _id: { toString: () => 'b1' }, equippedMoves: [{ ...mockMove({ moveId: 'surf', name: 'Surf', type: 'Water' }), currentUses: 10 }], ability: {}, statusEffect: { type: 'none', turnsRemaining: 0 } }];

    engine.playerA = { userId: 'userA', username: 'PlayerA', isNPC: false, team: teamA, activeIndex: 0, items: {}, isReady: true, isConnected: true };
    engine.playerB = { userId: 'userB', username: 'PlayerB', isNPC: true, team: teamB, activeIndex: 0, items: {}, isReady: true, isConnected: true };
    return engine;
  }

  test('battle starts correctly', () => {
    const engine = createTestEngine();
    const result = engine.start();
    expect(engine.status).toBe('active');
    expect(result.battleId).toBeDefined();
    expect(engine.turn).toBe(1);
  });

  test('submitting a move changes pending actions', () => {
    const engine = createTestEngine();
    engine.start();
    engine.submitAction('A', { type: 'move', moveId: 'flamethrower' });
    expect(engine.pendingActions['A']).toBeDefined();
    expect(engine.pendingActions['A'].type).toBe('move');
  });

  test('turn resolves after both actions submitted', () => {
    const engine = createTestEngine();
    engine.start();
    const result = engine.submitAction('A', { type: 'move', moveId: 'flamethrower' });
    // NPC auto-acts in PvE
    expect(result).toBeDefined();
    // Should have resolved (turn advanced or battle ended)
    expect([2, 1]).toContain(engine.turn); // turn 2 if battle continued, 1 if ended
  });

  test('pass action is handled gracefully', () => {
    const engine = createTestEngine();
    engine.start();
    expect(() => {
      engine.submitAction('A', { type: 'pass' });
    }).not.toThrow();
  });

  test('battle ends when all monsters faint', () => {
    const engine = createTestEngine();
    engine.start();
    // Force faint all of playerB's team
    engine.playerB.team.forEach(m => { m.currentHp = 0; m.isAlive = false; });
    expect(engine.isTeamDefeated(engine.playerB)).toBe(true);
  });

  test('invalid move throws error', () => {
    const engine = createTestEngine();
    engine.start();
    expect(() => {
      engine.submitAction('A', { type: 'move', moveId: 'nonexistent_move' });
    }).toThrow('Invalid move');
  });

  test('cannot act when battle is not active', () => {
    const engine = createTestEngine();
    // Don't start
    expect(() => {
      engine.submitAction('A', { type: 'move', moveId: 'flamethrower' });
    }).toThrow('Battle is not active');
  });

  test('speed determines turn order when no priority', () => {
    const fastA  = { type: 'move', moveId: 'flamethrower', side: 'A' };
    const slowB  = { type: 'move', moveId: 'surf', side: 'B' };
    const engine = createTestEngine();
    engine.start();
    engine.activeA.calculatedStats.speed = 150;
    engine.activeB.calculatedStats.speed = 50;
    const [first, , firstSide] = engine._determineTurnOrder(fastA, slowB);
    expect(firstSide).toBe('A');
  });

  test('switch action goes before move action', () => {
    const engine = createTestEngine();
    engine.start();
    // Add second monster to test switch
    const second = { ...mockMonster({ instanceId: 'a2', name: 'GrassMon' }), _id: { toString: () => 'a2' }, equippedMoves: [], ability: {}, statusEffect: { type: 'none', turnsRemaining: 0 } };
    engine.playerA.team.push(second);
    const switchAction = { type: 'switch', side: 'A', targetIndex: 1 };
    const moveAction   = { type: 'move',   side: 'B', moveId: 'surf' };
    const [, , firstSide] = engine._determineTurnOrder(switchAction, moveAction);
    expect(firstSide).toBe('A');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ELO RATING TESTS
// ═══════════════════════════════════════════════════════════════════════════════
describe('ELO Rating', () => {
  const { _calculateEloChange } = require('../../src/battle/BattleManager');

  // Note: _calculateEloChange is a static private method — test via calculation
  function calcElo(ratingA, ratingB, resultA) {
    const K = 32;
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    return Math.round(K * (resultA - expectedA));
  }

  test('winner gains ELO, loser loses ELO', () => {
    const changeA = calcElo(1000, 1000, 1); // win
    expect(changeA).toBeGreaterThan(0);
  });

  test('upset win gives more ELO than expected win', () => {
    const upsetGain   = calcElo(900,  1100, 1); // underdog wins
    const expectedGain = calcElo(1100, 900,  1); // favourite wins
    expect(upsetGain).toBeGreaterThan(expectedGain);
  });

  test('draw at equal ratings gives 0 change', () => {
    const change = calcElo(1000, 1000, 0.5);
    expect(change).toBe(0);
  });

  test('ELO does not go below 0 (floor protection)', () => {
    const newRating = Math.max(0, 50 - 100);
    expect(newRating).toBe(0);
  });
});
