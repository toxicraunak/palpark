import Phaser from 'phaser';
import { AudioManager } from '../managers/AudioManager.js';
import { TYPE_COLORS_CSS, getTypeIcon } from '../utils/gameUtils.js';

const REGIONS = [
  { id:'starter_town',   name:'Starter Town',    x:0.15, y:0.55, color:0x44AA44, types:['Normal','Grass','Fire','Water'],  minLevel:1,  icon:'🏘️',  unlocked:true  },
  { id:'forest_glen',    name:'Forest Glen',     x:0.32, y:0.42, color:0x228B22, types:['Grass','Poison','Ghost'],         minLevel:5,  icon:'🌲',  unlocked:false },
  { id:'fire_mountain',  name:'Fire Mountain',   x:0.55, y:0.32, color:0xFF4500, types:['Fire','Rock','Steel'],            minLevel:15, icon:'🌋',  unlocked:false },
  { id:'ocean_coast',    name:'Ocean Coast',     x:0.18, y:0.75, color:0x1E90FF, types:['Water','Ice','Electric'],         minLevel:10, icon:'🌊',  unlocked:false },
  { id:'electric_valley',name:'Electric Valley', x:0.42, y:0.65, color:0xFFD700, types:['Electric','Steel','Wind'],        minLevel:20, icon:'⚡',  unlocked:false },
  { id:'ice_peaks',      name:'Ice Peaks',       x:0.70, y:0.22, color:0xB0E0E6, types:['Ice','Dragon','Wind'],            minLevel:30, icon:'🏔️',  unlocked:false },
  { id:'shadow_dungeon', name:'Shadow Dungeon',  x:0.58, y:0.58, color:0x4B0082, types:['Ghost','Dark','Psychic'],         minLevel:35, icon:'🏚️',  unlocked:false },
  { id:'dragon_lair',    name:'Dragon Lair',     x:0.80, y:0.42, color:0x9B59B6, types:['Dragon','Light','Steel'],         minLevel:50, icon:'🐉',  unlocked:false },
  { id:'legendary_shrine',name:'Legendary Shrine',x:0.88,y:0.18, color:0xFFD700,types:['Light','Psychic','Dragon'],       minLevel:70, icon:'⭐', unlocked:false },
];

export class WorldMapScene extends Phaser.Scene {
  constructor() { super({ key: 'WorldMapScene' }); }

  create() {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    this.audio = new AudioManager(this);

    this._buildBackground();
    this._buildMap();
    this._buildHUD();
    this._buildNavBar();
    this._buildChatBtn();

    this._loadPlayerData();
    this._setupSocketListeners();
    this._enterRegion(window.MLA.store.get('currentRegion') || 'starter_town');

    // Enter region on map socket
    window.MLA.socket?.enterRegion(window.MLA.store.get('currentRegion') || 'starter_town');
  }

  _buildBackground() {
    const { W, H } = this;
    // World map base
    const g = this.add.graphics();
    g.fillGradientStyle(0x0a2010, 0x0a2010, 0x102010, 0x102010, 1);
    g.fillRect(0, 0, W, H);

    // Grid lines
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x1a3a1a, 0.3);
    for (let x = 0; x < W; x += 40) grid.lineBetween(x, 0, x, H);
    for (let y = 0; y < H; y += 40) grid.lineBetween(0, y, W, y);

