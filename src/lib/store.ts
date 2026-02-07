// Data store with Supabase integration
// Falls back to in-memory storage if Supabase is not configured

import { Partner, Affiliate, Client, Trade, Alert, CorrelationResult } from '@/types';
import { supabase, isSupabaseConfigured } from './supabase';
import { v4 as uuidv4 } from 'uuid';

// Pre-created demo tokens (for hackathon - in production these would be generated)
const MASTER_TOKEN = process.env.NEXT_PUBLIC_DERIV_API_TOKEN || '0azeUeV0iZvVQZ7';

// In-memory store (fallback)
interface Store {
  partner: Partner | null;
  affiliates: Affiliate[];
  clients: Client[];
  trades: Trade[];
  alerts: Alert[];
  correlations: CorrelationResult[];
}

let store: Store = {
  partner: null,
  affiliates: [],
  clients: [],
  trades: [],
  alerts: [],
  correlations: [],
};

// ============ AFFILIATE FUNCTIONS ============

export async function createAffiliateAsync(name: string, email: string, partnerId?: string): Promise<Affiliate> {
  const referralCode = generateReferralCode();

  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('affiliates')
      .insert({
        partner_id: partnerId,
        referral_code: referralCode,
        name,
        email,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      referralCode: data.referral_code,
      partnerId: data.partner_id || '',
      name: data.name,
      email: data.email || '',
      derivToken: MASTER_TOKEN,
      createdAt: new Date(data.created_at),
    };
  }

  // Fallback to in-memory
  return createAffiliate(name, email);
}

export async function getAffiliatesAsync(): Promise<Affiliate[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      referralCode: row.referral_code,
      partnerId: row.partner_id || '',
      name: row.name,
      email: row.email || '',
      derivToken: MASTER_TOKEN,
      createdAt: new Date(row.created_at),
    }));
  }

  return getAffiliates();
}

export async function getAffiliateByReferralCodeAsync(code: string): Promise<Affiliate | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .eq('referral_code', code)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      referralCode: data.referral_code,
      partnerId: data.partner_id || '',
      name: data.name,
      email: data.email || '',
      derivToken: MASTER_TOKEN,
      createdAt: new Date(data.created_at),
    };
  }

  return getAffiliateByReferralCode(code) || null;
}

// ============ CLIENT FUNCTIONS ============

export async function createClientAsync(referralCode: string, ipAddress?: string): Promise<Client> {
  if (isSupabaseConfigured()) {
    // Get affiliate by referral code
    const affiliate = await getAffiliateByReferralCodeAsync(referralCode);

    const { data, error } = await supabase
      .from('clients')
      .insert({
        affiliate_id: affiliate?.id,
        referral_code: referralCode,
        ip_address: ipAddress,
        device_id: uuidv4().slice(0, 8),
      })
      .select()
      .single();

    if (error) throw error;

    // Track the visit/signup
    await trackVisit(referralCode, ipAddress, 'signup');

    // Increment signup count for invite tracking
    await incrementSignupCount(referralCode);

    return {
      id: data.id,
      referralCode: data.referral_code,
      affiliateId: data.affiliate_id || '',
      derivToken: MASTER_TOKEN,
      ip: data.ip_address || '',
      deviceId: data.device_id || '',
      createdAt: new Date(data.created_at),
    };
  }

  return createClient(referralCode);
}

export async function getClientsAsync(): Promise<Client[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      referralCode: row.referral_code,
      affiliateId: row.affiliate_id || '',
      derivToken: MASTER_TOKEN,
      ip: row.ip_address || '',
      deviceId: row.device_id || '',
      createdAt: new Date(row.created_at),
    }));
  }

  return getClients();
}

export async function getClientsByAffiliateIdAsync(affiliateId: string): Promise<Client[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      referralCode: row.referral_code,
      affiliateId: row.affiliate_id || '',
      derivToken: MASTER_TOKEN,
      ip: row.ip_address || '',
      deviceId: row.device_id || '',
      createdAt: new Date(row.created_at),
    }));
  }

  return getClientsByAffiliateId(affiliateId);
}

// ============ TRADE FUNCTIONS ============

export async function addTradeAsync(trade: Omit<Trade, 'id'>): Promise<Trade> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('trades')
      .insert({
        client_id: trade.accountType === 'client' ? trade.accountId : null,
        affiliate_id: trade.accountType === 'affiliate' ? trade.accountId : null,
        contract_id: trade.contractId,
        contract_type: trade.contractType,
        symbol: trade.symbol,
        amount: trade.amount,
        buy_price: trade.buyPrice,
        status: trade.status,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      accountId: trade.accountId,
      accountType: trade.accountType,
      contractId: data.contract_id || 0,
      contractType: data.contract_type as 'CALL' | 'PUT',
      symbol: data.symbol,
      amount: data.amount,
      buyPrice: data.buy_price || 0,
      sellPrice: data.sell_price || undefined,
      profit: data.profit || undefined,
      timestamp: new Date(data.created_at),
      status: data.status as Trade['status'],
    };
  }

  const fullTrade = { ...trade, id: uuidv4() };
  addTrade(fullTrade);
  return fullTrade;
}

