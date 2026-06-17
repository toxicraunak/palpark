const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true, trim: true,
    minlength: 3, maxlength: 20,
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
  },
  email: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
  },
  password: { type: String, required: true, minlength: 6, select: false },
  isGuest: { type: Boolean, default: false },
  role: { type: String, enum: ['player', 'moderator', 'admin'], default: 'player' },
  isActive: { type: Boolean, default: true },
  isBanned: { type: Boolean, default: false },
  banReason: String,
  banExpiry: Date,

  profile: {
    avatar: { type: String, default: 'default_avatar' },
    title: { type: String, default: 'Rookie Trainer' },
    bio: { type: String, maxlength: 200 },
    country: String,
    favoriteMonster: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerMonster' },
    frame: { type: String, default: 'basic' },
    badge: String,
  },

  gameData: {
    level: { type: Number, default: 1, min: 1, max: 100 },
    experience: { type: Number, default: 0 },
    prestige: { type: Number, default: 0 },
    coins: { type: Number, default: 500, min: 0 },
    gems: { type: Number, default: 50, min: 0 },
    tokens: { type: Number, default: 0, min: 0 },
    honor: { type: Number, default: 0 },
    currentRegion: { type: String, default: 'starter_town' },
    currentChapter: { type: Number, default: 1 },
    activeTeam: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PlayerMonster' }],
    storyProgress: {
      chapter: { type: Number, default: 1 },
      completedBosses: [String],
      unlockedRegions: { type: [String], default: ['starter_town'] },
      defeatedNPCs: [String],
    },
  },

  stats: {
    totalBattles: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    pvpWins: { type: Number, default: 0 },
    pvpLosses: { type: Number, default: 0 },
    monstersCapured: { type: Number, default: 0 },
    monstersEvolved: { type: Number, default: 0 },
    totalDamageDealt: { type: Number, default: 0 },
    tournamentWins: { type: Number, default: 0 },
    bossesDefeated: { type: Number, default: 0 },
    longestWinStreak: { type: Number, default: 0 },
    currentWinStreak: { type: Number, default: 0 },
    highestRating: { type: Number, default: 1000 },
  },

  ranking: {
    pvpRating: { type: Number, default: 1000 },
    pvpRank: { type: String, default: 'Bronze' },
    pvpTier: { type: Number, default: 1 },
    globalRank: Number,
    regionalRank: Number,
    seasonRating: { type: Number, default: 0 },
  },

  social: {
    guild: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild' },
    guildRole: { type: String, enum: ['member', 'officer', 'leader'], default: 'member' },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{
      from: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sentAt: { type: Date, default: Date.now },
    }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },

  dailyRewards: {
    lastClaimedAt: Date,
    streak: { type: Number, default: 0 },
    nextRewardAt: Date,
  },

  battlePass: {
    currentSeason: { type: Number, default: 1 },
    level: { type: Number, default: 0 },
    experience: { type: Number, default: 0 },
    isPremium: { type: Boolean, default: false },
    claimedRewards: [String],
    purchasedAt: Date,
    expiresAt: Date,
  },

  notifications: [{
    type: { type: String, enum: ['battle', 'friend', 'guild', 'system', 'reward', 'trade'] },
    message: String,
    data: mongoose.Schema.Types.Mixed,
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }],

  settings: {
    soundEnabled: { type: Boolean, default: true },
    musicEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },
    language: { type: String, default: 'en' },
    graphicsQuality: { type: String, enum: ['low', 'medium', 'high', 'ultra'], default: 'high' },
    autoSave: { type: Boolean, default: true },
    showDamageNumbers: { type: Boolean, default: true },
    battleAnimations: { type: Boolean, default: true },
  },

  security: {
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
    emailVerified: { type: Boolean, default: false },
    emailVerifyToken: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    lastLogin: Date,
    lastLoginIP: String,
    loginAttempts: { type: Number, default: 0 },
    lockUntil: Date,
  },

  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ 'ranking.pvpRating': -1 });
userSchema.index({ 'gameData.level': -1 });
userSchema.index({ 'social.guild': 1 });
userSchema.index({ lastActive: -1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'gameData.coins': -1 });

// Virtuals
userSchema.virtual('winRate').get(function () {
  if (this.stats.totalBattles === 0) return 0;
  return Math.round((this.stats.wins / this.stats.totalBattles) * 100);
});

userSchema.virtual('experienceForNextLevel').get(function () {
  return Math.floor(100 * Math.pow(1.15, this.gameData.level - 1));
});

// Pre-save: hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Methods
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.addExperience = async function (amount) {
  this.gameData.experience += amount;
  const expNeeded = Math.floor(100 * Math.pow(1.15, this.gameData.level - 1));
  if (this.gameData.experience >= expNeeded && this.gameData.level < 100) {
    this.gameData.level += 1;
    this.gameData.experience -= expNeeded;
    return { leveledUp: true, newLevel: this.gameData.level };
  }
  return { leveledUp: false };
};

userSchema.methods.addCurrency = function (coins = 0, gems = 0, tokens = 0, honor = 0) {
  this.gameData.coins = Math.max(0, this.gameData.coins + coins);
  this.gameData.gems = Math.max(0, this.gameData.gems + gems);
  this.gameData.tokens = Math.max(0, this.gameData.tokens + tokens);
  this.gameData.honor = Math.max(0, this.gameData.honor + honor);
};

userSchema.methods.spendCurrency = function (coins = 0, gems = 0) {
  if (this.gameData.coins < coins) throw new Error('Insufficient coins');
  if (this.gameData.gems < gems) throw new Error('Insufficient gems');
  this.gameData.coins -= coins;
  this.gameData.gems -= gems;
};

userSchema.methods.isLocked = function () {
  return this.security.lockUntil && this.security.lockUntil > Date.now();
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    username: this.username,
    profile: this.profile,
    gameData: {
      level: this.gameData.level,
      currentRegion: this.gameData.currentRegion,
    },
    stats: this.stats,
    ranking: this.ranking,
    winRate: this.winRate,
  };
};

module.exports = mongoose.model('User', userSchema);
