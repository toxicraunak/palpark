const mongoose = require('mongoose');

const ivSchema = new mongoose.Schema({
  hp: { type: Number, default: () => Math.floor(Math.random() * 32), min: 0, max: 31 },
  attack: { type: Number, default: () => Math.floor(Math.random() * 32), min: 0, max: 31 },
  defense: { type: Number, default: () => Math.floor(Math.random() * 32), min: 0, max: 31 },
  specialAttack: { type: Number, default: () => Math.floor(Math.random() * 32), min: 0, max: 31 },
  specialDefense: { type: Number, default: () => Math.floor(Math.random() * 32), min: 0, max: 31 },
  speed: { type: Number, default: () => Math.floor(Math.random() * 32), min: 0, max: 31 },
}, { _id: false });

const evSchema = new mongoose.Schema({
  hp: { type: Number, default: 0, min: 0, max: 252 },
  attack: { type: Number, default: 0, min: 0, max: 252 },
  defense: { type: Number, default: 0, min: 0, max: 252 },
  specialAttack: { type: Number, default: 0, min: 0, max: 252 },
  specialDefense: { type: Number, default: 0, min: 0, max: 252 },
  speed: { type: Number, default: 0, min: 0, max: 252 },
}, { _id: false });

const equippedMoveSchema = new mongoose.Schema({
  moveId: String,
  name: String,
  type: String,
  category: String,
  power: Number,
  accuracy: Number,
  energyCost: Number,
  currentUses: { type: Number, default: 0 },
  maxUses: Number,
  effects: mongoose.Schema.Types.Mixed,
}, { _id: false });

const playerMonsterSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  templateId: { type: Number, required: true },
  templateRef: { type: mongoose.Schema.Types.ObjectId, ref: 'MonsterTemplate' },
  name: { type: String, required: true },
  nickname: { type: String, maxlength: 20 },

  level: { type: Number, default: 1, min: 1, max: 100 },
  experience: { type: Number, default: 0, min: 0 },
  experienceToNextLevel: { type: Number, default: 100 },

  currentHp: { type: Number },
  maxHp: { type: Number },
  isAlive: { type: Boolean, default: true },

  // Calculated stats (updated on level up)
  calculatedStats: {
    hp: { type: Number, default: 45 },
    attack: { type: Number, default: 45 },
    defense: { type: Number, default: 45 },
    specialAttack: { type: Number, default: 45 },
    specialDefense: { type: Number, default: 45 },
    speed: { type: Number, default: 45 },
  },

  ivs: { type: ivSchema, default: () => ({}) },
  evs: { type: evSchema, default: () => ({}) },
  nature: {
    type: String,
    enum: ['hardy', 'lonely', 'brave', 'adamant', 'naughty', 'bold', 'docile',
      'relaxed', 'impish', 'lax', 'timid', 'hasty', 'serious', 'jolly', 'naive',
      'modest', 'mild', 'quiet', 'bashful', 'rash', 'calm', 'gentle', 'sassy', 'careful', 'quirky'],
    default: 'hardy',
  },

  ability: { abilityId: String, name: String },
  equippedMoves: { type: [equippedMoveSchema], default: [] },
  heldItem: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },

  types: {
    primary: { type: String, required: true },
    secondary: String,
  },
  rarity: { type: String, default: 'common' },

  isShiny: { type: Boolean, default: false },
  shinyCapturedAt: Date,
  happiness: { type: Number, default: 70, min: 0, max: 255 },

  catchInfo: {
    caughtAt: { type: Date, default: Date.now },
    caughtInRegion: String,
    caughtWithItem: String,
    caughtAtLevel: Number,
    originalOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },

  battleHistory: {
    totalBattles: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    totalDamageDealt: { type: Number, default: 0 },
    totalDamageTaken: { type: Number, default: 0 },
    knockouts: { type: Number, default: 0 },
  },

  ribbons: [String],
  tags: [String],
  isInTeam: { type: Boolean, default: false },
  isInStorage: { type: Boolean, default: false },
  isFavorite: { type: Boolean, default: false },
  isForTrade: { type: Boolean, default: false },
  tradePrice: Number,

  statusEffect: {
    type: { type: String, enum: ['burn', 'poison', 'freeze', 'sleep', 'paralysis', 'confusion', 'none'], default: 'none' },
    turnsRemaining: { type: Number, default: 0 },
    severity: { type: Number, default: 1 },
  },

  evolutionReady: { type: Boolean, default: false },
  evolvedAt: Date,
  evolvedFrom: Number,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

