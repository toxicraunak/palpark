const express = require('express');
const router = express.Router();
const { body, query, param, validationResult } = require('express-validator');
const MonsterTemplate = require('../models/MonsterTemplate');
const PlayerMonster = require('../models/PlayerMonster');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const { protect } = require('../middleware/auth');
const { cache } = require('../config/redis');
const { AppError } = require('../middleware/errorHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  next();
};

// ─── GET /api/monsters/templates — Browse all monster templates ──────────────
router.get('/templates', async (req, res, next) => {
  try {
    const {
      page = 1, limit = 20, type, rarity, habitat,
      search, sort = 'monsterId', order = 'asc',
    } = req.query;

    const cacheKey = `templates:${JSON.stringify(req.query)}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const filter = { isReleased: true };
    if (type) filter['types.primary'] = type;
    if (rarity) filter.rarity = rarity;
    if (habitat) filter.habitat = habitat;
    if (search) filter.$text = { $search: search };

    const sortObj = { [sort]: order === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [templates, total] = await Promise.all([
      MonsterTemplate.find(filter)
        .select('monsterId name types baseStats baseStatTotal rarity evolutionStage appearance.spriteId catchRate')
        .sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      MonsterTemplate.countDocuments(filter),
    ]);

    const result = {
      success: true,
      data: templates,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    };

    await cache.set(cacheKey, result, 300);
    res.json(result);
  } catch (err) { next(err); }
});

// ─── GET /api/monsters/templates/:id — Single template ──────────────────────
router.get('/templates/:id', async (req, res, next) => {
  try {
    const cacheKey = `template:${req.params.id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const template = await MonsterTemplate.findOne({
      $or: [{ monsterId: parseInt(req.params.id) || -1 }, { name: req.params.id }],
      isReleased: true,
    }).lean();

    if (!template) return res.status(404).json({ success: false, message: 'Monster not found.' });

    await cache.set(cacheKey, template, 600);
    res.json({ success: true, data: template });
  } catch (err) { next(err); }
});

// ─── GET /api/monsters/my — Current user's monster collection ────────────────
router.get('/my', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, rarity, inTeam, sort = 'level', order = 'desc' } = req.query;
    const filter = { owner: req.user._id };
    if (type) filter['types.primary'] = type;
    if (rarity) filter.rarity = rarity;
    if (inTeam !== undefined) filter.isInTeam = inTeam === 'true';

    const sortObj = { [sort]: order === 'desc' ? -1 : 1 };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [monsters, total] = await Promise.all([
      PlayerMonster.find(filter).sort(sortObj).skip(skip).limit(parseInt(limit)).lean(),
      PlayerMonster.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: monsters,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) { next(err); }
});

// ─── GET /api/monsters/my/:monsterId — Single player monster ────────────────
router.get('/my/:monsterId', protect, async (req, res, next) => {
  try {
    const monster = await PlayerMonster.findOne({ _id: req.params.monsterId, owner: req.user._id }).lean();
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });
    res.json({ success: true, data: monster });
  } catch (err) { next(err); }
});

// ─── POST /api/monsters/my/:monsterId/nickname — Set nickname ────────────────
router.post('/my/:monsterId/nickname', protect, [
  body('nickname').trim().isLength({ max: 20 }),
], validate, async (req, res, next) => {
  try {
    const monster = await PlayerMonster.findOne({ _id: req.params.monsterId, owner: req.user._id });
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });
    monster.nickname = req.body.nickname || '';
    await monster.save();
    res.json({ success: true, message: 'Nickname updated.', nickname: monster.nickname });
  } catch (err) { next(err); }
});

// ─── GET /api/monsters/team — Get active team ───────────────────────────────
router.get('/team', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).lean();
    const team = await PlayerMonster.find({ _id: { $in: user.gameData.activeTeam } }).lean();

    // Preserve team order
    const ordered = user.gameData.activeTeam
      .map(id => team.find(m => m._id.toString() === id.toString()))
      .filter(Boolean);

    res.json({ success: true, data: ordered, teamSize: ordered.length });
  } catch (err) { next(err); }
});

