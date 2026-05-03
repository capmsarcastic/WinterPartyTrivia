-- ============================================================
-- Winter Party Trivia — Database Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- TABLES
-- ============================================================

-- Single-row event configuration
CREATE TABLE event_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    team_creation_enabled BOOLEAN NOT NULL DEFAULT true,
    branding_json JSONB NOT NULL DEFAULT '{}',
    push_destination JSONB,  -- { page, data, pushed_at } — admin push nav
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
);

-- Teams
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    image_id TEXT NOT NULL DEFAULT 'whale',
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'deleted')),
    creator_name TEXT,
    rejection_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Team passcodes stored separately — service role access only
CREATE TABLE team_passcodes (
    team_id UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    passcode TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Players
CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    device_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'kicked', 'left')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rounds
CREATE TABLE rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "order" INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    points_per_correct NUMERIC NOT NULL DEFAULT 1,
    lifecycle_state TEXT NOT NULL DEFAULT 'draft'
        CHECK (lifecycle_state IN ('draft', 'open', 'locked', 'marked', 'revealed')),
    display_questions_in_app BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Questions
CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    "order" INTEGER NOT NULL,
    prompt_text TEXT,
    prompt_image_url TEXT,
    input_type TEXT NOT NULL
        CHECK (input_type IN ('multiple_choice', 'free_text', 'numeric')),
    input_config_json JSONB NOT NULL DEFAULT '{}',
    correct_answer_json JSONB,
    marking_notes TEXT,
    points NUMERIC,  -- overrides round points_per_correct when set
    multi_input BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Live draft answers (real-time team collaboration)
CREATE TABLE drafts (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    value_json JSONB NOT NULL DEFAULT '{}',
    last_editor_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    last_editor_name TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, question_id)
);

-- Locked submissions (snapshot when round closes)
CREATE TABLE submissions (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    value_json JSONB NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    auto_submitted BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (team_id, question_id)
);

-- Marks allocated per question per team
CREATE TABLE marks (
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    points_awarded NUMERIC NOT NULL DEFAULT 0,
    admin_note TEXT,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, question_id)
);

-- Score events — the true record of points awarded
CREATE TABLE score_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    points NUMERIC NOT NULL,
    note TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    round_id UUID REFERENCES rounds(id) ON DELETE SET NULL,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages (admin broadcasts, team/player targeted, player→admin)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_admin BOOLEAN NOT NULL DEFAULT false,
    from_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    from_player_name TEXT,
    target_type TEXT NOT NULL
        CHECK (target_type IN ('broadcast', 'team', 'player', 'admin')),
    target_id TEXT,  -- team_id or player_id; NULL for broadcast/admin
    body TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read BOOLEAN NOT NULL DEFAULT false
);

-- Activity log (audit trail)
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'player', 'system')),
    actor_id TEXT,
    actor_name TEXT,
    payload_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preset team images (emoji-based; author adds office-specific ones)
