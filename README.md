# Repo Deployer v2

A powerful, self-hosted platform for managing, cloning, and deploying GitHub repositories. Import your browser bookmarks, organize repositories by category and tags, fetch GitHub metadata, and deploy to Docker containers.

---

## Table of Contents

- [Features](#features)
- [Quick Start — Local Machine](#quick-start--local-machine)
- [Quick Start — Proxmox / Server](#quick-start--proxmox--server)
- [Browser Extension Setup](#browser-extension-setup)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Project Structure](#project-structure)
- [Development (without Docker)](#development-without-docker)
- [Tech Stack](#tech-stack)

---

## Features

### Repository Management
- **Bookmark Import** — Import GitHub URLs from browser bookmark HTML files (Chrome, Firefox, Edge)
- **Drag & Drop** — Simply drag bookmark files onto the import area
- **Smart Categorization** — Automatic category suggestions based on repository topics, language, and description
- **Custom Tags** — Create color-coded tags for flexible organization
- **Bulk Operations** — Update categories, clone, or delete multiple repositories at once

### GitHub Integration
- **Metadata Sync** — Fetch stars, forks, watchers, language, topics, and license info
- **Health Monitoring** — Bulk check if repositories still exist on GitHub with progress tracking
- **Rate Limiting** — Smart API rate limiting with configurable chunking and delays (supports 4000+ repos)
- **GitHub Authentication** — Optional token support for 83x higher rate limits (5000 req/hr vs 60/hr)
- **Duplicate Detection** — Prevents importing the same repository twice
- **GitHub OAuth Login** — Sign in and register with your GitHub account
- **Google OAuth Login** — Sign in and register with your Google account

### GitHub Profile & Bookmarks
- **GitHub Account Connection** — Link your GitHub account from User Settings
- **Automatic Repository Sync** — Create a private "git-bookmark" repository and sync bookmarks automatically
- **Smart Merging** — Intelligently merge local and remote bookmarks without duplicates
- **Scheduled Sync** — Daily automatic sync at 2:00 AM UTC
- **Manual Sync** — Trigger sync anytime with one click
- **Secure Token Storage** — GitHub tokens encrypted with Fernet encryption
- **Cross-Device Sync** — Keep your bookmarks in sync across all devices via GitHub

### Clone & Deploy
- **Batch Cloning** — Clone multiple repositories simultaneously (up to 3 concurrent)
- **Clone to ZIP** — Automatically create ZIP archives of cloned repositories (main/master branch)
- **Background Sync** — ZIP creation runs asynchronously without blocking the UI
- **ZIP Status Tracking** — Per-repository ZIP status (pending/in_progress/done/failed)
- **Progress Tracking** — Real-time clone progress with status updates
- **Docker Deployment** — Deploy cloned repositories to Docker containers

### Browser Extension
- **Chrome & Firefox** — One-click import of GitHub repository URLs directly from your browser
- **Repository Detection** — Detects GitHub URLs and allows manual entry as fallback
- **Instant Sync** — Sends repositories directly to the app via API
- **Configurable Server URL** — Point the extension at localhost or any Proxmox/server IP
- **Cross-Browser** — Works seamlessly across Chrome, Firefox, and Edge

### User Experience
- **Keyboard Shortcuts** — Vim-style navigation (j/k), quick search (/), and more
- **Sortable Columns** — Sort by name, date, stars, or any column
- **Advanced Filters** — Filter by category, cloned status, deployed status
- **Export Options** — Export to CSV, JSON, or Markdown
- **Repository Details** — View full metadata in a slide-out panel

---

## Quick Start — Local Machine

### Prerequisites
- Docker and Docker Compose
- Git

### Steps

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd repo-deployer-v2

# 2. Create your .env file
cp .env.example .env
# Edit .env and fill in your GitHub token, OAuth credentials, etc.

# 3. Start all services
docker compose up -d --build
```

### Access

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:3000      |
| API      | http://localhost:8001      |
| API Docs | http://localhost:8001/docs |
| Database | localhost:5432             |

> **Bookmark backup files** are saved to your Desktop by default (`~/Desktop`).
> Override this by setting `BACKUP_HOST_PATH=/your/path` in `.env`.

---

## Quick Start — Proxmox / Server

Use the included setup script to deploy on a Proxmox container (LXC/VM) or any Linux server.

### Prerequisites (on the Proxmox container)

```bash
apt update && apt install -y docker.io docker-compose-plugin git curl
```

### Steps

```bash
# 1. Clone the repository onto the container
git clone <your-repo-url>
cd repo-deployer-v2

# 2. Run the setup script (auto-detects container IP)
bash setup-proxmox.sh

# — or pass your IP explicitly:
bash setup-proxmox.sh 192.168.1.50
```

The script will:
- Create `.env` from `.env.example` if it doesn't exist
- Set `BACKUP_HOST_PATH=/opt/repo-deployer/backups` (creates the directory)
- Update OAuth redirect URIs from `localhost` to your server IP
- Build and start all containers using the Proxmox production overlay

### Access

Replace `<PROXMOX_IP>` with the IP shown at the end of the script output.

| Service  | URL                              |
|----------|----------------------------------|
| Frontend | http://\<PROXMOX_IP\>:3000       |
| API      | http://\<PROXMOX_IP\>:8001       |
| API Docs | http://\<PROXMOX_IP\>:8001/docs  |

### Managing the stack

```bash
# Start / restart
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml up -d

# Stop
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml down

# View logs
docker compose logs -f

# Update (pull new code and rebuild)
git pull
docker compose -f docker-compose.yml -f docker-compose.proxmox.yml up -d --build
```

### What docker-compose.proxmox.yml changes

| Setting | Local default | Proxmox override |
|---------|---------------|------------------|
| Backend command | `uvicorn ... --reload` | `uvicorn ...` (no reload) |
| Log level | INFO | WARNING |
| Backup storage | `~/Desktop` bind mount | Named Docker volume `backups` |

### OAuth redirect URIs (if using GitHub/Google login)

After deploying, update your OAuth app callbacks to point to the server:

- **GitHub OAuth app** → Settings → Authorization callback URL:
  `http://<PROXMOX_IP>:3000/auth/github/callback`
- **Google OAuth** → Cloud Console → Authorized redirect URI:
  `http://<PROXMOX_IP>:3000/auth/google/callback`

---

## Browser Extension Setup

### Installation

#### Chrome / Edge
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `browser-extension/` folder
5. The extension icon appears in your toolbar

#### Firefox
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select any file inside the `browser-extension/` folder
4. The extension icon appears in your toolbar

### Configuring the Server URL

The extension works with both a local machine and a remote Proxmox server. You configure which one to use inside the extension itself — no reinstall needed.

1. Click the extension icon to open the sidebar
2. Scroll to the **Server URL** section at the bottom
3. Enter the URL of your running instance:
   - **Local:** `http://localhost:3000`
   - **Proxmox:** `http://192.168.1.50:3000` (use your actual IP)
4. Click **Save**

The setting is persisted across browser restarts via `chrome.storage.sync`.

### Usage

1. Navigate to any GitHub repository page
2. The extension auto-detects the repository URL
3. Click **Import** next to any detected URL, or use **Import All**
4. To import something not on the current page, paste a URL in **"Or Enter URL Manually"**
5. To bulk-import from browser bookmarks, use the **Browser Bookmarks Import** section

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
# GitHub API token (optional but highly recommended)
# Without: 60 req/hour  |  With: 5,000 req/hour
# Get at: https://github.com/settings/tokens (scope: public_repo)
GITHUB_TOKEN=ghp_...

# Secret key for JWT tokens (generate a random 32+ char string)
SECRET_KEY=change-me-to-something-random-and-long

# GitHub OAuth (for Login with GitHub)
# Create at: https://github.com/settings/developers
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/github/callback

# Google OAuth (for Login with Google)
# Create at: https://console.cloud.google.com/
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Email (for password reset & notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password_here

# Backup path — where bookmark JSON exports are saved on the HOST
# Leave blank to use ~/Desktop (local) or set to a path for Proxmox
BACKUP_HOST_PATH=
```

> Database and Redis URLs are configured automatically inside `docker-compose.yml` and do not need to be set in `.env`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              React Frontend (TypeScript)                │
│  • Vite build system                                    │
│  • Zustand state management                             │
│  • Tailwind CSS styling                                 │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API  (/api proxy via Vite dev server)
┌─────────────────────▼───────────────────────────────────┐
│              FastAPI Backend (Python 3.12)              │
│  • Async endpoints                                      │
│  • Background task processing                           │
│  • Clone queue with threading                           │
└─────────────────────┬───────────────────────────────────┘
                      │ SQLAlchemy ORM
┌─────────────────────▼───────────────────────────────────┐
│              PostgreSQL 16 + Redis 7                    │
│  • Repository metadata storage                          │
│  • Tags and categories                                  │
│  • Caching layer                                        │
└─────────────────────────────────────────────────────────┘
```

The browser extension calls the **frontend URL** (e.g. `http://localhost:3000`). The Vite dev server proxies all `/api/*` requests to the FastAPI backend — so there is only one URL to configure in the extension regardless of environment.

---

## API Reference

### Repositories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/repositories` | List all repositories (supports sorting, pagination) |
| GET | `/api/repositories/{id}` | Get repository details |
| POST | `/api/repositories` | Create new repository |
| PUT | `/api/repositories/{id}` | Update repository |
| DELETE | `/api/repositories/{id}` | Delete repository |
| POST | `/api/repositories/{id}/clone` | Clone repository |
| POST | `/api/repositories/{id}/sync` | Sync/pull updates |
| POST | `/api/repositories/{id}/sync-metadata` | Fetch GitHub metadata |
| POST | `/api/repositories/{id}/check-health` | Check repository health |

### Clone Queue
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clone-queue/status` | Get queue status |
| GET | `/api/clone-queue/jobs` | List all jobs |
| POST | `/api/clone-queue/add` | Add repositories to queue |
| POST | `/api/clone-queue/cancel/{id}` | Cancel pending job |
| POST | `/api/clone-queue/clear` | Clear completed jobs |

### ZIP Archive
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/repositories/{id}/zip` | Enqueue ZIP archive job |
| GET | `/api/repositories/{id}/zip/status` | Get ZIP status |
| GET | `/api/zip/statuses` | Get ZIP statuses for all repos |
| POST | `/api/zip/sync` | Trigger ZIP sync for all unarchived repos |

### Tags
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tags` | List all tags |
| POST | `/api/tags` | Create new tag |
| DELETE | `/api/tags/{id}` | Delete tag |
| POST | `/api/repositories/{id}/tags` | Add tags to repository |

### Import & Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/import/html` | Import from HTML bookmark file |
| GET | `/api/export/csv` | Export to CSV |
| GET | `/api/export/json` | Export to JSON |
| GET | `/api/export/markdown` | Export to Markdown |

### GitHub Bookmarks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/github-bookmarks/status` | Get GitHub bookmark connection status |
| POST | `/api/github-bookmarks/connect` | Connect GitHub account via OAuth |
| POST | `/api/github-bookmarks/disconnect` | Disconnect GitHub account |
| POST | `/api/github-bookmarks/sync` | Manually trigger bookmark sync |
| GET | `/api/github-bookmarks/data` | Get current bookmarks data |
| POST | `/api/github-bookmarks/bookmark/add` | Add or update a bookmark |
| DELETE | `/api/github-bookmarks/bookmark/remove` | Remove a bookmark |

### Bulk Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bulk/update-category` | Update category for multiple repos |
| POST | `/api/bulk/delete` | Delete multiple repositories |
| POST | `/api/bulk/health-check` | Check health of all repositories |
| GET | `/api/bulk/health-check/{job_id}/progress` | Get real-time health check progress |

### Sync Progress
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/import/sync-progress` | Get current metadata sync progress |
| POST | `/api/import/sync-progress/reset` | Reset metadata sync progress |
| POST | `/api/import/sync/pause` | Pause the sync process |
| POST | `/api/import/sync/resume` | Resume the sync process |
| POST | `/api/import/sync/stop` | Stop the sync process |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `j` | Next item |
| `k` | Previous item |
| `Enter` / `Space` | Toggle selection |
| `o` | Open details panel |
| `d` | Delete selected |
| `Esc` | Clear selection / Close modal |
| `Ctrl+A` | Select all |
| `Ctrl+E` | Export |
| `Ctrl+Shift+R` | Refresh |

---

## Project Structure

```
repo-deployer-v2/
├── backend/
│   ├── main.py                    # FastAPI application & routes
│   ├── database.py                # Database configuration
│   ├── models.py                  # SQLAlchemy models
│   ├── schemas.py                 # Pydantic schemas
│   ├── crud/
│   │   ├── repository.py
│   │   └── tags.py
│   ├── services/
│   │   ├── github_service.py      # GitHub API integration
│   │   ├── import_service.py      # Metadata sync
│   │   ├── zip_queue.py           # Async ZIP archive queue
│   │   └── email_service.py
│   ├── migrations/                # SQL migration scripts
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── ...
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── browser-extension/
│   ├── manifest.json              # Chrome / Edge (Manifest V3)
│   ├── manifest.firefox.json      # Firefox (Manifest V2)
│   ├── popup.html                 # Sidebar UI
│   ├── popup.js                   # Sidebar logic
│   ├── background.js              # Service worker (Chrome)
│   ├── background.firefox.js      # Background script (Firefox)
│   └── content.js                 # Page URL detection
├── docs/                          # Detailed documentation
├── docker-compose.yml             # Base compose (local + Proxmox base)
├── docker-compose.proxmox.yml     # Proxmox production overrides
├── setup-proxmox.sh               # One-command Proxmox setup script
├── .env.example                   # Environment variable template
└── README.md
```

---

## Development (without Docker)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Requires a running PostgreSQL instance and Redis. Set `DATABASE_URL` and `REDIS_URL` in your shell or `.env`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server starts on port 3000 and proxies `/api` requests to `http://api:8000`. When running outside Docker, update `vite.config.ts` to point to your local backend (`http://localhost:8000`).

---

## Clone & Archive System

When you clone a repository, the system automatically creates a ZIP archive of the main branch in the background.

**ZIP status values:**

| Status | Meaning |
|--------|---------|
| `pending` | Job queued, waiting to process |
| `in_progress` | Currently creating archive |
| `done` | Archive successfully created |
| `failed` | Archive creation failed |

**Quick API usage:**
```bash
# Check ZIP status for a repository
curl http://localhost:8001/api/repositories/{id}/zip/status

# Get all ZIP statuses
curl http://localhost:8001/api/zip/statuses

# Manually trigger ZIP for all unarchived repos
curl -X POST http://localhost:8001/api/zip/sync
```

---

## GitHub API Rate Limiting

| Mode | Rate limit | Recommended for |
|------|-----------|-----------------|
| No token | 60 req/hour | < 100 repos |
| With token | 5,000 req/hour | 4,000+ repos |

**Setup:**
1. Go to https://github.com/settings/tokens/new
2. Select scope: `public_repo`
3. Add to `.env`: `GITHUB_TOKEN=ghp_...`

See [docs/GITHUB_API_RATE_LIMITING.md](docs/GITHUB_API_RATE_LIMITING.md) for detailed configuration and chunking behaviour.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS, Zustand |
| Backend | Python 3.12, FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Container | Docker, Docker Compose |
| Extension | Chrome Manifest V3 / Firefox Manifest V2 |

---

## Documentation

| File | Contents |
|------|----------|
| [docs/FEATURES.md](docs/FEATURES.md) | Current implemented features |
| [docs/FEATURES_ROADMAP.md](docs/FEATURES_ROADMAP.md) | Feature implementation status |
| [docs/FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md) | Planned features |
| [docs/GITHUB_API_RATE_LIMITING.md](docs/GITHUB_API_RATE_LIMITING.md) | Rate limiting architecture |
| [docs/RATE_LIMITING_QUICK_START.md](docs/RATE_LIMITING_QUICK_START.md) | Quick setup guide |
| [docs/HEALTH_CHECK_IMPLEMENTATION.md](docs/HEALTH_CHECK_IMPLEMENTATION.md) | Health check details |
| [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md) | OAuth configuration guide |

---

## License

MIT License — see LICENSE file for details.

---

**Version:** 2.5.0  
**Last Updated:** May 2026
