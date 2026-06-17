const mongoose = require('mongoose');

const achievementSchema = new mongoose.Schema({
  achievementId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ['battle', 'collection', 'exploration', 'social', 'story', 'tournament', 'special', 'daily'],
    required: true,
  },
  icon: String,
  rarity: { type: String, enum: ['common', 'uncommon', 'rare', 'epic', 'legendary'], default: 'common' },
  isHidden: { type: Boolean, default: false },
  isRepeatable: { type: Boolean, default: false },

  requirements: [{
    type: { type: String },
    value: Number,
    description: String,
  }],

  rewards: {
    experience: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    gems: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    title: String,
    badge: String,
    frame: String,
    items: [{ itemId: String, quantity: Number }],
  },

  points: { type: Number, default: 10 },
  totalUnlocked: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
}, { timestamps: true });

// Player Achievement Progress
const playerAchievementSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  achievementId: String,
  achievementRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' },
  name: String,
  category: String,
  progress: { type: Number, default: 0 },
  target: { type: Number, default: 1 },
  isCompleted: { type: Boolean, default: false },
  completedAt: Date,
  rewardClaimed: { type: Boolean, default: false },
  claimedAt: Date,
  timesCompleted: { type: Number, default: 0 },
}, { timestamps: true });

playerAchievementSchema.index({ userId: 1 });
playerAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });
playerAchievementSchema.index({ userId: 1, isCompleted: 1 });
achievementSchema.index({ achievementId: 1 });
achievementSchema.index({ category: 1 });

const Achievement = mongoose.model('Achievement', achievementSchema);
const PlayerAchievement = mongoose.model('PlayerAchievement', playerAchievementSchema);
module.exports = { Achievement, PlayerAchievement };
