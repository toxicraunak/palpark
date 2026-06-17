/**
 * Monster Legends Arena — Battle Engine
 * Handles full turn-based battle logic for PvE and PvP
 */

const { v4: uuidv4 } = require('uuid');
const { getTypeEffectiveness, getEffectivenessText, getSTAB } = require('./TypeChart');
const { STATUS, StatusEffectManager } = require('./StatusEffects');

// ─── Stat Stage Multipliers ────────────────────────────────────────────────
const STAT_STAGES = {
  '-6': 0.25, '-5': 0.28, '-4': 0.33, '-3': 0.40, '-2': 0.50, '-1': 0.67,
  '0': 1.00,
  '1': 1.50, '2': 2.00, '3': 2.50, '4': 3.00, '5': 3.50, '6': 4.00,
};

function stageMultiplier(stage) {
  return STAT_STAGES[String(Math.max(-6, Math.min(6, stage)))] || 1;
}

// ─── Battle Monster State Factory ─────────────────────────────────────────
function createBattleMonster(playerMonster, templateData) {
  const base = playerMonster.calculatedStats;
  return {
    instanceId: playerMonster._id.toString(),
    templateId: playerMonster.templateId,
    name: playerMonster.nickname || playerMonster.name,
    level: playerMonster.level,
    types: playerMonster.types,
    rarity: playerMonster.rarity,
    isShiny: playerMonster.isShiny,

    // Live HP
    currentHp: playerMonster.currentHp || base.hp,
    maxHp: base.hp,
    isAlive: true,

    // Base calculated stats
    calculatedStats: { ...base },

    // Stat stage buffs (-6 to +6)
    statStages: { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 },

    // Status
    statusEffect: { ...playerMonster.statusEffect } || { type: 'none', turnsRemaining: 0 },

    // Moves with current PP
    moves: playerMonster.equippedMoves.map(m => ({
      ...m,
      currentUses: m.currentUses ?? m.maxUses,
    })),

    // Energy system (0-5 energy, gain 1 per turn)
    energy: 3,
    maxEnergy: 5,

    // Volatile battle flags (reset on switch)
    volatile: {
      flinched: false,
      recharging: false,
      charging: false,
      boundTurns: 0,
      confused: false,
      tauntTurns: 0,
      encoreTurns: 0,
      lastMoveUsed: null,
      protectActive: false,
      focusBand: false,
    },

    // Template reference for abilities
    ability: playerMonster.ability || {},
    moves_backup: [...playerMonster.equippedMoves],
    catchRate: templateData?.catchRate || 45,
  };
}

// ─── Damage Formula ────────────────────────────────────────────────────────
/**
 * Core damage calculation (Gen-style formula)
 * Damage = ((2*Level/5 + 2) * Power * (Atk/Def)) / 50 + 2
 *          * STAB * TypeEffectiveness * Critical * Random * OtherMods
 */
function calculateDamage(attacker, defender, move, opts = {}) {
  const { isCritical = false, ignoreDefense = false, weatherMod = 1, fieldMod = 1 } = opts;

  if (move.category === 'status') return { damage: 0, isCritical: false, effectiveness: 1, effectText: 'normal' };

  const level = attacker.level;
  const power = move.power || 1;

  // Choose attack/defense stats based on move category
  const isPhysical = move.category === 'physical';
  const atkStageMod = stageMultiplier(attacker.statStages[isPhysical ? 'attack' : 'specialAttack']);
  const defStageMod = stageMultiplier(defender.statStages[isPhysical ? 'defense' : 'specialDefense']);

  let atk = (isPhysical ? attacker.calculatedStats.attack : attacker.calculatedStats.specialAttack) * atkStageMod;
  let def = (isPhysical ? defender.calculatedStats.defense : defender.calculatedStats.specialDefense) * defStageMod;

  // Status attack modifier (burn halves physical)
  const statusAtkMod = StatusEffectManager.getAttackModifier(attacker, move.category);
  atk *= statusAtkMod;

  // Critical hit — ignore defensive stat stages and status defense boosts
  if (isCritical) {
    def = isPhysical ? defender.calculatedStats.defense : defender.calculatedStats.specialDefense;
    // Critical also ignores attacker's negative attack stages
    if (atkStageMod < 1) atk = isPhysical ? attacker.calculatedStats.attack : attacker.calculatedStats.specialAttack;
  }

  if (ignoreDefense) def = 1;

  // Base damage
  const baseDamage = (((2 * level / 5 + 2) * power * (atk / def)) / 50) + 2;

  // Modifiers
  const stab = getSTAB(move.type, attacker.types.primary, attacker.types.secondary);
  const typeEff = getTypeEffectiveness(move.type, defender.types.primary, defender.types.secondary);
  const critMultiplier = isCritical ? 1.5 : 1;
  const randomFactor = 0.85 + Math.random() * 0.15; // 85%–100%

  let finalDamage = Math.floor(baseDamage * stab * typeEff * critMultiplier * randomFactor * weatherMod * fieldMod);
  finalDamage = Math.max(1, finalDamage);

  return {
    damage: finalDamage,
    isCritical,
    effectiveness: typeEff,
    effectText: getEffectivenessText(typeEff),
    stab: stab > 1,
    rawBaseDamage: baseDamage,
  };
}

