import Phaser from 'phaser';
import { RARITY_COLORS_CSS, TYPE_COLORS_CSS, formatNumber, getTypeIcon, getRankIcon, timeUntil } from '../utils/gameUtils.js';

// ─── Shared base for info-screen scenes ──────────────────────────────────────
class BaseUIScene extends Phaser.Scene {
  _buildBase(title) {
    const { width: W, height: H } = this.scale;
    this.W = W; this.H = H;
    const g = this.add.graphics();
    g.fillGradientStyle(0x050510, 0x050510, 0x0a0a20, 0x0a0a20, 1);
    g.fillRect(0, 0, W, H);

    // Header
    const hdr = this.add.graphics();
    hdr.fillStyle(0x0d0d2b, 0.97);
    hdr.fillRect(0, 0, W, 50);
    hdr.lineStyle(1, 0x4169E1, 0.3);
    hdr.lineBetween(0, 50, W, 50);

    const back = this.add.text(14, 14, '← Back', { fontSize: '13px', color: '#aaaaaa', fontFamily: 'Arial' }).setInteractive({ cursor: 'pointer' });
    back.on('pointerdown', () => this.scene.start('WorldMapScene'));
    back.on('pointerover', () => back.setColor('#ffffff'));
    back.on('pointerout',  () => back.setColor('#aaaaaa'));

    this.add.text(W / 2, 16, title, { fontSize: '16px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5, 0);
    return { W, H };
  }

  _showToast(msg, color = '#ffffff') {
    const toast = this.add.text(this.W/2, this.H - 60, msg, {
      fontSize: '12px', color, backgroundColor: '#0a0a2e', padding: { x: 12, y: 6 }, fontFamily: 'Arial',
    }).setOrigin(0.5).setAlpha(0).setDepth(100);
    this.tweens.add({ targets: toast, alpha: 1, duration: 200 });
    this.time.delayedCall(2500, () => this.tweens.add({ targets: toast, alpha: 0, duration: 300, onComplete: () => toast.destroy() }));
  }

  _loader(visible) {
    if (!this._loaderText) {
      this._loaderText = this.add.text(this.W/2, this.H/2, '⏳ Loading...', {
        fontSize: '16px', color: '#ffffff', fontFamily: 'Arial',
      }).setOrigin(0.5).setDepth(50);
    }
    this._loaderText.setVisible(visible);
  }

  _scrollList(items, startY, endY, renderFn) {
    const container = this.add.container(0, 0);
    let offsetY = 0;
    items.forEach((item, i) => {
      const el = renderFn(item, i, offsetY);
      if (Array.isArray(el)) el.forEach(o => container.add(o));
      else container.add(el);
      offsetY += 80;
    });

    // Simple drag scroll
    let startDragY = null;
    let startContY = 0;
    this.input.on('pointerdown', (ptr) => { startDragY = ptr.y; startContY = container.y; });
    this.input.on('pointermove', (ptr) => {
      if (startDragY === null) return;
      const maxScroll = Math.max(0, offsetY - (endY - startY));
      container.y = Phaser.Math.Clamp(startContY + (ptr.y - startDragY), -maxScroll, 0) + startY;
    });
    this.input.on('pointerup', () => { startDragY = null; });
    container.y = startY;

    // Clip mask
    const mask = this.add.graphics();
    mask.fillRect(0, startY, this.W, endY - startY);
    container.setMask(mask.createGeometryMask());
    return container;
  }
}

// ─── WildBattleScene (extends BattleScene functionality) ─────────────────────
export class WildBattleScene extends Phaser.Scene {
  constructor() { super({ key: 'WildBattleScene' }); }
  init(data) { this.battleData = data; }
  create() {
    // Delegate fully to BattleScene with capture support
    this.scene.start('BattleScene', { ...this.battleData, allowCapture: true });
  }
}

// ─── MonsterBoxScene ──────────────────────────────────────────────────────────
export class MonsterBoxScene extends BaseUIScene {
  constructor() { super({ key: 'MonsterBoxScene' }); }

  async create() {
    const { W, H } = this._buildBase('🐲 Monster Box');
    this._loader(true);
    try {
      const [boxRes, teamRes] = await Promise.all([
        window.MLA.api.getMyMonsters({ limit: 50 }),
        window.MLA.api.getTeam(),
      ]);
      this._loader(false);
      if (boxRes.success) this._renderBox(boxRes.data, teamRes.data || []);
    } catch { this._loader(false); this._showToast('Failed to load monsters.', '#FF4444'); }
  }

  _renderBox(monsters, team) {
    const { W, H } = this;
    const teamIds = team.map(m => m._id?.toString());

    // Tabs
    this._tab = 'all';
    const tabs = ['all','team','box','shiny'];
    tabs.forEach((tab, i) => {
      const tx = 16 + i * (W/4 - 2);
      const tabBtn = this.add.text(tx, 58, tab.toUpperCase(), {
        fontSize: '10px', color: this._tab === tab ? '#FFD700' : '#888888', fontFamily: 'Arial',
        backgroundColor: '#1a1a4e', padding: { x: 8, y: 4 },
      }).setInteractive({ cursor: 'pointer' });
      tabBtn.on('pointerdown', () => { /* re-render filtered */ });
    });

    // Stats bar
    const statsY = 82;
    this.add.text(16, statsY, `Total: ${monsters.length}  |  Shiny: ${monsters.filter(m=>m.isShiny).length}  |  In Team: ${teamIds.length}`, {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'Arial',
    });

    // Monster grid — 2 columns
    const colW = (W - 24) / 2;
    const gridTop = 100;
    const cardH = 72;
    const gap = 4;

    this._scrollList(monsters, gridTop, H - 60, (monster, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 8 + col * (colW + 8);
      const y = row * (cardH + gap);
      return this._renderMonsterCard(monster, x, y, colW, cardH, teamIds.includes(monster._id?.toString()));
    });
  }

  _renderMonsterCard(monster, x, y, w, h, inTeam) {
    const rarityColor = parseInt(RARITY_COLORS_CSS[monster.rarity]?.replace('#','') || 'A9A9A9', 16);
    const typeColor   = parseInt(TYPE_COLORS_CSS[monster.types?.primary]?.replace('#','') || '888888', 16);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a4e, 0.9);
    bg.fillRoundedRect(x, y, w, h, 8);
    bg.lineStyle(1, rarityColor, 0.6);
    bg.strokeRoundedRect(x, y, w, h, 8);

    // Monster icon placeholder
    const iconKey = `monster_placeholder_${monster.types?.primary?.toLowerCase() || 'normal'}`;
    const icon = this.add.image(x + 32, y + h/2, iconKey).setDisplaySize(52, 52);

    const name = this.add.text(x + 62, y + 6, monster.nickname || monster.name, {
      fontSize: '11px', fontStyle: 'bold', color: '#ffffff', fontFamily: 'Arial',
    });

    const lvl = this.add.text(x + 62, y + 20, `Lv.${monster.level}  ${getTypeIcon(monster.types?.primary)} ${monster.types?.primary}`, {
      fontSize: '9px', color: '#aaaaaa', fontFamily: 'Arial',
    });

    const rarity = this.add.text(x + w - 6, y + 6, monster.rarity.toUpperCase(), {
      fontSize: '8px', color: `#${rarityColor.toString(16).padStart(6,'0')}`, fontFamily: 'Arial',
    }).setOrigin(1, 0);

    const shiny = monster.isShiny ? this.add.text(x + 6, y + 6, '✨', { fontSize: '10px' }) : null;
    const teamBadge = inTeam ? this.add.text(x + 6, y + h - 14, '⚔️ Team', { fontSize: '8px', color: '#00DD00' }) : null;

    // Tap to open detail
    const hit = this.add.rectangle(x + w/2, y + h/2, w, h, 0, 0).setInteractive({ cursor: 'pointer' });
    hit.on('pointerdown', () => this._openMonsterDetail(monster));

    return [bg, icon, name, lvl, rarity, shiny, teamBadge, hit].filter(Boolean);
  }

  _openMonsterDetail(monster) {
    this.scene.launch('DialogScene', { type: 'monster_detail', monster });
  }
}

// ─── InventoryScene ───────────────────────────────────────────────────────────
export class InventoryScene extends BaseUIScene {
  constructor() { super({ key: 'InventoryScene' }); }

