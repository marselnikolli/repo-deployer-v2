-- Import Sources and tracking for Feature #8: Import Sources Expansion
-- Created: 2026-02-05

CREATE TABLE IF NOT EXISTS import_sources (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    source_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    last_import_at TIMESTAMP WITH TIME ZONE,
    import_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_id INTEGER REFERENCES import_sources(id) ON DELETE SET NULL,
    source_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    total_repositories INTEGER DEFAULT 0,
    imported_repositories INTEGER DEFAULT 0,
    failed_repositories INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS imported_repositories (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
    job_id INTEGER REFERENCES import_jobs(id) ON DELETE CASCADE,
    source_type VARCHAR(50) NOT NULL,
    source_url VARCHAR(512) NOT NULL,
    import_status VARCHAR(50) DEFAULT 'success',
    error_message TEXT,
    imported_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_sources_user_id ON import_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_import_sources_source_type ON import_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_id ON import_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_source_type ON import_jobs(source_type);
CREATE INDEX IF NOT EXISTS idx_imported_repositories_job_id ON imported_repositories(job_id);
CREATE INDEX IF NOT EXISTS idx_imported_repositories_repository_id ON imported_repositories(repository_id);
