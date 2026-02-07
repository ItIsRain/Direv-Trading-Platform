// Data store with Supabase integration
// Falls back to in-memory storage if Supabase is not configured

import { Partner, Affiliate, Client, Trade, Alert, CorrelationResult } from '@/types';
import { supabase, isSupabaseConfigured } from './supabase';

// Type assertion for Supabase operations (workaround for type mismatches)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
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

export async function createAffiliateAsync(
  name: string,
  email: string,
  partnerId?: string,
  derivAffiliateToken?: string,
  utmCampaign?: string
): Promise<Affiliate> {
  const referralCode = generateReferralCode();

  if (isSupabaseConfigured()) {
    const { data, error } = await db
      .from('affiliates')
      .insert({
        partner_id: partnerId,
        referral_code: referralCode,
        name,
        email,
        deriv_affiliate_token: derivAffiliateToken || null,
        utm_campaign: utmCampaign || 'partner_platform',
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
      derivAffiliateToken: data.deriv_affiliate_token || undefined,
      utmCampaign: data.utm_campaign || 'partner_platform',
      createdAt: new Date(data.created_at),
    };
  }

  // Fallback to in-memory
  return createAffiliate(name, email, derivAffiliateToken, utmCampaign);
}

export async function getAffiliatesAsync(): Promise<Affiliate[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await db
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id,
      referralCode: row.referral_code,
      partnerId: row.partner_id || '',
      name: row.name,
      email: row.email || '',
      derivToken: MASTER_TOKEN,
      derivAffiliateToken: row.deriv_affiliate_token || undefined,
      utmCampaign: row.utm_campaign || 'partner_platform',
      createdAt: new Date(row.created_at),
    }));
  }

  return getAffiliates();
}

export async function getAffiliateByReferralCodeAsync(code: string): Promise<Affiliate | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await db
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
      derivAffiliateToken: data.deriv_affiliate_token || undefined,
      utmCampaign: data.utm_campaign || 'partner_platform',
      createdAt: new Date(data.created_at),
    };
  }

  return getAffiliateByReferralCode(code) || null;
}

// ============ CLIENT FUNCTIONS ============

export async function createClientAsync(
  referralCode: string,
  email?: string,
  derivAccountId?: string,
  derivToken?: string,
  ipAddress?: string
): Promise<Client> {
  if (isSupabaseConfigured()) {
    // Get affiliate by referral code
    const affiliate = await getAffiliateByReferralCodeAsync(referralCode);

    const { data, error } = await db
      .from('clients')
      .insert({
        affiliate_id: affiliate?.id,
        referral_code: referralCode,
        email: email || null,
        deriv_account_id: derivAccountId || null,
        deriv_token: derivToken || null,
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
      derivToken: derivToken || MASTER_TOKEN,
      ip: data.ip_address || '',
      deviceId: data.device_id || '',
      createdAt: new Date(data.created_at),
    };
  }

  return createClient(referralCode);
}

// Update client with Deriv token
export async function updateClientTokenAsync(
  referralCode: string,
  email: string,
  derivAccountId: string,
  derivToken: string
): Promise<void> {
  if (isSupabaseConfigured()) {
    // First try to find existing client
    const { data: existingClient } = await db
      .from('clients')
      .select('id')
      .eq('referral_code', referralCode)
      .eq('email', email)
      .single();

    if (existingClient) {
      // Update existing client
      await db
        .from('clients')
        .update({
          deriv_account_id: derivAccountId,
          deriv_token: derivToken,
        })
        .eq('id', existingClient.id);
    } else {
      // Create new client with token
      const affiliate = await getAffiliateByReferralCodeAsync(referralCode);
      await db
        .from('clients')
        .insert({
          affiliate_id: affiliate?.id,
          referral_code: referralCode,
          email,
          deriv_account_id: derivAccountId,
          deriv_token: derivToken,
          device_id: uuidv4().slice(0, 8),
        });
    }
  }
}

// Get client by email and referral code
export async function getClientByEmailAsync(referralCode: string, email: string): Promise<Client | null> {
  if (isSupabaseConfigured()) {
    const { data, error } = await db
      .from('clients')
      .select('*')
      .eq('referral_code', referralCode)
      .eq('email', email)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      referralCode: data.referral_code,
      affiliateId: data.affiliate_id || '',
      derivToken: data.deriv_token || MASTER_TOKEN,
      ip: data.ip_address || '',
      deviceId: data.device_id || '',
      createdAt: new Date(data.created_at),
    };
  }

  return null;
}

