const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { errorHandler } = require('./middleware/errorHandler');
const { notFound } = require('./middleware/notFound');
const logger = require('./utils/logger');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const monsterRoutes = require('./routes/monsters');
const battleRoutes = require('./routes/battles');
const inventoryRoutes = require('./routes/inventory');
const tournamentRoutes = require('./routes/tournaments');
const guildRoutes = require('./routes/guilds');
const marketplaceRoutes = require('./routes/marketplace');
const achievementRoutes = require('./routes/achievements');
const leaderboardRoutes = require('./routes/leaderboards');
const adminRoutes = require('./routes/admin');
const worldRoutes = require('./routes/world');
const shopRoutes = require('./routes/shop');
const questRoutes = require('./routes/quests');
const battlePassRoutes = require('./routes/battlePass');

const app = express();

// Trust proxy for rate limiting behind load balancers
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:", "https:"],
      workerSrc: ["'self'", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — supports a comma-separated CLIENT_URL list (e.g. multiple Render preview URLs)
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin requests (no Origin header) and same-service requests are always allowed
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    callback(null, true); // Render single-service deploy: frontend & backend share origin, so allow by default
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});

const battleLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many battle requests.' },
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
app.use(morgan('combined', {
  stream: { write: (msg) => logger.info(msg.trim()) }
}));

// Global rate limit
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV,
  });
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/monsters', monsterRoutes);
app.use('/api/battles', battleLimiter, battleRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/guilds', guildRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/leaderboards', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/world', worldRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/battle-pass', battlePassRoutes);

// Serve static frontend (single-service deploy on Render)
const frontendDist = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;
