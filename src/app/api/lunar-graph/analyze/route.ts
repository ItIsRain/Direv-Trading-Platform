// API Route: Run Analysis
// Executes all 3 fraud detection agents in parallel

import { NextRequest, NextResponse } from 'next/server';
import { buildKnowledgeGraph } from '@/lib/lunar-graph/graph-builder';
import { runAgentAlpha } from '@/lib/lunar-graph/agent-alpha';
import { runAgentBeta } from '@/lib/lunar-graph/agent-beta';
import { runAgentGamma } from '@/lib/lunar-graph/agent-gamma';
import {
  AnalyzeResponse,
  CombinedAnalysis,
  FraudRing,
  LunarAlert,
  AgentAnalysis,
  FraudSeverity,
} from '@/types/lunar-graph';
import { v4 as uuidv4 } from 'uuid';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function getSeverityFromScore(score: number): FraudSeverity {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function generateAlerts(
  fraudRings: FraudRing[],
  analyses: AgentAnalysis[]
): LunarAlert[] {
  const alerts: LunarAlert[] = [];

  // Create alerts from fraud rings
  for (const ring of fraudRings) {
    alerts.push({
      id: uuidv4(),
      type: 'new_fraud_ring',
      severity: ring.severity,
      title: `New Fraud Ring Detected: ${ring.name}`,
      description: ring.aiSummary || `${ring.type.replace('_', ' ')} involving ${ring.entities.length} entities`,
      entities: ring.entities,
      fraudRingId: ring.id,
      acknowledged: false,
      aiExplanation: ring.aiSummary,
      createdAt: new Date().toISOString(),
    });
  }

  // Create alerts from critical/high findings
  for (const analysis of analyses) {
    for (const finding of analysis.findings.filter(f => f.severity === 'critical' || f.severity === 'high')) {
      alerts.push({
        id: uuidv4(),
        type: 'pattern_detected',
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        entities: finding.entities,
        acknowledged: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

async function saveFraudRings(rings: FraudRing[]): Promise<void> {
  if (!isSupabaseConfigured() || rings.length === 0) return;

  try {
    // Get existing fraud rings to check for duplicates
    const { data: existingRings } = await db
      .from('fraud_rings')
      .select('id, entities, type');

    const existingEntitiesSet = new Set(
      (existingRings || []).map((r: any) => JSON.stringify(r.entities.sort()))
    );

    for (const ring of rings) {
      // Check if ring with same entities already exists
      const entitiesKey = JSON.stringify(ring.entities.sort());
      if (existingEntitiesSet.has(entitiesKey)) {
        console.log(`[API] Skipping duplicate fraud ring: ${ring.name}`);
        continue;
      }

      await db.from('fraud_rings').insert({
        id: ring.id,
        name: ring.name,
        type: ring.type,
        severity: ring.severity,
        confidence: ring.confidence,
        entities: ring.entities,
        exposure: ring.exposure,
        evidence: ring.evidence,
        ai_summary: ring.aiSummary,
        status: ring.status,
      });

      // Add to set to prevent duplicates within same batch
      existingEntitiesSet.add(entitiesKey);
    }
  } catch (error) {
    console.error('[API] Error saving fraud rings:', error);
  }
}

async function saveAlerts(alerts: LunarAlert[]): Promise<void> {
  if (!isSupabaseConfigured() || alerts.length === 0) return;

  try {
    // Get existing alert titles to check for duplicates
    const { data: existingAlerts } = await db
      .from('lunar_alerts')
      .select('title');

    const existingTitles = new Set(
      (existingAlerts || []).map((a: any) => a.title)
    );

    for (const alert of alerts.slice(0, 50)) { // Limit to 50 alerts
      // Skip if alert with same title exists
      if (existingTitles.has(alert.title)) {
        console.log(`[API] Skipping duplicate alert: ${alert.title}`);
        continue;
      }

      await db.from('lunar_alerts').insert({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        entities: alert.entities,
        fraud_ring_id: alert.fraudRingId || null,
        acknowledged: alert.acknowledged,
        ai_explanation: alert.aiExplanation || null,
      });

      // Add to set to prevent duplicates within same batch
      existingTitles.add(alert.title);
    }
  } catch (error) {
    console.error('[API] Error saving alerts:', error);
  }
}

async function saveAgentLogs(analyses: AgentAnalysis[]): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    for (const analysis of analyses) {
      await db.from('agent_analysis_logs').insert({
        agent_type: analysis.agentType,
        agent_name: analysis.agentName,
        status: analysis.status,
        started_at: analysis.startedAt,
        completed_at: analysis.completedAt,
        findings_count: analysis.findings.length,
        critical_count: analysis.findings.filter(f => f.severity === 'critical').length,
        high_count: analysis.findings.filter(f => f.severity === 'high').length,
        summary: analysis.summary,
        metrics: analysis.metrics,
        findings: analysis.findings, // Save full findings as JSONB
      });
    }
  } catch (error) {
    console.error('[API] Error saving agent logs:', error);
  }
}

async function saveGraphSnapshot(graph: any): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    // Count node types
    const nodeDistribution: Record<string, number> = {};
    for (const node of graph.nodes) {
      nodeDistribution[node.type] = (nodeDistribution[node.type] || 0) + 1;
    }

    // Count edge types
    const edgeDistribution: Record<string, number> = {};
    for (const edge of graph.edges) {
      edgeDistribution[edge.type] = (edgeDistribution[edge.type] || 0) + 1;
    }

    await db.from('graph_snapshots').insert({
      total_nodes: graph.stats.totalNodes,
      total_edges: graph.stats.totalEdges,
      fraud_edges: graph.stats.fraudEdges,
      avg_risk_score: graph.stats.avgRiskScore,
      clusters_detected: graph.stats.clusters,
      node_distribution: nodeDistribution,
      edge_distribution: edgeDistribution,
    });
  } catch (error) {
    console.error('[API] Error saving graph snapshot:', error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    console.log('[API] Starting fraud analysis...');
    const startTime = Date.now();

    // Build the graph first
    const graph = await buildKnowledgeGraph();
    console.log(`[API] Graph built in ${Date.now() - startTime}ms`);

    // Run all 3 agents in parallel
    const [alphaResult, betaAnalysis, gammaAnalysis] = await Promise.all([
      runAgentAlpha(graph),
      runAgentBeta(graph),
      runAgentGamma(graph),
    ]);

    console.log(`[API] All agents completed in ${Date.now() - startTime}ms`);

    // Combine results
    const allFraudRings = alphaResult.fraudRings;
    const allAnalyses = [alphaResult.analysis, betaAnalysis, gammaAnalysis];

    // Generate alerts
    const alerts = generateAlerts(allFraudRings, allAnalyses);

    // Calculate overall risk score
    const totalFindings = allAnalyses.reduce((sum, a) => sum + a.findings.length, 0);
    const criticalFindings = allAnalyses.reduce(
      (sum, a) => sum + a.findings.filter(f => f.severity === 'critical').length,
      0
    );
    const highFindings = allAnalyses.reduce(
      (sum, a) => sum + a.findings.filter(f => f.severity === 'high').length,
      0
    );

    const overallRiskScore = Math.min(
      100,
      (criticalFindings * 25) + (highFindings * 10) + (allFraudRings.length * 15) + (graph.stats.fraudEdges * 2)
    );

    // Generate combined summary
    const summary = `Analysis complete. Scanned ${graph.stats.totalNodes} entities and ${graph.stats.totalEdges} connections. ` +
      `Detected ${allFraudRings.length} fraud rings with ${totalFindings} total findings. ` +
      `${criticalFindings} critical and ${highFindings} high-severity issues require attention. ` +
      `Overall risk score: ${overallRiskScore}/100.`;

    const analysis: CombinedAnalysis = {
      timestamp: new Date().toISOString(),
      agents: allAnalyses,
      fraudRings: allFraudRings,
      alerts,
      overallRiskScore,
      summary,
    };

    // Save to database
    await Promise.all([
      saveFraudRings(allFraudRings),
      saveAlerts(alerts),
      saveAgentLogs(allAnalyses),
      saveGraphSnapshot(graph),
    ]).catch(console.error);

    console.log(`[API] Analysis complete: ${allFraudRings.length} rings, ${alerts.length} alerts, risk=${overallRiskScore}`);

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('[API] Error running analysis:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run analysis',
      },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'Analysis API is running' });
}
