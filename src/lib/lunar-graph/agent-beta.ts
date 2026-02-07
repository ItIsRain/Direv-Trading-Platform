// Agent Beta - Temporal Intelligence
// Monitors behavioral changes and patterns over time

import {
  KnowledgeGraph,
  AgentAnalysis,
  AgentFinding,
  FraudSeverity,
} from '@/types/lunar-graph';
import { openRouterClient } from './openrouter-client';
import { v4 as uuidv4 } from 'uuid';

const AGENT_NAME = 'Agent Beta';
const AGENT_TYPE = 'beta';

// ============ TEMPORAL ANALYSIS ============

interface TemporalPattern {
  entityId: string;
  entityLabel: string;
  pattern: 'frequency_spike' | 'behavior_shift' | 'dormant_activation' | 'escalation';
  description: string;
  confidence: number;
  timeWindow: string;
  metrics: Record<string, number>;
  relatedEntityIds?: string[]; // Additional entities involved (e.g., rapid trade IDs)
}

interface TimeSeriesData {
  entityId: string;
  entityLabel: string;
  hourlyActivity: number[];
  dailyActivity: number[];
  weekdayDistribution: number[];
  recentTrend: 'increasing' | 'decreasing' | 'stable';
  avgInterval: number;
  varianceScore: number;
}

// ============ TRADE FREQUENCY ANALYSIS ============

function analyzeTradeFrequency(graph: KnowledgeGraph): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];

  // Group trades by account - include trade ID, symbol for better reporting
  const tradesByAccount: Record<string, Array<{
    id: string;
    timestamp: Date;
    amount: number;
    type: string;
    symbol: string;
    label: string;
  }>> = {};

  for (const node of graph.nodes) {
    if (node.type === 'trade' && node.metadata.timestamp) {
      // Find the connected account
      const edges = graph.edges.filter(e => e.target === node.id && e.type === 'trade_link');
      for (const edge of edges) {
        if (!tradesByAccount[edge.source]) {
          tradesByAccount[edge.source] = [];
        }
        tradesByAccount[edge.source].push({
          id: node.id,
          timestamp: new Date(node.metadata.timestamp),
          amount: node.metadata.amount || 0,
          type: node.metadata.contractType || 'UNKNOWN',
          symbol: node.metadata.symbol || 'Unknown',
          label: node.label,
        });
      }
    }
  }

  // Analyze each account's trading pattern
  for (const [accountId, trades] of Object.entries(tradesByAccount)) {
    if (trades.length < 3) continue;

    // Sort by time
    trades.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Calculate intervals and track which trades are rapid
    const intervals: Array<{ interval: number; tradeA: typeof trades[0]; tradeB: typeof trades[0] }> = [];
    for (let i = 1; i < trades.length; i++) {
      intervals.push({
        interval: trades[i].timestamp.getTime() - trades[i - 1].timestamp.getTime(),
        tradeA: trades[i - 1],
        tradeB: trades[i],
      });
    }

    const avgInterval = intervals.reduce((a, b) => a + b.interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, i) => sum + Math.pow(i.interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Detect frequency spikes (very short intervals) and collect the rapid trades
    const shortIntervalData = intervals.filter(i => i.interval < avgInterval / 3);
    if (shortIntervalData.length >= 2) {
      const accountNode = graph.nodes.find(n => n.id === accountId);

      // Collect unique rapid trade IDs and their descriptions
      const rapidTradeIds = new Set<string>();
      const rapidTradeDescriptions: string[] = [];

      for (const data of shortIntervalData) {
        if (!rapidTradeIds.has(data.tradeA.id)) {
          rapidTradeIds.add(data.tradeA.id);
          rapidTradeDescriptions.push(`$${data.tradeA.amount} ${data.tradeA.type} on ${data.tradeA.symbol}`);
        }
        if (!rapidTradeIds.has(data.tradeB.id)) {
          rapidTradeIds.add(data.tradeB.id);
          rapidTradeDescriptions.push(`$${data.tradeB.amount} ${data.tradeB.type} on ${data.tradeB.symbol}`);
        }
      }

      // Build description with trade details
      const tradeList = rapidTradeDescriptions.slice(0, 5).join(', ');
      const moreCount = rapidTradeDescriptions.length > 5 ? ` +${rapidTradeDescriptions.length - 5} more` : '';

      patterns.push({
        entityId: accountId,
        entityLabel: accountNode?.label || accountId,
        pattern: 'frequency_spike',
        description: `Detected ${shortIntervalData.length} instances of rapid trading (interval < ${Math.round(avgInterval / 3000)}s): ${tradeList}${moreCount}`,
        confidence: Math.min(85, 50 + shortIntervalData.length * 10),
        timeWindow: `Last ${trades.length} trades`,
        metrics: {
          avgIntervalMs: avgInterval,
          shortIntervalCount: shortIntervalData.length,
          stdDevMs: stdDev,
        },
        relatedEntityIds: [...rapidTradeIds],
      });
    }

    // Detect escalation (increasing trade amounts)
    const recentTrades = trades.slice(-5);
    const olderTrades = trades.slice(0, Math.min(5, trades.length - 5));

    if (olderTrades.length > 0 && recentTrades.length > 0) {
      const recentAvg = recentTrades.reduce((sum, t) => sum + t.amount, 0) / recentTrades.length;
      const olderAvg = olderTrades.reduce((sum, t) => sum + t.amount, 0) / olderTrades.length;

      if (recentAvg > olderAvg * 2) {
        const accountNode = graph.nodes.find(n => n.id === accountId);
        patterns.push({
          entityId: accountId,
          entityLabel: accountNode?.label || accountId,
          pattern: 'escalation',
          description: `Trade amounts have increased ${((recentAvg / olderAvg) * 100 - 100).toFixed(0)}% recently`,
          confidence: 70,
          timeWindow: 'Recent vs earlier trades',
          metrics: {
            recentAvgAmount: recentAvg,
            olderAvgAmount: olderAvg,
            increasePercent: ((recentAvg / olderAvg) - 1) * 100,
          },
        });
      }
    }
  }

  return patterns;
}

