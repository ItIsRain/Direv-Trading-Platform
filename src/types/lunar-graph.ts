// Lunar Graph Types - AI-Powered Fraud Detection System

// ============ GRAPH STRUCTURE ============

export type NodeType = 'affiliate' | 'client' | 'trade' | 'ip' | 'device';

export interface GraphNodeData {
  id: string;
  type: NodeType;
  label: string;
  riskScore: number; // 0-100
  metadata: {
    // Common fields
    createdAt?: string;

    // Affiliate/Client fields
    email?: string;
    referralCode?: string;
    affiliateId?: string;

    // Trade fields
    contractType?: 'CALL' | 'PUT';
    symbol?: string;
    amount?: number;
    profit?: number;
    timestamp?: string;

    // IP fields
    ipAddress?: string;
    country?: string;
    city?: string;

    // Device fields
    canvasFingerprint?: string;
    deviceType?: string;
    browserName?: string;
    userAgent?: string;
  };
}

export type EdgeType =
  | 'referral'           // Affiliate -> Client referral
  | 'ip_overlap'         // Same IP used by different accounts
  | 'device_match'       // Same device fingerprint
  | 'timing_sync'        // Trades within suspicious time windows
  | 'opposite_position'  // CALL/PUT pairs on same symbol
  | 'trade_link';        // Account -> Trade ownership

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  weight: number; // 0-1, strength of connection
  isFraudIndicator: boolean;
  metadata: {
    timeDelta?: number; // ms between events
    confidence?: number; // 0-100
    description?: string;
    detectedAt?: string;
    rapidCount?: number; // Number of rapid trades in sequence
  };
}

export interface KnowledgeGraph {
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    fraudEdges: number;
    avgRiskScore: number;
    clusters: number;
  };
  builtAt: string;
}

// ============ FRAUD DETECTION ============

export type FraudRingType =
  | 'opposite_trading'    // Mirror position coordination
  | 'multi_account'       // Same device/IP across accounts
  | 'ip_clustering'       // Multiple accounts from same IP range
  | 'commission_pumping'  // High volume low-value trades
  | 'timing_coordination';// Synchronized trading patterns

export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FraudRing {
  id: string;
  name: string;
  type: FraudRingType;
  severity: FraudSeverity;
  confidence: number; // 0-100
  entities: string[]; // Node IDs involved
  exposure: number; // Financial exposure in USD
  evidence: FraudEvidence[];
  aiSummary: string;
  status: 'active' | 'investigating' | 'resolved' | 'false_positive';
  createdAt: string;
  updatedAt?: string;
}

export interface FraudEvidence {
  type: string;
  description: string;
  confidence: number;
  sourceNodes: string[];
  sourceEdges: string[];
  timestamp: string;
}

// ============ ALERTS ============

export type AlertType =
  | 'new_fraud_ring'
  | 'risk_escalation'
  | 'pattern_detected'
  | 'entity_flagged'
  | 'threshold_breach';

export interface LunarAlert {
  id: string;
  type: AlertType;
  severity: FraudSeverity;
  title: string;
  description: string;
  entities: string[];
  fraudRingId?: string;
  acknowledged: boolean;
  aiExplanation?: string;
  createdAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

// ============ AGENT ANALYSIS ============

export type AgentType = 'alpha' | 'beta' | 'gamma';

export interface AgentAnalysis {
  agentType: AgentType;
  agentName: string;
  status: 'running' | 'completed' | 'error';
  startedAt: string;
  completedAt?: string;
  findings: AgentFinding[];
  summary: string;
  metrics: Record<string, number>;
}

export interface AgentFinding {
  id: string;
  type: string;
  severity: FraudSeverity;
  title: string;
  description: string;
  confidence: number;
  entities: string[];
  evidence: string[];
  suggestedAction?: string;
}

export interface CombinedAnalysis {
  timestamp: string;
  agents: AgentAnalysis[];
  fraudRings: FraudRing[];
  alerts: LunarAlert[];
  overallRiskScore: number;
  summary: string;
}

// ============ COPILOT ============

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    fraudRingId?: string;
    entities?: string[];
    confidence?: number;
    sources?: string[];
  };
}

export interface CopilotSession {
  id: string;
  messages: CopilotMessage[];
  context: {
    currentGraph?: KnowledgeGraph;
    selectedEntities?: string[];
    recentAlerts?: LunarAlert[];
    activeInvestigation?: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ============ DEMO DATA ============

export interface DemoScenario {
  name: string;
  description: string;
  type: FraudRingType;
  affiliates: number;
  clients: number;
  trades: number;
}

// ============ API RESPONSES ============

export interface BuildGraphResponse {
  success: boolean;
  graph?: KnowledgeGraph;
  error?: string;
}

export interface AnalyzeResponse {
  success: boolean;
  analysis?: CombinedAnalysis;
  error?: string;
}

export interface CopilotResponse {
  success: boolean;
  message?: CopilotMessage;
  error?: string;
}

export interface GenerateDemoResponse {
  success: boolean;
  scenario?: DemoScenario;
  entitiesCreated?: {
    affiliates: number;
    clients: number;
    trades: number;
  };
  error?: string;
}