playerMonsterSchema.virtual('displayName').get(function () {
  return this.nickname || this.name;
});

playerMonsterSchema.virtual('hpPercent').get(function () {
  if (!this.maxHp) return 100;
  return Math.round((this.currentHp / this.maxHp) * 100);
});

playerMonsterSchema.virtual('ivTotal').get(function () {
  const iv = this.ivs;
  return iv.hp + iv.attack + iv.defense + iv.specialAttack + iv.specialDefense + iv.speed;
});

// Calculate a single stat
playerMonsterSchema.methods.calculateStat = function (statName, baseStat) {
  const level = this.level;
  const iv = this.ivs[statName] || 0;
  const ev = this.evs[statName] || 0;
  const natureMultiplier = getNatureMultiplier(this.nature, statName);

  if (statName === 'hp') {
    if (baseStat === 1) return 1; // Shedinja rule
    return Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  return Math.floor((Math.floor(((2 * baseStat + iv + Math.floor(ev / 4)) * level) / 100) + 5) * natureMultiplier);
};

// Update all calculated stats
playerMonsterSchema.methods.recalculateStats = function (baseStats) {
  for (const [stat, base] of Object.entries(baseStats)) {
    const key = stat === 'hp' ? 'hp' :
      stat === 'attack' ? 'attack' :
      stat === 'defense' ? 'defense' :
      stat === 'specialAttack' ? 'specialAttack' :
      stat === 'specialDefense' ? 'specialDefense' : 'speed';
    this.calculatedStats[key] = this.calculateStat(key, base);
  }
  this.maxHp = this.calculatedStats.hp;
  if (!this.currentHp || this.currentHp > this.maxHp) {
    this.currentHp = this.maxHp;
  }
};

function getNatureMultiplier(nature, stat) {
  const natures = {
    lonely: { attack: 1.1, defense: 0.9 },
    brave: { attack: 1.1, speed: 0.9 },
    adamant: { attack: 1.1, specialAttack: 0.9 },
    naughty: { attack: 1.1, specialDefense: 0.9 },
    bold: { defense: 1.1, attack: 0.9 },
    relaxed: { defense: 1.1, speed: 0.9 },
    impish: { defense: 1.1, specialAttack: 0.9 },
    lax: { defense: 1.1, specialDefense: 0.9 },
    timid: { speed: 1.1, attack: 0.9 },
    hasty: { speed: 1.1, defense: 0.9 },
    jolly: { speed: 1.1, specialAttack: 0.9 },
    naive: { speed: 1.1, specialDefense: 0.9 },
    modest: { specialAttack: 1.1, attack: 0.9 },
    mild: { specialAttack: 1.1, defense: 0.9 },
    quiet: { specialAttack: 1.1, speed: 0.9 },
    rash: { specialAttack: 1.1, specialDefense: 0.9 },
    calm: { specialDefense: 1.1, attack: 0.9 },
    gentle: { specialDefense: 1.1, defense: 0.9 },
    sassy: { specialDefense: 1.1, speed: 0.9 },
    careful: { specialDefense: 1.1, specialAttack: 0.9 },
  };
  const mods = natures[nature] || {};
  return mods[stat] || 1.0;
}

playerMonsterSchema.index({ owner: 1 });
playerMonsterSchema.index({ owner: 1, isInTeam: 1 });
playerMonsterSchema.index({ templateId: 1 });
playerMonsterSchema.index({ level: -1 });
playerMonsterSchema.index({ isShiny: 1 });
playerMonsterSchema.index({ rarity: 1 });
playerMonsterSchema.index({ isForTrade: 1 });
playerMonsterSchema.index({ 'types.primary': 1 });

module.exports = mongoose.model('PlayerMonster', playerMonsterSchema);
