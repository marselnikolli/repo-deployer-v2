# Implementation Gap Report — todos.md vs actual code

All 5 features from todos.md are partially or fully implemented. The README's "v2.1" checklist is optimistic — several gaps remain.

---

## Status per feature

### 1. Browser Extension — ✅ Done
`browser-extension/manifest.json`, `manifest.firefox.json`, `popup.html`, `popup.js` all exist.
`popup.js` POSTs to `/api/repositories/import-url` with duplicate detection (409).
Chrome manifest v3, Firefox manifest v2, manual URL fallback — all present.

---

### 2. Clone to ZIP + Background Sync — ⚠️ Partially done

**Done:**
- `backend/services/zip_queue.py` — async job queue (pending / in_progress / done / failed)
- `backend/services/git_service.py` — ZIP creation via `download_repo_as_zip()`
- `backend/services/clone_queue.py` — auto-enqueues ZIP after successful clone
- HTML bookmark import (`main.py`) enqueues ZIP in parallel with metadata sync
- `/api/zip/sync` endpoint triggers ZIP for all unarchived repos on demand
- All ZIP/clone paths now use `{REPOS_DIR}/{owner}/{repo_name}/` structure (fixed 2026-05-07)
- Clone folder structure fixed: was `{root}/{repo_name}/`, now `{root}/{owner}/{repo_name}/` (fixed 2026-05-07)

**Gap A — Sync trigger does not fire ZIP:**
The todos.md requires: *"If the sync feature is triggered, the ZIP process should also fire for any repos that don't yet have a local archive."*
`sync_repositories_metadata()` in `import_sync_service.py` does **not** call `zip_queue.enqueue()`. The parallel ZIP enqueue only happens in the HTML import flow.

Fix: at the start of `sync_repositories_metadata()`, iterate over the passed `repositories` list and call `zip_queue.enqueue(repo.id, repo.url, zip_path)` for any repo whose `zip_status` is `None` or `"failed"`.

**Gap B — `zip_status` missing from `RepositorySchema`:**
`backend/schemas.py` → `RepositorySchema` has no `zip_status` or `zip_path` fields.
List endpoints therefore never return ZIP status. `RepositoryDetails.tsx` works around this by polling `/api/repositories/{id}/zip/status` separately, but the initial render always starts from `null`.

Fix: add to `RepositorySchema`:
```python
zip_status: Optional[str] = None
zip_path: Optional[str] = None
```

**Gap C — ZIP status not shown in the main list view:**
`frontend/src/components/RepositoryList.tsx` has **zero** references to `zip_status`. The "per-repo ZIP status" requirement is only met in the `RepositoryDetails` side panel.
Once Gap B is fixed (field in schema), add a small status badge to each row in RepositoryList — similar to the `cloned` / `deployed` badges already present.

**Gap D — Existing DB rows have stale `zip_path` values:**
Repos imported before 2026-05-07 have `zip_path` pointing to the old flat `{REPOS_DIR}/{owner}_{repo}.zip` format. These rows will show ZIP status incorrectly until re-queued. A one-off migration or a "re-queue all" admin button would fix this.

---

### 3. Smart Categorization — ✅ Done
`backend/services/bookmark_parser.py` implements the full fallback chain:
1. GitHub API with token → `"api_token"`
2. Pre-fetched API metadata → `"api_metadata"`
3. Stealth HTML fetch (Chrome/124 UA, Accept-Language, gzip headers) → `"stealth_fetch"`
4. URL pattern heuristics → `"url_heuristics"`

`category_source` column in `models.py` stores the method used. ✓

---

### 4. Progress Bar — ✅ Fixed (2026-05-07)

**Root cause found and fixed:**
- `is_running` was computed as `current < total` in the `/api/import/sync-progress` endpoint, which kept it `true` even after sync stopped early (error-rate abort, user stop, or fatal error). Footer was permanently stuck.
- Fixed to `status == "scanning"` so `is_running` only reflects active scanning.
- Frontend visibility logic now covers the stopped-mid-way case (`current != total` when not running).
- Header title now correctly switches to "Sync Complete" when scan finishes.

---

### 5. Sync Footer Behavior — ✅ Done
`ImportProgressBar.tsx` shows "Scanning via Stealth Fetch" while running, "Sync Paused" when paused, and "Sync Complete" when finished (fixed 2026-05-07).
Pause / Resume / Stop controls present. Auto-hides after 3 seconds on completion.

---

### 6. README Display — ✅ Done (2026-05-07)
- Clicking a repo name in the list opens a `ReadmeModal` that renders the README as formatted markdown.
- Fetches directly from `raw.githubusercontent.com` (browser-side HTTP, no backend proxy).
- Tries `HEAD → main → master` branches in order.
- Backend `/api/repositories/{id}/readme` endpoint retained for disk-save use during sync.

