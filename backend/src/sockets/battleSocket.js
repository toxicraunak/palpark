const BattleManager = require('../battle/BattleManager');
const logger = require('../utils/logger');

module.exports = function (io) {
  io.on('connection', (socket) => {
    // ─── Join battle room ────────────────────────────────────────────────────
    socket.on('battle:join', ({ battleId }, callback) => {
      if (!battleId) return callback?.({ error: 'Battle ID required' });

      const engine = BattleManager.getEngine(battleId);
      if (!engine) return callback?.({ error: 'Battle not found' });

      const isParticipant = socket.userId &&
        (engine.playerA?.userId === socket.userId || engine.playerB?.userId === socket.userId);
      const canSpectate = !isParticipant;

      socket.join(`battle:${battleId}`);
      socket.currentBattle = battleId;

      if (isParticipant) {
        engine.playerA.userId === socket.userId
          ? (engine.playerA.isConnected = true)
          : (engine.playerB.isConnected = true);
      }

      const state = engine.getBattleState();
      callback?.({ success: true, state, isSpectator: canSpectate && !isParticipant });
      logger.debug(`${socket.userId || 'guest'} joined battle ${battleId}`);
    });

    // ─── Submit action ───────────────────────────────────────────────────────
    socket.on('battle:action', ({ battleId, action }, callback) => {
      if (!socket.userId) return callback?.({ error: 'Must be logged in to battle' });
      if (!battleId || !action) return callback?.({ error: 'Invalid action' });

      try {
        const result = BattleManager.submitAction(battleId, socket.userId, action);

        // Broadcast updated state to all in battle room
        io.to(`battle:${battleId}`).emit('battle:state_update', result);

        if (result.status === 'completed') {
          io.to(`battle:${battleId}`).emit('battle:ended', {
            winnerSide: result.winnerSide,
            winner: result.winner,
            reason: result.reason,
            rewards: result.rewards,
          });
        }

        callback?.({ success: true });
      } catch (err) {
        logger.error('Battle action error:', err.message);
        callback?.({ error: err.message });
      }
    });

    // ─── Forfeit ─────────────────────────────────────────────────────────────
    socket.on('battle:forfeit', ({ battleId }, callback) => {
      if (!socket.userId) return callback?.({ error: 'Not authenticated' });
      try {
        const result = BattleManager.forfeitBattle(battleId, socket.userId);
        io.to(`battle:${battleId}`).emit('battle:ended', {
          winnerSide: result.winnerSide,
          reason: 'forfeit',
          message: `${socket.user?.username} forfeited!`,
        });
        callback?.({ success: true });
      } catch (err) {
        callback?.({ error: err.message });
      }
    });

    // ─── Emote ───────────────────────────────────────────────────────────────
    socket.on('battle:emote', ({ battleId, emoteId }) => {
      if (!socket.userId || !battleId) return;
      io.to(`battle:${battleId}`).emit('battle:emote', {
        userId: socket.userId,
        username: socket.user?.username,
        emoteId,
        ts: Date.now(),
      });
    });

    // ─── Disconnect handling ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.currentBattle) {
        const engine = BattleManager.getEngine(socket.currentBattle);
        if (engine && socket.userId) {
          if (engine.playerA?.userId === socket.userId) engine.playerA.isConnected = false;
          if (engine.playerB?.userId === socket.userId) engine.playerB.isConnected = false;

          // Notify opponent
          socket.to(`battle:${socket.currentBattle}`).emit('battle:opponent_disconnected', {
            userId: socket.userId,
            username: socket.user?.username,
          });

          // Auto-timeout after 30 seconds if not reconnected
          setTimeout(async () => {
            const eng = BattleManager.getEngine(socket.currentBattle);
            if (eng && eng.status === 'active') {
              const stillDisconnected = eng.playerA?.userId === socket.userId
                ? !eng.playerA.isConnected
                : !eng.playerB.isConnected;
              if (stillDisconnected) {
                try {
                  const result = await BattleManager.forfeitBattle(socket.currentBattle, socket.userId);
                  io.to(`battle:${socket.currentBattle}`).emit('battle:ended', {
                    winnerSide: result.winnerSide,
                    reason: 'disconnect_timeout',
                    message: `${socket.user?.username} disconnected.`,
                  });
                } catch { /* already ended */ }
              }
            }
          }, 30000);
        }
      }
    });
  });
};
