# Repo Deployer v2

A powerful, self-hosted platform for managing, cloning, and deploying GitHub repositories. Import your browser bookmarks, organize repositories by category and tags, fetch GitHub metadata, and deploy to Docker containers.

## Features

### Repository Management
- **Bookmark Import** - Import GitHub URLs from browser bookmark HTML files (Chrome, Firefox, Edge)
- **Drag & Drop** - Simply drag bookmark files onto the import area
- **Smart Categorization** - Automatic category suggestions based on repository topics, language, and description
- **Custom Tags** - Create color-coded tags for flexible organization
- **Bulk Operations** - Update categories, clone, or delete multiple repositories at once

### GitHub Integration
- **Metadata Sync** - Fetch stars, forks, watchers, language, topics, and license info
- **Health Monitoring** - Bulk check if repositories still exist on GitHub with progress tracking
- **Rate Limiting** - Smart API rate limiting with configurable chunking and delays (supports 4000+ repos)
- **GitHub Authentication** - Optional token support for 83x higher rate limits (5000 req/hr vs 60/hr)
- **Duplicate Detection** - Prevents importing the same repository twice
- **GitHub OAuth Login** - Sign in and register with your GitHub account
- **Google OAuth Login** - Sign in and register with your Google account

### GitHub Profile & Bookmarks
- **GitHub Account Connection** - Link your GitHub account from User Settings
- **Automatic Repository Sync** - Create a private "git-bookmark" repository and sync bookmarks automatically
- **Smart Merging** - Intelligently merge local and remote bookmarks without duplicates
- **Scheduled Sync** - Daily automatic sync at 2:00 AM UTC
- **Manual Sync** - Trigger sync anytime with one click
- **Secure Token Storage** - GitHub tokens encrypted with Fernet encryption
- **Cross-Device Sync** - Keep your bookmarks in sync across all devices via GitHub

### Clone & Deploy
- **Batch Cloning** - Clone multiple repositories simultaneously (up to 3 concurrent)
- **Progress Tracking** - Real-time clone progress with status updates
- **Docker Deployment** - Deploy cloned repositories to Docker containers

### User Experience
- **Keyboard Shortcuts** - Vim-style navigation (j/k), quick search (/), and more
- **Sortable Columns** - Sort by name, date, stars, or any column
- **Advanced Filters** - Filter by category, cloned status, deployed status
- **Export Options** - Export to CSV, JSON, or Markdown
- **Repository Details** - View full metadata in a slide-out panel

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd repo-deployer-v2

# Start all services
docker-compose up --build
```

### Access Points
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Database | localhost:5432 |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              React 19 Frontend (TypeScript)             │
│  • Vite build system                                    │
│  • Zustand state management                             │
│  • Tailwind CSS styling                                 │
└─────────────────────┬───────────────────────────────────┘
                      │ REST API
┌─────────────────────▼───────────────────────────────────┐
│              FastAPI Backend (Python 3.11)              │
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
| POST | `/api/bulk/health-check` | Check health of all repositories with progress tracking |
| GET | `/api/bulk/health-check/{job_id}/progress` | Get real-time health check progress |

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

## Project Structure

```
repo-deployer-v2/
├── backend/
│   ├── main.py                 # FastAPI application & routes
│   ├── database.py             # Database configuration
│   ├── models.py               # SQLAlchemy models
│   ├── schemas.py              # Pydantic schemas
│   ├── crud/
│   │   ├── repository.py       # Repository CRUD
│   │   └── tags.py             # Tags CRUD
│   ├── services/
│   │   ├── bookmark_parser.py  # HTML bookmark parsing
│   │   ├── git_service.py      # Git clone/sync operations
│   │   ├── github_service.py   # GitHub API integration
│   │   ├── clone_queue.py      # Batch clone queue
│   │   ├── export_service.py   # CSV/JSON/Markdown export
│   │   └── search_service.py   # Full-text search & analytics
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/client.ts       # API client
│   │   ├── store/              # Zustand stores
│   │   ├── components/         # React components
│   │   ├── hooks/              # Custom hooks
│   │   └── pages/              # Page components
│   ├── package.json
│   └── Dockerfile
├── docs/                       # Documentation
│   ├── FEATURES.md
│   ├── FEATURES_ROADMAP.md
│   ├── FUTURE_FEATURES.md
│   ├── GITHUB_API_RATE_LIMITING.md
│   ├── HEALTH_CHECK_IMPLEMENTATION.md
│   ├── RATE_LIMITING_QUICK_START.md
│   └── ...
├── docker-compose.yml
└── README.md
```

## Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Configuration

### Environment Variables

Create `.env` in the project root:

```env
# FastAPI settings
SECRET_KEY=your_secret_key_here
ACCESS_TOKEN_EXPIRE_MINUTES=60
ALGORITHM=HS256