export async function updateTradeAsync(contractId: number, updates: Partial<Trade>): Promise<void> {
  if (isSupabaseConfigured()) {
    const { error } = await supabase
      .from('trades')
      .update({
        sell_price: updates.sellPrice,
        profit: updates.profit,
        status: updates.status,
        closed_at: updates.status !== 'open' ? new Date().toISOString() : null,
      })
      .eq('contract_id', contractId);

    if (error) throw error;
    return;
  }

  updateTrade(contractId, updates);
}

export async function getTradesAsync(): Promise<Trade[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map(row => ({
      id: row.id,
      accountId: row.client_id || row.affiliate_id || '',
      accountType: row.client_id ? 'client' : 'affiliate' as const,
      contractId: row.contract_id || 0,
      contractType: row.contract_type as 'CALL' | 'PUT',
      symbol: row.symbol,
      amount: row.amount,
      buyPrice: row.buy_price || 0,
      sellPrice: row.sell_price || undefined,
      profit: row.profit || undefined,
      timestamp: new Date(row.created_at),
      status: row.status as Trade['status'],
    }));
  }

  return getTrades();
}

// ============ TRACKING FUNCTIONS ============

export async function trackVisit(referralCode: string, ipAddress?: string, page?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  await supabase.from('visits').insert({
    referral_code: referralCode,
    ip_address: ipAddress,
    user_agent: typeof window !== 'undefined' ? navigator.userAgent : null,
    page,
  });

  // Also increment click count for invites
  await incrementClickCount(referralCode);
}

export async function incrementClickCount(referralCode: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  // Upsert invite tracking
  const { data: existing } = await supabase
    .from('invites')
    .select('*')
    .eq('referral_code', referralCode)
    .single();

  if (existing) {
    await supabase
      .from('invites')
      .update({ click_count: existing.click_count + 1 })
      .eq('referral_code', referralCode);
  } else {
    // Get affiliate for this referral code
    const affiliate = await getAffiliateByReferralCodeAsync(referralCode);

    await supabase.from('invites').insert({
      affiliate_id: affiliate?.id,
      referral_code: referralCode,
      click_count: 1,
    });
  }
}

export async function incrementSignupCount(referralCode: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { data: existing } = await supabase
    .from('invites')
    .select('*')
    .eq('referral_code', referralCode)
    .single();

  if (existing) {
    await supabase
      .from('invites')
      .update({ signup_count: existing.signup_count + 1 })
      .eq('referral_code', referralCode);
  }
}

export async function getInviteStats(referralCode: string): Promise<{ clicks: number; signups: number }> {
  if (!isSupabaseConfigured()) return { clicks: 0, signups: 0 };

  const { data } = await supabase
    .from('invites')
    .select('click_count, signup_count')
    .eq('referral_code', referralCode)
    .single();

  return {
    clicks: data?.click_count || 0,
    signups: data?.signup_count || 0,
  };
}

export async function getAffiliateStats(affiliateId: string): Promise<{
  totalClients: number;
  totalTrades: number;
  totalVolume: number;
  totalProfit: number;
}> {
  if (!isSupabaseConfigured()) {
    const clients = store.clients.filter(c => c.affiliateId === affiliateId);
    const trades = store.trades.filter(t =>
      clients.some(c => c.id === t.accountId)
    );
    return {
      totalClients: clients.length,
      totalTrades: trades.length,
      totalVolume: trades.reduce((sum, t) => sum + t.amount, 0),
      totalProfit: trades.reduce((sum, t) => sum + (t.profit || 0), 0),
    };
  }

  // Get clients count
  const { count: clientCount } = await supabase
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId);

  // Get trades for this affiliate's clients
  const { data: trades } = await supabase
    .from('trades')
    .select('amount, profit')
    .eq('affiliate_id', affiliateId);

  return {
    totalClients: clientCount || 0,
    totalTrades: trades?.length || 0,
    totalVolume: trades?.reduce((sum, t) => sum + t.amount, 0) || 0,
    totalProfit: trades?.reduce((sum, t) => sum + (t.profit || 0), 0) || 0,
  };
}

// ============ HELPER FUNCTIONS ============

function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ IN-MEMORY FALLBACK FUNCTIONS ============
// These are used when Supabase is not configured

export function initializePartner(): Partner {
  if (!store.partner) {
    store.partner = {
      id: uuidv4(),
      name: 'Demo Partner',
      email: 'demo@lunarcorp.ae',
      derivToken: MASTER_TOKEN,
      balance: 10000,
      createdAt: new Date(),
    };
  }
  return store.partner;
}

