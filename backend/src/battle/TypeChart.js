/**
 * Type Effectiveness Chart
 * Values: 2 = super effective, 0.5 = not very effective, 0 = immune, 1 = normal
 * [ATTACKING TYPE][DEFENDING TYPE]
 */
const TYPE_CHART = {
  Fire: {
    Fire: 0.5, Water: 0.5, Grass: 2, Electric: 1, Ice: 2, Dragon: 0.5,
    Dark: 1, Light: 1, Ghost: 1, Rock: 0.5, Steel: 2, Wind: 1, Poison: 1, Psychic: 1, Normal: 1,
  },
  Water: {
    Fire: 2, Water: 0.5, Grass: 0.5, Electric: 1, Ice: 1, Dragon: 0.5,
    Dark: 1, Light: 1, Ghost: 1, Rock: 2, Steel: 1, Wind: 1, Poison: 1, Psychic: 1, Normal: 1,
  },
  Grass: {
    Fire: 0.5, Water: 2, Grass: 0.5, Electric: 1, Ice: 1, Dragon: 0.5,
    Dark: 1, Light: 1, Ghost: 1, Rock: 2, Steel: 0.5, Wind: 1, Poison: 0.5, Psychic: 1, Normal: 1,
  },
  Electric: {
    Fire: 1, Water: 2, Grass: 0.5, Electric: 0.5, Ice: 1, Dragon: 0.5,
    Dark: 1, Light: 1, Ghost: 1, Rock: 1, Steel: 1, Wind: 2, Poison: 1, Psychic: 1, Normal: 1,
  },
  Ice: {
    Fire: 0.5, Water: 0.5, Grass: 2, Electric: 1, Ice: 0.5, Dragon: 2,
    Dark: 1, Light: 1, Ghost: 1, Rock: 1, Steel: 0.5, Wind: 2, Poison: 1, Psychic: 1, Normal: 1,
  },
  Dragon: {
    Fire: 1, Water: 1, Grass: 1, Electric: 1, Ice: 1, Dragon: 2,
    Dark: 1, Light: 0.5, Ghost: 1, Rock: 1, Steel: 0.5, Wind: 1, Poison: 1, Psychic: 1, Normal: 1,
  },
  Dark: {
    Fire: 1, Water: 1, Grass: 1, Electric: 1, Ice: 1, Dragon: 1,
    Dark: 0.5, Light: 0.5, Ghost: 2, Rock: 1, Steel: 1, Wind: 1, Poison: 1, Psychic: 2, Normal: 1,
  },
  Light: {
    Fire: 1, Water: 1, Grass: 1, Electric: 1, Ice: 1, Dragon: 1,
    Dark: 2, Light: 0.5, Ghost: 1, Rock: 1, Steel: 1, Wind: 1, Poison: 1, Psychic: 0.5, Normal: 1,
  },
  Ghost: {
    Fire: 1, Water: 1, Grass: 1, Electric: 1, Ice: 1, Dragon: 1,
    Dark: 0.5, Light: 1, Ghost: 2, Rock: 1, Steel: 1, Wind: 1, Poison: 1, Psychic: 2, Normal: 0,
  },
  Rock: {
    Fire: 2, Water: 1, Grass: 1, Electric: 1, Ice: 2, Dragon: 1,
    Dark: 1, Light: 1, Ghost: 1, Rock: 1, Steel: 0.5, Wind: 2, Poison: 1, Psychic: 1, Normal: 1,
  },
  Steel: {
    Fire: 0.5, Water: 1, Grass: 1, Electric: 1, Ice: 2, Dragon: 1,
    Dark: 1, Light: 1, Ghost: 1, Rock: 2, Steel: 0.5, Wind: 1, Poison: 1, Psychic: 1, Normal: 1,
  },
  Wind: {
    Fire: 1, Water: 1, Grass: 1, Electric: 0.5, Ice: 1, Dragon: 1,
    Dark: 1, Light: 1, Ghost: 1, Rock: 0.5, Steel: 1, Wind: 0.5, Poison: 1, Psychic: 1, Normal: 1,
  },
  Poison: {
    Fire: 1, Water: 1, Grass: 2, Electric: 1, Ice: 1, Dragon: 1,
    Dark: 1, Light: 1, Ghost: 0.5, Rock: 0.5, Steel: 0, Wind: 1, Poison: 0.5, Psychic: 1, Normal: 1,
  },
  Psychic: {
    Fire: 1, Water: 1, Grass: 1, Electric: 1, Ice: 1, Dragon: 1,
    Dark: 0, Light: 1, Ghost: 1, Rock: 1, Steel: 0.5, Wind: 1, Poison: 2, Psychic: 0.5, Normal: 1,
  },
  Normal: {
    Fire: 1, Water: 1, Grass: 1, Electric: 1, Ice: 1, Dragon: 1,
    Dark: 1, Light: 1, Ghost: 0, Rock: 0.5, Steel: 0.5, Wind: 1, Poison: 1, Psychic: 1, Normal: 1,
  },
};

