const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const BattleManager = require('../battle/BattleManager');
const Battle = require('../models/Battle');
const { protect } = require('../middleware/auth');
const { cache } = require('../config/redis');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// ─── POST /api/battles/pve — Start PvE battle ────────────────────────────────
router.post('/pve', protect, [
  body('npcId').notEmpty(),
  body('region').optional().isString(),
], validate, async (req, res, next) => {
  try {
    // Check if user already in battle
    const existingBattle = await cache.get(`user_battle:${req.user._id}`);
    if (existingBattle && BattleManager.getEngine(existingBattle)) {
      return res.status(409).json({ success: false, message: 'Already in a battle.', battleId: existingBattle });
    }

    const { npcId, region } = req.body;
    const npcData = await getNPCData(npcId, region);

    const result = await BattleManager.createPvEBattle(req.user._id.toString(), npcData, { mode: 'story' });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ─── POST /api/battles/wild — Start wild monster encounter ───────────────────
router.post('/wild', protect, [
  body('region').notEmpty(),
  body('monsterId').optional().isInt(),
], validate, async (req, res, next) => {
  try {
    const { region, monsterId } = req.body;
    const MonsterTemplate = require('../models/MonsterTemplate');

    let wildTemplate;
    if (monsterId) {
      wildTemplate = await MonsterTemplate.findOne({ monsterId, isReleased: true });
    } else {
      // Random encounter based on region
      const spawnData = getRegionSpawns(region);
      const roll = Math.random() * 100;
      const eligible = spawnData.filter(s => roll <= s.spawnRate);
      if (!eligible.length) return res.status(404).json({ success: false, message: 'No monsters found in this area.' });

      const picked = eligible[Math.floor(Math.random() * eligible.length)];
      wildTemplate = await MonsterTemplate.findOne({ monsterId: picked.monsterId });
    }

    if (!wildTemplate) return res.status(404).json({ success: false, message: 'Monster not found.' });

    // Generate wild monster stats
    const level = getWildLevel(region);
    const wildMonster = generateWildMonster(wildTemplate, level);

    const npcData = {
      id: `wild_${wildTemplate.monsterId}`,
      name: `Wild ${wildTemplate.name}`,
      team: [wildMonster],
      isWild: true,
      catchable: true,
    };

    const result = await BattleManager.createPvEBattle(req.user._id.toString(), npcData, { mode: 'wild', allowFlee: true });
    res.status(201).json({ success: true, data: result, isWild: true, wildMonster: { name: wildTemplate.name, level } });
  } catch (err) { next(err); }
});

// ─── POST /api/battles/:battleId/action — Submit battle action ───────────────
router.post('/:battleId/action', protect, [
  body('type').isIn(['move', 'switch', 'item', 'capture', 'flee', 'pass']),
], validate, async (req, res, next) => {
  try {
    const result = BattleManager.submitAction(req.params.battleId, req.user._id.toString(), req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    if (err.message.includes('not found') || err.message.includes('not a participant')) {
      return res.status(404).json({ success: false, message: err.message });
    }
    next(err);
  }
});

// ─── GET /api/battles/:battleId/state — Get battle state ─────────────────────
router.get('/:battleId/state', protect, async (req, res, next) => {
  try {
    const state = BattleManager.getBattleState(req.params.battleId, req.user._id.toString());
    if (!state) return res.status(404).json({ success: false, message: 'Battle not found or expired.' });
    res.json({ success: true, data: state });
  } catch (err) { next(err); }
});

// ─── POST /api/battles/:battleId/forfeit — Forfeit battle ───────────────────
router.post('/:battleId/forfeit', protect, async (req, res, next) => {
  try {
    const result = await BattleManager.forfeitBattle(req.params.battleId, req.user._id.toString());
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ─── GET /api/battles/history — Battle history ───────────────────────────────
router.get('/history', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    const filter = { 'participants.userId': req.user._id, status: 'completed' };
    if (type) filter.type = type;

    const [battles, total] = await Promise.all([
      Battle.find(filter).sort({ completedAt: -1 })
        .skip((page - 1) * limit).limit(parseInt(limit))
        .select('-turns').lean(),
      Battle.countDocuments(filter),
    ]);

    res.json({ success: true, data: battles, pagination: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
});

// ─── GET /api/battles/:battleId — Get battle record ─────────────────────────
router.get('/:battleId', protect, async (req, res, next) => {
  try {
    const battle = await Battle.findOne({ battleId: req.params.battleId }).lean();
    if (!battle) return res.status(404).json({ success: false, message: 'Battle not found.' });

    const isParticipant = battle.participants.some(p => p.userId?.toString() === req.user._id.toString());
    if (!isParticipant && req.user.role === 'player') {
      // Only return limited data for non-participants
      const { turns, ...publicData } = battle;
      return res.json({ success: true, data: publicData });
    }

    res.json({ success: true, data: battle });
  } catch (err) { next(err); }
});

// ─── GET /api/battles/active/count — Server stats ───────────────────────────
router.get('/active/count', async (req, res) => {
  res.json({ success: true, activeBattles: BattleManager.getActiveBattleCount() });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getNPCData(npcId, region) {
  const MonsterTemplate = require('../models/MonsterTemplate');
  // Load NPC data — in production this comes from a data file or DB
  const level = 5 + Math.floor(Math.random() * 15);
  const templates = await MonsterTemplate.find({ isReleased: true }).limit(3).lean();

  return {
    id: npcId,
    name: `Trainer ${npcId}`,
    team: templates.map(t => generateWildMonster(t, level)),
  };
}

function getRegionSpawns(region) {
  const spawns = {
    starter_town: [{ monsterId: 1, spawnRate: 70 }, { monsterId: 4, spawnRate: 60 }, { monsterId: 7, spawnRate: 60 }],
    forest_glen: [{ monsterId: 10, spawnRate: 80 }, { monsterId: 13, spawnRate: 50 }],
    fire_mountain: [{ monsterId: 4, spawnRate: 90 }, { monsterId: 37, spawnRate: 40 }],
    ocean_coast: [{ monsterId: 7, spawnRate: 90 }, { monsterId: 54, spawnRate: 40 }],
    electric_valley: [{ monsterId: 25, spawnRate: 70 }, { monsterId: 81, spawnRate: 30 }],
  };
  return spawns[region] || spawns.starter_town;
}

function getWildLevel(region) {
  const levels = {
    starter_town: [2, 8], forest_glen: [5, 12], fire_mountain: [15, 25],
    ocean_coast: [10, 20], electric_valley: [12, 22],
  };
  const [min, max] = levels[region] || [1, 10];
  return min + Math.floor(Math.random() * (max - min + 1));
}

function generateWildMonster(template, level) {
  const NATURES = ['hardy', 'lonely', 'brave', 'adamant', 'bold', 'timid', 'modest', 'jolly', 'calm', 'careful'];
  const nature = NATURES[Math.floor(Math.random() * NATURES.length)];
  const isShiny = Math.random() < 0.00125; // 1/800 shiny rate

  const ivs = {};
  const baseStats = { ...template.baseStats };
  const calcStat = (stat, base) => {
    const iv = Math.floor(Math.random() * 32);
    ivs[stat] = iv;
    if (stat === 'hp') return Math.floor(((2 * base + iv) * level) / 100) + level + 10;
    return Math.floor((Math.floor(((2 * base + iv) * level) / 100) + 5) * 1.0);
  };

  const calculatedStats = {
    hp: calcStat('hp', baseStats.hp),
    attack: calcStat('attack', baseStats.attack),
    defense: calcStat('defense', baseStats.defense),
    specialAttack: calcStat('specialAttack', baseStats.specialAttack),
    specialDefense: calcStat('specialDefense', baseStats.specialDefense),
    speed: calcStat('speed', baseStats.speed),
  };

  const moves = (template.moves || [])
    .filter(m => m.learnedAtLevel <= level)
    .slice(-4)
    .map(m => ({ ...m, currentUses: m.maxUses }));

  return {
    _id: require('mongoose').Types.ObjectId(),
    owner: 'wild',
    templateId: template.monsterId,
    name: template.name,
    level,
    nature,
    isShiny,
    types: template.types,
    rarity: template.rarity,
    calculatedStats,
    currentHp: calculatedStats.hp,
    maxHp: calculatedStats.hp,
    isAlive: true,
    ivs,
    evs: { hp: 0, attack: 0, defense: 0, specialAttack: 0, specialDefense: 0, speed: 0 },
    equippedMoves: moves,
    statusEffect: { type: 'none', turnsRemaining: 0 },
    catchRate: template.catchRate || 45,
    ability: template.abilities?.[0] || {},
  };
}

module.exports = router;
