// API Route: Check Trade for Fraud
// Called automatically when a trade ends - uses AI to analyze for fraud patterns

import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { openRouterClient } from '@/lib/lunar-graph/openrouter-client';
import { v4 as uuidv4 } from 'uuid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface TradeCheckRequest {
  tradeId: string;
  contractId?: number;
  affiliateId?: string;
  symbol?: string;
  contractType?: string;
  amount?: number;
  profit?: number;
  status?: string;
  entryTime?: string;
  exitTime?: string;
}

interface FraudIndicator {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  description: string;
  entities: string[];
}

interface TradeCheckResult {
  tradeId: string;
  riskScore: number;
  fraudIndicators: FraudIndicator[];
  aiAnalysis: string;
  requiresReview: boolean;
}

// Get recent trades for comparison
async function getRecentTrades(affiliateId: string, symbol: string, excludeTradeId: string) {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await db
      .from('trades')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data || []).filter((t: any) => t.id !== excludeTradeId);
  } catch (err) {
    console.error('[CheckTrade] Error fetching recent trades:', err);
    return [];
  }
}

// Get visitor/tracking data for the affiliate
async function getTrackingData(affiliateId: string) {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await db
      .from('visitor_tracking')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[CheckTrade] Error fetching tracking data:', err);
    return [];
  }
}

// Detect opposite trading patterns
function detectOppositeTrading(
  currentTrade: TradeCheckRequest,
  recentTrades: any[]
): FraudIndicator | null {
  const oppositeType = currentTrade.contractType === 'CALL' ? 'PUT' : 'CALL';
  const timeWindow = 60000; // 60 seconds
  const currentTime = new Date(currentTrade.entryTime || Date.now()).getTime();

  for (const trade of recentTrades) {
    if (trade.symbol !== currentTrade.symbol) continue;
    if (trade.contract_type !== oppositeType) continue;

    const tradeTime = new Date(trade.created_at).getTime();
    const timeDiff = Math.abs(currentTime - tradeTime);

    if (timeDiff <= timeWindow) {
      const confidence = Math.max(50, 100 - (timeDiff / 1000)); // Higher confidence for closer trades

      return {
        type: 'opposite_trading',
        severity: timeDiff < 10000 ? 'critical' : timeDiff < 30000 ? 'high' : 'medium',
        confidence: Math.round(confidence),
        description: `Opposite position detected: ${currentTrade.contractType} vs ${oppositeType} on ${currentTrade.symbol} within ${(timeDiff / 1000).toFixed(1)}s`,
        entities: [currentTrade.tradeId, trade.id],
      };
    }
  }

  return null;
}

// Detect rapid trading patterns
function detectRapidTrading(
  currentTrade: TradeCheckRequest,
  recentTrades: any[]
): FraudIndicator | null {
  const timeWindow = 300000; // 5 minutes
  const currentTime = new Date(currentTrade.entryTime || Date.now()).getTime();

  const tradesInWindow = recentTrades.filter(trade => {
    const tradeTime = new Date(trade.created_at).getTime();
    return Math.abs(currentTime - tradeTime) <= timeWindow;
  });

  if (tradesInWindow.length >= 10) {
    return {
      type: 'rapid_trading',
      severity: tradesInWindow.length >= 20 ? 'high' : 'medium',
      confidence: Math.min(95, 50 + tradesInWindow.length * 3),
      description: `High frequency trading detected: ${tradesInWindow.length} trades in 5 minutes`,
      entities: [currentTrade.tradeId, ...tradesInWindow.slice(0, 5).map((t: any) => t.id)],
    };
  }

  return null;
}

// Detect IP/device anomalies
function detectDeviceAnomalies(
  currentTrade: TradeCheckRequest,
  trackingData: any[]
): FraudIndicator | null {
  if (trackingData.length < 2) return null;

  // Check for multiple different IPs
  const uniqueIPs = new Set(trackingData.map(t => t.ip_address).filter(Boolean));
  const uniqueFingerprints = new Set(trackingData.map(t => t.canvas_fingerprint).filter(Boolean));

  if (uniqueIPs.size >= 5 && uniqueFingerprints.size === 1) {
    return {
      type: 'ip_rotation',
      severity: 'high',
      confidence: 75,
      description: `Multiple IPs (${uniqueIPs.size}) detected with same device fingerprint - possible VPN/proxy usage`,
      entities: [currentTrade.affiliateId || 'unknown'],
    };
  }

  if (uniqueFingerprints.size >= 3 && uniqueIPs.size === 1) {
    return {
      type: 'multi_device',
      severity: 'medium',
      confidence: 60,
      description: `Multiple devices (${uniqueFingerprints.size}) from same IP - possible multi-accounting`,
      entities: [currentTrade.affiliateId || 'unknown'],
    };
  }

  return null;
}

