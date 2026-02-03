# Migration Guide: Streamlit → FastAPI + React

## Overview

This guide explains how to migrate from the Streamlit version (v1.0) to the professional FastAPI + React architecture (v2.0).

## Key Differences

### v1.0 (Streamlit)
- Single Python application
- Server-side UI rendering
- Session-based state management
- Limited scalability
- Simple Docker setup

### v2.0 (FastAPI + React)
- Separated backend API and frontend
- Client-side UI rendering
- RESTful API with async support
- Highly scalable
- Multi-container Docker setup
- Production-ready architecture

## Data Migration

### 1. Export from Streamlit v1

```bash
# The JSON database from Streamlit
cp repo-deployer/repo_db.json ./migration/repo_db_backup.json
```

### 2. Migrate to PostgreSQL

A migration script will be provided to:
- Read the old JSON database
- Transform it to PostgreSQL format
- Populate the new database

```bash
python migration/migrate_to_postgres.py
```

### 3. Verify Migration

```bash
# Check PostgreSQL
docker exec repo-deployer-db psql -U postgres -d repo_deployer -c \
  "SELECT COUNT(*) FROM repositories;"
```

## Code Structure Changes

### Backend Changes

**Before (Streamlit):**
```python
# github-repos-deployer.py - all-in-one
db = load_db()  # JSON file
repos = db.values()
# UI rendering mixed with logic
```

**After (FastAPI):**
```python
# backend/main.py - API endpoints
@app.get("/api/repositories")
async def list_repositories(db: Session = Depends(get_db)):
    return db.query(Repository).all()

# backend/crud/repository.py - Database operations
# backend/services/ - Business logic
```

### Frontend Changes

**Before (Streamlit):**
```python
st.title("GitHub Repo Deployer")
repos = st.session_state.repositories
```

**After (React):**
```typescript
// frontend/src/components/RepositoryList.tsx
export const RepositoryList: React.FC = () => {
  const { repositories } = useRepositoryStore()
  return <div>{repositories.map(r => <Card key={r.id} repo={r} />)}</div>
}
```

## Development Workflow

### Streamlit v1
```bash
streamlit run github-repos-deployer.py
# Single dev server at http://localhost:8501
```

### FastAPI + React v2
```bash
# Terminal 1 - Backend
cd backend && uvicorn main:app --reload
# http://localhost:8000

# Terminal 2 - Frontend
cd frontend && npm run dev
# http://localhost:3000
```

## Deployment Differences

### v1 - Streamlit
```bash
docker build -t repo-deployer .
docker run -p 8501:8501 repo-deployer
# Single container
```

### v2 - FastAPI + React
```bash
docker-compose up --build
# Multi-container:
# - api:8000
# - frontend:3000
# - db:5432
```

## API Usage

### Import Bookmarks

**v1 (Streamlit UI):**
```
- Click upload button
- Select HTML file
- Automatic processing
```

**v2 (REST API):**
```bash
curl -X POST http://localhost:8000/api/import/html \
  -F "file=@bookmarks.html"

# Response:
# {
#   "total_found": 4204,
#   "message": "Found 4204 GitHub repositories..."
# }
```

### List Repositories

**v1 (Streamlit):**
```python
# Session state with pagination
repos = st.session_state.repositories
```

**v2 (REST API):**
```bash
# With pagination
curl http://localhost:8000/api/repositories?skip=0&limit=20

# With filtering
curl http://localhost:8000/api/repositories?category=backend&skip=0&limit=20
```

### Bulk Operations

**v1 (Streamlit):**
```python
# UI-based selection
selected = st.multiselect("Select repos", repos)
if st.button("Delete Selected"):
    for repo in selected:
        delete_repo(repo)
```

**v2 (REST API):**
```bash
curl -X POST http://localhost:8000/api/bulk/delete \
  -H "Content-Type: application/json" \
  -d '{
    "repository_ids": [1, 2, 3, 4, 5]
  }'
```

## Feature Comparison

| Feature | v1 (Streamlit) | v2 (FastAPI+React) |
|---------|---|---|
| Import | ✅ | ✅ Async |
| Repository List | ✅ | ✅ Pagination |
| Categorization | ✅ | ✅ Same logic |
| Bulk Operations | ✅ | ✅ API-based |
| Git Operations | ✅ | ✅ Background tasks |
| Docker Deploy | ✅ | ✅ Better integration |
| **API** | ❌ | ✅ Full REST API |
| **Database** | JSON | ✅ PostgreSQL |
| **Scalability** | Limited | ✅ Horizontal scaling |
| **Performance** | Good | ✅ Much better |
| **Production Ready** | Partial | ✅ Yes |

## Troubleshooting Migration

### Database Connection Failed
```bash
# Ensure PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs db
```

### API Not Responding
```bash
# Check health
curl http://localhost:8000/api/health

# View API docs
open http://localhost:8000/docs
```

### Frontend Not Loading
```bash
# Check Vite dev server
docker-compose logs frontend

# Verify proxy settings in vite.config.ts
```

## Next Steps

1. **Backup v1 data** - Keep repo-deployer folder as backup
2. **Run migration** - Use provided migration script
3. **Test thoroughly** - Verify all repositories imported correctly
4. **Add authentication** - See authentication guide for v2.0+
5. **Set up monitoring** - Configure logging and alerts

## Support

- API Docs: http://localhost:8000/docs
- Database: PostgreSQL running on port 5432
- Frontend: React at port 3000

---

**Migration completed!** Your v2.0 deployment is now production-ready.