export function getPartner(): Partner | null {
  return store.partner;
}

export function createAffiliate(
  name: string,
  email: string,
  derivAffiliateToken?: string,
  utmCampaign?: string
): Affiliate {
  const affiliate: Affiliate = {
    id: uuidv4(),
    referralCode: generateReferralCode(),
    partnerId: store.partner?.id || '',
    name,
    email,
    derivToken: MASTER_TOKEN,
    derivAffiliateToken: derivAffiliateToken || undefined,
    utmCampaign: utmCampaign || 'partner_platform',
    createdAt: new Date(),
  };
  store.affiliates.push(affiliate);
  return affiliate;
}

export function getAffiliates(): Affiliate[] {
  return store.affiliates;
}

export function getAffiliateByReferralCode(code: string): Affiliate | undefined {
  return store.affiliates.find(a => a.referralCode === code);
}

export function createClient(referralCode: string): Client {
  const affiliate = getAffiliateByReferralCode(referralCode);
  const client: Client = {
    id: uuidv4(),
    referralCode,
    affiliateId: affiliate?.id || '',
    derivToken: MASTER_TOKEN,
    ip: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
    deviceId: uuidv4().slice(0, 8),
    createdAt: new Date(),
  };
  store.clients.push(client);
  return client;
}

export function getClients(): Client[] {
  return store.clients;
}

export function getClientsByAffiliateId(affiliateId: string): Client[] {
  return store.clients.filter(c => c.affiliateId === affiliateId);
}

export function addTrade(trade: Trade): void {
  store.trades.push(trade);

  const alert: Alert = {
    id: uuidv4(),
    type: 'trade',
    severity: 'info',
    title: `New ${trade.contractType} trade`,
    description: `${trade.symbol} - $${trade.amount}`,
    timestamp: new Date(),
    accountId: trade.accountId,
  };
  store.alerts.unshift(alert);

  if (store.alerts.length > 100) {
    store.alerts = store.alerts.slice(0, 100);
  }
}

export function getTrades(): Trade[] {
  return store.trades;
}

export function getTradesByAccountId(accountId: string): Trade[] {
  return store.trades.filter(t => t.accountId === accountId);
}

export function updateTrade(contractId: number, updates: Partial<Trade>): void {
  const idx = store.trades.findIndex(t => t.contractId === contractId);
  if (idx !== -1) {
    store.trades[idx] = { ...store.trades[idx], ...updates };
  }
}

export function addAlert(alert: Omit<Alert, 'id' | 'timestamp'>): void {
  store.alerts.unshift({
    ...alert,
    id: uuidv4(),
    timestamp: new Date(),
  });

  if (store.alerts.length > 100) {
    store.alerts = store.alerts.slice(0, 100);
  }
}

export function getAlerts(): Alert[] {
  return store.alerts;
}

export function setCorrelations(correlations: CorrelationResult[]): void {
  store.correlations = correlations;

  correlations.filter(c => c.status === 'FLAGGED').forEach(c => {
    addAlert({
      type: 'correlation',
      severity: 'critical',
      title: 'Fraud Pattern Detected',
      description: `High correlation (${Math.round(c.overallScore)}%) between accounts`,
      accountId: c.accountA,
      ringId: undefined,
    });
  });
}

export function getCorrelations(): CorrelationResult[] {
  return store.correlations;
}

export function getAccountHierarchy() {
  const partner = store.partner;
  if (!partner) return null;

  return {
    partner,
    affiliates: store.affiliates.map(aff => ({
      ...aff,
      clients: store.clients.filter(c => c.affiliateId === aff.id),
    })),
  };
}

export function getAllAccounts(): Array<{ id: string; type: 'partner' | 'affiliate' | 'client'; name: string }> {
  const accounts: Array<{ id: string; type: 'partner' | 'affiliate' | 'client'; name: string }> = [];

  if (store.partner) {
    accounts.push({ id: store.partner.id, type: 'partner', name: store.partner.name });
  }

  store.affiliates.forEach(aff => {
    accounts.push({ id: aff.id, type: 'affiliate', name: aff.name });
  });

  store.clients.forEach(client => {
    accounts.push({ id: client.id, type: 'client', name: `Client ${client.id.slice(0, 6)}` });
  });

  return accounts;
}

export function resetStore(): void {
  store = {
    partner: null,
    affiliates: [],
    clients: [],
    trades: [],
    alerts: [],
    correlations: [],
  };
}

export function getStats() {
  return {
    totalAffiliates: store.affiliates.length,
    totalClients: store.clients.length,
    totalTrades: store.trades.length,
    totalVolume: store.trades.reduce((sum, t) => sum + t.amount, 0),
    totalProfit: store.trades.reduce((sum, t) => sum + (t.profit || 0), 0),
  };
}
