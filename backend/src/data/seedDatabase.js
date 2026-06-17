require('dotenv').config();
const mongoose = require('mongoose');
const MONSTERS = require('./monsters');
const ITEMS = require('./seeds/itemSeed');
const MonsterTemplate = require('../models/MonsterTemplate');
const Item = require('../models/Item');
const { Quest, BattlePass, Season } = require('../models/GameModels');
const { Achievement } = require('../models/Achievement');
const logger = require('../utils/logger');

async function seedDatabase() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/monster_legends_arena';
    await mongoose.connect(uri);
    logger.info('Connected to MongoDB for seeding...');

    // ─── Seed Monster Templates ──────────────────────────────────────────────
    logger.info(`Seeding ${MONSTERS.length} monsters...`);
    let inserted = 0, updated = 0;
    for (const m of MONSTERS) {
      const doc = {
        monsterId: m.monsterId,
        name: m.name,
        description: m.description || `A ${m.rarity} ${m.types.primary}-type monster.`,
        types: m.types,
        baseStats: m.baseStats,
        evolutionStage: m.evolutionStage || 1,
        evolvesFrom: m.evolvesFrom,
        evolvesTo: m.evolvesTo || [],
        catchRate: m.catchRate || 45,
        expYield: m.expYield || 64,
        expCurve: m.expCurve || 'medium_fast',
        rarity: m.rarity || 'common',
        isLegendary: m.isLegendary || false,
        isMythical: m.isMythical || false,
        isStarterMonster: m.isStarterMonster || false,
        habitat: m.habitat || 'forest',
        appearance: m.appearance || { colorPalette: ['#888888'] },
        isReleased: true,
        moves: generateStarterMoves(m),
      };

      const result = await MonsterTemplate.findOneAndUpdate(
        { monsterId: m.monsterId },
        doc,
        { upsert: true, new: true, runValidators: false }
      );
      result ? updated++ : inserted++;
    }
    logger.info(`✅ Monsters: ${updated} upserted`);

    // ─── Seed Items ──────────────────────────────────────────────────────────
    logger.info('Seeding items...');
    for (const item of ITEMS) {
      await Item.findOneAndUpdate({ itemId: item.itemId }, item, { upsert: true, runValidators: false });
    }
    logger.info(`✅ Items: ${ITEMS.length} seeded`);

    // ─── Seed Achievements ───────────────────────────────────────────────────
    const achievements = getAchievements();
    for (const ach of achievements) {
      await Achievement.findOneAndUpdate({ achievementId: ach.achievementId }, ach, { upsert: true, runValidators: false });
    }
    logger.info(`✅ Achievements: ${achievements.length} seeded`);

    // ─── Seed Quests ─────────────────────────────────────────────────────────
    const quests = getQuests();
    for (const q of quests) {
      await Quest.findOneAndUpdate({ questId: q.questId }, q, { upsert: true, runValidators: false });
    }
    logger.info(`✅ Quests: ${quests.length} seeded`);

    // ─── Seed Battle Pass ─────────────────────────────────────────────────────
    await BattlePass.findOneAndUpdate(
      { season: 1 },
      generateBattlePass(1),
      { upsert: true, runValidators: false }
    );
    logger.info('✅ Battle Pass Season 1 seeded');

    // ─── Seed Season ─────────────────────────────────────────────────────────
    await Season.findOneAndUpdate(
      { season: 1 },
      {
        season: 1,
        name: 'Season 1: Origins',
        description: 'The first competitive season of Monster Legends Arena.',
        isActive: true,
        isCurrent: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        ranks: [
          { name: 'Bronze', minRating: 0, maxRating: 699, tier: 1, icon: 'bronze', color: '#CD7F32', rewards: { coins: 500, gems: 10, title: 'Bronze Fighter' } },
          { name: 'Silver', minRating: 700, maxRating: 999, tier: 2, icon: 'silver', color: '#C0C0C0', rewards: { coins: 1000, gems: 20, title: 'Silver Challenger' } },
          { name: 'Gold', minRating: 1000, maxRating: 1299, tier: 3, icon: 'gold', color: '#FFD700', rewards: { coins: 2000, gems: 40, title: 'Gold Contender' } },
          { name: 'Platinum', minRating: 1300, maxRating: 1599, tier: 4, icon: 'platinum', color: '#E5E4E2', rewards: { coins: 3500, gems: 70, title: 'Platinum Warrior' } },
          { name: 'Diamond', minRating: 1600, maxRating: 1999, tier: 5, icon: 'diamond', color: '#B9F2FF', rewards: { coins: 5000, gems: 120, title: 'Diamond Elite' } },
          { name: 'Master', minRating: 2000, maxRating: 2399, tier: 6, icon: 'master', color: '#FF6B35', rewards: { coins: 8000, gems: 200, title: 'Master', badge: 'master_badge' } },
          { name: 'Legendary', minRating: 2400, maxRating: 2799, tier: 7, icon: 'legendary', color: '#FF0000', rewards: { coins: 12000, gems: 350, title: 'Legendary Champion', badge: 'legend_badge' } },
          { name: 'Mythic', minRating: 2800, maxRating: 9999, tier: 8, icon: 'mythic', color: '#9B59B6', rewards: { coins: 20000, gems: 600, title: 'Mythic Overlord', badge: 'mythic_badge' } },
        ],
      },
      { upsert: true, runValidators: false }
    );
    logger.info('✅ Season 1 seeded');

    logger.info('🎮 Database seeding complete!');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    logger.error('Seeding failed:', err);
    process.exit(1);
  }
}

