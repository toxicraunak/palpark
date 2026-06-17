# Monster Legends Arena - Windows Setup Script
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     ⚡ Monster Legends Arena — Windows Setup          ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js 18+ required. Download from https://nodejs.org" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "`n📦 Installing backend dependencies..." -ForegroundColor Yellow
Set-Location backend
npm install
Set-Location ..

Write-Host "📦 Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install
Set-Location ..

# Setup .env
if (-not (Test-Path "backend\.env")) {
    Write-Host "`n⚙️  Creating backend\.env from template..." -ForegroundColor Yellow
    Copy-Item "backend\.env.example" "backend\.env"
    Write-Host "📝 Edit backend\.env with your MongoDB URI and JWT secrets." -ForegroundColor Cyan
}

# Seed prompt
$seed = Read-Host "`n🌱 Seed the database with 300 monsters + items? (y/n)"
if ($seed -eq "y" -or $seed -eq "Y") {
    Write-Host "Seeding database..." -ForegroundColor Yellow
    Set-Location backend
    node src/data/seedDatabase.js
    Set-Location ..
    Write-Host "✅ Database seeded!" -ForegroundColor Green
}

Write-Host "`n╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  🚀 Starting Monster Legends Arena...                ║" -ForegroundColor Green
Write-Host "║  Backend:  http://localhost:3001                     ║" -ForegroundColor Green
Write-Host "║  Frontend: http://localhost:3000                     ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Start both servers
Start-Process powershell -ArgumentList "-Command", "cd backend; npm run dev"
Start-Process powershell -ArgumentList "-Command", "cd frontend; npm run dev"

Write-Host "Both servers started in separate windows." -ForegroundColor Green
