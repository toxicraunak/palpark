import Phaser from 'phaser';
import { AudioManager } from '../managers/AudioManager.js';
import { TYPE_COLORS, RARITY_COLORS, formatHP } from '../utils/gameUtils.js';

export class BattleScene extends Phaser.Scene {
  constructor() { super({ key: 'BattleScene' }); }

  init(data) {
    this.battleId        = data.battleId;
    this.battleType      = data.type || 'pve';
    this.initialState    = data.state;
    this.playerSide      = data.side || 'A';
    this.opponentSide    = this.playerSide === 'A' ? 'B' : 'A';
    this.isWaiting       = false;
    this.selectedMove    = null;
    this.selectedItem    = null;
    this.animQueue       = [];
    this.isAnimating     = false;
    this.battleEnded     = false;
    this.uiElements      = {};
    this.particles       = [];
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;
    this.W = W; this.H = H;

    this.audio = new AudioManager(this);
    this.audio.playBGM('bgm_battle');

    // Background layers
    this._createBackground();

    // Monster display areas
    this._createMonsterArena();

    // HP / Status bars
    this._createStatusBars();

    // Battle log
    this._createBattleLog();

    // Move selection UI
    this._createMovePanel();

    // Team / Item buttons
    this._createActionButtons();

    // Load initial state
    if (this.initialState) {
      this._applyState(this.initialState);
    }

    // Socket listeners
    this._bindSocketEvents();

    // Keyboard shortcuts (desktop)
    this.input.keyboard?.on('keydown-ONE',   () => this._selectMove(0));
    this.input.keyboard?.on('keydown-TWO',   () => this._selectMove(1));
    this.input.keyboard?.on('keydown-THREE', () => this._selectMove(2));
    this.input.keyboard?.on('keydown-FOUR',  () => this._selectMove(3));
    this.input.keyboard?.on('keydown-ESC',   () => this._showForfeitDialog());
  }

  // ─── Background ─────────────────────────────────────────────────────────────
  _createBackground() {
    const { W, H } = this;
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a2e, 0x0a0a2e, 0x1a0a3e, 0x1a0a3e, 1);
    bg.fillRect(0, 0, W, H);

