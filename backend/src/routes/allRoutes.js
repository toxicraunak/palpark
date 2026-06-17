// ─── routes/tournaments.js ────────────────────────────────────────────────────
const express = require('express');
const tournamentRouter = express.Router();
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const BattleManager = require('../battle/BattleManager');
const { protect } = require('../middleware/auth');
const { cache } = require('../config/redis');

tournamentRouter.get('/', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    else filter.status = { $in: ['upcoming', 'registration', 'in_progress'] };
    const [tournaments, total] = await Promise.all([
      Tournament.find(filter).sort({ 'schedule.startTime': 1 }).skip((page-1)*limit).limit(+limit).lean(),
      Tournament.countDocuments(filter),
    ]);
    res.json({ success: true, data: tournaments, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
});

tournamentRouter.get('/:id', async (req, res, next) => {
  try {
    const t = await Tournament.findById(req.params.id).lean();
    if (!t) return res.status(404).json({ success: false, message: 'Tournament not found.' });
    res.json({ success: true, data: t });
  } catch (err) { next(err); }
});

tournamentRouter.post('/:id/register', protect, async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) return res.status(404).json({ success: false, message: 'Not found.' });
    if (!['upcoming','registration'].includes(tournament.status))
      return res.status(400).json({ success: false, message: 'Registration is closed.' });
    if (tournament.participants.length >= tournament.config.maxParticipants)
      return res.status(400).json({ success: false, message: 'Tournament is full.' });
    const already = tournament.participants.find(p => p.userId?.toString() === req.user._id.toString());
    if (already) return res.status(409).json({ success: false, message: 'Already registered.' });

    const user = await User.findById(req.user._id);
    if (tournament.config.entryFee.coins > 0) user.spendCurrency(tournament.config.entryFee.coins, tournament.config.entryFee.gems);
    tournament.participants.push({ userId: req.user._id, username: req.user.username });
    await Promise.all([tournament.save(), user.save()]);
    res.json({ success: true, message: 'Registered for tournament!' });
  } catch (err) { next(err); }
});

tournamentRouter.post('/:id/checkin', protect, async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    const participant = tournament?.participants.find(p => p.userId?.toString() === req.user._id.toString());
    if (!participant) return res.status(404).json({ success: false, message: 'Not registered.' });
    participant.checkedIn = true;
    await tournament.save();
    res.json({ success: true, message: 'Checked in!' });
  } catch (err) { next(err); }
});

module.exports.tournamentRouter = tournamentRouter;

// ─── routes/guilds.js ─────────────────────────────────────────────────────────
const guildRouter = express.Router();
const Guild = require('../models/Guild');

