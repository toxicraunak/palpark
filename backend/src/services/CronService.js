const cron = require('node-cron');
const logger = require('../utils/logger');
const User = require('../models/User');
const { cache } = require('../config/redis');

function startCronJobs() {
  // Refresh leaderboard cache every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      await cache.delPattern('lb:*');
      logger.debug('Leaderboard cache cleared');
    } catch (err) { logger.error('Leaderboard refresh error:', err); }
  });

  // Midnight reset: clear weekly quest progress, update streaks
  cron.schedule('0 0 * * *', async () => {
    try {
      logger.info('Running daily reset...');
      // Reset stale user sessions count
      const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await User.updateMany(
        { lastActive: { $lt: staleDate }, 'dailyRewards.streak': { $gt: 0 } },
        { $set: { 'dailyRewards.streak': 0 } }
      );
      logger.info('Daily reset complete');
    } catch (err) { logger.error('Daily reset error:', err); }
  });

  // Weekly: reset weekly PvP stats
  cron.schedule('0 0 * * 1', async () => {
    try {
      logger.info('Running weekly reset...');
      await cache.delPattern('weekly:*');
      logger.info('Weekly reset complete');
    } catch (err) { logger.error('Weekly reset error:', err); }
  });

  // Every hour: clean up expired marketplace listings
  cron.schedule('0 * * * *', async () => {
    try {
      const Marketplace = require('../models/Marketplace');
      const PlayerMonster = require('../models/PlayerMonster');
      const expired = await Marketplace.find({ status: 'active', expiresAt: { $lt: new Date() } });
      for (const listing of expired) {
        listing.status = 'expired';
        if (listing.listingType === 'monster' && listing.monster) {
          await PlayerMonster.findByIdAndUpdate(listing.monster, { isForTrade: false });
        }
        await listing.save();
      }
      if (expired.length > 0) logger.info(`Expired ${expired.length} marketplace listings`);
    } catch (err) { logger.error('Marketplace cleanup error:', err); }
  });

  logger.info('✅ Cron jobs started');
}

module.exports = { startCronJobs };