    // Title
    this.add.text(W/2, 28, '🗺️ World Map', {
      fontSize: '18px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial',
    }).setOrigin(0.5);
  }

  _buildMap() {
    const { W, H } = this;
    const mapTop = 55; const mapH = H - 180;

    // Draw connecting paths between regions
    const paths = this.add.graphics();
    paths.lineStyle(2, 0x228B22, 0.4);
    const pairs = [
      ['starter_town','forest_glen'],['forest_glen','fire_mountain'],
      ['starter_town','ocean_coast'],['ocean_coast','electric_valley'],
      ['forest_glen','electric_valley'],['fire_mountain','ice_peaks'],
      ['electric_valley','shadow_dungeon'],['fire_mountain','shadow_dungeon'],
      ['ice_peaks','dragon_lair'],['shadow_dungeon','dragon_lair'],
      ['dragon_lair','legendary_shrine'],
    ];
    pairs.forEach(([a, b]) => {
      const ra = REGIONS.find(r => r.id === a);
      const rb = REGIONS.find(r => r.id === b);
      if (ra && rb) {
        paths.lineBetween(ra.x * W, mapTop + ra.y * mapH, rb.x * W, mapTop + rb.y * mapH);
      }
    });

    // Draw region nodes
    this._regionNodes = [];
    const unlockedRegions = window.MLA.store.user?.gameData?.storyProgress?.unlockedRegions || ['starter_town'];

    REGIONS.forEach(region => {
      const rx = region.x * W;
      const ry = mapTop + region.y * mapH;
      const isUnlocked = unlockedRegions.includes(region.id) || region.unlocked;
      const isActive   = (window.MLA.store.get('currentRegion') || 'starter_town') === region.id;

      // Node circle
      const circle = this.add.graphics();
      circle.fillStyle(isUnlocked ? region.color : 0x333333, isUnlocked ? 0.9 : 0.5);
      circle.fillCircle(rx, ry, 22);
      if (isActive) {
        circle.lineStyle(3, 0xFFD700, 1);
        circle.strokeCircle(rx, ry, 24);
        this.tweens.add({ targets: circle, alpha: 0.7, duration: 800, yoyo: true, repeat: -1 });
      }

      // Icon
      const icon = this.add.text(rx, ry - 2, region.icon, { fontSize: '18px' }).setOrigin(0.5);
      icon.setAlpha(isUnlocked ? 1 : 0.4);

      // Name label
      const label = this.add.text(rx, ry + 30, region.name, {
        fontSize: '9px', color: isUnlocked ? '#ffffff' : '#666666', fontFamily: 'Arial',
        stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5);

      // Level badge
      const lvlText = this.add.text(rx, ry - 30, `Lv.${region.minLevel}+`, {
        fontSize: '8px', color: isUnlocked ? '#FFD700' : '#555555', fontFamily: 'Arial',
      }).setOrigin(0.5);

      // Online players count
      this._onlineDot = this.add.circle(rx + 18, ry - 18, 5, 0x00FF00, isUnlocked ? 0.8 : 0);
      this._onlineCount = this.add.text(rx + 26, ry - 22, '0', { fontSize: '8px', color: '#00FF00' });

      // Interaction zone
      const zone = this.add.zone(rx, ry, 50, 50).setInteractive({ cursor: isUnlocked ? 'pointer' : 'not-allowed' });
      if (isUnlocked) {
        zone.on('pointerover', () => {
          circle.clear();
          circle.fillStyle(region.color, 1);
          circle.fillCircle(rx, ry, 26);
          this._showRegionTooltip(region, rx, ry);
        });
        zone.on('pointerout',  () => {
          circle.clear();
          circle.fillStyle(region.color, 0.9);
          circle.fillCircle(rx, ry, 22);
          this._hideTooltip();
        });
        zone.on('pointerdown', () => this._selectRegion(region));
      } else {
        zone.on('pointerdown', () => this._showLockedMessage(region));
      }

      this._regionNodes.push({ region, circle, icon, label, zone });
    });
  }

  _showRegionTooltip(region, x, y) {
    this._hideTooltip();
    const { W } = this;
    const tipX = x > W/2 ? x - 120 : x + 30;
    const tipY = Math.max(60, y - 40);

    const typesStr = region.types.map(t => getTypeIcon(t) + ' ' + t).join('  ');
    const lines = [region.name, `Min Level: ${region.minLevel}`, typesStr];
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a2e, 0.95);
    bg.fillRoundedRect(tipX, tipY, 130, 56, 8);
    bg.lineStyle(1, 0x4169E1, 0.5);
    bg.strokeRoundedRect(tipX, tipY, 130, 56, 8);

    const txt = this.add.text(tipX + 8, tipY + 6, lines, {
      fontSize: '10px', color: '#ffffff', fontFamily: 'Arial', lineSpacing: 4,
    });

    this._tooltip = { bg, txt };
  }

  _hideTooltip() {
    if (this._tooltip) {
      this._tooltip.bg.destroy();
      this._tooltip.txt.destroy();
      this._tooltip = null;
    }
  }

  _selectRegion(region) {
    this._hideTooltip();
    window.MLA.store.set('currentRegion', region.id);
    window.MLA.socket?.enterRegion(region.id);
    this._showRegionPanel(region);
  }

  _showRegionPanel(region) {
    const { W, H } = this;
    if (this._regionPanel) { this._regionPanel.forEach(o => o.destroy()); }
    this._regionPanel = [];

    const panH = 200;
    const panY = H - panH - 48;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a2e, 0.97);
    bg.fillRoundedRect(8, panY, W - 16, panH, 14);
    bg.lineStyle(1, region.color, 0.6);
    bg.strokeRoundedRect(8, panY, W - 16, panH, 14);
    this._regionPanel.push(bg);

    const title = this.add.text(W/2, panY + 16, `${region.icon} ${region.name}`, {
      fontSize: '16px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial',
    }).setOrigin(0.5);
    this._regionPanel.push(title);

    const types = this.add.text(W/2, panY + 36, region.types.map(t => getTypeIcon(t) + t).join('  '), {
      fontSize: '11px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(0.5);
    this._regionPanel.push(types);

    // Action buttons
    const btnY = panY + 60;
    const actions = [
      { label:'⚔️ Wild Battle',   color:0xFF4500, action:() => this._startWildBattle(region.id) },
      { label:'🤺 Story Battle',  color:0x1E90FF, action:() => this._startStoryBattle(region.id) },
      { label:'🏆 PvP Queue',     color:0xFFD700, action:() => this._joinMatchmaking('ranked') },
      { label:'👣 Explore',       color:0x228B22, action:() => this._exploreRegion(region) },
    ];

    const btnW = (W - 32) / 2 - 4;
    actions.forEach((a, i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const bx = 12 + col * (btnW + 8) + btnW/2;
      const by = btnY + row * 50;
      const btn = this._createActionBtn(bx, by, btnW, 40, a.label, a.color, a.action);
      this._regionPanel.push(...Object.values(btn));
    });

    // Close button
    const closeBtn = this.add.text(W - 20, panY + 8, '✕', {
      fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial',
    }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerdown', () => { this._regionPanel?.forEach(o => o.destroy()); this._regionPanel = []; });
    this._regionPanel.push(closeBtn);
  }

  _createActionBtn(cx, cy, w, h, label, color, onClick) {
    const g = this.add.graphics();
    g.fillStyle(color, 0.8);
    g.fillRoundedRect(cx - w/2, cy - h/2, w, h, 8);
    const hit = this.add.rectangle(cx, cy, w, h, 0, 0).setInteractive({ cursor: 'pointer' });
    const txt = this.add.text(cx, cy, label, { fontSize: '11px', color: '#fff', fontFamily: 'Arial' }).setOrigin(0.5);
    hit.on('pointerdown', onClick);
    hit.on('pointerover', () => { g.clear(); g.fillStyle(color, 1); g.fillRoundedRect(cx-w/2, cy-h/2, w, h, 8); });
    hit.on('pointerout',  () => { g.clear(); g.fillStyle(color, 0.8); g.fillRoundedRect(cx-w/2, cy-h/2, w, h, 8); });
    return { g, hit, txt };
  }

  _buildHUD() {
    const { W } = this;
    const user = window.MLA.store.user;
    if (!user) return;

    const g = this.add.graphics();
    g.fillStyle(0x0d0d2b, 0.9);
    g.fillRoundedRect(8, 46, W - 16, 36, 8);

    this._coinText  = this.add.text(20, 56, `💰 ${user.gameData?.coins || 0}`, { fontSize: '11px', color: '#FFD700', fontFamily: 'Arial' });
    this._gemText   = this.add.text(W/2 - 40, 56, `💎 ${user.gameData?.gems || 0}`, { fontSize: '11px', color: '#00BFFF', fontFamily: 'Arial' });
    this._levelText = this.add.text(W - 20, 56, `Lv.${user.gameData?.level || 1}`, { fontSize: '11px', color: '#ffffff', fontFamily: 'Arial' }).setOrigin(1, 0);

    // Update on store change
    window.MLA.store.on('user', (user) => {
      if (!user) return;
      this._coinText?.setText(`💰 ${user.gameData?.coins || 0}`);
      this._gemText?.setText(`💎 ${user.gameData?.gems || 0}`);
      this._levelText?.setText(`Lv.${user.gameData?.level || 1}`);
    });
  }

  _buildNavBar() {
    const { W, H } = this;
    const navY = H - 44;
    const navH = 44;

    const g = this.add.graphics();
    g.fillStyle(0x0d0d2b, 0.97);
    g.fillRect(0, navY, W, navH);
    g.lineStyle(1, 0x4169E1, 0.3);
    g.lineBetween(0, navY, W, navY);

    const navItems = [
      { icon: '👜', label: 'Bag',        action: () => this.scene.start('InventoryScene') },
      { icon: '🐲', label: 'Monsters',   action: () => this.scene.start('MonsterBoxScene') },
      { icon: '🏆', label: 'Battles',    action: () => this.scene.start('TournamentScene') },
      { icon: '🏪', label: 'Market',     action: () => this.scene.start('MarketplaceScene') },
      { icon: '👤', label: 'Profile',    action: () => this.scene.start('ProfileScene') },
    ];

    const itemW = W / navItems.length;
    navItems.forEach((item, i) => {
      const cx = itemW * i + itemW / 2;
      const icon = this.add.text(cx, navY + 6, item.icon, { fontSize: '18px' }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      const lbl  = this.add.text(cx, navY + 26, item.label, { fontSize: '8px', color: '#888888', fontFamily: 'Arial' }).setOrigin(0.5);
      icon.on('pointerdown', item.action);
      icon.on('pointerover', () => lbl.setColor('#ffffff'));
      icon.on('pointerout',  () => lbl.setColor('#888888'));
    });
  }

  _buildChatBtn() {
    const { W, H } = this;
    const btn = this.add.text(W - 12, H - 52, '💬', { fontSize: '22px' }).setOrigin(1, 1).setInteractive({ cursor: 'pointer' });
    btn.on('pointerdown', () => this._toggleChat());
    this._chatOpen = false;
    this._chatMessages = [];
  }

  _toggleChat() {
    if (this._chatOpen) {
      this._chatPanel?.forEach(o => o.destroy());
      this._chatPanel = [];
      this._chatOpen = false;
    } else {
      this._openChat();
    }
  }

  _openChat() {
    const { W, H } = this;
    this._chatOpen = true;
    this._chatPanel = [];

    const chatH = 220;
    const chatY = H - chatH - 50;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a2e, 0.97);
    bg.fillRoundedRect(8, chatY, W - 16, chatH, 12);
    bg.lineStyle(1, 0x4169E1, 0.4);
    bg.strokeRoundedRect(8, chatY, W - 16, chatH, 12);
    this._chatPanel.push(bg);

    const title = this.add.text(W/2, chatY + 12, '💬 Global Chat', {
      fontSize: '13px', fontStyle: 'bold', color: '#ffffff', fontFamily: 'Arial',
    }).setOrigin(0.5);
    this._chatPanel.push(title);

    // Messages area
    this._chatMsgText = this.add.text(16, chatY + 28, this._chatMessages.slice(-6).join('\n'), {
      fontSize: '10px', color: '#cccccc', fontFamily: 'Arial', wordWrap: { width: W - 40 }, lineSpacing: 3,
    });
    this._chatPanel.push(this._chatMsgText);

    // Input
    const inp = this.add.dom(W/2, chatY + chatH - 20, 'input', {
      width: `${W - 80}px`, height: '28px',
      background: '#0a0a1e', border: '1px solid #4169E1', borderRadius: '6px',
      color: '#ffffff', fontSize: '12px', padding: '0 8px',
    });
    inp.node.placeholder = 'Say something...';
    inp.node.maxLength = 200;
    this._chatPanel.push(inp);

    const send = this.add.text(W - 24, chatY + chatH - 20, '▶', {
      fontSize: '16px', color: '#4169E1',
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    send.on('pointerdown', () => {
      const msg = inp.node.value.trim();
      if (!msg) return;
      window.MLA.socket?.sendChat('global', msg);
      inp.node.value = '';
    });
    this._chatPanel.push(send);
  }

  _setupSocketListeners() {
    const socket = window.MLA?.socket;
    if (!socket) return;

    this._sockUnsub = [
      socket.on('matchmaking:matched', (data) => {
        this._onMatchFound(data);
      }),
      socket.on('matchmaking:queued', (data) => {
        this._showToast(`In queue... (${data.queueSize} players)`);
      }),
      socket.on('chat:message', (data) => {
        const msg = `${data.username}: ${data.message}`;
        this._chatMessages.push(msg);
        if (this._chatMessages.length > 50) this._chatMessages.shift();
        if (this._chatMsgText) {
          this._chatMsgText.setText(this._chatMessages.slice(-6).join('\n'));
        }
      }),
      socket.on('world:challenge_received', (data) => {
        this._showChallengeDialog(data);
      }),
      socket.on('world:player_joined', (data) => {
        this._showToast(`${data.username} entered the region`, 2000);
      }),
    ];

    // Join global chat
    socket.joinChat('global');
  }

  _onMatchFound(data) {
    this._showToast(`Match found! vs ${data.opponent?.username}`, 3000);
    this.time.delayedCall(1500, () => {
      this.scene.start('BattleScene', {
        battleId: data.battleId,
        type: 'pvp',
        side: data.side,
      });
    });
  }

  _showChallengeDialog(data) {
    const { W, H } = this;
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a2e, 0.97);
    bg.fillRoundedRect(W/2 - 120, H/2 - 60, 240, 120, 12);
    const txt = this.add.text(W/2, H/2 - 40, `⚔️ ${data.fromUsername} challenges you!`, {
      fontSize: '13px', color: '#FFD700', fontFamily: 'Arial', wordWrap: { width: 220 },
    }).setOrigin(0.5);

    const accept = this.add.text(W/2 - 50, H/2 + 10, '✅ Accept', { fontSize: '14px', color: '#00DD00' }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    const decline= this.add.text(W/2 + 50, H/2 + 10, '❌ Decline', { fontSize: '14px', color: '#DD0000' }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });

    accept.on('pointerdown', () => {
      window.MLA.socket?.respondChallenge(data.from, true);
      [bg, txt, accept, decline].forEach(o => o.destroy());
    });
    decline.on('pointerdown', () => {
      window.MLA.socket?.respondChallenge(data.from, false);
      [bg, txt, accept, decline].forEach(o => o.destroy());
    });

    this.time.delayedCall(15000, () => [bg, txt, accept, decline].forEach(o => o.destroy?.()));
  }

  async _startWildBattle(regionId) {
    try {
      this._showToast('Searching for wild monster...');
      const res = await window.MLA.api.startWildBattle(regionId);
      if (res.success) {
        window.MLA.store.set('currentBattle', res.data.battleId);
        this.scene.start('WildBattleScene', { battleId: res.data.battleId, state: res.data, type: 'pve' });
      } else {
        this._showToast(res.message || 'No monsters found.', 2000);
      }
    } catch (err) {
      this._showToast(err.response?.data?.message || 'Failed to start battle.', 3000);
    }
  }

  async _startStoryBattle(regionId) {
    try {
      const region = REGIONS.find(r => r.id === regionId);
      const res = await window.MLA.api.startPvEBattle(`npc_${regionId}`, regionId);
      if (res.success) {
        this.scene.start('BattleScene', { battleId: res.data.battleId, state: res.data, type: 'pve' });
      }
    } catch (err) {
      this._showToast('No trainer available here.', 2000);
    }
  }

  async _joinMatchmaking(mode) {
    const socket = window.MLA?.socket;
    if (!socket?.isConnected) {
      this._showToast('Not connected to server.', 2000); return;
    }
    socket.joinMatchmaking(mode, (res) => {
      if (res.error) this._showToast(res.error, 2000);
      else this._showToast(`Searching for ${mode} match...`);
    });
  }

  _exploreRegion(region) {
    this._showToast(`Exploring ${region.name}...`);
    window.MLA.api.getRegion(region.id).then(res => {
      if (res.success) this._showToast(`${region.name}: ${region.types.join(', ')} types`, 3000);
    }).catch(() => {});
  }

  _enterRegion(regionId) {
    window.MLA.store.set('currentRegion', regionId);
  }

  async _loadPlayerData() {
    if (!window.MLA.store.isLoggedIn) return;
    try {
      const [teamRes] = await Promise.all([window.MLA.api.getTeam()]);
      if (teamRes.success) window.MLA.store.set('activeTeam', teamRes.data);
    } catch { /* non-critical */ }
  }

  _showToast(msg, duration = 3000) {
    const { W, H } = this;
    const toast = this.add.text(W/2, H * 0.92, msg, {
      fontSize: '12px', color: '#ffffff', backgroundColor: '#0a0a2e',
      padding: { x: 14, y: 8 }, fontFamily: 'Arial',
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: toast, alpha: 1, duration: 200 });
    this.time.delayedCall(duration - 300, () => this.tweens.add({ targets: toast, alpha: 0, duration: 300, onComplete: () => toast.destroy() }));
  }

  shutdown() {
    this._sockUnsub?.forEach(fn => fn?.());
    this._sockUnsub = [];
  }
}
