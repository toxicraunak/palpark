# ⚡ Monster Legends Arena

> Production-ready MMORPG monster-catching game — Pokémon × Dynamons × Nexomon style

---

## 🎮 Feature Overview

| Feature | Status | Details |
|---|---|---|
| 300 Monsters | ✅ | 14 element types, full evolution chains, moves |
| Battle Engine | ✅ | Turn-based, PvE & PvP, 6 status effects, type chart |
| World Map | ✅ | 9 regions, story progression, wild encounters |
| Authentication | ✅ | Register, Login, Guest, JWT refresh, password reset |
| Real-time PvP | ✅ | ELO matchmaking, Socket.IO sync, ranked seasons |
| Tournament System | ✅ | Brackets, seasonal rewards, spectator mode |
| Guild System | ✅ | Create/join guilds, raids, treasury, rankings |
| Marketplace | ✅ | P2P monster & item trading with fee system |
| Inventory | ✅ | Potions, balls, stones, held items |
| Quest System | ✅ | Daily/weekly/story quests with progress tracking |
| Battle Pass | ✅ | 100 levels, free + premium tracks, seasonal |
| Leaderboards | ✅ | PvP rating, level, wins — global + seasonal |
| Offline Mode | ✅ | IndexedDB cache, sync queue, PWA |
| Admin Panel | ✅ | User management, ban system, monster CRUD |
| Mobile PWA | ✅ | Portrait-locked, service worker, installable |

---

## 🏗️ Architecture

```
monster-legends-arena/
├── backend/                    # Node.js + Express API server
│   └── src/
│       ├── app.js              # Express middleware stack
│       ├── server.js           # HTTP + Socket.IO bootstrap
│       ├── battle/
│       │   ├── BattleEngine.js     # Core turn-based logic
│       │   ├── BattleManager.js    # Session registry + ELO
│       │   ├── TypeChart.js        # 14-type effectiveness matrix
│       │   └── StatusEffects.js    # Burn/Poison/Freeze/Sleep/Paralysis/Confusion
│       ├── config/
│       │   ├── database.js         # Mongoose connection
│       │   └── redis.js            # Redis client + cache helpers
│       ├── data/
│       │   ├── monsters.js         # 300 monster definitions
│       │   ├── seedDatabase.js     # Full DB seeder
│       │   └── seeds/itemSeed.js   # All game items
│       ├── middleware/
│       │   ├── auth.js             # JWT protect + authorize
│       │   └── errorHandler.js     # Global error + 404
│       ├── models/                 # 12 Mongoose schemas (indexed)
│       ├── routes/                 # 15 REST API route files
│       ├── services/CronService.js # Daily/weekly scheduled tasks
│       ├── sockets/                # Socket.IO namespaces
│       └── utils/logger.js         # Winston structured logging
│
├── frontend/                   # Phaser.js game client
│   ├── main.js                 # Phaser bootstrap + scene registry
│   └── src/
│       ├── managers/
│       │   ├── GameStore.js        # Reactive client state
│       │   ├── APIClient.js        # Axios REST client (all endpoints)
│       │   ├── SocketManager.js    # Socket.IO client wrapper
│       │   ├── AudioManager.js     # BGM/SFX controller
│       │   └── OfflineManager.js   # IndexedDB + sync queue
│       ├── scenes/                 # 18 Phaser scenes
│       │   ├── BootScene.js        # Asset init
│       │   ├── PreloadScene.js     # Asset loading + placeholders
│       │   ├── MainMenuScene.js    # Animated main menu
│       │   ├── AuthScene.js        # Login/Register/Reset forms
│       │   ├── WorldMapScene.js    # Interactive world map
│       │   ├── BattleScene.js      # Full battle UI + animations
│       │   └── allScenes.js        # All other scenes (10 screens)
│       └── utils/gameUtils.js      # Type colors, formatting helpers
│
└── deployment/
    ├── docker-compose.prod.yml     # Production stack
    ├── docker-compose.dev.yml      # Development stack  
    └── nginx.conf                  # Reverse proxy + WebSocket
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 7.0+
- Redis 7.2+
- Docker & Docker Compose (optional)

### Local Development (Manual)

```bash
# 1. Clone & install
git clone https://github.com/your-org/monster-legends-arena.git
cd monster-legends-arena
npm install