// ─── POST /api/monsters/team — Update team ──────────────────────────────────
router.post('/team', protect, [
  body('team').isArray({ min: 1, max: 6 }),
], validate, async (req, res, next) => {
  try {
    const { team } = req.body; // array of PlayerMonster _ids
    const maxTeam = process.env.MAX_TEAM_SIZE || 6;

    if (team.length > maxTeam) {
      return res.status(400).json({ success: false, message: `Team cannot exceed ${maxTeam} monsters.` });
    }

    // Verify all monsters belong to user
    const monsters = await PlayerMonster.find({ _id: { $in: team }, owner: req.user._id });
    if (monsters.length !== team.length) {
      return res.status(400).json({ success: false, message: 'Some monsters not found or do not belong to you.' });
    }

    const aliveMonsters = monsters.filter(m => m.isAlive || m.currentHp > 0);
    if (aliveMonsters.length === 0) {
      return res.status(400).json({ success: false, message: 'Team must have at least one conscious monster.' });
    }

    // Update isInTeam flags
    await PlayerMonster.updateMany({ owner: req.user._id }, { isInTeam: false });
    await PlayerMonster.updateMany({ _id: { $in: team }, owner: req.user._id }, { isInTeam: true });

    await User.findByIdAndUpdate(req.user._id, {
      'gameData.activeTeam': team,
    });

    res.json({ success: true, message: 'Team updated.', teamSize: team.length });
  } catch (err) { next(err); }
});

// ─── POST /api/monsters/my/:monsterId/evolve — Evolve monster ───────────────
router.post('/my/:monsterId/evolve', protect, async (req, res, next) => {
  try {
    const monster = await PlayerMonster.findOne({ _id: req.params.monsterId, owner: req.user._id });
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });

    const template = await MonsterTemplate.findOne({ monsterId: monster.templateId });
    if (!template) return res.status(404).json({ success: false, message: 'Monster template not found.' });

    if (!template.evolvesTo || template.evolvesTo.length === 0) {
      return res.status(400).json({ success: false, message: `${monster.name} cannot evolve.` });
    }

    // Find valid evolution
    const evolution = template.evolvesTo.find(evo => {
      if (evo.method.type === 'level') return monster.level >= evo.method.level;
      if (evo.method.type === 'item') return req.body.itemId === evo.method.item;
      if (evo.method.type === 'happiness') return monster.happiness >= evo.method.happiness;
      return false;
    });

    if (!evolution) {
      return res.status(400).json({ success: false, message: 'Evolution conditions not met.' });
    }

    // Consume evolution item if required
    if (evolution.method.type === 'item') {
      const inventory = await Inventory.findOne({ owner: req.user._id });
      if (!inventory.hasItem(evolution.method.item)) {
        return res.status(400).json({ success: false, message: `You need a ${evolution.method.item} to evolve this monster.` });
      }
      inventory.removeItem(evolution.method.item, 1);
      await inventory.save();
    }

    // Get target template
    const targetTemplate = await MonsterTemplate.findOne({ monsterId: evolution.targetId });
    if (!targetTemplate) return res.status(500).json({ success: false, message: 'Evolution target not found.' });

    const oldName = monster.name;
    monster.templateId = evolution.targetId;
    monster.name = targetTemplate.name;
    monster.types = targetTemplate.types;
    monster.rarity = targetTemplate.rarity;
    monster.evolutionStage = targetTemplate.evolutionStage;
    monster.evolvedAt = new Date();
    monster.evolvedFrom = template.monsterId;
    monster.evolutionReady = false;

    // Add new moves available at this evolution stage
    if (targetTemplate.moves && targetTemplate.moves.length > 0) {
      const newMoves = targetTemplate.moves.filter(m => m.learnedAtLevel <= monster.level);
      if (newMoves.length > 0 && monster.equippedMoves.length < 4) {
        const slotsLeft = 4 - monster.equippedMoves.length;
        for (const move of newMoves.slice(0, slotsLeft)) {
          if (!monster.equippedMoves.find(em => em.moveId === move.moveId)) {
            monster.equippedMoves.push({ ...move, currentUses: move.maxUses });
          }
        }
      }
    }

    // Recalculate stats
    monster.recalculateStats(targetTemplate.baseStats);
    await monster.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.monstersEvolved': 1 } });

    res.json({
      success: true,
      message: `${oldName} evolved into ${monster.name}!`,
      data: monster,
      animation: 'evolution',
    });
  } catch (err) { next(err); }
});