// ============ BEHAVIOR SHIFT DETECTION ============

function detectBehaviorShifts(graph: KnowledgeGraph): TemporalPattern[] {
  const patterns: TemporalPattern[] = [];

  // Group trades by account and analyze contract type distribution
  const tradesByAccount: Record<string, Array<{ timestamp: Date; type: string; symbol: string }>> = {};

  for (const node of graph.nodes) {
    if (node.type === 'trade' && node.metadata.timestamp) {
      const edges = graph.edges.filter(e => e.target === node.id && e.type === 'trade_link');
      for (const edge of edges) {
        if (!tradesByAccount[edge.source]) {
          tradesByAccount[edge.source] = [];
        }
        tradesByAccount[edge.source].push({
          timestamp: new Date(node.metadata.timestamp),
          type: node.metadata.contractType || 'UNKNOWN',
          symbol: node.metadata.symbol || 'UNKNOWN',
        });
      }
    }
  }

  for (const [accountId, trades] of Object.entries(tradesByAccount)) {
    if (trades.length < 6) continue;

    trades.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const midpoint = Math.floor(trades.length / 2);
    const firstHalf = trades.slice(0, midpoint);
    const secondHalf = trades.slice(midpoint);

    // Calculate CALL ratio for each half
    const firstCallRatio = firstHalf.filter(t => t.type === 'CALL').length / firstHalf.length;
    const secondCallRatio = secondHalf.filter(t => t.type === 'CALL').length / secondHalf.length;

    // Significant shift in trading direction
    if (Math.abs(firstCallRatio - secondCallRatio) > 0.4) {
      const accountNode = graph.nodes.find(n => n.id === accountId);
      const direction = secondCallRatio > firstCallRatio ? 'more bullish' : 'more bearish';

      patterns.push({
        entityId: accountId,
        entityLabel: accountNode?.label || accountId,
        pattern: 'behavior_shift',
        description: `Trading behavior shifted ${direction} (CALL ratio: ${(firstCallRatio * 100).toFixed(0)}% -> ${(secondCallRatio * 100).toFixed(0)}%)`,
        confidence: 65,
        timeWindow: 'Early vs recent trades',
        metrics: {
          firstCallRatio,
          secondCallRatio,
          shift: Math.abs(firstCallRatio - secondCallRatio),
        },
      });
    }

    // Symbol concentration shift
    const firstSymbols = new Set(firstHalf.map(t => t.symbol));
    const secondSymbols = new Set(secondHalf.map(t => t.symbol));

    if (firstSymbols.size >= 3 && secondSymbols.size === 1) {
      const accountNode = graph.nodes.find(n => n.id === accountId);
      patterns.push({
        entityId: accountId,
        entityLabel: accountNode?.label || accountId,
        pattern: 'behavior_shift',
        description: `Narrowed focus from ${firstSymbols.size} symbols to just ${[...secondSymbols][0]}`,
        confidence: 60,
        timeWindow: 'Early vs recent trades',
        metrics: {
          firstSymbolCount: firstSymbols.size,
          secondSymbolCount: secondSymbols.size,
        },
      });
    }
  }

  return patterns;
}

