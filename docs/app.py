"""
Quantum API Server - Complete Single File
All functionality from original Cloudflare Worker converted to Python with MongoDB
"""

import os
import json
import re
import httpx
import asyncio
from datetime import datetime
from typing import Optional, Dict, Any, List, Union
from contextlib import asynccontextmanager
from urllib.parse import urlparse
import hashlib
import secrets
from functools import wraps

from fastapi import FastAPI, Request, Query, HTTPException, Depends, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from dotenv import load_dotenv
import uvicorn

# ============================================
# Load Environment Variables
# ============================================
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb+srv://cardtgpm_db_user:ArZe2VYGB8o7GraH@devilboy.8nlar2g.mongodb.net/same-trend")
DATABASE_NAME = os.getenv("DATABASE_NAME", "same-trend")
API_PREFIX = os.getenv("API_PREFIX", "/api/v1")
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))

# ============================================
# MongoDB Connection
# ============================================
client = AsyncIOMotorClient(MONGODB_URI)
db = client[DATABASE_NAME]

# Collections
api_keys_collection = db["apikeys"]
domains_collection = db["domains"]
users_collection = db["users"]
settings_collection = db["settings"]
audit_logs_collection = db["audit_logs"]

# ============================================
# Pydantic Models
# ============================================
class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid objectid")
        return ObjectId(v)

    @classmethod
    def __modify_schema__(cls, field_schema):
        field_schema.update(type="string")

# API Key Models
class APIKeyCreate(BaseModel):
    key_value: str
    user_id: str
    status: str = "active"
    expires_at: Optional[datetime] = None
    description: Optional[str] = ""

