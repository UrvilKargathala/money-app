-- 007: user-created secure-note templates (starters, stored as plaintext;
-- content is encrypted only once instantiated into a secure note).
CREATE TABLE IF NOT EXISTS note_user_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_note_user_templates_user_title UNIQUE (user_id, title)
);
CREATE INDEX IF NOT EXISTS idx_note_user_templates_user
    ON note_user_templates(user_id, title);
