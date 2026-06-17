import Phaser from 'phaser';
import { AudioManager } from '../managers/AudioManager.js';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenuScene' }); }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    this.audio = new AudioManager(this);

    this._buildBackground();
    this._buildLogo();
    this._buildMenuButtons();
    this._buildVersionTag();

    // Auto-login if token exists
    if (window.MLA.store.isLoggedIn) {
      this._verifySession();
    }
  }

  _buildBackground() {
    const { W, H } = this;
    // Deep space gradient
    const g = this.add.graphics();
    g.fillGradientStyle(0x050510, 0x050510, 0x0a1028, 0x0a1028, 1);
    g.fillRect(0, 0, W, H);

    // Animated particles
    this._particles = [];
    for (let i = 0; i < 80; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      const r = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.6 + 0.2;
      const p = this.add.circle(x, y, r, 0xffffff, alpha);
      this._particles.push({ obj: p, speed: Math.random() * 0.3 + 0.05, startY: y });
      this.tweens.add({ targets: p, alpha: 0.1, duration: Phaser.Math.Between(1000, 3000), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 2000) });
    }

    // Floating monster silhouettes
    const types = ['fire','water','grass','electric','psychic'];
    types.forEach((type, i) => {
      const x = (W / (types.length + 1)) * (i + 1);
      const y = H * 0.78;
      const sil = this.add.image(x, y, `monster_placeholder_${type}`).setAlpha(0.08).setDisplaySize(80, 80);
      this.tweens.add({ targets: sil, y: y - 15, alpha: 0.12, duration: 2000 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: i * 400 });
    });
  }

  _buildLogo() {
    const { W, H } = this;

    // Glow effect behind title
    const glow = this.add.circle(W / 2, H * 0.22, 100, 0xFF6B35, 0.08);
    this.tweens.add({ targets: glow, scaleX: 1.2, scaleY: 1.2, alpha: 0.04, duration: 2000, yoyo: true, repeat: -1 });

    // Logo text
    this.add.text(W / 2, H * 0.14, '⚡', { fontSize: '40px' }).setOrigin(0.5);

    const title = this.add.text(W / 2, H * 0.22, 'Monster Legends', {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      fontFamily: 'Arial Black, Arial', stroke: '#FF6B35', strokeThickness: 2,
    }).setOrigin(0.5);

    const subtitle = this.add.text(W / 2, H * 0.3, 'ARENA', {
      fontSize: '38px', fontStyle: 'bold',
      color: '#FF6B35', fontFamily: 'Arial Black',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    // Pulse animation on title
    this.tweens.add({ targets: [title, subtitle], scaleX: 1.02, scaleY: 1.02, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // Tagline
    this.add.text(W / 2, H * 0.37, 'Catch. Battle. Conquer.', {
      fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial', letterSpacing: 3,
    }).setOrigin(0.5);
  }

  _buildMenuButtons() {
    const { W, H } = this;
    const btnY = H * 0.48;
    const btnW = W * 0.72;
    const btnH = 52;
    const gap  = 14;

    const buttons = [
      { label: '🎮  Play Now',        color: 0xFF6B35, textColor: '#fff',     action: () => this._startGame() },
      { label: '📝  Create Account',  color: 0x1E90FF, textColor: '#fff',     action: () => this.scene.start('AuthScene', { mode: 'register' }) },
      { label: '🔑  Login',           color: 0x228B22, textColor: '#fff',     action: () => this.scene.start('AuthScene', { mode: 'login' }) },
      { label: '👤  Play as Guest',   color: 0x333355, textColor: '#cccccc',  action: () => this._guestPlay() },
    ];

    buttons.forEach((btn, i) => {
      const y = btnY + i * (btnH + gap);
      this._createMenuBtn(W / 2, y, btnW, btnH, btn.label, btn.color, btn.textColor, btn.action);
    });
  }

  _createMenuBtn(cx, cy, w, h, label, fillColor, textColor, onClick) {
    const g = this.add.graphics();
    g.fillStyle(fillColor, 0.85);
    g.fillRoundedRect(cx - w/2, cy - h/2, w, h, 12);
    g.lineStyle(2, 0xffffff, 0.15);
    g.strokeRoundedRect(cx - w/2, cy - h/2, w, h, 12);

    const hitArea = this.add.rectangle(cx, cy, w, h, 0x000000, 0).setInteractive({ cursor: 'pointer' });
    const text = this.add.text(cx, cy, label, {
      fontSize: '16px', color: textColor, fontFamily: 'Arial', fontStyle: 'bold',
    }).setOrigin(0.5);

    hitArea.on('pointerover', () => {
      g.clear();
      g.fillStyle(fillColor, 1);
      g.fillRoundedRect(cx - w/2, cy - h/2, w, h, 12);
      this.tweens.add({ targets: [g, text], scaleX: 1.02, scaleY: 1.02, duration: 100 });
    });

    hitArea.on('pointerout', () => {
      g.clear();
      g.fillStyle(fillColor, 0.85);
      g.fillRoundedRect(cx - w/2, cy - h/2, w, h, 12);
      this.tweens.add({ targets: [g, text], scaleX: 1, scaleY: 1, duration: 100 });
    });

    hitArea.on('pointerdown', () => {
      this.cameras.main.shake(80, 0.003);
      onClick();
    });

    return { g, text, hitArea };
  }

  _buildVersionTag() {
    const { W, H } = this;
    this.add.text(W / 2, H - 16, `v${window.MLA.version} • Monster Legends Arena`, {
      fontSize: '10px', color: '#444455', fontFamily: 'Arial',
    }).setOrigin(0.5);
  }

  async _verifySession() {
    try {
      const res = await window.MLA.api.getMe();
      if (res.success) {
        window.MLA.store.setUser(res.user, window.MLA.store.token);
        this._startGame();
      } else {
        window.MLA.store.clearUser();
      }
    } catch {
      window.MLA.store.clearUser();
    }
  }

  async _guestPlay() {
    try {
      this._showLoadingOverlay('Creating guest account...');
      const res = await window.MLA.api.loginAsGuest();
      if (res.success) {
        window.MLA.store.setUser(res.user, res.token);
        if (window.MLA.socket === null) {
          const { SocketManager } = await import('../managers/SocketManager.js');
          window.MLA.socket = new SocketManager();
        }
        window.MLA.socket.connect(res.token);
        this.scene.start('WorldMapScene');
      }
    } catch (err) {
      this._showError('Failed to start guest session. Please try again.');
    }
  }

  _startGame() {
    this.scene.start('WorldMapScene');
  }

  _showLoadingOverlay(msg) {
    const { W, H } = this;
    if (this._overlay) return;
    this._overlay = this.add.graphics();
    this._overlay.fillStyle(0x000000, 0.7);
    this._overlay.fillRect(0, 0, W, H);
    this._loadMsg = this.add.text(W/2, H/2, msg, {
      fontSize: '16px', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5);
  }

  _showError(msg) {
    const { W, H } = this;
    const err = this.add.text(W/2, H * 0.96, msg, {
      fontSize: '12px', color: '#FF4444', backgroundColor: '#1a0000',
      padding: { x: 12, y: 6 }, fontFamily: 'Arial',
    }).setOrigin(0.5);
    this.time.delayedCall(4000, () => err.destroy());
  }
}