class APIKeyModel(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    key_value: str
    user_id: str
    status: str = "active"
    expires_at: Optional[datetime] = None
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# Domain Models
class DomainCreate(BaseModel):
    domain_name: str
    user_id: str
    is_whitelisted: bool = True
    validity: Optional[datetime] = None
    note: Optional[str] = ""

class DomainModel(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    domain_name: str
    is_whitelisted: bool = True
    validity: Optional[datetime] = None
    note: Optional[str] = ""
    status: str = "active"  # active, pending, revoked
    reviewed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# User Models
class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: str = "user"

class UserModel(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    email: str
    password_hash: str
    name: str
    role: str = "user"
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# Settings Model
class SettingModel(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    key: str
    value: Any
    description: Optional[str] = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# Audit Log Model
class AuditLogModel(BaseModel):
    id: Optional[str] = Field(default=None, alias="_id")
    user_id: str
    action: str
    resource: str
    resource_id: Optional[str] = None
    details: Optional[Dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

# API Response Models
class APIResponse(BaseModel):
    code: int
    msg: str
    data: Optional[Any] = None

class APIErrorResponse(BaseModel):
    code: int
    msg: str
    error: Optional[Any] = None

# ============================================
# Game Handlers - Complete WINGO and K3
# ============================================

class WingoGame:
    """Wingo game handler - Full implementation"""
    
    GAME_URLS = {
        '1': 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json',
        '3': 'https://draw.ar-lottery01.com/WinGo/WinGo_3M/GetHistoryIssuePage.json',
        '5': 'https://draw.ar-lottery01.com/WinGo/WinGo_5M/GetHistoryIssuePage.json',
        '30': 'https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json'
    }
    
    GAME_NAMES = {
        '1': 'WinGo 1 Minute',
        '3': 'WinGo 3 Minutes',
        '5': 'WinGo 5 Minutes',
        '30': 'WinGo 30 Seconds'
    }
    
    @staticmethod
    async def fetch(game_id: str) -> Dict[str, Any]:
        """Fetch data from Wingo API with retry mechanism"""
        target_url = WingoGame.GAME_URLS.get(game_id)
        if not target_url:
            return {
                "ok": False, 
                "status": 400, 
                "data": None, 
                "error": "Invalid game ID for Wingo. Valid IDs: 1, 3, 5, 30"
            }
        
        # Retry mechanism (3 attempts)
        max_retries = 3
        for attempt in range(max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(
                        f"{target_url}?ts={int(datetime.utcnow().timestamp() * 1000)}",
                        headers={
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    )
                    
                    if response.status_code == 200:
                        return {
                            "ok": True,
                            "status": response.status_code,
                            "data": response.text,
                            "error": None,
                            "game_id": game_id,
                            "game_name": WingoGame.GAME_NAMES.get(game_id, "Unknown")
                        }
                    else:
                        return {
                            "ok": False,
                            "status": response.status_code,
                            "data": None,
                            "error": f"API returned status {response.status_code}"
                        }
                        
            except httpx.TimeoutException:
                if attempt < max_retries - 1:
                    await asyncio.sleep(1 * (attempt + 1))  # Exponential backoff
                    continue
                return {
                    "ok": False,
                    "status": 504,
                    "data": None,
                    "error": "API request timeout after multiple attempts"
                }
            except Exception as e:
                if attempt < max_retries - 1:
                    await asyncio.sleep(1)
                    continue
                return {
                    "ok": False,
                    "status": 500,
                    "data": None,
                    "error": str(e)
                }
        
        return {
            "ok": False,
            "status": 500,
            "data": None,
            "error": "Failed after maximum retries"
        }
    
    @staticmethod
    def format_result(api_result: Dict[str, Any]) -> Dict[str, Any]:
        """Format Wingo API response with additional metadata"""
        if not api_result.get("ok"):
            return {
                "error": True,
                "status": api_result.get("status", 500),
                "msg": f"Failed to fetch data from Wingo API",
                "details": api_result.get("error", "Unknown error")
            }
        
        # Try to parse and enhance the data
        data = api_result.get("data", "{}")
        try:
            parsed_data = json.loads(data)
            # Add metadata if not present
            if isinstance(parsed_data, dict):
                parsed_data["_source"] = "Wingo API"
                parsed_data["_game_id"] = api_result.get("game_id")
                parsed_data["_game_name"] = api_result.get("game_name")
                parsed_data["_fetched_at"] = datetime.utcnow().isoformat()
                data = json.dumps(parsed_data)
        except:
            pass
            
        return {
            "error": False,
            "status": api_result.get("status", 200),
            "data": data,
            "game_id": api_result.get("game_id"),
            "game_name": api_result.get("game_name")
        }


class K3Game:
    """K3 game handler - Full implementation"""
    
    GAME_NAMES = {
        '1': 'K3 1 Minute',
        '3': 'K3 3 Minutes', 
        '5': 'K3 5 Minutes',
        '30': 'K3 30 Seconds'
    }
    
    @staticmethod
    async def fetch(game_id: str) -> Dict[str, Any]:
        """Fetch data from K3 API (placeholder - will be implemented when API is available)"""
        # Validate game ID
        if game_id not in ['1', '3', '5', '30']:
            return {
                "ok": False,
                "status": 400,
                "data": None,
                "error": "Invalid game ID for K3. Valid IDs: 1, 3, 5, 30"
            }
        
        # Return placeholder data with more structure
        placeholder_data = {
            "code": 200,
            "msg": "Coming soon",
            "game_id": game_id,
            "game_name": K3Game.GAME_NAMES.get(game_id, "Unknown"),
            "status": "development",
            "message": "K3 API integration is under development",
            "estimated_availability": "Coming soon",
            "_timestamp": datetime.utcnow().isoformat()
        }
        
        return {
            "ok": True,
            "status": 200,
            "data": json.dumps(placeholder_data),
            "error": None,
            "game_id": game_id,
            "game_name": K3Game.GAME_NAMES.get(game_id, "Unknown")
        }
    
    @staticmethod
    def format_result(api_result: Dict[str, Any]) -> Dict[str, Any]:
        """Format K3 API response"""
        if not api_result.get("ok"):
            return {
                "error": True,
                "status": api_result.get("status", 500),
                "msg": "Failed to fetch data from K3 API",
                "details": api_result.get("error", "Unknown error")
            }
        
        data = api_result.get("data", "{}")
        try:
            parsed_data = json.loads(data)
            if isinstance(parsed_data, dict):
                parsed_data["_source"] = "K3 API"
                parsed_data["_game_id"] = api_result.get("game_id")
                parsed_data["_game_name"] = api_result.get("game_name")
                data = json.dumps(parsed_data)
        except:
            pass
            
        return {
            "error": False,
            "status": api_result.get("status", 200),
            "data": data,
            "game_id": api_result.get("game_id"),
            "game_name": api_result.get("game_name")
        }


# Game registry
GAME_HANDLERS = {
    '/wingo': WingoGame,
    '/k3': K3Game
}

# ============================================
# Helper Functions
# ============================================

def extract_domain_from_origin(origin: Optional[str]) -> Optional[str]:
    """Extract domain name from Origin or Referer header"""
    if not origin:
        return None
    try:
        parsed = urlparse(origin)
        domain = parsed.hostname
        if domain and domain.startswith('www.'):
            domain = domain[4:]
        return domain.lower() if domain else None
    except Exception:
        return None


async def validate_api_key(api_key: str) -> Dict[str, Any]:
    """Validate API key from database with caching"""
    if not api_key:
        return {"valid": False, "error": "Missing API key", "code": 400}
    
    # Find API key in database
    result = await api_keys_collection.find_one({"key_value": api_key})
    
    if not result:
        return {"valid": False, "error": "Invalid API Key", "code": 401}
    
    key_info = result
    
    # Check status
    if key_info.get("status") != "active":
        return {"valid": False, "error": "API Key is not active", "code": 401}
    
    # Check expiration
    expires_at = key_info.get("expires_at")
    if expires_at and expires_at < datetime.utcnow():
        # Revoke expired key
        await api_keys_collection.update_one(
            {"_id": key_info["_id"]},
            {"$set": {"status": "revoked", "updated_at": datetime.utcnow()}}
        )
        return {"valid": False, "error": "API Key has expired and has been revoked", "code": 401}
    
    return {
        "valid": True,
        "user_id": str(key_info["user_id"]),
        "key_info": key_info
    }


async def validate_domain(user_id: str, domain: str) -> Dict[str, Any]:
    """Validate domain for a user"""
    if not domain:
        return {"valid": False, "error": "Domain could not be determined", "code": 403}
    
    # Find domain in database
    result = await domains_collection.find_one({
        "user_id": user_id,
        "domain_name": domain
    })
    
    if not result:
        return {
            "valid": False,
            "error": f"Domain '{domain}' is not registered for this API key",
            "code": 403
        }
    
    domain_info = result
    
    # Check whitelist status
    if not domain_info.get("is_whitelisted", False):
        return {"valid": False, "error": "Domain is not whitelisted", "code": 403}
    
    # Check validity
    validity = domain_info.get("validity")
    if validity and validity < datetime.utcnow():
        # Disable expired domain
        await domains_collection.update_one(
            {"_id": domain_info["_id"]},
            {"$set": {"is_whitelisted": False, "updated_at": datetime.utcnow()}}
        )
        return {
            "valid": False,
            "error": "Domain authorization has expired and has been disabled",
            "code": 403
        }
    
    return {"valid": True}


async def log_audit(user_id: str, action: str, resource: str, resource_id: Optional[str] = None, 
                   details: Optional[Dict] = None, ip_address: Optional[str] = None, 
                   user_agent: Optional[str] = None):
    """Log audit trail"""
    log_entry = {
        "user_id": user_id,
        "action": action,
        "resource": resource,
        "resource_id": resource_id,
        "details": details,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "created_at": datetime.utcnow()
    }
    try:
        await audit_logs_collection.insert_one(log_entry)
    except Exception:
        pass  # Don't fail on audit log errors


def parse_and_add_author(data: str) -> str:
    """Parse JSON data and add author and website fields"""
    try:
        parsed = json.loads(data)
        if isinstance(parsed, dict):
            parsed["author"] = "Devil Boy"
            parsed["website"] = "QuantumApi"
            parsed["timestamp"] = datetime.utcnow().isoformat()
            parsed["version"] = "1.0.0"
        elif isinstance(parsed, list):
            # If data is a list, wrap it in an object
            parsed = {
                "data": parsed,
                "author": "Devil Boy",
                "website": "QuantumApi",
                "timestamp": datetime.utcnow().isoformat(),
                "version": "1.0.0"
            }
        return json.dumps(parsed, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError) as e:
        # If parsing fails, wrap the original data
        return json.dumps({
            "data": data,
            "author": "Devil Boy",
            "website": "QuantumApi",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0"
        }, ensure_ascii=False)


def create_cors_headers() -> Dict[str, str]:
    """Create CORS headers"""
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
        "Access-Control-Max-Age": "86400"
    }


def generate_api_key(length: int = 32) -> str:
    """Generate a secure API key"""
    return secrets.token_urlsafe(length)


def hash_password(password: str) -> str:
    """Hash a password"""
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash"""
    return hash_password(password) == hashed

# ============================================
# FastAPI Application Setup
# ============================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    print("=" * 60)
    print("🚀 Starting Quantum API Server")
    print("=" * 60)
    
    # Connect to MongoDB
    try:
        await db.command("ping")
        print(f"✅ Connected to MongoDB database: {DATABASE_NAME}")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        raise
    
    # Create indexes
    try:
        await api_keys_collection.create_index("key_value", unique=True)
        await api_keys_collection.create_index("user_id")
        await api_keys_collection.create_index("status")
        await domains_collection.create_index([("user_id", 1), ("domain_name", 1)], unique=True)
        await domains_collection.create_index("status")
        await users_collection.create_index("email", unique=True)
        await settings_collection.create_index("key", unique=True)
        await audit_logs_collection.create_index("user_id")
        await audit_logs_collection.create_index("created_at")
        print("✅ Database indexes created")
    except Exception as e:
        print(f"⚠️ Index creation warning: {e}")
    
    # Create default admin user if none exists
    admin_exists = await users_collection.find_one({"role": "admin"})
    if not admin_exists:
        admin_user = {
            "email": "admin@quantumapi.com",
            "password_hash": hash_password("admin123"),
            "name": "Admin",
            "role": "admin",
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        await users_collection.insert_one(admin_user)
        print("✅ Default admin user created (email: admin@quantumapi.com, password: admin123)")
    
    print("=" * 60)
    print("✅ Server is ready!")
    print(f"📡 API running on: http://localhost:8000")
    print(f"📖 API Docs: http://localhost:8000/docs")
    print("=" * 60)
    
    yield
    
    # Shutdown
    client.close()
    print("🛑 Server shutdown complete")


app = FastAPI(
    title="Quantum API",
    description="Complete API for Wingo and K3 games with user management, API keys, and domain whitelisting",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# ============================================
# Static Pages - Complete HTML
# ============================================
HTML_INDEX = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Quantum API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 900px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        h1 {
            color: #333;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 1.1rem;
            margin-bottom: 30px;
        }
        .badge {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.8rem;
            margin-bottom: 20px;
        }
        .section {
            margin: 25px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 12px;
        }
        .section h2 {
            color: #333;
            font-size: 1.2rem;
            margin-bottom: 15px;
        }
        .endpoint {
            background: white;
            padding: 12px 16px;
            border-radius: 8px;
            margin: 8px 0;
            border-left: 4px solid #667eea;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
        }
        .method {
            font-weight: bold;
            color: #667eea;
            min-width: 40px;
        }
        .path {
            font-family: 'Courier New', monospace;
            color: #333;
            font-size: 0.9rem;
        }
        .desc {
            color: #666;
            font-size: 0.9rem;
            margin-left: auto;
        }
        code {
            background: #e9ecef;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.85rem;
        }
        .footer {
            margin-top: 30px;
            text-align: center;
            color: #666;
            font-size: 0.9rem;
            border-top: 1px solid #e9ecef;
            padding-top: 20px;
        }
        .status-dot {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #28a745;
            margin-right: 8px;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
        }
        @media (max-width: 600px) {
            .container { padding: 20px; }
            h1 { font-size: 1.8rem; }
            .grid-2 { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="badge">🚀 Production Ready</div>
        <h1>⚡ Quantum API</h1>
        <p class="subtitle">Complete API for Wingo and K3 games with full user management</p>
        
        <div class="section">
            <h2>📊 System Status</h2>
            <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                <span><span class="status-dot"></span> API Online</span>
                <span>📦 Database: <strong>MongoDB</strong></span>
                <span>🔄 Version: <strong>1.0.0</strong></span>
            </div>
        </div>
        
        <div class="section">
            <h2>🔗 Available Endpoints</h2>
            
            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/health</span>
                <span class="desc">Health check</span>
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/verify</span>
                <span class="desc">Verify API key</span>
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/wingo</span>
                <span class="desc">Get Wingo game data</span>
            </div>
            
            <div class="endpoint">
                <span class="method">GET</span>
                <span class="path">/k3</span>
                <span class="desc">Get K3 game data</span>
            </div>
            
            <div class="endpoint">
                <span class="method">POST</span>
                <span class="path">/api/keys</span>
                <span class="desc">Create API key</span>
            </div>
            
            <div class="endpoint">
                <span class="method">POST</span>
                <span class="path">/api/domains</span>
                <span class="desc">Register domain</span>
            </div>
        </div>
        
        <div class="section">
            <h2>📝 Example Usage</h2>
            <div style="background: #1a1a2e; color: #e0e0e0; padding: 15px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 0.85rem; overflow-x: auto;">
                <div># Verify API Key</div>
                <div style="color: #4ecdc4;">GET /verify?api_key=YOUR_API_KEY</div>
                <br>
                <div># Get Wingo Data</div>
                <div style="color: #4ecdc4;">GET /wingo?game=1&api_key=YOUR_API_KEY</div>
                <div style="color: #888; font-size: 0.8rem;"># Headers: Origin: https://your-domain.com</div>
                <br>
                <div># Get K3 Data</div>
                <div style="color: #4ecdc4;">GET /k3?game=1&api_key=YOUR_API_KEY</div>
                <div style="color: #888; font-size: 0.8rem;"># Headers: Origin: https://your-domain.com</div>
            </div>
        </div>
        
        <div class="section">
            <h2>🎮 Supported Games</h2>
            <div class="grid-2">
                <div><strong>Wingo</strong><br>Game IDs: 1, 3, 5, 30</div>
                <div><strong>K3</strong><br>Game IDs: 1, 3, 5, 30</div>
            </div>
        </div>
        
        <div class="footer">
            <p>📖 <a href="/docs" style="color: #667eea;">API Documentation</a> | 
            🔄 <a href="/redoc" style="color: #667eea;">ReDoc</a></p>
            <p style="margin-top: 8px;">© 2024 Quantum API. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
"""

@app.get("/", response_class=HTMLResponse)
async def root():
    """Serve index.html"""
    return HTML_INDEX

# ============================================
# Health Check
# ============================================
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    cors_headers = create_cors_headers()
    try:
        await db.command("ping")
        
        # Get basic stats
        api_keys_count = await api_keys_collection.count_documents({})
        domains_count = await domains_collection.count_documents({})
        users_count = await users_collection.count_documents({})
        
        return JSONResponse(
            status_code=200,
            content={
                "status": "healthy",
                "database": "connected",
                "timestamp": datetime.utcnow().isoformat(),
                "stats": {
                    "api_keys": api_keys_count,
                    "domains": domains_count,
                    "users": users_count
                },
                "version": "1.0.0"
            },
            headers=cors_headers
        )
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            },
            headers=cors_headers
        )

# ============================================
# API Key Routes
# ============================================

@app.post("/api/keys")
async def create_api_key(
    key_data: APIKeyCreate,
    request: Request
):
    """Create a new API key"""
    cors_headers = create_cors_headers()
    
    # Check if user exists
    user = await users_collection.find_one({"_id": ObjectId(key_data.user_id)})
    if not user:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "msg": "User not found"},
            headers=cors_headers
        )
    
    # Check if key already exists
    existing = await api_keys_collection.find_one({"key_value": key_data.key_value})
    if existing:
        return JSONResponse(
            status_code=409,
            content={"code": 409, "msg": "API key already exists"},
            headers=cors_headers
        )
    
    # Create key
    key_dict = key_data.model_dump()
    key_dict["created_at"] = datetime.utcnow()
    key_dict["updated_at"] = datetime.utcnow()
    
    result = await api_keys_collection.insert_one(key_dict)
    
    # Log audit
    await log_audit(
        user_id=key_data.user_id,
        action="create",
        resource="api_key",
        resource_id=str(result.inserted_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    # Return created key
    created_key = await api_keys_collection.find_one({"_id": result.inserted_id})
    created_key["_id"] = str(created_key["_id"])
    created_key["user_id"] = str(created_key["user_id"])
    
    return JSONResponse(
        status_code=201,
        content={
            "code": 201,
            "msg": "API Key created successfully",
            "data": created_key
        },
        headers=cors_headers
    )


@app.get("/api/keys")
async def list_api_keys(
    user_id: Optional[str] = Query(None, description="Filter by user ID")
):
    """List all API keys (optionally filtered by user)"""
    cors_headers = create_cors_headers()
    
    query = {}
    if user_id:
        query["user_id"] = user_id
    
    cursor = api_keys_collection.find(query)
    keys = []
    async for key in cursor:
        key["_id"] = str(key["_id"])
        key["user_id"] = str(key["user_id"])
        keys.append(key)
    
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "msg": "API Keys retrieved successfully",
            "data": keys,
            "count": len(keys)
        },
        headers=cors_headers
    )


@app.delete("/api/keys/{key_id}")
async def delete_api_key(key_id: str, request: Request):
    """Delete an API key"""
    cors_headers = create_cors_headers()
    
    try:
        obj_id = ObjectId(key_id)
    except:
        return JSONResponse(
            status_code=400,
            content={"code": 400, "msg": "Invalid key ID"},
            headers=cors_headers
        )
    
    result = await api_keys_collection.find_one_and_delete({"_id": obj_id})
    
    if not result:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "msg": "API Key not found"},
            headers=cors_headers
        )
    
    result["_id"] = str(result["_id"])
    result["user_id"] = str(result["user_id"])
    
    # Log audit
    await log_audit(
        user_id=result["user_id"],
        action="delete",
        resource="api_key",
        resource_id=key_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "msg": "API Key deleted successfully",
            "data": result
        },
        headers=cors_headers
    )

