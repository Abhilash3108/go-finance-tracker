-- ------------------------------------
-- Migration 002 — Refresh Token Revocation
--
-- Stores a SHA-256 hash of the current valid refresh token per user.
-- On logout the hash is cleared. On /refresh the incoming token's hash
-- must match before a new pair is issued (rotation). This means a stolen
-- refresh token is revoked the moment the legitimate user refreshes or
-- logs out.
-- ------------------------------------

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
    ADD COLUMN IF NOT EXISTS refresh_token_exp  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_refresh_token_hash ON users(refresh_token_hash)
    WHERE refresh_token_hash IS NOT NULL;
