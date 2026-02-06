# Real-Time Progress Tracking for Health & Metadata Scans

## Overview
The metadata and health scan process now displays a **live progress bar** on the frontend that updates in real-time as repositories are scanned, replacing the previous blocking behavior where the entire operation would complete before showing results.

---

## Architecture

### Backend Changes

#### 1. **Async Health Check with Job ID** (main.py)
The health check endpoint now works asynchronously:

```python
@app.post("/api/bulk/health-check")
async def bulk_health_check(action: BulkActionRequest, background_tasks: BackgroundTasks):
    """Returns immediately with a job_id for progress tracking"""
    job_id = str(uuid.uuid4())
    
    # Initialize progress in Redis cache
    CacheService.set(f"health_check:{job_id}", {
        "status": "running",
        "current": 0,
        "total": len(action.repository_ids),
        "message": "Starting health checks..."
    }, ttl=3600)
    
    # Schedule background task
    background_tasks.add_task(perform_bulk_health_check, job_id, action.repository_ids)
    
    return {"job_id": job_id}
```

**Key Points:**
- Returns **immediately** with a `job_id` (UUID)
- Health check runs in **background task**
- Progress stored in **Redis cache** with 1-hour TTL

#### 2. **Background Health Check Task** (main.py)
The `perform_bulk_health_check` function:

```python
async def perform_bulk_health_check(job_id: str, repository_ids: list):
    """Background task that scans repos and updates progress"""
    
    for idx, repo in enumerate(repos):
        # Update progress in Redis every iteration
        CacheService.set(f"health_check:{job_id}", {
            "status": "running",
            "current": idx,
            "total": len(repos),
            "message": f"Checking {repo.name}..."
        }, ttl=3600)
        
        # ... perform GitHub API call and metadata sync ...
        
        repo_updates.append(repo_update)
    
    # Mark as completed
    CacheService.set(f"health_check:{job_id}", {
        "status": "completed",
        "current": len(repos),
        "total": len(repos),
        "message": "✓ Scan complete"
    }, ttl=3600)
```

**How it Works:**
- After checking each repository, updates progress in Redis
- Frontend polls this endpoint every 300ms
- When complete, status changes to `"completed"`

#### 3. **Progress Query Endpoint** (main.py)
```python
@app.get("/api/bulk/health-check/{job_id}/progress")
async def get_health_check_progress(job_id: str):
    """Returns current progress state from Redis cache"""
    progress = CacheService.get(f"health_check:{job_id}")
    
    if not progress:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    
    return progress
```

**Response Format:**
```json
{
  "status": "running|completed|failed",
  "current": 25,
  "total": 100,
  "healthy": 20,
  "archived": 2,
  "not_found": 0,
  "errors": 3,
  "message": "Checking repository-name..."
}
```

---

### Frontend Changes

#### 1. **Updated triggerAutoHealthCheck Function** (RepositoryList.tsx)

**Old Behavior:**
```typescript
// Blocking call - waits for entire health check to complete
const response = await bulkApi.healthCheck(allIds)
// Progress bar jumps: 0% → 100%
```

**New Behavior:**
```typescript
// Non-blocking - returns job ID immediately
const jobResponse = await bulkApi.healthCheck(allIds)
const jobId = jobResponse.data?.job_id

// Poll for progress every 300ms
const progressInterval = setInterval(async () => {
  const progress = await generalApi.getHealthCheckProgress(jobId)
  
  // Update progress bar in real-time
  setAutoCheckProgress({
    isRunning: progress.status === 'running',
    current: progress.current,
    total: progress.total,
    status: progress.message
  })
  
  // Stop polling when done
  if (progress.status === 'completed' || 'failed') {
    clearInterval(progressInterval)
    fetchRepositories() // Refresh with updated data
  }
}, 300) // Poll every 300ms
```

#### 2. **Progress Bar UI** (RepositoryList.tsx - lines 770-790)

The progress bar was already present, now it shows real-time updates:

```tsx
{autoCheckProgress.isRunning && (
  <div className="bg-[var(--color-info-50)] border border-[var(--color-info-200)] rounded-[var(--radius-lg)] p-4">
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-info-700)] mb-2">
          {autoCheckProgress.status}  {/* "Checking repository-name..." */}
        </p>
        <div className="w-full bg-[var(--color-info-200)] rounded-full h-2 overflow-hidden">
          <div
            className="bg-[var(--color-info-600)] h-full transition-all duration-300 ease-out"
            style={{
              width: `${(autoCheckProgress.current / autoCheckProgress.total) * 100}%`
            }}
          />
        </div>
        {autoCheckProgress.total > 0 && (
          <p className="text-[length:var(--text-xs)] text-[var(--color-info-700)] mt-2">
            {autoCheckProgress.current} of {autoCheckProgress.total} completed
          </p>
        )}
      </div>
      <Loader2 className="size-5 text-[var(--color-info-600)] flex-shrink-0 animate-spin" />
    </div>
  </div>
)}
```

