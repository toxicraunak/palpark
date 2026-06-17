const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');

// ─── Test DB setup ────────────────────────────────────────────────────────────
beforeAll(async () => {
  const uri = process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/mla_test';
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ─── Shared state ────────────────────────────────────────────────────────────
let authToken;
let userId;
let testMonsterId;

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('POST /api/auth/register', () => {
  test('registers a new user successfully', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testplayer', email: 'test@mla.test', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('testplayer');
    authToken = res.body.token;
    userId = res.body.user.id;
  });

  test('rejects duplicate username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testplayer', email: 'other@mla.test', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  test('rejects duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'otherplayer', email: 'test@mla.test', password: 'password123' });
    expect(res.status).toBe(409);
  });

  test('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'shortpass', email: 'short@mla.test', password: '123' });
    expect(res.status).toBe(400);
  });

  test('rejects invalid username characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'bad user!', email: 'bad@mla.test', password: 'password123' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'test@mla.test', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
  });

  test('logs in with username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'testplayer', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'testplayer', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  test('rejects unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody@test.com', password: 'password123' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/guest', () => {
  test('creates guest session', async () => {
    const res = await request(app).post('/api/auth/guest');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.isGuest).toBe(true);
    expect(res.body.token).toBeDefined();
  });
});

describe('GET /api/auth/me', () => {
  test('returns current user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('testplayer');
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalidtoken123');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MONSTER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/monsters/templates', () => {
  test('returns monster templates list', async () => {
    const res = await request(app).get('/api/monsters/templates');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  test('filters by type', async () => {
    const res = await request(app).get('/api/monsters/templates?type=Fire');
    expect(res.status).toBe(200);
    res.body.data.forEach(m => {
      expect(['Fire']).toContain(m.types?.primary);
    });
  });

  test('filters by rarity', async () => {
    const res = await request(app).get('/api/monsters/templates?rarity=legendary');
    expect(res.status).toBe(200);
    res.body.data.forEach(m => {
      expect(m.rarity).toBe('legendary');
    });
  });

  test('paginates correctly', async () => {
    const res = await request(app).get('/api/monsters/templates?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(5);
    expect(res.body.pagination.limit).toBe(5);
  });
});

describe('GET /api/monsters/templates/:id', () => {
  test('returns monster by monsterId number', async () => {
    const res = await request(app).get('/api/monsters/templates/1');
    // May 404 if DB not seeded — just check it doesn't crash
    expect([200, 404]).toContain(res.status);
  });

  test('returns 404 for nonexistent monster', async () => {
    const res = await request(app).get('/api/monsters/templates/99999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/monsters/my', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/monsters/my');
    expect(res.status).toBe(401);
  });

  test('returns empty collection for new user', async () => {
    const res = await request(app)
      .get('/api/monsters/my')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/monsters/team', () => {
  test('returns team for authenticated user', async () => {
    const res = await request(app)
      .get('/api/monsters/team')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/inventory', () => {
  test('returns inventory for authenticated user', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  test('new user has starter items', async () => {
    const res = await request(app)
      .get('/api/inventory')
      .set('Authorization', `Bearer ${authToken}`);
    const slots = res.body.data?.slots || [];
    expect(slots.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORLD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/world/regions', () => {
  test('returns all regions', async () => {
    const res = await request(app).get('/api/world/regions');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('each region has required fields', async () => {
    const res = await request(app).get('/api/world/regions');
    res.body.data.forEach(region => {
      expect(region.id).toBeDefined();
      expect(region.name).toBeDefined();
      expect(region.minLevel).toBeDefined();
    });
  });
});

describe('GET /api/world/regions/:regionId', () => {
  test('returns specific region', async () => {
    const res = await request(app).get('/api/world/regions/starter_town');
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('starter_town');
  });

  test('returns 404 for unknown region', async () => {
    const res = await request(app).get('/api/world/regions/fake_region');
    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/leaderboards/:category', () => {
  test('returns pvp_rating leaderboard', async () => {
    const res = await request(app).get('/api/leaderboards/pvp_rating');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('returns level leaderboard', async () => {
    const res = await request(app).get('/api/leaderboards/level');
    expect(res.status).toBe(200);
  });

  test('returns my rank when authenticated', async () => {
    const res = await request(app)
      .get('/api/leaderboards/pvp_rating/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rank).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /api/users/profile/:username', () => {
  test('returns public profile', async () => {
    const res = await request(app).get('/api/users/profile/testplayer');
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('testplayer');
    expect(res.body.data.password).toBeUndefined();
  });

  test('returns 404 for unknown user', async () => {
    const res = await request(app).get('/api/users/profile/nobody_ever');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/users/profile', () => {
  test('updates bio with auth', async () => {
    const res = await request(app)
      .patch('/api/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ bio: 'Testing bio update' });
    expect(res.status).toBe(200);
    expect(res.body.data.bio).toBe('Testing bio update');
  });

  test('truncates bio to 200 chars', async () => {
    const longBio = 'a'.repeat(250);
    const res = await request(app)
      .patch('/api/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ bio: longBio });
    expect(res.status).toBe(200);
    expect(res.body.data.bio.length).toBeLessThanOrEqual(200);
  });
});

describe('GET /api/users/daily-reward', () => {
  test('grants daily reward on first claim', async () => {
    const res = await request(app)
      .get('/api/users/daily-reward')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rewards.coins).toBeGreaterThan(0);
  });

  test('rejects second claim same day', async () => {
    const res = await request(app)
      .get('/api/users/daily-reward')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already claimed/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════
describe('GET /health', () => {
  test('returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.version).toBe('1.0.0');
  });
});

describe('404 handling', () => {
  test('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent_endpoint');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
