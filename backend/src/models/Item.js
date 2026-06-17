const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  itemId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    enum: ['consumable', 'capture_ball', 'evolution_stone', 'held_item', 'key_item', 'battle_item', 'cosmetic', 'currency'],
    required: true,
  },
  subCategory: { type: String, enum: ['potion', 'revive', 'status_cure', 'boost', 'food', 'special', 'battle_pass'] },
  rarity: { type: String, enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'], default: 'common' },
  icon: String,
  sprite: String,
  animation: String,

  effects: [{
    effectType: { type: String, enum: ['heal_hp', 'heal_percent', 'revive', 'cure_status', 'boost_stat', 'catch_bonus', 'evolve', 'exp_boost', 'full_restore'] },
    value: Number,
    target: { type: String, enum: ['self', 'selected', 'team', 'all'] },
    stat: String,
    stages: Number,
    turnsActive: Number,
    statusToCure: [String],
  }],

  catchBonus: { type: Number, default: 1 },
  captureRate: Number,

  price: {
    coins: { type: Number, default: 0 },
    gems: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    honor: { type: Number, default: 0 },
  },

  sellPrice: { type: Number, default: 0 },
  maxStack: { type: Number, default: 99 },
  isConsumable: { type: Boolean, default: true },
  isTradeable: { type: Boolean, default: true },
  isSellable: { type: Boolean, default: true },
  usableInBattle: { type: Boolean, default: true },
  usableOutsideBattle: { type: Boolean, default: true },

  unlockLevel: { type: Number, default: 1 },
  isAvailable: { type: Boolean, default: true },
  availableFrom: Date,
  availableUntil: Date,

  tags: [String],
}, { timestamps: true });

itemSchema.index({ itemId: 1 });
itemSchema.index({ category: 1 });
itemSchema.index({ rarity: 1 });

module.exports = mongoose.model('Item', itemSchema);
