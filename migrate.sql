-- ============================================================
-- Hey Nomads — Safe Migration (ALTER TABLE, preserves data)
-- Run this in MySQL Workbench 8.0 against hey_roomie database
-- ============================================================

USE hey_roomie;

-- ── USERS TABLE ──────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gender      VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS age         INT DEFAULT NULL;

-- ── PROFILES TABLE ───────────────────────────────────────────
-- Core info columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bio            TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS occupation     VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS city           VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profile_image  VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_verified    BOOLEAN DEFAULT FALSE;

-- Budget extended
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS deposit        INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS flat_type      ENUM('1BHK','2BHK','3BHK','shared','studio','other') DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS occupants      INT DEFAULT 1;

-- Lifestyle traits (new enum/int columns)
-- NOTE: noise_tolerance kept compatible (quiet/moderate/loud maps to 1-3)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS smoking        ENUM('yes','no') DEFAULT 'no',
  ADD COLUMN IF NOT EXISTS drinking       ENUM('yes','no') DEFAULT 'no',
  ADD COLUMN IF NOT EXISTS partying       ENUM('low','medium','high') DEFAULT 'low';

-- Fix noise_tolerance if it's stored as text — add numeric alias
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS noise_level    INT DEFAULT 3  COMMENT '1=quiet 3=moderate 5=loud';

-- Fix diet enum to include vegan
ALTER TABLE profiles
  MODIFY COLUMN diet ENUM('veg','nonveg','eggetarian','vegan') NOT NULL DEFAULT 'veg';

-- Fix sleep_time enum to just early/late (flexible kept for compat)
-- already: ENUM('early', 'late', 'flexible') — no change needed

-- Fix tax_bracket to allow NULL safely
ALTER TABLE profiles
  MODIFY COLUMN tax_bracket ENUM('low', 'medium', 'high') DEFAULT 'medium';

-- ── PREFERENCES TABLE ────────────────────────────────────────
ALTER TABLE preferences
  ADD COLUMN IF NOT EXISTS preferred_gender           VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_budget_min       INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_budget_max       INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS preferred_location_radius  INT DEFAULT 10  COMMENT 'km',
  ADD COLUMN IF NOT EXISTS prefers_smoking            ENUM('yes','no','no_preference') DEFAULT 'no_preference',
  ADD COLUMN IF NOT EXISTS prefers_drinking           ENUM('yes','no','no_preference') DEFAULT 'no_preference',
  ADD COLUMN IF NOT EXISTS prefers_cleanliness_min    INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS prefers_sleep_schedule     ENUM('early','late','flexible','no_preference') DEFAULT 'no_preference';

-- ── VERIFY COLUMNS ───────────────────────────────────────────
SELECT 'Migration complete' AS status;
SHOW COLUMNS FROM profiles;
SHOW COLUMNS FROM preferences;
SHOW COLUMNS FROM users;