// Use AI to analyze the trade context
async function analyzeWithAI(
  trade: TradeCheckRequest,
  recentTrades: any[],
  trackingData: any[],
  detectedIndicators: FraudIndicator[]
): Promise<{ analysis: string; additionalRisk: number }> {
  const prompt = `You are a fraud detection AI for a trading platform. Analyze this trade for potential fraud.

CURRENT TRADE:
- ID: ${trade.tradeId}
- Symbol: ${trade.symbol}
- Type: ${trade.contractType}
- Amount: $${trade.amount}
- Profit: $${trade.profit || 'pending'}
- Status: ${trade.status}
- Time: ${trade.entryTime}

RECENT TRADES (last 50):
${recentTrades.slice(0, 10).map(t => `- ${t.contract_type} on ${t.symbol} for $${t.amount}, profit: $${t.profit || 0}`).join('\n')}
${recentTrades.length > 10 ? `... and ${recentTrades.length - 10} more trades` : ''}

TRACKING DATA:
- Unique IPs: ${new Set(trackingData.map(t => t.ip_address)).size}
- Unique Devices: ${new Set(trackingData.map(t => t.canvas_fingerprint)).size}
- Countries: ${[...new Set(trackingData.map(t => t.country).filter(Boolean))].join(', ') || 'Unknown'}

ALREADY DETECTED PATTERNS:
${detectedIndicators.length > 0 ? detectedIndicators.map(i => `- ${i.type}: ${i.description} (${i.severity})`).join('\n') : 'None detected yet'}

Provide a brief analysis (2-3 sentences) of:
1. Any additional fraud patterns you notice
2. The overall risk level of this trading activity
3. Whether this requires human review

Format your response as:
RISK_ADJUSTMENT: [0-30 additional points to add to risk score]
REQUIRES_REVIEW: [true/false]
ANALYSIS: [Your 2-3 sentence analysis]`;

  try {
    const response = await openRouterClient.chatWithSystem(
      'You are a fraud detection AI analyzing trading patterns. Be concise.',
      prompt
    );

    // Parse the response
    const riskMatch = response.match(/RISK_ADJUSTMENT:\s*(\d+)/);
    const reviewMatch = response.match(/REQUIRES_REVIEW:\s*(true|false)/i);
    const analysisMatch = response.match(/ANALYSIS:\s*([\s\S]+)/);

    return {
      analysis: analysisMatch ? analysisMatch[1].trim() : response,
      additionalRisk: riskMatch ? parseInt(riskMatch[1]) : 0,
    };
  } catch (err) {
    console.error('[CheckTrade] AI analysis failed:', err);
    return {
      analysis: 'AI analysis unavailable. Manual review recommended based on detected patterns.',
      additionalRisk: 0,
    };
  }
}

// Save fraud alert to database
async function saveFraudAlert(result: TradeCheckResult) {
  if (!isSupabaseConfigured() || result.riskScore < 40) return;

  try {
    await db.from('lunar_alerts').insert({
      id: uuidv4(),
      type: 'trade_flagged',
      severity: result.riskScore >= 70 ? 'high' : result.riskScore >= 50 ? 'medium' : 'low',
      title: `Trade ${result.tradeId.slice(0, 8)} flagged for review`,
      description: result.aiAnalysis,
      entities: result.fraudIndicators.flatMap(i => i.entities),
      acknowledged: false,
      ai_explanation: result.aiAnalysis,
    });
  } catch (err) {
    console.error('[CheckTrade] Failed to save alert:', err);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: TradeCheckRequest = await request.json();

    if (!body.tradeId) {
      return NextResponse.json({ success: false, error: 'Trade ID required' }, { status: 400 });
    }

    console.log(`[CheckTrade] Analyzing trade ${body.tradeId}...`);

    // Fetch context data in parallel
    const [recentTrades, trackingData] = await Promise.all([
      body.affiliateId ? getRecentTrades(body.affiliateId, body.symbol || '', body.tradeId) : [],
      body.affiliateId ? getTrackingData(body.affiliateId) : [],
    ]);

    // Run pattern detection
    const fraudIndicators: FraudIndicator[] = [];

    const oppositeTrading = detectOppositeTrading(body, recentTrades);
    if (oppositeTrading) fraudIndicators.push(oppositeTrading);

    const rapidTrading = detectRapidTrading(body, recentTrades);
    if (rapidTrading) fraudIndicators.push(rapidTrading);

    const deviceAnomalies = detectDeviceAnomalies(body, trackingData);
    if (deviceAnomalies) fraudIndicators.push(deviceAnomalies);

    // Calculate base risk score from detected patterns
    let riskScore = 0;
    for (const indicator of fraudIndicators) {
      switch (indicator.severity) {
        case 'critical': riskScore += 35; break;
        case 'high': riskScore += 25; break;
        case 'medium': riskScore += 15; break;
        case 'low': riskScore += 5; break;
      }
    }

    // Get AI analysis
    const aiResult = await analyzeWithAI(body, recentTrades, trackingData, fraudIndicators);
    riskScore = Math.min(100, riskScore + aiResult.additionalRisk);

    const result: TradeCheckResult = {
      tradeId: body.tradeId,
      riskScore,
      fraudIndicators,
      aiAnalysis: aiResult.analysis,
      requiresReview: riskScore >= 50 || fraudIndicators.some(i => i.severity === 'critical'),
    };

    // Save alert if risk is significant
    await saveFraudAlert(result);

    console.log(`[CheckTrade] Trade ${body.tradeId}: risk=${riskScore}, indicators=${fraudIndicators.length}`);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('[CheckTrade] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Check failed' },
      { status: 500 }
    );
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ status: 'Trade check API is running' });
}
