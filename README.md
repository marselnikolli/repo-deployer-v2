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
- **Health Monitoring** - Check if repositories still exist on GitHub
- **Duplicate Detection** - Prevents importing the same repository twice

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

### Bulk Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bulk/update-category` | Update category for multiple repos |
| POST | `/api/bulk/delete` | Delete multiple repositories |

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
│   │   └── export_service.py   # CSV/JSON/Markdown export
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
├── docker-compose.yml
├── README.md
├── FEATURES_ROADMAP.md         # Implementation status
└── FUTURE_FEATURES.md          # Planned features
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

Create `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/repo_deployer
REDIS_URL=redis://localhost:6379
GITHUB_TOKEN=your_github_token_optional
MIRROR_DIR=/path/to/cloned/repos
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, Zustand |
| Backend | Python 3.11, FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Container | Docker, Docker Compose |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

---

**Version:** 2.1.0
**Last Updated:** February 2026
