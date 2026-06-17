# Monster Legends Arena — Complete API Documentation

## Base URL
- Development: `http://localhost:3001/api`
- Production: `https://your-domain.com/api`

## Authentication
All protected routes require: `Authorization: Bearer <token>`

Tokens expire in 7 days. Use refresh token to get a new one:
```http
POST /api/auth/refresh
{ "refreshToken": "<refresh_token>" }
```

---

## Authentication Endpoints

### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "trainer123",
  "email": "trainer@example.com",
  "password": "securepassword"
}

Response 201:
{
  "success": true,
  "token": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": "...",
    "username": "trainer123",
    "gameData": { "level": 1, "coins": 500, "gems": 50 },
    "profile": { "avatar": "default_avatar", "title": "Rookie Trainer" }
  }
}
```

### Login
```http
POST /api/auth/login
{ "identifier": "trainer123", "password": "securepassword" }
// identifier can be username OR email
```

### Guest Play
```http
POST /api/auth/guest
// No body required — creates a temporary Guest_XXXXXX account

Response 201:
{
  "success": true,
  "isGuest": true,
  "token": "eyJ...",
  "user": { "id": "...", "username": "Guest_482951" }
}
```

### Refresh Token
```http
POST /api/auth/refresh
{ "refreshToken": "eyJ..." }

Response:
{ "success": true, "token": "new_token", "refreshToken": "new_refresh" }
```

### Logout
```http
POST /api/auth/logout
Authorization: Bearer <token>
// Blacklists the current token in Redis
```

### Forgot Password
```http
POST /api/auth/forgot-password
{ "email": "trainer@example.com" }
// In production, sends email. In dev, returns token in response.
```

### Reset Password
```http
POST /api/auth/reset-password/:token
{ "password": "newpassword" }
```

### Convert Guest to Full Account
```http
POST /api/auth/convert-guest
Authorization: Bearer <guest_token>
{ "username": "realname", "email": "real@example.com", "password": "pass123" }
// Preserves all game progress from the guest account
```

---

## Monster Endpoints

### Browse Monster Templates
```http
GET /api/monsters/templates?page=1&limit=20&type=Fire&rarity=rare&sort=monsterId&order=asc

Response:
{
  "success": true,
  "data": [
    {
      "monsterId": 3,
      "name": "Infernox",
      "types": { "primary": "Fire" },
      "baseStats": { "hp": 80, "attack": 110, "defense": 70, "specialAttack": 130, "specialDefense": 85, "speed": 110 },
      "baseStatTotal": 586,
      "rarity": "rare",
      "evolutionStage": 3,
      "catchRate": 45,
      "appearance": { "colorPalette": ["#CC0000", "#FF2200", "#880000"] }
    }
  ],
  "pagination": { "total": 300, "page": 1, "limit": 20, "pages": 15 }
}
```

### Get Single Template
```http
GET /api/monsters/templates/1     // by monsterId
GET /api/monsters/templates/Embercub  // by name
```

### Get My Monster Collection
```http
GET /api/monsters/my?page=1&limit=20&type=Fire&inTeam=true
Authorization: Bearer <token>
```

### Get/Update Active Team
```http
GET  /api/monsters/team
POST /api/monsters/team
Authorization: Bearer <token>

POST body:
{ "team": ["monster_id_1", "monster_id_2", "monster_id_3"] }
// Max 6 monsters. Order determines battle position.
```

### Evolve Monster
```http
POST /api/monsters/my/:monsterId/evolve
Authorization: Bearer <token>

Body (for item-based evolutions):
{ "itemId": "fire_stone" }

Response 200:
{
  "success": true,
  "message": "Embercub evolved into Blazefang!",
  "animation": "evolution",
  "data": { /* updated monster */ }
}
```

### Update Moves
```http
POST /api/monsters/my/:monsterId/moves
Authorization: Bearer <token>
{ "moves": ["ember", "flamethrower"] }
// Must be move IDs that the monster has learned at its current level
```

---

## Battle Endpoints

### Start PvE Battle
```http
POST /api/battles/pve
Authorization: Bearer <token>
{ "npcId": "npc_starter_town", "region": "starter_town" }

Response 201:
{
  "success": true,
  "data": {
    "battleId": "uuid-v4",
    "turn": 1,
    "playerA": {
      "userId": "...",
      "username": "trainer123",
      "activeMonster": {
        "name": "Embercub", "level": 5,
        "currentHp": 95, "maxHp": 95, "hpPercent": 100,
        "moves": [{ "moveId": "ember", "name": "Ember", "type": "Fire", "currentUses": 15 }],
        "energy": 3, "maxEnergy": 5
      }
    },
    "playerB": { /* NPC data */ },
    "log": [{ "type": "battle_start", "message": "Battle started!" }]
  }
}
```

### Start Wild Encounter
```http
POST /api/battles/wild
Authorization: Bearer <token>
{ "region": "forest_glen" }
// Random monster based on region spawn rates
```

### Submit Battle Action
```http
POST /api/battles/:battleId/action
Authorization: Bearer <token>

// Use a move:
{ "type": "move", "moveId": "flamethrower" }

// Switch monster:
{ "type": "switch", "targetIndex": 1 }

// Use item:
{ "type": "item", "item": { "itemId": "potion_small" }, "targetIndex": 0 }