// ─── POST /api/monsters/my/:monsterId/release — Release a monster ────────────
router.post('/my/:monsterId/release', protect, async (req, res, next) => {
  try {
    const monster = await PlayerMonster.findOne({ _id: req.params.monsterId, owner: req.user._id });
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });
    if (monster.isInTeam) return res.status(400).json({ success: false, message: 'Remove from team before releasing.' });
    if (monster.isForTrade) return res.status(400).json({ success: false, message: 'Cancel marketplace listing first.' });

    await monster.deleteOne();

    // Remove from user team if present
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { 'gameData.activeTeam': monster._id },
    });

    res.json({ success: true, message: `${monster.name} was released.` });
  } catch (err) { next(err); }
});

// ─── GET /api/monsters/my/:monsterId/moves — Get learnable moves ─────────────
router.get('/my/:monsterId/moves', protect, async (req, res, next) => {
  try {
    const monster = await PlayerMonster.findOne({ _id: req.params.monsterId, owner: req.user._id }).lean();
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });

    const template = await MonsterTemplate.findOne({ monsterId: monster.templateId }).lean();
    const learnableMoves = template.moves.filter(m => m.learnedAtLevel <= monster.level);

    res.json({ success: true, data: { equippedMoves: monster.equippedMoves, learnableMoves } });
  } catch (err) { next(err); }
});

// ─── POST /api/monsters/my/:monsterId/moves — Update equipped moves ──────────
router.post('/my/:monsterId/moves', protect, [
  body('moves').isArray({ min: 1, max: 4 }),
], validate, async (req, res, next) => {
  try {
    const monster = await PlayerMonster.findOne({ _id: req.params.monsterId, owner: req.user._id });
    if (!monster) return res.status(404).json({ success: false, message: 'Monster not found.' });

    const template = await MonsterTemplate.findOne({ monsterId: monster.templateId }).lean();
    const validMoveIds = template.moves.filter(m => m.learnedAtLevel <= monster.level).map(m => m.moveId);

    const moves = req.body.moves.filter(id => validMoveIds.includes(id));
    if (moves.length === 0) return res.status(400).json({ success: false, message: 'No valid moves selected.' });

    const newEquipped = moves.map(moveId => {
      const tmpl = template.moves.find(m => m.moveId === moveId);
      const existing = monster.equippedMoves.find(m => m.moveId === moveId);
      return existing || { ...tmpl, currentUses: tmpl.maxUses };
    });

    monster.equippedMoves = newEquipped.slice(0, 4);
    await monster.save();

    res.json({ success: true, message: 'Moves updated.', equippedMoves: monster.equippedMoves });
  } catch (err) { next(err); }
});

// ─── GET /api/monsters/types — Get all element types ────────────────────────
router.get('/types', async (req, res) => {
  res.json({
    success: true,
    data: ['Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Dragon',
      'Dark', 'Light', 'Ghost', 'Rock', 'Steel', 'Wind', 'Poison', 'Psychic', 'Normal'],
  });
});

// ─── GET /api/monsters/dex/:userId — Public pokedex for a user ───────────────
router.get('/dex/:userId', async (req, res, next) => {
  try {
    const monsters = await PlayerMonster.find({ owner: req.params.userId })
      .select('templateId name types level isShiny rarity').lean();

    const seen = [...new Set(monsters.map(m => m.templateId))];
    res.json({ success: true, caught: seen.length, data: monsters });
  } catch (err) { next(err); }
});

module.exports = router;