guildRouter.get('/', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const filter = { 'config.isPublic': true };
    if (search) filter.$text = { $search: search };
    const [guilds, total] = await Promise.all([
      Guild.find(filter).select('name tag description emblem color stats.level stats.memberCount ranking').sort({ 'ranking.points': -1 }).skip((page-1)*limit).limit(+limit).lean(),
      Guild.countDocuments(filter),
    ]);
    res.json({ success: true, data: guilds, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
});

guildRouter.post('/', protect, async (req, res, next) => {
  try {
    const { name, tag, description, color } = req.body;
    if (!name || !tag) return res.status(400).json({ success: false, message: 'Name and tag required.' });
    const user = await User.findById(req.user._id);
    user.spendCurrency(5000, 0);
    const guild = await Guild.create({ name, tag, description, color, leader: req.user._id, members: [{ userId: req.user._id, username: req.user.username, role: 'leader' }], 'stats.memberCount': 1 });
    user.social.guild = guild._id;
    user.social.guildRole = 'leader';
    await user.save();
    res.status(201).json({ success: true, data: guild });
  } catch (err) { next(err); }
});

guildRouter.get('/:id', async (req, res, next) => {
  try {
    const guild = await Guild.findById(req.params.id).lean();
    if (!guild) return res.status(404).json({ success: false, message: 'Guild not found.' });
    res.json({ success: true, data: guild });
  } catch (err) { next(err); }
});

guildRouter.post('/:id/join', protect, async (req, res, next) => {
  try {
    const guild = await Guild.findById(req.params.id);
    if (!guild) return res.status(404).json({ success: false, message: 'Guild not found.' });
    if (guild.members.length >= guild.config.maxMembers) return res.status(400).json({ success: false, message: 'Guild is full.' });
    const user = await User.findById(req.user._id);
    if (user.social.guild) return res.status(400).json({ success: false, message: 'Already in a guild.' });
    guild.members.push({ userId: req.user._id, username: req.user.username });
    guild.stats.memberCount = guild.members.length;
    user.social.guild = guild._id;
    user.social.guildRole = 'member';
    await Promise.all([guild.save(), user.save()]);
    res.json({ success: true, message: `Joined ${guild.name}!` });
  } catch (err) { next(err); }
});

guildRouter.post('/:id/leave', protect, async (req, res, next) => {
  try {
    const guild = await Guild.findById(req.params.id);
    if (!guild) return res.status(404).json({ success: false, message: 'Guild not found.' });
    guild.members = guild.members.filter(m => m.userId?.toString() !== req.user._id.toString());
    guild.stats.memberCount = guild.members.length;
    const user = await User.findById(req.user._id);
    user.social.guild = undefined;
    user.social.guildRole = 'member';
    await Promise.all([guild.save(), user.save()]);
    res.json({ success: true, message: 'Left guild.' });
  } catch (err) { next(err); }
});

module.exports.guildRouter = guildRouter;

// ─── routes/marketplace.js ────────────────────────────────────────────────────
const marketRouter = express.Router();
const Marketplace = require('../models/Marketplace');
const PlayerMonster = require('../models/PlayerMonster');
const { v4: uuidv4 } = require('uuid');

marketRouter.get('/', async (req, res, next) => {
  try {
    const { type = 'monster', rarity, page = 1, limit = 20, sort = 'createdAt', order = 'desc' } = req.query;
    const filter = { status: 'active', listingType: type, expiresAt: { $gt: new Date() } };
    if (rarity) filter['monsterSnapshot.rarity'] = rarity;
    const [listings, total] = await Promise.all([
      Marketplace.find(filter).sort({ [sort]: order === 'desc' ? -1 : 1 }).skip((page-1)*limit).limit(+limit).lean(),
      Marketplace.countDocuments(filter),
    ]);
    res.json({ success: true, data: listings, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
});

marketRouter.post('/list', protect, async (req, res, next) => {
  try {
    const { monsterId, priceType, amount } = req.body;
    const monster = await PlayerMonster.findOne({ _id: monsterId, owner: req.user._id });
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });
    if (monster.isInTeam) return res.status(400).json({ success: false, message: 'Remove from team first.' });

    monster.isForTrade = true;
    monster.tradePrice = amount;
    await monster.save();

    const listing = await Marketplace.create({
      listingId: uuidv4(),
      seller: req.user._id,
      sellerUsername: req.user.username,
      listingType: 'monster',
      monster: monster._id,
      monsterSnapshot: {
        templateId: monster.templateId,
        name: monster.name,
        nickname: monster.nickname,
        level: monster.level,
        isShiny: monster.isShiny,
        rarity: monster.rarity,
        types: monster.types,
        calculatedStats: monster.calculatedStats,
        ivTotal: monster.ivTotal,
      },
      price: { type: priceType || 'coins', amount: amount || 1000 },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    res.status(201).json({ success: true, data: listing });
  } catch (err) { next(err); }
});

marketRouter.post('/:listingId/buy', protect, async (req, res, next) => {
  try {
    const listing = await Marketplace.findOne({ listingId: req.params.listingId, status: 'active' });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found or expired.' });
    if (listing.seller.toString() === req.user._id.toString()) return res.status(400).json({ success: false, message: "Can't buy your own listing." });

    const buyer = await User.findById(req.user._id);
    const seller = await User.findById(listing.seller);

    if (listing.price.type === 'coins') buyer.spendCurrency(listing.price.amount, 0);
    else if (listing.price.type === 'gems') buyer.spendCurrency(0, listing.price.amount);

    const fee = Math.floor(listing.price.amount * 0.05);
    seller.addCurrency(listing.price.amount - fee, 0);

    if (listing.listingType === 'monster') {
      await PlayerMonster.findByIdAndUpdate(listing.monster, { owner: req.user._id, isForTrade: false, tradePrice: null });
    }

    listing.status = 'sold';
    listing.buyer = req.user._id;
    listing.buyerUsername = req.user.username;
    listing.soldAt = new Date();

    await Promise.all([listing.save(), buyer.save(), seller.save()]);
    res.json({ success: true, message: 'Purchase successful!' });
  } catch (err) { next(err); }
});

marketRouter.delete('/:listingId', protect, async (req, res, next) => {
  try {
    const listing = await Marketplace.findOne({ listingId: req.params.listingId, seller: req.user._id, status: 'active' });
    if (!listing) return res.status(404).json({ success: false, message: 'Listing not found.' });
    listing.status = 'cancelled';
    listing.cancelledAt = new Date();
    if (listing.listingType === 'monster') await PlayerMonster.findByIdAndUpdate(listing.monster, { isForTrade: false });
    await listing.save();
    res.json({ success: true, message: 'Listing cancelled.' });
  } catch (err) { next(err); }
});

module.exports.marketRouter = marketRouter;

// ─── routes/inventory.js ──────────────────────────────────────────────────────
const invRouter = express.Router();
const Inventory = require('../models/Inventory');
const Item = require('../models/Item');

invRouter.get('/', protect, async (req, res, next) => {
  try {
    const inventory = await Inventory.findOne({ owner: req.user._id }).lean();
    if (!inventory) return res.json({ success: true, data: { slots: [], totalItems: 0 } });
    res.json({ success: true, data: inventory });
  } catch (err) { next(err); }
});

invRouter.post('/use', protect, async (req, res, next) => {
  try {
    const { itemId, targetMonsterId } = req.body;
    const inventory = await Inventory.findOne({ owner: req.user._id });
    if (!inventory.hasItem(itemId)) return res.status(400).json({ success: false, message: 'Item not found in inventory.' });
    const item = await Item.findOne({ itemId }).lean();
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });
    if (!item.usableOutsideBattle) return res.status(400).json({ success: false, message: 'This item can only be used in battle.' });

    let targetMonster = null;
    let message = '';
    if (targetMonsterId) {
      targetMonster = await PlayerMonster.findOne({ _id: targetMonsterId, owner: req.user._id });
      if (!targetMonster) return res.status(404).json({ success: false, message: 'Monster not found.' });
    }

    for (const effect of (item.effects || [])) {
      if (effect.effectType === 'heal_hp' && targetMonster) {
        const heal = Math.min(effect.value, targetMonster.maxHp - targetMonster.currentHp);
        targetMonster.currentHp += heal;
        message = `${targetMonster.displayName} recovered ${heal} HP!`;
      }
      if (effect.effectType === 'heal_percent' && targetMonster) {
        const heal = Math.floor(targetMonster.maxHp * (effect.value / 100));
        targetMonster.currentHp = Math.min(targetMonster.maxHp, targetMonster.currentHp + heal);
        message = `${targetMonster.displayName} recovered ${heal} HP!`;
      }
      if (effect.effectType === 'revive' && targetMonster && !targetMonster.isAlive) {
        targetMonster.isAlive = true;
        targetMonster.currentHp = Math.floor(targetMonster.maxHp * (effect.value / 100));
        message = `${targetMonster.displayName} was revived!`;
      }
      if (effect.effectType === 'cure_status' && targetMonster) {
        targetMonster.statusEffect = { type: 'none', turnsRemaining: 0 };
        message = `${targetMonster.displayName}'s status was cleared!`;
      }
      if (effect.effectType === 'full_restore' && targetMonster) {
        targetMonster.currentHp = targetMonster.maxHp;
        targetMonster.isAlive = true;
        targetMonster.statusEffect = { type: 'none', turnsRemaining: 0 };
        message = `${targetMonster.displayName} was fully restored!`;
      }
    }

    if (item.isConsumable) inventory.removeItem(itemId, 1);
    const saves = [inventory.save()];
    if (targetMonster) saves.push(targetMonster.save());
    await Promise.all(saves);

    res.json({ success: true, message: message || 'Item used.', data: targetMonster });
  } catch (err) { next(err); }
});

module.exports.invRouter = invRouter;

// ─── routes/leaderboards.js ───────────────────────────────────────────────────
const lbRouter = express.Router();
const { Leaderboard } = require('../models/GameModels');

lbRouter.get('/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const cacheKey = `lb:${category}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    let entries;
    if (category === 'pvp_rating') {
      const users = await User.find({}).sort({ 'ranking.pvpRating': -1 }).limit(100)
        .select('username profile.avatar ranking.pvpRating ranking.pvpRank gameData.level').lean();
      entries = users.map((u, i) => ({ rank: i+1, userId: u._id, username: u.username, avatar: u.profile?.avatar, score: u.ranking.pvpRating, meta: { rank: u.ranking.pvpRank } }));
    } else if (category === 'level') {
      const users = await User.find({}).sort({ 'gameData.level': -1 }).limit(100)
        .select('username profile.avatar gameData.level').lean();
      entries = users.map((u, i) => ({ rank: i+1, userId: u._id, username: u.username, score: u.gameData.level }));
    } else if (category === 'total_wins') {
      const users = await User.find({}).sort({ 'stats.wins': -1 }).limit(100)
        .select('username profile.avatar stats.wins stats.totalBattles').lean();
      entries = users.map((u, i) => ({ rank: i+1, userId: u._id, username: u.username, score: u.stats.wins }));
    } else {
      entries = [];
    }

    await cache.set(cacheKey, entries, 300);
    const start = (page - 1) * limit;
    res.json({ success: true, data: entries.slice(start, start + +limit), total: entries.length, category });
  } catch (err) { next(err); }
});