// ============ TIMING SYNCHRONIZATION ============

interface SyncGroup {
  entities: string[];
  syncScore: number;
  avgTimeDelta: number;
  tradeCount: number;
}

function detectTimingSynchronization(graph: KnowledgeGraph): SyncGroup[] {
  const syncGroups: SyncGroup[] = [];

  // Find timing_sync edges
  const timingSyncEdges = graph.edges.filter(e => e.type === 'timing_sync' && e.isFraudIndicator);

  // Group connected entities
  const entityGroups: Record<string, Set<string>> = {};

  for (const edge of timingSyncEdges) {
    // Find the accounts connected to these trades
    const sourceTradeEdges = graph.edges.filter(e => e.target === edge.source && e.type === 'trade_link');
    const targetTradeEdges = graph.edges.filter(e => e.target === edge.target && e.type === 'trade_link');

    for (const sourceEdge of sourceTradeEdges) {
      for (const targetEdge of targetTradeEdges) {
        const key = [sourceEdge.source, targetEdge.source].sort().join('|');
        if (!entityGroups[key]) {
          entityGroups[key] = new Set([sourceEdge.source, targetEdge.source]);
        }
      }
    }
  }

  // Calculate sync scores for each group
  for (const [key, entities] of Object.entries(entityGroups)) {
    const entityArray = [...entities];
    const relevantEdges = timingSyncEdges.filter(e => {
      const sourceAccounts = graph.edges.filter(te => te.target === e.source && te.type === 'trade_link').map(te => te.source);
      const targetAccounts = graph.edges.filter(te => te.target === e.target && te.type === 'trade_link').map(te => te.source);
      return sourceAccounts.some(a => entities.has(a)) && targetAccounts.some(a => entities.has(a));
    });

    if (relevantEdges.length >= 2) {
      const avgTimeDelta = relevantEdges.reduce((sum, e) => sum + (e.metadata.timeDelta || 0), 0) / relevantEdges.length;
      const syncScore = Math.min(100, 100 - (avgTimeDelta / 50)); // Higher score for tighter sync

      syncGroups.push({
        entities: entityArray,
        syncScore,
        avgTimeDelta,
        tradeCount: relevantEdges.length,
      });
    }
  }

  return syncGroups.sort((a, b) => b.syncScore - a.syncScore);
}

// ============ ESCALATION PREDICTION ============

interface EscalationRisk {
  entityId: string;
  entityLabel: string;
  riskLevel: FraudSeverity;
  predictedEscalation: string;
  confidence: number;
  indicators: string[];
}

