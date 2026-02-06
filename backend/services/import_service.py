"""Import Service for Feature #8: Import Sources Expansion

Supports:
- GitHub Stars (via GitHub API)
- GitHub Organizations (via GitHub API)
- GitLab (via GitLab API)
- Bitbucket (via Bitbucket API)
- OPML files (RSS feed lists)
- JSON/CSV files (bulk imports)
"""

import requests
import json
import csv
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_
from models import ImportSource, ImportJob, ImportedRepository, Repository
from database import SessionLocal
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class ImportService:
    """Service for importing repositories from various sources"""
    
    def __init__(self, db: Session = None):
        self.db = db or SessionLocal()
    
    # ============ GitHub Stars Import ============
    def import_github_stars(self, user_id: int, github_token: str, job_id: int) -> Dict[str, Any]:
        """Import all starred repositories from GitHub user account"""
        try:
            headers = {'Authorization': f'token {github_token}'}
            imported = 0
            failed = 0
            
            page = 1
            while True:
                url = f'https://api.github.com/user/starred?per_page=100&page={page}'
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code != 200:
                    raise Exception(f'GitHub API error: {response.status_code}')
                
                repos = response.json()
                if not repos:
                    break
                
                for repo in repos:
                    try:
                        repo_data = self._extract_github_repo_data(repo)
                        existing = self.db.query(Repository).filter_by(
                            url=repo_data['url']
                        ).first()
                        
                        if not existing:
                            repo_obj = Repository(**repo_data, user_id=user_id)
                            self.db.add(repo_obj)
                            self.db.flush()
                            
                            import_record = ImportedRepository(
                                repository_id=repo_obj.id,
                                job_id=job_id,
                                source_type='github_stars',
                                source_url=repo_data['url'],
                                import_status='success'
                            )
                            self.db.add(import_record)
                            imported += 1
                        else:
                            # Already exists
                            import_record = ImportedRepository(
                                repository_id=existing.id,
                                job_id=job_id,
                                source_type='github_stars',
                                source_url=repo_data['url'],
                                import_status='skipped'
                            )
                            self.db.add(import_record)
                    except Exception as e:
                        logger.error(f"Failed to import {repo['full_name']}: {str(e)}")
                        failed += 1
                
                page += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"GitHub stars import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ GitHub Organization Import ============
    def import_github_org(self, user_id: int, github_token: str, org_name: str, job_id: int) -> Dict[str, Any]:
        """Import all public repositories from a GitHub organization"""
        try:
            headers = {'Authorization': f'token {github_token}'}
            imported = 0
            failed = 0
            
            page = 1
            while True:
                url = f'https://api.github.com/orgs/{org_name}/repos?per_page=100&page={page}'
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 404:
                    raise Exception(f'Organization "{org_name}" not found')
                elif response.status_code != 200:
                    raise Exception(f'GitHub API error: {response.status_code}')
                
                repos = response.json()
                if not repos:
                    break
                
                for repo in repos:
                    try:
                        repo_data = self._extract_github_repo_data(repo)
                        existing = self.db.query(Repository).filter_by(url=repo_data['url']).first()
                        
                        if not existing:
                            repo_obj = Repository(**repo_data, user_id=user_id)
                            self.db.add(repo_obj)
                            self.db.flush()
                            imported += 1
                        else:
                            imported += 1  # Count as imported if already exists
                        
                        import_record = ImportedRepository(
                            repository_id=existing.id if existing else None,
                            job_id=job_id,
                            source_type='github_org',
                            source_url=repo_data['url'],
                            import_status='success'
                        )
                        self.db.add(import_record)
                    except Exception as e:
                        logger.error(f"Failed to import {repo['full_name']}: {str(e)}")
                        failed += 1
                
                page += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"GitHub org import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ GitLab Import ============
    def import_gitlab_org(self, user_id: int, gitlab_token: str, group_id: str, gitlab_url: str = 'https://gitlab.com', job_id: int = None) -> Dict[str, Any]:
        """Import repositories from GitLab group"""
        try:
            headers = {'PRIVATE-TOKEN': gitlab_token}
            imported = 0
            failed = 0
            
            page = 1
            while True:
                url = f'{gitlab_url}/api/v4/groups/{group_id}/projects?per_page=100&page={page}'
                response = requests.get(url, headers=headers, timeout=10)
                
                if response.status_code == 404:
                    raise Exception(f'GitLab group "{group_id}" not found')
                elif response.status_code != 200:
                    raise Exception(f'GitLab API error: {response.status_code}')
                
                repos = response.json()
                if not repos:
                    break
                
                for repo in repos:
                    try:
                        repo_data = {
                            'name': repo['name'],
                            'url': repo['web_url'],
                            'description': repo.get('description', ''),
                            'stars': repo.get('star_count', 0),
                            'language': None,  # GitLab doesn't provide language
                            'category': 'other'
                        }
                        
                        existing = self.db.query(Repository).filter_by(url=repo_data['url']).first()
                        
                        if not existing:
                            repo_obj = Repository(**repo_data, user_id=user_id)
                            self.db.add(repo_obj)
                            self.db.flush()
                            imported += 1
                        else:
                            imported += 1
                        
                        if job_id:
                            import_record = ImportedRepository(
                                repository_id=existing.id if existing else None,
                                job_id=job_id,
                                source_type='gitlab',
                                source_url=repo_data['url'],
                                import_status='success'
                            )
                            self.db.add(import_record)
                    except Exception as e:
                        logger.error(f"Failed to import {repo.get('name', 'unknown')}: {str(e)}")
                        failed += 1
                
                page += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"GitLab import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ Bitbucket Import ============
    def import_bitbucket_org(self, user_id: int, bitbucket_user: str, bitbucket_password: str, team_slug: str, job_id: int = None) -> Dict[str, Any]:
        """Import repositories from Bitbucket team/workspace"""
        try:
            auth = (bitbucket_user, bitbucket_password)
            imported = 0
            failed = 0
            
            page = 1
            while True:
                url = f'https://api.bitbucket.org/2.0/repositories/{team_slug}?page={page}&pagelen=100'
                response = requests.get(url, auth=auth, timeout=10)
                
                if response.status_code == 404:
                    raise Exception(f'Bitbucket team "{team_slug}" not found')
                elif response.status_code != 200:
                    raise Exception(f'Bitbucket API error: {response.status_code}')
                
                data = response.json()
                repos = data.get('values', [])
                if not repos:
                    break
                
                for repo in repos:
                    try:
                        repo_data = {
                            'name': repo['name'],
                            'url': repo['links']['html']['href'],
                            'description': repo.get('description', ''),
                            'stars': 0,  # Bitbucket doesn't have stars like GitHub
                            'language': None,
                            'category': 'other'
                        }
                        
                        existing = self.db.query(Repository).filter_by(url=repo_data['url']).first()
                        
                        if not existing:
                            repo_obj = Repository(**repo_data, user_id=user_id)
                            self.db.add(repo_obj)
                            self.db.flush()
                            imported += 1
                        else:
                            imported += 1
                        
                        if job_id:
                            import_record = ImportedRepository(
                                repository_id=existing.id if existing else None,
                                job_id=job_id,
                                source_type='bitbucket',
                                source_url=repo_data['url'],
                                import_status='success'
                            )
                            self.db.add(import_record)
                    except Exception as e:
                        logger.error(f"Failed to import {repo.get('name', 'unknown')}: {str(e)}")
                        failed += 1
                
                if 'page' not in data or page >= data.get('page', 0) + 1:
                    break
                page += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"Bitbucket import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ OPML Import ============
    def import_opml_file(self, user_id: int, file_content: str, job_id: int = None) -> Dict[str, Any]:
        """Import repository URLs from OPML file (RSS feed lists)"""
        try:
            imported = 0
            failed = 0
            
            root = ET.fromstring(file_content)
            # Extract all outline items with xmlUrl (RSS feed URLs)
            for outline in root.findall('.//outline[@xmlUrl]'):
                try:
                    url = outline.get('xmlUrl', '').strip()
                    if not url:
                        continue
                    
                    # Try to extract repo info from URL or feed
                    repo_data = self._extract_from_feed_url(url)
                    if not repo_data:
                        continue
                    
                    existing = self.db.query(Repository).filter_by(url=repo_data['url']).first()
                    
                    if not existing:
                        repo_obj = Repository(**repo_data, user_id=user_id)
                        self.db.add(repo_obj)
                        self.db.flush()
                        imported += 1
                    else:
                        imported += 1
                    
                    if job_id:
                        import_record = ImportedRepository(
                            repository_id=existing.id if existing else None,
                            job_id=job_id,
                            source_type='opml',
                            source_url=url,
                            import_status='success'
                        )
                        self.db.add(import_record)
                except Exception as e:
                    logger.error(f"Failed to import from OPML feed: {str(e)}")
                    failed += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"OPML import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ JSON Import ============
    def import_json_file(self, user_id: int, file_content: str, job_id: int = None) -> Dict[str, Any]:
        """Import repositories from JSON file with repository URLs/data"""
        try:
            data = json.loads(file_content)
            imported = 0
            failed = 0
            
            # Handle both array of repos and object with repos key
            repos = data if isinstance(data, list) else data.get('repositories', [])
            
            for repo in repos:
                try:
                    if isinstance(repo, str):
                        # Simple URL string
                        url = repo
                        repo_data = {'url': url, 'name': url.split('/')[-1], 'category': 'other'}
                    else:
                        # Full repo object
                        repo_data = {
                            'name': repo.get('name', ''),
                            'url': repo['url'],
                            'description': repo.get('description', ''),
                            'stars': repo.get('stars', 0),
                            'language': repo.get('language'),
                            'category': repo.get('category', 'other')
                        }
                    
                    existing = self.db.query(Repository).filter_by(url=repo_data['url']).first()
                    
                    if not existing:
                        repo_obj = Repository(**repo_data, user_id=user_id)
                        self.db.add(repo_obj)
                        self.db.flush()
                        imported += 1
                    else:
                        imported += 1
                    
                    if job_id:
                        import_record = ImportedRepository(
                            repository_id=existing.id if existing else None,
                            job_id=job_id,
                            source_type='json',
                            source_url=repo_data['url'],
                            import_status='success'
                        )
                        self.db.add(import_record)
                except Exception as e:
                    logger.error(f"Failed to import repo from JSON: {str(e)}")
                    failed += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"JSON import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ CSV Import ============
    def import_csv_file(self, user_id: int, file_content: str, job_id: int = None) -> Dict[str, Any]:
        """Import repositories from CSV file"""
        try:
            imported = 0
            failed = 0
            
            reader = csv.DictReader(file_content.split('\n'))
            
            for row in reader:
                try:
                    if not row or not row.get('url'):
                        continue
                    
                    repo_data = {
                        'name': row.get('name', row['url'].split('/')[-1]),
                        'url': row['url'],
                        'description': row.get('description', ''),
                        'stars': int(row.get('stars', 0)),
                        'language': row.get('language'),
                        'category': row.get('category', 'other')
                    }
                    
                    existing = self.db.query(Repository).filter_by(url=repo_data['url']).first()
                    
                    if not existing:
                        repo_obj = Repository(**repo_data, user_id=user_id)
                        self.db.add(repo_obj)
                        self.db.flush()
                        imported += 1
                    else:
                        imported += 1
                    
                    if job_id:
                        import_record = ImportedRepository(
                            repository_id=existing.id if existing else None,
                            job_id=job_id,
                            source_type='csv',
                            source_url=repo_data['url'],
                            import_status='success'
                        )
                        self.db.add(import_record)
                except Exception as e:
                    logger.error(f"Failed to import CSV row: {str(e)}")
                    failed += 1
            
            self.db.commit()
            return {'imported': imported, 'failed': failed}
        except Exception as e:
            logger.error(f"CSV import failed: {str(e)}")
            return {'imported': 0, 'failed': 1, 'error': str(e)}
    
    # ============ Helper Methods ============
    
    def _extract_github_repo_data(self, repo: Dict[str, Any]) -> Dict[str, Any]:
        """Extract repository data from GitHub API response"""
        return {
            'name': repo['name'],
            'url': repo['html_url'],
            'description': repo.get('description', ''),
            'stars': repo.get('stargazers_count', 0),
            'language': repo.get('language'),
            'category': 'other'
        }
    
    def _extract_from_feed_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Extract repo info from feed URL - tries to parse GitHub/GitLab URLs"""
        try:
            # Handle common repo URL patterns
            if 'github.com' in url:
                parts = url.rstrip('/').split('/')
                if len(parts) >= 2:
                    return {
                        'name': parts[-1],
                        'url': url,
                        'description': '',
                        'stars': 0,
                        'language': None,
                        'category': 'other'
                    }
            elif 'gitlab.com' in url:
                parts = url.rstrip('/').split('/')
                if len(parts) >= 2:
                    return {
                        'name': parts[-1],
                        'url': url,
                        'description': '',
                        'stars': 0,
                        'language': None,
                        'category': 'other'
                    }
        except Exception as e:
            logger.error(f"Failed to extract from URL {url}: {str(e)}")
        
        return None
    
    def create_import_source(self, user_id: int, source_type: str, source_name: str, source_config: Dict[str, Any]) -> ImportSource:
        """Create a new import source configuration"""
        source = ImportSource(
            user_id=user_id,
            source_type=source_type,
            source_name=source_name,
            source_config=source_config
        )
        self.db.add(source)
        self.db.commit()
        return source
    
    def list_import_sources(self, user_id: int) -> List[ImportSource]:
        """List all import sources for a user"""
        return self.db.query(ImportSource).filter_by(user_id=user_id).all()
    
    def get_import_source(self, source_id: int, user_id: int) -> Optional[ImportSource]:
        """Get import source by ID"""
        return self.db.query(ImportSource).filter(
            and_(ImportSource.id == source_id, ImportSource.user_id == user_id)
        ).first()
    
    def delete_import_source(self, source_id: int, user_id: int) -> bool:
        """Delete import source"""
        source = self.get_import_source(source_id, user_id)
        if source:
            self.db.delete(source)
            self.db.commit()
            return True
        return False
    
    def create_import_job(self, user_id: int, source_id: Optional[int], source_type: str) -> ImportJob:
        """Create a new import job"""
        job = ImportJob(
            user_id=user_id,
            source_id=source_id,
            source_type=source_type,
            status='pending',
            created_at=datetime.utcnow()
        )
        self.db.add(job)
        self.db.commit()
        return job
    
    def get_import_job(self, job_id: int, user_id: int) -> Optional[ImportJob]:
        """Get import job details"""
        return self.db.query(ImportJob).filter(
            and_(ImportJob.id == job_id, ImportJob.user_id == user_id)
        ).first()
    
    def list_import_jobs(self, user_id: int, limit: int = 20) -> List[ImportJob]:
        """List recent import jobs for user"""
        return self.db.query(ImportJob).filter_by(user_id=user_id).order_by(
            ImportJob.created_at.desc()
        ).limit(limit).all()
    
    def update_job_status(self, job_id: int, status: str, total: int = 0, imported: int = 0, failed: int = 0, error: str = None):
        """Update import job status"""
        job = self.db.query(ImportJob).filter_by(id=job_id).first()
        if job:
            job.status = status
            job.total_repositories = total
            job.imported_repositories = imported
            job.failed_repositories = failed
            if error:
                job.error_message = error
            if status == 'running':
                job.started_at = datetime.utcnow()
            elif status == 'completed' or status == 'failed':
                job.completed_at = datetime.utcnow()
            self.db.commit()
