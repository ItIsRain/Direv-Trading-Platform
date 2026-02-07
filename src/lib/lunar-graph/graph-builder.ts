// Knowledge Graph Builder
// Constructs graph from Supabase data for fraud detection

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  KnowledgeGraph,
  GraphNodeData,
  GraphEdgeData,
  NodeType,
  EdgeType,
} from '@/types/lunar-graph';
import { v4 as uuidv4 } from 'uuid';

// Type assertions for Supabase
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ============ DATA FETCHING ============

interface AffiliateRow {
  id: string;
  name: string;
  email: string;
  referral_code: string;
  created_at: string;
}

interface ClientRow {
  id: string;
  affiliate_id: string;
  referral_code: string;
  email: string;
  ip_address: string;
  device_id: string;
  created_at: string;
}

interface TradeRow {
  id: string;
  client_id: string;
  affiliate_id: string;
  contract_type: 'CALL' | 'PUT';
  symbol: string;
  amount: number;
  profit: number;
  created_at: string;
}

interface VisitorRow {
  id: string;
  visitor_id: string;
  ip_address: string;
  canvas_fingerprint: string;
  device_type: string;
  browser_name: string;
  user_agent: string;
  referral_code: string;
  country: string;
  city: string;
  created_at: string;
}

async function fetchAffiliates(): Promise<AffiliateRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await db.from('affiliates').select('*');
  return data || [];
}

async function fetchClients(): Promise<ClientRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await db.from('clients').select('*');
  return data || [];
}

async function fetchTrades(): Promise<TradeRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await db.from('trades').select('*').order('created_at', { ascending: false }).limit(1000);
  return data || [];
}

async function fetchVisitorTracking(): Promise<VisitorRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await db.from('visitor_tracking').select('*').order('created_at', { ascending: false }).limit(5000);
  return data || [];
}

// ============ NODE CREATION ============

function createAffiliateNode(affiliate: AffiliateRow): GraphNodeData {
  return {
    id: `affiliate_${affiliate.id}`,
    type: 'affiliate',
    label: affiliate.name || `Affiliate ${affiliate.id.slice(0, 6)}`,
    riskScore: 0, // Will be calculated later
    metadata: {
      email: affiliate.email,
      referralCode: affiliate.referral_code,
      createdAt: affiliate.created_at,
    },
  };
}

function createClientNode(client: ClientRow): GraphNodeData {
  return {
    id: `client_${client.id}`,
    type: 'client',
    label: client.email ? client.email.split('@')[0] : `Client ${client.id.slice(0, 6)}`,
    riskScore: 0,
    metadata: {
      email: client.email,
      referralCode: client.referral_code,
      affiliateId: client.affiliate_id,
      createdAt: client.created_at,
    },
  };
}

function createTradeNode(trade: TradeRow): GraphNodeData {
  return {
    id: `trade_${trade.id}`,
    type: 'trade',
    label: `${trade.contract_type} $${trade.amount}`,
    riskScore: 0,
    metadata: {
      contractType: trade.contract_type,
      symbol: trade.symbol,
      amount: trade.amount,
      profit: trade.profit,
      timestamp: trade.created_at,
      createdAt: trade.created_at,
    },
  };
}

// ============ EDGE DETECTION ============

function createEdge(
  source: string,
  target: string,
  type: EdgeType,
  weight: number,
  isFraud: boolean,
  metadata: GraphEdgeData['metadata'] = {}
): GraphEdgeData {
  return {
    id: `edge_${uuidv4().slice(0, 8)}`,
    source,
    target,
    type,
    weight,
    isFraudIndicator: isFraud,
    metadata: {
      ...metadata,
      detectedAt: new Date().toISOString(),
    },
  };
}

function detectReferralEdges(
  affiliates: AffiliateRow[],
  clients: ClientRow[]
): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];

  for (const client of clients) {
    if (client.affiliate_id) {
      const affiliate = affiliates.find(a => a.id === client.affiliate_id);
      if (affiliate) {
        edges.push(
          createEdge(
            `affiliate_${affiliate.id}`,
            `client_${client.id}`,
            'referral',
            1,
            false,
            { description: `Referral via code ${client.referral_code}` }
          )
        );
      }
    }
  }

  return edges;
}