CREATE TABLE image_presets (
    id TEXT PRIMARY KEY,
    emoji TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    display_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_teams_status ON teams(status);
CREATE INDEX idx_players_device_id ON players(device_id);
CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_players_status ON players(status);
CREATE INDEX idx_rounds_order ON rounds("order");
CREATE INDEX idx_rounds_lifecycle ON rounds(lifecycle_state);
CREATE INDEX idx_questions_round_id ON questions(round_id);
CREATE INDEX idx_questions_order ON questions(round_id, "order");
CREATE INDEX idx_drafts_team_id ON drafts(team_id);
CREATE INDEX idx_submissions_team_id ON submissions(team_id);
CREATE INDEX idx_marks_team_id ON marks(team_id);
CREATE INDEX idx_score_events_team_id ON score_events(team_id);
CREATE INDEX idx_score_events_awarded ON score_events(awarded_at DESC);
CREATE INDEX idx_messages_target ON messages(target_type, target_id);
CREATE INDEX idx_messages_sent ON messages(sent_at DESC);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE event_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_passcodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_presets ENABLE ROW LEVEL SECURITY;

-- event_config: anyone can read the event state
CREATE POLICY "public_read_event_config"
    ON event_config FOR SELECT TO anon USING (true);

-- teams: anon can read pending and approved (passcode is in separate table)
CREATE POLICY "public_read_teams"
    ON teams FOR SELECT TO anon
    USING (status IN ('pending', 'approved'));

-- team_passcodes: no anon access — service role key only
-- (no policy = no access for anon)

-- players: anon can read active players
CREATE POLICY "public_read_players"
    ON players FOR SELECT TO anon
    USING (status = 'active');

-- rounds: anon can read non-draft rounds
CREATE POLICY "public_read_rounds"
    ON rounds FOR SELECT TO anon
    USING (lifecycle_state != 'draft');

-- questions: anon can read questions when their round is not draft
CREATE POLICY "public_read_questions"
    ON questions FOR SELECT TO anon
    USING (
        round_id IN (
            SELECT id FROM rounds WHERE lifecycle_state != 'draft'
        )
    );

-- drafts: anon can read all (live collaboration — all team members see edits)
CREATE POLICY "public_read_drafts"
    ON drafts FOR SELECT TO anon USING (true);

-- submissions: anon can read all
CREATE POLICY "public_read_submissions"
    ON submissions FOR SELECT TO anon USING (true);

-- marks: anon can read marks only when the round is revealed
CREATE POLICY "public_read_marks"
    ON marks FOR SELECT TO anon
    USING (
        question_id IN (
            SELECT q.id FROM questions q
            JOIN rounds r ON r.id = q.round_id
            WHERE r.lifecycle_state = 'revealed'
        )
    );

-- score_events: anon can read all score events
CREATE POLICY "public_read_score_events"
    ON score_events FOR SELECT TO anon USING (true);

-- messages: anon can read broadcast and team/player-targeted messages
CREATE POLICY "public_read_messages"
    ON messages FOR SELECT TO anon
    USING (target_type IN ('broadcast', 'team', 'player'));

-- activity_log: service role only (no anon policy)

-- image_presets: anon can read active presets
CREATE POLICY "public_read_image_presets"
    ON image_presets FOR SELECT TO anon
    USING (is_active = true);

-- ============================================================
-- REALTIME PUBLICATIONS
-- ============================================================

-- Note: if you get "already exists" errors for any of these,
-- those tables are already in the publication — safe to skip.

ALTER PUBLICATION supabase_realtime ADD TABLE event_config;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE questions;
ALTER PUBLICATION supabase_realtime ADD TABLE drafts;
ALTER PUBLICATION supabase_realtime ADD TABLE submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE marks;
ALTER PUBLICATION supabase_realtime ADD TABLE score_events;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- ============================================================
-- SEED DATA
-- ============================================================

INSERT INTO event_config (id, team_creation_enabled, branding_json)
VALUES (
    1,
    true,
    '{"appName": "Winter Trivia Night", "subtitle": "The Deep End of Knowledge"}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO image_presets (id, emoji, category, display_name) VALUES
-- Ocean
('whale',      '🐋', 'Ocean',   'Blue Whale'),
('dolphin',    '🐬', 'Ocean',   'Dolphin'),
('octopus',    '🐙', 'Ocean',   'Octopus'),
('shark',      '🦈', 'Ocean',   'Shark'),
('fish',       '🐟', 'Ocean',   'Fish'),
('crab',       '🦀', 'Ocean',   'Crab'),
('lobster',    '🦞', 'Ocean',   'Lobster'),
('turtle',     '🐢', 'Ocean',   'Sea Turtle'),
('seahorse',   '🦄', 'Ocean',   'Sea Horse'),
('jellyfish',  '🪼', 'Ocean',   'Jellyfish'),
-- Animals
('penguin',    '🐧', 'Animals', 'Penguin'),
('bear',       '🐻', 'Animals', 'Bear'),
('fox',        '🦊', 'Animals', 'Fox'),
('wolf',       '🐺', 'Animals', 'Wolf'),
('eagle',      '🦅', 'Animals', 'Eagle'),
('owl',        '🦉', 'Animals', 'Owl'),
('lion',       '🦁', 'Animals', 'Lion'),
('tiger',      '🐯', 'Animals', 'Tiger'),
('koala',      '🐨', 'Animals', 'Koala'),
('kangaroo',   '🦘', 'Animals', 'Kangaroo'),
-- Fantasy
('dragon',     '🐉', 'Fantasy', 'Dragon'),
('unicorn',    '🦄', 'Fantasy', 'Unicorn'),
('alien',      '👽', 'Fantasy', 'Alien'),
('ghost',      '👻', 'Fantasy', 'Ghost'),
('wizard',     '🧙', 'Fantasy', 'Wizard'),
-- Space
('rocket',     '🚀', 'Space',   'Rocket'),
('astronaut',  '👨‍🚀', 'Space', 'Astronaut'),
('comet',      '☄️', 'Space',   'Comet'),
('planet',     '🪐', 'Space',   'Planet'),
('star',       '⭐', 'Space',   'Star'),
-- Nature
('lightning',  '⚡', 'Nature',  'Lightning'),
('fire',       '🔥', 'Nature',  'Fire'),
('snowflake',  '❄️', 'Nature',  'Snowflake'),
('mountain',   '⛰️', 'Nature',  'Mountain'),
('volcano',    '🌋', 'Nature',  'Volcano'),
-- Objects
('trophy',     '🏆', 'Objects', 'Trophy'),
('crown',      '👑', 'Objects', 'Crown'),
('brain',      '🧠', 'Objects', 'Brain'),
('gem',        '💎', 'Objects', 'Diamond'),
('bomb',       '💣', 'Objects', 'Bomb')
ON CONFLICT (id) DO NOTHING;