// ─── Critical Hit Calculation ──────────────────────────────────────────────
function rollCritical(attacker, move) {
  // Base 1/16 chance, increased by move priority and attacker modifiers
  let critChance = 1 / 16;
  if (move.highCritRatio) critChance = 1 / 8;
  if (move.alwaysCrit) return true;
  return Math.random() < critChance;
}

// ─── Accuracy Check ────────────────────────────────────────────────────────
function checkAccuracy(attacker, defender, move) {
  if (move.accuracy === null || move.accuracy === undefined) return true; // Always hits
  const movAcc = move.accuracy / 100;
  const accStage = stageMultiplier(attacker.statStages.accuracy);
  const evaStage = stageMultiplier(-defender.statStages.evasion);
  const statusAccMod = StatusEffectManager.getAccuracyModifier(attacker);
  const finalAcc = movAcc * accStage * evaStage * statusAccMod;
  return Math.random() < finalAcc;
}

// ─── Capture Chance Formula ────────────────────────────────────────────────
function calculateCaptureChance(wildMonster, captureItem) {
  const maxHp = wildMonster.maxHp;
  const currentHp = wildMonster.currentHp;
  const catchRate = wildMonster.catchRate || 45;
  const ballBonus = captureItem?.catchBonus || 1;

  // Classic capture formula
  const a = (((3 * maxHp - 2 * currentHp) * catchRate * ballBonus) / (3 * maxHp));
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));

  // Four shake checks
  let shakes = 0;
  for (let i = 0; i < 4; i++) {
    if (Math.random() * 65535 < b) shakes++;
    else break;
  }

  const captured = shakes === 4;
  const shakeCount = shakes;
  const capturePercent = Math.min(100, Math.round((a / (catchRate * ballBonus)) * 100));

  return { captured, shakeCount, capturePercent, a, b };
}

// ─── Stat Stage Application ────────────────────────────────────────────────
function applyStatChange(monster, stat, stages) {
  const current = monster.statStages[stat] || 0;
  const newStage = Math.max(-6, Math.min(6, current + stages));
  const actualChange = newStage - current;
  monster.statStages[stat] = newStage;

  if (actualChange > 0) return { message: `${monster.name}'s ${stat} rose${actualChange >= 2 ? ' sharply' : ''}!`, change: actualChange };
  if (actualChange < 0) return { message: `${monster.name}'s ${stat} fell${actualChange <= -2 ? ' sharply' : ''}!`, change: actualChange };
  return { message: `${monster.name}'s ${stat} won't go ${stages > 0 ? 'higher' : 'lower'}!`, change: 0 };
}

