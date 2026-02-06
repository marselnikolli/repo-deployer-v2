"""Import API routes for Feature #8: Import Sources Expansion"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from database import SessionLocal
from routes.auth import get_current_user
from services.import_service import ImportService
from models import User
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

router = APIRouter(prefix="/api/imports", tags=["imports"])


# ============ Pydantic Schemas ============

class ImportSourceCreate(BaseModel):
    source_type: str  # github_stars, github_org, gitlab, bitbucket
    source_name: str
    source_config: Dict[str, Any] = {}


class ImportSourceResponse(BaseModel):
    id: int
    source_type: str
    source_name: str
    is_active: bool
    last_import_at: Optional[str]
    import_count: int
    
    class Config:
        from_attributes = True


class ImportJobResponse(BaseModel):
    id: int
    source_type: str
    status: str  # pending, running, completed, failed
    total_repositories: int
    imported_repositories: int
    failed_repositories: int
    error_message: Optional[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    created_at: str
    
    class Config:
        from_attributes = True


class GitHubImportRequest(BaseModel):
    github_token: str
    import_type: str  # stars or org
    org_name: Optional[str] = None


class FileImportRequest(BaseModel):
    file_type: str  # json or csv


# ============ Import Sources Endpoints ============

@router.get("/sources", response_model=List[ImportSourceResponse])
async def list_import_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all import sources for current user"""
    service = ImportService(db)
    sources = service.list_import_sources(current_user.id)
    return sources


@router.post("/sources", response_model=ImportSourceResponse)
async def create_import_source(
    request: ImportSourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new import source configuration"""
    service = ImportService(db)
    source = service.create_import_source(
        current_user.id,
        request.source_type,
        request.source_name,
        request.source_config
    )
    return source


@router.delete("/sources/{source_id}")
async def delete_import_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an import source"""
    service = ImportService(db)
    success = service.delete_import_source(source_id, current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Import source not found")
    return {"message": "Import source deleted"}


# ============ Import Jobs Endpoints ============

@router.get("/jobs", response_model=List[ImportJobResponse])
async def list_import_jobs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List recent import jobs"""
    service = ImportService(db)
    jobs = service.list_import_jobs(current_user.id)
    return jobs


@router.get("/jobs/{job_id}", response_model=ImportJobResponse)
async def get_import_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get import job details"""
    service = ImportService(db)
    job = service.get_import_job(job_id, current_user.id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return job


# ============ GitHub Import Endpoints ============

@router.post("/github/stars")
async def import_github_stars(
    request: GitHubImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from GitHub stars"""
    if not request.github_token:
        raise HTTPException(status_code=400, detail="GitHub token required")
    
    try:
        service = ImportService(db)
        
        # Create import job
        job = service.create_import_job(current_user.id, None, 'github_stars')
        service.update_job_status(job.id, 'running')
        
        # Perform import
        result = service.import_github_stars(current_user.id, request.github_token, job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/github/org")
async def import_github_org(
    request: GitHubImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from GitHub organization"""
    if not request.github_token or not request.org_name:
        raise HTTPException(status_code=400, detail="GitHub token and org_name required")
    
    try:
        service = ImportService(db)
        
        # Create import job
        job = service.create_import_job(current_user.id, None, 'github_org')
        service.update_job_status(job.id, 'running')
        
        # Perform import
        result = service.import_github_org(current_user.id, request.github_token, request.org_name, job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ GitLab Import Endpoints ============

@router.post("/gitlab/group")
async def import_gitlab_group(
    gitlab_token: str = Form(...),
    group_id: str = Form(...),
    gitlab_url: str = Form(default="https://gitlab.com"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from GitLab group"""
    try:
        service = ImportService(db)
        
        job = service.create_import_job(current_user.id, None, 'gitlab')
        service.update_job_status(job.id, 'running')
        
        result = service.import_gitlab_org(current_user.id, gitlab_token, group_id, gitlab_url, job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ Bitbucket Import Endpoints ============

@router.post("/bitbucket/team")
async def import_bitbucket_team(
    bitbucket_user: str = Form(...),
    bitbucket_password: str = Form(...),
    team_slug: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from Bitbucket team"""
    try:
        service = ImportService(db)
        
        job = service.create_import_job(current_user.id, None, 'bitbucket')
        service.update_job_status(job.id, 'running')
        
        result = service.import_bitbucket_org(current_user.id, bitbucket_user, bitbucket_password, team_slug, job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ File Upload Endpoints ============

@router.post("/file/opml")
async def import_opml_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from OPML file"""
    try:
        service = ImportService(db)
        
        job = service.create_import_job(current_user.id, None, 'opml')
        service.update_job_status(job.id, 'running')
        
        content = await file.read()
        result = service.import_opml_file(current_user.id, content.decode('utf-8'), job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/file/json")
async def import_json_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from JSON file"""
    try:
        service = ImportService(db)
        
        job = service.create_import_job(current_user.id, None, 'json')
        service.update_job_status(job.id, 'running')
        
        content = await file.read()
        result = service.import_json_file(current_user.id, content.decode('utf-8'), job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/file/csv")
async def import_csv_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import repositories from CSV file"""
    try:
        service = ImportService(db)
        
        job = service.create_import_job(current_user.id, None, 'csv')
        service.update_job_status(job.id, 'running')
        
        content = await file.read()
        result = service.import_csv_file(current_user.id, content.decode('utf-8'), job.id)
        
        if 'error' in result:
            service.update_job_status(job.id, 'failed', error=result['error'])
            raise HTTPException(status_code=400, detail=result['error'])
        
        service.update_job_status(
            job.id,
            'completed',
            total=result['imported'] + result['failed'],
            imported=result['imported'],
            failed=result['failed']
        )
        
        return {
            "job_id": job.id,
            "imported": result['imported'],
            "failed": result['failed']
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
