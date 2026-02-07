-- Migration: Remove signal/pricemarker features
-- Date: 2026-02-07
-- Description: Removes BUY/SELL signal (pricemarker) drawing type from the platform.
--              The Quick Signals panel and Signal toolbar button have been removed from the UI.

-- Clean up any existing pricemarker drawings stored in the broadcasts/drawings tables
-- (if they exist in the database rather than just localStorage)

-- If there's a drawings table with a type column, remove pricemarker entries:
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'drawings'
  ) THEN
    DELETE FROM drawings WHERE type = 'pricemarker';
  END IF;
END $$;

-- If there's a broadcast_drawings table, clean those too:
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_name = 'broadcast_drawings'
  ) THEN
    DELETE FROM broadcast_drawings WHERE type = 'pricemarker';
  END IF;
END $$;
