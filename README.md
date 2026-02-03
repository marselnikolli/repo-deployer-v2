# GitHub Repo Deployer v2.0 - FastAPI + React + PostgreSQL

Professional-grade repository management and deployment tool with modern full-stack architecture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│         React Frontend (http://localhost:3000)      │
│  - Modern UI with TypeScript                         │
│  - Real-time updates with React Query               │
│  - Zustand state management                         │
└────────────────┬────────────────────────────────────┘
                 │ HTTP/REST
┌────────────────▼────────────────────────────────────┐
│      FastAPI Backend (http://localhost:8000)       │
│  - RESTful API with OpenAPI docs                    │
│  - Async/await for high performance                │
│  - Background job processing                       │
│  - Docker integration                              │
└────────────────┬────────────────────────────────────┘
                 │ SQL
┌────────────────▼────────────────────────────────────┐
│   PostgreSQL Database (localhost:5432)             │
│  - Persistent repository metadata                  │
│  - ACID transactions                               │
│  - Full-text search capable                        │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Git

### Installation

1. **Clone the repository**
```bash
cd repo-deployer-v2
```

2. **Configure environment**
```bash
cp backend/.env.example backend/.env
# Edit backend/.env if needed
```

3. **Start services**
```bash
docker-compose up --build
```

4. **Access the application**
- Frontend: http://localhost:3000
- API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432

## API Endpoints

### Import Operations
- `POST /api/import/html` - Import from HTML bookmark file
- `POST /api/import/folder` - Import from bookmark folder

### Repository Management
- `GET /api/repositories` - List repositories
- `GET /api/repositories/{id}` - Get repository details
- `PUT /api/repositories/{id}` - Update repository
- `DELETE /api/repositories/{id}` - Delete repository

### Git Operations
- `POST /api/repositories/{id}/clone` - Clone repository
- `POST /api/repositories/{id}/sync` - Sync/pull updates
- `POST /api/repositories/{id}/deploy` - Deploy to Docker

### Bulk Operations
- `POST /api/bulk/update-category` - Update category for multiple repos
- `POST /api/bulk/delete` - Delete multiple repositories

### Metadata
- `GET /api/categories` - List categories with counts
- `GET /api/stats` - Application statistics
- `GET /api/health` - Health check

## Project Structure

```
repo-deployer-v2/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── database.py          # Database configuration
│   ├── models.py            # SQLAlchemy models
│   ├── schemas.py           # Pydantic schemas
│   ├── crud/
│   │   └── repository.py    # CRUD operations
│   ├── services/
│   │   ├── bookmark_parser.py   # HTML parsing
│   │   ├── git_service.py       # Git operations
│   │   └── docker_service.py    # Docker operations
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts    # API client
│   │   ├── store/
│   │   │   └── useRepositoryStore.ts
│   │   ├── components/      # React components
│   │   └── pages/           # Page components
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## Database Schema

### repositories table
```sql
CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  url VARCHAR(512) UNIQUE NOT NULL,
  title VARCHAR(512),
  description TEXT,
  category VARCHAR(50),
  path VARCHAR(512),
  cloned BOOLEAN DEFAULT FALSE,
  deployed BOOLEAN DEFAULT FALSE,
  last_synced TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Features

✅ **Import Management**
- Upload HTML bookmark files
- Scan folder for bookmark files
- Automatic GitHub URL extraction
- Intelligent categorization

✅ **Repository Management**
- List and search repositories
- View detailed repository info
- Categorize repositories
- Bulk operations

✅ **Git Operations**
- Clone repositories
- Pull/sync updates
- Repository information tracking
- Background processing

✅ **Docker Integration**
- Build Docker images
- Manage containers
- Automatic deployment

✅ **API Features**
- RESTful endpoints
- OpenAPI/Swagger documentation
- CORS support
- Error handling

## Development

### Backend Development
```bash
cd backend
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Database Migrations
```bash
# Uses SQLAlchemy auto-migration via models.py
# On app start, all tables are created automatically
```

## Deployment

### Production Build
```bash
docker-compose -f docker-compose.yml build
docker-compose -f docker-compose.yml up -d
```

### Environment Variables

**Backend (.env)**
```
DATABASE_URL=postgresql://user:password@host:5432/db_name
MIRROR_DIR=/path/to/mirrors
LOG_LEVEL=INFO
```

## Performance Considerations

- PostgreSQL with indexing on frequently queried fields
- Connection pooling (10 connections, max 20 overflow)
- Async API endpoints for non-blocking operations
- Background tasks for long-running operations
- React Query for client-side caching

## Security

- CORS configuration per environment
- SQL injection prevention (SQLAlchemy ORM)
- Input validation (Pydantic schemas)
- Docker isolation
- Environment variable management

## Monitoring & Logging

- Health check endpoints
- Application statistics
- Error logging
- Container logs via Docker

## Next Steps for Production

1. Add authentication (OAuth2, JWT)
2. Set up SSL/TLS
3. Configure database backups
4. Add comprehensive logging
5. Set up monitoring (Prometheus, Grafana)
6. Add automated tests
7. Set up CI/CD pipeline

---

**Version:** 2.0.0  
**Last Updated:** February 3, 2026
