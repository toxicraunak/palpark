// ─── matchmakingSocket.js ─────────────────────────────────────────────────────
const BattleManager = require('../battle/BattleManager');
const User = require('../models/User');
const logger = require('../utils/logger');

const queues = {
  casual: [],
  ranked: [],
};

function matchmakingSocket(io) {
  io.on('connection', (socket) => {
    // ─── Join matchmaking queue ──────────────────────────────────────────────
    socket.on('matchmaking:join', async ({ mode = 'casual' }, callback) => {
      if (!socket.userId) return callback?.({ error: 'Must be logged in' });

      const validModes = ['casual', 'ranked'];
      if (!validModes.includes(mode)) return callback?.({ error: 'Invalid mode' });

      // Remove from any existing queue
      for (const q of Object.values(queues)) {
        const idx = q.findIndex(e => e.userId === socket.userId);
        if (idx !== -1) q.splice(idx, 1);
      }

      const user = await User.findById(socket.userId).lean();
      if (!user) return callback?.({ error: 'User not found' });

      const entry = {
        userId: socket.userId,
        username: user.username,
        socketId: socket.id,
        rating: user.ranking.pvpRating || 1000,
        level: user.gameData.level,
        joinedAt: Date.now(),
        mode,
      };

      queues[mode].push(entry);
      socket.matchmakingMode = mode;

      callback?.({ success: true, message: 'Joined queue', queueSize: queues[mode].length });
      socket.emit('matchmaking:queued', { position: queues[mode].length, mode });
      logger.debug(`${user.username} joined ${mode} queue (size: ${queues[mode].length})`);

      // Try to match
      tryMatch(io, mode);
    });

    // ─── Leave queue ─────────────────────────────────────────────────────────
    socket.on('matchmaking:leave', (callback) => {
      if (!socket.userId) return callback?.({ error: 'Not authenticated' });
      for (const q of Object.values(queues)) {
        const idx = q.findIndex(e => e.userId === socket.userId);
        if (idx !== -1) q.splice(idx, 1);
      }
      callback?.({ success: true, message: 'Left queue' });
    });

    socket.on('disconnect', () => {
      if (socket.userId) {
        for (const q of Object.values(queues)) {
          const idx = q.findIndex(e => e.userId === socket.userId);
          if (idx !== -1) q.splice(idx, 1);
        }
      }
    });
  });

  // Queue processing every 2 seconds
  setInterval(() => {
    for (const mode of Object.keys(queues)) {
      tryMatch(io, mode);
    }
  }, 2000);
}

async function tryMatch(io, mode) {
  const queue = queues[mode];
  if (queue.length < 2) return;

  // For ranked: match by closest rating within ±200 window
  if (mode === 'ranked') {
    for (let i = 0; i < queue.length - 1; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const ratingDiff = Math.abs(queue[i].rating - queue[j].rating);
        const waitTime = (Date.now() - queue[i].joinedAt) / 1000;
        const window = Math.min(200 + waitTime * 20, 1000);
        if (ratingDiff <= window) {
          const [a, b] = [queue[i], queue[j]];
          queue.splice(j, 1);
          queue.splice(i, 1);
          await createMatch(io, a, b, mode);
          return;
        }
      }
    }
  } else {
    // Casual: just take first two
    const a = queue.shift();
    const b = queue.shift();
    await createMatch(io, a, b, mode);
  }
}

async function createMatch(io, playerA, playerB, mode) {
  try {
    const result = await BattleManager.createPvPBattle(playerA.userId, playerB.userId, { mode });

    const matchData = {
      battleId: result.battleId,
      mode,
      opponent: null,
    };

    // Notify playerA
    io.to(`user:${playerA.userId}`).emit('matchmaking:matched', {
      ...matchData,
      opponent: { username: playerB.username, rating: playerB.rating },
      side: 'A',
    });

    // Notify playerB
    io.to(`user:${playerB.userId}`).emit('matchmaking:matched', {
      ...matchData,
      opponent: { username: playerA.username, rating: playerA.rating },
      side: 'B',
    });

    logger.info(`Match created: ${playerA.username} vs ${playerB.username} [${mode}] → ${result.battleId}`);
  } catch (err) {
    logger.error('Failed to create match:', err);
    // Put them back
    queues[mode].unshift(playerA, playerB);
  }
}

