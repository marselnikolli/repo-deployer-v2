# Metadata & Health Scan After File Upload

## Overview
When repositories are imported via file upload (JSON, CSV, OPML) or API imports (GitHub, GitLab, Bitbucket), the system automatically triggers a metadata and health scan workflow to validate and enrich the imported repositories.

---

## Workflow Architecture

### 1. **File Upload & Import Process**

#### File Import Endpoints
- `POST /api/imports/file/json` - Import from JSON file
- `POST /api/imports/file/csv` - Import from CSV file  
- `POST /api/imports/file/opml` - Import from OPML file

#### Execution Flow
```
File Upload → Create Import Job → Parse & Import Repositories → Job Status: "completed"
```

**Key Steps:**
1. User uploads a file (JSON, CSV, or OPML)
2. `ImportService` creates an `ImportJob` record with status `"pending"`
3. Job status changes to `"running"`
4. File content is parsed and repositories are extracted
5. Each repository is checked for duplicates before insertion
6. `ImportJob` status updated to `"completed"` with counts:
   - `imported` - Successfully imported repos
   - `failed` - Failed imports
   - `total` - Total repos processed

---

### 2. **Automatic Health & Metadata Check Trigger**

#### Frontend Auto-Trigger Logic
**Location:** `frontend/src/components/RepositoryList.tsx` (lines 150-195)

**Mechanism:**
- Frontend polls import jobs every **2 seconds** (`setInterval(..., 2000)`)
- Detects when import job transitions from `"running"` → `"completed"`
- **Automatically triggers** `triggerAutoHealthCheck()` 
- User sees toast notification: *"Import completed! Starting automatic health and metadata check..."*

**Pseudo-code:**
```javascript
const wasImporting = previousJobs.some(j => j.status === 'running' || 'pending')
const nowRunning = jobs.some(j => j.status === 'running' || 'pending')
const justCompleted = wasImporting && !nowRunning

if (justCompleted && !autoCheckProgress.isRunning) {
  triggerAutoHealthCheck()  // Auto-trigger scan
}
```

---

### 3. **Metadata & Health Scan Process**

#### Manual Scan Endpoint
**Route:** `POST /api/imports/jobs/{job_id}/scan`

**Purpose:** 
Scan all repositories from an import job to:
1. Validate repository existence (detect 404 errors)
2. Remove dead repositories (404 errors)
3. Update repository metadata from GitHub API

#### Scan Implementation
**Service Method:** `ImportService.scan_and_cleanup_imported(job_id)`

**Algorithm:**
```python
For each repository from ImportJob:
  1. Extract GitHub owner & repo name from URL (via regex parsing)
  2. Make GitHub API call: GET https://api.github.com/repos/{owner}/{repo}
  3. Handle Response:
     - 404: Remove repository from database (dead link)
     - 200: Update metadata (see below)
     - Other: Log error, keep repository
  4. Track: scanned, removed, updated, errors counts
```

#### Metadata Fields Updated

When a repository exists (HTTP 200 response), the following fields are synchronized from GitHub API:

| Field | Source | Purpose |
|-------|--------|---------|
| `archived` | `archived` | Mark if repo is archived |
| `stars` | `stargazers_count` | Repository popularity |
| `forks` | `forks_count` | Number of forks |
| `watchers` | `watchers_count` | Watcher count |
| `language` | `language` | Primary programming language |
| `topics` | `topics[]` | Repository topics/tags |
| `license` | `license.name` | License name |
| `is_fork` | `fork` | Whether repo is a fork |
| `open_issues` | `open_issues_count` | Open issues count |
| `default_branch` | `default_branch` | Default branch (usually 'main' or 'master') |
| `github_created_at` | `created_at` | Repository creation timestamp |
| `github_updated_at` | `updated_at` | Last update timestamp |
| `github_pushed_at` | `pushed_at` | Last push timestamp |

#### Health Status Assignment

```python
if response.status_code == 404:
    health_status = "not_found" → Repository deleted from DB
elif data.archived == true:
    health_status = "archived"
elif response.status_code == 200:
    health_status = "healthy"
else:
    health_status = "unknown"
```

---

### 4. **Scan Response Format**

**Endpoint Response:** `POST /api/imports/jobs/{job_id}/scan`

```json
{
  "job_id": 1,
  "scanned": 50,
  "removed": 2,
  "updated": 48,
  "errors": 0,
  "message": "Scanned 50 repositories, removed 2 dead repos (404 errors), updated metadata for 48 repos"
}
```

**Response Fields:**
- `scanned` - Total repositories scanned from the job
- `removed` - Repositories deleted (404 errors / dead links)
- `updated` - Repositories with updated metadata
- `errors` - API errors encountered during scan
- `message` - Human-readable summary

---

