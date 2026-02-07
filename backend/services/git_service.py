"""Git operations"""

from git import Repo, GitCommandError
from pathlib import Path
import os
import subprocess
import shutil
from threading import Thread
import requests
import zipfile
import re
import logging

logger = logging.getLogger(__name__)


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Parse GitHub URL to extract owner and repository name
    
    Args:
        url: GitHub repository URL (https://github.com/owner/repo or git@github.com:owner/repo.git)
        
    Returns:
        Tuple of (owner, repo)
    """
    # Remove .git suffix if present
    url = url.rstrip('/')
    if url.endswith('.git'):
        url = url[:-4]
    
    # Extract from https URL
    https_match = re.search(r'github\.com/([^/]+)/([^/]+)', url)
    if https_match:
        return https_match.group(1), https_match.group(2)
    
    # Extract from git@github.com URL
    ssh_match = re.search(r'git@github\.com:([^/]+)/([^/]+)', url)
    if ssh_match:
        return ssh_match.group(1), ssh_match.group(2)
    
    raise ValueError(f"Invalid GitHub URL: {url}")


def get_default_branch(url: str) -> str:
    """
    Get the default branch of a GitHub repository
    
    Args:
        url: GitHub repository URL
        
    Returns:
        Default branch name (usually 'main' or 'master')
    """
    try:
        owner, repo = parse_github_url(url)
        api_url = f"https://api.github.com/repos/{owner}/{repo}"
        response = requests.get(api_url, timeout=10)
        if response.status_code == 200:
            return response.json().get('default_branch', 'main')
    except Exception as e:
        logger.warning(f"Could not determine default branch: {e}, using 'main'")
    
    return 'main'


def download_repo_as_zip(url: str, path: str, timeout_seconds: int = 300) -> bool:
    """
    Download repository as ZIP file from GitHub and store it
    
    Args:
        url: GitHub repository URL
        path: Target path to store the ZIP file
        timeout_seconds: Download timeout in seconds
        
    Returns:
        True if successful, False otherwise
    """
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        
        # Check if path already exists
        if os.path.exists(path):
            print(f"Path {path} already exists, removing it first", flush=True)
            os.remove(path) if os.path.isfile(path) else shutil.rmtree(path)
        
        try:
            # Parse GitHub URL
            owner, repo = parse_github_url(url)
            
            # Get default branch
            default_branch = get_default_branch(url)
            
            # Download URL for GitHub repository archive
            download_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{default_branch}.zip"
            
            print(f"Downloading repository as ZIP: {download_url}", flush=True)
            
            # Download the ZIP file
            response = requests.get(download_url, timeout=timeout_seconds, stream=True)
            
            if response.status_code != 200:
                print(f"Failed to download repository: HTTP {response.status_code}", flush=True)
                return False
            
            # Download directly to target path
            with open(path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            
            print(f"ZIP downloaded and stored at {path}", flush=True)
            
            # Extract to temporary location for scanning
            temp_extract_dir = os.path.join(Path(path).parent, f"{repo}_temp_scan")
            os.makedirs(temp_extract_dir, exist_ok=True)
            
            try:
                # Extract ZIP file to temporary location for scanning
                with zipfile.ZipFile(path, 'r') as zip_ref:
                    zip_ref.extractall(temp_extract_dir)
                
                # Find the extracted folder (GitHub archive creates repo-branch format)
                extracted_items = os.listdir(temp_extract_dir)
                if len(extracted_items) == 1 and os.path.isdir(os.path.join(temp_extract_dir, extracted_items[0])):
                    scan_path = os.path.join(temp_extract_dir, extracted_items[0])
                else:
                    scan_path = temp_extract_dir
                
                # Scan repository for detection only (guide will be created in clone_repo)
                from services.repository_scanner import RepositoryScanner
                RepositoryScanner.scan_repository(scan_path)
                
                print(f"Repository scanned successfully", flush=True)
                
            except Exception as e:
                print(f"Warning: Failed to scan repository: {e}", flush=True)
                # Don't fail the entire clone if scanning fails
            
            finally:
                # Clean up temporary extraction directory
                if os.path.exists(temp_extract_dir):
                    shutil.rmtree(temp_extract_dir)
            
            return True
            
        except requests.RequestException as e:
            print(f"Error downloading repository: {type(e).__name__}: {e}", flush=True)
            return False
        except zipfile.BadZipFile as e:
            print(f"Invalid ZIP file: {e}", flush=True)
            return False
        except Exception as e:
            print(f"Error processing repository: {type(e).__name__}: {e}", flush=True)
            return False
    
    except Exception as e:
        print(f"Unexpected error in download_repo_as_zip: {type(e).__name__}: {e}", flush=True)
        return False
    
    finally:
        # Clean up partial file if it failed
        if os.path.exists(path):
            try:
                if os.path.getsize(path) == 0:
                    print(f"Cleaning up empty ZIP file at {path}", flush=True)
                    os.remove(path)
            except:
                pass


def clone_repo(url: str, path: str, timeout_seconds: int = 300) -> bool:
    """
    Clone repository as ZIP file in a dedicated folder
    
    Creates structure: /repos/repo-name/repo-name.zip and install-guide.md
    
    Args:
        url: GitHub repository URL
        path: Target path (repos directory where folder will be created)
        timeout_seconds: Download timeout in seconds
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # Parse GitHub URL to get owner and repo name
        if 'github.com' not in url:
            print(f"ZIP download only supported for GitHub repositories", flush=True)
            return False
        
        owner, repo = parse_github_url(url)
        # Use repository name only (not owner-repo) to avoid duplicate folder nesting
        repo_folder_name = repo
        
        # Use provided path as repos root directory
        repos_root = Path(path)
        
        # Create folder for this repository
        repo_folder = repos_root / repo_folder_name
        repo_folder.mkdir(parents=True, exist_ok=True)
        
        # ZIP filename inside repo folder
        zip_filename = f"{repo_folder_name}.zip"
        zip_path = repo_folder / zip_filename
        
        print(f"Cloning to folder: {repo_folder}", flush=True)
        print(f"ZIP path: {zip_path}", flush=True)
        
        # Check if ZIP already exists
        if zip_path.exists():
            print(f"ZIP file already exists, removing: {zip_path}", flush=True)
            os.remove(zip_path)
        
        # Download the repository as ZIP
        success = download_repo_as_zip(url, str(zip_path), timeout_seconds)
        
        if success:
            # Create install guide directly in repo folder
            from services.repository_scanner import RepositoryScanner
            
            # Scan temporarily extracted content
            temp_scan_dir = repo_folder / f".temp_scan"
            temp_scan_dir.mkdir(exist_ok=True)
            
            try:
                with zipfile.ZipFile(str(zip_path), 'r') as zip_ref:
                    zip_ref.extractall(str(temp_scan_dir))
                
                # Find root folder (GitHub creates repo-branch format)
                extracted_items = list(temp_scan_dir.iterdir())
                if len(extracted_items) == 1 and extracted_items[0].is_dir():
                    scan_path = extracted_items[0]
                else:
                    scan_path = temp_scan_dir
                
                # Scan and generate guide
                scan_result = RepositoryScanner.scan_repository(str(scan_path))
                guide_content = RepositoryScanner.generate_install_guide_content(repo_folder_name, scan_result)
                
                # Write install guide directly to repo folder
                guide_path = repo_folder / "install-guide.md"
                with open(guide_path, 'w', encoding='utf-8') as f:
                    f.write(guide_content)
                
                print(f"Created install guide: {guide_path}", flush=True)
                
            except Exception as e:
                print(f"Warning: Failed to generate install guide: {e}", flush=True)
            finally:
                # Clean up temporary scan directory
                if temp_scan_dir.exists():
                    import shutil
                    shutil.rmtree(temp_scan_dir)
            
            print(f"Successfully cloned repository to: {repo_folder}", flush=True)
            return True
        else:
            print(f"Failed to download repository as ZIP", flush=True)
            # Clean up empty folder
            try:
                if repo_folder.exists() and not any(repo_folder.iterdir()):
                    repo_folder.rmdir()
            except:
                pass
            return False
            
    except Exception as e:
        print(f"Unexpected error in clone_repo: {type(e).__name__}: {e}", flush=True)
        return False


def sync_repo(path: str, url: str) -> bool:
    """Update existing repository ZIP file"""
    try:
        # Ensure path ends with .zip for ZIP-based repos
        if not path.endswith('.zip'):
            path = path + '.zip' if os.path.isdir(path) else path
        
        if not os.path.exists(path):
            return clone_repo(url, path)
        
        # For ZIP files, re-download to get the latest
        print(f"Re-downloading repository to update ZIP file: {path}", flush=True)
        if os.path.exists(path):
            try:
                os.remove(path)
            except:
                pass
        
        return clone_repo(url, path)
    except Exception as e:
        print(f"Error syncing repository: {e}")
        return False


def get_repo_info(path: str) -> dict:
    """Get repository information from ZIP file"""
    try:
        # Ensure we're looking at a ZIP file
        if not path.endswith('.zip'):
            path = path + '.zip'
        
        if not os.path.exists(path):
            return {"error": "Repository ZIP file not found"}
        
        # Get ZIP file information
        try:
            file_size = os.path.getsize(path)
            file_mtime = os.path.getmtime(path)
            from datetime import datetime
            modified_time = datetime.fromtimestamp(file_mtime).isoformat()
            
            # Get file count inside ZIP
            file_count = 0
            with zipfile.ZipFile(path, 'r') as zipf:
                file_count = len(zipf.namelist())
            
            return {
                "type": "zip-cloned-repository",
                "format": "zip",
                "size": file_size,
                "file_count": file_count,
                "modified": modified_time,
                "path": path
            }
        except zipfile.BadZipFile:
            return {"error": f"Invalid ZIP file: {path}"}
    except Exception as e:
        print(f"Error getting repo info: {e}")
        return {"error": str(e)}
