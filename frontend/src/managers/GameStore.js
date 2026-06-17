/**
 * GameStore — centralised reactive state for the client
 */
export class GameStore {
  constructor() {
    this._state = {
      user: null,
      token: null,
      isLoggedIn: false,
      isOnline: navigator.onLine,
      activeTeam: [],
      inventory: { slots: [], totalItems: 0 },
      currentBattle: null,
      currentRegion: 'starter_town',
      monsterBox: [],
      notifications: [],
      settings: {
        soundEnabled: true,
        musicEnabled: true,
        graphicsQuality: 'high',
        battleAnimations: true,
        showDamageNumbers: true,
      },
      matchmaking: { inQueue: false, mode: null, queueTime: 0 },
      guild: null,
      battlePass: null,
      season: null,
      unreadNotifications: 0,
    };

    this._listeners = new Map();

    // Online/offline tracking
    window.addEventListener('online',  () => this.set('isOnline', true));
    window.addEventListener('offline', () => this.set('isOnline', false));

    // Restore from localStorage
    this._restoreSession();
  }

  // ─── Core Get/Set ─────────────────────────────────────────────────────────
  get(key) { return this._state[key]; }

  set(key, value) {
    const prev = this._state[key];
    this._state[key] = value;
    this._notify(key, value, prev);
  }

  update(key, updater) {
    const prev = this._state[key];
    this._state[key] = updater(prev);
    this._notify(key, this._state[key], prev);
  }

  patch(updates) {
    for (const [k, v] of Object.entries(updates)) {
      this._state[k] = v;
      this._notify(k, v, undefined);
    }
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────
  on(key, callback) {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key).add(callback);
    return () => this._listeners.get(key)?.delete(callback); // unsubscribe
  }

  _notify(key, value, prev) {
    this._listeners.get(key)?.forEach(fn => fn(value, prev));
    this._listeners.get('*')?.forEach(fn => fn(key, value, prev));
  }

  // ─── Auth helpers ──────────────────────────────────────────────────────────
  setUser(user, token, refreshToken) {
    this.patch({ user, token, isLoggedIn: !!user });
    if (token) {
      localStorage.setItem('mla_token', token);
      localStorage.setItem('mla_user', JSON.stringify(user));
    }
    if (refreshToken) localStorage.setItem('mla_refresh', refreshToken);
  }

  clearUser() {
    this.patch({ user: null, token: null, isLoggedIn: false });
    localStorage.removeItem('mla_token');
    localStorage.removeItem('mla_user');
    localStorage.removeItem('mla_refresh');
  }

  _restoreSession() {
    const token = localStorage.getItem('mla_token');
    const userStr = localStorage.getItem('mla_user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        this._state.token = token;
        this._state.user = user;
        this._state.isLoggedIn = true;
        this._state.settings = { ...this._state.settings, ...user.settings };
      } catch { /* corrupted */ }
    }

    // Settings
    const savedSettings = localStorage.getItem('mla_settings');
    if (savedSettings) {
      try { this._state.settings = { ...this._state.settings, ...JSON.parse(savedSettings) }; } catch { /* ignore */ }
    }
  }

  saveSettings() {
    localStorage.setItem('mla_settings', JSON.stringify(this._state.settings));
  }

  // ─── Convenience ─────────────────────────────────────────────────────────
  get user()      { return this._state.user; }
  get token()     { return this._state.token; }
  get isLoggedIn(){ return this._state.isLoggedIn; }
  get isOnline()  { return this._state.isOnline; }
  get settings()  { return this._state.settings; }

  addNotification(notif) {
    this.update('notifications', n => [notif, ...n].slice(0, 50));
    this.update('unreadNotifications', n => n + 1);
  }

  clearNotifications() {
    this.set('notifications', []);
    this.set('unreadNotifications', 0);
  }
}
