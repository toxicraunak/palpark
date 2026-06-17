const mongoose = require('mongoose');

// ─── Leaderboard ─────────────────────────────────────────────────────────────
const leaderboardEntrySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: String,
  avatar: String,
  guildName: String,
  rank: Number,
  previousRank: Number,
  score: { type: Number, required: true },
  meta: mongoose.Schema.Types.Mixed, // extra data per category
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const leaderboardSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['pvp_rating', 'total_wins', 'monsters_caught', 'tournament_wins',
      'guild_contribution', 'boss_damage', 'level', 'weekly_pvp', 'seasonal'],
    required: true,
  },
  scope: { type: String, enum: ['global', 'regional', 'guild', 'seasonal'], default: 'global' },
  season: Number,
  region: String,
  guildId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild' },
  entries: [leaderboardEntrySchema],
  lastRefreshed: { type: Date, default: Date.now },
  refreshIntervalMs: { type: Number, default: 300000 }, // 5 min
}, { timestamps: true });

leaderboardSchema.index({ category: 1, scope: 1 });
leaderboardSchema.index({ category: 1, season: 1 });
const Leaderboard = mongoose.model('Leaderboard', leaderboardSchema);

// ─── Quest ────────────────────────────────────────────────────────────────────
const questSchema = new mongoose.Schema({
  questId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['daily', 'weekly', 'story', 'side', 'event', 'guild', 'battle_pass'], required: true },
  category: { type: String, enum: ['battle', 'catch', 'explore', 'social', 'collection', 'special'] },
  chapter: Number,
  order: Number,
  isRepeatable: { type: Boolean, default: false },
  cooldownHours: Number,
  prerequisites: [String],

  objectives: [{
    objectiveId: String,
    description: String,
    type: { type: String },
    target: mongoose.Schema.Types.Mixed,
    count: { type: Number, default: 1 },
    isOptional: { type: Boolean, default: false },
  }],

  rewards: {
    experience: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    gems: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    battlePassXp: { type: Number, default: 0 },
    items: [{ itemId: String, quantity: Number }],
    title: String,
    unlockRegion: String,
    unlockQuest: String,
  },

  timeLimit: Number,
  expiresAt: Date,
  isAvailable: { type: Boolean, default: true },
  icon: String,
  banner: String,
}, { timestamps: true });

questSchema.index({ questId: 1 });
questSchema.index({ type: 1 });
questSchema.index({ chapter: 1, order: 1 });

// Player Quest Progress
const playerQuestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  questId: String,
  status: { type: String, enum: ['available', 'active', 'completed', 'failed', 'expired'], default: 'available' },
  progress: [{
    objectiveId: String,
    current: { type: Number, default: 0 },
    target: Number,
    completed: { type: Boolean, default: false },
  }],
  startedAt: Date,
  completedAt: Date,
  rewardClaimed: { type: Boolean, default: false },
  timesCompleted: { type: Number, default: 0 },
  expiresAt: Date,
}, { timestamps: true });

playerQuestSchema.index({ userId: 1 });
playerQuestSchema.index({ userId: 1, questId: 1 });
playerQuestSchema.index({ userId: 1, status: 1 });

const Quest = mongoose.model('Quest', questSchema);
const PlayerQuest = mongoose.model('PlayerQuest', playerQuestSchema);

// ─── Battle Pass ──────────────────────────────────────────────────────────────
const battlePassSchema = new mongoose.Schema({
  season: { type: Number, required: true, unique: true },
  name: String,
  description: String,
  theme: String,
  banner: String,

  levels: [{
    level: Number,
    xpRequired: Number,
    freeReward: { coins: Number, gems: Number, tokens: Number, items: [{ itemId: String, quantity: Number }], title: String },
    premiumReward: { coins: Number, gems: Number, tokens: Number, items: [{ itemId: String, quantity: Number }], title: String, exclusive: Boolean },
  }],

  maxLevel: { type: Number, default: 100 },
  premiumPrice: { gems: { type: Number, default: 800 } },
  premiumPlusPrice: { gems: { type: Number, default: 2000 } },

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  isCurrent: { type: Boolean, default: false },
}, { timestamps: true });

battlePassSchema.index({ season: 1 });
battlePassSchema.index({ isActive: 1 });
const BattlePass = mongoose.model('BattlePass', battlePassSchema);

// ─── Season ───────────────────────────────────────────────────────────────────
const seasonSchema = new mongoose.Schema({
  season: { type: Number, required: true, unique: true },
  name: String,
  description: String,
  theme: String,

  ranks: [{
    name: String,
    minRating: Number,
    maxRating: Number,
    tier: Number,
    rewards: { coins: Number, gems: Number, tokens: Number, title: String, badge: String },
    icon: String,
    color: String,
  }],

  rewards: {
    top1: mongoose.Schema.Types.Mixed,
    top3: mongoose.Schema.Types.Mixed,
    top10: mongoose.Schema.Types.Mixed,
    top100: mongoose.Schema.Types.Mixed,
    participation: mongoose.Schema.Types.Mixed,
  },

  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: false },
  isCurrent: { type: Boolean, default: false },
  totalParticipants: { type: Number, default: 0 },
  rewardsDistributed: { type: Boolean, default: false },
}, { timestamps: true });

seasonSchema.index({ season: 1 });
seasonSchema.index({ isActive: 1 });
const Season = mongoose.model('Season', seasonSchema);

module.exports = { Leaderboard, Quest, PlayerQuest, BattlePass, Season };