// ─── Move Effect Processor ─────────────────────────────────────────────────
function processMoveEffects(move, attacker, defender, battleLog) {
  if (!move.effects || move.effects.length === 0) return;

  for (const effect of move.effects) {
    const target = effect.target === 'self' ? attacker : defender;
    const roll = Math.random() * 100;
    if (roll > (effect.chance || 100)) continue;

    switch (effect.type) {
      case 'burn':
      case 'poison':
      case 'freeze':
      case 'sleep':
      case 'paralysis':
      case 'confusion':
      case 'blind':
      case 'bleed': {
        const { applied, message } = StatusEffectManager.tryApply(target, effect.type, 1);
        if (applied && message) battleLog.push({ type: 'status', message });
        break;
      }

      case 'stat_change': {
        const result = applyStatChange(target, effect.stat, effect.stages);
        battleLog.push({ type: 'stat', message: result.message, stat: effect.stat, change: result.change });
        break;
      }

      case 'heal': {
        const healAmount = Math.floor(attacker.maxHp * (effect.value / 100));
        attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + healAmount);
        battleLog.push({ type: 'heal', message: `${attacker.name} restored ${healAmount} HP!`, amount: healAmount });
        break;
      }

      case 'drain': {
        const drainAmount = Math.floor((effect.value / 100) * (attacker._lastDamageDealt || 0));
        if (drainAmount > 0) {
          attacker.currentHp = Math.min(attacker.maxHp, attacker.currentHp + drainAmount);
          battleLog.push({ type: 'drain', message: `${attacker.name} drained ${drainAmount} HP!`, amount: drainAmount });
        }
        break;
      }

      case 'recoil': {
        const recoilAmount = Math.floor((effect.value / 100) * (attacker._lastDamageDealt || 0));
        if (recoilAmount > 0) {
          attacker.currentHp = Math.max(0, attacker.currentHp - recoilAmount);
          if (attacker.currentHp <= 0) attacker.isAlive = false;
          battleLog.push({ type: 'recoil', message: `${attacker.name} was hurt by recoil! (${recoilAmount})`, damage: recoilAmount });
        }
        break;
      }

      case 'flinch': {
        defender.volatile.flinched = true;
        battleLog.push({ type: 'flinch', message: `${defender.name} flinched!` });
        break;
      }
    }
  }
}

// ─── Main Battle Engine Class ──────────────────────────────────────────────
class BattleEngine {
  constructor(config = {}) {
    this.battleId = uuidv4();
    this.type = config.type || 'pve';   // 'pve' | 'pvp' | 'boss' | 'raid'
    this.mode = config.mode || 'casual';
    this.status = 'pending';

    this.playerA = null;  // { userId, username, team[], activeIndex, isNPC }
    this.playerB = null;

    this.turn = 0;
    this.phase = 'action';  // 'action' | 'resolution' | 'end'
    this.pendingActions = {};  // { playerA: action, playerB: action }
    this.battleLog = [];
    this.weather = null;
    this.fieldEffects = { playerA: [], playerB: [] };

    this.config = {
      timePerTurnMs: config.timePerTurnMs || 30000,
      maxTurns: config.maxTurns || 100,
      allowItems: config.allowItems !== false,
      allowFlee: config.allowFlee !== false,
      expEnabled: config.expEnabled !== false,
      rewardsEnabled: config.rewardsEnabled !== false,
      ...config,
    };

    this.startTime = null;
    this.turnTimer = null;
    this.onBattleEnd = config.onBattleEnd || null;
  }

  // ─── Setup ───────────────────────────────────────────────────────────────
  setupPlayer(side, userData, teamData, templateMap) {
    const team = teamData.map(pm => createBattleMonster(pm, templateMap[pm.templateId]));
    const player = {
      userId: userData._id?.toString() || userData.userId,
      username: userData.username,
      isNPC: userData.isNPC || false,
      npcId: userData.npcId,
      team,
      activeIndex: 0,
      items: userData.items || {},
      isReady: false,
      isConnected: true,
      turnTimeout: null,
    };
    this[side] = player;
    return player;
  }

  get activeA() { return this.playerA?.team[this.playerA.activeIndex]; }
  get activeB() { return this.playerB?.team[this.playerB.activeIndex]; }

  isTeamDefeated(player) { return player.team.every(m => !m.isAlive); }

  // ─── Start Battle ─────────────────────────────────────────────────────────
  start() {
    this.status = 'active';
    this.startTime = Date.now();
    this.turn = 1;
    this.phase = 'action';

    const initLog = [
      { type: 'battle_start', message: `Battle started! ${this.playerA.username} vs ${this.playerB.username}`, turn: 0 },
      { type: 'send_out', side: 'A', message: `${this.playerA.username} sent out ${this.activeA.name}!`, monster: this.activeA.name },
      { type: 'send_out', side: 'B', message: `${this.playerB.username} sent out ${this.activeB.name}!`, monster: this.activeB.name },
    ];

    this.battleLog.push(...initLog);
    return {
      battleId: this.battleId,
      turn: this.turn,
      playerA: this._getPublicPlayerState('A'),
      playerB: this._getPublicPlayerState('B'),
      log: initLog,
    };
  }