# ============================================
# Domain Routes
# ============================================

@app.post("/api/domains")
async def create_domain(
    domain_data: DomainCreate,
    request: Request
):
    """Register a new domain for a user"""
    cors_headers = create_cors_headers()
    
    # Check if user exists
    user = await users_collection.find_one({"_id": ObjectId(domain_data.user_id)})
    if not user:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "msg": "User not found"},
            headers=cors_headers
        )
    
    # Check if domain already exists for this user
    existing = await domains_collection.find_one({
        "user_id": domain_data.user_id,
        "domain_name": domain_data.domain_name
    })
    if existing:
        return JSONResponse(
            status_code=409,
            content={"code": 409, "msg": "Domain already registered for this user"},
            headers=cors_headers
        )
    
    # Create domain
    domain_dict = domain_data.model_dump()
    domain_dict["status"] = "active"
    domain_dict["reviewed_at"] = None
    domain_dict["created_at"] = datetime.utcnow()
    domain_dict["updated_at"] = datetime.utcnow()
    
    result = await domains_collection.insert_one(domain_dict)
    
    # Log audit
    await log_audit(
        user_id=domain_data.user_id,
        action="create",
        resource="domain",
        resource_id=str(result.inserted_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    created_domain = await domains_collection.find_one({"_id": result.inserted_id})
    created_domain["_id"] = str(created_domain["_id"])
    created_domain["user_id"] = str(created_domain["user_id"])
    
    return JSONResponse(
        status_code=201,
        content={
            "code": 201,
            "msg": "Domain registered successfully",
            "data": created_domain
        },
        headers=cors_headers
    )


@app.get("/api/domains")
async def list_domains(
    user_id: Optional[str] = Query(None, description="Filter by user ID")
):
    """List all domains (optionally filtered by user)"""
    cors_headers = create_cors_headers()
    
    query = {}
    if user_id:
        query["user_id"] = user_id
    
    cursor = domains_collection.find(query)
    domains = []
    async for domain in cursor:
        domain["_id"] = str(domain["_id"])
        domain["user_id"] = str(domain["user_id"])
        domains.append(domain)
    
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "msg": "Domains retrieved successfully",
            "data": domains,
            "count": len(domains)
        },
        headers=cors_headers
    )


