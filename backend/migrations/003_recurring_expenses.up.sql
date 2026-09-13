-- Migration 003: recurring expenses template table
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id          SERIAL         PRIMARY KEY,
    amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description TEXT           NOT NULL DEFAULT '',
    category_id INTEGER        NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    user_id     INTEGER        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_user_id     ON recurring_expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_category_id ON recurring_expenses(category_id);
