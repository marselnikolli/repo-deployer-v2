-- Migration 011: Add search history and saved searches tables

CREATE TABLE IF NOT EXISTS search_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    query VARCHAR(255),
    language VARCHAR(100),
    min_stars INTEGER,
    max_stars INTEGER,
    health_status VARCHAR(50),
    is_fork BOOLEAN,
    is_archived BOOLEAN,
    category VARCHAR(50),
    updated_after TIMESTAMP,
    updated_before TIMESTAMP,
    sort_by VARCHAR(50) DEFAULT 'name',
    sort_order VARCHAR(10) DEFAULT 'asc',
    results_count INTEGER DEFAULT 0,
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history(searched_at);

CREATE TABLE IF NOT EXISTS saved_searches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(512),
    query VARCHAR(255),
    language VARCHAR(100),
    min_stars INTEGER,
    max_stars INTEGER,
    health_status VARCHAR(50),
    is_fork BOOLEAN,
    is_archived BOOLEAN,
    category VARCHAR(50),
    updated_after TIMESTAMP,
    updated_before TIMESTAMP,
    sort_by VARCHAR(50) DEFAULT 'name',
    sort_order VARCHAR(10) DEFAULT 'asc',
    times_used INTEGER DEFAULT 0,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user_id ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_created_at ON saved_searches(created_at);