## Complete Workflow Timeline

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER UPLOADS FILE                                         │
│    (JSON/CSV/OPML/GitHub/GitLab/Bitbucket)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 2. IMPORT PHASE                                              │
│    - Create ImportJob (status: pending)                      │
│    - Parse file/API response                                │
│    - Check for duplicates                                    │
│    - Insert repositories into DB                            │
│    - Update ImportJob (status: completed)                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 3. AUTO-TRIGGER DETECTION (Frontend)                        │
│    - Frontend polls import jobs (2s interval)               │
│    - Detects: running → completed transition                │
│    - Calls triggerAutoHealthCheck()                         │
│    - Shows user notification                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 4. HEALTH & METADATA SCAN PHASE                             │
│    - Call POST /api/imports/jobs/{job_id}/scan              │
│    - For each imported repository:                          │
│      a) Parse GitHub URL (regex extraction)                │
│      b) Call GitHub API: GET /repos/{owner}/{repo}          │
│      c) Check status code:                                  │
│         - 404: Delete repository                            │
│         - 200: Sync all metadata fields                     │
│         - Other: Log error, retain repo                     │
│      d) Set health_status (healthy/archived/not_found)      │
│    - Update last_health_check timestamp                     │
│    - Batch commit all changes                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 5. COMPLETION & REPORTING                                   │
│    - Return scan summary:                                   │
│      * scanned: count                                        │
│      * removed: dead repo count                              │
│      * updated: metadata synced count                        │
│      * errors: API error count                               │
│    - Frontend displays results to user                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Features

### ✅ Data Quality Assurance
- **Duplicate Detection:** Prevents importing same URL twice
- **Dead Link Removal:** Automatically removes 404 repositories
- **Metadata Enrichment:** Populates GitHub data (stars, forks, language, etc.)

### ✅ Automatic Processing
- **Auto-trigger:** No manual action needed after import
- **Background Scanning:** GitHub API calls happen asynchronously
- **Transparent Progress:** User notifications at each stage

### ✅ Error Handling
- **Graceful Degradation:** API errors logged but don't halt scan
- **Partial Success:** Continues scanning even if some repos fail
- **Detailed Reporting:** Returns scan statistics for debugging

### ✅ Performance Optimization
- **Batch Processing:** All metadata updates committed in single transaction
- **Configurable Polling:** Frontend checks import status every 2 seconds
- **URL Parsing:** Regex-based parsing for fast GitHub URL extraction

---

## Configuration & Extensibility

### Supported Import Sources
1. **File Uploads:**
   - JSON files (array or object with `repositories` key)
   - CSV files (must have `url` column)
   - OPML files (RSS feed lists with `xmlUrl` attributes)

2. **API Imports:**
   - GitHub Stars (requires token)
   - GitHub Organizations (requires token + org_name)
   - GitLab Groups (requires token + group_id)
   - Bitbucket Teams (requires username + password + team_slug)

### Health Check Task Scheduling
The system supports scheduled health checks via `ScheduledTask`:
- Task Type: `health_check`
- Can be configured with cron expressions or interval-based schedules
- Runs periodic validation for all repositories

---

## Error Cases & Recovery

| Scenario | Behavior | Recovery |
|----------|----------|----------|
| **Repository 404** | Deleted from DB | Links removed from system |
| **GitHub API Error (rate limit)** | Logged, count incremented | Scan continues, errors reported |
| **Malformed GitHub URL** | Skipped, not scanned | Repository retained unchanged |
| **Network Timeout** | Exception caught, logged | Continues with next repository |
| **File Parse Error** | Job marked as failed | User retries with corrected file |

---

## Database Models Involved

### ImportJob
```python
- id: int (PK)
- user_id: int (FK)
- source_id: int (FK, optional)
- source_type: str ('github_stars', 'github_org', 'json', 'csv', 'opml', etc.)
- status: str ('pending', 'running', 'completed', 'failed')
- total_repositories: int
- imported_repositories: int
- failed_repositories: int
- error_message: str (optional)
- created_at: datetime
- started_at: datetime (optional)
- completed_at: datetime (optional)
```

### Repository
```python
- id: int (PK)
- name: str
- url: str (unique)
- description: str (optional)
- category: str
- health_status: str ('healthy', 'archived', 'not_found', 'unknown')
- stars: int
- forks: int
- watchers: int
- language: str (optional)
- topics: list
- license: str (optional)
- is_fork: bool
- open_issues: int
- default_branch: str
- archived: bool
- github_created_at: datetime
- github_updated_at: datetime
- github_pushed_at: datetime
- last_health_check: datetime
- last_metadata_sync: datetime
```

### ImportedRepository
```python
- id: int (PK)
- repository_id: int (FK)
- job_id: int (FK)
- source_type: str
- source_url: str
- import_status: str ('success', 'skipped', 'failed')
```

---

## Summary

The metadata & health scan system provides a **fully automated, transparent workflow** that ensures imported repositories are validated and enriched with up-to-date GitHub metadata. The frontend's auto-trigger mechanism combined with the backend's comprehensive GitHub API integration creates a seamless user experience where imports are immediately processed and cleaned without manual intervention.