  async create() {
    const { W, H } = this._buildBase('👜 Inventory');
    this._loader(true);
    try {
      const res = await window.MLA.api.getInventory();
      this._loader(false);
      if (res.success) this._renderInventory(res.data);
    } catch { this._loader(false); }
  }

  _renderInventory(inventory) {
    const { W, H } = this;
    const cats = ['All','consumable','capture_ball','evolution_stone','held_item'];
    this._activeCat = 'All';

    // Category tabs
    cats.forEach((cat, i) => {
      const tw = (W - 16) / cats.length;
      const t = this.add.text(8 + i * tw + tw/2, 58, cat === 'All' ? 'All' : cat.replace('_',' '), {
        fontSize: '9px', color: '#aaaaaa', fontFamily: 'Arial',
        backgroundColor: '#1a1a4e', padding: { x: 4, y: 4 },
      }).setOrigin(0.5, 0).setInteractive({ cursor: 'pointer' });
      t.on('pointerdown', () => this._filterItems(cat, inventory));
    });

    this._renderItems(inventory.slots || [], 90, H - 60);
  }

  _filterItems(cat, inventory) {
    this._activeCat = cat;
    const filtered = cat === 'All' ? inventory.slots : inventory.slots.filter(s => s.category === cat);
    this._renderItems(filtered, 90, this.H - 60);
  }

  _renderItems(items, startY, endY) {
    if (this._itemContainer) this._itemContainer.destroy(true);
    const { W } = this;
    const cols = 4;
    const slotS = (W - 24) / cols;

    const objs = [];
    items.forEach((slot, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 12 + col * slotS;
      const y = row * (slotS + 4);

      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.9);
      bg.fillRoundedRect(x, y, slotS - 4, slotS - 4, 8);

      const icon = this.add.text(x + (slotS-4)/2, y + (slotS-4)/2 - 8, '📦', { fontSize: '22px' }).setOrigin(0.5);
      const name = this.add.text(x + (slotS-4)/2, y + (slotS-4) - 14, slot.name?.slice(0,8) || slot.itemId, {
        fontSize: '7px', color: '#aaaaaa', fontFamily: 'Arial',
      }).setOrigin(0.5);
      const qty = this.add.text(x + slotS - 8, y + 4, `×${slot.quantity}`, {
        fontSize: '8px', color: '#FFD700', fontFamily: 'Arial',
      }).setOrigin(1, 0);

      const hit = this.add.rectangle(x + (slotS-4)/2, y + (slotS-4)/2, slotS-4, slotS-4, 0, 0).setInteractive({ cursor: 'pointer' });
      hit.on('pointerdown', () => this._useItem(slot));
      objs.push(bg, icon, name, qty, hit);
    });

    this._itemContainer = this.add.container(0, startY, objs);
  }

  _useItem(slot) {
    this.scene.launch('DialogScene', {
      type: 'use_item',
      item: slot,
      onUse: async (itemId, targetId) => {
        try {
          const res = await window.MLA.api.useItem(itemId, targetId);
          if (res.success) this._showToast(res.message || 'Used!', '#00DD00');
          else this._showToast(res.message || 'Cannot use this now.', '#FF4444');
        } catch (err) {
          this._showToast(err.response?.data?.message || 'Failed.', '#FF4444');
        }
      },
    });
  }
}

