"""
FastAPI Backend for GitHub Repo Deployer
RESTful API for managing GitHub repository imports and deployments
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, Query, BackgroundTasks, Header, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
from sqlalchemy import text
import os
import logging
from typing import List, Optional
from pydantic import BaseModel
from datetime import timedelta

from database import engine, SessionLocal, init_db
from models import Repository, Category, Base
from schemas import RepositorySchema, RepositoryCreate, RepositoryUpdate, BulkActionRequest, ImportResponse
from services.bookmark_parser import parse_bookmarks, parse_html_bookmarks, filter_github_urls, categorize_url, smart_categorize, normalize_github_url
from services.git_service import clone_repo, sync_repo, get_repo_info
from services.clone_queue import clone_queue, CloneStatus
from services.zip_queue import zip_queue
from crud import repository as repo_crud
from routes import auth, docker, deployment, analytics, notifications, search, import_routes, collection_routes, github_bookmarks


# ─── WebSocket connection manager ─────────────────────────────────────────────

class WSConnectionManager:
    """Tracks open WebSocket connections and broadcasts events to all of them."""

    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.add(ws)

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)

    async def broadcast(self, event_type: str, data: dict | None = None):
        if not self._connections:
            return
        import json
        payload = json.dumps({"type": event_type, **(data or {})})
        dead: set[WebSocket] = set()
        for ws in list(self._connections):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        self._connections -= dead


ws_manager = WSConnectionManager()

# Synchronous wrapper so threaded queue workers can broadcast
def ws_broadcast_sync(event_type: str, data: dict | None = None):
    """Call from a non-async thread to push a WebSocket broadcast."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                ws_manager.broadcast(event_type, data), loop
            )
    except Exception:
        pass  # Best-effort; never break the caller


def _repo_zip_path(repos_dir: str, repo_name: str) -> str:
    """Return path inside the dedicated github-zip-files store.

    Uses GITHUB_ZIP_DIR env var (default /app/github-zip-files).
    repos_dir is accepted for backwards-compat but ignored.
    Files are stored flat as  {zip_dir}/{owner}__{name}.zip.
    """
    zip_dir = os.getenv("GITHUB_ZIP_DIR", "/app/github-zip-files")
    parts = repo_name.split('/', 1)
    owner = parts[0] if len(parts) == 2 else "unknown"
    name  = parts[1] if len(parts) == 2 else parts[0]
    os.makedirs(zip_dir, exist_ok=True)
    return os.path.join(zip_dir, f"{owner}__{name}.zip")


# Simple Pydantic models for request bodies
class RepoPageMetadata(BaseModel):
    description: Optional[str] = None
    stars: Optional[int] = None
    forks: Optional[int] = None
    language: Optional[str] = None
    topics: Optional[List[str]] = None
    license: Optional[str] = None
    is_fork: Optional[bool] = None

class ImportUrlRequest(BaseModel):
    url: str
    metadata: Optional[RepoPageMetadata] = None
    tags: Optional[List[str]] = None

class BookmarkBackupPayload(BaseModel):
    exported_at: str
    source: str
    total: int
    bookmarks: list

class BulkImportEntry(BaseModel):
    url: str
    tags: Optional[List[str]] = None

class BulkImportUrlsRequest(BaseModel):
    urls: Optional[List[str]] = None
    entries: Optional[List[BulkImportEntry]] = None
    metadata: Optional[RepoPageMetadata] = None

logger = logging.getLogger(__name__)


def run_migration(db: Session, migration_number: int, migration_name: str):
    """
    Run a single migration file and handle errors gracefully.
    
    Args:
        db: Database session
        migration_number: Migration file number (e.g., 1 for 001_add_users_table.sql)
        migration_name: Human-readable name for logging
    """
    try:
        migration_file = f'migrations/{migration_number:03d}_{migration_name}.sql'
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
            # Split by semicolon; strip comment lines before deciding to execute
            for statement in migration_sql.split(';'):
                # Remove comment-only lines so a leading comment doesn't suppress the statement
                sql_lines = [l for l in statement.splitlines() if not l.strip().startswith('--')]
                statement = '\n'.join(sql_lines).strip()
                if statement:
                    try:
                        db.execute(text(statement))
                    except Exception as stmt_err:
                        # Skip if table already exists or other idempotent errors
                        logger.debug(f"Migration {migration_name} statement skipped: {stmt_err}")
            db.commit()
        logger.info(f"Migration {migration_number} ({migration_name}) completed successfully")
    except FileNotFoundError:
        logger.warning(f"Migration file {migration_number} not found: {migration_name}")
    except Exception as e:
        db.rollback()
        logger.warning(f"Migration {migration_number} ({migration_name}) already applied or skipped: {e}")


# Lifecycle management
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    # Create all tables (including users table from updated models)
    Base.metadata.create_all(bind=engine)
    
    # Run migrations
    db = SessionLocal()
    try:
        run_migration(db, 1, "add_users_table")
        run_migration(db, 2, "add_scheduled_tasks_table")
        run_migration(db, 3, "add_notifications_table")
        run_migration(db, 4, "add_teams_tables")
        run_migration(db, 5, "add_import_sources_table")
        run_migration(db, 6, "add_deployments_table")
        run_migration(db, 7, "add_email_fields")
        run_migration(db, 8, "add_github_bookmark_sync")
        run_migration(db, 9, "remove_repository_name_unique_constraint")
        run_migration(db, 10, "add_category_source_and_zip_status")
        run_migration(db, 11, "add_search_history_and_saved_searches")
    finally:
        db.close()
    
    
    # Start clone queue worker
    clone_queue.db_session_factory = SessionLocal
    clone_queue.set_zip_queue(zip_queue)
    clone_queue.on_job_update = lambda job: ws_broadcast_sync(
        "clone_job_update", {"job_id": job.id, "status": job.status.value, "repo_id": job.repository_id}
    )
    clone_queue.start()

    # Start ZIP archive queue worker
    zip_queue.set_db_factory(SessionLocal)
    zip_queue.on_job_update = lambda repo_id, status: asyncio.ensure_future(
        ws_manager.broadcast("zip_job_update", {"repo_id": repo_id, "status": status})
    )
    zip_queue.start()
    
    yield
    
    # Shutdown
    clone_queue.stop()
    zip_queue.stop()

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="GitHub Repo Deployer API",
    description="Professional API for managing and deploying GitHub repositories",
    version="2.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url="/api/redoc",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8001",
    ],
    allow_origin_regex=r"chrome-extension://.*|moz-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Gzip Compression Middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Register route blueprints