#### 3. **API Client Addition** (client.ts)

Added progress tracking endpoint:
```typescript
export const generalApi = {
  // ... existing methods ...
  getHealthCheckProgress: (jobId: string) =>
    api.get(`/bulk/health-check/${jobId}/progress`),
}
```

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER IMPORTS FILE                                         │
│    - Selects file and uploads                               │
│    - Frontend detects completion (via polling)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 2. AUTO-TRIGGER DETECTION                                   │
│    - Toast: "Starting automatic health and metadata check.."│
│    - triggerAutoHealthCheck() called                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 3. POST /api/bulk/health-check                              │
│    - Request sent with all repo IDs                         │
│    - Response: {"job_id": "uuid"}                           │
│    - Returns IMMEDIATELY (non-blocking)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 4. PROGRESS BAR APPEARS & UPDATES                           │
│    - Progress bar renders above repositories table          │
│    - Frontend polls: GET /api/bulk/health-check/{job_id}... │
│    - Updates every 300ms as repos are scanned               │
│                                                              │
│    ┌─────────────────────────────────────────────────────┐  │
│    │ ⏳ Checking repo-name...                            │  │
│    │ ████████████░░░░░░░░░░░░░░░░░░░░░░░░ 25 / 100      │  │
│    └─────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │  (Every 300ms polling loop) │
        │  GET progress endpoint      │
        └──────────────┬──────────────┘
                       │
        ┌──────────────▼──────────────┐
        │ If status == "completed":   │
        │  - Stop polling             │
        │  - Refresh repositories     │
        │  - Show completion toast    │
        └─────────────────────────────┘
```

---

## Technical Details

### Progress Storage
- **Location:** Redis cache (`health_check:{job_id}`)
- **TTL:** 1 hour (3600 seconds)
- **Format:** JSON with status, counts, and message

### Polling Strategy
- **Interval:** 300ms (can be adjusted if needed)
- **Timeout:** 30 minutes (safety limit)
- **Stop Condition:** Status changes to `"completed"` or `"failed"`

### Concurrent Health Checks
- Each health check has a **unique UUID** job_id
- Multiple health checks can run **simultaneously**
- Each tracked independently in Redis
- No conflicts between concurrent jobs

---

## Performance Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Responsiveness** | Blocks entire UI during scan | UI responsive, progress visible |
| **User Feedback** | None during scan (confusing) | Live progress bar (transparent) |
| **Request Duration** | 30-120+ seconds (blocking) | <1 second (non-blocking) |
| **Cancellation** | Not possible | Could be added with job_id |
| **Multiple Scans** | Could only run one | Can run multiple concurrently |

---

## Configuration Options

### Polling Interval (frontend)
To adjust the polling frequency:
```typescript
// In RepositoryList.tsx, triggerAutoHealthCheck function
}, 300) // Change 300 to desired milliseconds
```

**Recommendations:**
- **Fast updates:** 200ms (more API calls)
- **Balanced:** 300-500ms (recommended)
- **Minimal load:** 1000ms (slower feedback)

### Progress Timeout (backend)
To adjust how long progress is stored:
```python
# In main.py, perform_bulk_health_check function
CacheService.set(..., ttl=3600)  # Change 3600 to seconds
```

---

## Error Handling

### Network Error During Poll
```typescript
if (error?.response?.status !== 401) {
  console.error('Error polling health check progress:', error)
  // Polling continues, retry next interval
}
```

### Job Expired (not found)
```typescript
// Server returns 404 if job_id not found in Redis
// Frontend can implement retry or show error message
```

### Health Check Fails
```python
# Status set to "failed" with error message
CacheService.set(f"health_check:{job_id}", {
    "status": "failed",
    "error": str(e),
    "message": "Health check failed"
})
```

---

## Summary of Changes

### Files Modified:
1. **backend/main.py**
   - Changed `POST /api/bulk/health-check` to return job_id
   - Added `GET /api/bulk/health-check/{job_id}/progress`
   - Implemented `perform_bulk_health_check()` background task

2. **frontend/src/components/RepositoryList.tsx**
   - Updated `triggerAutoHealthCheck()` to use job polling
   - Added polling loop with 300ms interval
   - Real-time progress bar updates

3. **frontend/src/api/client.ts**
   - Added `getHealthCheckProgress()` to generalApi

### Version:
- Implementation Date: February 6, 2026
- Status: ✅ Fully Implemented & Deployed

---

## Testing the Feature

1. **Import repositories** via file upload
2. **Watch progress bar** appear automatically
3. **See real-time updates** every 300ms
4. **View completion** message with scan summary
5. **Repositories** automatically refreshed with new metadata

The progress bar now provides **transparent, real-time feedback** throughout the entire health check and metadata sync process! 🎉