// ─── ShopScene ────────────────────────────────────────────────────────────────
export class ShopScene extends BaseUIScene {
  constructor() { super({ key: 'ShopScene' }); }

  async create() {
    const { W, H } = this._buildBase('🏪 Shop');
    this._loader(true);
    try {
      const res = await window.MLA.api.getShopItems();
      this._loader(false);
      if (res.success) this._renderShop(res.data);
    } catch { this._loader(false); }
  }

  _renderShop(items) {
    const { W, H } = this;
    const user = window.MLA.store.user;
    this.add.text(16, 58, `💰 ${user?.gameData?.coins || 0}   💎 ${user?.gameData?.gems || 0}`, {
      fontSize: '13px', color: '#FFD700', fontFamily: 'Arial',
    });

    this._scrollList(items, 80, H - 60, (item, i) => {
      const y = i * 70;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.9);
      bg.fillRoundedRect(8, y, W - 16, 64, 8);

      const name = this.add.text(72, y + 8, item.name, { fontSize: '13px', fontStyle: 'bold', color: '#fff', fontFamily: 'Arial' });
      const desc = this.add.text(72, y + 26, item.description?.slice(0, 55), { fontSize: '9px', color: '#aaa', fontFamily: 'Arial' });
      const price = this.add.text(72, y + 42, item.price.coins ? `💰 ${item.price.coins}` : `💎 ${item.price.gems}`, {
        fontSize: '11px', color: '#FFD700', fontFamily: 'Arial',
      });

      const buyBtn = this.add.text(W - 16, y + 32, 'BUY', {
        fontSize: '12px', fontStyle: 'bold', color: '#fff', backgroundColor: '#228B22', padding: { x: 12, y: 6 }, fontFamily: 'Arial',
      }).setOrigin(1, 0.5).setInteractive({ cursor: 'pointer' });
      buyBtn.on('pointerdown', () => this._buyItem(item));

      const icon = this.add.text(32, y + 32, '🛍️', { fontSize: '24px' }).setOrigin(0.5);
      return [bg, name, desc, price, buyBtn, icon];
    });
  }

  async _buyItem(item) {
    try {
      const res = await window.MLA.api.buyItem(item.itemId, 1);
      if (res.success) {
        this._showToast(res.message || 'Purchased!', '#00DD00');
        const me = await window.MLA.api.getMe();
        if (me.success) window.MLA.store.setUser(me.user, window.MLA.store.token);
      } else {
        this._showToast(res.message || 'Purchase failed.', '#FF4444');
      }
    } catch (err) {
      this._showToast(err.response?.data?.message || 'Insufficient funds.', '#FF4444');
    }
  }
}

// ─── MarketplaceScene ─────────────────────────────────────────────────────────
export class MarketplaceScene extends BaseUIScene {
  constructor() { super({ key: 'MarketplaceScene' }); }

  async create() {
    const { W, H } = this._buildBase('🏦 Marketplace');
    this._loader(true);
    try {
      const res = await window.MLA.api.getListings({ type: 'monster' });
      this._loader(false);
      if (res.success) this._renderListings(res.data);
    } catch { this._loader(false); }
  }

  _renderListings(listings) {
    const { W, H } = this;
    const listBtn = this.add.text(W - 16, 58, '+ List Monster', {
      fontSize: '11px', color: '#FFD700', backgroundColor: '#1a1a4e', padding: { x: 8, y: 4 }, fontFamily: 'Arial',
    }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
    listBtn.on('pointerdown', () => this._showListDialog());

    if (listings.length === 0) {
      this.add.text(W/2, H/2, 'No listings found.\nBe the first to sell!', {
        fontSize: '14px', color: '#666666', fontFamily: 'Arial', align: 'center',
      }).setOrigin(0.5);
      return;
    }

    this._scrollList(listings, 80, H - 60, (listing, i) => {
      const y = i * 74;
      const ms = listing.monsterSnapshot || {};
      const rarityHex = RARITY_COLORS_CSS[ms.rarity] || '#A9A9A9';
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.9);
      bg.fillRoundedRect(8, y, W - 16, 68, 8);
      bg.lineStyle(1, parseInt(rarityHex.replace('#',''), 16), 0.5);
      bg.strokeRoundedRect(8, y, W - 16, 68, 8);

      const typeKey = `monster_placeholder_${ms.types?.primary?.toLowerCase() || 'normal'}`;
      const icon = this.add.image(36, y + 34, typeKey).setDisplaySize(48, 48);

      const name  = this.add.text(66, y + 6, `${ms.nickname || ms.name || 'Unknown'} ${ms.isShiny ? '✨' : ''}`, { fontSize: '12px', fontStyle: 'bold', color: '#fff', fontFamily: 'Arial' });
      const info  = this.add.text(66, y + 22, `Lv.${ms.level}  ${getTypeIcon(ms.types?.primary)} ${ms.types?.primary}  IV:${ms.ivTotal || '?'}`, { fontSize: '9px', color: '#aaa', fontFamily: 'Arial' });
      const seller= this.add.text(66, y + 36, `Seller: ${listing.sellerUsername}`, { fontSize: '9px', color: '#aaa', fontFamily: 'Arial' });
      const price = this.add.text(66, y + 50, listing.price.type === 'coins' ? `💰 ${formatNumber(listing.price.amount)}` : `💎 ${listing.price.amount}`, {
        fontSize: '13px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial',
      });

      const isOwn = listing.seller?.toString() === window.MLA.store.user?._id?.toString();
      const btn = this.add.text(W - 16, y + 34, isOwn ? 'Cancel' : 'Buy', {
        fontSize: '12px', fontStyle: 'bold', color: '#fff',
        backgroundColor: isOwn ? '#CC0000' : '#228B22', padding: { x: 10, y: 5 }, fontFamily: 'Arial',
      }).setOrigin(1, 0.5).setInteractive({ cursor: 'pointer' });
      btn.on('pointerdown', () => isOwn ? this._cancelListing(listing) : this._buyListing(listing));

      return [bg, icon, name, info, seller, price, btn];
    });
  }

