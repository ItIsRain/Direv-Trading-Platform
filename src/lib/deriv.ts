// Deriv WebSocket API client

import {
  DerivAuthorizeResponse,
  DerivTickResponse,
  DerivProposalResponse,
  DerivBuyResponse,
  DerivOpenContractResponse,
  DerivBalanceResponse,
  CandleData
} from '@/types';

// Use environment variables or fallback to defaults
// App ID - Register your own at https://api.deriv.com/dashboard
const APP_ID = process.env.NEXT_PUBLIC_DERIV_APP_ID || '1089';
const WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`;

// Log the app_id being used (for debugging)
if (typeof window !== 'undefined') {
  console.log('[Deriv Config] Using APP_ID:', APP_ID);
  console.log('[Deriv Config] ENV APP_ID:', process.env.NEXT_PUBLIC_DERIV_APP_ID);
}

// API token for demo trading - get one from https://app.deriv.com/account/api-token
// IMPORTANT: Use a token from a VRTC (Virtual) account for synthetic indices access
const API_TOKEN = process.env.NEXT_PUBLIC_DERIV_API_TOKEN || '0azeUeV0iZvVQZ7';

// ============ DERIV AFFILIATE TRACKING UTILITIES ============

/**
 * Generate OAuth URL with affiliate tracking
 * Users clicking this link will be attributed to the affiliate
 *
 * IMPORTANT: Your app (app_id) must have these scopes enabled in the Deriv API Dashboard:
 * - read: Read account balance and settings
 * - trade: Execute trades
 * - trading_information: Access trading history and open positions
 * - payments: Access payment information
 *
 * Configure at: https://api.deriv.com/dashboard
 */
export function generateOAuthUrl(params: {
  affiliateToken?: string;
  utmCampaign?: string;
  redirectUri?: string;
}): string {
  const baseUrl = 'https://oauth.deriv.com/oauth2/authorize';

  // Build URL manually to ensure app_id is correct
  let url = `${baseUrl}?app_id=${APP_ID}`;

  // Add redirect_uri if provided
  if (params.redirectUri) {
    url += `&redirect_uri=${encodeURIComponent(params.redirectUri)}`;
  }

  // Add affiliate token if provided
  if (params.affiliateToken) {
    url += `&affiliate_token=${encodeURIComponent(params.affiliateToken)}`;
  }

  console.log('[Deriv] Generated OAuth URL:', url);
  console.log('[Deriv] APP_ID used:', APP_ID);

  return url;
}

/**
 * Generate signup URL with affiliate tracking
 * New users signing up via this link will be attributed to the affiliate
 */
export function generateSignupUrl(params: {
  affiliateToken?: string;
  utmCampaign?: string;
}): string {
  const baseUrl = 'https://hub.deriv.com/tradershub/signup';
  const queryParams = new URLSearchParams();

  if (params.affiliateToken) {
    queryParams.set('t', params.affiliateToken);
  }
  if (params.utmCampaign) {
    queryParams.set('utm_campaign', params.utmCampaign);
  }

  const queryString = queryParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Parse affiliate token from Deriv referral link
 * Supports both formats:
 * 1. https://deriv.com/signup?sidc=TOKEN&utm_campaign=CAMPAIGN
 * 2. https://track.deriv.com/_TOKEN/1/
 */
export function parseDerivReferralLink(link: string): {
  affiliateToken: string | null;
  utmCampaign: string | null;
} {
  try {
    const url = new URL(link);

    // Format 1: deriv.com with sidc parameter
    if (url.hostname.includes('deriv.com') && url.searchParams.has('sidc')) {
      return {
        affiliateToken: url.searchParams.get('sidc'),
        utmCampaign: url.searchParams.get('utm_campaign') || 'dynamicworks',
      };
    }

    // Format 2: track.deriv.com with token in path
    if (url.hostname === 'track.deriv.com') {
      const pathMatch = url.pathname.match(/^\/_([^/]+)\//);
      if (pathMatch) {
        return {
          affiliateToken: pathMatch[1],
          utmCampaign: 'myaffiliates',
        };
      }
    }

    return { affiliateToken: null, utmCampaign: null };
  } catch {
    return { affiliateToken: null, utmCampaign: null };
  }
}

export class DerivClient {
  private ws: WebSocket | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private subscriptionHandlers: Map<string, (data: any) => void> = new Map();
  private isAuthorized = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private messageQueue: Array<{ message: any; resolve: (data: any) => void; reject: (err: Error) => void }> = [];
  private reqId = 1;

  async connect(token?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = async () => {
          console.log('Deriv WebSocket connected');
          this.reconnectAttempts = 0;

          // Authorize with provided token or default
          try {
            await this.authorize(token || API_TOKEN);
            resolve();
          } catch (err) {
            reject(err);
          }
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            console.error('Error parsing message:', err);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.isAuthorized = false;
          this.handleReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  // Connect without authorization (for public API calls like account creation)
  async connectPublic(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          console.log('Deriv WebSocket connected (public)');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (err) {
            console.error('Error parsing message:', err);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.isAuthorized = false;
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleMessage(data: any): void {
    const msgType = data.msg_type;

    // Handle echo/passthrough for request-response matching
    if (data.echo_req?.req_id) {
      const handler = this.messageHandlers.get(data.echo_req.req_id.toString());
      if (handler) {
        handler(data);
        this.messageHandlers.delete(data.echo_req.req_id.toString());
        return;
      }
    }

    // Handle subscriptions
    if (msgType === 'tick') {
      const handler = this.subscriptionHandlers.get(`tick_${data.tick?.symbol}`);
      if (handler) handler(data);
    } else if (msgType === 'proposal_open_contract') {
      const handler = this.subscriptionHandlers.get(`contract_${data.proposal_open_contract?.contract_id}`);
      if (handler) handler(data);
    } else if (msgType === 'balance') {
      const handler = this.subscriptionHandlers.get('balance');
      if (handler) handler(data);
    } else if (msgType === 'transaction') {
      const handler = this.subscriptionHandlers.get('transaction');
      if (handler) handler(data);
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), 2000 * this.reconnectAttempts);
    }
  }

  private send<T>(message: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const reqId = this.reqId++;
      message.req_id = reqId;

      this.messageHandlers.set(reqId.toString(), (data) => {
        if (data.error) {
          reject(new Error(data.error.message));
        } else {
          resolve(data);
        }
      });

      this.ws.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(reqId.toString())) {
          this.messageHandlers.delete(reqId.toString());
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  async authorize(token: string): Promise<DerivAuthorizeResponse> {
    const response = await this.send<DerivAuthorizeResponse>({ authorize: token });
    this.isAuthorized = true;
    console.log('Authorized as:', response.authorize?.loginid, 'Account type:', this.getAccountType(response.authorize?.loginid || ''));
    return response;
  }

  // Determine account type from loginid prefix
  getAccountType(loginid: string): string {
    if (loginid.startsWith('VRTC')) return 'Virtual (Demo) - Synthetics';
    if (loginid.startsWith('VRW')) return 'Virtual Wallet';
    if (loginid.startsWith('CR')) return 'Real - SVG';
    if (loginid.startsWith('MF')) return 'Real - Maltainvest (EU)';
    if (loginid.startsWith('MLT')) return 'Real - Malta Gaming';
    if (loginid.startsWith('MX')) return 'Real - UK';
    return 'Unknown';
  }

  async getBalance(subscribe = true): Promise<DerivBalanceResponse> {
    return this.send<DerivBalanceResponse>({ balance: 1, subscribe: subscribe ? 1 : 0 });
  }

  subscribeToBalance(callback: (balance: DerivBalanceResponse) => void): void {
    this.subscriptionHandlers.set('balance', callback);
  }

  async subscribeTicks(symbol: string, callback: (tick: DerivTickResponse) => void): Promise<void> {
    this.subscriptionHandlers.set(`tick_${symbol}`, callback);
    await this.send({ ticks: symbol, subscribe: 1 });
  }

  async unsubscribeTicks(symbol: string): Promise<void> {
    this.subscriptionHandlers.delete(`tick_${symbol}`);
    // Note: In production, send forget request
  }

  async getTickHistory(symbol: string, count = 100, granularity = 60): Promise<CandleData[]> {
    const response = await this.send<any>({
      ticks_history: symbol,
      end: 'latest',
      count,
      style: 'candles',
      granularity,
    });

    if (response.candles) {
      return response.candles.map((c: any) => ({
        time: c.epoch,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
    }
    return [];
  }

  async getProposal(params: {
    symbol: string;
    amount: number;
    contractType: 'CALL' | 'PUT';
    duration: number;
    durationUnit: 's' | 'm' | 'h' | 't';
  }): Promise<DerivProposalResponse> {
    return this.send<DerivProposalResponse>({
      proposal: 1,
      amount: params.amount,
      basis: 'stake',
      contract_type: params.contractType,
      currency: 'USD',
      duration: params.duration,
      duration_unit: params.durationUnit,
      symbol: params.symbol,
    });
  }

  async buy(proposalId: string, price: number): Promise<DerivBuyResponse> {
    return this.send<DerivBuyResponse>({
      buy: proposalId,
      price,
      subscribe: 1,
    });
  }

  subscribeToContract(contractId: number, callback: (update: DerivOpenContractResponse) => void): void {
    this.subscriptionHandlers.set(`contract_${contractId}`, callback);
  }

  unsubscribeFromContract(contractId: number): void {
    this.subscriptionHandlers.delete(`contract_${contractId}`);
  }

  async sell(contractId: number, price = 0): Promise<any> {
    return this.send({ sell: contractId, price });
  }

  async getProfitTable(limit = 50): Promise<any> {
    return this.send({
      profit_table: 1,
      description: 1,
      limit,
      sort: 'DESC',
    });
  }

  async getActiveSymbols(): Promise<Array<{ symbol: string; display_name: string; market: string; submarket: string; isOpen: boolean }>> {
    const response = await this.send<any>({
      active_symbols: 'full',
      product_type: 'basic',
    });

    if (response.active_symbols) {
      return response.active_symbols.map((s: any) => ({
        symbol: s.symbol,
        display_name: s.display_name,
        market: s.market,
        submarket: s.submarket,
        isOpen: s.exchange_is_open === 1 && s.is_trading_suspended !== 1,
      }));
    }
    return [];
  }

  // Create a new virtual/demo account
  async createVirtualAccount(params: {
    residence: string;
    verificationCode: string;
    password: string;
    affiliateToken?: string;
  }): Promise<any> {
    const request: any = {
      new_account_virtual: 1,
      type: 'trading',
      client_password: params.password,
      residence: params.residence,
      verification_code: params.verificationCode,
    };

    // Add affiliate tracking if provided
    if (params.affiliateToken) {
      request.affiliate_token = params.affiliateToken;
    }

    return this.send(request);
  }

  // Request email verification for account creation
  async requestEmailVerification(email: string, type: string = 'account_opening'): Promise<any> {
    return this.send({
      verify_email: email,
      type,
    });
  }

  // Top up virtual account
  async topUpVirtual(): Promise<any> {
    return this.send({ topup_virtual: 1 });
  }

  // Get trading times to check market hours
  async getTradingTimes(date?: string): Promise<any> {
    return this.send({
      trading_times: date || new Date().toISOString().split('T')[0],
    });
  }

  async getPortfolio(): Promise<any> {
    return this.send({ portfolio: 1 });
  }

  subscribeToTransactions(callback: (data: any) => void): void {
    this.subscriptionHandlers.set('transaction', callback);
    this.send({ transaction: 1, subscribe: 1 });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isAuthorized = false;
    this.messageHandlers.clear();
    this.subscriptionHandlers.clear();
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && this.isAuthorized;
  }
}

// Singleton instance for shared connection
let clientInstance: DerivClient | null = null;

export function getDerivClient(): DerivClient {
  if (!clientInstance) {
    clientInstance = new DerivClient();
  }
  return clientInstance;
}