function detectIPOverlaps(clients: ClientRow[]): {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
} {
  const nodes: GraphNodeData[] = [];
  const edges: GraphEdgeData[] = [];

  // Group clients by IP, then map to their affiliates
  const ipGroups: Record<string, Set<string>> = {};
  for (const client of clients) {
    if (!client.ip_address || !client.affiliate_id) continue;
    if (!ipGroups[client.ip_address]) {
      ipGroups[client.ip_address] = new Set();
    }
    ipGroups[client.ip_address].add(client.affiliate_id);
  }

  // Find IPs used by multiple affiliates' clients (suspicious)
  for (const [ip, affiliateIds] of Object.entries(ipGroups)) {
    if (affiliateIds.size >= 2) {
      // Create IP node
      nodes.push({
        id: `ip_${ip.replace(/\./g, '_')}`,
        type: 'ip',
        label: ip,
        riskScore: 0,
        metadata: { ipAddress: ip },
      });

      const isSuspicious = affiliateIds.size >= 2;

      // Create edges from IP to each affiliate
      for (const affiliateId of affiliateIds) {
        edges.push(
          createEdge(
            `ip_${ip.replace(/\./g, '_')}`,
            `affiliate_${affiliateId}`,
            'ip_overlap',
            1 / affiliateIds.size,
            isSuspicious,
            {
              confidence: isSuspicious ? 70 : 40,
              description: `${affiliateIds.size} affiliates share this IP`,
            }
          )
        );
      }
    }
  }

  return { nodes, edges };
}

function detectDeviceMatches(clients: ClientRow[]): {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
} {
  const nodes: GraphNodeData[] = [];
  const edges: GraphEdgeData[] = [];

  // Group by device_id, then map to their affiliates
  const deviceGroups: Record<string, Set<string>> = {};
  for (const client of clients) {
    if (!client.device_id || !client.affiliate_id) continue;
    if (!deviceGroups[client.device_id]) {
      deviceGroups[client.device_id] = new Set();
    }
    deviceGroups[client.device_id].add(client.affiliate_id);
  }

  // Find device IDs shared across multiple affiliates (highly suspicious)
  for (const [deviceId, affiliateIds] of Object.entries(deviceGroups)) {
    if (affiliateIds.size >= 2) {
      // Create device node
      nodes.push({
        id: `device_${deviceId.slice(0, 16)}`,
        type: 'device',
        label: `Device ${deviceId.slice(0, 8)}`,
        riskScore: 0,
        metadata: { canvasFingerprint: deviceId },
      });

      // Same device with multiple affiliates is highly suspicious
      for (const affiliateId of affiliateIds) {
        edges.push(
          createEdge(
            `device_${deviceId.slice(0, 16)}`,
            `affiliate_${affiliateId}`,
            'device_match',
            0.9,
            true,
            {
              confidence: 85,
              description: `Same device across ${affiliateIds.size} affiliates`,
            }
          )
        );
      }
    }
  }

  return { nodes, edges };
}

function detectTimingSync(trades: TradeRow[]): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];
  const TIME_WINDOW_MS = 5000; // 5 seconds

  // Sort trades by time
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Find trades within suspicious time windows from different accounts
  for (let i = 0; i < sortedTrades.length; i++) {
    const tradeA = sortedTrades[i];
    const timeA = new Date(tradeA.created_at).getTime();

    for (let j = i + 1; j < sortedTrades.length; j++) {
      const tradeB = sortedTrades[j];
      const timeB = new Date(tradeB.created_at).getTime();
      const timeDelta = timeB - timeA;

      if (timeDelta > TIME_WINDOW_MS) break; // No need to check further

      // Different accounts, same symbol, close timing
      const accountA = tradeA.client_id || tradeA.affiliate_id;
      const accountB = tradeB.client_id || tradeB.affiliate_id;

      if (accountA && accountB && accountA !== accountB && tradeA.symbol === tradeB.symbol) {
        const isSuspicious = timeDelta < 2000; // Very suspicious if under 2 seconds

        edges.push(
          createEdge(
            `trade_${tradeA.id}`,
            `trade_${tradeB.id}`,
            'timing_sync',
            1 - timeDelta / TIME_WINDOW_MS,
            isSuspicious,
            {
              timeDelta,
              confidence: isSuspicious ? 80 : 50,
              description: `Trades ${timeDelta}ms apart on ${tradeA.symbol}`,
            }
          )
        );
      }
    }
  }

  return edges;
}

