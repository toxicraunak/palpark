#!/usr/bin/env bash
set -e

# ════════════════════════════════════════════════════════════════════
#   ⚡ Monster Legends Arena — One-Command Setup Script
#   Run this from the project root: bash scripts/setup.sh
# ════════════════════════════════════════════════════════════════════

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     ⚡ Monster Legends Arena — Local Setup            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Move to project root (script may be run from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# ─── 1. Check prerequisites ───────────────────────────────────────────
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 18+ required. Install from https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "❌ npm required."; exit 1; }

NODE_MAJOR=$(node -e "process.stdout.write(process.version.split('.')[0].replace('v',''))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node.js 18+ required. Found $(node --version)"
  exit 1
fi
echo "✅ Node.js $(node --version) detected"

# ─── 2. MongoDB & Redis check / auto-start via Docker ─────────────────
echo ""
echo "🗄️  Checking MongoDB..."
MONGO_OK=false
if command -v mongosh >/dev/null 2>&1 && mongosh --eval "db.adminCommand('ping')" --quiet >/dev/null 2>&1; then
  MONGO_OK=true
  echo "✅ MongoDB already running"
elif command -v docker >/dev/null 2>&1; then
  if [ "$(docker ps -aq -f name=mla_mongo)" ]; then
    docker start mla_mongo >/dev/null 2>&1 || true
  else
    echo "🐳 Starting MongoDB via Docker..."
    docker run -d -p 27017:27017 --name mla_mongo mongo:7 >/dev/null 2>&1 || true
  fi
  sleep 3
  MONGO_OK=true
  echo "✅ MongoDB started via Docker (container: mla_mongo)"
else
  echo "⚠️  MongoDB not detected and Docker not found."
  echo "   Install MongoDB locally OR install Docker, then re-run this script."
fi

echo ""
echo "🗄️  Checking Redis..."
REDIS_OK=false
if command -v redis-cli >/dev/null 2>&1 && redis-cli ping >/dev/null 2>&1; then
  REDIS_OK=true
  echo "✅ Redis already running"
elif command -v docker >/dev/null 2>&1; then
  if [ "$(docker ps -aq -f name=mla_redis)" ]; then
    docker start mla_redis >/dev/null 2>&1 || true
  else
    echo "🐳 Starting Redis via Docker..."
    docker run -d -p 6379:6379 --name mla_redis redis:7 >/dev/null 2>&1 || true
  fi
  sleep 2
  REDIS_OK=true
  echo "✅ Redis started via Docker (container: mla_redis)"
else
  echo "⚠️  Redis not detected — game will run, but caching/leaderboards may be slower."
fi

# ─── 3. Install dependencies ───────────────────────────────────────────
echo ""
echo "📦 Installing root dependencies..."
npm install --no-fund --no-audit

echo "📦 Installing backend dependencies..."
cd backend && npm install --no-fund --no-audit && cd ..

echo "📦 Installing frontend dependencies..."
cd frontend && npm install --no-fund --no-audit && cd ..

# ─── 4. Setup environment files ────────────────────────────────────────
if [ ! -f "backend/.env" ]; then
  echo ""
  echo "⚙️  Creating backend/.env from template..."
  if [ -f "backend/.env.example" ]; then
    cp backend/.env.example backend/.env
  else
    cat > backend/.env << 'ENVEOF'
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb://localhost:27017/monster_legends_arena
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_jwt_secret_at_least_32_characters_long_change_in_prod
JWT_REFRESH_SECRET=dev_refresh_secret_different_from_jwt_also_32_chars
JWT_EXPIRE=7d
JWT_REFRESH_EXPIRE=30d
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
MAX_TEAM_SIZE=6
LOG_LEVEL=debug
ENVEOF
  fi
  echo "✅ backend/.env created (edit it if you need custom secrets)"
fi

if [ ! -f "frontend/.env" ]; then
  cat > frontend/.env << 'ENVEOF'
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
ENVEOF
  echo "✅ frontend/.env created"
fi

mkdir -p backend/logs

# ─── 5. Seed database ───────────────────────────────────────────────────
echo ""
read -p "🌱 Seed the database with 300 monsters + items + quests? (y/n): " SEED
if [[ "$SEED" == "y" || "$SEED" == "Y" ]]; then
  echo "Seeding database..."
  cd backend && node src/data/seedDatabase.js && cd ..
  echo "✅ Database seeded!"
fi

# ─── 6. Start servers ───────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🚀 Starting Monster Legends Arena...                ║"
echo "║                                                        ║"
echo "║  Backend API:  http://localhost:3001                  ║"
echo "║  Frontend:     http://localhost:3000                  ║"
echo "║  Health check: http://localhost:3001/health            ║"
echo "║                                                        ║"
echo "║  Press Ctrl+C to stop both servers.                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

npx --yes concurrently \
  --names "BACKEND,FRONTEND" \
  --prefix-colors "cyan,magenta" \
  "cd backend && npm run dev" \
  "cd frontend && npm run dev"
