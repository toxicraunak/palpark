const { createClient } = require('redis');
const logger = require('../utils/logger');

let client = null;

const connectRedis = async () => {
  try {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis max retries reached');
            return new Error('Redis max retries reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    client.on('error', (err) => logger.error('Redis error:', err));
    client.on('connect', () => logger.info('✅ Redis connected'));
    client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

    await client.connect();
    return client;
  } catch (error) {
    logger.warn('Redis connection failed, running without cache:', error.message);
    return null;
  }
};

const getRedis = () => client;

// Cache helpers
const cache = {
  async get(key) {
    if (!client) return null;
    try {
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch { return null; }
  },

  async set(key, value, ttlSeconds = 300) {
    if (!client) return;
    try {
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch { /* silent */ }
  },

  async del(key) {
    if (!client) return;
    try {
      await client.del(key);
    } catch { /* silent */ }
  },

  async delPattern(pattern) {
    if (!client) return;
    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) await client.del(keys);
    } catch { /* silent */ }
  },

  async incr(key) {
    if (!client) return 0;
    return await client.incr(key);
  },

  async expire(key, seconds) {
    if (!client) return;
    await client.expire(key, seconds);
  },

  async hSet(key, field, value) {
    if (!client) return;
    await client.hSet(key, field, JSON.stringify(value));
  },

  async hGet(key, field) {
    if (!client) return null;
    const val = await client.hGet(key, field);
    return val ? JSON.parse(val) : null;
  },

  async hGetAll(key) {
    if (!client) return {};
    const data = await client.hGetAll(key);
    const result = {};
    for (const [k, v] of Object.entries(data)) {
      result[k] = JSON.parse(v);
    }
    return result;
  },

  async lPush(key, value) {
    if (!client) return;
    await client.lPush(key, JSON.stringify(value));
  },

  async lRange(key, start, end) {
    if (!client) return [];
    const items = await client.lRange(key, start, end);
    return items.map(i => JSON.parse(i));
  },

  async publish(channel, message) {
    if (!client) return;
    await client.publish(channel, JSON.stringify(message));
  },
};

module.exports = { connectRedis, getRedis, cache };