export async function getClientsAsync(): Promise<Client[]> {
  if (isSupabaseConfigured()) {
    const { data, error } = await db
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
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
    const { data, error } = await db
      .from('clients')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row: any) => ({
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
    // Get the actual client/affiliate ID from Supabase
    let clientId: string | null = null;
    let affiliateId: string | null = null;

    // Validate UUID format
    const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (trade.accountType === 'client' && trade.accountId) {
      console.log('[Store] Trade from client, accountId:', trade.accountId);
      if (isValidUUID(trade.accountId)) {
        // Verify the client exists and get their affiliate_id
        const { data: clientData, error: clientError } = await db
          .from('clients')
          .select('id, affiliate_id')
          .eq('id', trade.accountId)
          .single();

        console.log('[Store] Client lookup result:', clientData, 'Error:', clientError);

        if (clientData) {
          clientId = trade.accountId;
          // Get the affiliate_id from the client record
          if (clientData.affiliate_id) {
            affiliateId = clientData.affiliate_id;
            console.log('[Store] Found affiliate_id:', affiliateId);
          }
        }
      } else {
        console.log('[Store] Invalid UUID format for accountId:', trade.accountId);
      }
    } else if (trade.accountType === 'affiliate' && trade.accountId) {
      if (isValidUUID(trade.accountId)) {
        affiliateId = trade.accountId;
      }
    }

    // Insert trade without foreign key constraints if IDs are not valid
    const insertData: Record<string, unknown> = {
      contract_id: trade.contractId,
      contract_type: trade.contractType,
      symbol: trade.symbol,
      amount: trade.amount,
      buy_price: trade.buyPrice,
      status: trade.status,
    };

    // Only add client_id or affiliate_id if they're valid
    if (clientId) insertData.client_id = clientId;
    if (affiliateId) insertData.affiliate_id = affiliateId;

    console.log('[Store] Inserting trade with data:', JSON.stringify(insertData));

    const { data, error } = await db
      .from('trades')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[Store] Trade insert error:', JSON.stringify(error));
      throw error;
    }

    console.log('[Store] Trade inserted successfully:', data.id, 'client_id:', data.client_id, 'affiliate_id:', data.affiliate_id);

    // Record commission for partner (4.5% of trade amount)
    const commissionAmount = trade.amount * 0.045;
    const commissionData: Record<string, unknown> = {
      trade_id: data.id,
      trade_amount: trade.amount,
      commission_rate: 0.045,
      commission_amount: commissionAmount,
      status: 'pending',
    };
    if (clientId) commissionData.client_id = clientId;
    if (affiliateId) commissionData.affiliate_id = affiliateId;

    try {
      await db.from('partner_commissions').insert(commissionData);
    } catch (err: any) {
      console.error('[Store] Commission insert error:', JSON.stringify(err));
    }

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
    const { error } = await db
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
    const { data, error } = await db
      .from('trades')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map((row: any) => ({
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

  await db.from('visits').insert({
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
  const { data: existing } = await db
    .from('invites')
    .select('*')
    .eq('referral_code', referralCode)
    .single();

  if (existing) {
    await db
      .from('invites')
      .update({ click_count: existing.click_count + 1 })
      .eq('referral_code', referralCode);
  } else {
    // Get affiliate for this referral code
    const affiliate = await getAffiliateByReferralCodeAsync(referralCode);

    await db.from('invites').insert({
      affiliate_id: affiliate?.id,
      referral_code: referralCode,
      click_count: 1,
    });
  }
}

export async function incrementSignupCount(referralCode: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { data: existing } = await db
    .from('invites')
    .select('*')
    .eq('referral_code', referralCode)
    .single();

  if (existing) {
    await db
      .from('invites')
      .update({ signup_count: existing.signup_count + 1 })
      .eq('referral_code', referralCode);
  }
}

export async function getInviteStats(referralCode: string): Promise<{ clicks: number; signups: number }> {
  if (!isSupabaseConfigured()) return { clicks: 0, signups: 0 };

  const { data } = await db
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
      totalVolume: trades.reduce((sum: number, t: any) => sum + t.amount, 0),
      totalProfit: trades.reduce((sum: number, t: any) => sum + (t.profit || 0), 0),
    };
  }

  // Get clients count
  const { count: clientCount } = await db
    .from('clients')
    .select('*', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId);

  // Get trades for this affiliate's clients
  const { data: trades } = await db
    .from('trades')
    .select('amount, profit')
    .eq('affiliate_id', affiliateId);

  return {
    totalClients: clientCount || 0,
    totalTrades: trades?.length || 0,
    totalVolume: trades?.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0) || 0,
    totalProfit: trades?.reduce((sum: number, t: any) => sum + (parseFloat(t.profit) || 0), 0) || 0,
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

  store.clients.forEach((client: any) => {
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
    totalVolume: store.trades.reduce((sum: number, t: any) => sum + t.amount, 0),
    totalProfit: store.trades.reduce((sum: number, t: any) => sum + (t.profit || 0), 0),
  };
}

// ============ ASYNC STATS FUNCTIONS ============

export async function getStatsAsync(): Promise<{
  totalAffiliates: number;
  totalClients: number;
  totalTrades: number;
  totalVolume: number;
  totalProfit: number;
  totalCommissions: number;
}> {
  if (!isSupabaseConfigured()) {
    return { ...getStats(), totalCommissions: 0 };
  }

  try {
    // Get counts
    const [affiliatesRes, clientsRes, tradesRes, commissionsRes] = await Promise.all([
      db.from('affiliates').select('*', { count: 'exact', head: true }),
      db.from('clients').select('*', { count: 'exact', head: true }),
      db.from('trades').select('amount, profit'),
      db.from('partner_commissions').select('commission_amount'),
    ]);

    const totalVolume = tradesRes.data?.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0) || 0;
    const totalProfit = tradesRes.data?.reduce((sum: number, t: any) => sum + (parseFloat(t.profit) || 0), 0) || 0;
    const totalCommissions = commissionsRes.data?.reduce((sum: number, c: any) => sum + (parseFloat(c.commission_amount) || 0), 0) || 0;

    return {
      totalAffiliates: affiliatesRes.count || 0,
      totalClients: clientsRes.count || 0,
      totalTrades: tradesRes.data?.length || 0,
      totalVolume,
      totalProfit,
      totalCommissions,
    };
  } catch (error) {
    console.error('[Store] getStatsAsync error:', error);
    return { ...getStats(), totalCommissions: 0 };
  }
}

export async function getRecentActivityAsync(limit: number = 10): Promise<Array<{
  type: 'signup' | 'trade' | 'payout';
  name: string;
  time: string;
  amount?: number;
}>> {
  if (!isSupabaseConfigured()) return [];

  try {
    const [clientsRes, tradesRes] = await Promise.all([
      db.from('clients').select('id, email, created_at').order('created_at', { ascending: false }).limit(limit),
      db.from('trades').select('id, amount, contract_type, created_at').order('created_at', { ascending: false }).limit(limit),
    ]);

    const activities: Array<{ type: 'signup' | 'trade' | 'payout'; name: string; time: string; timestamp: Date; amount?: number }> = [];

    // Add client signups
    (clientsRes.data || []).forEach((client: any) => {
      const name = client.email ? client.email.split('@')[0] : `Client #${client.id.slice(0, 4)}`;
      activities.push({
        type: 'signup',
        name,
        time: formatTimeAgo(new Date(client.created_at)),
        timestamp: new Date(client.created_at),
      });
    });

    // Add trades
    (tradesRes.data || []).forEach((trade: any) => {
      const tradeAmount = parseFloat(trade.amount) || 0;
      activities.push({
        type: 'trade',
        name: `$${tradeAmount.toFixed(2)} ${trade.contract_type}`,
        time: formatTimeAgo(new Date(trade.created_at)),
        timestamp: new Date(trade.created_at),
        amount: tradeAmount,
      });
    });

    // Sort by timestamp and limit
    return activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map(({ timestamp, ...rest }) => rest);
  } catch (error) {
    console.error('[Store] getRecentActivityAsync error:', error);
    return [];
  }
}

export async function getEarningsDataAsync(): Promise<Array<{
  month: string;
  amount: number;
  trades: number;
}>> {
  if (!isSupabaseConfigured()) return [];

  try {
    // Get trades grouped by month
    const { data: trades } = await db
      .from('trades')
      .select('amount, created_at')
      .order('created_at', { ascending: true });

    if (!trades || trades.length === 0) return [];

    // Group by month
    const monthlyData: Record<string, { amount: number; trades: number }> = {};
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    trades.forEach((trade: any) => {
      const date = new Date(trade.created_at);
      const monthKey = months[date.getMonth()];
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { amount: 0, trades: 0 };
      }
      // Commission is 4.5% of trade amount
      monthlyData[monthKey].amount += (parseFloat(trade.amount) || 0) * 0.045;
      monthlyData[monthKey].trades += 1;
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      amount: Math.round(data.amount * 100) / 100,
      trades: data.trades,
    }));
  } catch (error) {
    console.error('[Store] getEarningsDataAsync error:', error);
    return [];
  }
}

export async function getTopAffiliatesAsync(limit: number = 5): Promise<Array<{
  id: string;
  name: string;
  email: string;
  clients: number;
  trades: number;
  volume: number;
  commission: number;
}>> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data: affiliates } = await db
      .from('affiliates')
      .select('id, name, email')
      .order('created_at', { ascending: false });

    if (!affiliates) return [];

    const result = await Promise.all(affiliates.slice(0, limit * 2).map(async (affiliate: any) => {
      const [clientsRes, tradesRes] = await Promise.all([
        db.from('clients').select('*', { count: 'exact', head: true }).eq('affiliate_id', affiliate.id),
        db.from('trades').select('amount').eq('affiliate_id', affiliate.id),
      ]);

      // Also check trades from this affiliate's clients
      const { data: clients } = await db.from('clients').select('id').eq('affiliate_id', affiliate.id);
      const clientIds = clients?.map((c: any) => c.id) || [];

      let clientTrades: any[] = [];
      if (clientIds.length > 0) {
        const { data } = await db.from('trades').select('amount').in('client_id', clientIds);
        clientTrades = data || [];
      }

      const allTrades = [...(tradesRes.data || []), ...clientTrades];
      const volume = allTrades.reduce((sum: number, t: any) => sum + (parseFloat(t.amount) || 0), 0);

      return {
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email || '',
        clients: clientsRes.count || 0,
        trades: allTrades.length,
        volume,
        commission: volume * 0.045,
      };
    }));

    return result
      .sort((a, b) => b.volume - a.volume)
      .slice(0, limit);
  } catch (error) {
    console.error('[Store] getTopAffiliatesAsync error:', error);
    return [];
  }
}

