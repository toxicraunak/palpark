/**
 * Status Effects Engine
 * Handles: Burn, Poison, Freeze, Sleep, Paralysis, Confusion
 */

const STATUS = {
  NONE: 'none',
  BURN: 'burn',
  POISON: 'poison',
  FREEZE: 'freeze',
  SLEEP: 'sleep',
  PARALYSIS: 'paralysis',
  CONFUSION: 'confusion',
  BLIND: 'blind',
  BLEED: 'bleed',
};

/**
 * Status config: damage%, speed modifier, skip chance, thaw chance per turn
 */
const STATUS_CONFIG = {
  [STATUS.BURN]: {
    label: 'Burn',
    color: '#FF4500',
    icon: '🔥',
    dotPercent: 0.0625,          // 6.25% max HP per turn
    attackModifier: 0.5,          // halves physical attack
    speedModifier: 1,
    skipChance: 0,
    naturalCureChance: 0,
    maxTurns: -1,                 // permanent until cured
    immuneTypes: ['Fire'],
    description: 'Deals damage each turn and halves physical Attack.',
  },
  [STATUS.POISON]: {
    label: 'Poison',
    color: '#9B59B6',
    icon: '☠️',
    dotPercent: 0.125,
    dotScaling: true,            // damage increases each turn
    attackModifier: 1,
    speedModifier: 1,
    skipChance: 0,
    naturalCureChance: 0,
    maxTurns: -1,
    immuneTypes: ['Poison', 'Steel'],
    description: 'Deals escalating damage each turn.',
  },
  [STATUS.FREEZE]: {
    label: 'Freeze',
    color: '#00BFFF',
    icon: '❄️',
    dotPercent: 0,
    attackModifier: 1,
    speedModifier: 0,
    skipChance: 1.0,             // always skip while frozen
    naturalCureChance: 0.20,     // 20% chance to thaw each turn
    maxTurns: 5,
    immuneTypes: ['Ice'],
    description: 'Cannot act. Has a 20% chance to thaw each turn.',
  },
  [STATUS.SLEEP]: {
    label: 'Sleep',
    color: '#8B8B8B',
    icon: '💤',
    dotPercent: 0,
    attackModifier: 1,
    speedModifier: 1,
    skipChance: 1.0,
    naturalCureChance: 0,
    wakeUpMinTurns: 1,
    wakeUpMaxTurns: 3,
    maxTurns: 3,
    immuneTypes: [],
    description: 'Cannot act. Wakes up after 1–3 turns.',
  },
  [STATUS.PARALYSIS]: {
    label: 'Paralysis',
    color: '#FFD700',
    icon: '⚡',
    dotPercent: 0,
    attackModifier: 1,
    speedModifier: 0.25,          // reduces speed by 75%
    skipChance: 0.25,             // 25% chance to be fully paralysed
    naturalCureChance: 0,
    maxTurns: -1,
    immuneTypes: ['Electric'],
    description: 'Reduces Speed by 75%. Has a 25% chance to lose its turn.',
  },
  [STATUS.CONFUSION]: {
    label: 'Confusion',
    color: '#FF69B4',
    icon: '😵',
    dotPercent: 0,
    attackModifier: 1,
    speedModifier: 1,
    skipChance: 0,
    selfHitChance: 0.33,          // 33% chance to hit self for 40 power
    selfHitPower: 40,
    naturalCureChance: 0,
    maxTurns: 4,
    immuneTypes: [],
    description: 'Has a 33% chance to hurt itself each turn.',
  },
  [STATUS.BLIND]: {
    label: 'Blind',
    color: '#333333',
    icon: '🕶️',
    dotPercent: 0,
    attackModifier: 1,
    speedModifier: 1,
    accuracyModifier: 0.6,
    skipChance: 0,
    naturalCureChance: 0,
    maxTurns: 3,
    immuneTypes: [],
    description: 'Accuracy reduced by 40%.',
  },
  [STATUS.BLEED]: {
    label: 'Bleed',
    color: '#CC0000',
    icon: '🩸',
    dotPercent: 0.10,
    attackModifier: 1,
    speedModifier: 1,
    skipChance: 0,
    naturalCureChance: 0,
    maxTurns: 3,
    immuneTypes: ['Ghost'],
    description: 'Deals 10% max HP damage per turn for 3 turns.',
  },
};