lbRouter.get('/:category/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).lean();
    let score = 0, rank = null;
    if (req.params.category === 'pvp_rating') {
      score = user.ranking.pvpRating;
      rank = await User.countDocuments({ 'ranking.pvpRating': { $gt: score } }) + 1;
    } else if (req.params.category === 'level') {
      score = user.gameData.level;
      rank = await User.countDocuments({ 'gameData.level': { $gt: score } }) + 1;
    }
    res.json({ success: true, data: { rank, score, username: user.username } });
  } catch (err) { next(err); }
});

module.exports.lbRouter = lbRouter;

// ─── routes/users.js ──────────────────────────────────────────────────────────
const userRouter = express.Router();

userRouter.get('/profile/:username', async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('username profile gameData.level stats ranking social.guild createdAt').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

userRouter.patch('/profile', protect, async (req, res, next) => {
  try {
    const { bio, avatar, title } = req.body;
    const update = {};
    if (bio !== undefined) update['profile.bio'] = bio.slice(0, 200);
    if (avatar) update['profile.avatar'] = avatar;
    if (title) update['profile.title'] = title;
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json({ success: true, data: user.profile });
  } catch (err) { next(err); }
});

userRouter.patch('/settings', protect, async (req, res, next) => {
  try {
    const allowed = ['soundEnabled','musicEnabled','notificationsEnabled','language','graphicsQuality','showDamageNumbers','battleAnimations'];
    const update = {};
    for (const key of allowed) { if (req.body[key] !== undefined) update[`settings.${key}`] = req.body[key]; }
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    res.json({ success: true, data: user.settings });
  } catch (err) { next(err); }
});

userRouter.post('/friend/:targetId', protect, async (req, res, next) => {
  try {
    const target = await User.findById(req.params.targetId);
    if (!target) return res.status(404).json({ success: false, message: 'User not found.' });
    if (target.social.friends.includes(req.user._id)) return res.status(409).json({ success: false, message: 'Already friends.' });
    target.social.friendRequests.push({ from: req.user._id });
    await target.save();
    res.json({ success: true, message: 'Friend request sent.' });
  } catch (err) { next(err); }
});

userRouter.post('/friend/:targetId/accept', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const reqIndex = user.social.friendRequests.findIndex(r => r.from.toString() === req.params.targetId);
    if (reqIndex === -1) return res.status(404).json({ success: false, message: 'Friend request not found.' });
    user.social.friendRequests.splice(reqIndex, 1);
    user.social.friends.push(req.params.targetId);
    const target = await User.findById(req.params.targetId);
    if (target) target.social.friends.push(user._id);
    await Promise.all([user.save(), target?.save()]);
    res.json({ success: true, message: 'Friend added!' });
  } catch (err) { next(err); }
});

