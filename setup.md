# Repo Deployer — Deployment Guide

## Proxmox VM / LXC

### 1. Create the container

Recommended: **Ubuntu 22.04 or 24.04 LXC** (lighter than a full VM).

Minimum specs:

| Resource | Minimum |
|----------|---------|
| CPU | 2 vCPU |
| RAM | 4 GB |
| Disk | 20 GB |

If using an **LXC container**, enable nesting so Docker can run inside it:
> Proxmox UI → Container → Options → Features → check **Nesting**

---

### 2. Install dependencies

```bash
curl -fsSL https://get.docker.com | sh
apt install -y git
```

---

### 3. Get the code onto the VM

**Option A — clone from Git:**
```bash
git clone <your-repo-url> /opt/repo-deployer
cd /opt/repo-deployer
```

**Option B — copy from your local machine:**
```bash
# Run this on your local machine, not the VM
scp -r /path/to/repo-deployer-v2 user@<proxmox-ip>:/opt/repo-deployer
```

---

### 4. Run the setup script

```bash
cd /opt/repo-deployer
bash setup-proxmox.sh <proxmox-vm-ip>
```

This script:
- Creates `.env` from `.env.example`
- Updates OAuth redirect URIs to point at your VM's IP
- Builds and starts all containers using the Proxmox overrides:
  - nginx reverse proxy on port 80
  - Backend runs without `--reload` (production mode)
  - Automated daily PostgreSQL backups with 7-day retention
  - Resource limits per service

---

### 5. Fill in credentials

```bash
nano /opt/repo-deployer/.env
```

Required fields:

```env
SECRET_KEY=          # generate with: openssl rand -hex 32
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

Optional but recommended:

```env
GITHUB_TOKEN=        # raises GitHub API rate limit from 60 to 5000 req/hr
```

Then update your **Google OAuth app** to add the VM as an authorised redirect URI:
```
http://<proxmox-ip>/auth/google/callback
```

After editing `.env`, restart:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml up -d
```

---

### 6. Access the app

| Service | URL |
|---------|-----|
| App (via nginx) | `http://<proxmox-ip>` |
| API (direct) | `http://<proxmox-ip>:8001` |
| API docs | `http://<proxmox-ip>:8001/api/docs` |

---

## Day-to-day commands

```bash
# View live logs
docker compose logs -f

# View logs for one service
docker compose logs -f api

# Stop everything
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml down

# Update after a git pull (rebuilds changed layers)
git pull
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml up -d --build

# Force full rebuild (e.g. after adding a Python dependency)
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml build --no-cache api
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml up -d
```

> **Note:** After adding packages to `requirements.txt`, always use `--no-cache` on the build step.
> Docker caches the `pip install` layer and will silently skip new dependencies otherwise.

---

## Migrate stale ZIP paths (one-time)

If you previously ran the app before May 2026, existing repos may have ZIP paths in the old flat format. Fix them with one API call after startup:

```bash
curl -X POST http://<proxmox-ip>/api/admin/migrate-zip-paths
```

---

## Backups

PostgreSQL backups run automatically every day and are stored in a Docker volume (`db_backups`). Retention: 7 daily, 4 weekly, 3 monthly.

To restore a backup:

```bash
# List available backups
docker exec repo-deployer-db-backup ls /backups/

# Restore (replace <filename> with the backup file)
docker exec -i repo-deployer-db \
  psql -U postgres repo_deployer < /path/to/backup/<filename>
```

---

## Browser extension

After deploying, point the extension at your VM:

1. Open the extension popup
2. Scroll to **Server URL**
3. Enter `http://<proxmox-ip>` and click **Save**
