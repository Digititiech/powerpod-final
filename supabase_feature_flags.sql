-- Add per-user feature flags to profiles table
-- This enables admins to toggle features ON/OFF per identity

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'profiles'
      AND column_name = 'feature_flags'
  ) THEN
    ALTER TABLE profiles ADD COLUMN feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'feature_flags';