  async _buyListing(listing) {
    try {
      const res = await window.MLA.api.buyListing(listing.listingId);
      if (res.success) { this._showToast('Purchase successful! 🎉', '#00DD00'); this.scene.restart(); }
      else this._showToast(res.message || 'Purchase failed.', '#FF4444');
    } catch (err) { this._showToast(err.response?.data?.message || 'Failed.', '#FF4444'); }
  }

  async _cancelListing(listing) {
    try {
      const res = await window.MLA.api.cancelListing(listing.listingId);
      if (res.success) { this._showToast('Listing cancelled.', '#FFD700'); this.scene.restart(); }
    } catch { this._showToast('Failed to cancel.', '#FF4444'); }
  }

  _showListDialog() {
    this.scene.launch('DialogScene', { type: 'list_monster', onList: () => this.scene.restart() });
  }
}

// ─── TournamentScene ──────────────────────────────────────────────────────────
export class TournamentScene extends BaseUIScene {
  constructor() { super({ key: 'TournamentScene' }); }

  async create() {
    const { W, H } = this._buildBase('🏆 Tournaments');
    this._loader(true);
    try {
      const res = await window.MLA.api.getTournaments();
      this._loader(false);
      if (res.success) this._renderTournaments(res.data);

      // Also show PvP quick-join
      this._buildPvPSection();
    } catch { this._loader(false); }
  }

