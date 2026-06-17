const mongoose = require('mongoose');

const bracketMatchSchema = new mongoose.Schema({
  matchId: String,
  round: Number,
  position: Number,
  player1: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, username: String, seed: Number },
  player2: { userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, username: String, seed: Number },
  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  battleId: String,
  status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'bye'], default: 'scheduled' },
  scheduledAt: Date,
  completedAt: Date,
}, { _id: false });

const tournamentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['single_elimination', 'double_elimination', 'round_robin', 'swiss', 'seasonal'], required: true },
  status: { type: String, enum: ['upcoming', 'registration', 'in_progress', 'completed', 'cancelled'], default: 'upcoming' },
  mode: { type: String, enum: ['casual', 'ranked', 'invitational'], default: 'ranked' },
  season: Number,

  config: {
    maxParticipants: { type: Number, default: 16 },
    minParticipants: { type: Number, default: 4 },
    teamSize: { type: Number, default: 3 },
    levelCap: Number,
    allowedTypes: [String],
    bannedMonsters: [Number],
    entryFee: { coins: { type: Number, default: 0 }, gems: { type: Number, default: 0 } },
    rankRequirement: { type: String, default: 'Bronze' },
    isInviteOnly: { type: Boolean, default: false },
    timePerTurn: { type: Number, default: 30 },
  },

  rewards: {
    first: { coins: Number, gems: Number, tokens: Number, title: String, badge: String, frame: String },
    second: { coins: Number, gems: Number, tokens: Number },
    third: { coins: Number, gems: Number, tokens: Number },
    participation: { coins: Number, gems: Number },
  },

  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: String,
    seed: Number,
    registeredAt: { type: Date, default: Date.now },
    checkedIn: { type: Boolean, default: false },
    eliminated: { type: Boolean, default: false },
    finalRank: Number,
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    rewardsIssued: { type: Boolean, default: false },
  }],

  bracket: [bracketMatchSchema],
  currentRound: { type: Number, default: 1 },
  totalRounds: Number,

  winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  runnerUp: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  spectators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  spectatorCount: { type: Number, default: 0 },

  schedule: {
    registrationStart: Date,
    registrationEnd: Date,
    checkInStart: Date,
    checkInEnd: Date,
    startTime: Date,
    estimatedEndTime: Date,
    completedAt: Date,
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isRecurring: { type: Boolean, default: false },
  recurrencePattern: String,
  featuredBanner: String,
  tags: [String],
}, { timestamps: true });

tournamentSchema.index({ status: 1 });
tournamentSchema.index({ 'schedule.startTime': 1 });
tournamentSchema.index({ season: 1 });
tournamentSchema.index({ 'participants.userId': 1 });

module.exports = mongoose.model('Tournament', tournamentSchema);
