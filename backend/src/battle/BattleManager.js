const { v4: uuidv4 } = require('uuid');
const { BattleEngine } = require('./BattleEngine');
const Battle = require('../models/Battle');
const User = require('../models/User');
const PlayerMonster = require('../models/PlayerMonster');
const MonsterTemplate = require('../models/MonsterTemplate');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

// Active battles in memory
const activeBattles = new Map();

class BattleManager {
  /**
   * Create and register a new PvE battle
   */
  static async createPvEBattle(userId, npcData, config = {}) {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('User not found');

    const team = await PlayerMonster.find({
      _id: { $in: user.gameData.activeTeam },
      isAlive: true,
    }).lean();

    if (team.length === 0) throw new Error('No alive monsters in your team');

    const templateIds = [...new Set(team.map(m => m.templateId))];
    const templates = await MonsterTemplate.find({ monsterId: { $in: templateIds } }).lean();
    const templateMap = Object.fromEntries(templates.map(t => [t.monsterId, t]));

    const engine = new BattleEngine({ type: 'pve', mode: config.mode || 'story', ...config });

    engine.setupPlayer('A', { _id: userId, username: user.username }, team, templateMap);
    engine.setupPlayer('B', {
      _id: 'npc',
      userId: 'npc',
      username: npcData.name,
      isNPC: true,
      npcId: npcData.id,
    }, npcData.team || [], {});

    // Set on-end callback for persistence
    engine.onBattleEnd = async (result) => {
      await BattleManager._persistBattleResult(result);
      await BattleManager._applyRewards(result);
      activeBattles.delete(engine.battleId);
    };

    activeBattles.set(engine.battleId, engine);

    // Cache battle ID for user lookup
    await cache.set(`user_battle:${userId}`, engine.battleId, 3600);

    const initialState = engine.start();
    return { battleId: engine.battleId, ...initialState };
  }

  /**
   * Create a PvP battle between two users
   */
  static async createPvPBattle(userIdA, userIdB, config = {}) {
    const [userA, userB] = await Promise.all([
      User.findById(userIdA).lean(),
      User.findById(userIdB).lean(),
    ]);

    if (!userA || !userB) throw new Error('User not found');

    const [teamA, teamB] = await Promise.all([
      PlayerMonster.find({ _id: { $in: userA.gameData.activeTeam }, isAlive: true }).lean(),
      PlayerMonster.find({ _id: { $in: userB.gameData.activeTeam }, isAlive: true }).lean(),
    ]);

    if (teamA.length === 0) throw new Error(`${userA.username} has no alive monsters`);
    if (teamB.length === 0) throw new Error(`${userB.username} has no alive monsters`);

    const allTemplateIds = [...new Set([...teamA, ...teamB].map(m => m.templateId))];
    const templates = await MonsterTemplate.find({ monsterId: { $in: allTemplateIds } }).lean();
    const templateMap = Object.fromEntries(templates.map(t => [t.monsterId, t]));

    const engine = new BattleEngine({
      type: 'pvp',
      mode: config.mode || 'casual',
      expEnabled: true,
      rewardsEnabled: true,
      ...config,
    });

    engine.setupPlayer('A', userA, teamA, templateMap);
    engine.setupPlayer('B', userB, teamB, templateMap);

    engine.onBattleEnd = async (result) => {
      await BattleManager._persistBattleResult(result);
      await BattleManager._applyRewards(result);
      if (config.mode === 'ranked') await BattleManager._updateRatings(result);
      activeBattles.delete(engine.battleId);
    };

    activeBattles.set(engine.battleId, engine);

    await cache.set(`user_battle:${userIdA}`, engine.battleId, 3600);
    await cache.set(`user_battle:${userIdB}`, engine.battleId, 3600);

    const initialState = engine.start();
    return { battleId: engine.battleId, ...initialState };
  }

  /**
   * Submit an action to an active battle
   */
  static submitAction(battleId, userId, action) {
    const engine = activeBattles.get(battleId);
    if (!engine) throw new Error('Battle not found or expired');

    const side = engine.playerA.userId === userId ? 'A'
      : engine.playerB.userId === userId ? 'B' : null;

    if (!side) throw new Error('You are not a participant in this battle');
    if (engine.status !== 'active') throw new Error('Battle is not active');

    return engine.submitAction(side, action);
  }

  /**
   * Get active battle state
   */
  static getBattleState(battleId, userId) {
    const engine = activeBattles.get(battleId);
    if (!engine) return null;
    return engine.getBattleState();
  }

  /**
   * Get battle engine reference
   */
  static getEngine(battleId) {
    return activeBattles.get(battleId) || null;
  }

  /**
   * Forfeit a battle
   */
  static async forfeitBattle(battleId, userId) {
    const engine = activeBattles.get(battleId);
    if (!engine) throw new Error('Battle not found');

    const side = engine.playerA.userId === userId ? 'A' : 'B';
    return engine.submitAction(side, { type: 'flee' });
  }

  // ─── ELO Rating System ─────────────────────────────────────────────────────
  static _calculateEloChange(ratingA, ratingB, resultA) {
    const K = 32;
    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const changeA = Math.round(K * (resultA - expectedA));
    return { changeA, changeB: -changeA };
  }

