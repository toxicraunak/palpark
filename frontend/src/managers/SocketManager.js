import { io } from 'socket.io-client';

export class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this._handlers = new Map();
    this._reconnectAttempts = 0;
    this._maxReconnect = 10;
  }

  connect(token) {
    if (this.socket?.connected) return;

    const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: this._maxReconnect,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      this._reconnectAttempts = 0;
      console.log('[Socket] Connected:', this.socket.id);
      this._emit_local('connected', { id: this.socket.id });
      // Re-join chat
      this.joinChat('global');
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.log('[Socket] Disconnected:', reason);
      this._emit_local('disconnected', { reason });
    });

    this.socket.on('reconnect_attempt', (n) => {
      this._reconnectAttempts = n;
      console.log('[Socket] Reconnect attempt', n);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[Socket] Reconnect failed');
      this._emit_local('reconnect_failed', {});
    });

    this.socket.on('connect_error', err => {
      console.warn('[Socket] Connect error:', err.message);
    });

    // Forward all server events to local listeners
    const events = [
      'battle:state_update','battle:ended','battle:emote','battle:opponent_disconnected',
      'matchmaking:queued','matchmaking:matched',
      'chat:message','chat:history','chat:battle_message',
      'world:player_joined','world:player_left','world:challenge_received','world:challenge_response','world:region_data',
      'notification',
    ];
    events.forEach(ev => {
      this.socket.on(ev, (data) => this._emit_local(ev, data));
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.isConnected = false;
  }

  // ─── Battle ──────────────────────────────────────────────────────────────
  joinBattle(battleId, cb) { this.socket?.emit('battle:join', { battleId }, cb); }
  sendBattleAction(battleId, action, cb) { this.socket?.emit('battle:action', { battleId, action }, cb); }
  forfeitBattle(battleId, cb) { this.socket?.emit('battle:forfeit', { battleId }, cb); }
  sendEmote(battleId, emoteId) { this.socket?.emit('battle:emote', { battleId, emoteId }); }

  // ─── Matchmaking ──────────────────────────────────────────────────────────
  joinMatchmaking(mode, cb) { this.socket?.emit('matchmaking:join', { mode }, cb); }
  leaveMatchmaking(cb) { this.socket?.emit('matchmaking:leave', cb); }

  // ─── Chat ─────────────────────────────────────────────────────────────────
  joinChat(channel) { this.socket?.emit('chat:join', { channel }); }
  leaveChat(channel) { this.socket?.emit('chat:leave', { channel }); }
  sendChat(channel, message, cb) { this.socket?.emit('chat:message', { channel, message }, cb); }
  sendBattleChat(battleId, message) { this.socket?.emit('chat:battle_message', { battleId, message }); }

  // ─── World ────────────────────────────────────────────────────────────────
  enterRegion(regionId) { this.socket?.emit('world:enter_region', { regionId }); }
  challengePlayer(targetUserId) { this.socket?.emit('world:challenge', { targetUserId }); }
  respondChallenge(challengerId, accepted) { this.socket?.emit('world:challenge_response', { challengerId, accepted }); }

  // ─── Subscriptions ────────────────────────────────────────────────────────
  on(event, callback) {
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(callback);
    return () => this._handlers.get(event)?.delete(callback);
  }

  off(event, callback) { this._handlers.get(event)?.delete(callback); }

  _emit_local(event, data) {
    this._handlers.get(event)?.forEach(fn => fn(data));
    this._handlers.get('*')?.forEach(fn => fn(event, data));
  }

  ping(cb) { this.socket?.emit('ping_server', cb); }
}