// ─── chatSocket.js ────────────────────────────────────────────────────────────
function chatSocket(io) {
  const chatHistory = new Map(); // channel -> last 50 messages

  io.on('connection', (socket) => {
    socket.on('chat:join', ({ channel = 'global' }) => {
      socket.join(`chat:${channel}`);
      const history = chatHistory.get(channel) || [];
      socket.emit('chat:history', { channel, messages: history.slice(-50) });
    });

    socket.on('chat:leave', ({ channel }) => {
      socket.leave(`chat:${channel}`);
    });

    socket.on('chat:message', ({ channel = 'global', message }, callback) => {
      if (!socket.userId) return callback?.({ error: 'Must be logged in to chat' });
      if (!message || message.trim().length === 0) return callback?.({ error: 'Empty message' });
      if (message.length > 200) return callback?.({ error: 'Message too long (max 200 chars)' });

      const msg = {
        id: Date.now().toString(),
        userId: socket.userId,
        username: socket.user?.username || 'Unknown',
        avatar: socket.user?.profile?.avatar,
        message: message.trim().substring(0, 200),
        channel,
        ts: Date.now(),
      };

      if (!chatHistory.has(channel)) chatHistory.set(channel, []);
      const history = chatHistory.get(channel);
      history.push(msg);
      if (history.length > 100) history.shift();

      io.to(`chat:${channel}`).emit('chat:message', msg);
      callback?.({ success: true });
    });

    socket.on('chat:battle_message', ({ battleId, message }) => {
      if (!socket.userId || !battleId || !message) return;
      io.to(`battle:${battleId}`).emit('chat:battle_message', {
        userId: socket.userId,
        username: socket.user?.username,
        message: message.substring(0, 100),
        ts: Date.now(),
      });
    });
  });
}

// ─── worldSocket.js ───────────────────────────────────────────────────────────
function worldSocket(io) {
  const onlineInRegion = new Map();

  io.on('connection', (socket) => {
    socket.on('world:enter_region', ({ regionId }) => {
      if (socket.currentRegion) {
        socket.leave(`region:${socket.currentRegion}`);
        const prev = onlineInRegion.get(socket.currentRegion) || new Set();
        prev.delete(socket.userId);
        onlineInRegion.set(socket.currentRegion, prev);
        io.to(`region:${socket.currentRegion}`).emit('world:player_left', { userId: socket.userId, username: socket.user?.username });
      }

      socket.join(`region:${regionId}`);
      socket.currentRegion = regionId;

      if (!onlineInRegion.has(regionId)) onlineInRegion.set(regionId, new Set());
      if (socket.userId) onlineInRegion.get(regionId).add(socket.userId);

      socket.to(`region:${regionId}`).emit('world:player_joined', {
        userId: socket.userId,
        username: socket.user?.username,
        level: socket.user?.gameData?.level,
        avatar: socket.user?.profile?.avatar,
      });

      socket.emit('world:region_data', {
        regionId,
        playersOnline: onlineInRegion.get(regionId)?.size || 0,
      });
    });

    socket.on('world:challenge', ({ targetUserId }) => {
      if (!socket.userId) return;
      io.to(`user:${targetUserId}`).emit('world:challenge_received', {
        from: socket.userId,
        fromUsername: socket.user?.username,
        fromLevel: socket.user?.gameData?.level,
      });
    });

    socket.on('world:challenge_response', ({ challengerId, accepted }) => {
      if (!socket.userId) return;
      io.to(`user:${challengerId}`).emit('world:challenge_response', {
        accepted,
        from: socket.userId,
        username: socket.user?.username,
      });
    });

    socket.on('disconnect', () => {
      if (socket.currentRegion) {
        const prev = onlineInRegion.get(socket.currentRegion) || new Set();
        prev.delete(socket.userId);
        io.to(`region:${socket.currentRegion}`).emit('world:player_left', { userId: socket.userId });
      }
    });
  });
}

module.exports = matchmakingSocket;
module.exports.chatSocket = chatSocket;
module.exports.worldSocket = worldSocket;
