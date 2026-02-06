# Optimization Roadmap

## Overview
Performance and efficiency improvements for repo-deployer-v2, organized by impact and complexity.

---

## Priority 1: High Impact, Easy Implementation

### 1.1 Database Indexes
**File:** `backend/models.py`
**Status:** ✅ Completed
**Impact:** 3-10x faster queries on filtered fields
**Work:** Add indexes to frequently queried and filtered columns

Columns needing indexes:
- `url` (already unique, ensure index)
- `category` (frequent filter)
- `health_status` (health check filters)
- `created_at` (sorting/time-based filters)
- `last_health_check` (scheduler filtering)

Example:
```python
url = Column(String(512), unique=True, index=True)
category = Column(String(50), default=CategoryEnum.OTHER, index=True)
health_status = Column(String(20), default="unknown", index=True)
created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
last_health_check = Column(DateTime, nullable=True, index=True)
```

---

### 1.2 Consolidate Migration Code
**File:** `backend/main.py` (lines 42-113)
**Status:** ✅ Completed
**Impact:** 70 lines reduced to 15 lines, better maintainability
**Work:** Create single migration runner function

Current: 5 separate migration blocks with repetitive try/except
Improvement: Single function called 5 times

---

### 1.3 Combine Search Filter Queries
**File:** `backend/services/search.py` (lines 110-121)
**Status:** ✅ Completed
**Impact:** Reduces 5+ queries to 1-2 queries
**Work:** Use single query with aggregation/case statements

Current queries:
- Languages (line 110)
- Categories (line 115)
- Min/max stars (lines 118-119)
- Health statuses (line 121)

Optimization: Single query with `func.array_agg()` or multiple aggregations

---

## Priority 2: High Impact, Medium Implementation

### 2.1 Cache GitHub API Results
**Files:** `backend/main.py`, `backend/services/scheduler.py`
**Status:** ✅ Completed
**Impact:** Reduces external API calls by 90%+, faster health checks
**Work:** Cache repository metadata in Redis for 24 hours

Implementation:
- Cache key: `repo:health:{repo_id}` with TTL 86400s
- Cache key: `repo:metadata:{repo_id}` with TTL 86400s
- Invalidate on manual health check trigger
- Use Redis `get()` before API call, set after successful response

---

### 2.2 Batch Update Repositories
**Files:** `backend/main.py`, `backend/services/scheduler.py`
**Status:** ✅ Completed
**Impact:** 10-50x faster bulk operations
**Work:** Replace individual commits with batch updates

Current: Loop with individual `db.add()` and `db.commit()`
Improvement: Use `bulk_update_mappings()` with single commit

Example:
```python
db.bulk_update_mappings(Repository, repo_updates)
db.commit()
```

---

### 2.3 Eager Load Related Objects
**File:** `backend/crud/repository.py`
**Status:** ❌ Not Started
**Impact:** Eliminates N+1 queries, 5-20x faster fetch
**Work:** Add `selectinload()` for tags and collections

Implementation:
```python
from sqlalchemy.orm import selectinload
query = db.query(Repository).options(selectinload(Repository.tags))
```

---

## Priority 3: Medium Impact, Medium Implementation

### 3.1 Fix Event Loop Management
**File:** `backend/services/github_service.py`
**Status:** ❌ Not Started
**Impact:** Prevents event loop conflicts in async context
**Work:** Replace `asyncio.get_event_loop()` with `asyncio.to_thread()`

Current issue: Creating new event loops causes issues in async FastAPI
Better approach: Use `asyncio.to_thread()` or make service fully async

---

### 3.2 Add Resource Limits to Containers
**File:** `docker-compose.yml`
**Status:** ✅ Completed
**Impact:** Prevents runaway containers from consuming all resources
**Work:** Add `deploy.resources.limits` to each service

Example:
```yaml
api:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        memory: 1G
```

---

### 3.3 Add Restart Policies
**File:** `docker-compose.yml`
**Status:** ✅ Completed
**Impact:** Automatic recovery from crashes
**Work:** Add `restart: unless-stopped` to each service

---

### 3.4 Fix Requirements.txt Versions
**File:** `backend/requirements.txt`
**Status:** ❌ Not Started
**Impact:** Better compatibility and security
**Work:** Update `passlib==1.7.4` to `passlib>=1.7.4`

Also review and pin major versions more explicitly.

---

## Priority 4: Medium Impact, High Implementation

### 4.1 Optimize Database Connection Pool
**File:** `backend/database.py`
**Status:** ✅ Completed
**Impact:** Better concurrency, prevents connection pool exhaustion
**Work:** Add proper connection pool configuration

Current:
```python
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)
```

Improvements:
- Add `pool_recycle=3600` to recycle stale connections
- Add `connect_args={"timeout": 10}` for timeout handling
- Add `echo_pool=True` in dev mode for debugging

---

### 4.2 Consolidate Error Handling in Migrations
**File:** `backend/main.py`
**Status:** ❌ Not Started
**Impact:** Better error visibility, easier debugging
**Work:** Replace silent `pass` with proper logging

Current: Catches all exceptions silently
Better: Log actual errors without breaking startup

---

## Priority 5: Low-Medium Impact, Easy Implementation

### 5.1 Add Response Compression
**File:** `backend/main.py`
**Status:** ✅ Completed
**Impact:** Reduces response size by 60-80% for JSON
**Work:** Add GZIPMiddleware

Implementation:
```python
from fastapi.middleware.gzip import GZIPMiddleware
app.add_middleware(GZIPMiddleware, minimum_size=1000)
```

---

### 5.2 Optimize Docker Frontend Caching
**File:** `frontend/Dockerfile`
**Status:** ✅ Completed
**Impact:** Faster Docker builds (only rebuild when dependencies change)
**Work:** Reorder Dockerfile to cache npm install layer

Better order:
1. Copy only package.json and package-lock.json
2. Run npm install
3. Copy rest of code
4. Build

---

### 5.3 Optimize API Server Mode
**File:** `docker-compose.yml`
**Status:** ❌ Not Started
**Impact:** Better production performance
**Work:** Replace `--reload` with `--workers 4` in production

Current: `--reload` (development only)
Production: `--workers 4` (for parallel processing)

---

### 5.4 Add Aggregate Query Helper
**File:** `backend/crud/repository.py`
**Status:** ❌ Not Started
**Impact:** Reusable code for stats queries
**Work:** Create helper function for common aggregate operations

---

## Implementation Checklist

- [x] 1.1 Add database indexes
- [x] 1.2 Consolidate migration code
- [x] 1.3 Combine search filter queries
- [x] 2.1 Cache GitHub API results
- [x] 2.2 Batch update repositories
- [ ] 2.3 Eager load related objects
- [ ] 3.1 Fix event loop management
- [x] 3.2 Add resource limits
- [x] 3.3 Add restart policies
- [ ] 3.4 Fix requirements.txt versions
- [x] 4.1 Optimize connection pool
- [ ] 4.2 Consolidate error handling
- [x] 5.1 Add response compression
- [x] 5.2 Optimize Dockerfile caching
- [ ] 5.3 Optimize API server mode
- [ ] 5.4 Add aggregate query helper

---

## Testing Strategy

After each optimization:
1. Run health checks: `curl http://localhost:8000/api/health`
2. Check error logs: Docker container logs
3. Basic functionality: Test main operations
4. Load testing: Use simple load test if applicable

---

## Notes

- All optimizations are backward compatible
- No feature changes, only performance improvements
- Database migrations applied automatically
- Should see noticeable improvements after Priority 1 & 2
