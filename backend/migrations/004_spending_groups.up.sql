CREATE TABLE IF NOT EXISTS spending_groups (
    id          SERIAL  PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    category_ids INTEGER[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_spending_groups_user_id ON spending_groups(user_id);
