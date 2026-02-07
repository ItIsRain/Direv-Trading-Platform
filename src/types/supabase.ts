// Supabase Database Types
// Run this SQL in your Supabase SQL Editor to create the tables

/*
-- Partners table (main account holders)
CREATE TABLE partners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  deriv_token TEXT,
  balance DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Affiliates table (invited by partners)
CREATE TABLE affiliates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES partners(id) ON DELETE CASCADE,
  referral_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  deriv_token TEXT,
  commission_rate DECIMAL(5,2) DEFAULT 0.10,
  total_earnings DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table (invited by affiliates)
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL,
  referral_code TEXT NOT NULL,
  deriv_account_id TEXT,
  deriv_token TEXT,
  ip_address TEXT,
  device_id TEXT,
  total_traded DECIMAL(15,2) DEFAULT 0,
  total_pnl DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trades table
CREATE TABLE trades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL,
  contract_id BIGINT,
  contract_type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  buy_price DECIMAL(15,4),
  sell_price DECIMAL(15,4),
  profit DECIMAL(15,4),
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Invites tracking table
CREATE TABLE invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  affiliate_id UUID REFERENCES affiliates(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  click_count INT DEFAULT 0,
  signup_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page visits / analytics
CREATE TABLE visits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referral_code TEXT,
  ip_address TEXT,
  user_agent TEXT,
  page TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_affiliates_referral_code ON affiliates(referral_code);
CREATE INDEX idx_affiliates_partner_id ON affiliates(partner_id);
CREATE INDEX idx_clients_affiliate_id ON clients(affiliate_id);
CREATE INDEX idx_clients_referral_code ON clients(referral_code);
CREATE INDEX idx_trades_client_id ON trades(client_id);
CREATE INDEX idx_trades_affiliate_id ON trades(affiliate_id);
CREATE INDEX idx_trades_created_at ON trades(created_at);
CREATE INDEX idx_visits_referral_code ON visits(referral_code);

-- Enable Row Level Security
ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

-- Public read policies for demo (adjust for production)
CREATE POLICY "Allow public read" ON affiliates FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read" ON clients FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON trades FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON trades FOR UPDATE USING (true);
CREATE POLICY "Allow public read" ON trades FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON visits FOR INSERT WITH CHECK (true);
*/

export interface Database {
  public: {
    Tables: {
      partners: {
        Row: {
          id: string;
          name: string;
          email: string;
          deriv_token: string | null;
          balance: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          deriv_token?: string | null;
          balance?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          deriv_token?: string | null;
          balance?: number;
          created_at?: string;
        };
      };
      affiliates: {
        Row: {
          id: string;
          partner_id: string | null;
          referral_code: string;
          name: string;
          email: string | null;
          deriv_token: string | null;
          deriv_affiliate_token: string | null;
          utm_campaign: string | null;
          commission_rate: number;
          total_earnings: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          partner_id?: string | null;
          referral_code: string;
          name: string;
          email?: string | null;
          deriv_token?: string | null;
          deriv_affiliate_token?: string | null;
          utm_campaign?: string | null;
          commission_rate?: number;
          total_earnings?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          partner_id?: string | null;
          referral_code?: string;
          name?: string;
          email?: string | null;
          deriv_token?: string | null;
          deriv_affiliate_token?: string | null;
          utm_campaign?: string | null;
          commission_rate?: number;
          total_earnings?: number;
          created_at?: string;
        };
      };
      clients: {
        Row: {
          id: string;
          affiliate_id: string | null;
          referral_code: string;
          email: string | null;
          deriv_account_id: string | null;
          deriv_token: string | null;
          ip_address: string | null;
          device_id: string | null;
          total_traded: number;
          total_pnl: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          affiliate_id?: string | null;
          referral_code: string;
          email?: string | null;
          deriv_account_id?: string | null;
          deriv_token?: string | null;
          ip_address?: string | null;
          device_id?: string | null;
          total_traded?: number;
          total_pnl?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          affiliate_id?: string | null;
          referral_code?: string;
          email?: string | null;
          deriv_account_id?: string | null;
          deriv_token?: string | null;
          ip_address?: string | null;
          device_id?: string | null;
          total_traded?: number;
          total_pnl?: number;
          created_at?: string;
        };
      };
      trades: {
        Row: {
          id: string;
          client_id: string | null;
          affiliate_id: string | null;
          contract_id: number | null;
          contract_type: string;
          symbol: string;
          amount: number;
          buy_price: number | null;
          sell_price: number | null;
          profit: number | null;
          status: string;
          created_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          affiliate_id?: string | null;
          contract_id?: number | null;
          contract_type: string;
          symbol: string;
          amount: number;
          buy_price?: number | null;
          sell_price?: number | null;
          profit?: number | null;
          status?: string;
          created_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          client_id?: string | null;
          affiliate_id?: string | null;
          contract_id?: number | null;
          contract_type?: string;
          symbol?: string;
          amount?: number;
          buy_price?: number | null;
          sell_price?: number | null;
          profit?: number | null;
          status?: string;
          created_at?: string;
          closed_at?: string | null;
        };
      };
      invites: {
        Row: {
          id: string;
          affiliate_id: string | null;
          referral_code: string;
          click_count: number;
          signup_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          affiliate_id?: string | null;
          referral_code: string;
          click_count?: number;
          signup_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          affiliate_id?: string | null;
          referral_code?: string;
          click_count?: number;
          signup_count?: number;
          created_at?: string;
        };
      };
      visits: {
        Row: {
          id: string;
          referral_code: string | null;
          ip_address: string | null;
          user_agent: string | null;
          page: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          referral_code?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          page?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          referral_code?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          page?: string | null;
          created_at?: string;
        };
      };
      partner_commissions: {
        Row: {
          id: string;
          trade_id: string | null;
          affiliate_id: string | null;
          client_id: string | null;
          trade_amount: number;
          commission_rate: number;
          commission_amount: number;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          trade_id?: string | null;
          affiliate_id?: string | null;
          client_id?: string | null;
          trade_amount: number;
          commission_rate?: number;
          commission_amount: number;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          trade_id?: string | null;
          affiliate_id?: string | null;
          client_id?: string | null;
          trade_amount?: number;
          commission_rate?: number;
          commission_amount?: number;
          status?: string;
          created_at?: string;
        };
      };
    };
  };
}
