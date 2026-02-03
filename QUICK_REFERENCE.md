# ⚡ Quick Reference - v2.0 API & Commands

## 🚀 Essential Commands

```bash
# Start everything
docker-compose up --build

# Stop everything
docker-compose down

# View logs
docker-compose logs -f [service]

# Access database
docker-compose exec db psql -U postgres -d repo_deployer

# Rebuild after code changes
docker-compose up --build

# Migrate from v1.0
python migration/migrate_to_postgres.py
```

## 🌐 Web Addresses

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:3000 | Web UI |
| API | http://localhost:8000 | REST API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| API ReDoc | http://localhost:8000/redoc | Alternative docs |
| Database | localhost:5432 | PostgreSQL |

## 📡 API Quick Reference

### Import Repositories
```bash
# Upload HTML bookmark file
curl -X POST http://localhost:8000/api/import/html \
  -F "file=@bookmarks.html"

# Scan folder
curl -X POST http://localhost:8000/api/import/folder \
  -d "folder_path=/path/to/bookmarks"
```

### List & Filter
```bash
# List all (paginated)
curl http://localhost:8000/api/repositories

# Paginate (skip=0, limit=20)
curl "http://localhost:8000/api/repositories?skip=0&limit=20"

# Filter by category
curl "http://localhost:8000/api/repositories?category=backend"

# Combine filters
curl "http://localhost:8000/api/repositories?category=devops&skip=20&limit=50"
```

### Single Repository
```bash
# Get details
curl http://localhost:8000/api/repositories/1

# Update
curl -X PUT http://localhost:8000/api/repositories/1 \
  -H "Content-Type: application/json" \
  -d '{"category": "backend"}'

# Delete
curl -X DELETE http://localhost:8000/api/repositories/1
```

### Git Operations
```bash
# Clone repository
curl -X POST http://localhost:8000/api/repositories/1/clone

# Sync/pull updates
curl -X POST http://localhost:8000/api/repositories/1/sync

# Get info
curl http://localhost:8000/api/repositories/1
```

### Docker Operations
```bash
# Deploy to Docker
curl -X POST http://localhost:8000/api/repositories/1/deploy
```

### Bulk Operations
```bash
# Update multiple categories
curl -X POST http://localhost:8000/api/bulk/update-category \
  -H "Content-Type: application/json" \
  -d '{
    "repository_ids": [1, 2, 3, 4, 5],
    "new_category": "backend"
  }'

# Delete multiple
curl -X POST http://localhost:8000/api/bulk/delete \
  -H "Content-Type: application/json" \
  -d '{"repository_ids": [1, 2, 3]}'
```

### Metadata
```bash
# Get categories
curl http://localhost:8000/api/categories

# Get statistics
curl http://localhost:8000/api/stats

# Health check
curl http://localhost:8000/api/health
```

## 🗂️ File Locations

### Configuration
```
backend/.env           - Backend environment variables
backend/.env.example   - Template (copy this)
docker-compose.yml     - Service orchestration
```

### Database
```
PostgreSQL data: stored in Docker volume "postgres_data"
Repositories: stored in Docker volume "mirrors"
```

### Code Entry Points
```
Backend:  backend/main.py
Frontend: frontend/src/main.tsx
Models:   backend/models.py
Schemas:  backend/schemas.py
CRUD:     backend/crud/repository.py
```

## 🎯 Categories

```
security          - Security, cryptography, auth
ci_cd             - CI/CD, Jenkins, GitHub Actions
database          - Databases, SQL, NoSQL
devops            - DevOps, Docker, Kubernetes
api               - APIs, REST, GraphQL
frontend          - Frontend, React, Vue, Angular
backend           - Backend, Python, Node, Java
ml_ai             - Machine Learning, AI
embedded          - Embedded, IoT, Arduino
documentation     - Docs, guides, tutorials
tools             - Tools, CLI, utilities
library           - Libraries, packages, frameworks
mobile            - Mobile, iOS, Android, React Native
other             - Uncategorized
```

## 🔧 Environment Variables

### Backend (.env)
```bash
DATABASE_URL=postgresql://postgres:postgres@db:5432/repo_deployer
MIRROR_DIR=/app/mirrors
LOG_LEVEL=INFO
```

### Frontend (docker-compose.yml)
```bash
REACT_APP_API_URL=http://api:8000
```

## 📊 Database Queries

### Direct PostgreSQL Access
```bash
docker-compose exec db psql -U postgres -d repo_deployer
```

### Useful SQL Queries
```sql
-- Count total repositories
SELECT COUNT(*) FROM repositories;

-- Count by category
SELECT category, COUNT(*) FROM repositories GROUP BY category;

-- Find cloned repositories
SELECT * FROM repositories WHERE cloned = true;

-- Recent repositories
SELECT * FROM repositories ORDER BY created_at DESC LIMIT 10;

-- Search by name
SELECT * FROM repositories WHERE name ILIKE '%docker%';
```

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Port 3000 in use | `lsof -i :3000 \| grep LISTEN \| awk '{print $2}' \| xargs kill -9` |
| Database won't start | `docker-compose restart db` |
| API not responding | `docker-compose logs api` |
| Frontend blank page | `docker-compose logs frontend` |
| Permission denied | `sudo docker-compose up` |
| Container won't build | `docker system prune -a` then rebuild |

## 📈 Performance Tips

```bash
# Monitor container resource usage
docker stats

# Check database query performance
EXPLAIN ANALYZE SELECT * FROM repositories;

# Optimize: add index on category
CREATE INDEX idx_category ON repositories(category);
```

## 🔑 Key Endpoints for Integration

```javascript
// JavaScript/TypeScript
const API_BASE = 'http://localhost:8000/api';

// Import
POST ${API_BASE}/import/html

// List
GET ${API_BASE}/repositories?skip=0&limit=20&category=backend

// Create/Update
PUT ${API_BASE}/repositories/{id}

// Bulk
POST ${API_BASE}/bulk/update-category
POST ${API_BASE}/bulk/delete

// Metadata
GET ${API_BASE}/stats
GET ${API_BASE}/categories
GET ${API_BASE}/health
```

## 🚢 Docker Commands

```bash
# View all services
docker-compose ps

# View service logs
docker-compose logs [service-name]

# Follow logs in real-time
docker-compose logs -f [service-name]

# Execute command in container
docker-compose exec [service] [command]

# Restart service
docker-compose restart [service]

# Scale service
docker-compose up -d --scale api=3

# Remove everything
docker-compose down -v
```

## 📋 Deployment Checklist

- [ ] Environment variables configured
- [ ] Database initialized
- [ ] All containers running (`docker-compose ps`)
- [ ] Health check passing (`/api/health`)
- [ ] Frontend loads without errors
- [ ] Can import bookmarks
- [ ] Bulk operations work
- [ ] API documentation accessible
- [ ] Logs are clean (no errors)

---

**Save this file as a bookmark or reference!**

For detailed documentation, see:
- `START_HERE.md` - Setup guide
- `README.md` - Full documentation
- `MIGRATION_GUIDE.md` - Upgrading from v1.0
- `COMPLETE_PACKAGE.md` - Comprehensive overview
