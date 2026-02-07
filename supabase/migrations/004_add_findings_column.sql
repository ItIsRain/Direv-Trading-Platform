-- Migration: 004_add_findings_column.sql
-- Adds findings column to store detailed agent findings

-- Add findings column to agent_analysis_logs
ALTER TABLE agent_analysis_logs
ADD COLUMN IF NOT EXISTS findings JSONB DEFAULT '[]';

-- Add trade_flagged to lunar_alerts type check
-- First drop the existing constraint, then recreate with new value
ALTER TABLE lunar_alerts DROP CONSTRAINT IF EXISTS lunar_alerts_type_check;
ALTER TABLE lunar_alerts ADD CONSTRAINT lunar_alerts_type_check
  CHECK (type IN ('new_fraud_ring', 'risk_escalation', 'pattern_detected', 'entity_flagged', 'threshold_breach', 'trade_flagged'));

-- Comment
COMMENT ON COLUMN agent_analysis_logs.findings IS 'Detailed findings from agent analysis stored as JSONB array';