  _buildPvPSection() {
    const { W, H } = this;
    const pvpY = H - 120;
    const g = this.add.graphics();
    g.fillStyle(0x0d0d2b, 0.97);
    g.fillRoundedRect(8, pvpY, W - 16, 60, 10);

    this.add.text(W/2, pvpY + 10, '⚔️ Quick PvP', { fontSize: '14px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5, 0);

    const modeW = (W - 32) / 2;
    ['Casual', 'Ranked'].forEach((mode, i) => {
      const bx = 12 + i * (modeW + 8) + modeW/2;
      const btn = this.add.text(bx, pvpY + 34, mode, {
        fontSize: '13px', color: '#fff', backgroundColor: i === 0 ? '#1E90FF' : '#FF6B35',
        padding: { x: 20, y: 6 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      btn.on('pointerdown', () => {
        window.MLA.socket?.joinMatchmaking(mode.toLowerCase(), (res) => {
          if (res.error) this._showToast(res.error, '#FF4444');
          else this._showToast(`Joining ${mode} queue...`);
        });
        this.scene.start('WorldMapScene');
      });
    });
  }

  _renderTournaments(tournaments) {
    const { W, H } = this;
    if (tournaments.length === 0) {
      this.add.text(W/2, H/2 - 80, '🏆\n\nNo active tournaments.\nCheck back soon!', {
        fontSize: '14px', color: '#666666', fontFamily: 'Arial', align: 'center', lineSpacing: 8,
      }).setOrigin(0.5);
      return;
    }

    this._scrollList(tournaments, 65, H - 130, (t, i) => {
      const y = i * 90;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.9);
      bg.fillRoundedRect(8, y, W - 16, 84, 10);

      const name    = this.add.text(16, y + 8, t.name, { fontSize: '13px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' });
      const status  = this.add.text(W - 16, y + 8, t.status.toUpperCase(), { fontSize: '10px', color: t.status === 'in_progress' ? '#00FF00' : '#FFD700', fontFamily: 'Arial' }).setOrigin(1, 0);
      const players = this.add.text(16, y + 26, `👥 ${t.participants?.length || 0}/${t.config?.maxParticipants || 16} players`, { fontSize: '10px', color: '#aaa', fontFamily: 'Arial' });
      const startT  = this.add.text(16, y + 40, `⏰ ${t.schedule?.startTime ? timeUntil(t.schedule.startTime) : 'TBD'}`, { fontSize: '10px', color: '#aaa', fontFamily: 'Arial' });
      const prizes  = this.add.text(16, y + 56, `🏆 1st: ${t.rewards?.first?.coins || 0}💰 ${t.rewards?.first?.gems || 0}💎`, { fontSize: '10px', color: '#FFD700', fontFamily: 'Arial' });

      const regBtn = this.add.text(W - 16, y + 54, 'Register', {
        fontSize: '11px', color: '#fff', backgroundColor: '#FF6B35', padding: { x: 10, y: 4 }, fontFamily: 'Arial',
      }).setOrigin(1).setInteractive({ cursor: 'pointer' });
      regBtn.on('pointerdown', () => this._registerTournament(t._id));

      return [bg, name, status, players, startT, prizes, regBtn];
    });
  }

  async _registerTournament(id) {
    try {
      const res = await window.MLA.api.registerTournament(id);
      if (res.success) { this._showToast('Registered! ✅', '#00DD00'); this.scene.restart(); }
      else this._showToast(res.message || 'Registration failed.', '#FF4444');
    } catch (err) { this._showToast(err.response?.data?.message || 'Failed.', '#FF4444'); }
  }
}

// ─── GuildScene ───────────────────────────────────────────────────────────────
export class GuildScene extends BaseUIScene {
  constructor() { super({ key: 'GuildScene' }); }

  async create() {
    const { W, H } = this._buildBase('⚔️ Guilds');
    this._loader(true);
    try {
      const user = window.MLA.store.user;
      if (user?.social?.guild) {
        const res = await window.MLA.api.getGuild(user.social.guild);
        this._loader(false);
        if (res.success) this._renderMyGuild(res.data);
      } else {
        const res = await window.MLA.api.getGuilds();
        this._loader(false);
        if (res.success) this._renderGuildSearch(res.data);
      }
    } catch { this._loader(false); }
  }

  _renderMyGuild(guild) {
    const { W, H } = this;
    this.add.text(W/2, 62, `${guild.name} [${guild.tag}]`, { fontSize: '16px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);
    this.add.text(W/2, 82, `Lv.${guild.stats?.level || 1} • ${guild.stats?.memberCount || 1} members`, { fontSize: '12px', color: '#aaa', fontFamily: 'Arial' }).setOrigin(0.5);
    this.add.text(W/2, 96, guild.description || 'No description.', { fontSize: '10px', color: '#888', fontFamily: 'Arial', wordWrap: { width: W - 40 }, align: 'center' }).setOrigin(0.5, 0);

    const stats = [
      `🏆 Wins: ${guild.stats?.totalWins || 0}`, `🐉 Bosses: ${guild.stats?.bossesDefeated || 0}`,
      `💰 Treasury: ${formatNumber(guild.treasury?.coins || 0)}`, `🌟 Rank: ${guild.ranking?.globalRank || '?'}`,
    ];
    stats.forEach((s, i) => {
      this.add.text(i < 2 ? 20 : W/2 + 10, 140 + Math.floor(i/2) * 22, s, { fontSize: '11px', color: '#ffffff', fontFamily: 'Arial' });
    });

    // Members list
    this.add.text(16, 190, 'Members:', { fontSize: '12px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' });
    this._scrollList(guild.members || [], 210, H - 60, (member, i) => {
      const y = i * 36;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.8);
      bg.fillRoundedRect(8, y, W - 16, 32, 6);
      const name = this.add.text(16, y + 8, `${member.role === 'leader' ? '👑' : member.role === 'officer' ? '⭐' : '•'} ${member.username}`, { fontSize: '11px', color: '#fff', fontFamily: 'Arial' });
      const contrib = this.add.text(W - 16, y + 8, `${formatNumber(member.contribution || 0)} pts`, { fontSize: '10px', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(1, 0);
      return [bg, name, contrib];
    });
  }

  _renderGuildSearch(guilds) {
    const { W, H } = this;
    const createBtn = this.add.text(W - 16, 58, '+ Create Guild', {
      fontSize: '11px', color: '#FFD700', backgroundColor: '#1a1a4e', padding: { x: 8, y: 4 }, fontFamily: 'Arial',
    }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
    createBtn.on('pointerdown', () => this._showCreateGuildDialog());

    this._scrollList(guilds, 78, H - 60, (guild, i) => {
      const y = i * 76;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.9);
      bg.fillRoundedRect(8, y, W - 16, 70, 8);

      const name = this.add.text(16, y + 8, `[${guild.tag}] ${guild.name}`, { fontSize: '13px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' });
      const info = this.add.text(16, y + 26, guild.description?.slice(0, 50) || 'Join us!', { fontSize: '9px', color: '#aaa', fontFamily: 'Arial' });
      const stats= this.add.text(16, y + 42, `Lv.${guild.stats?.level || 1} • ${guild.stats?.memberCount || 1} members`, { fontSize: '10px', color: '#fff', fontFamily: 'Arial' });
      const joinBtn = this.add.text(W - 16, y + 35, 'Join', {
        fontSize: '12px', color: '#fff', backgroundColor: '#228B22', padding: { x: 12, y: 5 }, fontFamily: 'Arial',
      }).setOrigin(1, 0.5).setInteractive({ cursor: 'pointer' });
      joinBtn.on('pointerdown', () => this._joinGuild(guild._id));
      return [bg, name, info, stats, joinBtn];
    });
  }

  async _joinGuild(id) {
    try {
      const res = await window.MLA.api.joinGuild(id);
      if (res.success) { this._showToast(res.message, '#00DD00'); this.scene.restart(); }
      else this._showToast(res.message || 'Failed to join.', '#FF4444');
    } catch (err) { this._showToast(err.response?.data?.message || 'Error.', '#FF4444'); }
  }

  _showCreateGuildDialog() {
    this.scene.launch('DialogScene', {
      type: 'create_guild',
      onCreated: () => this.scene.restart(),
    });
  }
}

// ─── QuestScene ───────────────────────────────────────────────────────────────
export class QuestScene extends BaseUIScene {
  constructor() { super({ key: 'QuestScene' }); }

  async create() {
    const { W, H } = this._buildBase('📜 Quests');
    this._loader(true);
    try {
      const res = await window.MLA.api.getQuests();
      this._loader(false);
      if (res.success) this._renderQuests(res.data);
    } catch { this._loader(false); }
  }

  _renderQuests(quests) {
    const { W, H } = this;
    const tabs = ['daily','weekly','story'];
    let activeTab = 'daily';

    const renderTab = (type) => {
      activeTab = type;
      const filtered = quests.filter(q => q.type === type);
      this._scrollList(filtered, 90, H - 60, (q, i) => {
        const y = i * 84;
        const prog = q.progress;
        const done = prog?.status === 'completed';
        const claimed = prog?.rewardClaimed;

        const bg = this.add.graphics();
        bg.fillStyle(done ? 0x0a2a0a : 0x1a1a4e, 0.9);
        bg.fillRoundedRect(8, y, W - 16, 78, 8);
        bg.lineStyle(1, done ? 0x00DD00 : 0x4169E1, 0.4);
        bg.strokeRoundedRect(8, y, W - 16, 78, 8);

        const name = this.add.text(16, y + 8, q.name, { fontSize: '13px', fontStyle: 'bold', color: done ? '#00DD00' : '#fff', fontFamily: 'Arial' });
        const desc = this.add.text(16, y + 24, q.description, { fontSize: '10px', color: '#aaa', fontFamily: 'Arial', wordWrap: { width: W - 80 } });

        const obj = q.objectives?.[0];
        const current = prog?.progress?.[0]?.current || 0;
        const target  = obj?.count || 1;
        const pct = Math.min(1, current / target);

        // Progress bar
        const barBg = this.add.graphics();
        barBg.fillStyle(0x333333); barBg.fillRoundedRect(16, y + 50, W - 80, 8, 4);
        const barFill = this.add.graphics();
        barFill.fillStyle(done ? 0x00DD00 : 0x4169E1); barFill.fillRoundedRect(16, y + 50, (W - 80) * pct, 8, 4);
        const progText = this.add.text(16, y + 60, `${current}/${target}`, { fontSize: '9px', color: '#aaa', fontFamily: 'Arial' });

        const rwdText = this.add.text(W - 16, y + 8, `💰${q.rewards?.coins || 0} 💎${q.rewards?.gems || 0}`, {
          fontSize: '10px', color: '#FFD700', fontFamily: 'Arial',
        }).setOrigin(1, 0);

        if (done && !claimed) {
          const claimBtn = this.add.text(W - 16, y + 50, 'CLAIM!', {
            fontSize: '11px', fontStyle: 'bold', color: '#fff', backgroundColor: '#FF6B35', padding: { x: 8, y: 4 }, fontFamily: 'Arial',
          }).setOrigin(1, 0).setInteractive({ cursor: 'pointer' });
          claimBtn.on('pointerdown', () => this._claimQuest(q.questId));
          return [bg, name, desc, barBg, barFill, progText, rwdText, claimBtn];
        }
        return [bg, name, desc, barBg, barFill, progText, rwdText];
      });
    };

    tabs.forEach((tab, i) => {
      const tw = (W - 16) / tabs.length;
      const t = this.add.text(8 + i * tw + tw/2, 60, tab.toUpperCase(), {
        fontSize: '11px', color: '#aaa', backgroundColor: '#1a1a4e', padding: { x: 8, y: 6 }, fontFamily: 'Arial',
      }).setOrigin(0.5, 0).setInteractive({ cursor: 'pointer' });
      t.on('pointerdown', () => renderTab(tab));
    });

    renderTab('daily');
  }

  async _claimQuest(questId) {
    try {
      const res = await window.MLA.api.claimQuestReward(questId);
      if (res.success) { this._showToast('Rewards claimed! 🎉', '#00DD00'); this.scene.restart(); }
      else this._showToast(res.message || 'Failed.', '#FF4444');
    } catch { this._showToast('Error claiming reward.', '#FF4444'); }
  }
}

// ─── BattlePassScene ──────────────────────────────────────────────────────────
export class BattlePassScene extends BaseUIScene {
  constructor() { super({ key: 'BattlePassScene' }); }

  async create() {
    const { W, H } = this._buildBase('🎫 Battle Pass');
    this._loader(true);
    try {
      const [bpRes, meRes] = await Promise.all([window.MLA.api.getBattlePass(), window.MLA.api.getMe()]);
      this._loader(false);
      if (bpRes.success) this._renderBattlePass(bpRes.data, meRes.user);
    } catch { this._loader(false); }
  }

  _renderBattlePass(bp, user) {
    const { W, H } = this;
    const userBP = user?.battlePass || {};
    const isPremium = userBP.isPremium;
    const userLevel = userBP.level || 0;

    this.add.text(W/2, 60, bp.name, { fontSize: '14px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);

    // Progress
    const progText = `Level ${userLevel} / ${bp.maxLevel}`;
    this.add.text(W/2, 78, progText, { fontSize: '11px', color: '#aaa', fontFamily: 'Arial' }).setOrigin(0.5);
    const barBg = this.add.graphics(); barBg.fillStyle(0x333333); barBg.fillRoundedRect(16, 92, W - 32, 10, 5);
    const barF  = this.add.graphics(); barF.fillStyle(0xFF6B35); barF.fillRoundedRect(16, 92, (W-32)*(userLevel/bp.maxLevel), 10, 5);

    if (!isPremium) {
      const buyBtn = this.add.text(W/2, 112, `💎 Get Premium — ${bp.premiumPrice?.gems || 800} Gems`, {
        fontSize: '13px', fontStyle: 'bold', color: '#fff', backgroundColor: '#FF6B35', padding: { x: 20, y: 8 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      buyBtn.on('pointerdown', () => this._purchase());
    } else {
      this.add.text(W/2, 112, '⭐ Premium Active', { fontSize: '13px', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);
    }

    // Reward track
    const claimed = userBP.claimedRewards || [];
    const visibleLevels = bp.levels?.slice(0, 20) || [];
    this._scrollList(visibleLevels, 140, H - 60, (lvl, i) => {
      const y = i * 70;
      const reached = userLevel >= lvl.level;
      const freeKey = `${lvl.level}_free`;
      const premKey = `${lvl.level}_premium`;
      const freeClaimed = claimed.includes(freeKey);
      const premClaimed = claimed.includes(premKey);

      const bg = this.add.graphics();
      bg.fillStyle(reached ? 0x1a3a1a : 0x1a1a4e, 0.9);
      bg.fillRoundedRect(8, y, W-16, 64, 8);

      const lvlText = this.add.text(24, y + 22, `${lvl.level}`, { fontSize: '18px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);
      const free = lvl.freeReward;
      const prem = lvl.premiumReward;

      const freeText = this.add.text(50, y + 8, `Free: 💰${free.coins||0} 💎${free.gems||0} ${free.title ? '📛'+free.title : ''}`, {
        fontSize: '10px', color: '#fff', fontFamily: 'Arial',
      });
      const premText = this.add.text(50, y + 28, `Premium: 💰${prem.coins||0} 💎${prem.gems||0} ${prem.exclusive ? '⭐' : ''}`, {
        fontSize: '10px', color: isPremium ? '#FFD700' : '#666', fontFamily: 'Arial',
      });

      const result = [bg, lvlText, freeText, premText];

      if (reached && !freeClaimed) {
        const cb = this.add.text(W - 16, y + 20, 'Claim', { fontSize: '10px', color: '#fff', backgroundColor: '#228B22', padding: {x:6,y:3}, fontFamily:'Arial' }).setOrigin(1).setInteractive({cursor:'pointer'});
        cb.on('pointerdown', () => this._claim(lvl.level));
        result.push(cb);
      } else if (freeClaimed) {
        result.push(this.add.text(W - 16, y + 20, '✓ Done', { fontSize: '10px', color: '#00DD00', fontFamily: 'Arial' }).setOrigin(1));
      }
      return result;
    });
  }

  async _purchase() {
    try {
      const res = await window.MLA.api.purchaseBattlePass();
      if (res.success) { this._showToast('Battle Pass activated! 🎉', '#FFD700'); this.scene.restart(); }
      else this._showToast(res.message || 'Purchase failed.', '#FF4444');
    } catch (err) { this._showToast(err.response?.data?.message || 'Insufficient gems.', '#FF4444'); }
  }

  async _claim(level) {
    try {
      const res = await window.MLA.api.claimBattlePassReward(level);
      if (res.success) { this._showToast('Reward claimed!', '#00DD00'); this.scene.restart(); }
      else this._showToast(res.message || 'Already claimed.', '#FF4444');
    } catch { this._showToast('Failed to claim.', '#FF4444'); }
  }
}

// ─── LeaderboardScene ─────────────────────────────────────────────────────────
export class LeaderboardScene extends BaseUIScene {
  constructor() { super({ key: 'LeaderboardScene' }); }

  async create() {
    const { W, H } = this._buildBase('🏅 Leaderboard');
    this._activeTab = 'pvp_rating';
    const tabs = [
      { key:'pvp_rating', label:'PvP' }, { key:'level', label:'Level' }, { key:'total_wins', label:'Wins' },
    ];
    tabs.forEach((tab, i) => {
      const tw = (W - 16) / tabs.length;
      const t = this.add.text(8 + i * tw + tw/2, 58, tab.label, {
        fontSize: '12px', color: '#aaa', backgroundColor: '#1a1a4e', padding: { x: 10, y: 6 }, fontFamily: 'Arial',
      }).setOrigin(0.5, 0).setInteractive({ cursor: 'pointer' });
      t.on('pointerdown', () => { this._activeTab = tab.key; this.scene.restart(); });
    });
    await this._loadLeaderboard(this._activeTab);
  }

  async _loadLeaderboard(cat) {
    this._loader(true);
    try {
      const [lbRes, myRankRes] = await Promise.all([window.MLA.api.getLeaderboard(cat), window.MLA.api.getMyRank(cat)]);
      this._loader(false);
      if (lbRes.success) this._renderLeaderboard(lbRes.data, myRankRes.data);
    } catch { this._loader(false); }
  }

  _renderLeaderboard(entries, myRank) {
    const { W, H } = this;
    if (myRank) {
      const myY = H - 50;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e); bg.fillRect(0, myY, W, 50);
      this.add.text(16, myY + 8, `Your Rank: #${myRank.rank || '?'}`, { fontSize: '12px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' });
      this.add.text(16, myY + 24, `Score: ${formatNumber(myRank.score || 0)}`, { fontSize: '11px', color: '#fff', fontFamily: 'Arial' });
    }

    this._scrollList(entries, 86, H - 56, (entry, i) => {
      const y = i * 52;
      const isMe = entry.userId?.toString() === window.MLA.store.user?._id?.toString();
      const bg = this.add.graphics();
      bg.fillStyle(isMe ? 0x1a2a1a : 0x1a1a4e, 0.9);
      bg.fillRoundedRect(8, y, W - 16, 46, 8);
      if (isMe) { bg.lineStyle(1, 0x00DD00, 0.5); bg.strokeRoundedRect(8, y, W - 16, 46, 8); }

      const medal = entry.rank <= 3 ? ['🥇','🥈','🥉'][entry.rank-1] : `#${entry.rank}`;
      const rankText = this.add.text(28, y + 13, medal, { fontSize: entry.rank <= 3 ? '18px' : '12px', fontFamily: 'Arial' }).setOrigin(0.5);
      const name = this.add.text(56, y + 8, entry.username, { fontSize: '13px', fontStyle: isMe ? 'bold' : 'normal', color: isMe ? '#00FF00' : '#fff', fontFamily: 'Arial' });
      const score = this.add.text(W - 16, y + 8, formatNumber(entry.score), { fontSize: '14px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(1, 0);
      if (entry.meta?.rank) {
        const rankBadge = this.add.text(56, y + 26, `${getRankIcon(entry.meta.rank)} ${entry.meta.rank}`, { fontSize: '9px', color: '#aaa', fontFamily: 'Arial' });
        return [bg, rankText, name, score, rankBadge];
      }
      return [bg, rankText, name, score];
    });
  }
}

// ─── ProfileScene ─────────────────────────────────────────────────────────────
export class ProfileScene extends BaseUIScene {
  constructor() { super({ key: 'ProfileScene' }); }

  async create() {
    const { W, H } = this._buildBase('👤 Profile');
    const user = window.MLA.store.user;
    if (!user) { this.scene.start('AuthScene', { mode: 'login' }); return; }
    this._renderProfile(user);
  }

  _renderProfile(user) {
    const { W, H } = this;
    const stats = user.stats || {};
    const rank  = user.ranking || {};

    // Avatar
    this.add.circle(W/2, 108, 36, 0x4169E1);
    this.add.text(W/2, 108, '👤', { fontSize: '32px' }).setOrigin(0.5);

    this.add.text(W/2, 152, user.username, { fontSize: '18px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(0.5);
    this.add.text(W/2, 172, user.profile?.title || 'Rookie Trainer', { fontSize: '12px', color: '#aaa', fontFamily: 'Arial' }).setOrigin(0.5);
    this.add.text(W/2, 188, `Level ${user.gameData?.level || 1}  •  ${user.gameData?.currentRegion || 'Starter Town'}`, { fontSize: '11px', color: '#888', fontFamily: 'Arial' }).setOrigin(0.5);

    // Rank info
    this.add.text(W/2, 208, `${getRankIcon(rank.pvpRank)} ${rank.pvpRank || 'Bronze'} — ${rank.pvpRating || 1000} ELO`, {
      fontSize: '13px', color: '#FFD700', fontFamily: 'Arial',
    }).setOrigin(0.5);

    // Stats grid
    const statItems = [
      ['⚔️ Battles', stats.totalBattles || 0], ['🏆 Wins', stats.wins || 0],
      ['💀 Losses', stats.losses || 0], ['📊 Win%', `${Math.round((stats.wins || 0) / Math.max(1, stats.totalBattles || 1) * 100)}%`],
      ['🎯 Streak', stats.longestWinStreak || 0], ['🐲 Caught', stats.monstersCapured || 0],
      ['✨ Evolved', stats.monstersEvolved || 0], ['💥 Damage', formatNumber(stats.totalDamageDealt || 0)],
    ];
    statItems.forEach((item, i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const x = col === 0 ? 16 : W/2 + 8;
      const y = 234 + row * 30;
      const bg = this.add.graphics();
      bg.fillStyle(0x1a1a4e, 0.8); bg.fillRoundedRect(x, y, W/2 - 20, 26, 6);
      this.add.text(x + 10, y + 5, item[0], { fontSize: '10px', color: '#aaa', fontFamily: 'Arial' });
      this.add.text(x + W/2 - 28, y + 5, String(item[1]), { fontSize: '10px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial' }).setOrigin(1, 0);
    });

    // Currency display
    const cy = 234 + 4 * 30 + 16;
    this.add.text(W/2, cy, `💰 ${formatNumber(user.gameData?.coins || 0)}   💎 ${user.gameData?.gems || 0}   🎟️ ${user.gameData?.tokens || 0}`, {
      fontSize: '13px', color: '#FFD700', fontFamily: 'Arial',
    }).setOrigin(0.5);

    // Action buttons
    const btnY = cy + 30;
    const btns = [
      { label: '📋 Quests',         action: () => this.scene.start('QuestScene')        },
      { label: '🎫 Battle Pass',    action: () => this.scene.start('BattlePassScene')   },
      { label: '🏅 Leaderboard',    action: () => this.scene.start('LeaderboardScene')  },
      { label: '⚔️ Guild',          action: () => this.scene.start('GuildScene')         },
      { label: '🏪 Shop',           action: () => this.scene.start('ShopScene')          },
      { label: '🚪 Logout',         action: () => this._logout(), color:'#880000'       },
    ];
    const btnW = (W - 24) / 2;
    btns.forEach((btn, i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const bx = 8 + col * (btnW + 8) + btnW/2;
      const by = btnY + row * 48;
      const b = this.add.text(bx, by, btn.label, {
        fontSize: '12px', color: '#fff', backgroundColor: btn.color || '#1a1a4e', padding: { x: 16, y: 10 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      b.on('pointerdown', btn.action);
    });
  }

  _logout() {
    window.MLA.api.logout().catch(() => {});
    window.MLA.store.clearUser();
    window.MLA.socket?.disconnect();
    window.MLA.socket = null;
    this.scene.start('MainMenuScene');
  }
}

// ─── HUDScene ─────────────────────────────────────────────────────────────────
export class HUDScene extends Phaser.Scene {
  constructor() { super({ key: 'HUDScene' }); }
  create() { /* Persistent HUD overlay — currently handled per-scene */ }
}

// ─── DialogScene ──────────────────────────────────────────────────────────────
export class DialogScene extends Phaser.Scene {
  constructor() { super({ key: 'DialogScene' }); }

  init(data) { this.dialogData = data; }

  create() {
    const { width: W, height: H } = this.scale;
    const { type, title, message, onConfirm, onCancel } = this.dialogData || {};

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, W, H);
    overlay.setInteractive();

    const panW = Math.min(W - 40, 340);
    const panH = 200;
    const panX = (W - panW) / 2;
    const panY = (H - panH) / 2;

    const bg = this.add.graphics();
    bg.fillStyle(0x0d0d2b, 0.98);
    bg.fillRoundedRect(panX, panY, panW, panH, 14);
    bg.lineStyle(1, 0x4169E1, 0.5);
    bg.strokeRoundedRect(panX, panY, panW, panH, 14);

    this.add.text(W/2, panY + 20, title || 'Confirm', {
      fontSize: '16px', fontStyle: 'bold', color: '#FFD700', fontFamily: 'Arial',
    }).setOrigin(0.5);

    this.add.text(W/2, panY + 55, message || 'Are you sure?', {
      fontSize: '13px', color: '#ffffff', fontFamily: 'Arial', align: 'center', wordWrap: { width: panW - 30 },
    }).setOrigin(0.5, 0);

    if (type === 'confirm') {
      const yes = this.add.text(W/2 - 50, panY + panH - 30, '✅ Yes', {
        fontSize: '14px', color: '#fff', backgroundColor: '#228B22', padding: { x: 16, y: 8 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      yes.on('pointerdown', () => { onConfirm?.(); this.scene.stop(); });

      const no = this.add.text(W/2 + 50, panY + panH - 30, '❌ No', {
        fontSize: '14px', color: '#fff', backgroundColor: '#880000', padding: { x: 16, y: 8 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      no.on('pointerdown', () => { onCancel?.(); this.scene.stop(); });
    } else {
      const ok = this.add.text(W/2, panY + panH - 30, 'OK', {
        fontSize: '14px', color: '#fff', backgroundColor: '#4169E1', padding: { x: 24, y: 8 }, fontFamily: 'Arial',
      }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
      ok.on('pointerdown', () => this.scene.stop());
    }
  }
}
