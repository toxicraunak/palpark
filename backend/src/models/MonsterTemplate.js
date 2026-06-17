const mongoose = require('mongoose');

const ELEMENT_TYPES = [
  'Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Dragon',
  'Dark', 'Light', 'Ghost', 'Rock', 'Steel', 'Wind', 'Poison', 'Psychic', 'Normal'
];

const moveSchema = new mongoose.Schema({
  moveId: { type: String, required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ELEMENT_TYPES, required: true },
  category: { type: String, enum: ['physical', 'special', 'status'], required: true },
  power: { type: Number, default: 0 },
  accuracy: { type: Number, default: 100, min: 0, max: 100 },
  energyCost: { type: Number, default: 1, min: 0, max: 5 },
  maxUses: { type: Number, default: 10 },
  priority: { type: Number, default: 0 },
  description: String,
  effects: [{
    type: { type: String, enum: ['burn', 'poison', 'freeze', 'sleep', 'paralysis', 'confusion',
      'blind', 'bleed', 'stat_change', 'heal', 'drain', 'recoil', 'multi_hit', 'flinch'] },
    chance: { type: Number, default: 100 },
    target: { type: String, enum: ['self', 'opponent'], default: 'opponent' },
    stat: String,
    stages: Number,
    value: Number,
  }],
  animation: String,
  soundEffect: String,
  learnedAtLevel: { type: Number, default: 1 },
}, { _id: false });

const evolutionSchema = new mongoose.Schema({
  targetId: { type: Number, required: true },
  targetName: String,
  method: {
    type: { type: String, enum: ['level', 'item', 'trade', 'happiness', 'time', 'location'] },
    level: Number,
    item: String,
    happiness: Number,
    time: { type: String, enum: ['day', 'night'] },
    location: String,
  },
  description: String,
}, { _id: false });

const baseStatsSchema = new mongoose.Schema({
  hp: { type: Number, required: true, min: 1, max: 255 },
  attack: { type: Number, required: true, min: 1, max: 255 },
  defense: { type: Number, required: true, min: 1, max: 255 },
  specialAttack: { type: Number, required: true, min: 1, max: 255 },
  specialDefense: { type: Number, required: true, min: 1, max: 255 },
  speed: { type: Number, required: true, min: 1, max: 255 },
}, { _id: false });

const monsterTemplateSchema = new mongoose.Schema({
  monsterId: { type: Number, required: true, unique: true, min: 1, max: 9999 },
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, required: true },
  lore: String,

  types: {
    primary: { type: String, enum: ELEMENT_TYPES, required: true },
    secondary: { type: String, enum: ELEMENT_TYPES },
  },

  baseStats: { type: baseStatsSchema, required: true },
  baseStatTotal: { type: Number },

  evolutionStage: { type: Number, default: 1, min: 1, max: 3 },
  evolvesFrom: { type: Number },
  evolvesTo: [evolutionSchema],
  evolutionFamily: [Number],

  moves: [moveSchema],
  learnableMoves: [String],

  abilities: [{
    abilityId: String,
    name: String,
    description: String,
    isHidden: { type: Boolean, default: false },
  }],

  signature: {
    moveName: String,
    moveId: String,
    description: String,
  },

  catchRate: { type: Number, default: 45, min: 3, max: 255 },
  expYield: { type: Number, default: 64, min: 1 },
  expCurve: { type: String, enum: ['fast', 'medium_fast', 'medium_slow', 'slow', 'erratic', 'fluctuating'], default: 'medium_fast' },

  rarity: { type: String, enum: ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'], default: 'common' },
  isLegendary: { type: Boolean, default: false },
  isMythical: { type: Boolean, default: false },
  isStarterMonster: { type: Boolean, default: false },
  isBossMonster: { type: Boolean, default: false },

  habitat: { type: String, enum: ['forest', 'cave', 'ocean', 'mountain', 'volcano', 'tundra', 'swamp', 'desert', 'sky', 'dungeon', 'town', 'legendary_site'], default: 'forest' },
  regions: [String],
  spawnRate: { type: Number, default: 50, min: 0, max: 100 },
  spawnTime: { type: String, enum: ['any', 'day', 'night', 'dawn', 'dusk'], default: 'any' },

  appearance: {
    height: Number,
    weight: Number,
    colorPalette: [String],
    spriteId: String,
    animationId: String,
    shinyColorPalette: [String],
    hasShiny: { type: Boolean, default: true },
  },

  sounds: {
    cry: String,
    attackSound: String,
    hurtSound: String,
  },

  gender: {
    ratio: { male: { type: Number, default: 50 }, female: { type: Number, default: 50 } },
    genderless: { type: Boolean, default: false },
  },

  tags: [String],
  isReleased: { type: Boolean, default: true },
  addedInVersion: { type: String, default: '1.0.0' },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

monsterTemplateSchema.pre('save', function (next) {
  const s = this.baseStats;
  this.baseStatTotal = s.hp + s.attack + s.defense + s.specialAttack + s.specialDefense + s.speed;
  next();
});

monsterTemplateSchema.virtual('tier').get(function () {
  const bst = this.baseStatTotal;
  if (bst >= 600) return 'S';
  if (bst >= 500) return 'A';
  if (bst >= 400) return 'B';
  if (bst >= 300) return 'C';
  return 'D';
});

monsterTemplateSchema.index({ monsterId: 1 });
monsterTemplateSchema.index({ name: 1 });
monsterTemplateSchema.index({ 'types.primary': 1 });
monsterTemplateSchema.index({ rarity: 1 });
monsterTemplateSchema.index({ habitat: 1 });
monsterTemplateSchema.index({ isReleased: 1 });
monsterTemplateSchema.index({ baseStatTotal: -1 });
monsterTemplateSchema.index({ regions: 1 });
monsterTemplateSchema.index({ tags: 1 });

module.exports = mongoose.model('MonsterTemplate', monsterTemplateSchema);
