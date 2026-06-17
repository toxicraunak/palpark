const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  tag: { type: String, required: true, unique: true, trim: true, uppercase: true, minlength: 2, maxlength: 5 },
  description: { type: String, maxlength: 300 },
  emblem: { type: String, default: 'default_emblem' },
  banner: String,
  color: { type: String, default: '#FFD700' },

  leader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  officers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    role: { type: String, enum: ['member', 'officer', 'leader'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    contribution: { type: Number, default: 0 },
    weeklyContribution: { type: Number, default: 0 },
    lastActive: Date,
  }],

  stats: {
    level: { type: Number, default: 1, max: 30 },
    experience: { type: Number, default: 0 },
    totalWins: { type: Number, default: 0 },
    bossesDefeated: { type: Number, default: 0 },
    tournamentsWon: { type: Number, default: 0 },
    totalContribution: { type: Number, default: 0 },
    memberCount: { type: Number, default: 1 },
  },

  config: {
    maxMembers: { type: Number, default: 30 },
    minLevelToJoin: { type: Number, default: 1 },
    minRatingToJoin: { type: Number, default: 0 },
    isPublic: { type: Boolean, default: true },
    requiresApproval: { type: Boolean, default: false },
    language: { type: String, default: 'en' },
    region: String,
  },

  treasury: {
    coins: { type: Number, default: 0 },
    gems: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
  },

  applications: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    message: String,
    appliedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  }],

  raidSchedule: [{
    bossId: String,
    scheduledAt: Date,
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    completed: { type: Boolean, default: false },
    lootDistributed: { type: Boolean, default: false },
  }],

  announcements: [{
    message: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    postedByUsername: String,
    postedAt: { type: Date, default: Date.now },
    pinned: { type: Boolean, default: false },
  }],

  ranking: {
    globalRank: Number,
    regionalRank: Number,
    points: { type: Number, default: 0 },
    lastRankUpdate: Date,
  },

  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

guildSchema.index({ name: 1 });
guildSchema.index({ tag: 1 });
guildSchema.index({ 'ranking.points': -1 });
guildSchema.index({ leader: 1 });
guildSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('Guild', guildSchema);
