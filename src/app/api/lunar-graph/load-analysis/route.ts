// API Route: Load Analysis
// Loads the most recent analysis data from the database

import { NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { CombinedAnalysis, AgentAnalysis, LunarAlert, FraudRing } from '@/types/lunar-graph';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function loadAgentLogs(): Promise<AgentAnalysis[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    // Get the most recent analysis logs (grouped by latest timestamp)
    const { data, error } = await db
      .from('agent_analysis_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) throw error;
    if (!data || data.length === 0) return [];

    // Check if all 3 agents are from the same analysis run (within 1 minute of each other)
    const latestTime = new Date(data[0].created_at).getTime();
    const sameRun = data.filter((log: any) => {
      const logTime = new Date(log.created_at).getTime();
      return Math.abs(latestTime - logTime) < 60000; // 1 minute window
    });

    if (sameRun.length < 3) return []; // Not a complete analysis

    return sameRun.map((log: any) => ({
      agentType: log.agent_type,
      agentName: log.agent_name,
      status: log.status,
      startedAt: log.started_at,
      completedAt: log.completed_at,
      findings: log.findings || [], // Load saved findings
      summary: log.summary || '',
      metrics: log.metrics || {},
    }));
  } catch (err) {
    console.error('[LoadAnalysis] Error loading agent logs:', err);
    return [];
  }
}

async function loadAlerts(): Promise<LunarAlert[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await db
      .from('lunar_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map((alert: any) => ({
      id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      description: alert.description,
      entities: alert.entities || [],
      fraudRingId: alert.fraud_ring_id,
      acknowledged: alert.acknowledged,
      aiExplanation: alert.ai_explanation,
      createdAt: alert.created_at,
    }));
  } catch (err) {
    console.error('[LoadAnalysis] Error loading alerts:', err);
    return [];
  }
}

async function loadFraudRings(): Promise<FraudRing[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await db
      .from('fraud_rings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((ring: any) => ({
      id: ring.id,
      name: ring.name,
      type: ring.type,
      severity: ring.severity,
      confidence: ring.confidence,
      entities: ring.entities || [],
      exposure: ring.exposure || 0,
      evidence: ring.evidence || [],
      aiSummary: ring.ai_summary,
      status: ring.status,
      createdAt: ring.created_at,
    }));
  } catch (err) {
    console.error('[LoadAnalysis] Error loading fraud rings:', err);
    return [];
  }
}

async function loadLatestSnapshot(): Promise<{ riskScore: number; summary: string } | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await db
      .from('graph_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    // Calculate risk score from snapshot data
    const riskScore = Math.min(100, Math.round(
      (data.fraud_edges || 0) * 5 +
      (data.avg_risk_score || 0)
    ));

    const summary = `Last analysis: ${data.total_nodes} entities, ${data.total_edges} connections, ${data.fraud_edges} fraud indicators detected.`;

    return { riskScore, summary };
  } catch (err) {
    console.error('[LoadAnalysis] Error loading snapshot:', err);
    return null;
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    console.log('[LoadAnalysis] Loading saved analysis...');

    const [agents, alerts, fraudRings, snapshot] = await Promise.all([
      loadAgentLogs(),
      loadAlerts(),
      loadFraudRings(),
      loadLatestSnapshot(),
    ]);

    // If no data, return empty
    if (agents.length === 0 && alerts.length === 0 && fraudRings.length === 0) {
      return NextResponse.json({
        success: true,
        hasAnalysis: false,
      });
    }

    const analysis: CombinedAnalysis = {
      timestamp: agents[0]?.completedAt || new Date().toISOString(),
      agents,
      fraudRings,
      alerts,
      overallRiskScore: snapshot?.riskScore || 0,
      summary: snapshot?.summary || `Loaded ${fraudRings.length} fraud rings and ${alerts.length} alerts.`,
    };

    console.log(`[LoadAnalysis] Loaded: ${agents.length} agents, ${alerts.length} alerts, ${fraudRings.length} rings`);

    return NextResponse.json({
      success: true,
      hasAnalysis: true,
      analysis,
      fraudRings,
    });
  } catch (error) {
    console.error('[LoadAnalysis] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load analysis' },
      { status: 500 }
    );
  }
}