    // Animated stars
    this._stars = [];
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H * 0.5);
      const r = Math.random() * 1.5 + 0.5;
      const star = this.add.circle(x, y, r, 0xffffff, Math.random() * 0.8 + 0.2);
      this._stars.push(star);
      this.tweens.add({ targets: star, alpha: 0.1, duration: Phaser.Math.Between(800, 2000), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 1000) });
    }

    // Arena platform
    const platform = this.add.graphics();
    platform.fillStyle(0x1a1a4e, 0.8);
    platform.fillEllipse(W / 2, H * 0.62, W * 0.9, 40);
    platform.fillStyle(0x0d0d2b, 0.6);
    platform.fillEllipse(W / 2, H * 0.35, W * 0.7, 30);
  }

  // ─── Monster Arena ─────────────────────────────────────────────────────────
  _createMonsterArena() {
    const { W, H } = this;

    // Opponent monster (top)
    this.opponentSprite = this._createMonsterSprite('Fire', W * 0.65, H * 0.22, 90);
    // Player monster (bottom)
    this.playerSprite   = this._createMonsterSprite('Water', W * 0.3, H * 0.5, 110, true);

    // Entrance animation
    this.tweens.add({ targets: this.opponentSprite, y: H * 0.22, alpha: 1, duration: 600, ease: 'Back.Out', from: H * 0.1 });
    this.tweens.add({ targets: this.playerSprite,   y: H * 0.5,  alpha: 1, duration: 600, ease: 'Back.Out', delay: 200, from: H * 0.6 });
  }

  _createMonsterSprite(type, x, y, size, flip = false) {
    const key = `monster_placeholder_${type.toLowerCase()}`;
    const sprite = this.add.image(x, y, key).setDisplaySize(size, size).setFlipX(flip).setAlpha(0);
    // Add subtle idle animation
    this.tweens.add({ targets: sprite, y: y - 6, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: flip ? 400 : 0 });
    return sprite;
  }

  // ─── Status Bars ────────────────────────────────────────────────────────────
  _createStatusBars() {
    const { W, H } = this;

    // ── Opponent panel (top-left) ──
    this._createPanel(8, 8, W * 0.58, 72, 'opponent_panel');
    this.uiElements.oppName   = this._createText(16, 14, 'Opponent', { fontSize: '13px', fontStyle: 'bold' });
    this.uiElements.oppLevel  = this._createText(W * 0.5, 14, 'Lv.1', { fontSize: '11px', color: '#aaa' });
    this.uiElements.oppHPBar  = this._createHPBar(16, 34, W * 0.55 - 20, 'opp');
    this.uiElements.oppStatus = this._createText(16, 52, '', { fontSize: '10px', color: '#ff6b35' });

    // ── Player panel (bottom-right) ──
    const px = W * 0.38;
    this._createPanel(px, H * 0.56, W - px - 8, 80, 'player_panel');
    this.uiElements.myName    = this._createText(px + 8, H * 0.56 + 6, 'My Monster', { fontSize: '13px', fontStyle: 'bold' });
    this.uiElements.myLevel   = this._createText(W - 16, H * 0.56 + 6, 'Lv.1', { fontSize: '11px', color: '#aaa', align: 'right' });
    this.uiElements.myHPBar   = this._createHPBar(px + 8, H * 0.56 + 28, W - px - 20, 'my');
    this.uiElements.myEnergyBar = this._createEnergyBar(px + 8, H * 0.56 + 52);
    this.uiElements.myStatus  = this._createText(px + 8, H * 0.56 + 66, '', { fontSize: '10px', color: '#ff6b35' });

    // Energy dots row
    this.energyDots = [];
    for (let i = 0; i < 5; i++) {
      const dot = this.add.circle(px + 16 + i * 22, H * 0.56 + 56, 7, 0x4169E1, 0.3);
      this.energyDots.push(dot);
    }
  }

  _createPanel(x, y, w, h, key) {
    const g = this.add.graphics();
    g.fillStyle(0x0d0d2b, 0.85);
    g.fillRoundedRect(x, y, w, h, 10);
    g.lineStyle(1, 0x4169E1, 0.5);
    g.strokeRoundedRect(x, y, w, h, 10);
    return g;
  }

  _createHPBar(x, y, w, id) {
    const bg   = this.add.rectangle(x + w / 2, y + 6, w, 12, 0x333333).setOrigin(0.5);
    const fill = this.add.rectangle(x, y + 6, w, 12, 0x00dd00).setOrigin(0, 0.5);
    const text = this.add.text(x, y - 2, 'HP: ???/???', { fontSize: '9px', color: '#aaa' });
    return { bg, fill, text, maxW: w, x, y };
  }

  _createEnergyBar(x, y) {
    const bg   = this.add.rectangle(x + 55, y, 110, 8, 0x222244).setOrigin(0.5);
    const fill = this.add.rectangle(x, y, 0, 8, 0x4169E1).setOrigin(0, 0.5);
    return { bg, fill };
  }

  _createText(x, y, text, style = {}) {
    return this.add.text(x, y, text, { fontSize: '12px', color: '#ffffff', fontFamily: 'Arial', ...style });
  }

  // ─── Battle Log ─────────────────────────────────────────────────────────────
  _createBattleLog() {
    const { W, H } = this;
    const logY = H * 0.67;
    const logH = 50;
    this._createPanel(8, logY, W - 16, logH, 'log_panel');
    this.uiElements.logText = this.add.text(16, logY + 8, 'Battle started!', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'Arial',
      wordWrap: { width: W - 40 }, lineSpacing: 4,
    });
  }

  // ─── Move Panel ─────────────────────────────────────────────────────────────
  _createMovePanel() {
    const { W, H } = this;
    const panelY = H * 0.75;
    this._createPanel(8, panelY, W - 16, H - panelY - 8, 'move_panel');

    this.moveBtns = [];
    const cols = 2; const rows = 2;
    const btnW = (W - 32) / cols - 4;
    const btnH = 36;

    for (let i = 0; i < 4; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const bx = 12 + col * (btnW + 8);
      const by = panelY + 8 + row * (btnH + 6);

      const btn = this._createMoveButton(bx, by, btnW, btnH, i);
      this.moveBtns.push(btn);
    }
  }

  _createMoveButton(x, y, w, h, index) {
    const g = this.add.graphics();
    const bg = this.add.rectangle(x + w/2, y + h/2, w, h, 0x1a1a4e).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    bg.setStrokeStyle(1, 0x4169E1);
    const nameText = this.add.text(x + 8, y + 5, `Move ${index+1}`, { fontSize: '11px', color: '#fff', fontStyle: 'bold' });
    const infoText = this.add.text(x + 8, y + 19, 'Type • -- PWR • -- PP', { fontSize: '9px', color: '#aaa' });
    const badge = this.add.rectangle(x + w - 36, y + h/2, 28, 16, 0x4169E1).setOrigin(0.5);
    const typeLabel = this.add.text(x + w - 36, y + h/2, 'NRM', { fontSize: '8px', color: '#fff' }).setOrigin(0.5);

    bg.on('pointerover',  () => { bg.fillColor = 0x2a2a6e; this.audio.playSFX('sfx_hover', 0.3); });
    bg.on('pointerout',   () => { bg.fillColor = 0x1a1a4e; });
    bg.on('pointerdown',  () => this._selectMove(index));

    return { bg, nameText, infoText, badge, typeLabel, index };
  }

  // ─── Action Buttons ──────────────────────────────────────────────────────────
  _createActionButtons() {
    const { W, H } = this;
    const btnY = H * 0.735;

    // Item button
    const itemBtn = this.add.text(W - 12, btnY, '🎒 Item', {
      fontSize: '11px', color: '#FFD700', backgroundColor: '#1a1a4e', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
    itemBtn.on('pointerdown', () => this._showItemMenu());

    // Switch button
    const switchBtn = this.add.text(W - 12, btnY + 22, '↔ Switch', {
      fontSize: '11px', color: '#90EE90', backgroundColor: '#1a1a4e', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
    switchBtn.on('pointerdown', () => this._showSwitchMenu());

    // Flee/Forfeit
    const fleeBtn = this.add.text(W - 12, btnY + 44, '🏳 Forfeit', {
      fontSize: '11px', color: '#ff6b35', backgroundColor: '#1a1a4e', padding: { x: 8, y: 4 },
    }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
    fleeBtn.on('pointerdown', () => this._showForfeitDialog());
  }

  // ─── Socket Events ───────────────────────────────────────────────────────────
  _bindSocketEvents() {
    const socket = window.MLA?.socket;
    if (!socket) return;

    this._unsub = [
      socket.on('battle:state_update', data => this._onStateUpdate(data)),
      socket.on('battle:ended',        data => this._onBattleEnd(data)),
      socket.on('battle:emote',        data => this._showEmote(data)),
      socket.on('battle:opponent_disconnected', () => this._showLog('Opponent disconnected...', '#ff6b35')),
    ];

    socket.joinBattle(this.battleId, (res) => {
      if (res.error) { this._showLog(res.error, '#ff0000'); }
    });
  }

  // ─── State Application ───────────────────────────────────────────────────────
  _applyState(state) {
    if (!state) return;
    const mine = state[`player${this.playerSide}`];
    const opp  = state[`player${this.opponentSide}`];
    if (!mine || !opp) return;

    const myMon  = mine.activeMonster;
    const oppMon = opp.activeMonster;

    // Update names & levels
    if (myMon) {
      this.uiElements.myName.setText(myMon.name || 'Unknown');
      this.uiElements.myLevel.setText(`Lv.${myMon.level}`);
      this._updateHPBar('my', myMon.currentHp, myMon.maxHp);
      this._updateEnergy(myMon.energy, myMon.maxEnergy);
      this._updateStatusEffect(this.uiElements.myStatus, myMon.statusEffect?.type);
      this._updateMoveButtons(myMon.moves, myMon.energy);
      this._updateMonsterSprite(this.playerSprite, myMon.types?.primary, myMon.hpPercent);
    }

    if (oppMon) {
      this.uiElements.oppName.setText(oppMon.name || 'Unknown');
      this.uiElements.oppLevel.setText(`Lv.${oppMon.level}`);
      this._updateHPBar('opp', oppMon.currentHp, oppMon.maxHp);
      this._updateStatusEffect(this.uiElements.oppStatus, oppMon.statusEffect?.type);
      this._updateMonsterSprite(this.opponentSprite, oppMon.types?.primary, oppMon.hpPercent);
    }

    // Turn indicator
    const turnText = this.uiElements.turnText || this.add.text(this.W/2, this.H * 0.67 - 14, '', { fontSize: '10px', color: '#aaa' }).setOrigin(0.5);
    this.uiElements.turnText = turnText;
    turnText.setText(`Turn ${state.turn || 1}${this.isWaiting ? ' — Waiting...' : ''}`);
  }

  _updateHPBar(side, current, max) {
    const bar = side === 'my' ? this.uiElements.myHPBar : this.uiElements.oppHPBar;
    if (!bar) return;
    const pct = max > 0 ? current / max : 0;
    const clr = pct > 0.5 ? 0x00dd00 : pct > 0.25 ? 0xFFD700 : 0xDD0000;
    const targetW = bar.maxW * pct;

    this.tweens.add({ targets: bar.fill, width: targetW, fillColor: clr, duration: 400, ease: 'Quad.Out', onUpdate: () => bar.fill.setFillStyle(clr) });
    bar.text.setText(`${formatHP(current)} / ${formatHP(max)}`);
  }

  _updateEnergy(current, max) {
    this.energyDots?.forEach((dot, i) => {
      dot.setFillStyle(i < current ? 0x4169E1 : 0x333333, i < current ? 1 : 0.3);
    });
  }

  _updateStatusEffect(label, statusType) {
    const STATUS_ICONS = { burn:'🔥', poison:'☠️', freeze:'❄️', sleep:'💤', paralysis:'⚡', confusion:'😵', none:'' };
    if (!label) return;
    label.setText(statusType && statusType !== 'none' ? `${STATUS_ICONS[statusType] || '●'} ${statusType.toUpperCase()}` : '');
  }

  _updateMoveButtons(moves, energy) {
    if (!moves || !this.moveBtns) return;
    moves.forEach((move, i) => {
      if (!this.moveBtns[i]) return;
      const { bg, nameText, infoText, badge, typeLabel } = this.moveBtns[i];
      nameText.setText(move.name || `Move ${i+1}`);
      infoText.setText(`${move.type || '?'} • ${move.power || '—'} PWR • ${move.currentUses ?? '?'}/${move.maxUses ?? '?'} PP`);
      typeLabel.setText((move.type || 'NRM').slice(0, 3).toUpperCase());
      const typeColor = TYPE_COLORS[move.type] || 0x4169E1;
      badge.setFillStyle(typeColor);
      const canUse = (move.currentUses > 0) && (energy >= (move.energyCost || 0)) && !this.isWaiting && !this.battleEnded;
      bg.setAlpha(canUse ? 1 : 0.4);
      bg.removeAllListeners();
      if (canUse) {
        bg.on('pointerover',  () => bg.fillColor = 0x2a2a6e);
        bg.on('pointerout',   () => bg.fillColor = 0x1a1a4e);
        bg.on('pointerdown',  () => this._selectMove(i));
      }
    });
  }

  _updateMonsterSprite(sprite, type, hpPct) {
    const key = `monster_placeholder_${(type || 'normal').toLowerCase()}`;
    if (this.textures.exists(key)) sprite.setTexture(key);
    if (hpPct !== undefined) sprite.setAlpha(hpPct > 0 ? 1 : 0.3);
  }

  // ─── Move Selection ──────────────────────────────────────────────────────────
  _selectMove(index) {
    if (this.isWaiting || this.battleEnded) return;
    const myState = this.currentState?.[`player${this.playerSide}`];
    const moves   = myState?.activeMonster?.moves;
    if (!moves?.[index]) return;

    const move = moves[index];
    this.selectedMove = move;
    this.audio.playSFX('sfx_select', 0.5);
    this._showLog(`Using ${move.name}...`);
    this._submitAction({ type: 'move', moveId: move.moveId });
  }

  _submitAction(action) {
    if (this.battleEnded) return;
    this.isWaiting = true;
    this._setMovePanelEnabled(false);

    const socket = window.MLA?.socket;
    if (socket?.isConnected) {
      socket.sendBattleAction(this.battleId, action, (res) => {
        if (res?.error) {
          this._showLog(res.error, '#ff6b35');
          this.isWaiting = false;
          this._setMovePanelEnabled(true);
        }
      });
    } else {
      // Offline fallback via REST
      window.MLA.api.submitBattleAction(this.battleId, action).then(res => {
        if (res.success) this._onStateUpdate(res.data);
        else { this._showLog(res.message, '#ff6b35'); this.isWaiting = false; this._setMovePanelEnabled(true); }
      }).catch(err => {
        this._showLog('Connection error.', '#ff0000');
        this.isWaiting = false;
        this._setMovePanelEnabled(true);
      });
    }
  }

  _setMovePanelEnabled(enabled) {
    this.moveBtns?.forEach(({ bg }) => bg.setAlpha(enabled ? 1 : 0.4));
  }

  // ─── State Update Handler ─────────────────────────────────────────────────────
  _onStateUpdate(data) {
    this.currentState = data;
    this.isWaiting = false;

    // Process log entries with animation queue
    const log = data.log || [];
    this._processLogQueue(log);

    this._applyState(data);
    this._setMovePanelEnabled(true);
  }

  _processLogQueue(log) {
    log.forEach((entry, i) => {
      this.time.delayedCall(i * 600, () => {
        this._handleLogEntry(entry);
      });
    });
  }

  _handleLogEntry(entry) {
    switch (entry.type) {
      case 'move_used':
        this._showLog(`${entry.moveName}!`);
        this._playMoveAnimation(entry.side === this.playerSide);
        break;
      case 'damage':
        this._showDamageNumber(entry.damage, entry.side !== this.playerSide);
        if (entry.effectText === 'super_effective') this._showLog("It's super effective!", '#FFD700');
        if (entry.effectText === 'not_very_effective') this._showLog("It's not very effective...", '#aaa');
        if (entry.isCritical) this._showLog('A critical hit!', '#FF4500');
        this._shakeMonster(entry.side !== this.playerSide ? 'my' : 'opp');
        break;
      case 'status':
        this._showLog(entry.message, '#9B59B6');
        break;
      case 'heal':
        this._showLog(entry.message, '#00DD00');
        this._playHealEffect(true);
        break;
      case 'faint':
        this._showLog(entry.message, '#ff6b35');
        this._playFaintAnimation(entry.side !== this.playerSide ? this.playerSprite : this.opponentSprite);
        break;
      case 'switch':
        this._showLog(entry.message);
        break;
      case 'battle_start':
        this._showLog(entry.message);
        break;
      default:
        if (entry.message) this._showLog(entry.message);
    }
  }

  // ─── Battle End ──────────────────────────────────────────────────────────────
  _onBattleEnd(data) {
    this.battleEnded = true;
    this._setMovePanelEnabled(false);
    this.audio.stopBGM(1000);

    const won = data.winnerSide === this.playerSide || data.winnerSide === 'capture';
    const isDraw = data.winnerSide === 'draw';

    const color = won ? '#FFD700' : isDraw ? '#aaa' : '#ff6b35';
    const msg   = won ? '🏆 Victory!' : isDraw ? '🤝 Draw!' : '💀 Defeated!';

    this.time.delayedCall(1200, () => {
      this._showResultOverlay(msg, color, data);
    });

    if (won) this._playVictoryEffect();
    window.MLA.store.set('currentBattle', null);
  }

  _showResultOverlay(msg, color, data) {
    const { W, H } = this;
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, W, H);
    overlay.alpha = 0;
    this.tweens.add({ targets: overlay, alpha: 1, duration: 500 });

    const resultText = this.add.text(W / 2, H * 0.35, msg, {
      fontSize: '36px', fontStyle: 'bold', color, fontFamily: 'Arial',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: resultText, alpha: 1, y: H * 0.32, duration: 600, ease: 'Back.Out' });

    // Rewards
    const rewards = data.rewards?.[`player${this.playerSide}`];
    if (rewards) {
      const rewardStr = `+${rewards.coins || 0} 💰  +${rewards.experience || 0} EXP  ${rewards.gems ? `+${rewards.gems} 💎` : ''}`;
      this.add.text(W / 2, H * 0.44, rewardStr, { fontSize: '14px', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5).setAlpha(0)
        .setAlpha(1).setAlpha(0);
      this.time.delayedCall(400, () => this.add.text(W / 2, H * 0.44, rewardStr, { fontSize: '14px', color: '#FFD700' }).setOrigin(0.5));
    }

    // Back button
    const backBtn = this.add.text(W / 2, H * 0.58, '← Back to World', {
      fontSize: '16px', color: '#fff', backgroundColor: '#1a1a4e', padding: { x: 20, y: 10 },
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    backBtn.on('pointerdown', () => {
      this._cleanup();
      this.scene.start('WorldMapScene');
    });
    backBtn.on('pointerover', () => backBtn.setColor('#FFD700'));
    backBtn.on('pointerout',  () => backBtn.setColor('#fff'));
  }

  // ─── Visual Effects ──────────────────────────────────────────────────────────
  _playMoveAnimation(isPlayer) {
    const target = isPlayer ? this.opponentSprite : this.playerSprite;
    this.tweens.add({ targets: target, tint: 0xffffff, duration: 100, yoyo: true, repeat: 2 });
    this.cameras.main.shake(150, 0.003);
  }

  _shakeMonster(side) {
    const sprite = side === 'my' ? this.playerSprite : this.opponentSprite;
    this.tweens.add({ targets: sprite, x: sprite.x + 8, duration: 50, yoyo: true, repeat: 3 });
  }

  _playFaintAnimation(sprite) {
    this.tweens.add({ targets: sprite, alpha: 0, y: sprite.y + 30, duration: 600, ease: 'Power2' });
  }

  _playHealEffect(isPlayer) {
    const sprite = isPlayer ? this.playerSprite : this.opponentSprite;
    this.tweens.add({ targets: sprite, tint: 0x00ff00, duration: 200, yoyo: true });
  }

  _playVictoryEffect() {
    const { W, H } = this;
    for (let i = 0; i < 20; i++) {
      const particle = this.add.circle(
        Phaser.Math.Between(0, W), H + 20,
        Phaser.Math.Between(4, 12),
        Phaser.Display.Color.HSVColorWheel()[Phaser.Math.Between(0, 359)].color
      );
      this.tweens.add({
        targets: particle, y: Phaser.Math.Between(-20, H * 0.5),
        x: particle.x + Phaser.Math.Between(-100, 100),
        alpha: 0, duration: Phaser.Math.Between(800, 1600),
        delay: Phaser.Math.Between(0, 600),
        onComplete: () => particle.destroy(),
      });
    }
  }

  _showDamageNumber(damage, isPlayer) {
    const sprite = isPlayer ? this.playerSprite : this.opponentSprite;
    const text = this.add.text(sprite.x + Phaser.Math.Between(-20, 20), sprite.y - 20, `-${damage}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#ff4444', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.tweens.add({ targets: text, y: text.y - 40, alpha: 0, duration: 900, ease: 'Quad.Out', onComplete: () => text.destroy() });
  }

  _showEmote(data) {
    const { W } = this;
    const isMe = data.userId === window.MLA.store.user?._id;
    const x = isMe ? W * 0.25 : W * 0.7;
    const y = isMe ? this.H * 0.45 : this.H * 0.18;
    const bubble = this.add.text(x, y, data.emoteId, { fontSize: '24px' }).setOrigin(0.5);
    this.tweens.add({ targets: bubble, y: y - 30, alpha: 0, duration: 1500, onComplete: () => bubble.destroy() });
  }

  // ─── Log ─────────────────────────────────────────────────────────────────────
  _showLog(message, color = '#ffffff') {
    if (!this.uiElements.logText) return;
    this.uiElements.logText.setText(message).setColor(color);
  }

  // ─── Item / Switch Menus ──────────────────────────────────────────────────────
  _showItemMenu() {
    if (this.isWaiting || this.battleEnded) return;
    this.scene.launch('DialogScene', {
      type: 'item_select',
      battleId: this.battleId,
      onSelect: (itemId, targetId) => this._submitAction({ type: 'item', item: { itemId }, targetIndex: 0 }),
    });
  }

  _showSwitchMenu() {
    if (this.isWaiting || this.battleEnded) return;
    const myState = this.currentState?.[`player${this.playerSide}`];
    if (!myState) return;
    this.scene.launch('DialogScene', {
      type: 'switch_select',
      team: myState.teamStatus,
      activeIndex: myState.activeIndex,
      onSelect: (index) => this._submitAction({ type: 'switch', targetIndex: index }),
    });
  }

  _showForfeitDialog() {
    if (this.battleEnded) return;
    this.scene.launch('DialogScene', {
      type: 'confirm',
      title: 'Forfeit Battle?',
      message: 'Are you sure you want to forfeit? You will lose the battle.',
      onConfirm: () => {
        window.MLA?.socket?.forfeitBattle(this.battleId);
        window.MLA.api.forfeitBattle(this.battleId).catch(() => {});
      },
    });
  }

  // ─── Cleanup ─────────────────────────────────────────────────────────────────
  _cleanup() {
    this._unsub?.forEach(fn => fn?.());
    this._unsub = [];
    this.audio?.stopBGM(500);
    window.MLA.socket?.socket?.off('battle:state_update');
    window.MLA.socket?.socket?.off('battle:ended');
  }

  shutdown() { this._cleanup(); }
  destroy()  { this._cleanup(); }

  update() {
    // Continuous update loop — used for animated elements
  }
}
