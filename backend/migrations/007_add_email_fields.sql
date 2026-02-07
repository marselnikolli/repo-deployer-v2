-- Migration 007: Add email verification and password reset fields to users table

BEGIN;

-- Add email verification columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token VARCHAR(255) NULL UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMP NULL;

-- Add password reset columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255) NULL UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP NULL;

-- Create indexes for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_users_email_verified_at ON users(email_verified_at);

COMMIT;