function detectOppositePositions(trades: TradeRow[]): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];
  const TIME_WINDOW_MS = 10000; // 10 seconds

  // Sort trades by time
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Find CALL/PUT pairs on same symbol within time window
  for (let i = 0; i < sortedTrades.length; i++) {
    const tradeA = sortedTrades[i];
    const timeA = new Date(tradeA.created_at).getTime();

    for (let j = i + 1; j < sortedTrades.length; j++) {
      const tradeB = sortedTrades[j];
      const timeB = new Date(tradeB.created_at).getTime();
      const timeDelta = timeB - timeA;

      if (timeDelta > TIME_WINDOW_MS) break;

      // Different accounts, same symbol, opposite positions
      const accountA = tradeA.client_id || tradeA.affiliate_id;
      const accountB = tradeB.client_id || tradeB.affiliate_id;

      if (
        accountA &&
        accountB &&
        accountA !== accountB &&
        tradeA.symbol === tradeB.symbol &&
        tradeA.contract_type !== tradeB.contract_type
      ) {
        // This is highly suspicious - coordinated opposite trading
        edges.push(
          createEdge(
            `trade_${tradeA.id}`,
            `trade_${tradeB.id}`,
            'opposite_position',
            0.95,
            true,
            {
              timeDelta,
              confidence: 90,
              description: `${tradeA.contract_type} vs ${tradeB.contract_type} on ${tradeA.symbol} (${timeDelta}ms delta)`,
            }
          )
        );
      }
    }
  }

  return edges;
}

