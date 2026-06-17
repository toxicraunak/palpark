# Monster Legends Arena — Production Scaling Guide

## Infrastructure Overview

```
                    ┌─────────────────────────────────────┐
                    │          CloudFront CDN               │
                    │    (Static Assets + Caching)          │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │          Load Balancer (ALB)          │
                    │          (SSL Termination)             │
                    └──────┬────────────────┬──────────────┘
                           │                │
               ┌───────────▼───┐    ┌───────▼────────────┐
               │  Nginx Node 1  │    │   Nginx Node 2      │
               │  (Frontend +  │    │   (Frontend +       │
               │   API Proxy)  │    │    API Proxy)       │
               └───────┬───────┘    └────────┬────────────┘
                       │                     │
          ┌────────────▼─────────────────────▼───────────┐
          │              Node.js Cluster                   │
          │  ┌──────────┐ ┌──────────┐ ┌──────────┐      │
          │  │ Worker 1 │ │ Worker 2 │ │ Worker 3 │ ...  │
          │  │ (API +   │ │ (API +   │ │ (API +   │      │
          │  │Socket.IO)│ │Socket.IO)│ │Socket.IO)│      │
          │  └────┬─────┘ └────┬─────┘ └────┬─────┘      │
          └───────┼────────────┼────────────┼─────────────┘
                  │            │            │
       ┌──────────▼────────────▼────────────▼──────────┐
       │                 Redis Cluster                   │
       │   (Session, Socket.IO adapter, Leaderboard,    │
       │    Matchmaking queues, Battle state cache)      │
       └──────────────────────┬─────────────────────────┘
                              │
       ┌──────────────────────▼─────────────────────────┐
       │              MongoDB Atlas M30+                  │
       │     (3-node replica set, auto-sharding)          │
       │   Users, Monsters, Battles, Tournaments, etc.   │
       └─────────────────────────────────────────────────┘
```

---

## Phase 1: Single Server (0–1,000 DAU)

**Stack:** 1× VPS (4 vCPU, 8GB RAM)
- All services on one machine via Docker Compose
- MongoDB: local replica set (single node)
- Redis: local instance
- **Cost:** ~$40/month (DigitalOcean Droplet or Hetzner CX41)

```bash
# Deploy single-server
git clone <repo>
cd monster-legends-arena
cp deployment/.env.production deployment/.env
# Fill in secrets
docker-compose -f deployment/docker-compose.prod.yml up -d
```

---

## Phase 2: Separated Services (1,000–10,000 DAU)

**Stack:** Managed services
- **Backend:** 2× app servers (2 vCPU, 4GB each)
- **Database:** MongoDB Atlas M10 ($57/month)
- **Cache:** Redis Cloud 512MB ($7/month)
- **CDN:** CloudFront or Cloudflare free tier
- **Cost:** ~$150–200/month

