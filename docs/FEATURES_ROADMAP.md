# Features Roadmap - Repo Deployer v2

## Implementation Status

### Phase 1 - Quick Wins ✅ COMPLETE

| # | Feature | Status | Files Modified |
|---|---------|--------|----------------|
| 1 | Duplicate URL Detection | ✅ Complete | `main.py`, `client.ts` |
| 2 | Sortable Columns | ✅ Complete | `main.py`, `crud/repository.py`, `RepositoryList.tsx`, `client.ts` |
| 3 | Export Functionality | ✅ Complete | `services/export_service.py`, `main.py`, `client.ts`, `RepositoryList.tsx` |

### Phase 2 - Core Features ✅ COMPLETE

| # | Feature | Status | Files Modified |
|---|---------|--------|----------------|
| 4 | GitHub API Integration | ✅ Complete | `services/github_service.py`, `main.py`, `models.py`, `schemas.py` |
| 5 | Smart Auto-Categorization | ✅ Complete | `services/github_service.py` |
| 6 | Tags System | ✅ Complete | `models.py`, `schemas.py`, `crud/tags.py`, `main.py`, `client.ts` |

### Phase 3 - UX Polish ✅ COMPLETE

| # | Feature | Status | Files Modified |
|---|---------|--------|----------------|
| 7 | Repository Details Panel | ✅ Complete | `RepositoryDetails.tsx`, `RepositoryList.tsx` |
| 8 | Keyboard Shortcuts | ✅ Complete | `hooks/useKeyboardShortcuts.ts`, `RepositoryList.tsx` |
| 9 | Drag & Drop Import | ✅ Complete | Already existed in `ImportBookmarks.tsx` |

### Phase 4 - Performance & Advanced ✅ COMPLETE

| # | Feature | Status | Files Modified |
|---|---------|--------|----------------|
| 10 | Repository Health Monitor | ✅ Complete | `main.py`, `services/github_service.py`, `models.py` |
| 11 | Batch Clone Queue | ✅ Complete | `services/clone_queue.py`, `main.py` |

### Phase 5 - Future Enhancements (Not Started)

| # | Feature | Status | Priority |
|---|---------|--------|----------|
| 12 | PostgreSQL Full-Text Search | ⬜ Pending | Medium |
| 13 | Virtual Scrolling | ⬜ Pending | Low |
| 14 | Cursor-Based Pagination | ⬜ Pending | Low |
| 15 | Optimistic UI Updates | ⬜ Pending | Low |
| 16 | API Response Standardization | ⬜ Pending | Low |

---

## New API Endpoints

### Export
- `GET /api/export/csv` - Export to CSV
- `GET /api/export/json` - Export to JSON
- `GET /api/export/markdown` - Export to Markdown

### GitHub Metadata
- `GET /api/github/metadata?url=...` - Fetch repository metadata
- `POST /api/repositories/{id}/sync-metadata` - Sync metadata for existing repo

### Tags
- `GET /api/tags` - List all tags with counts
- `POST /api/tags` - Create new tag
- `DELETE /api/tags/{id}` - Delete tag
- `POST /api/repositories/{id}/tags` - Add tags to repo
- `DELETE /api/repositories/{id}/tags` - Remove tags from repo
- `POST /api/bulk/add-tags` - Bulk add tags
- `POST /api/bulk/remove-tags` - Bulk remove tags

### Health
- `POST /api/repositories/{id}/check-health` - Check if repo exists on GitHub

### Clone Queue
- `GET /api/clone-queue/status` - Queue status
- `GET /api/clone-queue/jobs` - List all jobs
- `POST /api/clone-queue/add` - Add repos to queue
- `POST /api/clone-queue/cancel/{id}` - Cancel pending job
- `POST /api/clone-queue/clear` - Clear completed jobs

### Repositories (Enhanced)
- `GET /api/repositories?sort_by=&sort_order=` - Sortable list
- `GET /api/repositories/check-duplicate?url=...` - Check for duplicates

---

## New Files Created

### Backend
- `backend/services/export_service.py` - CSV/JSON/Markdown export
- `backend/services/github_service.py` - GitHub API integration
- `backend/services/clone_queue.py` - Batch clone queue
- `backend/crud/tags.py` - Tag CRUD operations

### Frontend
- `frontend/src/components/RepositoryDetails.tsx` - Repository details modal
- `frontend/src/hooks/useKeyboardShortcuts.ts` - Keyboard shortcuts hook

---

## Database Schema Changes

### New Columns in `repositories` table
- `stars` (Integer) - GitHub stars count
- `forks` (Integer) - GitHub forks count
- `watchers` (Integer) - GitHub watchers count
- `language` (String) - Primary language
- `languages` (JSON) - Language breakdown
- `topics` (JSON) - GitHub topics
- `license` (String) - License identifier
- `archived` (Boolean) - Is repo archived
- `is_fork` (Boolean) - Is repo a fork
- `open_issues` (Integer) - Open issues count
- `default_branch` (String) - Default branch name
- `github_created_at` (DateTime) - Repo creation date on GitHub
- `github_updated_at` (DateTime) - Last update on GitHub
- `github_pushed_at` (DateTime) - Last push date
- `last_metadata_sync` (DateTime) - When metadata was last synced
- `health_status` (String) - Health status: healthy, archived, not_found, unknown
- `last_health_check` (DateTime) - When health was last checked

### New Tables
- `tags` - Tag definitions (id, name, color, created_at)
- `repository_tags` - Many-to-many association (repository_id, tag_id)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `j` | Next item |
| `k` | Previous item |
| `Enter/Space` | Toggle selection |
| `o` | Open details |
| `d` | Delete selected |
| `Esc` | Clear selection / Close modal |
| `Ctrl+A` | Select all |
| `Ctrl+E` | Export |
| `Ctrl+Shift+R` | Refresh |

---

## Feature Highlights

### GitHub API Integration
- Fetches rich metadata: stars, forks, watchers, language, topics, license
- Smart category suggestion based on topics, language, and description
- Health check to verify repositories still exist

### Tags System
- Flexible tagging with multiple tags per repository
- Color-coded tags for visual organization
- Bulk tag operations

### Repository Details Panel
- Full metadata display with GitHub stats
- Quick actions: sync metadata, clone, open on GitHub
- Health status indicators
- Double-click row to open

### Export Options
- CSV format for spreadsheets
- JSON format for data interchange
- Markdown format for documentation
- All support category filtering

### Clone Queue
- Batch clone multiple repositories
- Background processing with up to 3 concurrent clones
- Job status tracking
- Cancel pending jobs
