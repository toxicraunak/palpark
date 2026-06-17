require('dotenv').config();
const http = require('http');
const app = require('./app');
const { initializeSocket } = require('./sockets');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { startCronJobs } = require('./services/CronService');

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to databases
    await connectDB();
    if (process.env.REDIS_URL) {
      await connectRedis();
    } else {
      logger.warn('⚠️  REDIS_URL not set — running without Redis cache (this is fine for small deployments).');
    }

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize Socket.IO
    initializeSocket(server);

    // Start cron jobs
    startCronJobs();

    // Start listening
    server.listen(PORT, () => {
      logger.info(`🎮 Monster Legends Arena server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
      logger.info(`📡 WebSocket ready`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received, shutting down gracefully...');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