@app.delete("/api/domains/{domain_id}")
async def delete_domain(domain_id: str, request: Request):
    """Delete a domain"""
    cors_headers = create_cors_headers()
    
    try:
        obj_id = ObjectId(domain_id)
    except:
        return JSONResponse(
            status_code=400,
            content={"code": 400, "msg": "Invalid domain ID"},
            headers=cors_headers
        )
    
    result = await domains_collection.find_one_and_delete({"_id": obj_id})
    
    if not result:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "msg": "Domain not found"},
            headers=cors_headers
        )
    
    result["_id"] = str(result["_id"])
    result["user_id"] = str(result["user_id"])
    
    # Log audit
    await log_audit(
        user_id=result["user_id"],
        action="delete",
        resource="domain",
        resource_id=domain_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "msg": "Domain deleted successfully",
            "data": result
        },
        headers=cors_headers
    )

# ============================================
# User Routes
# ============================================

@app.post("/api/users")
async def create_user(
    user_data: UserCreate,
    request: Request
):
    """Create a new user"""
    cors_headers = create_cors_headers()
    
    # Check if user exists
    existing = await users_collection.find_one({"email": user_data.email})
    if existing:
        return JSONResponse(
            status_code=409,
            content={"code": 409, "msg": "User already exists"},
            headers=cors_headers
        )
    
    # Create user
    user_dict = {
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "is_active": True,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await users_collection.insert_one(user_dict)
    
    # Log audit
    await log_audit(
        user_id=str(result.inserted_id),
        action="create",
        resource="user",
        resource_id=str(result.inserted_id),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    created_user = await users_collection.find_one({"_id": result.inserted_id})
    created_user["_id"] = str(created_user["_id"])
    del created_user["password_hash"]  # Don't return password
    
    return JSONResponse(
        status_code=201,
        content={
            "code": 201,
            "msg": "User created successfully",
            "data": created_user
        },
        headers=cors_headers
    )


@app.post("/api/login")
async def login_user(
    email: str = Body(...),
    password: str = Body(...),
    request: Request = None
):
    """Login user and return user data"""
    cors_headers = create_cors_headers()
    
    user = await users_collection.find_one({"email": email})
    
    if not user:
        return JSONResponse(
            status_code=401,
            content={"code": 401, "msg": "Invalid credentials"},
            headers=cors_headers
        )
    
    if not verify_password(password, user["password_hash"]):
        return JSONResponse(
            status_code=401,
            content={"code": 401, "msg": "Invalid credentials"},
            headers=cors_headers
        )
    
    if not user.get("is_active", True):
        return JSONResponse(
            status_code=403,
            content={"code": 403, "msg": "User account is disabled"},
            headers=cors_headers
        )
    
    user["_id"] = str(user["_id"])
    del user["password_hash"]
    
    # Log audit
    await log_audit(
        user_id=user["_id"],
        action="login",
        resource="user",
        resource_id=user["_id"],
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent") if request else None
    )
    
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "msg": "Login successful",
            "data": user
        },
        headers=cors_headers
    )

