// Type color map (hex numbers for Phaser)
export const TYPE_COLORS = {
  Fire:     0xFF4500, Water:   0x1E90FF, Grass:   0x228B22,
  Electric: 0xFFD700, Ice:     0xB0E0E6, Dragon:  0x9B59B6,
  Dark:     0x1C1C1C, Light:   0xFFFACD, Ghost:   0x7B68EE,
  Rock:     0x808080, Steel:   0xC0C0C0, Wind:    0x87CEEB,
  Poison:   0x9ACD32, Psychic: 0xDDA0DD, Normal:  0xA9A9A9,
};

export const TYPE_COLORS_CSS = {
  Fire:'#FF4500',Water:'#1E90FF',Grass:'#228B22',Electric:'#FFD700',
  Ice:'#B0E0E6',Dragon:'#9B59B6',Dark:'#555555',Light:'#FFD700',
  Ghost:'#7B68EE',Rock:'#808080',Steel:'#C0C0C0',Wind:'#87CEEB',
  Poison:'#9ACD32',Psychic:'#DDA0DD',Normal:'#A9A9A9',
};

export const RARITY_COLORS = {
  common:    0xA9A9A9, uncommon: 0x00CC44,
  rare:      0x4169E1, epic:     0x9B59B6,
  legendary: 0xFF8C00, mythic:   0xFF0080,
};

export const RARITY_COLORS_CSS = {
  common:'#A9A9A9',uncommon:'#00CC44',rare:'#4169E1',
  epic:'#9B59B6',legendary:'#FF8C00',mythic:'#FF0080',
};

export function formatHP(hp) {
  if (hp === undefined || hp === null) return '?';
  return Math.max(0, Math.floor(hp)).toString();
}

export function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function getRankIcon(rank) {
  const icons = { Bronze:'🥉',Silver:'🥈',Gold:'🥇',Platinum:'💿',Diamond:'💎',Master:'👑',Legendary:'🌟',Mythic:'⚡' };
  return icons[rank] || '🎮';
}

export function getTypeIcon(type) {
  const icons = { Fire:'🔥',Water:'💧',Grass:'🌿',Electric:'⚡',Ice:'❄️',Dragon:'🐉',Dark:'🌑',Light:'☀️',Ghost:'👻',Rock:'🪨',Steel:'⚙️',Wind:'💨',Poison:'☠️',Psychic:'🔮',Normal:'⭐' };
  return icons[type] || '❓';
}

export function getEffectivenessLabel(mult) {
  if (mult === 0)    return 'Immune';
  if (mult >= 4)     return '4× Effective!';
  if (mult >= 2)     return '2× Effective!';
  if (mult <= 0.25)  return '¼× Effective';
  if (mult <= 0.5)   return '½× Effective';
  return 'Normal';
}

export function calcExpToNextLevel(level) {
  return Math.floor(100 * Math.pow(1.15, level - 1));
}

export function getStatBarColor(pct) {
  if (pct > 0.6) return '#00DD00';
  if (pct > 0.3) return '#FFD700';
  return '#DD0000';
}

export function timeUntil(date) {
  const diff = new Date(date) - Date.now();
  if (diff <= 0) return 'Now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 23) return `${Math.floor(h/24)}d ${h%24}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}