// Detect rapid trading patterns (high frequency trading that may indicate fraud)
function detectRapidTrading(trades: TradeRow[]): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];
  const RAPID_THRESHOLD_MS = 60000; // 60 seconds between trades is considered rapid
  const MIN_RAPID_TRADES = 3; // Need at least 3 rapid trades to flag

  // Group trades by affiliate (only use affiliate_id for accurate linking)
  const tradesByAffiliate: Record<string, { trades: TradeRow[]; isAffiliate: boolean }> = {};
  for (const trade of trades) {
    // Prefer affiliate_id, fall back to client_id
    const affiliateId = trade.affiliate_id;
    const clientId = trade.client_id;
    const key = affiliateId || clientId;
    if (!key) continue;
    if (!tradesByAffiliate[key]) {
      tradesByAffiliate[key] = { trades: [], isAffiliate: !!affiliateId };
    }
    tradesByAffiliate[key].trades.push(trade);
  }

  // Check each affiliate's trades for rapid patterns
  for (const [entityId, { trades: entityTrades, isAffiliate }] of Object.entries(tradesByAffiliate)) {
    if (entityTrades.length < MIN_RAPID_TRADES) continue;

    // Sort by time
    const sorted = [...entityTrades].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Determine the correct node prefix
    const nodePrefix = isAffiliate ? 'affiliate' : 'client';

    // Find sequences of rapid trades
    let rapidSequence: TradeRow[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const prevTime = new Date(sorted[i - 1].created_at).getTime();
      const currTime = new Date(sorted[i].created_at).getTime();
      const delta = currTime - prevTime;

      if (delta <= RAPID_THRESHOLD_MS) {
        rapidSequence.push(sorted[i]);
      } else {
        // End of rapid sequence - create edges if sequence is long enough
        if (rapidSequence.length >= MIN_RAPID_TRADES) {
          // Create edges linking rapid trades
          for (let j = 0; j < rapidSequence.length - 1; j++) {
            const confidence = Math.min(95, 50 + rapidSequence.length * 5);
            edges.push(
              createEdge(
                `trade_${rapidSequence[j].id}`,
                `trade_${rapidSequence[j + 1].id}`,
                'timing_sync',
                0.8,
                true,
                {
                  confidence,
                  description: `Rapid trading: ${rapidSequence.length} trades in quick succession`,
                  rapidCount: rapidSequence.length,
                }
              )
            );
          }

          // Also link to affiliate/client node to boost their risk
          edges.push(
            createEdge(
              `${nodePrefix}_${entityId}`,
              `trade_${rapidSequence[0].id}`,
              'timing_sync',
              0.85,
              true,
              {
                confidence: Math.min(90, 50 + rapidSequence.length * 5),
                description: `Rapid trading pattern: ${rapidSequence.length} trades detected`,
                rapidCount: rapidSequence.length,
              }
            )
          );
        }
        // Start new sequence
        rapidSequence = [sorted[i]];
      }
    }

    // Check final sequence
    if (rapidSequence.length >= MIN_RAPID_TRADES) {
      for (let j = 0; j < rapidSequence.length - 1; j++) {
        const confidence = Math.min(95, 50 + rapidSequence.length * 5);
        edges.push(
          createEdge(
            `trade_${rapidSequence[j].id}`,
            `trade_${rapidSequence[j + 1].id}`,
            'timing_sync',
            0.8,
            true,
            {
              confidence,
              description: `Rapid trading: ${rapidSequence.length} trades in quick succession`,
              rapidCount: rapidSequence.length,
            }
          )
        );
      }

      edges.push(
        createEdge(
          `${nodePrefix}_${entityId}`,
          `trade_${rapidSequence[0].id}`,
          'timing_sync',
          0.85,
          true,
          {
            confidence: Math.min(90, 50 + rapidSequence.length * 5),
            description: `Rapid trading pattern: ${rapidSequence.length} trades detected`,
            rapidCount: rapidSequence.length,
          }
        )
      );
    }
  }

  return edges;
}

function createTradeLinks(trades: TradeRow[], clients: ClientRow[], affiliates: AffiliateRow[]): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];

  for (const trade of trades) {
    // Link trade directly to affiliate (simplified view)
    if (trade.affiliate_id) {
      edges.push(
        createEdge(
          `affiliate_${trade.affiliate_id}`,
          `trade_${trade.id}`,
          'trade_link',
          1,
          false,
          { description: 'Affiliate trade' }
        )
      );
    }
  }

  return edges;
}

// ============ RISK SCORING ============

function calculateRiskScores(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[]
): GraphNodeData[] {
  // Build adjacency map
  const nodeEdges: Record<string, GraphEdgeData[]> = {};
  for (const edge of edges) {
    if (!nodeEdges[edge.source]) nodeEdges[edge.source] = [];
    if (!nodeEdges[edge.target]) nodeEdges[edge.target] = [];
    nodeEdges[edge.source].push(edge);
    nodeEdges[edge.target].push(edge);
  }

  return nodes.map(node => {
    const connectedEdges = nodeEdges[node.id] || [];
    const fraudEdges = connectedEdges.filter(e => e.isFraudIndicator);

    // Start with base risk from connection count (more connections = slightly higher base risk)
    let riskScore = Math.min(15, connectedEdges.length * 2);

    // Add incremental risk for each fraud edge (scaled down to create gradual increase)
    if (fraudEdges.length > 0) {
      // Each fraud edge adds risk based on its confidence, but scaled
      const fraudRisk = fraudEdges.reduce((sum, e) => {
        const confidence = e.metadata.confidence || 50;
        return sum + (confidence * 0.3); // Scale down confidence
      }, 0);
      riskScore += Math.min(40, fraudRisk); // Cap fraud edge contribution at 40
    }

    // Incremental boosts for specific patterns (smaller increments for gradual color changes)
    const hasDeviceMatch = connectedEdges.some(e => e.type === 'device_match');
    const hasIPOverlap = connectedEdges.some(e => e.type === 'ip_overlap');
    const hasTimingSync = connectedEdges.some(e => e.type === 'timing_sync');
    const hasOpposite = connectedEdges.some(e => e.type === 'opposite_position');

    // Each pattern adds incremental risk
    if (hasIPOverlap) riskScore += 10;
    if (hasTimingSync) riskScore += 15;
    if (hasDeviceMatch) riskScore += 20;
    if (hasOpposite) riskScore += 25;

    // Extra boost for suspicious IP overlap
    if (hasIPOverlap && connectedEdges.filter(e => e.type === 'ip_overlap').length >= 3) {
      riskScore += 10;
    }

    // Extra boost for multiple fraud indicators
    if (fraudEdges.length >= 3) riskScore += 15;
    if (fraudEdges.length >= 5) riskScore += 10;

    return {
      ...node,
      riskScore: Math.min(100, Math.round(riskScore)),
    };
  });
}