# ============================================
# Game Routes - Main API
# ============================================

@app.get("/verify")
async def verify_api_key_endpoint(
    api_key: str = Query(..., description="API Key to verify"),
    request: Request = None
):
    """Verify if an API key is valid and active"""
    cors_headers = create_cors_headers()
    
    # Validate API key
    validation = await validate_api_key(api_key)
    
    if not validation["valid"]:
        return JSONResponse(
            status_code=validation["code"],
            content={"code": validation["code"], "msg": validation["error"]},
            headers=cors_headers
        )
    
    return JSONResponse(
        status_code=200,
        content={"code": 200, "msg": "API Key is active and valid"},
        headers=cors_headers
    )


@app.get("/wingo")
async def get_wingo_data(
    game: str = Query(..., description="Game ID: 1, 3, 5, or 30"),
    api_key: str = Query(..., description="Your API key"),
    request: Request = None
):
    """Get Wingo game data"""
    return await handle_game_request("/wingo", game, api_key, request)


@app.get("/k3")
async def get_k3_data(
    game: str = Query(..., description="Game ID: 1, 3, 5, or 30"),
    api_key: str = Query(..., description="Your API key"),
    request: Request = None
):
    """Get K3 game data"""
    return await handle_game_request("/k3", game, api_key, request)


