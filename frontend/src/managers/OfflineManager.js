// ─── OfflineManager.js ───────────────────────────────────────────────────────
export class OfflineManager {
  constructor() {
    this.db = null;
    this.dbName = 'MonsterLegendsArena';
    this.version = 1;
    this.isReady = false;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, this.version);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('save_data'))    db.createObjectStore('save_data', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('monsters'))     db.createObjectStore('monsters',  { keyPath: '_id' });
        if (!db.objectStoreNames.contains('inventory'))    db.createObjectStore('inventory', { keyPath: 'itemId' });
        if (!db.objectStoreNames.contains('battle_cache')) db.createObjectStore('battle_cache', { keyPath: 'battleId' });
        if (!db.objectStoreNames.contains('quest_cache'))  db.createObjectStore('quest_cache', { keyPath: 'questId' });
        if (!db.objectStoreNames.contains('pending_sync')) db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
      };

      req.onsuccess = (e) => { this.db = e.target.result; this.isReady = true; resolve(this.db); };
      req.onerror   = (e) => { console.warn('IndexedDB unavailable:', e); resolve(null); };
    });
  }

  async set(store, value) {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e);
    });
  }

  async get(store, key) {
    if (!this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => resolve(null);
    });
  }

  async getAll(store) {
    if (!this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  }

  async delete(store, key) {
    if (!this.db) return;
    return new Promise((resolve) => {
      const tx = this.db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror    = () => resolve(false);
    });
  }

  async saveGameState(state) {
    await this.set('save_data', { key: 'game_state', ...state, savedAt: Date.now() });
  }

  async loadGameState() {
    return await this.get('save_data', 'game_state');
  }

  async cacheMonsters(monsters) {
    for (const m of monsters) await this.set('monsters', m);
  }

  async cacheInventory(slots) {
    for (const s of slots) await this.set('inventory', s);
  }

  async queueSync(action) {
    if (!this.db) return;
    const tx = this.db.transaction('pending_sync', 'readwrite');
    tx.objectStore('pending_sync').add({ ...action, queuedAt: Date.now() });
  }

  async getPendingSync() {
    return await this.getAll('pending_sync');
  }

  async clearPendingSync() {
    if (!this.db) return;
    const tx = this.db.transaction('pending_sync', 'readwrite');
    tx.objectStore('pending_sync').clear();
  }

  async syncWithServer() {
    if (!navigator.onLine) return { synced: 0 };
    const pending = await this.getPendingSync();
    if (pending.length === 0) return { synced: 0 };
    // In production: POST each pending action to the server
    console.log(`[Offline] Syncing ${pending.length} actions...`);
    await this.clearPendingSync();
    return { synced: pending.length };
  }
}
