#!/usr/bin/env python3
"""
Migration script: Streamlit v1.0 JSON → FastAPI v2.0 PostgreSQL
Migrates repository data from old JSON format to new PostgreSQL database
"""

import json
import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from models import Base, Repository
from database import DATABASE_URL


def migrate_data():
    """Migrate data from JSON to PostgreSQL"""
    
    # Read old JSON database
    old_db_path = '../repo-deployer/repo_db.json'
    
    if not os.path.exists(old_db_path):
        print(f"❌ Old database not found at {old_db_path}")
        print("Please ensure the Streamlit v1.0 database exists.")
        return False
    
    try:
        with open(old_db_path, 'r') as f:
            old_repos = json.load(f)
    except Exception as e:
        print(f"❌ Failed to read old database: {e}")
        return False
    
    print(f"✅ Read {len(old_repos)} repositories from old database")
    
    # Create engine and session
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        migrated = 0
        
        for repo_name, repo_data in old_repos.items():
            # Check if already exists
            existing = session.query(Repository).filter(
                Repository.name == repo_name
            ).first()
            
            if existing:
                print(f"⏭️  Skipping {repo_name} (already exists)")
                continue
            
            # Create new repository
            new_repo = Repository(
                name=repo_name,
                url=repo_data.get('url', ''),
                title=repo_data.get('title', ''),
                description=repo_data.get('description'),
                category=repo_data.get('category', 'other'),
                path=repo_data.get('path'),
                cloned=False,
                deployed=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            session.add(new_repo)
            migrated += 1
            
            if migrated % 100 == 0:
                print(f"📦 Migrated {migrated} repositories...")
        
        # Commit all changes
        session.commit()
        print(f"\n✅ Successfully migrated {migrated} repositories to PostgreSQL!")
        
        # Verify
        total = session.query(Repository).count()
        print(f"📊 Total repositories in database: {total}")
        
        return True
    
    except Exception as e:
        session.rollback()
        print(f"❌ Migration failed: {e}")
        return False
    
    finally:
        session.close()


if __name__ == '__main__':
    print("🔄 Starting migration from JSON to PostgreSQL...")
    print(f"   Database: {DATABASE_URL}")
    print()
    
    success = migrate_data()
    sys.exit(0 if success else 1)
