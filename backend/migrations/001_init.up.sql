-- ------------------------------------
-- Migration 001 — Full Initial Schema
-- ------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id            SERIAL      PRIMARY KEY,
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id      SERIAL  PRIMARY KEY,
    name    TEXT    NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (name, user_id)   -- same name allowed for different users
);

CREATE TABLE IF NOT EXISTS expenses (
    id          SERIAL          PRIMARY KEY,
    amount      NUMERIC(12, 2)  NOT NULL CHECK (amount > 0),
    description TEXT,
    category_id INTEGER         NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    user_id     INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_created_at  ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_id     ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id   ON categories(user_id);