async def handle_game_request(path: str, game: str, api_key: str, request: Request):
    """Handle game data requests"""
    cors_headers = create_cors_headers()
    
    # Get game handler
    handler_class = GAME_HANDLERS.get(path)
    if not handler_class:
        return JSONResponse(
            status_code=404,
            content={"code": 404, "msg": "Game endpoint not found"},
            headers=cors_headers
        )
    
    # Validate API key
    key_validation = await validate_api_key(api_key)
    if not key_validation["valid"]:
        return JSONResponse(
            status_code=key_validation["code"],
            content={"code": key_validation["code"], "msg": key_validation["error"]},
            headers=cors_headers
        )
    
    # Extract domain from Origin or Referer
    origin = request.headers.get("Origin") or request.headers.get("Referer")
    domain = extract_domain_from_origin(origin)
    
    if not domain:
        return JSONResponse(
            status_code=403,
            content={
                "code": 403,
                "msg": "Origin domain could not be determined. Request must contain Origin or Referer header."
            },
            headers=cors_headers
        )
    
    # Validate domain
    domain_validation = await validate_domain(key_validation["user_id"], domain)
    if not domain_validation["valid"]:
        return JSONResponse(
            status_code=domain_validation["code"],
            content={"code": domain_validation["code"], "msg": domain_validation["error"]},
            headers=cors_headers
        )
    
    # Log audit for game access
    await log_audit(
        user_id=key_validation["user_id"],
        action="access",
        resource=path[1:],  # Remove leading slash
        details={"game_id": game, "domain": domain},
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent")
    )
    
    # Fetch game data
    handler = handler_class()
    fetch_result = await handler.fetch(game)
    
    # Check if fetch was successful
    if not fetch_result.get("ok"):
        return JSONResponse(
            status_code=fetch_result.get("status", 500),
            content={
                "code": fetch_result.get("status", 500),
                "msg": "Failed to fetch data from target API",
                "error": fetch_result.get("error", "Unknown error")
            },
            headers=cors_headers
        )
    
    # Format result
    formatted_result = handler.format_result(fetch_result)
    
    if formatted_result.get("error"):
        return JSONResponse(
            status_code=formatted_result.get("status", 500),
            content={
                "code": formatted_result.get("status", 500),
                "msg": formatted_result.get("msg", "Unknown error"),
                "error": formatted_result.get("details", "Unknown error")
            },
            headers=cors_headers
        )
    
    # Process data
    data = formatted_result.get("data", "{}")
    processed_data = parse_and_add_author(data)
    
    return JSONResponse(
        status_code=formatted_result.get("status", 200),
        content=json.loads(processed_data) if processed_data else {},
        headers=cors_headers
    )