# 2. Configure backend
cp backend/.env.example backend/.env
# Edit backend/.env with your MongoDB URI and secrets

# 3. Seed the database (300 monsters + items + quests)
cd backend && npm run seed && cd ..

# 4. Start both servers concurrently
npm run dev
# Backend: http://localhost:3001
# Frontend: http://localhost:3000
```

### Docker Development (Recommended)

```bash
# Start all services (MongoDB, Redis, Backend, Frontend)
npm run docker:dev

# The game is now running at http://localhost:3000
# Admin DB UI at http://localhost:8081
```

### Production Deployment

```bash
# 1. Set production secrets
cp deployment/.env.production deployment/.env
nano deployment/.env   # Fill in real values

# 2. Build & start
npm run build
npm run docker:prod

# 3. Seed the DB (first run only)
docker exec mla_backend npm run seed
```

---

## 🌐 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login (email or username) |
| POST | `/api/auth/guest` | Guest session |
| POST | `/api/auth/refresh` | Refresh JWT token |
| POST | `/api/auth/logout` | Invalidate token |
| GET  | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/reset-password/:token` | Reset password |
| POST | `/api/auth/convert-guest` | Upgrade guest to full account |

### Monsters
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/monsters/templates` | Browse all 300 templates |
| GET | `/api/monsters/templates/:id` | Single monster template |
| GET | `/api/monsters/my` | Your monster collection |
| GET | `/api/monsters/team` | Your active team (up to 6) |
| POST | `/api/monsters/team` | Update team composition |
| POST | `/api/monsters/my/:id/evolve` | Evolve a monster |
| POST | `/api/monsters/my/:id/nickname` | Set nickname |
| POST | `/api/monsters/my/:id/moves` | Update equipped moves |
| POST | `/api/monsters/my/:id/release` | Release a monster |

### Battles
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/battles/pve` | Start PvE battle vs NPC |
| POST | `/api/battles/wild` | Start wild encounter |
| POST | `/api/battles/:id/action` | Submit battle action |
| GET  | `/api/battles/:id/state` | Get battle state |
| POST | `/api/battles/:id/forfeit` | Forfeit battle |
| GET  | `/api/battles/history` | Battle history |

### Battle Actions
```json
{ "type": "move",    "moveId": "flamethrower" }
{ "type": "switch",  "targetIndex": 1 }
{ "type": "item",    "item": { "itemId": "potion_max" }, "targetIndex": 0 }
{ "type": "capture", "item": { "itemId": "ball_ultra", "catchBonus": 2 } }
{ "type": "flee" }
```

---

## ⚡ Socket.IO Events

### Client → Server
```js
socket.emit('battle:join',    { battleId })
socket.emit('battle:action',  { battleId, action })
socket.emit('battle:forfeit', { battleId })
socket.emit('matchmaking:join',  { mode: 'casual'|'ranked' })
socket.emit('matchmaking:leave')
socket.emit('chat:message',   { channel: 'global', message })
socket.emit('world:enter_region', { regionId })
socket.emit('world:challenge', { targetUserId })
```

### Server → Client
```js
socket.on('battle:state_update', (state) => {})
socket.on('battle:ended',        ({ winnerSide, rewards }) => {})
socket.on('matchmaking:matched', ({ battleId, opponent, side }) => {})
socket.on('chat:message',        ({ username, message, ts }) => {})
socket.on('world:player_joined', ({ userId, username, level }) => {})
socket.on('world:challenge_received', ({ from, fromUsername }) => {})
```

---

## 🗄️ Database Schemas

### Collections
| Collection | Documents | Key Indexes |
|---|---|---|
| `users` | Player accounts | `username`, `email`, `pvpRating` |
| `monstertemplates` | 300 monster defs | `monsterId`, `types.primary`, `rarity` |
| `playermonsters` | Player-owned monsters | `owner`, `templateId`, `isShiny` |
| `battles` | Battle records | `battleId`, `participants.userId`, `type` |
| `tournaments` | Tournament instances | `status`, `season`, `startTime` |
| `guilds` | Guild data | `name`, `tag`, `ranking.points` |
| `items` | Item catalog | `itemId`, `category`, `rarity` |
| `inventories` | Player inventories | `owner`, `slots.itemId` |
| `marketplaces` | Trade listings | `status`, `expiresAt`, `rarity` |
| `achievements` | Achievement defs | `achievementId`, `category` |
| `leaderboards` | Rank snapshots | `category`, `scope`, `season` |
| `quests` | Quest definitions | `questId`, `type`, `chapter` |