// ─── Generate default moves per monster ─────────────────────────────────────
function generateStarterMoves(monster) {
  const typeToMoves = {
    Fire:    [{ moveId:'ember',     name:'Ember',      type:'Fire',    category:'special', power:40, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A weak fire attack.' },
              { moveId:'flamethrower', name:'Flamethrower', type:'Fire', category:'special', power:90, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:15, description:'A powerful fire stream.', effects:[{type:'burn',chance:10,target:'opponent'}] },
              { moveId:'fire_blast', name:'Fire Blast', type:'Fire',   category:'special', power:120,accuracy:85,  energyCost:3, maxUses:5,  learnedAtLevel:30, description:'A blazing inferno.' },
              { moveId:'inferno_roar',name:'Inferno Roar',type:'Fire', category:'special', power:150,accuracy:90,  energyCost:4, maxUses:5,  learnedAtLevel:45, description:'Signature: Scorches all defences.' }],
    Water:   [{ moveId:'water_gun', name:'Water Gun',  type:'Water',  category:'special', power:40, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A burst of water.' },
              { moveId:'surf',      name:'Surf',       type:'Water',  category:'special', power:90, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:15, description:'A huge wave attack.' },
              { moveId:'hydro_pump',name:'Hydro Pump', type:'Water',  category:'special', power:120,accuracy:80,  energyCost:3, maxUses:5,  learnedAtLevel:30, description:'A powerful water blast.' },
              { moveId:'tidal_wave', name:'Tidal Wave',type:'Water',  category:'special', power:140,accuracy:90,  energyCost:4, maxUses:5,  learnedAtLevel:45, description:'Signature: Overwhelms foes.' }],
    Grass:   [{ moveId:'vine_whip', name:'Vine Whip',  type:'Grass',  category:'physical',power:45, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A whipping vine strike.' },
              { moveId:'razor_leaf',name:'Razor Leaf', type:'Grass',  category:'physical',power:75, accuracy:95,  energyCost:2, maxUses:10, learnedAtLevel:15, description:'Sharp leaves slice foes.', effects:[{type:'bleed',chance:15,target:'opponent'}] },
              { moveId:'solar_beam', name:'Solar Beam', type:'Grass',  category:'special', power:120,accuracy:100, energyCost:3, maxUses:5,  learnedAtLevel:30, description:'A beam of pure solar energy.' },
              { moveId:'forest_fury',name:'Forest Fury',type:'Grass', category:'special', power:145,accuracy:90,  energyCost:4, maxUses:5,  learnedAtLevel:45, description:'Signature: Nature erupts.' }],
    Electric:[{ moveId:'thunder_shock',name:'Thunder Shock',type:'Electric',category:'special',power:40,accuracy:100,energyCost:1,maxUses:15,learnedAtLevel:1, description:'A jolt of electricity.', effects:[{type:'paralysis',chance:10,target:'opponent'}] },
              { moveId:'thunderbolt',name:'Thunderbolt',type:'Electric',category:'special',power:90,accuracy:100,energyCost:2,maxUses:10,learnedAtLevel:15,description:'A strong electric attack.', effects:[{type:'paralysis',chance:10,target:'opponent'}] },
              { moveId:'thunder',   name:'Thunder',    type:'Electric',category:'special',power:120,accuracy:70, energyCost:3,maxUses:5,learnedAtLevel:30,description:'A lightning strike from above.', effects:[{type:'paralysis',chance:30,target:'opponent'}] },
              { moveId:'lightning_storm',name:'Lightning Storm',type:'Electric',category:'special',power:150,accuracy:85,energyCost:4,maxUses:5,learnedAtLevel:45,description:'Signature: Storm of destruction.' }],
    Ice:     [{ moveId:'ice_shard', name:'Ice Shard',  type:'Ice',    category:'physical',power:40, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A shard of ice.' },
              { moveId:'ice_beam',  name:'Ice Beam',   type:'Ice',    category:'special', power:90, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:15, description:'A freezing beam.', effects:[{type:'freeze',chance:10,target:'opponent'}] },
              { moveId:'blizzard',  name:'Blizzard',   type:'Ice',    category:'special', power:120,accuracy:70,  energyCost:3, maxUses:5,  learnedAtLevel:30, description:'A raging blizzard.', effects:[{type:'freeze',chance:20,target:'opponent'}] },
              { moveId:'absolute_zero',name:'Absolute Zero',type:'Ice',category:'special',power:160,accuracy:80, energyCost:5,maxUses:3, learnedAtLevel:50, description:'Signature: Near-instant freeze.' }],
    Dragon:  [{ moveId:'dragon_rage',name:'Dragon Rage',type:'Dragon',category:'special',power:50, accuracy:100,energyCost:1, maxUses:10, learnedAtLevel:1,  description:'A burst of dragon energy.' },
              { moveId:'dragon_pulse',name:'Dragon Pulse',type:'Dragon',category:'special',power:85,accuracy:100,energyCost:2,maxUses:10,learnedAtLevel:20,description:'A powerful dragon blast.' },
              { moveId:'draco_meteor',name:'Draco Meteor',type:'Dragon',category:'special',power:130,accuracy:90,energyCost:3,maxUses:5,learnedAtLevel:38,description:'Meteors of dragon energy.',effects:[{type:'stat_change',chance:100,target:'self',stat:'specialAttack',stages:-2}] },
              { moveId:'dragon_ascent',name:'Dragon Ascent',type:'Dragon',category:'special',power:160,accuracy:90,energyCost:5,maxUses:3,learnedAtLevel:55,description:'Signature: Ascends to peak power.' }],
    Dark:    [{ moveId:'bite',      name:'Bite',       type:'Dark',   category:'physical',power:60, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A vicious bite.', effects:[{type:'flinch',chance:30,target:'opponent'}] },
              { moveId:'crunch',    name:'Crunch',     type:'Dark',   category:'physical',power:80, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:18, description:'A bone-crushing bite.', effects:[{type:'stat_change',chance:20,target:'opponent',stat:'defense',stages:-1}] },
              { moveId:'dark_pulse', name:'Dark Pulse', type:'Dark',   category:'special', power:100,accuracy:100, energyCost:3, maxUses:5,  learnedAtLevel:32, description:'A pulse of dark energy.' },
              { moveId:'void_strike',name:'Void Strike',type:'Dark',  category:'physical',power:150,accuracy:95,  energyCost:4, maxUses:5,  learnedAtLevel:48, description:'Signature: Strikes from the void.' }],
    Light:   [{ moveId:'flash',     name:'Flash',      type:'Light',  category:'special', power:40, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A blinding flash.', effects:[{type:'blind',chance:100,target:'opponent'}] },
              { moveId:'solar_flare',name:'Solar Flare',type:'Light', category:'special', power:85, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:16, description:'An intense solar burst.' },
              { moveId:'holy_beam', name:'Holy Beam',  type:'Light',  category:'special', power:110,accuracy:100, energyCost:3, maxUses:5,  learnedAtLevel:30, description:'A beam of purifying light.' },
              { moveId:'divine_radiance',name:'Divine Radiance',type:'Light',category:'special',power:155,accuracy:90,energyCost:5,maxUses:3,learnedAtLevel:50,description:'Signature: Sears darkness itself.' }],
    Ghost:   [{ moveId:'lick',      name:'Lick',       type:'Ghost',  category:'physical',power:30, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A ghostly lick.', effects:[{type:'paralysis',chance:30,target:'opponent'}] },
              { moveId:'shadow_ball',name:'Shadow Ball',type:'Ghost', category:'special', power:80, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:18, description:'A ball of dark energy.' },
              { moveId:'phantom_force',name:'Phantom Force',type:'Ghost',category:'physical',power:90,accuracy:100,energyCost:2,maxUses:10,learnedAtLevel:28,description:'Vanishes and strikes next turn.' },
              { moveId:'soul_drain',name:'Soul Drain', type:'Ghost',  category:'special', power:130,accuracy:90,  energyCost:4, maxUses:5,  learnedAtLevel:46, description:'Signature: Drains the soul.' }],
    Rock:    [{ moveId:'rock_throw',name:'Rock Throw', type:'Rock',   category:'physical',power:50, accuracy:90,  energyCost:1, maxUses:15, learnedAtLevel:1,  description:'Hurls rocks at the foe.' },
              { moveId:'rock_slide',name:'Rock Slide', type:'Rock',   category:'physical',power:75, accuracy:90,  energyCost:2, maxUses:10, learnedAtLevel:16, description:'An avalanche of rocks.', effects:[{type:'flinch',chance:30,target:'opponent'}] },
              { moveId:'stone_edge',name:'Stone Edge', type:'Rock',   category:'physical',power:100,accuracy:80,  energyCost:3, maxUses:5,  learnedAtLevel:32, description:'Sharply edged stone strikes.' },
              { moveId:'earthquake_slam',name:'Earthquake Slam',type:'Rock',category:'physical',power:145,accuracy:90,energyCost:4,maxUses:5,learnedAtLevel:48,description:'Signature: Splits the earth.' }],
    Steel:   [{ moveId:'metal_claw',name:'Metal Claw', type:'Steel',  category:'physical',power:50, accuracy:95,  energyCost:1, maxUses:15, learnedAtLevel:1,  description:'Slashes with metal claws.', effects:[{type:'stat_change',chance:10,target:'self',stat:'attack',stages:1}] },
              { moveId:'iron_head', name:'Iron Head',  type:'Steel',  category:'physical',power:80, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:16, description:'Slams with an iron head.', effects:[{type:'flinch',chance:30,target:'opponent'}] },
              { moveId:'flash_cannon',name:'Flash Cannon',type:'Steel',category:'special',power:80,accuracy:100,energyCost:2,maxUses:10,learnedAtLevel:24,description:'Fires a beam of steel energy.', effects:[{type:'stat_change',chance:10,target:'opponent',stat:'specialDefense',stages:-1}] },
              { moveId:'titanium_crash',name:'Titanium Crash',type:'Steel',category:'physical',power:150,accuracy:90,energyCost:4,maxUses:5,learnedAtLevel:50,description:'Signature: Unstoppable metal barrage.' }],
    Wind:    [{ moveId:'gust',      name:'Gust',       type:'Wind',   category:'special', power:40, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A strong gust of wind.' },
              { moveId:'air_slash', name:'Air Slash',  type:'Wind',   category:'special', power:75, accuracy:95,  energyCost:2, maxUses:10, learnedAtLevel:16, description:'A blade of wind.', effects:[{type:'flinch',chance:30,target:'opponent'}] },
              { moveId:'hurricane', name:'Hurricane',  type:'Wind',   category:'special', power:110,accuracy:70,  energyCost:3, maxUses:5,  learnedAtLevel:30, description:'A spiralling wind vortex.', effects:[{type:'confusion',chance:30,target:'opponent'}] },
              { moveId:'tempest',   name:'Tempest',    type:'Wind',   category:'special', power:155,accuracy:90,  energyCost:5, maxUses:3,  learnedAtLevel:48, description:'Signature: A cataclysmic storm.' }],
    Poison:  [{ moveId:'poison_sting',name:'Poison Sting',type:'Poison',category:'physical',power:15,accuracy:100,energyCost:1,maxUses:15,learnedAtLevel:1, description:'A poisonous barb.', effects:[{type:'poison',chance:30,target:'opponent'}] },
              { moveId:'sludge_bomb',name:'Sludge Bomb',type:'Poison',category:'special',power:90,accuracy:100,energyCost:2,maxUses:10,learnedAtLevel:18,description:'A bomb of toxic sludge.', effects:[{type:'poison',chance:30,target:'opponent'}] },
              { moveId:'gunk_shot', name:'Gunk Shot', type:'Poison',  category:'physical',power:120,accuracy:80, energyCost:3, maxUses:5, learnedAtLevel:34, description:'Fires toxic debris.', effects:[{type:'poison',chance:30,target:'opponent'}] },
              { moveId:'toxic_nova',name:'Toxic Nova', type:'Poison', category:'special', power:140,accuracy:90,  energyCost:4, maxUses:5, learnedAtLevel:50, description:'Signature: Venom that never fades.' }],
    Psychic: [{ moveId:'confusion',  name:'Confusion',  type:'Psychic',category:'special',power:50, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A burst of psychic energy.', effects:[{type:'confusion',chance:10,target:'opponent'}] },
              { moveId:'psybeam',    name:'Psybeam',    type:'Psychic',category:'special',power:65, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:16, description:'A beam of psychic rays.', effects:[{type:'confusion',chance:10,target:'opponent'}] },
              { moveId:'psychic',    name:'Psychic',    type:'Psychic',category:'special',power:90, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:28, description:'A powerful psychic blast.', effects:[{type:'stat_change',chance:10,target:'opponent',stat:'specialDefense',stages:-1}] },
              { moveId:'mind_shatter',name:'Mind Shatter',type:'Psychic',category:'special',power:145,accuracy:90,energyCost:4,maxUses:5,learnedAtLevel:50,description:'Signature: Shatters the mind entirely.' }],
    Normal:  [{ moveId:'tackle',    name:'Tackle',     type:'Normal', category:'physical',power:40, accuracy:100, energyCost:1, maxUses:15, learnedAtLevel:1,  description:'A basic body tackle.' },
              { moveId:'body_slam', name:'Body Slam',  type:'Normal', category:'physical',power:85, accuracy:100, energyCost:2, maxUses:10, learnedAtLevel:16, description:'Slams the body into the foe.', effects:[{type:'paralysis',chance:30,target:'opponent'}] },
              { moveId:'hyper_beam',name:'Hyper Beam', type:'Normal', category:'special', power:150,accuracy:90,  energyCost:4, maxUses:5,  learnedAtLevel:38, description:'A devastating energy beam.' },
              { moveId:'final_strike',name:'Final Strike',type:'Normal',category:'physical',power:180,accuracy:80,energyCost:5,maxUses:3,learnedAtLevel:55,description:'Signature: The ultimate blow.' }],
  };

  const type = monster.types.primary;
  const moveset = typeToMoves[type] || typeToMoves['Normal'];
  const level = 1;
  return moveset.map((move, i) => ({ ...move, learnedAtLevel: [1, 15, 30, 45][i] || 1 }));
}

// ─── Achievements ────────────────────────────────────────────────────────────
function getAchievements() {
  return [
    { achievementId:'first_catch', name:'First Catch', description:'Catch your first monster.', category:'collection', points:10, rewards:{ coins:200, gems:5 }, requirements:[{type:'monsters_caught',value:1}] },
    { achievementId:'catch_10', name:'Monster Collector', description:'Catch 10 monsters.', category:'collection', points:25, rewards:{ coins:500, gems:10 }, requirements:[{type:'monsters_caught',value:10}] },
    { achievementId:'catch_50', name:'Monster Enthusiast', description:'Catch 50 monsters.', category:'collection', points:75, rewards:{ coins:2000, gems:30, title:'Collector' }, requirements:[{type:'monsters_caught',value:50}] },
    { achievementId:'catch_100', name:'Monster Master', description:'Catch 100 monsters.', category:'collection', points:150, rewards:{ coins:5000, gems:80, title:'Monster Master', badge:'collection_badge' }, requirements:[{type:'monsters_caught',value:100}] },
    { achievementId:'catch_shiny', name:'Shiny Hunter', description:'Catch your first shiny monster.', category:'collection', points:100, rewards:{ coins:2000, gems:50, title:'Shiny Hunter' }, requirements:[{type:'shiny_caught',value:1}] },
    { achievementId:'first_win', name:'First Victory', description:'Win your first battle.', category:'battle', points:10, rewards:{ coins:200, gems:5 }, requirements:[{type:'wins',value:1}] },
    { achievementId:'win_10', name:'Battler', description:'Win 10 battles.', category:'battle', points:25, rewards:{ coins:500, gems:10 }, requirements:[{type:'wins',value:10}] },
    { achievementId:'win_100', name:'Champion', description:'Win 100 battles.', category:'battle', points:100, rewards:{ coins:3000, gems:50, title:'Champion' }, requirements:[{type:'wins',value:100}] },
    { achievementId:'win_streak_5', name:'On Fire', description:'Win 5 battles in a row.', category:'battle', points:50, rewards:{ coins:1000, gems:20 }, requirements:[{type:'win_streak',value:5}] },
    { achievementId:'win_streak_10', name:'Unstoppable', description:'Win 10 battles in a row.', category:'battle', points:150, rewards:{ coins:3000, gems:60, title:'Unstoppable' }, requirements:[{type:'win_streak',value:10}] },
    { achievementId:'first_evolution', name:'The Next Level', description:'Evolve your first monster.', category:'collection', points:20, rewards:{ coins:400, gems:10 }, requirements:[{type:'evolutions',value:1}] },
    { achievementId:'evolve_10', name:'Evolution Expert', description:'Evolve 10 monsters.', category:'collection', points:75, rewards:{ coins:2000, gems:30 }, requirements:[{type:'evolutions',value:10}] },
    { achievementId:'level_10', name:'Growing Strong', description:'Reach trainer level 10.', category:'exploration', points:30, rewards:{ coins:500, gems:15 }, requirements:[{type:'level',value:10}] },
    { achievementId:'level_50', name:'Veteran Trainer', description:'Reach trainer level 50.', category:'exploration', points:200, rewards:{ coins:10000, gems:100, title:'Veteran' }, requirements:[{type:'level',value:50}] },
    { achievementId:'level_100', name:'Legendary Trainer', description:'Reach trainer level 100.', category:'exploration', points:500, rewards:{ coins:25000, gems:250, title:'Legendary Trainer', badge:'legend_trainer_badge' }, requirements:[{type:'level',value:100}] },
    { achievementId:'join_guild', name:'Team Player', description:'Join a guild.', category:'social', points:15, rewards:{ coins:300, gems:5 }, requirements:[{type:'join_guild',value:1}] },
    { achievementId:'pvp_first', name:'Arena Debut', description:'Complete your first PvP battle.', category:'battle', points:20, rewards:{ coins:400, gems:10, tokens:5 }, requirements:[{type:'pvp_battles',value:1}] },
    { achievementId:'pvp_100', name:'Arena Legend', description:'Complete 100 PvP battles.', category:'battle', points:200, rewards:{ coins:8000, gems:120, tokens:50, title:'Arena Legend' }, requirements:[{type:'pvp_battles',value:100}] },
    { achievementId:'beat_boss', name:'Boss Slayer', description:'Defeat your first regional boss.', category:'exploration', points:50, rewards:{ coins:1500, gems:25 }, requirements:[{type:'bosses_defeated',value:1}] },
    { achievementId:'tournament_win', name:'Tournament Victor', description:'Win a tournament.', category:'tournament', points:250, rewards:{ coins:10000, gems:200, title:'Tournament Victor', badge:'tournament_badge' }, requirements:[{type:'tournament_wins',value:1}] },
  ];
}

// ─── Quests ─────────────────────────────────────────────────────────────────
function getQuests() {
  const daily = [
    { questId:'daily_battle_3', name:'Daily Battles', description:'Win 3 battles today.', type:'daily', category:'battle', isRepeatable:true, cooldownHours:24, objectives:[{objectiveId:'win_3',description:'Win 3 battles',type:'win_battles',count:3}], rewards:{coins:300, gems:5, battlePassXp:50, experience:100} },
    { questId:'daily_catch_1', name:'Wild Encounter', description:'Catch 1 wild monster today.', type:'daily', category:'catch', isRepeatable:true, cooldownHours:24, objectives:[{objectiveId:'catch_1',description:'Catch 1 monster',type:'catch_monsters',count:1}], rewards:{coins:200, gems:3, battlePassXp:30, experience:80} },
    { questId:'daily_explore', name:'Explorer', description:'Visit 2 different regions today.', type:'daily', category:'explore', isRepeatable:true, cooldownHours:24, objectives:[{objectiveId:'visit_2',description:'Visit 2 regions',type:'visit_regions',count:2}], rewards:{coins:150, gems:2, battlePassXp:20, experience:60} },
    { questId:'daily_pvp_1', name:'PvP Challenge', description:'Complete 1 PvP battle today.', type:'daily', category:'battle', isRepeatable:true, cooldownHours:24, objectives:[{objectiveId:'pvp_1',description:'Complete 1 PvP battle',type:'pvp_battles',count:1}], rewards:{coins:250, gems:5, tokens:2, battlePassXp:40, experience:90} },
    { questId:'daily_login', name:'Daily Login', description:'Log in today.', type:'daily', category:'special', isRepeatable:true, cooldownHours:24, objectives:[{objectiveId:'login',description:'Log in',type:'login',count:1}], rewards:{coins:100, gems:1, battlePassXp:10, experience:50} },
  ];

  const story = [
    { questId:'story_1_1', name:'A New Journey', description:'Complete your first battle against a wild monster.', type:'story', chapter:1, order:1, objectives:[{objectiveId:'wild_battle',description:'Win a wild battle',type:'win_wild_battles',count:1}], rewards:{coins:500, gems:10, experience:200, unlockQuest:'story_1_2'} },
    { questId:'story_1_2', name:'Getting Stronger', description:'Catch your first monster.', type:'story', chapter:1, order:2, prerequisites:['story_1_1'], objectives:[{objectiveId:'catch_first',description:'Catch a monster',type:'catch_monsters',count:1}], rewards:{coins:750, gems:15, experience:300, unlockRegion:'forest_glen', unlockQuest:'story_1_3'} },
    { questId:'story_1_3', name:'Trainer Challenge', description:'Defeat the Starter Town trainer.', type:'story', chapter:1, order:3, prerequisites:['story_1_2'], objectives:[{objectiveId:'beat_npc_1',description:'Defeat Trainer Rex',type:'defeat_npc',target:{npcId:'npc_rex'}}], rewards:{coins:1000, gems:20, experience:500, unlockQuest:'story_2_1'} },
    { questId:'story_2_1', name:'Into the Forest', description:'Explore Forest Glen and catch 3 monsters.', type:'story', chapter:2, order:1, prerequisites:['story_1_3'], objectives:[{objectiveId:'catch_forest',description:'Catch 3 Forest monsters',type:'catch_monsters',count:3}], rewards:{coins:1500, gems:25, experience:800} },
    { questId:'story_2_2', name:'Forest Boss', description:'Defeat the Forest Glen Boss.', type:'story', chapter:2, order:2, prerequisites:['story_2_1'], objectives:[{objectiveId:'beat_boss_2',description:'Defeat Forest Guardian',type:'defeat_boss',target:{bossId:'boss_002'}}], rewards:{coins:3000, gems:50, experience:1500, unlockRegion:'fire_mountain'} },
  ];

  const weekly = [
    { questId:'weekly_battles', name:'Weekly Warrior', description:'Win 20 battles this week.', type:'weekly', category:'battle', isRepeatable:true, cooldownHours:168, objectives:[{objectiveId:'win_20',description:'Win 20 battles',type:'win_battles',count:20}], rewards:{coins:2000, gems:30, tokens:10, battlePassXp:300, experience:1000} },
    { questId:'weekly_pvp', name:'Weekly PvP', description:'Win 10 PvP battles this week.', type:'weekly', category:'battle', isRepeatable:true, cooldownHours:168, objectives:[{objectiveId:'pvp_win_10',description:'Win 10 PvP battles',type:'pvp_wins',count:10}], rewards:{coins:3000, gems:50, tokens:20, battlePassXp:400, experience:1500} },
    { questId:'weekly_evolve', name:'Evolution Week', description:'Evolve 3 monsters this week.', type:'weekly', category:'collection', isRepeatable:true, cooldownHours:168, objectives:[{objectiveId:'evolve_3',description:'Evolve 3 monsters',type:'evolve_monsters',count:3}], rewards:{coins:2500, gems:40, battlePassXp:350, experience:1200} },
  ];

  return [...daily, ...story, ...weekly];
}

// ─── Battle Pass ─────────────────────────────────────────────────────────────
function generateBattlePass(season) {
  const levels = [];
  for (let i = 1; i <= 100; i++) {
    levels.push({
      level: i,
      xpRequired: i * 100,
      freeReward: {
        coins: i % 10 === 0 ? 1000 : 100,
        gems: i % 25 === 0 ? 50 : 0,
        tokens: i % 5 === 0 ? 5 : 0,
        items: i % 15 === 0 ? [{ itemId: 'ball_ultra', quantity: 2 }] : i % 7 === 0 ? [{ itemId: 'potion_max', quantity: 1 }] : [],
        title: i === 50 ? 'Season Warrior' : i === 100 ? 'Season Legend' : null,
      },
      premiumReward: {
        coins: i % 10 === 0 ? 3000 : 300,
        gems: i % 5 === 0 ? 20 : 5,
        tokens: i % 3 === 0 ? 10 : 3,
        items: i % 10 === 0 ? [{ itemId: 'ball_master', quantity: 1 }] : [{ itemId: 'potion_max', quantity: 1 }],
        title: i === 25 ? 'Premium Warrior' : i === 50 ? 'Premium Champion' : i === 100 ? 'Premium Legend' : null,
        exclusive: [25, 50, 75, 100].includes(i),
      },
    });
  }

  return {
    season,
    name: `Season ${season}: Origins`,
    description: 'The first Battle Pass of Monster Legends Arena.',
    theme: 'origins',
    levels,
    maxLevel: 100,
    premiumPrice: { gems: 800 },
    premiumPlusPrice: { gems: 2000 },
    startDate: new Date(),
    endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    isActive: true,
    isCurrent: true,
  };
}

seedDatabase();