export async function getWeeklyDataAsync(): Promise<Array<{
  day: string;
  trades: number;
  clients: number;
  volume: number;
}>> {
  if (!isSupabaseConfigured()) return [];

  try {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [tradesRes, clientsRes] = await Promise.all([
      db.from('trades').select('amount, created_at').gte('created_at', weekAgo.toISOString()),
      db.from('clients').select('created_at').gte('created_at', weekAgo.toISOString()),
    ]);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dailyData: Record<string, { trades: number; clients: number; volume: number }> = {};

    // Initialize all days
    days.forEach(day => {
      dailyData[day] = { trades: 0, clients: 0, volume: 0 };
    });

    // Group trades by day
    (tradesRes.data || []).forEach((trade: any) => {
      const day = days[new Date(trade.created_at).getDay()];
      dailyData[day].trades += 1;
      dailyData[day].volume += parseFloat(trade.amount) || 0;
    });

    // Group clients by day
    (clientsRes.data || []).forEach((client: any) => {
      const day = days[new Date(client.created_at).getDay()];
      dailyData[day].clients += 1;
    });

    // Return in order Mon-Sun
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
      day,
      ...dailyData[day],
    }));
  } catch (error) {
    console.error('[Store] getWeeklyDataAsync error:', error);
    return [];
  }
}

// Helper function to format time ago
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}