  // ─── Submit Action ────────────────────────────────────────────────────────
  submitAction(side, action) {
    if (this.status !== 'active') return { error: 'Battle is not active' };
    if (this.pendingActions[side]) return { error: 'Already submitted action this turn' };

    // Validate action
    const player = this[side];
    const activeMonster = side === 'A' ? this.activeA : this.activeB;

    if (action.type === 'move') {
      const move = activeMonster.moves.find(m => m.moveId === action.moveId);
      if (!move) return { error: 'Invalid move' };
      if (move.currentUses <= 0) return { error: 'No uses left for this move' };
      if (activeMonster.energy < (move.energyCost || 0)) return { error: 'Not enough energy' };
    }

    if (action.type === 'switch') {
      const target = player.team[action.targetIndex];
      if (!target || !target.isAlive) return { error: 'Cannot switch to fainted monster' };
      if (action.targetIndex === player.activeIndex) return { error: 'That monster is already active' };
    }

    this.pendingActions[side] = { ...action, side, submittedAt: Date.now() };

    // NPC auto-action for PvE
    if (this.type === 'pve' && !this.pendingActions['B']) {
      this.pendingActions['B'] = this._generateNPCAction();
    }

    // Both sides ready — resolve turn
    if (this.pendingActions['A'] && this.pendingActions['B']) {
      return this.resolveTurn();
    }

    return { waiting: true, message: 'Waiting for opponent...' };
  }

  // ─── NPC AI ────────────────────────────────────────────────────────────────
  _generateNPCAction() {
    const npc = this.activeB;
    if (!npc || !npc.isAlive) return { type: 'pass', side: 'B' };

    // Check if needs to switch
    if (npc.currentHp / npc.maxHp < 0.2) {
      const alive = this.playerB.team.filter((m, i) => m.isAlive && i !== this.playerB.activeIndex);
      if (alive.length > 0 && Math.random() < 0.4) {
        const switchTarget = this.playerB.team.findIndex(m => m.isAlive && m !== npc);
        if (switchTarget !== -1) return { type: 'switch', side: 'B', targetIndex: switchTarget };
      }
    }

    // Choose best move
    const usableMoves = npc.moves.filter(m => m.currentUses > 0 && (npc.energy >= (m.energyCost || 0)));
    if (usableMoves.length === 0) return { type: 'pass', side: 'B' };

    // AI: prefer super effective moves
    const playerActive = this.activeA;
    let bestMove = usableMoves[0];
    let bestScore = -1;

    for (const move of usableMoves) {
      let score = move.power || 0;
      const eff = getTypeEffectiveness(move.type, playerActive.types.primary, playerActive.types.secondary);
      score *= eff;
      const stab = getSTAB(move.type, npc.types.primary, npc.types.secondary);
      score *= stab;
      if (score > bestScore) { bestScore = score; bestMove = move; }
    }

    return { type: 'move', side: 'B', moveId: bestMove.moveId };
  }

  // ─── Resolve Turn ──────────────────────────────────────────────────────────
  resolveTurn() {
    this.phase = 'resolution';
    const turnLog = [];
    const actionA = this.pendingActions['A'];
    const actionB = this.pendingActions['B'];

    // Determine turn order
    const [first, second, firstSide, secondSide] = this._determineTurnOrder(actionA, actionB);

    // Energy regeneration (each monster gains 1 energy per turn)
    this.activeA.energy = Math.min(this.activeA.maxEnergy, this.activeA.energy + 1);
    this.activeB.energy = Math.min(this.activeB.maxEnergy, this.activeB.energy + 1);

    // Process first action
    const firstResult = this._processAction(firstSide, first, turnLog);

    // Check if battle ended after first action
    if (this.isTeamDefeated(this.playerA) || this.isTeamDefeated(this.playerB)) {
      return this._endBattle(turnLog);
    }

    // Process second action (if still alive)
    const secondActive = secondSide === 'A' ? this.activeA : this.activeB;
    if (secondActive.isAlive && !this.isTeamDefeated(this[secondSide === 'A' ? 'playerA' : 'playerB'])) {
      this._processAction(secondSide, second, turnLog);
    }

    // End-of-turn status processing
    this._processEndOfTurn(turnLog);

    // Check battle end
    if (this.isTeamDefeated(this.playerA) || this.isTeamDefeated(this.playerB)) {
      return this._endBattle(turnLog);
    }

    // Clear volatile flags
    this.activeA.volatile.flinched = false;
    this.activeA.volatile.protectActive = false;
    this.activeB.volatile.flinched = false;
    this.activeB.volatile.protectActive = false;

    // Advance turn
    this.pendingActions = {};
    this.turn++;
    this.phase = 'action';

    if (this.turn > this.config.maxTurns) {
      return this._endBattle(turnLog, 'timeout');
    }

    const snapshot = this._getStateSnapshot(turnLog);
    this.battleLog.push(...turnLog);
    return snapshot;
  }

  // ─── Turn Order ────────────────────────────────────────────────────────────
  _determineTurnOrder(actionA, actionB) {
    // Switches always go first
    const aIsSwitch = actionA.type === 'switch' || actionA.type === 'item';
    const bIsSwitch = actionB.type === 'switch' || actionB.type === 'item';
    if (aIsSwitch && !bIsSwitch) return [actionA, actionB, 'A', 'B'];
    if (bIsSwitch && !aIsSwitch) return [actionB, actionA, 'B', 'A'];

    // Priority move check
    const moveA = actionA.type === 'move' ? this.activeA.moves.find(m => m.moveId === actionA.moveId) : null;
    const moveB = actionB.type === 'move' ? this.activeB.moves.find(m => m.moveId === actionB.moveId) : null;
    const priorityA = moveA?.priority || 0;
    const priorityB = moveB?.priority || 0;

    if (priorityA > priorityB) return [actionA, actionB, 'A', 'B'];
    if (priorityB > priorityA) return [actionB, actionA, 'B', 'A'];

    // Speed comparison
    const speedA = this.activeA.calculatedStats.speed * stageMultiplier(this.activeA.statStages.speed)
      * StatusEffectManager.getSpeedModifier(this.activeA);
    const speedB = this.activeB.calculatedStats.speed * stageMultiplier(this.activeB.statStages.speed)
      * StatusEffectManager.getSpeedModifier(this.activeB);

    if (speedA > speedB) return [actionA, actionB, 'A', 'B'];
    if (speedB > speedA) return [actionB, actionA, 'B', 'A'];

    // Speed tie — coin flip
    return Math.random() < 0.5 ? [actionA, actionB, 'A', 'B'] : [actionB, actionA, 'B', 'A'];
  }

  // ─── Process Single Action ─────────────────────────────────────────────────
  _processAction(side, action, log) {
    const attacker = side === 'A' ? this.activeA : this.activeB;
    const defender = side === 'A' ? this.activeB : this.activeA;
    const defenderPlayer = side === 'A' ? this.playerB : this.playerA;

    if (!attacker || !attacker.isAlive) return;

    // Status start-of-turn check (freeze/sleep/paralysis)
    const statusResult = StatusEffectManager.processStartOfTurn(attacker);
    if (statusResult.message) log.push({ type: 'status_tick', message: statusResult.message, side });
    if (statusResult.damage > 0) {
      attacker.currentHp = Math.max(0, attacker.currentHp - statusResult.damage);
      if (attacker.currentHp <= 0) { attacker.isAlive = false; attacker.currentHp = 0; }
      log.push({ type: 'damage', target: side, damage: statusResult.damage, source: 'status', hpAfter: attacker.currentHp });
    }
    if (statusResult.hitSelf && statusResult.selfDamage > 0) {
      attacker.currentHp = Math.max(0, attacker.currentHp - statusResult.selfDamage);
      if (attacker.currentHp <= 0) { attacker.isAlive = false; attacker.currentHp = 0; }
    }

    if (!statusResult.canAct || !attacker.isAlive) return;
    if (attacker.volatile.flinched) {
      log.push({ type: 'flinch', message: `${attacker.name} flinched and couldn't move!`, side });
      return;
    }

    switch (action.type) {
      case 'move': return this._executeMove(side, attacker, defender, defenderPlayer, action, log);
      case 'switch': return this._executeSwitch(side, action, log);
      case 'item': return this._executeItem(side, action, log);
      case 'capture': return this._executeCapture(side, action, log);
      case 'flee': return this._executeFlee(side, log);
      case 'pass': log.push({ type: 'pass', message: `${attacker.name} waits...`, side }); break;
    }
  }

  // ─── Execute Move ─────────────────────────────────────────────────────────
  _executeMove(side, attacker, defender, defenderPlayer, action, log) {
    const move = attacker.moves.find(m => m.moveId === action.moveId);
    if (!move || move.currentUses <= 0) {
      log.push({ type: 'info', message: `${attacker.name} has no uses left!`, side }); return;
    }

    // Deduct energy and uses
    attacker.energy = Math.max(0, attacker.energy - (move.energyCost || 0));
    move.currentUses -= 1;
    attacker.volatile.lastMoveUsed = move.moveId;

    log.push({ type: 'move_used', message: `${attacker.name} used ${move.name}!`, side, moveId: move.moveId, moveName: move.name });

    // Status moves
    if (move.category === 'status') {
      processMoveEffects(move, attacker, defender, log);
      return;
    }

    // Accuracy check
    const hits = checkAccuracy(attacker, defender, move);
    if (!hits) {
      log.push({ type: 'miss', message: `${attacker.name}'s attack missed!`, side });
      return;
    }

    // Multi-hit moves
    const hitCount = move.effects?.find(e => e.type === 'multi_hit')
      ? (2 + Math.floor(Math.random() * 3))  // 2–4 hits
      : 1;

    let totalDamage = 0;
    for (let h = 0; h < hitCount; h++) {
      if (!defender.isAlive) break;

      const isCrit = rollCritical(attacker, move);
      const { damage, isCritical, effectiveness, effectText, stab } = calculateDamage(attacker, defender, move, { isCritical: isCrit });

      attacker._lastDamageDealt = damage;
      defender.currentHp = Math.max(0, defender.currentHp - damage);
      totalDamage += damage;

      if (defender.currentHp <= 0) { defender.isAlive = false; defender.currentHp = 0; }

      const hitLog = {
        type: 'damage',
        side: side === 'A' ? 'B' : 'A',
        damage,
        isCritical,
        effectiveness,
        effectText,
        stab,
        hpAfter: defender.currentHp,
        maxHp: defender.maxHp,
        hitNumber: h + 1,
        hitCount,
      };

      if (effectText === 'super_effective') hitLog.message = "It's super effective!";
      else if (effectText === 'not_very_effective') hitLog.message = "It's not very effective...";
      else if (effectText === 'immune') hitLog.message = `${defender.name} is immune!`;
      if (isCritical) hitLog.critMessage = 'A critical hit!';

      log.push(hitLog);
    }

    if (hitCount > 1) log.push({ type: 'multi_hit_end', message: `Hit ${hitCount} times for ${totalDamage} total damage!` });

    // Process move secondary effects
    if (defender.isAlive) {
      processMoveEffects(move, attacker, defender, log);
    }

    // KO log
    if (!defender.isAlive) {
      log.push({ type: 'faint', message: `${defender.name} fainted!`, side: side === 'A' ? 'B' : 'A', monsterId: defender.instanceId });

      // Auto-switch for NPC
      if (this.type === 'pve' && side === 'A') {
        this._autoSwitch(defenderPlayer, side === 'A' ? 'B' : 'A', log);
      }
    }
  }

  // ─── Execute Switch ────────────────────────────────────────────────────────
  _executeSwitch(side, action, log) {
    const player = side === 'A' ? this.playerA : this.playerB;
    const outgoing = side === 'A' ? this.activeA : this.activeB;
    const incoming = player.team[action.targetIndex];

    if (!incoming || !incoming.isAlive) return;

    // Reset volatile on switch out
    if (outgoing) {
      outgoing.volatile = { flinched: false, recharging: false, charging: false, boundTurns: 0, confused: false, tauntTurns: 0, encoreTurns: 0, lastMoveUsed: null, protectActive: false };
      outgoing.statStages = { attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0, accuracy: 0, evasion: 0 };
    }

    player.activeIndex = action.targetIndex;
    log.push({
      type: 'switch',
      side,
      message: `${player.username} switched to ${incoming.name}!`,
      outgoing: outgoing?.name,
      incoming: incoming.name,
    });
  }

  // ─── Execute Item ──────────────────────────────────────────────────────────
  _executeItem(side, action, log) {
    const player = side === 'A' ? this.playerA : this.playerB;
    const target = action.targetIndex !== undefined ? player.team[action.targetIndex] : (side === 'A' ? this.activeA : this.activeB);
    const item = action.item;
    if (!item) return;

    log.push({ type: 'item', side, message: `${player.username} used ${item.name}!`, itemId: item.itemId });

    switch (item.category) {
      case 'consumable': {
        for (const effect of (item.effects || [])) {
          if (effect.effectType === 'heal_hp') {
            const heal = Math.min(effect.value, target.maxHp - target.currentHp);
            target.currentHp += heal;
            if (!target.isAlive && target.currentHp > 0) target.isAlive = true;
            log.push({ type: 'heal', message: `${target.name} recovered ${heal} HP!`, amount: heal });
          }
          if (effect.effectType === 'heal_percent') {
            const heal = Math.floor(target.maxHp * (effect.value / 100));
            target.currentHp = Math.min(target.maxHp, target.currentHp + heal);
            log.push({ type: 'heal', message: `${target.name} recovered ${heal} HP!`, amount: heal });
          }
          if (effect.effectType === 'revive') {
            if (!target.isAlive) {
              target.isAlive = true;
              target.currentHp = Math.floor(target.maxHp * (effect.value / 100));
              log.push({ type: 'revive', message: `${target.name} was revived!` });
            }
          }
          if (effect.effectType === 'cure_status') {
            StatusEffectManager.cure(target);
            log.push({ type: 'cure', message: `${target.name}'s status was cured!` });
          }
          if (effect.effectType === 'full_restore') {
            target.currentHp = target.maxHp;
            target.isAlive = true;
            StatusEffectManager.cure(target);
            log.push({ type: 'restore', message: `${target.name} was fully restored!` });
          }
        }
        break;
      }
    }
  }

  // ─── Execute Capture ───────────────────────────────────────────────────────
  _executeCapture(side, action, log) {
    if (this.type !== 'pve') {
      log.push({ type: 'error', message: 'Cannot capture in PvP battles!' }); return;
    }

    const wildMonster = side === 'A' ? this.activeB : this.activeA;
    const captureItem = action.item;

    log.push({ type: 'capture_attempt', message: `${action.username || 'Player'} threw a ${captureItem?.name || 'Capture Ball'}!` });

    const result = calculateCaptureChance(wildMonster, captureItem);

    // Shake animations
    for (let i = 0; i < result.shakeCount; i++) {
      log.push({ type: 'capture_shake', shake: i + 1 });
    }

    if (result.captured) {
      log.push({ type: 'captured', message: `${wildMonster.name} was captured!`, monsterId: wildMonster.instanceId, shakes: 4 });
      this._endBattle(log, 'captured');
    } else {
      log.push({ type: 'capture_fail', message: `${wildMonster.name} broke free!`, shakes: result.shakeCount });
    }

    return result;
  }

  // ─── Execute Flee ──────────────────────────────────────────────────────────
  _executeFlee(side, log) {
    if (!this.config.allowFlee) {
      log.push({ type: 'error', message: 'You cannot flee from this battle!' }); return;
    }
    const player = side === 'A' ? this.playerA : this.playerB;
    log.push({ type: 'flee', message: `${player.username} fled from battle!`, side });
    this._endBattle(log, 'fled');
  }

  // ─── End of Turn ───────────────────────────────────────────────────────────
  _processEndOfTurn(log) {
    // Weather damage (if applicable)
    // Field effects
    // Bound damage
    for (const [monster, side] of [[this.activeA, 'A'], [this.activeB, 'B']]) {
      if (!monster || !monster.isAlive) continue;
      if (monster.volatile.boundTurns > 0) {
        const boundDmg = Math.floor(monster.maxHp / 8);
        monster.currentHp = Math.max(0, monster.currentHp - boundDmg);
        monster.volatile.boundTurns -= 1;
        if (monster.currentHp <= 0) { monster.isAlive = false; monster.currentHp = 0; }
        log.push({ type: 'bound_damage', side, damage: boundDmg, hpAfter: monster.currentHp });
      }
    }
  }

  // ─── Auto Switch (NPC) ─────────────────────────────────────────────────────
  _autoSwitch(player, side, log) {
    const nextIndex = player.team.findIndex((m, i) => m.isAlive && i !== player.activeIndex);
    if (nextIndex === -1) return;
    player.activeIndex = nextIndex;
    const next = player.team[nextIndex];
    log.push({ type: 'send_out', side, message: `${player.username} sent out ${next.name}!`, monster: next.name });
  }

