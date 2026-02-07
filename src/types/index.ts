// Core data types for LunarGraph

export interface Partner {
  id: string;
  name: string;
  email: string;
  derivToken: string;
  balance: number;
  createdAt: Date;
}

export interface Affiliate {
  id: string;
  referralCode: string;
  partnerId: string;
  name: string;
  email: string;
  derivToken: string;
  // Deriv affiliate tracking fields
  derivAffiliateToken?: string; // The sidc/affiliate_token from Deriv referral link
  utmCampaign?: string; // The utm_campaign from Deriv referral link
  createdAt: Date;
}

export interface Client {
  id: string;
  referralCode: string;
  affiliateId: string;
  derivToken: string;
  ip: string;
  deviceId: string;
  createdAt: Date;
}

export interface Trade {
  id: string;
  accountId: string;
  accountType: 'partner' | 'affiliate' | 'client';
  contractId: number;
  contractType: 'CALL' | 'PUT';
  symbol: string;
  amount: number;
  buyPrice: number;
  sellPrice?: number;
  profit?: number;
  timestamp: Date;
  status: 'open' | 'won' | 'lost' | 'sold';
}

export interface FraudRing {
  id: string;
  code: string;
  name: string;
  type: string;
  severity: number;
  entities: string[];
  exposure: number;
}

export interface CorrelationResult {
  accountA: string;
  accountB: string;
  accountAType: string;
  accountBType: string;
  timingScore: number;
  directionScore: number;
  amountScore: number;
  overallScore: number;
  status: 'FLAGGED' | 'SUSPICIOUS' | 'NORMAL';
  matchedTrades: Array<{
    tradeA: Trade;
    tradeB: Trade;
    timeDelta: number;
  }>;
}

export interface GraphNode {
  id: string;
  type: 'partner' | 'affiliate' | 'client';
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fraud: boolean;
  correlationScore?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  fraud: boolean;
}

export interface Alert {
  id: string;
  type: 'trade' | 'correlation' | 'pattern' | 'ring';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  timestamp: Date;
  accountId?: string;
  ringId?: string;
}

// Deriv API types
export interface DerivAuthorizeResponse {
  authorize: {
    loginid: string;
    balance: number;
    currency: string;
    email: string;
    fullname: string;
  };
}

export interface DerivTickResponse {
  tick: {
    symbol: string;
    quote: number;
    epoch: number;
  };
}

export interface DerivProposalResponse {
  proposal: {
    id: string;
    ask_price: number;
    payout: number;
    spot: number;
    longcode: string;
  };
}

export interface DerivBuyResponse {
  buy: {
    contract_id: number;
    longcode: string;
    buy_price: number;
    balance_after: number;
    start_time: number;
    payout: number;
  };
}

export interface DerivOpenContractResponse {
  proposal_open_contract: {
    contract_id: number;
    current_spot: number;
    entry_spot: number;
    profit: number;
    is_sold: boolean;
    status: string;
    exit_tick?: number;
    exit_tick_time?: number;
  };
}

export interface DerivBalanceResponse {
  balance: {
    balance: number;
    currency: string;
    loginid: string;
  };
}

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export const SYMBOLS = [
  // Volatility Indices (24/7, synthetic)
  { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
  { value: '1HZ75V', label: 'Volatility 75 (1s) Index' },
  { value: '1HZ50V', label: 'Volatility 50 (1s) Index' },
  { value: '1HZ25V', label: 'Volatility 25 (1s) Index' },
  { value: '1HZ10V', label: 'Volatility 10 (1s) Index' },
  // Crash/Boom Indices (24/7, synthetic)
  { value: 'BOOM1000', label: 'Boom 1000 Index' },
  { value: 'BOOM500', label: 'Boom 500 Index' },
  { value: 'CRASH1000', label: 'Crash 1000 Index' },
  { value: 'CRASH500', label: 'Crash 500 Index' },
  // Jump Indices (24/7, synthetic)
  { value: 'JD10', label: 'Jump 10 Index' },
  { value: 'JD25', label: 'Jump 25 Index' },
  { value: 'JD50', label: 'Jump 50 Index' },
  { value: 'JD75', label: 'Jump 75 Index' },
  { value: 'JD100', label: 'Jump 100 Index' },
] as const;

export type SymbolType = typeof SYMBOLS[number]['value'];

// ============ DRAWING TYPES FOR BROADCAST FEATURE ============

export type DrawingType = 'trendline' | 'horizontal' | 'rectangle' | 'arrow' | 'text' | 'pricemarker';

export interface Point {
  x: number; // Time (epoch)
  y: number; // Price
}

export interface BaseDrawing {
  id: string;
  type: DrawingType;
  referralCode: string;
  symbol: string;
  color: string;
  lineWidth: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TrendlineDrawing extends BaseDrawing {
  type: 'trendline';
  startPoint: Point;
  endPoint: Point;
  extendLeft: boolean;
  extendRight: boolean;
}

export interface HorizontalLineDrawing extends BaseDrawing {
  type: 'horizontal';
  price: number;
  label?: string;
}

export interface RectangleDrawing extends BaseDrawing {
  type: 'rectangle';
  startPoint: Point;
  endPoint: Point;
  fillColor: string;
  fillOpacity: number;
}

export interface ArrowDrawing extends BaseDrawing {
  type: 'arrow';
  startPoint: Point;
  endPoint: Point;
  headSize: number;
}

export interface TextDrawing extends BaseDrawing {
  type: 'text';
  position: Point;
  text: string;
  fontSize: number;
  backgroundColor?: string;
}

export interface PriceMarkerDrawing extends BaseDrawing {
  type: 'pricemarker';
  price: number;
  label: string;
  side: 'buy' | 'sell';
}

export type Drawing =
  | TrendlineDrawing
  | HorizontalLineDrawing
  | RectangleDrawing
  | ArrowDrawing
  | TextDrawing
  | PriceMarkerDrawing;

export interface BroadcastSession {
  id: string;
  referralCode: string;
  affiliateName: string;
  symbol: string;
  isLive: boolean;
  drawings: Drawing[];
  createdAt: Date;
  updatedAt: Date;
}
