-- Migration: Add broadcast_drawings table
-- Date: 2026-02-07
-- Description: Stores partner broadcast drawings so they can be loaded on trade pages.

CREATE TABLE IF NOT EXISTS broadcast_drawings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  drawings JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_live BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast symbol lookups
CREATE INDEX IF NOT EXISTS idx_broadcast_drawings_symbol ON broadcast_drawings(symbol);
CREATE INDEX IF NOT EXISTS idx_broadcast_drawings_is_live ON broadcast_drawings(is_live);

-- Only one active broadcast per symbol
CREATE UNIQUE INDEX IF NOT EXISTS idx_broadcast_drawings_symbol_unique ON broadcast_drawings(symbol);

-- Enable RLS
ALTER TABLE broadcast_drawings ENABLE ROW LEVEL SECURITY;

-- Public read (clients need to fetch drawings)
DROP POLICY IF EXISTS "Allow public read broadcast_drawings" ON broadcast_drawings;
CREATE POLICY "Allow public read broadcast_drawings" ON broadcast_drawings FOR SELECT USING (true);

-- Public insert/update (partner broadcasts drawings)
DROP POLICY IF EXISTS "Allow public insert broadcast_drawings" ON broadcast_drawings;
CREATE POLICY "Allow public insert broadcast_drawings" ON broadcast_drawings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update broadcast_drawings" ON broadcast_drawings;
CREATE POLICY "Allow public update broadcast_drawings" ON broadcast_drawings FOR UPDATE USING (true);