Key changes:
```bash
# Enable Socket.IO Redis adapter for multi-instance coordination
npm install @socket.io/redis-adapter

# In sockets/index.js
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

---

## Phase 3: Auto-Scaling (10,000–100,000 DAU)

**Stack:** AWS ECS Fargate or GCP Cloud Run
- **Backend:** ECS service with auto-scaling (2–20 tasks)
- **Database:** MongoDB Atlas M30 with replica set
- **Cache:** ElastiCache Redis r6g.large cluster
- **CDN:** CloudFront with S3 for assets
- **Cost:** ~$500–2,000/month (scales with traffic)

**Auto-scaling policy:**
```json
{
  "TargetTrackingScalingPolicy": {
    "TargetValue": 70.0,
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "MinCapacity": 2,
  "MaxCapacity": 20
}
```

---

## Phase 4: Global Scale (100,000+ DAU)

**Multi-region deployment:**
```
US-East ──────┐
EU-West ──────┼──── MongoDB Atlas Global Cluster
AP-Southeast ─┘         (Multi-region writes)

Each region has:
- 2–4 Node.js instances
- Regional Redis cluster
- CloudFront edge caching
- Route53 geolocation routing
```

---

## Performance Benchmarks

| Operation | Target P50 | Target P99 |
|---|---|---|
| REST API response | < 50ms | < 200ms |
| Battle action (Socket.IO) | < 100ms | < 500ms |
| Matchmaking wait (casual) | < 10s | < 30s |
| DB query (indexed) | < 5ms | < 50ms |
| Monster list (cached) | < 10ms | < 50ms |
| Battle state broadcast | < 50ms | < 200ms |

---

## Database Optimization

### Critical Indexes (already defined in models)
```js
// Most frequent queries and their indexes:
User.index({ 'ranking.pvpRating': -1 })   // Leaderboard
User.index({ 'social.guild': 1 })          // Guild members
PlayerMonster.index({ owner: 1, isInTeam: 1 })  // Team load
Battle.index({ 'participants.userId': 1, status: 1 })  // History
Marketplace.index({ status: 1, expiresAt: 1 })  // Active listings
```

### Redis Cache Strategy
```
Key pattern               TTL      Invalidated when
─────────────────────────────────────────────────────
templates:*               300s     Monster template updated
template:{id}             600s     Template updated
lb:pvp_rating             300s     Any PvP battle completes
lb:level                  300s     Any user levels up
shop:items                600s     Admin updates shop
user_battle:{userId}      3600s    Battle ends
```

### MongoDB Connection Pooling
```js
// Already configured in config/database.js:
maxPoolSize: 10  // Increase to 20-50 for high traffic
```

---

## Socket.IO Scaling

For multiple server instances, Socket.IO needs Redis pub/sub:

```js
// Install: npm install @socket.io/redis-adapter
const { createAdapter } = require('@socket.io/redis-adapter');
io.adapter(createAdapter(pubClient, subClient));

// Now all instances share socket rooms:
// - battle:{battleId}  — syncs battle state
// - user:{userId}      — per-user notifications
// - region:{regionId}  — world presence
// - chat:{channel}     — chat rooms
```

---

## Monitoring Setup

### Health Endpoints
- `GET /health` — basic health check
- `GET /health/detailed` — DB + Redis status (add if needed)

### Key Metrics to Monitor
```
Application:
  - requests_per_second
  - response_time_p99
  - error_rate
  - active_battles (from BattleManager.getActiveBattleCount())
  - socket_connections
  - matchmaking_queue_size

Database:
  - mongodb_ops_per_second
  - mongodb_connection_pool_usage
  - slow_queries (> 100ms)

Game:
  - daily_active_users
  - battles_per_minute
  - new_registrations_per_hour
  - marketplace_transactions_per_hour
```

### Recommended Stack
- **APM:** Datadog, New Relic, or AWS X-Ray
- **Logs:** Winston → CloudWatch/Datadog Logs
- **Alerts:** PagerDuty or OpsGenie
- **Uptime:** UptimeRobot (free) or Pingdom

---

## Security Hardening for Production

```bash
# 1. Rotate all secrets
openssl rand -hex 64  # New JWT_SECRET
openssl rand -hex 64  # New JWT_REFRESH_SECRET

# 2. Enable MongoDB auth
mongosh --eval "db.createUser({user:'admin', pwd:'<strong>', roles:['root']})"

# 3. SSL/TLS
certbot certonly --standalone -d monsterlegends.arena

# 4. Firewall (UFW)
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw deny 27017/tcp  # Block MongoDB from outside
ufw deny 6379/tcp   # Block Redis from outside
ufw enable
```

---

## Backup Strategy

```bash
# MongoDB daily backup to S3
0 2 * * * mongodump --uri="$MONGODB_URI" --out=/backups/$(date +%Y%m%d) && \
  aws s3 sync /backups/ s3://mla-backups/mongodb/

# Redis RDB snapshot (configured in redis.conf)
save 3600 1    # Save if 1 key changed in 1 hour
save 300 100   # Save if 100 keys changed in 5 min
save 60 10000  # Save if 10000 keys changed in 1 min
```

---

## Cost Summary by Scale

| Stage | DAU | Monthly Cost |
|---|---|---|
| MVP | 0–500 | $40–80 |
| Early Growth | 500–5,000 | $100–300 |
| Growth | 5,000–50,000 | $300–1,500 |
| Scale | 50,000–500,000 | $1,500–10,000 |
| Enterprise | 500,000+ | Custom |