app.include_router(auth.router)
app.include_router(docker.router)
app.include_router(deployment.router)
app.include_router(analytics.router)
app.include_router(notifications.router)
app.include_router(search.router)
app.include_router(import_routes.router)
app.include_router(collection_routes.router)
app.include_router(github_bookmarks.router)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============ IMPORT ENDPOINTS ============

@app.post("/api/repositories/bulk-import-urls")
@limiter.limit("10/minute")
async def bulk_import_urls(
    request: Request,
    payload: BulkImportUrlsRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Import a list of GitHub repository URLs in a single database operation.
    Used by the browser extension bookmark importer.
    Returns counts for imported / skipped (duplicate) / failed (invalid URL).
    """
    imported, skipped, failed = 0, 0, 0

    # Coerce flat urls list into entries format for uniform handling
    raw_entries = payload.entries or []
    if not raw_entries and payload.urls:
        raw_entries = [BulkImportEntry(url=u) for u in payload.urls]

    # Normalise and deduplicate within the incoming batch
    seen: set = set()
    valid_entries: list = []  # list of (normalised_url, tags)
    for entry in raw_entries:
        norm = normalize_github_url(entry.url)
        if norm and norm not in seen:
            seen.add(norm)
            valid_entries.append((norm, entry.tags or []))
        elif not norm:
            failed += 1

    valid_urls = [url for url, _ in valid_entries]
    tags_by_url = {url: tags for url, tags in valid_entries}

    if not valid_urls:
        total = len(payload.urls or []) + len(payload.entries or [])
        return {"imported": imported, "skipped": skipped, "failed": failed, "total": total}

    # One query to find which URLs already exist
    existing_urls: set = set(
        row[0] for row in db.query(Repository.url).filter(Repository.url.in_(valid_urls)).all()
    )

    repos_to_add = []
    for url in valid_urls:
        if url in existing_urls:
            skipped += 1
            continue
        url_parts = url.rstrip("/").split("/")
        repo_name = url_parts[-1]
        owner = url_parts[-2] if len(url_parts) >= 2 else "unknown"
        full_name = f"{owner}/{repo_name}"
        repos_to_add.append(Repository(
            name=full_name,
            url=url,
            title=full_name,
            category="other",
        ))

    if repos_to_add:
        try:
            db.add_all(repos_to_add)
            db.commit()
            for repo in repos_to_add:
                db.refresh(repo)
            imported = len(repos_to_add)
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Bulk insert failed: {e}")

        # Apply per-URL tags
        has_tags = any(tags_by_url.get(r.url) for r in repos_to_add)
        if has_tags:
            from models import Tag
            for repo in repos_to_add:
                for tag_name in tags_by_url.get(repo.url, []):
                    tag = db.query(Tag).filter(Tag.name == tag_name).first()
                    if not tag:
                        tag = Tag(name=tag_name)
                        db.add(tag)
                        db.flush()
                    if tag not in repo.tags:
                        repo.tags.append(tag)
            db.commit()

        # Enqueue ZIP archives in background
        repos_dir = os.getenv("REPOS_DIR", "/app/repos")
        for repo in repos_to_add:
            zip_path = _repo_zip_path(repos_dir, repo.name)
            zip_queue.enqueue(repo.id, repo.url, zip_path)

    total = len(payload.urls or []) + len(payload.entries or [])
    return {"imported": imported, "skipped": skipped, "failed": failed, "total": total}


@app.post("/api/import/html/analyze", response_model=ImportResponse)
async def analyze_html_bookmarks(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Analyze HTML or JSON bookmark file and return preview (no import, no sync)"""
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Auto-detect and parse bookmarks (HTML or JSON)
        bookmarks = parse_bookmarks(contents.decode('utf-8'))
        github_urls = filter_github_urls(bookmarks)
        
        if not github_urls:
            raise HTTPException(status_code=400, detail="No GitHub URLs found in file")
        
        # Check for duplicates in the import file and database
        seen_urls = set()
        unique_bookmarks = []
        duplicates_in_file = 0
        
        for bookmark in github_urls:
            if bookmark['url'] in seen_urls:
                duplicates_in_file += 1
            else:
                seen_urls.add(bookmark['url'])
                unique_bookmarks.append(bookmark)
        
        # Check for duplicates in database
        duplicates_in_db = 0
        for bookmark in unique_bookmarks:
            existing = repo_crud.get_repo_by_url(db, bookmark['url'])
            if existing:
                duplicates_in_db += 1
        
        newly_coming = len(unique_bookmarks) - duplicates_in_db
        
        return ImportResponse(
            total_found=len(github_urls),
            duplicates_in_file=duplicates_in_file,
            duplicates_in_db=duplicates_in_db,
            newly_imported=newly_coming,
            message=f"Preview: {newly_coming} new repositories to import, {duplicates_in_db} already in database, {duplicates_in_file} duplicates in file."
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/import/html", response_model=ImportResponse)
async def import_from_html(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Import repositories from HTML or JSON bookmark file and trigger sync"""
    try:
        # Read uploaded file
        contents = await file.read()
        
        # Auto-detect and parse bookmarks (HTML or JSON)
        bookmarks = parse_bookmarks(contents.decode('utf-8'))
        github_urls = filter_github_urls(bookmarks)
        
        if not github_urls:
            raise HTTPException(status_code=400, detail="No GitHub URLs found in file")
        
        # Check for duplicates in the import file and database
        seen_urls = set()
        unique_bookmarks = []
        duplicates_in_file = 0
        
        for bookmark in github_urls:
            if bookmark['url'] in seen_urls:
                duplicates_in_file += 1
            else:
                seen_urls.add(bookmark['url'])
                unique_bookmarks.append(bookmark)
        
        # Check for duplicates in database
        duplicates_in_db = 0
        to_import = []
        imported_repos = []
        
        for bookmark in unique_bookmarks:
            existing = repo_crud.get_repo_by_url(db, bookmark['url'])
            if existing:
                duplicates_in_db += 1
            else:
                to_import.append(bookmark)
        
        # Save all repositories (synchronously for better feedback)
        newly_imported = 0
        for bookmark in to_import:
            # Extract owner and repo name from URL
            # e.g., https://github.com/owner/repo-name -> owner/repo-name
            url_parts = bookmark['url'].rstrip('/').split('/')
            repo_name = url_parts[-1]
            owner = url_parts[-2] if len(url_parts) >= 2 else "unknown"
            
            # Create a full name with owner for uniqueness when displaying
            full_name = f"{owner}/{repo_name}"
            
            # Use basic heuristics at import time; smart categorization runs during sync
            category = categorize_url(bookmark['url'], bookmark['title'])
            repo_data = RepositoryCreate(
                name=full_name,  # Now includes owner/repo format
                url=bookmark['url'],
                title=bookmark['title'],
                category=category
            )
            try:
                created_repo = repo_crud.create_repository(db, repo_data)
                newly_imported += 1
                imported_repos.append(created_repo)
            except Exception as e:
                # Rollback the failed transaction so we can continue
                db.rollback()
                logger.error(f"Failed to create repository {full_name}: {str(e)}")
        
        # Enqueue ZIP archives in background
        if imported_repos:
            repos_dir = os.getenv("REPOS_DIR", "/app/repos")

            for repo in imported_repos:
                zip_path = _repo_zip_path(repos_dir, repo.name)
                zip_queue.enqueue(repo.id, repo.url, zip_path)
        
        return ImportResponse(
            total_found=len(github_urls),
            duplicates_in_file=duplicates_in_file,
            duplicates_in_db=duplicates_in_db,
            newly_imported=newly_imported,
            message=f"Import complete: {newly_imported} repositories imported, {duplicates_in_db} already in database, {duplicates_in_file} duplicates in file."
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/config/status")
async def get_config_status():
    """Return which optional integrations are configured"""
    github_token = os.getenv("GITHUB_TOKEN", "").strip()
    return {
        "github_api_key_configured": bool(github_token),
    }


# ─── ZIP archive endpoints ─────────────────────────────────────────────────────

@app.post("/api/repositories/{repo_id}/zip")
async def enqueue_zip(
    repo_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user=Depends(lambda: None),  # public — actual auth handled per-route if needed
):
    """Enqueue a ZIP archive job for a single repository."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    repos_dir = os.getenv("REPOS_DIR", "/app/repos")
    zip_path = _repo_zip_path(repos_dir, repo.name)

    enqueued = zip_queue.enqueue(repo_id, repo.url, zip_path)
    status = zip_queue.get_status(repo_id) or {}
    return {"enqueued": enqueued, **status}


@app.get("/api/repositories/{repo_id}/zip/download")
async def download_zip(repo_id: int, db: Session = Depends(get_db)):
    """Stream the ZIP archive for a repository as a file download.
    If the file is missing despite the DB saying 'done', resets status so the UI self-corrects.
    """
    from fastapi.responses import FileResponse

    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    zip_path = repo.zip_path or _repo_zip_path(os.getenv("REPOS_DIR", "/app/repos"), repo.name)

    if not os.path.isfile(zip_path):
        # File is gone — reset DB so the badge flips back to "Get ZIP"
        repo.zip_status = None
        repo.zip_path = None
        db.commit()
        raise HTTPException(status_code=404, detail="ZIP file not found on server — it may have been deleted. Click 'Get ZIP' to recreate it.")

    parts = repo.name.split("/", 1)
    filename = f"{parts[-1]}.zip"
    return FileResponse(zip_path, media_type="application/zip", filename=filename)


@app.get("/api/repositories/{repo_id}/zip/status")
async def get_zip_status(repo_id: int, db: Session = Depends(get_db)):
    """Get ZIP status, verifying actual disk state so the UI always reflects reality."""
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Live queue status takes priority
    queue_status = zip_queue.get_status(repo_id)
    if queue_status and queue_status.get("status") in ("pending", "in_progress"):
        return queue_status

    # DB says done — verify the file actually exists
    if repo.zip_status == "done":
        zip_path = repo.zip_path or _repo_zip_path(os.getenv("REPOS_DIR", "/app/repos"), repo.name)
        if not os.path.isfile(zip_path):
            repo.zip_status = None
            repo.zip_path = None
            db.commit()

    return {"repo_id": repo_id, "status": repo.zip_status or "none", "zip_path": repo.zip_path}


@app.get("/api/zip/statuses")
async def get_all_zip_statuses():
    """Return ZIP statuses for all repos currently tracked by the queue."""
    return zip_queue.get_all_statuses()


@app.post("/api/zip/sync")
async def trigger_zip_sync(background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Enqueue ZIP jobs for every repository that does not yet have a local archive.
    Runs in the background — returns immediately.
    """
    repos_dir = os.getenv("REPOS_DIR", "/app/repos")
    repos_without_zip = (
        db.query(Repository)
        .filter(
            (Repository.zip_status == None) | (Repository.zip_status == "failed")  # noqa: E711
        )
        .all()
    )

    enqueued_count = 0
    for repo in repos_without_zip:
        zip_path = _repo_zip_path(repos_dir, repo.name)
        if zip_queue.enqueue(repo.id, repo.url, zip_path):
            enqueued_count += 1

    return {"enqueued": enqueued_count, "total_without_zip": len(repos_without_zip)}


@app.post("/api/admin/migrate-zip-paths")
async def migrate_zip_paths(db: Session = Depends(get_db)):
    """
    One-time migration: fix repos whose zip_path points to the old flat
    '{REPOS_DIR}/{owner}_{repo}.zip' format (pre-2026-05-07).
    Moves the file if it exists at the old path, updates the DB row, and
    re-enqueues any repo still missing an archive.
    """
    import shutil
    repos_dir = os.getenv("REPOS_DIR", "/app/repos")
    repos = db.query(Repository).all()

    moved, enqueued, already_ok = 0, 0, 0
    for repo in repos:
        correct_path = _repo_zip_path(repos_dir, repo.name)
        if repo.zip_path == correct_path:
            already_ok += 1
            continue

        # Check for file at old flat path: {repos_dir}/{owner}_{reponame}.zip
        parts = repo.name.split("/", 1)
        owner = parts[0] if len(parts) == 2 else "unknown"
        name  = parts[1] if len(parts) == 2 else parts[0]
        old_path = os.path.join(repos_dir, f"{owner}_{name}.zip")

        if os.path.isfile(old_path):
            os.makedirs(os.path.dirname(correct_path), exist_ok=True)
            shutil.move(old_path, correct_path)
            repo.zip_path   = correct_path
            repo.zip_status = "done"
            moved += 1
        elif repo.zip_status in (None, "failed"):
            zip_queue.enqueue(repo.id, repo.url, correct_path)
            enqueued += 1

    db.commit()
    return {"already_ok": already_ok, "moved": moved, "enqueued": enqueued}


@app.post("/api/bookmarks/save-backup")
async def save_bookmark_backup(payload: BookmarkBackupPayload):
    """
    Write a GitHub bookmark backup JSON file directly to the host Desktop.
    The Desktop directory must be mounted at DESKTOP_BACKUP_PATH (default /host_desktop).
    Returns 503 if the mount is not available so the client can fall back gracefully.
    """
    import json
    from datetime import datetime

    desktop = os.getenv("DESKTOP_BACKUP_PATH", "/host_desktop")
    if not os.path.isdir(desktop):
        raise HTTPException(
            status_code=503,
            detail=f"Desktop mount not available at {desktop}",
        )

    now = datetime.now()
    filename = f"github_bookmarks_{now.strftime('%Y-%m-%d_%H-%M-%S')}.json"
    filepath = os.path.join(desktop, filename)

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(payload.model_dump(), f, indent=2, ensure_ascii=False)
        return {"filename": filename, "path": filepath}
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Could not write backup: {e}")





@app.post("/api/import/folder", response_model=ImportResponse)
async def import_from_folder(
    folder_path: str = Query(...),
    db: Session = Depends(get_db)
):
    """Import repositories from folder containing bookmark files"""
    try:
        if not os.path.isdir(folder_path):
            raise HTTPException(status_code=400, detail="Folder not found")
        
        all_bookmarks = []
        
        # Scan for bookmark files
        for filename in os.listdir(folder_path):
            if filename.endswith(('.html', '.json')):
                filepath = os.path.join(folder_path, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                    bookmarks = parse_bookmarks(content)
                    all_bookmarks.extend(bookmarks)
        
        github_urls = filter_github_urls(all_bookmarks)
        
        if not github_urls:
            raise HTTPException(status_code=400, detail="No GitHub URLs found in folder")
        
        # Check for duplicates in the import file and database
        seen_urls = set()
        unique_bookmarks = []
        duplicates_in_file = 0
        
        for bookmark in github_urls:
            if bookmark['url'] in seen_urls:
                duplicates_in_file += 1
            else:
                seen_urls.add(bookmark['url'])
                unique_bookmarks.append(bookmark)
        
        # Check for duplicates in database
        duplicates_in_db = 0
        to_import = []
        
        for bookmark in unique_bookmarks:
            existing = repo_crud.get_repo_by_url(db, bookmark['url'])
            if existing:
                duplicates_in_db += 1
            else:
                to_import.append(bookmark)
        
        # Save all repositories
        newly_imported = 0
        for bookmark in to_import:
            # Extract repo name only (last part of URL)
            url_parts = bookmark['url'].rstrip('/').split('/')
            repo_name = url_parts[-1]
            
            # Use basic heuristics at import time; smart categorization runs during sync
            category = categorize_url(bookmark['url'], bookmark['title'])
            repo_data = RepositoryCreate(
                name=repo_name,
                url=bookmark['url'],
                title=bookmark['title'],
                category=category
            )
            try:
                repo_crud.create_repository(db, repo_data)
                newly_imported += 1
            except Exception as e:
                # Rollback the failed transaction so we can continue
                db.rollback()
                logger.error(f"Failed to create repository {repo_name}: {str(e)}")
        
        return ImportResponse(
            total_found=len(github_urls),
            duplicates_in_file=duplicates_in_file,
            duplicates_in_db=duplicates_in_db,
            newly_imported=newly_imported,
            message=f"Import complete: {newly_imported} repositories imported, {duplicates_in_db} already in database, {duplicates_in_file} duplicates in file"
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))



# ============ REPOSITORY ENDPOINTS ============

@app.get("/api/repositories", response_model=List[RepositorySchema])
async def list_repositories(
    category: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(100),
    sort_by: Optional[str] = Query(None, description="Sort by field: name, category, created_at, updated_at"),
    sort_order: Optional[str] = Query("asc", description="Sort order: asc or desc"),
    db: Session = Depends(get_db)
):
    """List all repositories with optional filtering, sorting, and pagination"""
    repos = repo_crud.get_repositories(
        db,
        category=category,
        skip=skip,
        limit=limit,
        sort_by=sort_by,
        sort_order=sort_order
    )
    return repos


@app.get("/api/repositories/check-duplicate")
async def check_duplicate_url(
    url: str = Query(..., description="URL to check"),
    db: Session = Depends(get_db)
):
    """Check if a repository URL already exists"""
    existing = repo_crud.get_repo_by_url(db, url)
    return {
        "exists": existing is not None,
        "repository": {
            "id": existing.id,
            "name": existing.name,
            "url": existing.url
        } if existing else None
    }


@app.post("/api/repositories", response_model=RepositorySchema)
async def create_repository(
    repo_data: RepositoryCreate,
    db: Session = Depends(get_db)
):
    """Manually add a new repository"""
    # Check if repository already exists
    existing = repo_crud.get_repo_by_url(db, repo_data.url)
    if existing:
        raise HTTPException(status_code=400, detail="Repository with this URL already exists")
    
    # Create the repository
    new_repo = repo_crud.create_repository(db, repo_data)
    return new_repo


@app.post("/api/repositories/import-url", response_model=RepositorySchema)
@limiter.limit("30/minute")
async def import_repository_url(
    request: Request,
    body: ImportUrlRequest,
    db: Session = Depends(get_db)
):
    """
    Browser extension endpoint: import a single GitHub repository URL.
    Used by the Repo Deployer browser extension for one-click imports.
    
    Request body: { "url": "https://github.com/owner/repo" }
    """
    url = body.url.strip()
    
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    
    # Normalize the URL
    from services.bookmark_parser import normalize_github_url
    normalized_url = normalize_github_url(url)
    
    if not normalized_url:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL format")
    
    # Check if already exists
    existing = repo_crud.get_repo_by_url(db, normalized_url)
    if existing:
        raise HTTPException(status_code=409, detail="Repository already in your library")
    
    # Extract owner/repo from URL for initial metadata
    import re
    match = re.search(r"github\.com/([^/]+)/([^/]+)", normalized_url)
    if not match:
        raise HTTPException(status_code=400, detail="Could not parse GitHub URL")
    
    owner, repo_name = match.groups()
    
    title = f"{owner}/{repo_name}"

    # Fetch authoritative metadata from GitHub public API (no token required).
    # This populates description, topics, stars, forks at import time so the
    # repo is immediately useful without waiting for a later sync.
    import httpx
    gh_description: Optional[str] = None
    gh_topics: Optional[list] = None
    gh_stars: Optional[int] = None
    gh_forks: Optional[int] = None
    gh_language: Optional[str] = None
    gh_license: Optional[str] = None
    gh_is_fork: Optional[bool] = None

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            gh_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo_name}",
                headers={
                    "Accept": "application/vnd.github.v3+json",
                    "User-Agent": "RepoDeployer/2.0",
                },
            )
            if gh_resp.status_code == 200:
                gh = gh_resp.json()
                gh_description = gh.get("description") or None
                gh_topics      = gh.get("topics") or []
                gh_stars       = gh.get("stargazers_count")
                gh_forks       = gh.get("forks_count")
                gh_language    = gh.get("language") or None
                gh_license     = (gh.get("license") or {}).get("name") or None
                gh_is_fork     = gh.get("fork", False)
    except Exception:
        pass  # API unreachable — proceed with what the extension sent

    # Prefer API data; fall back to extension page metadata for any missing fields
    meta = body.metadata
    final_description = gh_description or (meta.description if meta else None)
    final_topics      = gh_topics      if gh_topics is not None else (meta.topics if meta else None)
    final_language    = gh_language    or (meta.language if meta else None)
    final_license     = gh_license     or (meta.license if meta else None)
    final_stars       = gh_stars       if gh_stars is not None else (meta.stars if meta else None)
    final_forks       = gh_forks       if gh_forks is not None else (meta.forks if meta else None)
    final_is_fork     = gh_is_fork     if gh_is_fork is not None else (meta.is_fork if meta else None)

    # Smart categorization using the now-rich metadata
    from services.bookmark_parser import smart_categorize
    category, category_source = await smart_categorize(
        normalized_url,
        title,
        language=final_language,
        topics=final_topics,
        description=final_description,
    )

    repo_data = RepositoryCreate(
        url=normalized_url,
        name=repo_name,
        title=title,
        category=category,
        description=final_description,
    )

    new_repo = repo_crud.create_repository(db, repo_data)
    new_repo.category_source = category_source
    if final_stars    is not None: new_repo.stars    = final_stars
    if final_forks    is not None: new_repo.forks    = final_forks
    if final_language is not None: new_repo.language = final_language
    if final_topics   is not None: new_repo.topics   = final_topics
    if final_license  is not None: new_repo.license  = final_license
    if final_is_fork  is not None: new_repo.is_fork  = final_is_fork
    db.commit()
    db.refresh(new_repo)

    # Apply tags
    if body.tags:
        from models import Tag
        for tag_name in body.tags:
            tag = db.query(Tag).filter(Tag.name == tag_name).first()
            if not tag:
                tag = Tag(name=tag_name)
                db.add(tag)
                db.flush()
            if tag not in new_repo.tags:
                new_repo.tags.append(tag)
        db.commit()
        db.refresh(new_repo)

    repos_dir = os.getenv("REPOS_DIR", "/app/repos")
    zip_queue.enqueue(new_repo.id, new_repo.url, _repo_zip_path(repos_dir, f"{owner}/{repo_name}"))

    return new_repo


@app.get("/api/search")
async def search_repositories(
    q: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = Query(None, description="Filter by category"),
    cloned: Optional[bool] = Query(None, description="Filter by cloned status"),
    deployed: Optional[bool] = Query(None, description="Filter by deployed status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Search repositories with full-text search and filters"""
    from services.search_service import SearchService
    from services.cache_service import CacheService, generate_search_cache_key
    
    # Generate cache key
    cache_key = generate_search_cache_key(q, category, cloned, deployed, limit, offset)
    
    # Try to get from cache
    cached_result = CacheService.get(cache_key)
    if cached_result:
        return cached_result
    
    results, total = SearchService.search_repositories(
        db=db,
        query=q or "",
        category=category,
        cloned=cloned,
        deployed=deployed,
        limit=limit,
        offset=offset,
    )
    
    response = {
        "results": [
            {
                "id": r.id,
                "name": r.name,
                "title": r.title,
                "url": r.url,
                "category": r.category,
                "cloned": r.cloned,
                "deployed": r.deployed,
                "created_at": r.created_at,
            }
            for r in results
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }
    
    # Cache the result (1 hour TTL)
    CacheService.set(cache_key, response, ttl=3600)
    
    return response


@app.get("/api/repositories/{repo_id}", response_model=RepositorySchema)
async def get_repository(repo_id: int, db: Session = Depends(get_db)):
    """Get repository details"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@app.put("/api/repositories/{repo_id}", response_model=RepositorySchema)
async def update_repository(
    repo_id: int,
    repo_data: RepositoryUpdate,
    db: Session = Depends(get_db)
):
    """Update repository metadata (supports partial updates)"""
    repo = repo_crud.update_repository(db, repo_id, repo_data)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return repo


@app.delete("/api/repositories/{repo_id}")
async def delete_repository(repo_id: int, db: Session = Depends(get_db)):
    """Delete repository"""
    success = repo_crud.delete_repository(db, repo_id)
    if not success:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"message": "Repository deleted"}


@app.get("/api/repositories/{repo_id}/readme")
async def get_repository_readme(repo_id: int, db: Session = Depends(get_db)):
    """Fetch README.md content for a repository from raw.githubusercontent.com"""
    import httpx
    from services.github_service import GitHubService

    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    # Serve from disk if the sync process already downloaded it
    repos_dir = os.getenv("REPOS_DIR", "/app/repos")
    parts = repo.name.split("/", 1)
    owner_part = parts[0] if len(parts) == 2 else "unknown"
    name_part  = parts[1] if len(parts) == 2 else parts[0]
    disk_readme = os.path.join(repos_dir, owner_part, name_part, "README.md")
    if os.path.isfile(disk_readme):
        try:
            with open(disk_readme, "r", encoding="utf-8") as f:
                return {"content": f.read(), "url": repo.url, "source": "disk"}
        except OSError:
            pass  # Fall through to network fetch

    parsed = GitHubService.parse_github_url(repo.url)
    if not parsed:
        raise HTTPException(status_code=400, detail="Invalid GitHub URL")

    owner, repo_name = parsed
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/plain,text/html,*/*;q=0.9",
    }

    # Try HEAD branch first, then common default branch names
    for branch in ("HEAD", "main", "master"):
        url = f"https://raw.githubusercontent.com/{owner}/{repo_name}/{branch}/README.md"
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return {"content": resp.text, "url": repo.url}
        except Exception:
            continue

    raise HTTPException(status_code=404, detail="README.md not found")


@app.get("/api/categories")
async def get_categories(db: Session = Depends(get_db)):
    """Get all available categories with repository counts"""
    categories = repo_crud.get_category_stats(db)
    return categories


# ============ BULK OPERATIONS ============

@app.post("/api/bulk/update-category")
async def bulk_update_category(
    action: BulkActionRequest,
    db: Session = Depends(get_db)
):
    """Update category for multiple repositories"""
    try:
        updated_count = repo_crud.bulk_update_category(
            db,
            action.repository_ids,
            action.new_category
        )
        return {"updated_count": updated_count, "message": f"Updated {updated_count} repositories"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/bulk/delete")
async def bulk_delete(
    action: BulkActionRequest,
    db: Session = Depends(get_db)
):
    """Delete multiple repositories"""
    try:
        deleted_count = repo_crud.bulk_delete(db, action.repository_ids)
        return {"deleted_count": deleted_count, "message": f"Deleted {deleted_count} repositories"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/bulk/health-check")
@limiter.limit("5/minute")
async def bulk_health_check(
    request: Request,
    action: BulkActionRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Check health status of multiple repositories - returns job_id for progress tracking"""
    import uuid
    from services.cache_service import CacheService
    
    # Generate unique job ID for tracking progress
    job_id = str(uuid.uuid4())
    
    logger.info(f"[HEALTH-CHECK] Starting bulk health check")
    logger.info(f"[HEALTH-CHECK] Job ID: {job_id}")
    logger.info(f"[HEALTH-CHECK] Repositories to scan: {len(action.repository_ids)}")
    
    # Initialize progress tracking in cache
    CacheService.set(
        f"health_check:{job_id}",
        {
            "status": "running",
            "current": 0,
            "total": len(action.repository_ids),
            "healthy": 0,
            "archived": 0,
            "not_found": 0,
            "errors": 0,
            "message": "Starting health checks..."
        },
        ttl=3600
    )
    
    logger.info(f"[HEALTH-CHECK] Progress tracking initialized in cache for job {job_id}")
    
    # Schedule background task to perform health check
    background_tasks.add_task(
        perform_bulk_health_check,
        job_id,
        action.repository_ids
    )
    
    logger.info(f"[HEALTH-CHECK] Background task scheduled for job {job_id}")
    
    return {"job_id": job_id, "message": "Health check started"}


@app.get("/api/bulk/health-check/{job_id}/progress")
async def get_health_check_progress(job_id: str):
    """Get progress of a running health check"""
    from services.cache_service import CacheService
    
    progress = CacheService.get(f"health_check:{job_id}")
    
    if not progress:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    
    return progress


async def perform_bulk_health_check(job_id: str, repository_ids: list):
    """Background task: concurrent health checks with semaphore-bounded parallelism."""
    try:
        import re
        from datetime import datetime
        from services.cache_service import CacheService
        from database import SessionLocal
        from services.bookmark_parser import _stealth_fetch_github_meta

        logger.info(f"[HEALTH-CHECK-TASK] Starting job {job_id} for {len(repository_ids)} repos")

        db = SessionLocal()
        repos = db.query(Repository).filter(Repository.id.in_(repository_ids)).all()
        total = len(repos)
        logger.info(f"[HEALTH-CHECK-TASK] Found {total} repositories")

        # Shared counters (mutated inside coroutines — use a dict for mutability)
        counts = {"healthy": 0, "archived": 0, "not_found": 0, "errors": 0, "done": 0}
        repo_updates = []
        sem = asyncio.Semaphore(10)  # max 10 concurrent stealth fetches

        async def check_one(repo):
            update = {"id": repo.id, "last_health_check": datetime.utcnow()}
            async with sem:
                try:
                    url = repo.url.rstrip("/")
                    if url.endswith(".git"):
                        url = url[:-4]
                    m = re.search(r"github\.com/([^/]+)/([^/]+)", url) or \
                        re.search(r"git@github\.com:([^/]+)/([^/]+)", url)
                    if not m:
                        update["health_status"] = "unknown"
                        counts["errors"] += 1
                        return update

                    owner, repo_name = m.group(1), m.group(2)
                    meta = await _stealth_fetch_github_meta(owner, repo_name)

                    if meta:
                        update["language"] = meta.get("language")
                        update["topics"] = meta.get("topics", "").split() if meta.get("topics") else []
                        if meta.get("description") and (not repo.description or len(repo.description) < 50):
                            update["description"] = meta["description"]
                        update["health_status"] = "healthy"
                        counts["healthy"] += 1
                    else:
                        update["health_status"] = "not_found"
                        counts["not_found"] += 1

                    await asyncio.sleep(0.5)  # gentle rate-limit per slot
                except Exception as e:
                    logger.error(f"Error checking repo {repo.id}: {e}")
                    update["health_status"] = "unknown"
                    counts["errors"] += 1

            counts["done"] += 1
            CacheService.set(
                f"health_check:{job_id}",
                {"status": "running", "current": counts["done"], "total": total, **counts,
                 "message": f"Checking… ({counts['done']}/{total})"},
                ttl=3600,
            )
            return update

        results = await asyncio.gather(*[check_one(r) for r in repos], return_exceptions=True)
        repo_updates = [r for r in results if isinstance(r, dict)]
        
        if repo_updates:
            db.bulk_update_mappings(Repository, repo_updates)
        db.commit()
        
        logger.info(f"[HEALTH-CHECK-TASK] Updating progress - marking job {job_id} as completed")
        CacheService.set(
            f"health_check:{job_id}",
            {
                "status": "completed",
                "current": len(repos),
                "total": len(repos),
                "healthy": counts["healthy"],
                "archived": counts["archived"],
                "not_found": counts["not_found"],
                "errors": counts["errors"],
                "message": f"✓ Complete: {counts['healthy']} healthy, {counts['archived']} archived, {counts['not_found']} not found"
            },
            ttl=3600
        )

        logger.info(f"[HEALTH-CHECK-COMPLETE] Job {job_id} completed successfully")
        logger.info(f"[HEALTH-CHECK-SUMMARY] Healthy: {counts['healthy']}, Archived: {counts['archived']}, Not Found: {counts['not_found']}, Errors: {counts['errors']}")
        db.close()
    except Exception as e:
        logger.error(f"[HEALTH-CHECK-ERROR] Job {job_id} failed with error: {str(e)}")
        logger.error(f"[HEALTH-CHECK-ERROR] Traceback: ", exc_info=True)
        CacheService.set(
            f"health_check:{job_id}",
            {
                "status": "failed",
                "error": str(e),
                "message": "Health check failed"
            },
            ttl=3600
        )


# ============ GIT OPERATIONS ============

@app.post("/api/repositories/{repo_id}/sync")
async def sync_repository(
    repo_id: int,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Sync/update repository from remote"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    background_tasks.add_task(sync_repo, repo.path, repo.url)
    return {"message": f"Syncing {repo.name}..."}


@app.post("/api/repositories/{repo_id}/clone")
async def clone_repository(
    repo_id: int,
    db: Session = Depends(get_db)
):
    """Clone repository locally using the clone queue"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    if repo.cloned:
        return {"message": f"{repo.name} is already cloned", "job_id": None}

    # Use the clone queue for proper tracking and status updates
    target_path = repo.path or f"./repos/{repo.name}"
    job = clone_queue.add_job(
        repository_id=repo.id,
        name=repo.name,
        url=repo.url,
        target_path=target_path
    )
    return {"message": f"Cloning {repo.name}...", "job_id": job.id}


# ============ DOCKER DEPLOYMENT ============

@app.post("/api/repositories/{repo_id}/deploy")
async def deploy_repository(
    repo_id: int,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Deploy repository to Docker"""
    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # background_tasks.add_task(deploy_to_docker, repo.path, repo.name)
    return {"message": f"Deploying {repo.name} to Docker..."}


# ============ HEALTH & STATS ============

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Real-time event stream for clone/import/zip job updates."""
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()   # keep-alive; client can send pings
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.get("/api/health")
async def health_check(db: Session = Depends(get_db)):
    """Health check endpoint"""
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception:
        return {"status": "unhealthy", "database": "disconnected"}


@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get application statistics"""
    from services.cache_service import CacheService, generate_stats_cache_key
    
    # Try to get from cache
    cache_key = generate_stats_cache_key()
    cached_stats = CacheService.get(cache_key)
    if cached_stats:
        return cached_stats
    
    stats = repo_crud.get_stats(db)
    
    # Cache the result (5 minute TTL)
    CacheService.set(cache_key, stats, ttl=300)
    
    return stats


@app.get("/api/audit-logs")
async def get_audit_logs(
    operation: Optional[str] = Query(None, description="Filter by operation type"),
    resource_type: Optional[str] = Query(None, description="Filter by resource type"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get audit logs with optional filtering"""
    from services.audit_service import AuditService
    logs = AuditService.get_audit_logs(
        db=db,
        operation=operation,
        resource_type=resource_type,
        limit=limit,
        offset=offset,
    )
    return [
        {
            "id": log.id,
            "operation": log.operation,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "status": log.status,
            "timestamp": log.timestamp.isoformat(),
            "details": log.details,
            "error_message": log.error_message,
        }
        for log in logs
    ]


# ============ EXPORT ENDPOINTS ============


_EXPORT_CHUNK = 500   # rows fetched per DB round-trip
_EXPORT_MAX   = 50_000  # hard ceiling to prevent runaway memory


@app.get("/api/export/csv")
async def export_csv(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Stream repositories as CSV (chunked to avoid OOM on large libraries)."""
    from fastapi.responses import StreamingResponse
    from services.export_service import ExportService

    def _generate():
        offset = 0
        first = True
        while offset < _EXPORT_MAX:
            batch = repo_crud.get_repositories(db, category=category, skip=offset, limit=_EXPORT_CHUNK)
            if not batch:
                break
            chunk = ExportService.to_csv(batch)
            # Strip the header from subsequent chunks
            if not first:
                chunk = "\n".join(chunk.splitlines()[1:]) + "\n"
            yield chunk
            first = False
            if len(batch) < _EXPORT_CHUNK:
                break
            offset += _EXPORT_CHUNK

    return StreamingResponse(
        _generate(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=repositories.csv"},
    )


@app.get("/api/export/json")
async def export_json(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Stream repositories as JSON array (chunked to avoid OOM on large libraries)."""
    from fastapi.responses import StreamingResponse
    from services.export_service import ExportService
    import json

    def _generate():
        yield "["
        offset = 0
        first_item = True
        while offset < _EXPORT_MAX:
            batch = repo_crud.get_repositories(db, category=category, skip=offset, limit=_EXPORT_CHUNK)
            if not batch:
                break
            for repo in batch:
                prefix = "" if first_item else ","
                yield prefix + json.dumps(ExportService._repo_to_dict(repo))
                first_item = False
            if len(batch) < _EXPORT_CHUNK:
                break
            offset += _EXPORT_CHUNK
        yield "]"

    return StreamingResponse(
        _generate(),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=repositories.json"},
    )


@app.get("/api/export/markdown")
async def export_markdown(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Stream repositories as Markdown (chunked to avoid OOM on large libraries)."""
    from fastapi.responses import StreamingResponse
    from services.export_service import ExportService

    def _generate():
        offset = 0
        first = True
        while offset < _EXPORT_MAX:
            batch = repo_crud.get_repositories(db, category=category, skip=offset, limit=_EXPORT_CHUNK)
            if not batch:
                break
            chunk = ExportService.to_markdown(batch)
            if not first:
                # Strip the header (first 3 lines: title + blank + table header)
                lines = chunk.splitlines()
                chunk = "\n".join(lines[3:]) + "\n"
            yield chunk
            first = False
            if len(batch) < _EXPORT_CHUNK:
                break
            offset += _EXPORT_CHUNK

    return StreamingResponse(
        _generate(),
        media_type="text/markdown",
        headers={"Content-Disposition": "attachment; filename=repositories.md"},
    )


# ============ AUTHENTICATION ENDPOINTS ============


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """Authenticate user and return JWT token"""
    from services.auth_service import verify_password, create_access_token
    
    # In a real app, verify username against database
    # For now, accept any username/password that matches a pattern
    if not request.username or not request.password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Create token with 30 minute expiration
    access_token = create_access_token(
        data={"sub": request.username},
        expires_delta=timedelta(minutes=30)
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/auth/verify")
async def verify_token(authorization: Optional[str] = Header(None)):
    """Verify JWT token validity"""
    from services.auth_service import decode_token
    
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
    token = parts[1]
    username = decode_token(token)
    
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return {"username": username, "valid": True}


# ============ GITHUB METADATA ENDPOINTS ============


@app.get("/api/github/metadata")
async def fetch_github_metadata(url: str = Query(..., description="GitHub repository URL")):
    """Fetch metadata for a repository URL via stealth HTML fetch (no GitHub API token required)"""
    from services.bookmark_parser import _stealth_fetch_github_meta, _score_text_for_category
    from services.github_service import GitHubService

    parsed = GitHubService.parse_github_url(url)
    if not parsed:
        raise HTTPException(status_code=400, detail="Not a valid GitHub repository URL")

    owner, repo_name = parsed
    meta = await _stealth_fetch_github_meta(owner, repo_name)

    if not meta:
        raise HTTPException(status_code=404, detail="Could not fetch metadata. Repository may not exist or is private.")

    text_for_category = " ".join(filter(None, [
        meta.get("topics", ""),
        meta.get("language", ""),
        meta.get("description", ""),
    ]))
    suggested_category, _ = _score_text_for_category(text_for_category)
    topics = meta.get("topics", "").split() if meta.get("topics") else []

    return {
        "stars": 0,
        "forks": 0,
        "watchers": 0,
        "language": meta.get("language"),
        "languages": {},
        "topics": topics,
        "description": meta.get("description"),
        "license": None,
        "archived": False,
        "is_fork": False,
        "created_at": None,
        "updated_at": None,
        "pushed_at": None,
        "open_issues": 0,
        "default_branch": "main",
        "suggested_category": suggested_category or "other",
    }


@app.post("/api/repositories/{repo_id}/sync-metadata")
async def sync_repo_metadata_endpoint(
    repo_id: int,
    db: Session = Depends(get_db)
):
    """Sync metadata for a single repository via stealth HTML fetch (no GitHub API token required)."""
    from services.bookmark_parser import _stealth_fetch_github_meta, _score_text_for_category
    from sqlalchemy.orm.attributes import flag_modified
    from datetime import datetime

    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    norm = normalize_github_url(repo.url)
    if not norm:
        raise HTTPException(status_code=422, detail="URL is not a recognised GitHub repository")

    parts = norm.rstrip("/").split("/")
    owner, repo_name = parts[-2], parts[-1]
    meta = await _stealth_fetch_github_meta(owner, repo_name)

    if not meta:
        # Repo may be private, renamed, or deleted — update health only
        repo.health_status = "not_found"
        repo.last_health_check = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=502, detail="Could not reach repository page — it may be private, renamed, or deleted")

    # Determine category from combined text
    text_for_category = " ".join(filter(None, [
        meta.get("topics", ""),
        meta.get("language", ""),
        meta.get("description", ""),
        repo.title or repo.name or "",
    ]))
    category, score = _score_text_for_category(text_for_category)
    if score == 0:
        category = "other"

    # Apply updates — flag JSON columns explicitly so SQLAlchemy tracks the change
    repo.language = meta.get("language")
    repo.topics = meta.get("topics", "").split() if meta.get("topics") else []
    flag_modified(repo, "topics")

    repo.health_status = "healthy"
    repo.category = category
    repo.category_source = "stealth_fetch"

    if meta.get("description") and (not repo.description or len(repo.description) < 50):
        repo.description = meta["description"]

    db.commit()

    return {
        "success": True,
        "message": f"Metadata synced for {repo.name}",
        "language": repo.language,
        "topics": repo.topics or [],
        "category": repo.category,
        "health_status": repo.health_status,
    }


# ============ TAGS ENDPOINTS ============


from crud import tags as tags_crud
from schemas import TagCreate, TagSchema


@app.get("/api/tags")
async def list_tags(db: Session = Depends(get_db)):
    """List all tags with repository counts"""
    return tags_crud.get_tags_with_counts(db)


@app.post("/api/tags", response_model=TagSchema)
async def create_tag(tag: TagCreate, db: Session = Depends(get_db)):
    """Create a new tag"""
    existing = tags_crud.get_tag_by_name(db, tag.name)
    if existing:
        raise HTTPException(status_code=400, detail="Tag already exists")
    return tags_crud.create_tag(db, tag)


@app.delete("/api/tags/{tag_id}")
async def delete_tag(tag_id: int, db: Session = Depends(get_db)):
    """Delete a tag"""
    success = tags_crud.delete_tag(db, tag_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tag not found")
    return {"message": "Tag deleted"}


@app.post("/api/repositories/{repo_id}/tags")
async def add_tags_to_repo(
    repo_id: int,
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add tags to a repository"""
    repo = tags_crud.add_tags_to_repository(db, repo_id, tag_ids)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"message": f"Added {len(tag_ids)} tags to repository"}


@app.delete("/api/repositories/{repo_id}/tags")
async def remove_tags_from_repo(
    repo_id: int,
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Remove tags from a repository"""
    repo = tags_crud.remove_tags_from_repository(db, repo_id, tag_ids)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    return {"message": f"Removed {len(tag_ids)} tags from repository"}


@app.post("/api/bulk/add-tags")
async def bulk_add_tags(
    repo_ids: List[int],
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add tags to multiple repositories"""
    updated = tags_crud.bulk_add_tags(db, repo_ids, tag_ids)
    return {"message": f"Added tags to {updated} repositories"}


@app.post("/api/bulk/remove-tags")
async def bulk_remove_tags(
    repo_ids: List[int],
    tag_ids: List[int],
    db: Session = Depends(get_db)
):
    """Remove tags from multiple repositories"""
    updated = tags_crud.bulk_remove_tags(db, repo_ids, tag_ids)
    return {"message": f"Removed tags from {updated} repositories"}


# ============ HEALTH CHECK ENDPOINTS ============


@app.post("/api/repositories/{repo_id}/check-health")
async def check_repository_health(
    repo_id: int,
    db: Session = Depends(get_db)
):
    """Check if a repository still exists on GitHub"""
    from services.github_service import GitHubService
    from datetime import datetime

    repo = repo_crud.get_repository(db, repo_id)
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")

    exists = await GitHubService.check_repo_exists(repo.url)
    repo.health_status = "healthy" if exists else "not_found"
    repo.last_health_check = datetime.utcnow()

    db.commit()
    db.refresh(repo)

    return {
        "repository_id": repo_id,
        "health_status": repo.health_status,
        "checked_at": repo.last_health_check
    }


# ============ CLONE QUEUE ENDPOINTS ============


@app.on_event("startup")
async def start_clone_queue():
    """Start the clone queue worker on app startup"""
    clone_queue.db_session_factory = SessionLocal
    clone_queue.start()


@app.on_event("shutdown")
async def stop_clone_queue():
    """Stop the clone queue worker on app shutdown"""
    clone_queue.stop()


@app.get("/api/clone-queue/status")
async def get_clone_queue_status():
    """Get clone queue status"""
    return clone_queue.get_queue_status()


@app.get("/api/clone-queue/jobs")
async def get_clone_queue_jobs():
    """Get all clone jobs"""
    jobs = clone_queue.get_all_jobs()
    return [
        {
            "id": job.id,
            "repository_id": job.repository_id,
            "repository_name": job.repository_name,
            "status": job.status,
            "progress": job.progress,
            "error_message": job.error_message,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "created_at": job.created_at.isoformat()
        }
        for job in jobs
    ]


@app.post("/api/clone-queue/add")
async def add_to_clone_queue(
    repository_ids: List[int],
    db: Session = Depends(get_db)
):
    """Add repositories to the clone queue"""
    repos_to_clone = []
    for repo_id in repository_ids:
        repo = repo_crud.get_repository(db, repo_id)
        if repo and not repo.cloned:
            repos_to_clone.append({
                "id": repo.id,
                "name": repo.name,
                "url": repo.url,
                "path": repo.path or f"./repos/{repo.name}"
            })

    if not repos_to_clone:
        return {"message": "No repositories to clone", "jobs_added": 0}

    jobs = clone_queue.add_jobs(repos_to_clone)
    return {
        "message": f"Added {len(jobs)} repositories to clone queue",
        "jobs_added": len(jobs),
        "job_ids": [job.id for job in jobs]
    }


@app.post("/api/clone-queue/cancel/{job_id}")
async def cancel_clone_job(job_id: int):
    """Cancel a pending clone job"""
    success = clone_queue.cancel_job(job_id)
    if success:
        return {"message": f"Job {job_id} cancelled"}
    raise HTTPException(status_code=400, detail="Cannot cancel job (may be already in progress or completed)")


@app.post("/api/clone-queue/clear")
async def clear_clone_queue():
    """Clear completed and failed jobs from the queue"""
    clone_queue.clear_completed()
    return {"message": "Cleared completed jobs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
