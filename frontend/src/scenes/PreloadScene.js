import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'PreloadScene' }); }

  preload() {
    this.load.on('progress', (value) => {
      window.updateLoadingBar?.(Math.round(value * 100), LOADING_MESSAGES[Math.floor(value * 10)] || 'Loading...');
    });
    this.load.on('complete', () => window.updateLoadingBar?.(100, 'Ready!'));
    this._generatePlaceholders();
  }

  _generatePlaceholders() {
    const types = {
      fire:'#FF4500', water:'#1E90FF', grass:'#228B22', electric:'#FFD700',
      ice:'#B0E0E6', dragon:'#9B59B6', dark:'#333355', light:'#FFFACD',
      ghost:'#7B68EE', rock:'#808080', steel:'#C0C0C0', wind:'#87CEEB',
      poison:'#9ACD32', psychic:'#DDA0DD', normal:'#A9A9A9',
    };

    for (const [type, hex] of Object.entries(types)) {
      const key = `monster_placeholder_${type}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ add: false });
        const color = parseInt(hex.replace('#', ''), 16);
        g.fillStyle(color, 1);
        g.fillRoundedRect(0, 0, 96, 96, 14);
        g.lineStyle(3, 0xffffff, 0.4);
        g.strokeRoundedRect(2, 2, 92, 92, 12);
        // Eye spots
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(30, 36, 10);
        g.fillCircle(66, 36, 10);
        g.fillStyle(0x000000, 1);
        g.fillCircle(33, 38, 5);
        g.fillCircle(69, 38, 5);
        // Mouth
        g.lineStyle(3, 0xffffff, 0.8);
        g.strokeRoundedRect(30, 58, 36, 12, 6);
        g.generateTexture(key, 96, 96);
        g.destroy();
      }
    }

    const uiDefs = [
      ['btn_primary',   '#FF6B35', 240, 52], ['btn_secondary', '#1E90FF', 240, 52],
      ['btn_danger',    '#CC0000', 240, 52], ['btn_success',   '#228B22', 240, 52],
      ['panel_dark',    '#0D0D2B', 400, 300],['panel_medium',  '#1A1A3E', 400, 200],
      ['hp_bar_bg',     '#333333', 200, 14], ['hp_bar_fill',   '#00DD00', 200, 14],
      ['energy_bg',     '#333333', 120, 10], ['energy_fill',   '#4169E1', 120, 10],
    ];
    for (const [key, hex, w, h] of uiDefs) {
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ add: false });
        g.fillStyle(parseInt(hex.replace('#', ''), 16), 1);
        g.fillRoundedRect(0, 0, w, h, Math.min(8, h / 4));
        g.generateTexture(key, w, h);
        g.destroy();
      }
    }

    for (const [type, hex] of Object.entries(types)) {
      const key = `type_badge_${type}`;
      if (!this.textures.exists(key)) {
        const g = this.make.graphics({ add: false });
        g.fillStyle(parseInt(hex.replace('#', ''), 16), 1);
        g.fillRoundedRect(0, 0, 68, 20, 5);
        g.generateTexture(key, 68, 20);
        g.destroy();
      }
    }
  }

  async create() {
    // Initialize socket if logged in
    if (window.MLA.store.isLoggedIn && window.MLA.store.token) {
      const { SocketManager } = await import('../managers/SocketManager.js');
      if (!window.MLA.socket) window.MLA.socket = new SocketManager();
      window.MLA.socket.connect(window.MLA.store.token);
    }
    this.scene.start('MainMenuScene');
  }
}

const LOADING_MESSAGES = [
  'Initializing world engine…',  'Loading 300 monsters…',
  'Preparing battle systems…',   'Setting up regions…',
  'Loading evolution chains…',   'Calibrating type chart…',
  'Waking legendary monsters…',  'Polishing animations…',
  'Loading save data…',          'Entering the Arena…',
  'Ready!',
];