---

## 🎮 Battle System

### Damage Formula
```
damage = ((2*level/5 + 2) * power * (atk/def) / 50 + 2)
         × STAB × TypeEffectiveness × Critical × Random(0.85–1.0)
```

### Type Chart (14 types)
Fire, Water, Grass, Electric, Ice, Dragon, Dark, Light, Ghost, Rock, Steel, Wind, Poison, Psychic

Each type has custom effectiveness against all others (0 = immune, 0.5 = resist, 1 = normal, 2 = super effective).

### ELO Rating
```
K = 32
Expected = 1 / (1 + 10^((ratingB - ratingA) / 400))
Change = round(K × (result - expected))
```

### Capture Formula
```
a = ((3×maxHP - 2×currentHP) × catchRate × ballBonus) / (3×maxHP)
b = 1048560 / √√(16711680 / a)
captured = 4 shake checks, each: random(0, 65535) < b
```

---

## 📱 Mobile / PWA

- Portrait-locked responsive design (320px–768px wide)
- Phaser.Scale.FIT with CENTER_BOTH
- Service worker for offline play
- IndexedDB for local save data
- Installable via PWA manifest

---

## 🔧 Production Scaling

### Horizontal Scaling
```yaml
# Scale backend instances
docker-compose up --scale backend=4

# Redis Cluster for session sharing
# Use Redis Pub/Sub for Socket.IO across nodes (socket.io-redis adapter)
```

### Recommended Production Stack
| Component | Recommendation |
|---|---|
| Backend | 2–4 Node.js instances behind nginx |
| Database | MongoDB Atlas M10+ with replica set |
| Cache | Redis Cloud 1GB+ with persistence |
| CDN | CloudFront/Cloudflare for static assets |
| Monitoring | Datadog or New Relic APM |
| Logging | ELK Stack or Datadog Logs |
| Hosting | AWS ECS, GCP Cloud Run, or Railway |

### Estimated Capacity per Node (2 vCPU / 2GB RAM)
| Metric | Value |
|---|---|
| Concurrent WebSocket connections | ~5,000 |
| Active battles in memory | ~500 |
| API requests/sec | ~2,000 |
| Matchmaking queue | Unlimited (Redis-backed) |

---

## 🛡️ Security

- JWT with 7-day expiry + 30-day refresh token rotation
- Token blacklisting via Redis on logout
- bcrypt password hashing (cost factor 12)
- Rate limiting: 100 req/15min global, 20 req/15min auth, 30 req/min battle
- Helmet.js security headers (CSP, HSTS, X-Frame-Options)
- MongoDB injection prevention via Mongoose validators
- Account lockout after 5 failed login attempts (15 min)
- Input validation via express-validator on all endpoints

---

## 📊 Development Roadmap

### v1.0 — Core Game ✅
- 300 monsters, 14 types, evolution system
- Turn-based battle engine (PvE + PvP)
- Authentication + guest mode
- World map with 9 regions
- Inventory + shop system

### v1.1 — Social Layer
- [ ] Friend system with async battles
- [ ] Guild boss raids (4-player)
- [ ] Global & guild chat polish
- [ ] Achievement notifications

### v1.2 — Content Expansion
- [ ] Seasonal events (Holiday events, special monsters)
- [ ] Legendary boss encounters
- [ ] Daily dungeon runs
- [ ] Monster breeding system

### v1.3 — Competitive
- [ ] Ranked seasonal reset with rollover rewards
- [ ] Top-100 Hall of Fame
- [ ] Spectator replay system
- [ ] Tournament streaming mode

### v2.0 — Premium Features
- [ ] Custom sprite uploads
- [ ] Clan wars
- [ ] PvE campaign expansion (Chapters 3–10)
- [ ] Trading post (auction house)

---

## 🧪 Testing

```bash
# Backend unit + integration tests
cd backend && npm test

# Run specific test file
cd backend && npx jest src/battle/BattleEngine.test.js

# Frontend tests
cd frontend && npm test
```

---

## 📄 License

MIT License — see LICENSE file for details.

---

*Built with ❤️ using Node.js, Phaser.js, MongoDB, Socket.IO*
