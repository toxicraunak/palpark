import Phaser from 'phaser';
import { BootScene }        from './src/scenes/BootScene.js';
import { PreloadScene }     from './src/scenes/PreloadScene.js';
import { MainMenuScene }    from './src/scenes/MainMenuScene.js';
import { AuthScene }        from './src/scenes/AuthScene.js';
import { WorldMapScene }    from './src/scenes/WorldMapScene.js';
import { BattleScene }      from './src/scenes/BattleScene.js';
import {
  WildBattleScene, MonsterBoxScene, InventoryScene, ShopScene,
  MarketplaceScene, TournamentScene, GuildScene, QuestScene,
  BattlePassScene, LeaderboardScene, ProfileScene, HUDScene, DialogScene,
} from './src/scenes/allScenes.js';
import { GameStore }      from './src/managers/GameStore.js';
import { APIClient }      from './src/managers/APIClient.js';
import { OfflineManager } from './src/managers/OfflineManager.js';

window.MLA = {
  store:   new GameStore(),
  api:     new APIClient(),
  socket:  null,
  audio:   null,
  offline: new OfflineManager(),
  version: '1.0.0',
};

window.MLA.offline.init().catch(console.warn);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const config = {
  type: Phaser.AUTO,
  parent: 'canvas-wrapper',
  backgroundColor: '#0a0a1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 480,
    height: 854,
    min: { width: 320, height: 568 },
    max: { width: 768, height: 1366 },
  },
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scene: [
    BootScene, PreloadScene, MainMenuScene, AuthScene,
    WorldMapScene, BattleScene, WildBattleScene,
    MonsterBoxScene, InventoryScene, ShopScene, MarketplaceScene,
    TournamentScene, GuildScene, QuestScene, BattlePassScene,
    LeaderboardScene, ProfileScene, HUDScene, DialogScene,
  ],
  render: { antialias: true, roundPixels: false },
  input: { smoothFactor: 0.2 },
  dom: { createContainer: true },
};

window.MLA.game = new Phaser.Game(config);

window.updateLoadingBar = (pct, text) => {
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-text');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = text || '';
  if (pct >= 100) {
    setTimeout(() => {
      const s = document.getElementById('loading-screen');
      if (s) { s.style.opacity = '0'; setTimeout(() => s.remove(), 600); }
    }, 400);
  }
};

export default window.MLA.game;
