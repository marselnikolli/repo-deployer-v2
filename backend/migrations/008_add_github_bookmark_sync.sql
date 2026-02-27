-- Add GitHub bookmark sync fields to users table
ALTER TABLE users ADD COLUMN github_token VARCHAR(500) NULL UNIQUE;
ALTER TABLE users ADD COLUMN github_username VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN git_bookmark_repo_created BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN last_bookmark_sync DATETIME NULL;
ALTER TABLE users ADD COLUMN bookmark_sync_status VARCHAR(50) DEFAULT 'pending';

-- Create index for bookmark sync tracking
CREATE INDEX idx_users_bookmark_sync ON users(id, last_bookmark_sync);
