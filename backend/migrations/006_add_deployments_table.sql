-- Migration 6: Add deployments table for Docker-based deployment tracking

CREATE TABLE IF NOT EXISTS deployments (
    id SERIAL PRIMARY KEY,
    repository_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    repo_name VARCHAR(255) NOT NULL,
    stack VARCHAR(50) NOT NULL,
    confidence_score FLOAT DEFAULT 0.0,
    assigned_port INTEGER UNIQUE NOT NULL,
    domain VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending',
    docker_path VARCHAR(500),
    dockerfile_content TEXT,
    compose_content TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,
    container_id VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deployments_repo ON deployments(repository_id);
CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status);
CREATE INDEX IF NOT EXISTS idx_deployments_port ON deployments(assigned_port);