---

### 7. README saved to disk during sync — ✅ Done (2026-05-07)
`import_sync_service.py` → `_download_readme_to_disk(owner, repo_name)` fetches `README.md` via direct HTTP and writes it to `{REPOS_DIR}/{owner}/{repo_name}/README.md` after each successful metadata sync.

---

## Known bugs (unfixed)

### Duplicate route in `main.py`
`/api/repositories/import-url` is defined **twice**:
- First definition: full implementation (ZIP enqueue + background metadata sync)
- Second definition: dead code — FastAPI matches the first registered handler only

The second handler also calls `asyncio.create_task()` inside a route handler, which is unsafe (task can be garbage-collected before it runs). **Remove the second handler entirely.**

---

## Action summary

| # | File | Task | Status |
|---|------|------|--------|
| 1 | `backend/services/import_sync_service.py` | Enqueue ZIP in sync loop for repos with `zip_status` None/failed | ❌ Open |
| 2 | `backend/schemas.py` | Add `zip_status` and `zip_path` to `RepositorySchema` | ❌ Open |
| 3 | `frontend/src/components/RepositoryList.tsx` | Show per-row ZIP status badge | ❌ Open |
| 4 | `backend/main.py` | Remove duplicate `import-url` route | ❌ Open |
| 5 | DB migration | Re-queue or update repos with stale `zip_path` from old flat format | ❌ Open |

---

---

# Claude — Suggestions

Ideas worth considering for this project, ordered by impact vs effort.

---

### S1. Serve README from disk when available (quick win)
The backend `/api/repositories/{id}/readme` endpoint always fetches from GitHub. If a README was already downloaded to `{REPOS_DIR}/{owner}/{repo_name}/README.md` by the sync process, serve it from disk first and fall back to GitHub only if the file is missing. This makes the modal instant for already-synced repos and works offline.

---

### S2. Private repo support via stored token
All stealth fetch and raw.githubusercontent.com requests currently assume public repos. If the user has a `GITHUB_TOKEN` set, pass it as a `Bearer` token on raw.githubusercontent.com requests — this unlocks private repo READMEs and removes rate limit concerns for the sync process. The token is already read in the codebase (`os.getenv("GITHUB_TOKEN")`), just not passed through to the raw HTTP calls.

---

### S3. ZIP path migration for existing repos
Repos imported before the folder structure was unified (2026-05-07) have `zip_path` pointing to the old `{REPOS_DIR}/{owner}_{repo}.zip` flat format. Add a one-time migration endpoint (`POST /api/admin/migrate-zip-paths`) that reads all repos, computes the new path, checks if the file exists at either location, moves it if needed, and updates the DB. Without this, old repos always show ZIP status as "none" even if the file exists.

---

### S4. Rate-limit-aware sync scheduling
The stealth fetch in `sync_repositories_metadata` fires requests as fast as `asyncio` allows between batch delays. GitHub silently throttles or serves stale HTML to aggressive scrapers. Consider tracking the per-run request rate and backing off when the error rate climbs above a threshold — similar to the existing 85% error-rate abort, but softer (pause for 60s, retry).

---

### S5. README caching in the frontend
The `ReadmeModal` currently fires a new fetch every time it opens, even for repos you've already viewed. Cache the content in a `Map<repoUrl, string>` held in module scope (or a small Zustand store) so re-opens are instant. Invalidate on page reload. This is a 15-line change with a noticeable UX improvement.

---

### S6. ZIP download progress in the UI
`ZipQueue` tracks `pending / in_progress / done / failed` but gives no byte-level progress. The ZIP files for large repos can be hundreds of MB and the user sees no feedback beyond the status badge. Consider streaming the download with `requests.get(..., stream=True)` and periodically writing progress to a shared dict that a `/api/repositories/{id}/zip/progress` endpoint can poll. The frontend already has the polling pattern from the clone progress.

---

### S7. True git clone option alongside ZIP
The current "clone" flow downloads a ZIP — it's fast and portable but produces a snapshot with no git history. For repos the user actively develops against, offer a true `git clone --depth 1` alongside the ZIP option. The `GitPython` library is already installed (`from git import Repo` in `git_service.py`). A `git_clone` function alongside the existing `clone_repo` would be a clean addition.

---

### S8. Webhook receiver for auto-sync
Add a `POST /api/webhooks/github` endpoint that accepts GitHub push/release events and auto-triggers a metadata sync + README refresh for the matching repo. This means the library stays current without a manual "Sync All" click. Requires the user to configure the webhook on each repo, but the backend work is small.

---

### S9. Remove the duplicate `import-url` route now
This is the highest-risk open item. FastAPI silently ignores the second handler but the dead code with `asyncio.create_task()` will cause subtle failures if it ever becomes reachable. It should be deleted before it causes a hard-to-reproduce bug in production.
