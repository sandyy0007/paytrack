# 🚀 PayTrack 24/7 Production Deployment Guide (VPS / Cloud Server)

This guide deploys the **PayTrack Backend API** and **PostgreSQL Database** permanently to any VPS / Cloud Server (DigitalOcean, AWS EC2, Hetzner, GCP, Linode, Oracle Cloud, etc.).

Once deployed, **your laptop can be completely powered off**, and the mobile application will connect 24/7 directly to your cloud server over secure HTTPS.

---

## 🏗️ Architecture

```
[ Android Mobile App (PayTrack) ]
               │
               ▼  (Permanent HTTPS / SSL)
    [ Caddy 2 Reverse Proxy ]
               │
               ▼  (HTTP :4000)
    [ PayTrack API (Node 22 / Express 5) ]
               │
               ▼  (Internal Docker Network)
[ PostgreSQL 16 (Persistent Named Volume paytrack_pgdata) ]
```

- **Permanent HTTPS**: Caddy automatically provisions and auto-renews free Let's Encrypt TLS certificates.
- **Persistent Data**: Database data is stored in the Docker volume `paytrack_pgdata` and is never lost across server restarts or container rebuilds.
- **Zero Laptop Dependency**: Runs 24/7 autonomously on your cloud server.

---

## 📋 Prerequisites on Your Cloud VPS

1. A Linux server (Ubuntu 22.04 / 24.04 or Debian recommended).
2. Ports `80` and `443` open in your cloud firewall (Security Groups / UFW).
3. Docker and Docker Compose installed:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. (Recommended) A domain or subdomain pointed to your VPS IP address:
   - Example: Add an `A` record `api.yourdomain.com` -> `YOUR_VPS_PUBLIC_IP`.

---

## ⚡ Quick Start (1-Command Deployment)

### Step 1: Upload the Project to Your Server
From your local computer:
```bash
# Using rsync or scp
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'apps/mobile/android' \
  /path/to/Paytrack/ user@YOUR_VPS_IP:/opt/paytrack/
```
Or clone directly from your Git repository on the server:
```bash
git clone <your-repo-url> /opt/paytrack
cd /opt/paytrack
```

### Step 2: Configure Environment Variables
Inside the `deploy` folder on your server:
```bash
cd /opt/paytrack/deploy
cp .env.example .env
nano .env
```
Update the values:
```env
# Set your domain for automated HTTPS (Let's Encrypt):
DOMAIN=api.yourdomain.com

# PostgreSQL credentials
POSTGRES_DB=paytrack
POSTGRES_USER=paytrack_admin
POSTGRES_PASSWORD=your_secure_password_here_12345

# JWT Secret (minimum 32 characters)
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_random
```
*(If you do not have a domain yet and want to test directly via IP or HTTP, set `DOMAIN=:80`)*

### Step 3: Run the Setup Script
```bash
chmod +x setup.sh backup.sh
./setup.sh
```
The script will:
1. Build the production multi-stage PayTrack Docker image.
2. Launch PostgreSQL 16 with health checks and persistent volume storage.
3. Automatically execute all database migrations (`001_init.sql`).
4. Restore existing user accounts (`Sandeep` / `sk74531614@gmail.com`) and expense history.
5. Launch Caddy reverse proxy and fetch Let's Encrypt SSL certificates.

---

## 🔍 Verification & Health Check

Test that the API is responding to the world:
```bash
curl https://api.yourdomain.com/health
```
Response:
```json
{"ok": true}
```

Verify authentication and existing user login:
```bash
curl -X POST https://api.yourdomain.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sk74531614@gmail.com","password":"YOUR_PASSWORD"}'
```

---

## 💾 Automated Database Backups

To set up automatic daily backups at 3:00 AM:
```bash
crontab -e
```
Add the following line:
```cron
0 3 * * * /opt/paytrack/deploy/backup.sh >> /var/log/paytrack_backup.log 2>&1
```
Backups are saved to `/opt/paytrack/deploy/backups/` and retained for 14 days automatically.

---

## 📱 Pointing the Mobile App to Your Cloud API

You have two convenient ways to use your cloud server with the mobile app:

### Method A: Build APK with Embedded Production URL
In `apps/mobile/app.json`:
```json
"extra": {
  "apiUrl": "https://api.yourdomain.com"
}
```
Then build the release APK:
```bash
cd apps/mobile/android
./gradlew.bat app:assembleRelease
```
The resulting `PayTrack-release.apk` will automatically connect to your cloud API out of the box.

### Method B: Configure in App UI (Instant)
1. Open the PayTrack APK on your phone.
2. On the Login screen, tap **"Server settings"** at the bottom.
3. Enter `https://api.yourdomain.com` and tap **Save**.
4. Log in with your email (`sk74531614@gmail.com`) and password.