function predictEscalation(
  graph: KnowledgeGraph,
  patterns: TemporalPattern[],
  syncGroups: SyncGroup[]
): EscalationRisk[] {
  const risks: EscalationRisk[] = [];
  const entityRiskFactors: Record<string, string[]> = {};

  // Collect risk factors per entity
  for (const pattern of patterns) {
    if (!entityRiskFactors[pattern.entityId]) {
      entityRiskFactors[pattern.entityId] = [];
    }
    entityRiskFactors[pattern.entityId].push(pattern.description);
  }

  for (const sync of syncGroups) {
    for (const entity of sync.entities) {
      if (!entityRiskFactors[entity]) {
        entityRiskFactors[entity] = [];
      }
      entityRiskFactors[entity].push(`Synchronized trading with ${sync.entities.length - 1} other accounts`);
    }
  }

  // Assess escalation risk
  for (const [entityId, factors] of Object.entries(entityRiskFactors)) {
    if (factors.length >= 2) {
      const node = graph.nodes.find(n => n.id === entityId);
      const baseRisk = node?.riskScore || 0;

      let riskLevel: FraudSeverity = 'low';
      if (factors.length >= 4 || baseRisk >= 80) riskLevel = 'critical';
      else if (factors.length >= 3 || baseRisk >= 60) riskLevel = 'high';
      else if (factors.length >= 2 || baseRisk >= 40) riskLevel = 'medium';

      const predictions = [];
      if (factors.some(f => f.includes('escalation'))) {
        predictions.push('likely to increase trade volumes');
      }
      if (factors.some(f => f.includes('frequency'))) {
        predictions.push('may accelerate trading frequency');
      }
      if (factors.some(f => f.includes('Synchronized'))) {
        predictions.push('coordinated activity expected to continue');
      }

      risks.push({
        entityId,
        entityLabel: node?.label || entityId,
        riskLevel,
        predictedEscalation: predictions.join('; ') || 'continued suspicious behavior',
        confidence: Math.min(90, 40 + factors.length * 15),
        indicators: factors,
      });
    }
  }

  return risks.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.riskLevel] - order[b.riskLevel];
  });
}

// ============ FINDINGS GENERATION ============