userRouter.get('/daily-reward', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const now = new Date();
    const last = user.dailyRewards.lastClaimedAt;
    const msPerDay = 86400000;
    if (last && (now - last) < msPerDay) {
      const next = new Date(last.getTime() + msPerDay);
      return res.status(400).json({ success: false, message: 'Already claimed today.', nextRewardAt: next });
    }
    const streak = last && (now - last) < 2 * msPerDay ? user.dailyRewards.streak + 1 : 1;
    const coins = 100 + (streak - 1) * 50;
    const gems = streak % 7 === 0 ? 20 : 0;
    user.addCurrency(coins, gems);
    user.dailyRewards.lastClaimedAt = now;
    user.dailyRewards.streak = streak;
    user.dailyRewards.nextRewardAt = new Date(now.getTime() + msPerDay);
    await user.save();
    res.json({ success: true, message: `Day ${streak} reward claimed!`, rewards: { coins, gems, streak }, nextRewardAt: user.dailyRewards.nextRewardAt });
  } catch (err) { next(err); }
});

module.exports.userRouter = userRouter;

// ─── routes/shop.js ───────────────────────────────────────────────────────────
const shopRouter = express.Router();

shopRouter.get('/items', async (req, res, next) => {
  try {
    const { category } = req.query;
    const filter = { isAvailable: true };
    if (category) filter.category = category;
    const items = await Item.find(filter).lean();
    const cacheKey = await cache.get('shop:items');
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

shopRouter.post('/buy', protect, async (req, res, next) => {
  try {
    const { itemId, quantity = 1 } = req.body;
    const item = await Item.findOne({ itemId, isAvailable: true });
    if (!item) return res.status(404).json({ success: false, message: 'Item not available.' });
    const user = await User.findById(req.user._id);
    const totalCoins = item.price.coins * quantity;
    const totalGems = item.price.gems * quantity;
    user.spendCurrency(totalCoins, totalGems);
    const inventory = await Inventory.findOne({ owner: req.user._id });
    inventory.addItem(item.itemId, quantity, { name: item.name, category: item.category });
    await Promise.all([user.save(), inventory.save()]);
    res.json({ success: true, message: `Purchased ${quantity}x ${item.name}!`, data: { itemId, quantity } });
  } catch (err) { next(err); }
});

module.exports.shopRouter = shopRouter;

// ─── routes/quests.js ─────────────────────────────────────────────────────────
const questRouter = express.Router();
const { Quest, PlayerQuest } = require('../models/GameModels');

questRouter.get('/', protect, async (req, res, next) => {
  try {
    const { type } = req.query;
    const filter = { isAvailable: true };
    if (type) filter.type = type;
    const [quests, playerProgress] = await Promise.all([
      Quest.find(filter).lean(),
      PlayerQuest.find({ userId: req.user._id }).lean(),
    ]);
    const progressMap = Object.fromEntries(playerProgress.map(p => [p.questId, p]));
    const data = quests.map(q => ({ ...q, progress: progressMap[q.questId] || null }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

questRouter.post('/:questId/claim', protect, async (req, res, next) => {
  try {
    const pq = await PlayerQuest.findOne({ userId: req.user._id, questId: req.params.questId, status: 'completed' });
    if (!pq || pq.rewardClaimed) return res.status(400).json({ success: false, message: 'Quest not completed or reward already claimed.' });
    const quest = await Quest.findOne({ questId: req.params.questId });
    const user = await User.findById(req.user._id);
    user.addCurrency(quest.rewards.coins || 0, quest.rewards.gems || 0, quest.rewards.tokens || 0);
    if (quest.rewards.experience) await user.addExperience(quest.rewards.experience);
    pq.rewardClaimed = true;
    await Promise.all([pq.save(), user.save()]);
    res.json({ success: true, message: 'Rewards claimed!', rewards: quest.rewards });
  } catch (err) { next(err); }
});

module.exports.questRouter = questRouter;

// ─── routes/battlePass.js ─────────────────────────────────────────────────────
const bpRouter = express.Router();
const { BattlePass } = require('../models/GameModels');

bpRouter.get('/current', async (req, res, next) => {
  try {
    const bp = await BattlePass.findOne({ isCurrent: true }).lean();
    if (!bp) return res.status(404).json({ success: false, message: 'No active Battle Pass.' });
    res.json({ success: true, data: bp });
  } catch (err) { next(err); }
});

bpRouter.post('/purchase', protect, async (req, res, next) => {
  try {
    const { tier = 'premium' } = req.body;
    const bp = await BattlePass.findOne({ isCurrent: true });
    if (!bp) return res.status(404).json({ success: false, message: 'No active Battle Pass.' });
    const user = await User.findById(req.user._id);
    const cost = tier === 'premium' ? bp.premiumPrice.gems : bp.premiumPlusPrice.gems;
    user.spendCurrency(0, cost);
    user.battlePass.isPremium = true;
    user.battlePass.currentSeason = bp.season;
    user.battlePass.purchasedAt = new Date();
    user.battlePass.expiresAt = bp.endDate;
    await user.save();
    res.json({ success: true, message: 'Battle Pass activated!', tier });
  } catch (err) { next(err); }
});

bpRouter.post('/claim/:level', protect, async (req, res, next) => {
  try {
    const level = parseInt(req.params.level);
    const bp = await BattlePass.findOne({ isCurrent: true }).lean();
    if (!bp) return res.status(404).json({ success: false, message: 'No active Battle Pass.' });
    const user = await User.findById(req.user._id);
    if (user.battlePass.level < level) return res.status(400).json({ success: false, message: 'Battle Pass level not reached.' });
    const rewardKey = `${level}_${user.battlePass.isPremium ? 'premium' : 'free'}`;
    if (user.battlePass.claimedRewards.includes(rewardKey)) return res.status(409).json({ success: false, message: 'Reward already claimed.' });
    const levelData = bp.levels.find(l => l.level === level);
    if (!levelData) return res.status(404).json({ success: false, message: 'Level not found.' });
    const reward = user.battlePass.isPremium ? levelData.premiumReward : levelData.freeReward;
    user.addCurrency(reward.coins || 0, reward.gems || 0, reward.tokens || 0);
    user.battlePass.claimedRewards.push(rewardKey);
    await user.save();
    res.json({ success: true, message: 'Reward claimed!', reward });
  } catch (err) { next(err); }
});

module.exports.bpRouter = bpRouter;

// ─── routes/world.js ─────────────────────────────────────────────────────────
const worldRouter = express.Router();

const WORLD_DATA = {
  regions: [
    { id: 'starter_town', name: 'Starter Town', description: 'A peaceful town where your journey begins.', minLevel: 1, maxLevel: 10, bossId: 'boss_001', unlockCost: 0, coordinates: { x: 0, y: 0 }, types: ['Normal', 'Grass', 'Fire', 'Water'], image: 'starter_town' },
    { id: 'forest_glen', name: 'Forest Glen', description: 'Dense forest full of Grass and Bug monsters.', minLevel: 5, maxLevel: 15, bossId: 'boss_002', unlockCost: 0, coordinates: { x: 1, y: 0 }, types: ['Grass', 'Poison', 'Ghost'], image: 'forest_glen' },
    { id: 'fire_mountain', name: 'Fire Mountain', description: 'A volcanic mountain swarming with Fire types.', minLevel: 15, maxLevel: 30, bossId: 'boss_003', unlockCost: 0, coordinates: { x: 2, y: 1 }, types: ['Fire', 'Rock', 'Steel'], image: 'fire_mountain' },
    { id: 'ocean_coast', name: 'Ocean Coast', description: 'The vast ocean coastline.', minLevel: 10, maxLevel: 25, bossId: 'boss_004', unlockCost: 0, coordinates: { x: 0, y: 2 }, types: ['Water', 'Ice', 'Electric'], image: 'ocean_coast' },
    { id: 'electric_valley', name: 'Electric Valley', description: 'A valley crackling with electricity.', minLevel: 20, maxLevel: 35, bossId: 'boss_005', unlockCost: 0, coordinates: { x: 1, y: 2 }, types: ['Electric', 'Steel', 'Wind'], image: 'electric_valley' },
    { id: 'ice_peaks', name: 'Ice Peaks', description: 'Frozen mountain tops where Ice dragons roam.', minLevel: 30, maxLevel: 50, bossId: 'boss_006', unlockCost: 2000, coordinates: { x: 3, y: 0 }, types: ['Ice', 'Dragon', 'Wind'], image: 'ice_peaks' },
    { id: 'shadow_dungeon', name: 'Shadow Dungeon', description: 'A dark cavern of Ghost and Dark monsters.', minLevel: 35, maxLevel: 55, bossId: 'boss_007', unlockCost: 3000, coordinates: { x: 2, y: 3 }, types: ['Ghost', 'Dark', 'Psychic'], image: 'shadow_dungeon' },
    { id: 'dragon_lair', name: 'Dragon Lair', description: 'The domain of ancient Dragons.', minLevel: 50, maxLevel: 70, bossId: 'boss_008', unlockCost: 5000, coordinates: { x: 4, y: 2 }, types: ['Dragon', 'Light', 'Steel'], image: 'dragon_lair' },
    { id: 'legendary_shrine', name: 'Legendary Shrine', description: 'A mysterious shrine where Legendary monsters sleep.', minLevel: 70, maxLevel: 100, bossId: 'boss_legendary', unlockCost: 10000, coordinates: { x: 5, y: 5 }, types: ['Light', 'Psychic', 'Dragon'], image: 'legendary_shrine', isLegendary: true },
  ],
};

worldRouter.get('/regions', async (req, res) => {
  res.json({ success: true, data: WORLD_DATA.regions });
});

worldRouter.get('/regions/:regionId', async (req, res) => {
  const region = WORLD_DATA.regions.find(r => r.id === req.params.regionId);
  if (!region) return res.status(404).json({ success: false, message: 'Region not found.' });
  res.json({ success: true, data: region });
});

worldRouter.post('/regions/:regionId/unlock', protect, async (req, res, next) => {
  try {
    const region = WORLD_DATA.regions.find(r => r.id === req.params.regionId);
    if (!region) return res.status(404).json({ success: false, message: 'Region not found.' });
    const user = await User.findById(req.user._id);
    if (user.gameData.storyProgress.unlockedRegions.includes(region.id)) {
      return res.status(400).json({ success: false, message: 'Region already unlocked.' });
    }
    if (region.unlockCost > 0) user.spendCurrency(region.unlockCost, 0);
    user.gameData.storyProgress.unlockedRegions.push(region.id);
    await user.save();
    res.json({ success: true, message: `${region.name} unlocked!` });
  } catch (err) { next(err); }
});

module.exports.worldRouter = worldRouter;

// ─── routes/achievements.js ───────────────────────────────────────────────────
const achRouter = express.Router();
const { Achievement, PlayerAchievement } = require('../models/Achievement');

achRouter.get('/', protect, async (req, res, next) => {
  try {
    const [achievements, playerAchs] = await Promise.all([
      Achievement.find({ isAvailable: true }).lean(),
      PlayerAchievement.find({ userId: req.user._id }).lean(),
    ]);
    const map = Object.fromEntries(playerAchs.map(p => [p.achievementId, p]));
    const data = achievements.map(a => ({ ...a, progress: map[a.achievementId] || null }));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

module.exports.achRouter = achRouter;

// ─── routes/admin.js ─────────────────────────────────────────────────────────
const adminRouter = express.Router();
const { adminOnly } = require('../middleware/auth');

adminRouter.get('/stats', protect, adminOnly, async (req, res, next) => {
  try {
    const [users, battles, monsters] = await Promise.all([
      User.countDocuments(),
      Battle.countDocuments(),
      PlayerMonster.countDocuments(),
    ]);
    res.json({ success: true, data: { users, battles, monsters, activeBattles: BattleManager.getActiveBattleCount() } });
  } catch (err) { next(err); }
});

adminRouter.get('/users', protect, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = {};
    if (search) filter.$or = [{ username: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
    const [users, total] = await Promise.all([
      User.find(filter).skip((page-1)*limit).limit(+limit).select('-password').lean(),
      User.countDocuments(filter),
    ]);
    res.json({ success: true, data: users, pagination: { total, page: +page, limit: +limit } });
  } catch (err) { next(err); }
});

adminRouter.patch('/users/:id/ban', protect, adminOnly, async (req, res, next) => {
  try {
    const { reason, duration } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    user.isBanned = true;
    user.banReason = reason;
    if (duration) user.banExpiry = new Date(Date.now() + duration * 60000);
    await user.save();
    res.json({ success: true, message: `User ${user.username} banned.` });
  } catch (err) { next(err); }
});

adminRouter.patch('/users/:id/unban', protect, adminOnly, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isBanned: false, banReason: null, banExpiry: null });
    res.json({ success: true, message: 'User unbanned.' });
  } catch (err) { next(err); }
});

adminRouter.post('/monsters/template', protect, adminOnly, async (req, res, next) => {
  try {
    const template = await MonsterTemplate.create(req.body);
    await cache.delPattern('templates:*');
    res.status(201).json({ success: true, data: template });
  } catch (err) { next(err); }
});

adminRouter.post('/tournaments', protect, adminOnly, async (req, res, next) => {
  try {
    const tournament = await Tournament.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: tournament });
  } catch (err) { next(err); }
});

adminRouter.patch('/tournaments/:id/status', protect, adminOnly, async (req, res, next) => {
  try {
    const tournament = await Tournament.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.json({ success: true, data: tournament });
  } catch (err) { next(err); }
});

module.exports.adminRouter = adminRouter;