class StatusEffectManager {
  /**
   * Try to apply a status effect to a monster
   * @param {Object} monster - battle monster state
   * @param {string} statusType - STATUS constant
   * @param {number} chance - application chance 0–1
   * @returns {{ applied: boolean, message: string }}
   */
  static tryApply(monster, statusType, chance = 1.0) {
    // Already has a primary status
    if (monster.statusEffect && monster.statusEffect.type !== STATUS.NONE && statusType !== STATUS.CONFUSION) {
      return { applied: false, message: `${monster.name} is already affected!` };
    }

    const config = STATUS_CONFIG[statusType];
    if (!config) return { applied: false, message: 'Unknown status.' };

    // Type immunity check
    const monsterTypes = [monster.types?.primary, monster.types?.secondary].filter(Boolean);
    if (config.immuneTypes.some(t => monsterTypes.includes(t))) {
      return { applied: false, message: `${monster.name} is immune to ${config.label}!` };
    }

    // Chance roll
    if (Math.random() > chance) {
      return { applied: false, message: '' };
    }

    // Apply
    let turnsRemaining = config.maxTurns;
    if (statusType === STATUS.SLEEP) {
      turnsRemaining = config.wakeUpMinTurns +
        Math.floor(Math.random() * (config.wakeUpMaxTurns - config.wakeUpMinTurns + 1));
    }

    monster.statusEffect = {
      type: statusType,
      turnsRemaining,
      severity: 1,
      poisonStacks: statusType === STATUS.POISON ? 1 : 0,
      appliedAt: Date.now(),
    };

    return { applied: true, message: `${monster.name} was ${config.label.toLowerCase()}ed!` };
  }