function generateFindings(
  frequencyPatterns: TemporalPattern[],
  behaviorPatterns: TemporalPattern[],
  syncGroups: SyncGroup[],
  escalationRisks: EscalationRisk[],
  graph: KnowledgeGraph
): AgentFinding[] {
  const findings: AgentFinding[] = [];

  // Frequency pattern findings
  for (const pattern of frequencyPatterns.slice(0, 5)) {
    // Include rapid trade IDs in entities if available
    const relatedIds = pattern.relatedEntityIds || [];
    const allEntities = [pattern.entityId, ...relatedIds];

    // Build cleaner evidence
    const evidence = [
      `Average interval: ${(pattern.metrics.avgIntervalMs / 1000).toFixed(1)}s`,
      `Rapid instances: ${pattern.metrics.shortIntervalCount}`,
      `Std deviation: ${(pattern.metrics.stdDevMs / 1000).toFixed(1)}s`,
    ];

    findings.push({
      id: uuidv4(),
      type: `temporal_${pattern.pattern}`,
      severity: pattern.confidence >= 75 ? 'high' : 'medium',
      title: `${pattern.pattern.replace('_', ' ').toUpperCase()}: ${pattern.entityLabel}`,
      description: pattern.description,
      confidence: pattern.confidence,
      entities: allEntities,
      evidence,
      suggestedAction: 'Review trading history and monitor future activity',
    });
  }

  // Behavior shift findings
  for (const pattern of behaviorPatterns.slice(0, 3)) {
    findings.push({
      id: uuidv4(),
      type: 'behavior_shift',
      severity: 'medium',
      title: `Behavior Change: ${pattern.entityLabel}`,
      description: pattern.description,
      confidence: pattern.confidence,
      entities: [pattern.entityId],
      evidence: Object.entries(pattern.metrics).map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`),
      suggestedAction: 'Investigate reason for behavior change',
    });
  }

  // Sync group findings
  for (const sync of syncGroups.slice(0, 3)) {
    if (sync.syncScore >= 70) {
      const labels = sync.entities.map(e => graph.nodes.find(n => n.id === e)?.label || e);
      findings.push({
        id: uuidv4(),
        type: 'timing_synchronization',
        severity: sync.syncScore >= 85 ? 'high' : 'medium',
        title: `Synchronized Trading Detected`,
        description: `${sync.entities.length} accounts trading with ${sync.avgTimeDelta.toFixed(0)}ms average delta`,
        confidence: Math.round(sync.syncScore),
        entities: sync.entities,
        evidence: [
          `Sync score: ${sync.syncScore.toFixed(1)}%`,
          `Trade pairs: ${sync.tradeCount}`,
          `Avg delta: ${sync.avgTimeDelta.toFixed(0)}ms`,
          `Accounts: ${labels.join(', ')}`,
        ],
        suggestedAction: 'Investigate coordination mechanism',
      });
    }
  }

  // Escalation risk findings
  for (const risk of escalationRisks.filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high').slice(0, 3)) {
    findings.push({
      id: uuidv4(),
      type: 'escalation_prediction',
      severity: risk.riskLevel,
      title: `Escalation Risk: ${risk.entityLabel}`,
      description: `Predicted: ${risk.predictedEscalation}`,
      confidence: risk.confidence,
      entities: [risk.entityId],
      evidence: risk.indicators,
      suggestedAction: 'Proactive monitoring and potential intervention',
    });
  }

  return findings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });
}

// ============ MAIN ANALYSIS ============

export async function runAgentBeta(graph: KnowledgeGraph): Promise<AgentAnalysis> {
  const startTime = new Date().toISOString();
  console.log('[Agent Beta] Starting temporal intelligence analysis...');

  // Run analyses
  const frequencyPatterns = analyzeTradeFrequency(graph);
  const behaviorPatterns = detectBehaviorShifts(graph);
  const syncGroups = detectTimingSynchronization(graph);
  const escalationRisks = predictEscalation(graph, [...frequencyPatterns, ...behaviorPatterns], syncGroups);

  console.log(`[Agent Beta] Found ${frequencyPatterns.length} frequency patterns, ${behaviorPatterns.length} behavior shifts, ${syncGroups.length} sync groups`);

  // Generate findings
  const findings = generateFindings(frequencyPatterns, behaviorPatterns, syncGroups, escalationRisks, graph);

  // Generate AI summary
  let summary = '';
  try {
    const context = JSON.stringify({
      frequencyPatterns: frequencyPatterns.length,
      behaviorShifts: behaviorPatterns.length,
      syncGroups: syncGroups.length,
      escalationRisks: escalationRisks.filter(r => r.riskLevel !== 'low').length,
      findings: findings.slice(0, 5).map(f => f.description),
    });
    summary = await openRouterClient.analyzeGraph(context, 'Summarize the temporal analysis findings');
  } catch {
    summary = `Agent Beta analyzed temporal patterns across ${graph.stats.totalNodes} entities. `;
    summary += `Detected ${frequencyPatterns.length} frequency anomalies, ${behaviorPatterns.length} behavior shifts, `;
    summary += `and ${syncGroups.length} synchronized trading groups. `;
    summary += `${escalationRisks.filter(r => r.riskLevel === 'critical' || r.riskLevel === 'high').length} entities flagged for escalation risk.`;
  }

  const analysis: AgentAnalysis = {
    agentType: 'beta',
    agentName: AGENT_NAME,
    status: 'completed',
    startedAt: startTime,
    completedAt: new Date().toISOString(),
    findings,
    summary,
    metrics: {
      frequencyPatterns: frequencyPatterns.length,
      behaviorShifts: behaviorPatterns.length,
      syncGroups: syncGroups.length,
      escalationRisks: escalationRisks.length,
      criticalRisks: escalationRisks.filter(r => r.riskLevel === 'critical').length,
      highRisks: escalationRisks.filter(r => r.riskLevel === 'high').length,
    },
  };

  console.log(`[Agent Beta] Analysis complete: ${findings.length} findings`);

  return analysis;
}