# GitHub OAuth Configuration (for login/registration)
# Create app at: https://github.com/settings/developers
# Authorization callback URL: http://localhost:3000/auth/github/callback
GITHUB_OAUTH_CLIENT_ID=your_github_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_github_client_secret
GITHUB_OAUTH_REDIRECT_URI=http://localhost:3000/auth/github/callback

# Google OAuth Configuration (for login/registration)
# Create credentials at: https://console.cloud.google.com/
# Redirect URI: http://localhost:3000/auth/google/callback
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback

# GitHub Bookmarks Encryption
# Generate key: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
GITHUB_TOKEN_ENCRYPTION_KEY=your_fernet_encryption_key

# GitHub API Authentication (Optional but recommended)
# Without token: 60 requests/hour limit
# With token: 5,000 requests/hour limit
# Get token: https://github.com/settings/tokens (needs public_repo scope)
GITHUB_TOKEN=github_pat_your_token_here

# Email settings (optional)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your_email@example.com
EMAIL_PASSWORD=your_email_password
EMAIL_FROM=your_email@example.com
EMAIL_FROM_NAME=Repo Deployer
```

The application automatically loads from `.env` via Docker Compose `env_file` directive.

## GitHub Profile & Bookmarks Setup

### Connect Your GitHub Account
1. Log in to Repo Deployer
2. Click the settings icon (gear) in the top navigation
3. Navigate to "GitHub Profile & Bookmarks" section
4. Click "Connect GitHub Account"
5. Authorize the application on GitHub
6. A private "git-bookmark" repository will be created automatically
7. Your bookmarks will be synced immediately

### How It Works
- **Initial Connection**: When you connect, the app creates a private "git-bookmark" repository and syncs all current bookmarks
- **Scheduled Sync**: Bookmarks automatically sync daily at 2:00 AM UTC
- **Smart Merging**: When syncing, the app intelligently merges local and remote bookmarks without creating duplicates
- **Manual Sync**: Click "Sync Now" to trigger an immediate sync
- **Secure Storage**: Your GitHub tokens are encrypted and stored securely

### Bookmark Data Format
Bookmarks are stored in a JSON file in your GitHub "git-bookmark" repository:
```json
{
  "bookmarks": [
    {
      "url": "https://github.com/owner/repo",
      "name": "Repository Name",
      "description": "Brief description",
      "category": "backend",
      "addedAt": "2024-02-27T10:30:00",
      "updatedAt": "2024-02-27T10:30:00"
    }
  ],
  "lastSynced": "2024-02-27T10:30:00",
  "syncStatus": "synced"
}
```

## GitHub API Rate Limiting

This application handles large repository collections efficiently:

- **Without GitHub Token:** 60 requests/hour (can scan ~100 repos before hitting limit)
- **With GitHub Token:** 5,000 requests/hour (can scan 4,000+ repos with proper rate limiting)

**Smart Rate Limiting Features:**
- Configurable request delays (default: 150ms per request)
- Batch processing in chunks (default: 50 repos per batch with 2s pause between chunks)
- Automatic retry on rate limit (HTTP 429) with Retry-After header parsing
- Real-time progress tracking with Redis backend
- Comprehensive logging with [HEALTH-CHECK-*] prefixed messages

**Setup GitHub Token:**
1. Visit https://github.com/settings/tokens/new
2. Select scope: `public_repo`
3. Copy the token
4. Add to `.env`: `GITHUB_TOKEN=github_pat_...`

See [docs/GITHUB_API_RATE_LIMITING.md](docs/GITHUB_API_RATE_LIMITING.md) for detailed configuration.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18+, TypeScript, Vite 6, Tailwind CSS, Zustand |
| Backend | Python 3.11, FastAPI 0.104, SQLAlchemy, Pydantic |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Container | Docker, Docker Compose |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Documentation

Detailed documentation is available in the `docs/` folder:

- [FEATURES.md](docs/FEATURES.md) - Current implemented features
- [FEATURES_ROADMAP.md](docs/FEATURES_ROADMAP.md) - Feature implementation status
- [FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md) - Planned features
- [GITHUB_API_RATE_LIMITING.md](docs/GITHUB_API_RATE_LIMITING.md) - Rate limiting architecture
- [RATE_LIMITING_QUICK_START.md](docs/RATE_LIMITING_QUICK_START.md) - Quick setup guide
- [HEALTH_CHECK_IMPLEMENTATION.md](docs/HEALTH_CHECK_IMPLEMENTATION.md) - Health check details
- [OPTIMIZATION_ROADMAP.md](docs/OPTIMIZATION_ROADMAP.md) - Performance optimization plan

## License

MIT License - see LICENSE file for details.

---

**Version:** 2.3.0  
**Last Updated:** February 27, 2026  
**Features:** Repository management, GitHub & Google OAuth, bookmarks sync, bulk health checks, GitHub API rate limiting, Docker deployment