# ============================================
# CORS Options Handler
# ============================================
@app.options("/{path:path}")
async def options_handler():
    """Handle OPTIONS requests for CORS"""
    return JSONResponse(
        status_code=200,
        content={"msg": "OK"},
        headers=create_cors_headers()
    )


# ============================================
# Settings Routes
# ============================================

@app.get("/api/settings")
async def get_settings():
    """Get all settings"""
    cors_headers = create_cors_headers()
    
    cursor = settings_collection.find({})
    settings = []
    async for setting in cursor:
        setting["_id"] = str(setting["_id"])
        settings.append(setting)
    
    return JSONResponse(
        status_code=200,
        content={
            "code": 200,
            "msg": "Settings retrieved successfully",
            "data": settings
        },
        headers=cors_headers
    )


@app.post("/api/settings")
async def create_setting(
    key: str = Body(...),
    value: Any = Body(...),
    description: Optional[str] = Body("")
):
    """Create or update a setting"""
    cors_headers = create_cors_headers()
    
    # Check if setting exists
    existing = await settings_collection.find_one({"key": key})
    
    if existing:
        # Update existing setting
        await settings_collection.update_one(
            {"key": key},
            {"$set": {"value": value, "description": description, "updated_at": datetime.utcnow()}}
        )
        updated = await settings_collection.find_one({"key": key})
        updated["_id"] = str(updated["_id"])
        return JSONResponse(
            status_code=200,
            content={
                "code": 200,
                "msg": "Setting updated successfully",
                "data": updated
            },
            headers=cors_headers
        )
    else:
        # Create new setting
        setting_dict = {
            "key": key,
            "value": value,
            "description": description,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        result = await settings_collection.insert_one(setting_dict)
        created = await settings_collection.find_one({"_id": result.inserted_id})
        created["_id"] = str(created["_id"])
        return JSONResponse(
            status_code=201,
            content={
                "code": 201,
                "msg": "Setting created successfully",
                "data": created
            },
            headers=cors_headers
        )

# ============================================
# Main Entry Point
# ============================================
if __name__ == "__main__":
    import uvicorn
    
    print("=" * 60)
    print("🚀 Starting Quantum API Server")
    print("=" * 60)
    print(f"📦 Database: {DATABASE_NAME}")
    print(f"🔗 MongoDB: {MONGODB_URI.split('@')[1].split('/')[0] if '@' in MONGODB_URI else 'localhost'}")
    print(f"🔑 Secret Key: {SECRET_KEY[:8]}...")
    print("=" * 60)
    print("\n📚 API Documentation available at /docs")
    print("🔄 ReDoc available at /redoc")
    print("📍 Homepage at /")
    print("=" * 60)
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )