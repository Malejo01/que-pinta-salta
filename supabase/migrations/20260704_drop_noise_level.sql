-- Migration: Drop noise_level column from events table
-- This field is no longer used in the application UI or backend logic.

ALTER TABLE events DROP COLUMN IF EXISTS noise_level;
