const mongoose = require('mongoose');

const battleTurnSchema = new mongoose.Schema({
  turn: Number,
  actorId: String,
  actorSide: { type: String, enum: ['player', 'opponent'] },
  action: { type: String, enum: ['move', 'item', 'switch', 'capture', 'flee', 'pass'] },
  moveId: String,
  moveName: String,
  targetId: String,
  itemUsed: String,
  switchTo: String,
  damage: { type: Number, default: 0 },
  effectiveness: { type: Number, default: 1 },
  isCritical: { type: Boolean, default: false },
  missed: { type: Boolean, default: false },
  statusEffect: String,
  hpAfter: { type: Number },
  message: String,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const participantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  username: String,
  isNPC: { type: Boolean, default: false },
  npcId: String,
  npcName: String,
  team: [{
    monsterId: mongoose.Schema.Types.ObjectId,
    templateId: Number,
    name: String,
    level: Number,
    finalHp: Number,
    maxHp: Number,
    isAlive: Boolean,
    damageDealt: { type: Number, default: 0 },
    damageTaken: { type: Number, default: 0 },
  }],
  result: { type: String, enum: ['win', 'loss', 'draw', 'fled', 'disconnected'] },
  ratingChange: Number,
  ratingAfter: Number,
  rewardsEarned: {
    experience: Number,
    coins: Number,
    gems: Number,
    items: [String],
  },
}, { _id: false });

const battleSchema = new mongoose.Schema({
  battleId: { type: String, required: true, unique: true },
  type: { type: String, enum: ['pve', 'pvp', 'tournament', 'boss', 'raid', 'story', 'daily'], required: true },
  status: { type: String, enum: ['pending', 'active', 'completed', 'abandoned', 'timeout'], default: 'pending' },
  mode: { type: String, enum: ['casual', 'ranked', 'practice', 'story', 'event'], default: 'casual' },

  participants: { type: [participantSchema], required: true },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  winnerSide: { type: String, enum: ['player', 'opponent', 'draw'] },

  turns: [battleTurnSchema],
  totalTurns: { type: Number, default: 0 },
  totalDamage: { type: Number, default: 0 },

  meta: {
    region: String,
    bossId: String,
    tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament' },
    matchId: String,
    weatherEffect: String,
    fieldEffect: String,
    isRanked: { type: Boolean, default: false },
    spectators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    spectatorCount: { type: Number, default: 0 },
    ratingBefore: Number,
    battleDurationMs: Number,
  },

  startedAt: { type: Date, default: Date.now },
  completedAt: Date,
  abandonedAt: Date,
  timeoutAt: Date,
}, {
  timestamps: true,
});

battleSchema.index({ battleId: 1 });
battleSchema.index({ 'participants.userId': 1 });
battleSchema.index({ status: 1 });
battleSchema.index({ type: 1 });
battleSchema.index({ startedAt: -1 });
battleSchema.index({ 'meta.tournamentId': 1 });
battleSchema.index({ winner: 1 });

module.exports = mongoose.model('Battle', battleSchema);