// Attempt capture:
{ "type": "capture", "item": { "itemId": "ball_ultra", "catchBonus": 2 } }

// Flee:
{ "type": "flee" }

Response (turn resolved):
{
  "success": true,
  "data": {
    "battleId": "...",
    "turn": 2,
    "status": "active",
    "playerA": { /* updated state */ },
    "playerB": { /* updated state */ },
    "log": [
      { "type": "move_used", "message": "Embercub used Flamethrower!", "moveName": "Flamethrower" },
      { "type": "damage", "damage": 48, "isCritical": false, "effectiveness": 1, "hpAfter": 47 },
      { "type": "move_used", "message": "WaterPup used Surf!", "side": "B" },
      { "type": "damage", "damage": 22, "effectText": "not_very_effective", "hpAfter": 73 }
    ]
  }
}
```

---

## Inventory Endpoints

### Get Inventory
```http
GET /api/inventory
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "slots": [
      { "itemId": "ball_basic", "name": "Basic Ball", "quantity": 8, "category": "capture_ball" },
      { "itemId": "potion_small", "name": "Small Potion", "quantity": 5, "category": "consumable" }
    ],
    "totalItems": 13
  }
}
```

### Use Item Outside Battle
```http
POST /api/inventory/use
Authorization: Bearer <token>
{ "itemId": "potion_medium", "targetMonsterId": "monster_id" }
```

---

## Shop Endpoints

### Get Shop Items
```http
GET /api/shop/items?category=capture_ball

Response:
{
  "success": true,
  "data": [
    {
      "itemId": "ball_ultra",
      "name": "Ultra Ball",
      "description": "An ultra-performance ball with a very high capture rate.",
      "rarity": "uncommon",
      "price": { "coins": 600, "gems": 0 },
      "catchBonus": 2
    }
  ]
}
```

### Buy Item
```http
POST /api/shop/buy
Authorization: Bearer <token>
{ "itemId": "ball_ultra", "quantity": 3 }
// Deducts coins/gems from user account
```

---

## Tournament Endpoints

### Get Tournaments
```http
GET /api/tournaments?status=registration

Response:
{
  "data": [{
    "name": "Weekly Grand Prix",
    "type": "single_elimination",
    "status": "registration",
    "config": { "maxParticipants": 16, "entryFee": { "coins": 500 } },
    "schedule": { "startTime": "2024-12-15T18:00:00Z" },
    "rewards": {
      "first": { "coins": 10000, "gems": 200, "title": "Tournament Victor" }
    },
    "participants": []
  }]
}
```

### Register for Tournament
```http
POST /api/tournaments/:id/register
Authorization: Bearer <token>
// Deducts entry fee automatically
```

---

## Leaderboard Endpoints

### Get Leaderboard
```http
GET /api/leaderboards/pvp_rating?page=1&limit=50
// Categories: pvp_rating | level | total_wins | monsters_caught

Response:
{
  "success": true,
  "category": "pvp_rating",
  "data": [
    { "rank": 1, "userId": "...", "username": "TopPlayer", "score": 2850, "meta": { "rank": "Mythic" } },
    { "rank": 2, "username": "SecondBest", "score": 2720 }
  ]
}
```

### Get My Rank
```http
GET /api/leaderboards/pvp_rating/me
Authorization: Bearer <token>

Response: { "data": { "rank": 47, "score": 1250, "username": "trainer123" } }
```

---

## Guild Endpoints

### Create Guild
```http
POST /api/guilds
Authorization: Bearer <token>
{
  "name": "Dragon Masters",
  "tag": "DRAG",
  "description": "Elite dragon tamers only.",
  "color": "#9B59B6"
}
// Costs 5000 coins
```

### Join Guild
```http
POST /api/guilds/:id/join
Authorization: Bearer <token>
```

---

## Marketplace Endpoints

### List Monster for Sale
```http
POST /api/marketplace/list
Authorization: Bearer <token>
{
  "monsterId": "player_monster_id",
  "priceType": "coins",
  "amount": 50000
}
// Listing expires in 7 days
```

### Browse Listings
```http
GET /api/marketplace?type=monster&rarity=shiny&sort=price.amount&order=asc
```

### Buy Listing
```http
POST /api/marketplace/:listingId/buy
Authorization: Bearer <token>
// 5% marketplace fee taken from seller
```

---

## Quest Endpoints

### Get All Quests with Progress
```http
GET /api/quests?type=daily
Authorization: Bearer <token>

Response includes "progress" field showing current/target values.
```

### Claim Quest Reward
```http
POST /api/quests/:questId/claim
Authorization: Bearer <token>
// Quest must have status: "completed" and rewardClaimed: false
```

---

## Battle Pass Endpoints

### Get Current Season
```http
GET /api/battle-pass/current
```

### Purchase Premium
```http
POST /api/battle-pass/purchase
Authorization: Bearer <token>
{ "tier": "premium" }  // 800 gems
// Or "tier": "premium_plus" for 2000 gems
```

### Claim Level Reward
```http
POST /api/battle-pass/claim/25
Authorization: Bearer <token>
// Must have reached level 25 in Battle Pass
```

---

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

| Status | Meaning |
|---|---|
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Forbidden (banned or wrong role) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, already exists) |
| 423 | Account locked |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
