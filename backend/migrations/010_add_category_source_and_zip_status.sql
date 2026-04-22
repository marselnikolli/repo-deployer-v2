-- Migration 010: Add category_source and zip_status columns to repositories

ALTER TABLE repositories
    ADD COLUMN IF NOT EXISTS category_source VARCHAR(20),
    ADD COLUMN IF NOT EXISTS zip_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS zip_path VARCHAR(512);
