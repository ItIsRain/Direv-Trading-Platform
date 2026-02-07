-- Migration: Add broadcast_drawings table
-- Date: 2026-02-07
-- Description: Stores partner broadcast drawings per symbol so clients can load them on the trade page.
--              Each symbol has at most one active broadcast (upsert on symbol).

CREATE TABLE IF NOT EXISTS broadcast_drawings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  drawings JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_live BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for filtering live broadcasts quickly
CREATE INDEX IF NOT EXISTS idx_broadcast_drawings_is_live ON broadcast_drawings(is_live);

-- Enable RLS
ALTER TABLE broadcast_drawings ENABLE ROW LEVEL SECURITY;

-- Public read (clients need to fetch partner drawings on the trade page)
DROP POLICY IF EXISTS "Allow public read broadcast_drawings" ON broadcast_drawings;
CREATE POLICY "Allow public read broadcast_drawings" ON broadcast_drawings FOR SELECT USING (true);

-- Public insert (partner creates a broadcast for a new symbol)
DROP POLICY IF EXISTS "Allow public insert broadcast_drawings" ON broadcast_drawings;
CREATE POLICY "Allow public insert broadcast_drawings" ON broadcast_drawings FOR INSERT WITH CHECK (true);

-- Public update (partner updates an existing broadcast for a symbol)
DROP POLICY IF EXISTS "Allow public update broadcast_drawings" ON broadcast_drawings;
CREATE POLICY "Allow public update broadcast_drawings" ON broadcast_drawings FOR UPDATE USING (true);
