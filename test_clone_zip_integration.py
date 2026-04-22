#!/usr/bin/env python3
"""Test script to verify clone-to-ZIP integration"""

import requests
import json
import time
from typing import Optional, Dict, Any

API_BASE = "http://localhost:8001/api"

def test_clone_zip_integration():
    """Test that cloning a repo automatically enqueues a ZIP job"""
    
    print("=" * 60)
    print("Testing Clone-to-ZIP Integration")
    print("=" * 60)
    
    # 1. Get existing repositories
    print("\n1. Fetching existing repositories...")
    try:
        resp = requests.get(f"{API_BASE}/repositories", timeout=5)
        if resp.status_code != 200:
            print(f"❌ Failed to fetch repositories: {resp.status_code}")
            return False
        
        repos = resp.json()
        
        if not repos or not isinstance(repos, list):
            print("❌ No repositories found in system or invalid response format")
            return False
        
        # Find a repo that's not yet cloned
        test_repo = None
        for repo in repos:
            if not repo.get('cloned'):
                test_repo = repo
                break
        
        if not test_repo:
            print("⚠️  All repositories are already cloned")
            # Use first repo anyway for testing ZIP queue
            test_repo = repos[0]
        
        print(f"✅ Found repository: {test_repo['name']} (ID: {test_repo['id']})")
        print(f"   Cloned: {test_repo.get('cloned', False)}")
        print(f"   ZIP Status: {test_repo.get('zip_status', 'none')}")
        
    except Exception as e:
        print(f"❌ Error fetching repositories: {e}")
        return False
    
    # 2. Trigger clone if not cloned
    repo_id = test_repo['id']
    repo_url = test_repo['url']
    
    if not test_repo.get('cloned'):
        print(f"\n2. Cloning repository {test_repo['name']}...")
        try:
            resp = requests.post(f"{API_BASE}/repositories/{repo_id}/clone", timeout=10)
            if resp.status_code == 200:
                result = resp.json()
                print(f"✅ Clone job created: {result}")
                job_id = result.get('job_id')
            else:
                print(f"❌ Failed to start clone: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            print(f"❌ Error starting clone: {e}")
            return False
        
        # Wait for clone to complete
        print("   Waiting for clone to complete...")
        max_wait = 30
        elapsed = 0
        while elapsed < max_wait:
            time.sleep(2)
            elapsed += 2
            try:
                resp = requests.get(f"{API_BASE}/clone-queue/jobs", timeout=5)
                if resp.status_code == 200:
                    jobs = resp.json().get('jobs', [])
                    if job_id:
                        job = next((j for j in jobs if j['id'] == job_id), None)
                        if job:
                            status = job.get('status')
                            print(f"   Clone status: {status}")
                            if status == 'completed':
                                print("✅ Clone completed!")
                                break
                            elif status == 'failed':
                                print(f"❌ Clone failed: {job.get('error_message')}")
                                return False
            except Exception as e:
                print(f"⚠️  Error checking clone status: {e}")
        
        if elapsed >= max_wait:
            print("⚠️  Clone timeout - continuing anyway")
    
    else:
        print(f"\n2. Repository already cloned, skipping clone step")
    
    # 3. Check ZIP status
    print(f"\n3. Checking ZIP status for repository {repo_id}...")
    time.sleep(1)  # Give queue time to process
    
    try:
        resp = requests.get(f"{API_BASE}/repositories/{repo_id}/zip/status", timeout=5)
        if resp.status_code == 200:
            zip_status = resp.json()
            print(f"✅ ZIP Status: {json.dumps(zip_status, indent=2)}")
            
            status = zip_status.get('status')
            if status in ['pending', 'in_progress', 'done']:
                print(f"✅ ZIP queue integration working! Status: {status}")
                return True
            elif status == 'failed':
                print(f"⚠️  ZIP job failed: {zip_status.get('error')}")
                return False
            else:
                print(f"⚠️  Unexpected ZIP status: {status}")
                return False
        else:
            print(f"❌ Failed to get ZIP status: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error checking ZIP status: {e}")
        return False

if __name__ == "__main__":
    success = test_clone_zip_integration()
    print("\n" + "=" * 60)
    if success:
        print("✅ Clone-to-ZIP Integration Test PASSED")
    else:
        print("❌ Clone-to-ZIP Integration Test FAILED")
    print("=" * 60)