/**
 * Calculate total type multiplier for a move vs a defending monster
 * @param {string} attackType - The move's element type
 * @param {string} primaryDefendType - Defender's primary type
 * @param {string|null} secondaryDefendType - Defender's secondary type (optional)
 * @returns {number} Multiplier (0, 0.25, 0.5, 1, 2, 4)
 */
function getTypeEffectiveness(attackType, primaryDefendType, secondaryDefendType = null) {
  const chart = TYPE_CHART[attackType];
  if (!chart) return 1;

  let multiplier = chart[primaryDefendType] ?? 1;
  if (secondaryDefendType && secondaryDefendType !== primaryDefendType) {
    multiplier *= chart[secondaryDefendType] ?? 1;
  }
  return multiplier;
}

/**
 * Get human-readable effectiveness text
 */
function getEffectivenessText(multiplier) {
  if (multiplier === 0) return 'immune';
  if (multiplier >= 4) return 'super_effective_2x';
  if (multiplier >= 2) return 'super_effective';
  if (multiplier <= 0.25) return 'not_very_effective_2x';
  if (multiplier <= 0.5) return 'not_very_effective';
  return 'normal';
}

/**
 * STAB (Same Type Attack Bonus)
 * If the attacker's type matches the move's type, 1.5x bonus
 */
function getSTAB(moveType, monsterPrimaryType, monsterSecondaryType = null) {
  if (moveType === monsterPrimaryType || moveType === monsterSecondaryType) return 1.5;
  return 1;
}

/**
 * Nature stat multiplier map
 */
const NATURE_MODIFIERS = {
  hardy:   { attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 },
  lonely:  { attack: 1.1, defense: 0.9, specialAttack: 1, specialDefense: 1, speed: 1 },
  brave:   { attack: 1.1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 0.9 },
  adamant: { attack: 1.1, defense: 1, specialAttack: 0.9, specialDefense: 1, speed: 1 },
  naughty: { attack: 1.1, defense: 1, specialAttack: 1, specialDefense: 0.9, speed: 1 },
  bold:    { attack: 0.9, defense: 1.1, specialAttack: 1, specialDefense: 1, speed: 1 },
  docile:  { attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 },
  relaxed: { attack: 1, defense: 1.1, specialAttack: 1, specialDefense: 1, speed: 0.9 },
  impish:  { attack: 1, defense: 1.1, specialAttack: 0.9, specialDefense: 1, speed: 1 },
  lax:     { attack: 1, defense: 1.1, specialAttack: 1, specialDefense: 0.9, speed: 1 },
  timid:   { attack: 0.9, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1.1 },
  hasty:   { attack: 1, defense: 0.9, specialAttack: 1, specialDefense: 1, speed: 1.1 },
  serious: { attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 },
  jolly:   { attack: 1, defense: 1, specialAttack: 0.9, specialDefense: 1, speed: 1.1 },
  naive:   { attack: 1, defense: 1, specialAttack: 1, specialDefense: 0.9, speed: 1.1 },
  modest:  { attack: 0.9, defense: 1, specialAttack: 1.1, specialDefense: 1, speed: 1 },
  mild:    { attack: 1, defense: 0.9, specialAttack: 1.1, specialDefense: 1, speed: 1 },
  quiet:   { attack: 1, defense: 1, specialAttack: 1.1, specialDefense: 1, speed: 0.9 },
  bashful: { attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 },
  rash:    { attack: 1, defense: 1, specialAttack: 1.1, specialDefense: 0.9, speed: 1 },
  calm:    { attack: 0.9, defense: 1, specialAttack: 1, specialDefense: 1.1, speed: 1 },
  gentle:  { attack: 1, defense: 0.9, specialAttack: 1, specialDefense: 1.1, speed: 1 },
  sassy:   { attack: 1, defense: 1, specialAttack: 1, specialDefense: 1.1, speed: 0.9 },
  careful: { attack: 1, defense: 1, specialAttack: 0.9, specialDefense: 1.1, speed: 1 },
  quirky:  { attack: 1, defense: 1, specialAttack: 1, specialDefense: 1, speed: 1 },
};

module.exports = { TYPE_CHART, getTypeEffectiveness, getEffectivenessText, getSTAB, NATURE_MODIFIERS };
