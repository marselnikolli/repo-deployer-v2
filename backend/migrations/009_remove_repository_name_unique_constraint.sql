-- Remove unique constraint from repository name to allow same names from different owners
-- URL is the true unique identifier for repositories

BEGIN;

-- Drop the unique index on the name column
DROP INDEX IF EXISTS ix_repositories_name;

-- Create a regular (non-unique) index on the name column for query performance
CREATE INDEX ix_repositories_name ON repositories(name);

COMMIT;
