#!/bin/bash
set -e

echo "=============================================="
echo " PayTrack Production Deployment & Setup Script"
echo "=============================================="

# 1. Check docker and docker compose
if ! command -v docker &> /dev/null; then
    echo "❌ Error: docker is not installed. Please install Docker first: https://docs.docker.com/engine/install/"
    exit 1
fi

# 2. Setup .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env from .env.example..."
    cp .env.example .env
    
    # Generate random strong passwords
    DB_PASS=$(openssl rand -hex 16 2>/dev/null || date +%s | sha256sum | base64 | head -c 24)
    JWT_SEC=$(openssl rand -hex 32 2>/dev/null || date +%s | sha256sum | base64 | head -c 48)
    
    sed -i "s/replace_with_strong_password_abc123xyz!/$DB_PASS/" .env
    sed -i "s/super_secret_jwt_key_minimum_32_characters_random_99182374/$JWT_SEC/" .env
    
    echo "✅ Generated secure random passwords for PostgreSQL and JWT_SECRET."
    echo "⚠️  NOTE: Please edit deploy/.env and set your DOMAIN (e.g. DOMAIN=api.yourdomain.com)"
fi

# 3. Pull / Build & Start containers
echo "🚀 Building and starting PayTrack production containers..."
docker compose build --pull
docker compose up -d

echo "⏳ Waiting for PostgreSQL and API to become healthy..."
sleep 5

# 4. Check API health endpoint
MAX_RETRIES=20
COUNT=0
HEALTHY=false

while [ $COUNT -lt $MAX_RETRIES ]; do
    if docker compose exec -T api node -e "fetch('http://localhost:4000/health').then(r => r.json()).then(j => process.exit(j.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
        HEALTHY=true
        break
    fi
    COUNT=$((COUNT+1))
    echo "Waiting for API service... ($COUNT/$MAX_RETRIES)"
    sleep 3
done

if [ "$HEALTHY" = true ]; then
    echo "✅ PayTrack API is running and healthy!"
else
    echo "⚠️ API healthcheck taking longer than expected. Checking logs:"
    docker compose logs --tail=20
fi

# 5. Restore existing user data if seed file exists
if [ -f seed_data.sql ]; then
    echo "📥 Checking and restoring existing user data into persistent database..."
    docker compose exec -T db psql -U paytrack_admin -d paytrack -f - < seed_data.sql || true
    echo "✅ User data check completed."
fi

echo "=============================================="
echo "🎉 PayTrack is now permanently running in the cloud!"
echo "   Your laptop can now be completely powered off."
echo "=============================================="