  // ─── End Battle ────────────────────────────────────────────────────────────
  _endBattle(log, reason = 'normal') {
    this.status = 'completed';
    this.phase = 'end';

    let winner = null;
    let winnerSide = null;

    if (reason === 'fled') {
      winnerSide = 'B';
      winner = this.playerB;
    } else if (reason === 'captured') {
      winnerSide = 'A';
      winner = this.playerA;
    } else if (reason === 'timeout') {
      // Compare remaining HP percent
      const hpA = this.playerA.team.reduce((s, m) => s + m.currentHp, 0);
      const hpB = this.playerB.team.reduce((s, m) => s + m.currentHp, 0);
      if (hpA > hpB) { winnerSide = 'A'; winner = this.playerA; }
      else if (hpB > hpA) { winnerSide = 'B'; winner = this.playerB; }
      else winnerSide = 'draw';
    } else {
      const aDefeated = this.isTeamDefeated(this.playerA);
      const bDefeated = this.isTeamDefeated(this.playerB);
      if (aDefeated && bDefeated) { winnerSide = 'draw'; }
      else if (aDefeated) { winnerSide = 'B'; winner = this.playerB; }
      else { winnerSide = 'A'; winner = this.playerA; }
    }

    const rewards = this._calculateRewards(winnerSide);
    const endLog = {
      type: 'battle_end',
      winnerSide,
      winner: winner?.username || null,
      reason,
      rewards,
      durationMs: Date.now() - this.startTime,
      totalTurns: this.turn,
    };

    if (winnerSide !== 'draw') {
      endLog.message = `${winner.username} wins!`;
    } else {
      endLog.message = "It's a draw!";
    }

    log.push(endLog);
    this.battleLog.push(...log);

    if (this.onBattleEnd) this.onBattleEnd(this._buildBattleResult(winnerSide, rewards, reason));

    return {
      battleId: this.battleId,
      status: 'completed',
      winnerSide,
      winner: winner?.username,
      reason,
      rewards,
      log,
      playerA: this._getPublicPlayerState('A'),
      playerB: this._getPublicPlayerState('B'),
    };
  }

  // ─── Rewards ───────────────────────────────────────────────────────────────
  _calculateRewards(winnerSide) {
    const baseCoins = this.type === 'pvp' ? 200 : 100;
    const baseExp = this.type === 'pvp' ? 150 : 80;
    const winnerRewards = { experience: baseExp, coins: baseCoins, gems: 0, tokens: this.type === 'pvp' ? 10 : 0 };
    const loserRewards = { experience: Math.floor(baseExp * 0.3), coins: Math.floor(baseCoins * 0.2), gems: 0, tokens: 0 };
    return winnerSide === 'A' ? { playerA: winnerRewards, playerB: loserRewards }
      : winnerSide === 'B' ? { playerA: loserRewards, playerB: winnerRewards }
      : { playerA: loserRewards, playerB: loserRewards };
  }

  _buildBattleResult(winnerSide, rewards, reason) {
    return {
      battleId: this.battleId,
      type: this.type,
      mode: this.mode,
      winnerSide,
      winnerUserId: winnerSide === 'A' ? this.playerA.userId : winnerSide === 'B' ? this.playerB.userId : null,
      playerA: { userId: this.playerA.userId, username: this.playerA.username, team: this.playerA.team },
      playerB: { userId: this.playerB.userId, username: this.playerB.username, team: this.playerB.team },
      rewards,
      reason,
      totalTurns: this.turn,
      durationMs: Date.now() - this.startTime,
      log: this.battleLog,
    };
  }

  // ─── State Helpers ─────────────────────────────────────────────────────────
  _getPublicPlayerState(side) {
    const player = this[`player${side}`];
    if (!player) return null;
    return {
      userId: player.userId,
      username: player.username,
      activeIndex: player.activeIndex,
      activeMonster: this[`active${side}`] ? this._getPublicMonsterState(this[`active${side}`]) : null,
      teamStatus: player.team.map(m => ({ name: m.name, currentHp: m.currentHp, maxHp: m.maxHp, isAlive: m.isAlive, statusEffect: m.statusEffect.type })),
    };
  }

  _getPublicMonsterState(monster) {
    return {
      instanceId: monster.instanceId,
      name: monster.name,
      level: monster.level,
      types: monster.types,
      currentHp: monster.currentHp,
      maxHp: monster.maxHp,
      hpPercent: Math.round((monster.currentHp / monster.maxHp) * 100),
      isAlive: monster.isAlive,
      statusEffect: monster.statusEffect,
      statStages: monster.statStages,
      energy: monster.energy,
      maxEnergy: monster.maxEnergy,
      moves: monster.moves.map(m => ({ moveId: m.moveId, name: m.name, currentUses: m.currentUses, maxUses: m.maxUses, energyCost: m.energyCost, type: m.type, category: m.category })),
      isShiny: monster.isShiny,
    };
  }

  _getStateSnapshot(log) {
    return {
      battleId: this.battleId,
      turn: this.turn,
      status: this.status,
      playerA: this._getPublicPlayerState('A'),
      playerB: this._getPublicPlayerState('B'),
      log,
    };
  }

  getBattleState() { return this._getStateSnapshot([]); }
  getFullLog() { return this.battleLog; }
}

module.exports = { BattleEngine, createBattleMonster, calculateDamage, calculateCaptureChance, rollCritical, checkAccuracy };
