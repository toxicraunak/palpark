const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

let io;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Auth middleware for all sockets
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        socket.user = null;
        return next(); // allow guest connections
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password').lean();
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      socket.userId = user._id.toString();
      next();
    } catch (err) {
      socket.user = null;
      next(); // don't block guests
    }
  });

  // Register namespaces
  require('./battleSocket')(io);
  require('./matchmakingSocket')(io);
  require('./chatSocket')(io);
  require('./worldSocket')(io);

  // Connection tracking
  io.on('connection', (socket) => {
    const userId = socket.userId || 'guest';
    logger.debug(`Socket connected: ${socket.id} (user: ${userId})`);

    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      User.findByIdAndUpdate(socket.userId, { lastActive: new Date() }).exec();
    }

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });

    socket.on('error', (err) => {
      logger.error(`Socket error [${socket.id}]:`, err);
    });

    socket.on('ping_server', (cb) => {
      if (typeof cb === 'function') cb({ pong: true, ts: Date.now() });
    });
  });

  logger.info('✅ Socket.IO initialized');
  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function emitToUser(userId, event, data) {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

function emitToBattle(battleId, event, data) {
  if (!io) return;
  io.to(`battle:${battleId}`).emit(event, data);
}

function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

module.exports = { initializeSocket, getIO, emitToUser, emitToBattle, emitToRoom };