// ============ MAIN BUILDER ============

export async function buildKnowledgeGraph(): Promise<KnowledgeGraph> {
  console.log('[GraphBuilder] Starting graph construction...');

  // Fetch all data
  const [affiliates, clients, trades, visitors] = await Promise.all([
    fetchAffiliates(),
    fetchClients(),
    fetchTrades(),
    fetchVisitorTracking(),
  ]);

  console.log(`[GraphBuilder] Fetched: ${affiliates.length} affiliates, ${clients.length} clients, ${trades.length} trades, ${visitors.length} visitors`);

  // Create base nodes (no client nodes - show affiliates directly linked to trades)
  const affiliateNodes = affiliates.map(createAffiliateNode);
  const tradeNodes = trades.slice(0, 200).map(createTradeNode); // Limit trades for performance

  // Detect patterns - use affiliates for IP/device detection based on their clients
  // Group clients by affiliate to detect multi-account patterns
  const ipDetection = detectIPOverlaps(clients);
  const deviceDetection = detectDeviceMatches(clients);

  // Create all edges (no referral edges since we removed client nodes)
  const timingSyncEdges = detectTimingSync(trades);
  const oppositeEdges = detectOppositePositions(trades);
  const rapidTradingEdges = detectRapidTrading(trades);
  const tradeLinkEdges = createTradeLinks(trades, clients, affiliates);

  // Combine all nodes and edges
  let allNodes: GraphNodeData[] = [
    ...affiliateNodes,
    ...tradeNodes,
    ...ipDetection.nodes,
    ...deviceDetection.nodes,
  ];

  const allEdges: GraphEdgeData[] = [
    ...ipDetection.edges,
    ...deviceDetection.edges,
    ...timingSyncEdges,
    ...oppositeEdges,
    ...rapidTradingEdges,
    ...tradeLinkEdges,
  ];

  // Calculate risk scores
  allNodes = calculateRiskScores(allNodes, allEdges);

  // Calculate stats
  const fraudEdges = allEdges.filter(e => e.isFraudIndicator).length;
  const avgRiskScore = allNodes.length > 0
    ? allNodes.reduce((sum, n) => sum + n.riskScore, 0) / allNodes.length
    : 0;

  // Estimate clusters (simple: count nodes with high risk score)
  const highRiskNodes = allNodes.filter(n => n.riskScore >= 50).length;
  const estimatedClusters = Math.ceil(highRiskNodes / 3);

  const graph: KnowledgeGraph = {
    nodes: allNodes,
    edges: allEdges,
    stats: {
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
      fraudEdges,
      avgRiskScore: Math.round(avgRiskScore),
      clusters: estimatedClusters,
    },
    builtAt: new Date().toISOString(),
  };

  console.log(`[GraphBuilder] Built graph: ${graph.stats.totalNodes} nodes, ${graph.stats.totalEdges} edges, ${graph.stats.fraudEdges} fraud indicators`);

  return graph;
}

// Export for use in agents
export {
  fetchAffiliates,
  fetchClients,
  fetchTrades,
  fetchVisitorTracking,
};