  static async _updateRatings(result) {
    if (result.type !== 'pvp') return;
    const userAId = result.playerA.userId;
    const userBId = result.playerB.userId;
    const [userA, userB] = await Promise.all([User.findById(userAId), User.findById(userBId)]);
    if (!userA || !userB) return;

    const resultA = result.winnerSide === 'A' ? 1 : result.winnerSide === 'draw' ? 0.5 : 0;
    const { changeA, changeB } = BattleManager._calculateEloChange(
      userA.ranking.pvpRating, userB.ranking.pvpRating, resultA
    );

    userA.ranking.pvpRating = Math.max(0, userA.ranking.pvpRating + changeA);
    userB.ranking.pvpRating = Math.max(0, userB.ranking.pvpRating + changeB);

    userA.ranking.pvpRank = BattleManager._getRankName(userA.ranking.pvpRating);
    userB.ranking.pvpRank = BattleManager._getRankName(userB.ranking.pvpRating);

    if (userA.ranking.pvpRating > userA.ranking.highestRating) userA.ranking.highestRating = userA.ranking.pvpRating;
    if (userB.ranking.pvpRating > userB.ranking.highestRating) userB.ranking.highestRating = userB.ranking.pvpRating;

    await Promise.all([userA.save(), userB.save()]);
    return { changeA, changeB };
  }

  static _getRankName(rating) {
    if (rating >= 2800) return 'Mythic';
    if (rating >= 2400) return 'Legendary';
    if (rating >= 2000) return 'Master';
    if (rating >= 1600) return 'Diamond';
    if (rating >= 1300) return 'Platinum';
    if (rating >= 1000) return 'Gold';
    if (rating >= 700) return 'Silver';
    return 'Bronze';
  }

  // ─── Persistence ───────────────────────────────────────────────────────────
  static async _persistBattleResult(result) {
    try {
      const battle = new Battle({
        battleId: result.battleId,
        type: result.type,
        status: 'completed',
        mode: result.mode,
        participants: [
          {
            userId: result.playerA.userId !== 'npc' ? result.playerA.userId : undefined,
            username: result.playerA.username,
            isNPC: result.playerA.isNPC || false,
            team: result.playerA.team.map(m => ({
              name: m.name, level: m.level, finalHp: m.currentHp,
              maxHp: m.maxHp, isAlive: m.isAlive,
            })),
            result: result.winnerSide === 'A' ? 'win' : result.winnerSide === 'draw' ? 'draw' : 'loss',
            rewardsEarned: result.rewards?.playerA || {},
          },
          {
            userId: result.playerB.userId !== 'npc' ? result.playerB.userId : undefined,
            username: result.playerB.username,
            isNPC: result.playerB.isNPC || false,
            team: result.playerB.team.map(m => ({
              name: m.name, level: m.level, finalHp: m.currentHp,
              maxHp: m.maxHp, isAlive: m.isAlive,
            })),
            result: result.winnerSide === 'B' ? 'win' : result.winnerSide === 'draw' ? 'draw' : 'loss',
            rewardsEarned: result.rewards?.playerB || {},
          },
        ],
        winnerSide: result.winnerSide,
        totalTurns: result.totalTurns,
        meta: { battleDurationMs: result.durationMs, isRanked: result.mode === 'ranked' },
        startedAt: new Date(Date.now() - result.durationMs),
        completedAt: new Date(),
      });
      await battle.save();
    } catch (err) {
      logger.error('Failed to persist battle:', err);
    }
  }

  static async _applyRewards(result) {
    try {
      const applyToUser = async (userId, rewards) => {
        if (!userId || userId === 'npc') return;
        const user = await User.findById(userId);
        if (!user) return;
        user.addCurrency(rewards.coins || 0, rewards.gems || 0, rewards.tokens || 0, rewards.honor || 0);
        if (rewards.experience) await user.addExperience(rewards.experience);
        user.stats.totalBattles += 1;
        if (result.winnerUserId === userId) {
          user.stats.wins += 1;
          user.stats.currentWinStreak += 1;
          if (user.stats.currentWinStreak > user.stats.longestWinStreak) {
            user.stats.longestWinStreak = user.stats.currentWinStreak;
          }
          if (result.type === 'pvp') user.stats.pvpWins += 1;
        } else {
          user.stats.losses += 1;
          user.stats.currentWinStreak = 0;
          if (result.type === 'pvp') user.stats.pvpLosses += 1;
        }
        await user.save();
      };

      await Promise.all([
        applyToUser(result.playerA.userId, result.rewards?.playerA || {}),
        applyToUser(result.playerB.userId, result.rewards?.playerB || {}),
      ]);
    } catch (err) {
      logger.error('Failed to apply rewards:', err);
    }
  }

  // Cleanup stale battles
  static async cleanupStaleBattles() {
    const staleThreshold = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    for (const [id, engine] of activeBattles.entries()) {
      if (engine.startTime && (now - engine.startTime) > staleThreshold) {
        logger.warn(`Cleaning up stale battle: ${id}`);
        activeBattles.delete(id);
      }
    }
  }

  static getActiveBattleCount() { return activeBattles.size; }
}

// Cleanup every 5 minutes
setInterval(() => BattleManager.cleanupStaleBattles(), 5 * 60 * 1000);

module.exports = BattleManager;