  /**
   * Process status at the START of a monster's turn
   * Returns whether the monster can act this turn
   */
  static processStartOfTurn(monster) {
    const result = {
      canAct: true,
      damage: 0,
      message: '',
      cured: false,
      statusType: STATUS.NONE,
      hitSelf: false,
      selfDamage: 0,
    };

    if (!monster.statusEffect || monster.statusEffect.type === STATUS.NONE) {
      return result;
    }

    const { type, turnsRemaining, poisonStacks = 1 } = monster.statusEffect;
    const config = STATUS_CONFIG[type];
    result.statusType = type;

    switch (type) {
      case STATUS.BURN: {
        result.damage = Math.max(1, Math.floor(monster.maxHp * config.dotPercent));
        result.message = `${monster.name} is hurt by its burn! (${result.damage} dmg)`;
        break;
      }

      case STATUS.POISON: {
        const stacks = poisonStacks || 1;
        result.damage = Math.max(1, Math.floor(monster.maxHp * config.dotPercent * stacks));
        monster.statusEffect.poisonStacks = Math.min(stacks + 1, 8);
        result.message = `${monster.name} is hurt by poison! (${result.damage} dmg)`;
        break;
      }

      case STATUS.FREEZE: {
        result.canAct = false;
        result.message = `${monster.name} is frozen solid!`;
        // Chance to thaw
        if (Math.random() < config.naturalCureChance) {
          monster.statusEffect = { type: STATUS.NONE, turnsRemaining: 0 };
          result.canAct = true;
          result.cured = true;
          result.message = `${monster.name} thawed out!`;
        }
        break;
      }

      case STATUS.SLEEP: {
        result.canAct = false;
        if (turnsRemaining <= 1) {
          monster.statusEffect = { type: STATUS.NONE, turnsRemaining: 0 };
          result.canAct = true;
          result.cured = true;
          result.message = `${monster.name} woke up!`;
        } else {
          monster.statusEffect.turnsRemaining -= 1;
          result.message = `${monster.name} is fast asleep…`;
        }
        break;
      }

      case STATUS.PARALYSIS: {
        if (Math.random() < config.skipChance) {
          result.canAct = false;
          result.message = `${monster.name} is paralyzed and can't move!`;
        } else {
          result.message = `${monster.name} is paralyzed but pushed through!`;
        }
        break;
      }

      case STATUS.CONFUSION: {
        if (Math.random() < config.selfHitChance) {
          // Hit itself — calculate using its own attack stat (physical, no type)
          result.selfDamage = Math.max(1, Math.floor(
            (config.selfHitPower * (monster.calculatedStats.attack / 50)) / 5
          ));
          result.hitSelf = true;
          result.canAct = false;
          result.message = `${monster.name} is confused and hurt itself! (${result.selfDamage} dmg)`;
        } else {
          result.message = `${monster.name} is confused!`;
        }
        if (turnsRemaining <= 1) {
          monster.statusEffect = { type: STATUS.NONE, turnsRemaining: 0 };
          result.cured = true;
          if (!result.hitSelf) result.message += ' It snapped out of confusion!';
        } else {
          monster.statusEffect.turnsRemaining -= 1;
        }
        break;
      }

      case STATUS.BLIND: {
        if (turnsRemaining <= 1) {
          monster.statusEffect = { type: STATUS.NONE, turnsRemaining: 0 };
          result.cured = true;
          result.message = `${monster.name} can see again!`;
        } else {
          monster.statusEffect.turnsRemaining -= 1;
          result.message = `${monster.name} can barely see!`;
        }
        break;
      }

      case STATUS.BLEED: {
        result.damage = Math.max(1, Math.floor(monster.maxHp * config.dotPercent));
        result.message = `${monster.name} is bleeding! (${result.damage} dmg)`;
        if (turnsRemaining <= 1) {
          monster.statusEffect = { type: STATUS.NONE, turnsRemaining: 0 };
          result.cured = true;
        } else {
          monster.statusEffect.turnsRemaining -= 1;
        }
        break;
      }
    }

    return result;
  }

  /**
   * Get speed modifier from active status
   */
  static getSpeedModifier(monster) {
    if (!monster.statusEffect || monster.statusEffect.type === STATUS.NONE) return 1;
    const config = STATUS_CONFIG[monster.statusEffect.type];
    return config ? config.speedModifier : 1;
  }

  /**
   * Get accuracy modifier from active status
   */
  static getAccuracyModifier(monster) {
    if (!monster.statusEffect || monster.statusEffect.type === STATUS.NONE) return 1;
    const config = STATUS_CONFIG[monster.statusEffect.type];
    return config?.accuracyModifier ?? 1;
  }

  /**
   * Get attack modifier from active status
   */
  static getAttackModifier(monster, moveCategory) {
    if (!monster.statusEffect || monster.statusEffect.type === STATUS.NONE) return 1;
    const type = monster.statusEffect.type;
    if (type === STATUS.BURN && moveCategory === 'physical') {
      return STATUS_CONFIG[STATUS.BURN].attackModifier;
    }
    return 1;
  }

  /**
   * Cure a specific or all status effects
   */
  static cure(monster, specificType = null) {
    if (!monster.statusEffect) return false;
    if (specificType && monster.statusEffect.type !== specificType) return false;
    monster.statusEffect = { type: STATUS.NONE, turnsRemaining: 0 };
    return true;
  }

  static getConfig(type) { return STATUS_CONFIG[type] || null; }
  static getAllStatuses() { return Object.keys(STATUS_CONFIG); }
}

module.exports = { STATUS, STATUS_CONFIG, StatusEffectManager };
