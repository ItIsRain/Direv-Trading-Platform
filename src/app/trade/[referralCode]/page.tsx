'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import dynamic from 'next/dynamic';
import { getAffiliateByReferralCode, getAffiliateByReferralCodeAsync, createClient, createClientAsync, updateClientTokenAsync, getClients, getClientsAsync, addTrade, addTradeAsync, updateTrade, updateTradeAsync, getTrades, getTradesAsync } from '@/lib/store';

// Dynamic import for TradingView chart (client-side only)
const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e11', borderRadius: '0' }}>
      <span style={{ color: '#666' }}>Loading chart...</span>
    </div>
  ),
});
import { DerivClient, generateOAuthUrl } from '@/lib/deriv';
import { Trade, Drawing, TrendlineDrawing, HorizontalLineDrawing, RectangleDrawing, ArrowDrawing, TextDrawing } from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

interface OpenPosition {
  contractId: number;
  symbol: string;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  currentPrice: number;
  profit: number;
  buyPrice: number;
  payout: number;
  startTime: number;
  takeProfit?: number;
  stopLoss?: number;
}

type AuthState = 'checking' | 'unauthenticated' | 'creating_account' | 'authenticated';

export default function TradingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const referralCode = params.referralCode as string;

  // Auth states
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [userToken, setUserToken] = useState<string | null>(null);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [residence, setResidence] = useState('id'); // Default to Indonesia
  const [signupStep, setSignupStep] = useState<'email' | 'verify' | 'complete'>('email');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [justCreatedAccount, setJustCreatedAccount] = useState<string | null>(null);
  const [isEmailPrefilled, setIsEmailPrefilled] = useState(false);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);

  // Affiliate info
  const [affiliateName, setAffiliateName] = useState('Unknown');
  const [affiliateToken, setAffiliateToken] = useState<string | null>(null);
  const [utmCampaign, setUtmCampaign] = useState<string>('partner_platform');

  // Trading states
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState('');
  const [balance, setBalance] = useState(10000);
  const [accountId, setAccountId] = useState('');
  const [accountType, setAccountType] = useState('');
  const [userName, setUserName] = useState('');

  const [symbol, setSymbol] = useState('');
  const [availableSymbols, setAvailableSymbols] = useState<Array<{ value: string; label: string }>>([]);
  const [amount, setAmount] = useState<number>(100);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [highPrice, setHighPrice] = useState<number>(0);
  const [lowPrice, setLowPrice] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  // Order settings
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState<number>(0);
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [leverage, setLeverage] = useState<number>(10);

  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [isBuying, setIsBuying] = useState(false);

  // Affiliate signals
  const [affiliateSignals, setAffiliateSignals] = useState<Drawing[]>([]);
  const [showSignals, setShowSignals] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const derivClientRef = useRef<DerivClient | null>(null);
  const lastPriceRef = useRef<number>(0);
  const openPriceRef = useRef<number>(0);
  const closingPositionsRef = useRef<Set<number>>(new Set());

  // Debug: Log when tradeHistory changes
  useEffect(() => {
    console.log('[Trade] tradeHistory state updated:', tradeHistory.length, 'trades');
  }, [tradeHistory]);

  const residenceOptions = [
    { value: 'id', label: 'Indonesia' },
    { value: 'my', label: 'Malaysia' },
    { value: 'th', label: 'Thailand' },
    { value: 'vn', label: 'Vietnam' },
    { value: 'ph', label: 'Philippines' },
    { value: 'sg', label: 'Singapore' },
    { value: 'ae', label: 'UAE' },
    { value: 'gb', label: 'United Kingdom' },
    { value: 'de', label: 'Germany' },
    { value: 'za', label: 'South Africa' },
  ];

  // Check for OAuth callback token, stored token, or restore signup state
  useEffect(() => {
    const initPage = async () => {
      console.log('[Deriv] Initializing page for referralCode:', referralCode);

      // Get affiliate info - try async first, fallback to sync
      try {
        const affiliate = await getAffiliateByReferralCodeAsync(referralCode);
        if (affiliate) {
          setAffiliateName(affiliate.name);
          setAffiliateToken(affiliate.derivAffiliateToken || null);
          setUtmCampaign(affiliate.utmCampaign || 'partner_platform');
          console.log('[Deriv] Affiliate found:', affiliate.name);
        }
      } catch (err) {
        console.log('[Deriv] Falling back to in-memory affiliate lookup');
        const affiliate = getAffiliateByReferralCode(referralCode);
        if (affiliate) {
          setAffiliateName(affiliate.name);
          setAffiliateToken(affiliate.derivAffiliateToken || null);
          setUtmCampaign(affiliate.utmCampaign || 'partner_platform');
        }
      }

      // Check for OAuth callback tokens in URL
      const token1 = searchParams.get('token1');
      const acct1 = searchParams.get('acct1');

      if (token1 && acct1) {
        console.log('[Deriv] OAuth callback detected, account:', acct1);

        // Check if this is from a new account creation
        const newAccountId = localStorage.getItem(`deriv_new_account_${referralCode}`);
        const isNewAccount = newAccountId === acct1;
        const savedEmail = localStorage.getItem(`deriv_signup_email_${referralCode}`);

        // OAuth callback - store and use the token
        localStorage.setItem(`deriv_token_${referralCode}`, token1);
        localStorage.setItem(`deriv_account_${referralCode}`, acct1);

        // Save to Supabase
        try {
          await updateClientTokenAsync(
            referralCode,
            savedEmail || 'oauth_login',
            acct1,
            token1
          );
          console.log('[Deriv] OAuth token saved to database');
        } catch (dbErr) {
          console.error('[Deriv] Failed to save OAuth token to database:', dbErr);
        }

        // Clean signup state
        localStorage.removeItem(`deriv_signup_email_${referralCode}`);
        localStorage.removeItem(`deriv_signup_residence_${referralCode}`);
        localStorage.removeItem(`deriv_new_account_${referralCode}`);

        setUserToken(token1);
        setAuthState('authenticated');

        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);

        // Show welcome notification after a short delay
        setTimeout(() => {
          if (isNewAccount) {
            notifications.show({
              title: 'Welcome to Trading!',
              message: `Your account ${acct1} is ready with $10,000 virtual funds. Start trading!`,
              color: 'teal',
              autoClose: 5000,
            });
          } else {
            notifications.show({
              title: 'Logged In',
              message: `Welcome back! Connected to ${acct1}`,
              color: 'blue',
              autoClose: 3000,
            });
          }
        }, 1000);

        return;
      }

      // Check for stored auth token
      const storedToken = localStorage.getItem(`deriv_token_${referralCode}`);
      if (storedToken) {
        console.log('[Deriv] Found stored token, authenticating');
        setUserToken(storedToken);
        setAuthState('authenticated');
        return;
      }

      // Check for prefilled email from affiliate link URL params
      const prefilledEmail = searchParams.get('email');
      if (prefilledEmail) {
        console.log('[Deriv] Email prefilled from affiliate link:', prefilledEmail);
        setSignupEmail(prefilledEmail);
        setIsEmailPrefilled(true);
      }

      // No auth token - check if user was in the middle of signup
      const savedEmail = localStorage.getItem(`deriv_signup_email_${referralCode}`);
      const savedResidence = localStorage.getItem(`deriv_signup_residence_${referralCode}`);

      if (savedEmail) {
        console.log('[Deriv] Restoring signup state - email:', savedEmail);
        setSignupEmail(savedEmail);
        setVerificationSent(true);
        setSignupStep('verify');
      }

      if (savedResidence) {
        setResidence(savedResidence);
      }

      // No token found - show auth screen
      setAuthState('unauthenticated');
      setIsLoading(false);
    };

    initPage();
  }, [referralCode, searchParams]);

  // Initialize trading when authenticated
  useEffect(() => {
    if (authState !== 'authenticated' || !userToken) return;

    const init = async () => {
      try {
        setIsLoading(true);

        // Try to get/create client from Supabase first, fallback to in-memory
        let client;
        try {
          const clients = await getClientsAsync();
          client = clients.find(c => c.referralCode === referralCode);
          if (!client) {
            client = await createClientAsync(referralCode, signupEmail || undefined);
          }
        } catch (err) {
          console.log('[Trade] Falling back to in-memory client');
          client = getClients().find(c => c.referralCode === referralCode);
          if (!client) {
            client = createClient(referralCode);
          }
        }
        setClientId(client.id);

        const derivClient = new DerivClient();
        derivClientRef.current = derivClient;

        // Connect and authorize with the user's token
        const authResponse = await derivClient.connect(userToken);
        setIsConnected(true);
        console.log('[Trade] Auth response:', JSON.stringify(authResponse.authorize));
        // Use fullname (trimmed) or loginid as fallback for user name
        const fullName = (authResponse.authorize?.fullname || '').trim();
        const displayName = fullName || authResponse.authorize?.loginid || '';
        console.log('[Trade] Setting userName to:', displayName);
        setUserName(displayName);

        const balanceRes = await derivClient.getBalance(true);
        setBalance(balanceRes.balance.balance);
        setAccountId(balanceRes.balance.loginid);
        setAccountType(derivClient.getAccountType(balanceRes.balance.loginid));

        derivClient.subscribeToBalance((data) => {
          setBalance(data.balance.balance);
        });

        // Synthetic indices
        const symbolsToUse = [
          { value: 'R_10', label: 'Volatility 10 Index' },
          { value: 'R_25', label: 'Volatility 25 Index' },
          { value: 'R_50', label: 'Volatility 50 Index' },
          { value: 'R_75', label: 'Volatility 75 Index' },
          { value: 'R_100', label: 'Volatility 100 Index' },
          { value: '1HZ100V', label: 'Volatility 100 (1s) Index' },
          { value: 'BOOM1000N', label: 'Boom 1000 Index' },
          { value: 'CRASH1000N', label: 'Crash 1000 Index' },
        ];

        setAvailableSymbols(symbolsToUse);

        const defaultSymbol = 'R_100';
        setSymbol(defaultSymbol);

        const history = await derivClient.getTickHistory(defaultSymbol, 100, 60);

        if (history.length > 0) {
          openPriceRef.current = history[0].open;
          const prices = history.map(c => [c.high, c.low]).flat();
          setHighPrice(Math.max(...prices));
          setLowPrice(Math.min(...prices));
        }

        derivClient.subscribeTicks(defaultSymbol, (data) => {
          const newPrice = data.tick.quote;
          if (lastPriceRef.current !== 0) {
            setPriceChange(newPrice > lastPriceRef.current ? 'up' : newPrice < lastPriceRef.current ? 'down' : null);
            setTimeout(() => setPriceChange(null), 300);
          }
          if (openPriceRef.current !== 0) {
            const change = ((newPrice - openPriceRef.current) / openPriceRef.current) * 100;
            setPriceChangePercent(change);
          }
          if (newPrice > highPrice || highPrice === 0) setHighPrice(newPrice);
          if (newPrice < lowPrice || lowPrice === 0) setLowPrice(newPrice);
          lastPriceRef.current = newPrice;
          setCurrentPrice(newPrice);
        });

        // Load trade history - use client.id directly since setClientId is async
        const currentClientId = client.id;
        try {
          const allTrades = await getTradesAsync();
          console.log('[Trade] All trades from DB:', allTrades.length, 'currentClientId:', currentClientId, 'referralCode:', referralCode);
          const clientTrades = allTrades.filter(t => {
            const match = t.accountId === currentClientId || t.accountId === referralCode;
            console.log('[Trade] Checking trade:', t.accountId, 'against:', currentClientId, 'or', referralCode, 'match:', match);
            return match;
          });
          console.log('[Trade] Filtered trades:', clientTrades.length, 'trades:', clientTrades.map(t => ({ id: t.id, symbol: t.symbol, status: t.status })));
          setTradeHistory(clientTrades);
          console.log('[Trade] setTradeHistory called with', clientTrades.length, 'trades');
        } catch (err) {
          console.log('[Trade] Failed to load trade history:', err);
          // Fall back to in-memory trades
          setTradeHistory(getTrades().filter(t => t.accountId === currentClientId));
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error('Failed to initialize:', err);

        const errorMessage = err.message || '';

        // Check for scope/permission errors
        if (errorMessage.includes('scope') || errorMessage.includes('Permission denied')) {
          console.log('[Deriv] Token has insufficient permissions, need to re-authenticate');

          // Clear the bad token
          localStorage.removeItem(`deriv_token_${referralCode}`);

          notifications.show({
            title: 'Permission Required',
            message: 'Your session needs trading permissions. Redirecting to authorize...',
            color: 'yellow',
            autoClose: 3000,
          });

          // Redirect to OAuth to get proper permissions
          setTimeout(() => {
            window.location.href = generateOAuthUrl({
              affiliateToken: affiliateToken || undefined,
              redirectUri: `${window.location.origin}/trade/${referralCode}`,
            });
          }, 2000);

          return;
        }

        // If authorization fails for other reasons, clear token and go back to unauthenticated
        if (errorMessage.includes('authorize') || errorMessage.includes('token') || errorMessage.includes('invalid')) {
          localStorage.removeItem(`deriv_token_${referralCode}`);
          setUserToken(null);
          setAuthState('unauthenticated');

          notifications.show({
            title: 'Session Expired',
            message: 'Please log in again to continue trading.',
            color: 'yellow',
          });
          setIsLoading(false);
          return;
        }

        notifications.show({
          title: 'Connection Error',
          message: err.message || 'Failed to connect to trading server. Please refresh.',
          color: 'red',
        });
        setIsLoading(false);
      }
    };

    init();

    return () => {
      if (derivClientRef.current) {
        derivClientRef.current.disconnect();
      }
    };
  }, [authState, userToken, referralCode]);

  // Fetch broadcast analysis from database
  const fetchAnalysis = async () => {
    if (!symbol) return;
    setAnalysisLoading(true);
    try {
      let drawings: Drawing[] = [];

      // Try supabase first
      if (isSupabaseConfigured()) {
        const { data, error } = await (supabase as any)
          .from('broadcast_drawings')
          .select('*')
          .eq('symbol', symbol)
          .eq('is_live', true)
          .single();

        if (!error && data?.drawings) {
          const parsed = typeof data.drawings === 'string' ? JSON.parse(data.drawings) : data.drawings;
          if (Array.isArray(parsed)) {
            drawings = parsed;
          }
        }
      }

      // Fallback to localStorage
      if (drawings.length === 0) {
        const partnerData = localStorage.getItem(`broadcast_partner_${symbol}`);
        if (partnerData) {
          const parsed = JSON.parse(partnerData);
          if (parsed.is_live && parsed.drawings && Array.isArray(parsed.drawings)) {
            drawings = parsed.drawings;
          }
        }
      }

      setAffiliateSignals(drawings);
      if (drawings.length > 0) {
        setShowSignals(true);
      } else {
        notifications.show({
          title: 'No Analysis Available',
          message: 'Your partner has not broadcasted any analysis yet',
          color: 'yellow',
        });
      }
    } catch (e) {
      console.error('Failed to load analysis:', e);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Request email verification for new account
  const handleRequestVerification = async () => {
    if (!signupEmail.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter your email address',
        color: 'red',
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signupEmail)) {
      notifications.show({
        title: 'Invalid Email',
        message: 'Please enter a valid email address',
        color: 'red',
      });
      return;
    }

    setIsSubmitting(true);
    console.log('[Deriv] Starting email verification for:', signupEmail);

    try {
      const derivClient = new DerivClient();
      console.log('[Deriv] Connecting to WebSocket (public)...');
      await derivClient.connectPublic();

      console.log('[Deriv] Sending verification email request...');
      const result = await derivClient.requestEmailVerification(signupEmail, 'account_opening');
      console.log('[Deriv] Verification email result:', result);

      // Store email in localStorage to persist across any re-renders
      localStorage.setItem(`deriv_signup_email_${referralCode}`, signupEmail);
      localStorage.setItem(`deriv_signup_residence_${referralCode}`, residence);

      setVerificationSent(true);
      setSignupStep('verify');

      console.log('[Deriv] Step changed to verify');

      notifications.show({
        title: 'Verification Email Sent',
        message: 'Please check your email for the verification code',
        color: 'teal',
      });

      derivClient.disconnect();
    } catch (err: any) {
      console.error('[Deriv] Verification error:', err);
      notifications.show({
        title: 'Error',
        message: err.message || 'Failed to send verification email',
        color: 'red',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Validate password against Deriv requirements
  const validatePassword = (password: string): { valid: boolean; message: string } => {
    if (password.length < 8 || password.length > 25) {
      return { valid: false, message: 'Password must be 8-25 characters long' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    return { valid: true, message: '' };
  };

  // Create virtual account
  const handleCreateAccount = async () => {
    if (!verificationCode.trim() || !signupPassword.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please fill in all fields',
        color: 'red',
      });
      return;
    }

    const passwordValidation = validatePassword(signupPassword);
    if (!passwordValidation.valid) {
      notifications.show({
        title: 'Invalid Password',
        message: passwordValidation.message,
        color: 'red',
      });
      return;
    }

    setIsSubmitting(true);
    setAuthState('creating_account');

    console.log('[Deriv] Creating virtual account...');
    console.log('[Deriv] Email:', signupEmail);
    console.log('[Deriv] Residence:', residence);
    console.log('[Deriv] Affiliate Token:', affiliateToken);

    try {
      const derivClient = new DerivClient();
      await derivClient.connectPublic();

      const result = await derivClient.createVirtualAccount({
        residence,
        verificationCode: verificationCode.trim(),
        password: signupPassword,
        affiliateToken: affiliateToken || undefined,
      });

      console.log('[Deriv] Account creation result:', result);

      if (result.new_account_virtual) {
        const accountId = result.new_account_virtual.client_id;

        // Clean up signup state
        localStorage.removeItem(`deriv_signup_email_${referralCode}`);
        localStorage.removeItem(`deriv_signup_residence_${referralCode}`);

        // Store the new account ID for reference
        localStorage.setItem(`deriv_new_account_${referralCode}`, accountId);

        derivClient.disconnect();

        notifications.show({
          title: 'Account Created!',
          message: `Your demo account ${accountId} is ready! Generating API token...`,
          color: 'teal',
          autoClose: 5000,
        });

        // Store the password temporarily for token generation
        const storedPassword = signupPassword;

        // Auto-generate API token using the Python script
        setIsGeneratingToken(true);
        setJustCreatedAccount(accountId);

        try {
          console.log('[Deriv] Auto-generating API token...');
          const tokenResponse = await fetch('/api/generate-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: signupEmail,
              password: storedPassword
            }),
          });

          const tokenData = await tokenResponse.json();

          if (tokenData.success && tokenData.token) {
            console.log('[Deriv] Token generated successfully');

            // Store locally and use the generated token
            localStorage.setItem(`deriv_token_${referralCode}`, tokenData.token);

            // Save to Supabase
            try {
              await updateClientTokenAsync(
                referralCode,
                signupEmail,
                accountId,
                tokenData.token
              );
              console.log('[Deriv] Token saved to database');
            } catch (dbErr) {
              console.error('[Deriv] Failed to save token to database:', dbErr);
            }

            setUserToken(tokenData.token);
            setAuthState('authenticated');

            notifications.show({
              title: 'Ready to Trade!',
              message: 'Your API token has been automatically generated. You can now start trading!',
              color: 'teal',
              autoClose: 5000,
            });
          } else {
            throw new Error(tokenData.error || 'Failed to generate token');
          }
        } catch (tokenErr: any) {
          console.error('[Deriv] Auto token generation failed:', tokenErr);

          notifications.show({
            title: 'Manual Token Required',
            message: 'Could not auto-generate token. Please create one manually.',
            color: 'yellow',
            autoClose: 8000,
          });

          // Fallback to manual token entry
          setAuthState('unauthenticated');
          setSignupStep('email');
          setShowManualToken(true);
          setVerificationSent(false);
          setVerificationCode('');
          setSignupPassword('');
        } finally {
          setIsGeneratingToken(false);
        }

        return;
      }

      derivClient.disconnect();
    } catch (err: any) {
      console.error('[Deriv] Account creation error:', err);
      setAuthState('unauthenticated');
      // Keep on verify step so user can retry
      setSignupStep('verify');

      const errorMessage = err.message || 'Failed to create account';

      // Check for specific error types
      if (errorMessage.toLowerCase().includes('token') &&
          (errorMessage.toLowerCase().includes('expired') || errorMessage.toLowerCase().includes('invalid'))) {
        notifications.show({
          title: 'Verification Code Expired',
          message: 'Your verification code has expired. Please click "Resend code" to get a new one.',
          color: 'yellow',
          autoClose: 8000,
        });
      } else if (errorMessage.toLowerCase().includes('password')) {
        notifications.show({
          title: 'Password Error',
          message: 'Password must be 8-25 characters with uppercase, lowercase, and a number.',
          color: 'red',
        });
      } else {
        notifications.show({
          title: 'Account Creation Failed',
          message: errorMessage,
          color: 'red',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle login with API token
  const handleManualTokenSubmit = async () => {
    if (!manualToken.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter your API token',
        color: 'red',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Test the token by connecting
      const derivClient = new DerivClient();
      const authResponse = await derivClient.connect(manualToken.trim());
      setUserName(authResponse.authorize?.fullname || '');

      // Get account info for saving
      const balanceRes = await derivClient.getBalance(false);
      const derivAccountId = balanceRes.balance.loginid;

      // If successful, store the token locally
      localStorage.setItem(`deriv_token_${referralCode}`, manualToken.trim());
      localStorage.setItem(`deriv_account_${referralCode}`, derivAccountId);

      // Save to Supabase
      try {
        await updateClientTokenAsync(
          referralCode,
          signupEmail || 'manual_entry',
          derivAccountId,
          manualToken.trim()
        );
        console.log('[Deriv] Token saved to database');
      } catch (dbErr) {
        console.error('[Deriv] Failed to save token to database:', dbErr);
      }

      setUserToken(manualToken.trim());
      setAuthState('authenticated');

      notifications.show({
        title: 'Success!',
        message: 'Token verified. You can now start trading!',
        color: 'teal',
      });

      derivClient.disconnect();
    } catch (err: any) {
      notifications.show({
        title: 'Invalid Token',
        message: err.message || 'Could not connect with this token. Please check and try again.',
        color: 'red',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem(`deriv_token_${referralCode}`);
    localStorage.removeItem(`deriv_account_${referralCode}`);
    if (derivClientRef.current) {
      derivClientRef.current.disconnect();
    }
    setUserToken(null);
    setAuthState('unauthenticated');
    setIsConnected(false);
  };

  const handleSymbolChange = async (newSymbol: string) => {
    if (!newSymbol || !derivClientRef.current) return;

    setSymbolDropdownOpen(false);
    await derivClientRef.current.unsubscribeTicks(symbol);

    setSymbol(newSymbol);

    const history = await derivClientRef.current.getTickHistory(newSymbol, 100, 60);

    if (history.length > 0) {
      openPriceRef.current = history[0].open;
      const prices = history.map(c => [c.high, c.low]).flat();
      setHighPrice(Math.max(...prices));
      setLowPrice(Math.min(...prices));
    }

    derivClientRef.current.subscribeTicks(newSymbol, (data) => {
      const newPrice = data.tick.quote;
      if (lastPriceRef.current !== 0) {
        setPriceChange(newPrice > lastPriceRef.current ? 'up' : newPrice < lastPriceRef.current ? 'down' : null);
        setTimeout(() => setPriceChange(null), 300);
      }
      if (openPriceRef.current !== 0) {
        const change = ((newPrice - openPriceRef.current) / openPriceRef.current) * 100;
        setPriceChangePercent(change);
      }
      lastPriceRef.current = newPrice;
      setCurrentPrice(newPrice);
    });
  };

  // Auto TP/SL - Check if price hits take profit or stop loss
  useEffect(() => {
    if (!currentPrice || openPositions.length === 0 || !derivClientRef.current) return;

    openPositions.forEach(async (pos) => {
      // Skip if already closing this position
      if (closingPositionsRef.current.has(pos.contractId)) return;

      let shouldClose = false;
      let reason = '';

      if (pos.direction === 'CALL') {
        // Long position: TP is above entry, SL is below entry
        if (pos.takeProfit && currentPrice >= pos.takeProfit) {
          shouldClose = true;
          reason = 'Take Profit';
        } else if (pos.stopLoss && currentPrice <= pos.stopLoss) {
          shouldClose = true;
          reason = 'Stop Loss';
        }
      } else {
        // Short position: TP is below entry, SL is above entry
        if (pos.takeProfit && currentPrice <= pos.takeProfit) {
          shouldClose = true;
          reason = 'Take Profit';
        } else if (pos.stopLoss && currentPrice >= pos.stopLoss) {
          shouldClose = true;
          reason = 'Stop Loss';
        }
      }

      if (shouldClose) {
        // Mark as closing to prevent duplicate attempts
        closingPositionsRef.current.add(pos.contractId);

        try {
          console.log(`[Auto ${reason}] Closing position ${pos.contractId} at ${currentPrice}`);
          await sellPosition(pos.contractId, true); // silent=true, we show our own notification
          notifications.show({
            title: `${reason} Hit`,
            message: `Position closed at ${currentPrice.toFixed(2)}`,
            color: reason === 'Take Profit' ? 'green' : 'red',
          });
        } catch (err) {
          console.error(`[Auto ${reason}] Failed to close position:`, err);
        }
        // Don't delete from closingPositionsRef here - let the contract subscription handle it
        // when the position is actually removed from openPositions
      }
    });
  }, [currentPrice, openPositions]);

  const executeTrade = async (direction: 'CALL' | 'PUT') => {
    if (!derivClientRef.current || isBuying || !symbol) return;

    setIsBuying(true);

    try {
      const proposal = await derivClientRef.current.getProposal({
        symbol,
        amount,
        contractType: direction,
        duration: 5,
        durationUnit: 'm',
      });

      const buyResponse = await derivClientRef.current.buy(
        proposal.proposal.id,
        proposal.proposal.ask_price
      );

      const position: OpenPosition = {
        contractId: buyResponse.buy.contract_id,
        symbol,
        direction,
        entryPrice: currentPrice,
        currentPrice,
        profit: 0,
        buyPrice: buyResponse.buy.buy_price,
        payout: buyResponse.buy.payout,
        startTime: buyResponse.buy.start_time,
      };
      setOpenPositions(prev => [...prev, position]);

      const trade: Trade = {
        id: uuidv4(),
        accountId: clientId,
        accountType: 'client',
        contractId: buyResponse.buy.contract_id,
        contractType: direction,
        symbol,
        amount,
        buyPrice: buyResponse.buy.buy_price,
        timestamp: new Date(),
        status: 'open',
      };

      // Save trade to both memory and Supabase
      addTrade(trade);

      // Get the actual client ID from Supabase to ensure proper linking
      let tradeClientId = clientId;
      try {
        const clients = await getClientsAsync();
        const dbClient = clients.find(c => c.referralCode === referralCode);
        if (dbClient) {
          tradeClientId = dbClient.id;
          console.log('[Trade] Using client ID from DB:', tradeClientId);
        } else {
          console.log('[Trade] No client found for referralCode:', referralCode, 'using state clientId:', clientId);
        }
      } catch (err) {
        console.log('[Trade] Failed to lookup client, using state clientId:', clientId);
      }

      addTradeAsync({
        accountId: tradeClientId,
        accountType: 'client',
        contractId: buyResponse.buy.contract_id,
        contractType: direction,
        symbol,
        amount,
        buyPrice: buyResponse.buy.buy_price,
        timestamp: new Date(),
        status: 'open',
      }).then(() => {
        // Refresh trade history after adding
        getTradesAsync().then(allTrades => {
          setTradeHistory(allTrades.filter(t =>
            t.accountId === tradeClientId || t.accountId === clientId || t.accountId === referralCode
          ));
        }).catch(() => {});
      }).catch(err => console.error('[Trade] Failed to save to database:', err));

      derivClientRef.current.subscribeToContract(buyResponse.buy.contract_id, (update) => {
        const poc = update.proposal_open_contract;

        setOpenPositions(prev =>
          prev.map(p =>
            p.contractId === poc.contract_id
              ? { ...p, currentPrice: poc.current_spot, profit: poc.profit }
              : p
          )
        );

        if (poc.is_sold || poc.status === 'sold' || poc.status === 'won' || poc.status === 'lost') {
          setOpenPositions(prev => prev.filter(p => p.contractId !== poc.contract_id));
          // Clean up closingPositionsRef now that position is actually removed
          closingPositionsRef.current.delete(poc.contract_id);

          const tradeUpdate: { sellPrice: number | undefined; profit: number; status: 'won' | 'lost' | 'sold' } = {
            sellPrice: poc.exit_tick,
            profit: poc.profit,
            status: poc.status === 'won' ? 'won' : poc.status === 'lost' ? 'lost' : 'sold',
          };

          // Update in memory immediately for instant UI feedback
          updateTrade(poc.contract_id, tradeUpdate);

          // Update trade history state immediately with the profit value
          setTradeHistory(prev => prev.map(t =>
            t.contractId === poc.contract_id
              ? { ...t, ...tradeUpdate }
              : t
          ));

          // Also update in Supabase (async, no need to wait)
          updateTradeAsync(poc.contract_id, tradeUpdate).then(() => {
            // Refresh from database after update completes
            return getTradesAsync();
          }).then(allTrades => {
            const clientTrades = allTrades.filter(t =>
              t.accountId === tradeClientId || t.accountId === clientId || t.accountId === referralCode
            );
            setTradeHistory(clientTrades);
          }).catch(err => {
            console.error('[Trade] Failed to update in database:', err);
            // Fallback to in-memory trades
            setTradeHistory(getTrades().filter(t => t.accountId === clientId || t.accountId === referralCode));
          });

          derivClientRef.current?.unsubscribeFromContract(poc.contract_id);
        }
      });

      notifications.show({
        title: 'Trade Executed',
        message: `${direction === 'CALL' ? 'RISE' : 'FALL'} trade placed on ${symbol}`,
        color: direction === 'CALL' ? 'green' : 'red',
      });

      setBalance(buyResponse.buy.balance_after);
    } catch (err: any) {
      notifications.show({
        title: 'Trade Failed',
        message: err.message || 'Failed to execute trade',
        color: 'red',
      });
    } finally {
      setIsBuying(false);
    }
  };

  const sellPosition = async (contractId: number, silent?: boolean) => {
    if (!derivClientRef.current) return;

    try {
      await derivClientRef.current.sell(contractId, 0);
      if (!silent) {
        notifications.show({
          title: 'Position Closed',
          message: 'Trade sold successfully',
          color: 'blue',
        });
      }
    } catch (err: any) {
      if (!silent) {
        notifications.show({
          title: 'Sell Failed',
          message: err.message || 'Failed to sell position',
          color: 'red',
        });
      }
    }
  };

  const getSymbolLabel = () => {
    return availableSymbols.find(s => s.value === symbol)?.label || symbol;
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '0.00';
    return price < 10 ? price.toFixed(4) : price.toFixed(2);
  };

  // Auth Screen - shown when user needs to login/signup
  if (authState === 'checking') {
    return (
      <>
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #06060a; font-family: 'Inter', sans-serif; }
          .loader-wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(ellipse at 50% 0%, rgba(255, 68, 79, 0.1) 0%, transparent 60%), #06060a;
          }
          .loader-ring {
            width: 60px;
            height: 60px;
            border: 2px solid rgba(255, 68, 79, 0.1);
            border-top-color: #FF444F;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div className="loader-wrap">
          <div className="loader-ring" />
        </div>
      </>
    );
  }

  // Show token generation loading screen
  if (isGeneratingToken) {
    return (
      <>
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #06060a; font-family: 'Inter', sans-serif; color: #fafafa; }
          .token-gen-wrap {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: radial-gradient(ellipse at 50% 0%, rgba(255, 68, 79, 0.1) 0%, transparent 60%), #06060a;
            text-align: center;
            padding: 20px;
          }
          .token-gen-spinner {
            width: 80px;
            height: 80px;
            border: 3px solid rgba(255, 68, 79, 0.1);
            border-top-color: #FF444F;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 32px;
          }
          .token-gen-title {
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 12px;
          }
          .token-gen-subtitle {
            font-size: 15px;
            color: #71717a;
            max-width: 420px;
          }
          .token-gen-progress {
            margin-top: 24px;
            font-size: 13px;
            color: #FF444F;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div className="token-gen-wrap">
          <div className="token-gen-spinner" />
          <h1 className="token-gen-title">Generating API Token</h1>
          <p className="token-gen-subtitle">
            Please wait while we set up your trading account. This may take up to 2 minutes...
          </p>
          <div className="token-gen-progress">
            Account: {justCreatedAccount}
          </div>
        </div>
      </>
    );
  }

  if (authState === 'unauthenticated' || authState === 'creating_account') {
    return (
      <>
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            background: #06060a;
            font-family: 'Inter', sans-serif;
            color: #fafafa;
            min-height: 100vh;
          }

          .auth-page {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background:
              radial-gradient(ellipse at 30% 20%, rgba(255, 68, 79, 0.15) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 80%, rgba(99, 102, 241, 0.1) 0%, transparent 50%),
              #06060a;
            padding: 20px;
          }

          .auth-card {
            background: linear-gradient(180deg, rgba(20, 20, 25, 0.95) 0%, rgba(15, 15, 20, 0.9) 100%);
            border: 1px solid rgba(255, 68, 79, 0.15);
            border-radius: 24px;
            padding: 48px;
            max-width: 480px;
            width: 100%;
            box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5);
          }

          .auth-logo {
            width: 64px;
            height: 64px;
            background: linear-gradient(135deg, #FF444F 0%, #ff6b73 100%);
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 28px;
            color: white;
            margin: 0 auto 24px;
            box-shadow: 0 8px 32px rgba(255, 68, 79, 0.3);
          }

          .auth-title {
            text-align: center;
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
          }

          .auth-subtitle {
            text-align: center;
            color: #71717a;
            font-size: 15px;
            margin-bottom: 32px;
          }

          .affiliate-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(139, 92, 246, 0.1) 100%);
            border: 1px solid rgba(139, 92, 246, 0.25);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 13px;
            color: #a5b4fc;
            margin: 0 auto 32px;
            display: flex;
            justify-content: center;
          }

          .auth-divider {
            display: flex;
            align-items: center;
            gap: 16px;
            margin: 28px 0;
            color: #52525b;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .auth-divider::before,
          .auth-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
          }

          .auth-btn {
            width: 100%;
            padding: 16px 24px;
            border: none;
            border-radius: 12px;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: 'Inter', sans-serif;
          }

          .auth-btn-primary {
            background: linear-gradient(135deg, #FF444F 0%, #dc2626 100%);
            color: white;
            box-shadow: 0 4px 20px rgba(255, 68, 79, 0.4);
          }

          .auth-btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 30px rgba(255, 68, 79, 0.5);
          }

          .auth-btn-secondary {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: #e4e4e7;
          }

          .auth-btn-secondary:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.15);
          }

          .auth-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
          }

          .form-group {
            margin-bottom: 20px;
          }

          .form-label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #a1a1aa;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }

          .form-input {
            width: 100%;
            padding: 14px 16px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            color: #fafafa;
            font-size: 15px;
            transition: all 0.2s;
            font-family: 'Inter', sans-serif;
          }

          .form-input:focus {
            outline: none;
            border-color: #FF444F;
            box-shadow: 0 0 0 3px rgba(255, 68, 79, 0.1);
          }

          .form-input::placeholder {
            color: #52525b;
          }

          .form-select {
            width: 100%;
            padding: 14px 16px;
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            color: #fafafa;
            font-size: 15px;
            cursor: pointer;
            font-family: 'Inter', sans-serif;
          }

          .form-select option {
            background: #1a1a1f;
            color: #fafafa;
          }

          .signup-steps {
            display: flex;
            justify-content: center;
            gap: 8px;
            margin-bottom: 32px;
          }

          .step {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.1);
            transition: all 0.3s;
          }

          .step.active {
            background: #FF444F;
            box-shadow: 0 0 10px rgba(255, 68, 79, 0.5);
          }

          .step.completed {
            background: #22c55e;
          }

          .info-box {
            background: rgba(255, 68, 79, 0.08);
            border: 1px solid rgba(255, 68, 79, 0.15);
            border-radius: 12px;
            padding: 16px;
            margin-top: 24px;
          }

          .info-box-title {
            font-size: 13px;
            font-weight: 600;
            color: #FF444F;
            margin-bottom: 8px;
          }

          .info-box-text {
            font-size: 13px;
            color: #a1a1aa;
            line-height: 1.5;
          }

          .back-link {
            display: block;
            text-align: center;
            margin-top: 20px;
            color: #71717a;
            font-size: 14px;
            cursor: pointer;
            transition: color 0.2s;
          }

          .back-link:hover {
            color: #FF444F;
          }
        `}</style>

        <div className="auth-page">
          <div className="auth-card">
            <div className="auth-logo">D</div>
            <h1 className="auth-title">Start Trading</h1>
            <p className="auth-subtitle">Create a free demo account or login to trade</p>

            {affiliateName !== 'Unknown' && (
              <div className="affiliate-badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Referred by {affiliateName}
              </div>
            )}

            {signupStep === 'email' && (
              <>
                {/* Signup Form - Primary action for new users */}
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="you@example.com"
                    value={signupEmail}
                    onChange={(e) => !isEmailPrefilled && setSignupEmail(e.target.value)}
                    disabled={isEmailPrefilled}
                    style={isEmailPrefilled ? { opacity: 0.7, cursor: 'not-allowed', backgroundColor: 'rgba(255, 255, 255, 0.05)' } : {}}
                  />
                  {isEmailPrefilled && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#22c55e' }}>
                      Email provided by your affiliate partner
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Country of Residence</label>
                  <select
                    className="form-select"
                    value={residence}
                    onChange={(e) => setResidence(e.target.value)}
                  >
                    {residenceOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  className="auth-btn auth-btn-primary"
                  onClick={handleRequestVerification}
                  disabled={isSubmitting}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  {isSubmitting ? 'Sending Verification...' : 'Create Free Demo Account'}
                </button>

                <div className="info-box">
                  <div className="info-box-title">Free Demo Account</div>
                  <div className="info-box-text">
                    Get $10,000 in virtual funds to practice trading. No real money required.
                    {affiliateToken && ' Your account will be linked to your affiliate partner.'}
                  </div>
                </div>

                <div className="auth-divider">already have a Deriv account?</div>

                {!showManualToken ? (
                  <button
                    className="auth-btn auth-btn-secondary"
                    onClick={() => setShowManualToken(true)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                    Login to Existing Account
                  </button>
                ) : (
                  <>
                    {justCreatedAccount && (
                      <div style={{
                        background: 'rgba(34, 197, 94, 0.1)',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 24,
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 24, marginBottom: 8 }}>🎉</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>
                          Account Created Successfully!
                        </div>
                        <div style={{ fontSize: 13, color: '#a1a1aa' }}>
                          Account ID: <span style={{ fontFamily: 'monospace', color: '#fafafa' }}>{justCreatedAccount}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#71717a', marginTop: 8 }}>
                          Now create an API token to start trading
                        </div>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label">API Token</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Enter your Deriv API token"
                        value={manualToken}
                        onChange={(e) => setManualToken(e.target.value)}
                        style={{ fontFamily: 'monospace', fontSize: 14 }}
                      />
                    </div>

                    <button
                      className="auth-btn auth-btn-primary"
                      onClick={handleManualTokenSubmit}
                      disabled={isSubmitting || !manualToken.trim()}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                      {isSubmitting ? 'Connecting...' : 'Start Trading'}
                    </button>

                    <div className="info-box" style={{ marginTop: 20, background: 'rgba(99, 102, 241, 0.08)', borderColor: 'rgba(99, 102, 241, 0.15)' }}>
                      <div className="info-box-title" style={{ color: '#818cf8' }}>How to get your API Token</div>
                      <div className="info-box-text">
                        1. Go to <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8' }}>Deriv API Token</a><br/>
                        2. Login with the account you just created<br/>
                        3. Create a token with: Read, Trade, Payments<br/>
                        4. Copy and paste the token above
                      </div>
                    </div>

                    {!justCreatedAccount && (
                      <div
                        className="back-link"
                        onClick={() => {
                          setShowManualToken(false);
                          setManualToken('');
                        }}
                      >
                        Back
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {signupStep === 'verify' && (
              <>
                <div className="signup-steps">
                  <div className="step completed" />
                  <div className="step active" />
                  <div className="step" />
                </div>

                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 24,
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 13, color: '#22c55e', marginBottom: 4 }}>
                    Verification code sent to:
                  </div>
                  <div style={{ fontSize: 15, color: '#fafafa', fontWeight: 500 }}>
                    {signupEmail}
                  </div>
                  <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 8 }}>
                    Code expires in 10 minutes - enter it promptly
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Verification Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter code from email"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Create Password</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="e.g., MyPass123"
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#71717a' }}>
                    <div style={{ marginBottom: 4 }}>Password must contain:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                      <span style={{ color: signupPassword.length >= 8 && signupPassword.length <= 25 ? '#22c55e' : '#71717a' }}>
                        {signupPassword.length >= 8 && signupPassword.length <= 25 ? '✓' : '○'} 8-25 characters
                      </span>
                      <span style={{ color: /[a-z]/.test(signupPassword) ? '#22c55e' : '#71717a' }}>
                        {/[a-z]/.test(signupPassword) ? '✓' : '○'} Lowercase
                      </span>
                      <span style={{ color: /[A-Z]/.test(signupPassword) ? '#22c55e' : '#71717a' }}>
                        {/[A-Z]/.test(signupPassword) ? '✓' : '○'} Uppercase
                      </span>
                      <span style={{ color: /[0-9]/.test(signupPassword) ? '#22c55e' : '#71717a' }}>
                        {/[0-9]/.test(signupPassword) ? '✓' : '○'} Number
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  className="auth-btn auth-btn-primary"
                  onClick={handleCreateAccount}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Creating Account...' : 'Create Account'}
                </button>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 20 }}>
                  <span
                    className="back-link"
                    style={{ margin: 0 }}
                    onClick={async () => {
                      try {
                        setIsSubmitting(true);
                        const derivClient = new DerivClient();
                        await derivClient.connectPublic();
                        await derivClient.requestEmailVerification(signupEmail, 'account_opening');
                        derivClient.disconnect();
                        notifications.show({
                          title: 'Code Resent',
                          message: 'A new verification code has been sent to your email',
                          color: 'teal',
                        });
                      } catch (err: any) {
                        notifications.show({
                          title: 'Error',
                          message: err.message || 'Failed to resend code',
                          color: 'red',
                        });
                      } finally {
                        setIsSubmitting(false);
                      }
                    }}
                  >
                    Resend code
                  </span>
                  <span
                    className="back-link"
                    style={{ margin: 0 }}
                    onClick={() => {
                      setSignupStep('email');
                      setVerificationSent(false);
                      setVerificationCode('');
                      setSignupPassword('');
                      localStorage.removeItem(`deriv_signup_email_${referralCode}`);
                      localStorage.removeItem(`deriv_signup_residence_${referralCode}`);
                    }}
                  >
                    Use different email
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');

          * { box-sizing: border-box; margin: 0; padding: 0; }

          body {
            background: #06060a;
            font-family: 'Inter', sans-serif;
          }

          .loader-wrap {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(ellipse at 50% 0%, rgba(255, 68, 79, 0.1) 0%, transparent 60%), #06060a;
          }

          .loader-content { text-align: center; }

          .loader-ring {
            width: 80px;
            height: 80px;
            border: 2px solid rgba(255, 68, 79, 0.1);
            border-top-color: #FF444F;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 32px;
            position: relative;
          }

          .loader-ring::before {
            content: '';
            position: absolute;
            inset: 6px;
            border: 2px solid rgba(255, 68, 79, 0.05);
            border-top-color: rgba(255, 68, 79, 0.5);
            border-radius: 50%;
            animation: spin 0.8s linear reverse infinite;
          }

          .loader-text {
            color: #52525b;
            font-size: 13px;
            letter-spacing: 2px;
            text-transform: uppercase;
          }

          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
        <div className="loader-wrap">
          <div className="loader-content">
            <div className="loader-ring" />
            <p className="loader-text">Connecting to Markets</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Mono:wght@400;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #0b0e11;
          font-family: 'Inter', sans-serif;
          color: #eaecef;
          overflow-x: hidden;
        }

        /* Binance-style Trading Terminal */
        .terminal {
          min-height: 100vh;
          background: #0b0e11;
        }

        /* Top Ticker Bar */
        .ticker-bar {
          background: #1e2329;
          border-bottom: 1px solid #2b3139;
          padding: 0 16px;
        }

        .ticker-inner {
          display: flex;
          align-items: center;
          height: 64px;
          gap: 32px;
        }

        .ticker-logo {
          display: flex;
          align-items: center;
          padding-right: 24px;
          border-right: 1px solid #2b3139;
        }

        .logo-img {
          height: 32px;
          width: auto;
        }

        .ticker-symbol {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-right: 24px;
          border-right: 1px solid #2b3139;
        }

        .symbol-select {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 8px 12px;
          border-radius: 4px;
          transition: background 0.15s;
        }

        .symbol-select:hover {
          background: #2b3139;
        }

        .symbol-icon {
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #f0b90b, #f8d12f);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          color: #0b0e11;
        }

        .symbol-name {
          font-size: 20px;
          font-weight: 700;
          color: #eaecef;
        }

        .symbol-type {
          font-size: 12px;
          color: #848e9c;
          background: #2b3139;
          padding: 2px 6px;
          border-radius: 2px;
        }

        .symbol-dropdown-icon {
          color: #848e9c;
        }

        .ticker-price {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ticker-price-value {
          font-size: 24px;
          font-weight: 700;
          font-family: 'Space Mono', monospace;
        }

        .ticker-price-value.up { color: #0ecb81; }
        .ticker-price-value.down { color: #f6465d; }
        .ticker-price-value.neutral { color: #eaecef; }

        .ticker-price-usd {
          font-size: 12px;
          color: #848e9c;
        }

        .ticker-stats {
          display: flex;
          gap: 24px;
          flex: 1;
        }

        .ticker-stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ticker-stat-label {
          font-size: 11px;
          color: #848e9c;
        }

        .ticker-stat-value {
          font-size: 14px;
          font-family: 'Space Mono', monospace;
          color: #eaecef;
        }

        .ticker-stat-value.green { color: #0ecb81; }
        .ticker-stat-value.red { color: #f6465d; }

        .ticker-account {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-left: auto;
        }

        .user-name {
          font-size: 14px;
          font-weight: 600;
          color: #eaecef;
          padding: 8px 12px;
          background: #2b3139;
          border-radius: 4px;
        }

        .account-balance {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #2b3139;
          padding: 8px 16px;
          border-radius: 4px;
        }

        .balance-label {
          font-size: 12px;
          color: #848e9c;
        }

        .balance-value {
          font-size: 16px;
          font-weight: 700;
          font-family: 'Space Mono', monospace;
          color: #0ecb81;
        }

        .logout-btn {
          padding: 8px 16px;
          background: transparent;
          border: 1px solid #f6465d;
          border-radius: 4px;
          color: #f6465d;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
        }

        .logout-btn:hover {
          background: rgba(246, 70, 93, 0.1);
        }

        /* Symbol Dropdown */
        .symbol-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          width: 280px;
          background: #1e2329;
          border: 1px solid #2b3139;
          border-radius: 4px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          z-index: 100;
          max-height: 320px;
          overflow-y: auto;
        }

        .symbol-dropdown-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid #2b3139;
        }

        .symbol-dropdown-item:last-child {
          border-bottom: none;
        }

        .symbol-dropdown-item:hover {
          background: #2b3139;
        }

        .symbol-dropdown-item.active {
          background: rgba(240, 185, 11, 0.1);
        }

        .symbol-dropdown-dot {
          width: 8px;
          height: 8px;
          background: #0ecb81;
          border-radius: 50%;
        }

        .symbol-dropdown-name {
          font-size: 14px;
          font-weight: 500;
          color: #eaecef;
        }

        /* Main Trading Layout */
        .trading-layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          height: calc(100vh - 64px);
          overflow: hidden;
        }

        /* Chart Section */
        .chart-section {
          background: #0b0e11;
          border-right: 1px solid #2b3139;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chart-container {
          flex: 0 0 auto;
          height: 420px;
          min-height: 0;
        }

        /* Order Panel - Binance Style */
        .order-panel {
          background: #1e2329;
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .order-header {
          padding: 16px;
          border-bottom: 1px solid #2b3139;
        }

        .order-tabs {
          display: flex;
          gap: 0;
        }

        .order-tab {
          flex: 1;
          padding: 10px 16px;
          background: transparent;
          border: none;
          color: #848e9c;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
          border-bottom: 2px solid transparent;
        }

        .order-tab:hover {
          color: #eaecef;
        }

        .order-tab.active {
          color: #f0b90b;
          border-bottom-color: #f0b90b;
        }

        .order-body {
          padding: 16px;
          flex: 1;
          overflow-y: auto;
        }

        .order-field {
          margin-bottom: 16px;
        }

        .order-field-label {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px;
          color: #848e9c;
        }

        .order-field-max {
          color: #f0b90b;
          cursor: pointer;
        }

        .order-input-wrap {
          position: relative;
        }

        .order-input {
          width: 100%;
          padding: 12px 60px 12px 16px;
          background: #2b3139;
          border: 1px solid #2b3139;
          border-radius: 4px;
          color: #eaecef;
          font-size: 16px;
          font-family: 'Space Mono', monospace;
          transition: all 0.15s;
        }

        .order-input:focus {
          outline: none;
          border-color: #f0b90b;
        }

        /* Show Analysis Button */
        .show-analysis-btn {
          width: 100%;
          margin-top: 16px;
          padding: 14px 20px;
          border-radius: 12px;
          border: 1px solid rgba(255, 68, 79, 0.3);
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.1) 0%, rgba(255, 68, 79, 0.03) 100%);
          color: #FF444F;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .show-analysis-btn:hover {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.18) 0%, rgba(255, 68, 79, 0.06) 100%);
          border-color: rgba(255, 68, 79, 0.5);
          transform: translateY(-1px);
        }

        .show-analysis-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }

        /* Affiliate Signals Panel */
        .signals-panel {
          margin-top: 16px;
          background: linear-gradient(180deg, rgba(255, 68, 79, 0.08) 0%, rgba(15, 15, 20, 0.6) 100%);
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 14px;
          overflow: hidden;
        }

        .signals-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .signals-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
          font-weight: 600;
          color: #fafafa;
        }

        .signals-toggle {
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #a1a1aa;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .signals-toggle:hover {
          background: rgba(255, 255, 255, 0.1);
          color: #fafafa;
        }

        .signals-list {
          padding: 12px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .signal-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          min-width: 160px;
          transition: all 0.2s;
        }

        .signal-item:hover {
          background: rgba(255, 255, 255, 0.06);
          transform: translateY(-1px);
        }

        .signal-item.buy {
          border-color: rgba(34, 197, 94, 0.25);
          background: rgba(34, 197, 94, 0.05);
        }

        .signal-item.sell {
          border-color: rgba(255, 68, 79, 0.25);
          background: rgba(255, 68, 79, 0.05);
        }

        .signal-icon {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }

        .signal-item.buy .signal-icon {
          background: rgba(34, 197, 94, 0.15);
        }

        .signal-item.sell .signal-icon {
          background: rgba(255, 68, 79, 0.15);
        }

        .signal-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .signal-type {
          font-size: 12px;
          font-weight: 600;
          color: #fafafa;
        }

        .signal-price {
          font-size: 11px;
          color: #71717a;
          font-family: 'JetBrains Mono', monospace;
        }

        .signal-diff {
          font-size: 11px;
          font-weight: 500;
          font-family: 'JetBrains Mono', monospace;
          padding: 4px 8px;
          border-radius: 4px;
          margin-left: auto;
        }

        .signal-diff.above {
          color: #22c55e;
          background: rgba(34, 197, 94, 0.1);
        }

        .signal-diff.below {
          color: #FF444F;
          background: rgba(255, 68, 79, 0.1);
        }

        .order-input-suffix {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #848e9c;
          font-size: 14px;
        }

        .order-presets {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin-top: 8px;
        }

        .order-preset {
          padding: 8px;
          background: #2b3139;
          border: 1px solid #2b3139;
          border-radius: 4px;
          color: #848e9c;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
        }

        .order-preset:hover {
          background: #363d47;
          color: #eaecef;
        }

        .order-preset.active {
          background: rgba(240, 185, 11, 0.15);
          border-color: #f0b90b;
          color: #f0b90b;
        }

        /* Leverage Slider */
        .leverage-slider {
          margin-top: 8px;
        }

        .slider {
          width: 100%;
          height: 4px;
          background: #2b3139;
          border-radius: 2px;
          outline: none;
          -webkit-appearance: none;
          margin-bottom: 12px;
        }

        .slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          background: #f0b90b;
          border-radius: 50%;
          cursor: pointer;
        }

        .leverage-presets {
          display: flex;
          gap: 6px;
        }

        .leverage-preset {
          flex: 1;
          padding: 6px;
          background: #2b3139;
          border: 1px solid #2b3139;
          border-radius: 4px;
          color: #848e9c;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
          text-align: center;
        }

        .leverage-preset:hover {
          background: #363d47;
          color: #eaecef;
        }

        .leverage-preset.active {
          background: rgba(240, 185, 11, 0.15);
          border-color: #f0b90b;
          color: #f0b90b;
        }

        /* TP/SL Section */
        .tpsl-section {
          margin-bottom: 16px;
          padding: 12px;
          background: #181c21;
          border-radius: 4px;
        }

        .tpsl-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 12px;
          color: #848e9c;
        }

        .tpsl-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .tpsl-field label {
          display: block;
          font-size: 10px;
          color: #848e9c;
          margin-bottom: 4px;
        }

        .tpsl-input {
          padding: 10px 12px !important;
          font-size: 13px !important;
        }

        /* Order Info */
        .order-info {
          margin-bottom: 16px;
          padding: 12px;
          background: #181c21;
          border-radius: 4px;
        }

        .order-info-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 12px;
        }

        .order-info-row span:first-child {
          color: #848e9c;
        }

        .order-info-row span:last-child {
          color: #eaecef;
          font-family: 'Space Mono', monospace;
        }

        /* Trade Buttons - Side by Side */
        .trade-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 24px;
        }

        .trade-btn {
          padding: 16px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
          text-transform: uppercase;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .trade-btn.long {
          background: #0ecb81;
          color: #0b0e11;
        }

        .trade-btn.long:hover {
          background: #14d990;
        }

        .trade-btn.short {
          background: #f6465d;
          color: white;
        }

        .trade-btn.short:hover {
          background: #ff5a70;
        }

        .trade-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .trade-btn-label {
          font-size: 16px;
          font-weight: 700;
        }

        .trade-btn-sub {
          font-size: 11px;
          opacity: 0.8;
          font-weight: 500;
        }

        /* Live Price Display */
        .live-price-display {
          margin-top: 16px;
          padding: 16px;
          background: #2b3139;
          border-radius: 4px;
          text-align: center;
        }

        .live-price-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11px;
          color: #848e9c;
          margin-bottom: 4px;
        }

        .live-dot {
          width: 6px;
          height: 6px;
          background: #0ecb81;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .live-price-value {
          font-size: 28px;
          font-weight: 700;
          font-family: 'Space Mono', monospace;
          color: #eaecef;
        }

        /* Positions Section */
        .positions-section {
          background: #1e2329;
          border-top: 1px solid #2b3139;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }

        .positions-header {
          display: flex;
          border-bottom: 1px solid #2b3139;
        }

        .positions-tab {
          padding: 12px 24px;
          background: transparent;
          border: none;
          color: #848e9c;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
          position: relative;
        }

        .positions-tab:hover {
          color: #eaecef;
        }

        .positions-tab.active {
          color: #eaecef;
        }

        .positions-tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: #f0b90b;
        }

        .positions-tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 6px;
          margin-left: 6px;
          background: #f0b90b;
          border-radius: 9px;
          font-size: 11px;
          font-weight: 700;
          color: #0b0e11;
        }

        .positions-body {
          padding: 12px 16px;
          flex: 1;
          overflow-y: auto;
          min-height: 0;
        }

        .positions-empty {
          text-align: center;
          padding: 16px;
          color: #848e9c;
          font-size: 13px;
        }

        .position-row {
          display: grid;
          grid-template-columns: 80px 60px 80px 90px 90px 80px auto;
          align-items: center;
          gap: 8px;
          padding: 12px 0;
          border-bottom: 1px solid #2b3139;
          font-size: 12px;
        }

        .position-row:last-child {
          border-bottom: none;
        }

        .position-symbol {
          font-weight: 600;
          color: #eaecef;
        }

        .position-side {
          padding: 4px 8px;
          border-radius: 2px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .position-side.long {
          background: rgba(14, 203, 129, 0.15);
          color: #0ecb81;
        }

        .position-side.short {
          background: rgba(246, 70, 93, 0.15);
          color: #f6465d;
        }

        .position-value {
          font-family: 'Space Mono', monospace;
          color: #eaecef;
        }

        .position-pnl {
          font-family: 'Space Mono', monospace;
          font-weight: 600;
        }

        .position-pnl.profit { color: #0ecb81; }
        .position-pnl.loss { color: #f6465d; }

        .position-close {
          padding: 6px 12px;
          background: transparent;
          border: 1px solid #f6465d;
          border-radius: 2px;
          color: #f6465d;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Inter', sans-serif;
        }

        .position-close:hover {
          background: rgba(246, 70, 93, 0.15);
        }

        /* History Row */
        .history-row {
          display: grid;
          grid-template-columns: 100px 120px 80px 100px 100px;
          align-items: center;
          gap: 16px;
          padding: 10px 0;
          border-bottom: 1px solid #2b3139;
          font-size: 12px;
          color: #848e9c;
        }

        .history-row:last-child {
          border-bottom: none;
        }

        .history-time {
          font-family: 'Space Mono', monospace;
        }

        .history-symbol {
          color: #eaecef;
          font-weight: 500;
        }

        .history-side {
          padding: 2px 6px;
          border-radius: 2px;
          font-size: 10px;
          font-weight: 700;
        }

        .history-side.long {
          background: rgba(14, 203, 129, 0.15);
          color: #0ecb81;
        }

        .history-side.short {
          background: rgba(246, 70, 93, 0.15);
          color: #f6465d;
        }

        .history-amount {
          font-family: 'Space Mono', monospace;
        }

        .history-pnl {
          font-family: 'Space Mono', monospace;
          font-weight: 600;
        }

        .history-pnl.profit { color: #0ecb81; }
        .history-pnl.loss { color: #f6465d; }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #1e2329; }
        ::-webkit-scrollbar-thumb { background: #2b3139; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: #363d47; }

        /* Responsive */
        @media (max-width: 1024px) {
          .trading-layout {
            grid-template-columns: 1fr;
          }
          .order-panel {
            order: -1;
          }
          .ticker-stats {
            display: none;
          }
        }
      `}</style>

      <div className="terminal">
        {/* Top Ticker Bar */}
        <div className="ticker-bar">
          <div className="ticker-inner">
            {/* Logo */}
            <div className="ticker-logo">
              <img src="/LunarDark.svg" alt="Logo" className="logo-img" />
            </div>

            {/* Symbol Selector */}
            <div className="ticker-symbol" style={{ position: 'relative' }}>
              <div className="symbol-select" onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}>
                <div className="symbol-icon">
                  {getSymbolLabel().charAt(0)}
                </div>
                <span className="symbol-name">{getSymbolLabel()}</span>
                <span className="symbol-type">Perpetual</span>
                <svg className="symbol-dropdown-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {symbolDropdownOpen && (
                <div className="symbol-dropdown">
                  {availableSymbols.map(s => (
                    <div
                      key={s.value}
                      className={`symbol-dropdown-item ${symbol === s.value ? 'active' : ''}`}
                      onClick={() => handleSymbolChange(s.value)}
                    >
                      <div className="symbol-dropdown-dot" />
                      <span className="symbol-dropdown-name">{s.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Price */}
            <div className="ticker-price">
              <span className={`ticker-price-value ${priceChangePercent >= 0 ? 'up' : 'down'}`}>
                {formatPrice(currentPrice)}
              </span>
              <span className="ticker-price-usd">${formatPrice(currentPrice)} USD</span>
            </div>

            {/* Stats */}
            <div className="ticker-stats">
              <div className="ticker-stat">
                <span className="ticker-stat-label">24h Change</span>
                <span className={`ticker-stat-value ${priceChangePercent >= 0 ? 'green' : 'red'}`}>
                  {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                </span>
              </div>
              <div className="ticker-stat">
                <span className="ticker-stat-label">24h High</span>
                <span className="ticker-stat-value">{formatPrice(highPrice)}</span>
              </div>
              <div className="ticker-stat">
                <span className="ticker-stat-label">24h Low</span>
                <span className="ticker-stat-value">{formatPrice(lowPrice)}</span>
              </div>
            </div>

            {/* Account */}
            <div className="ticker-account">
              {userName && <span className="user-name">{userName}</span>}
              <div className="account-balance">
                <span className="balance-label">Balance:</span>
                <span className="balance-value">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
              <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </div>
        {/* Main Trading Layout */}
        <div className="trading-layout">
          {/* Chart */}
          <div className="chart-section">
            <div className="chart-container">
              {symbol && (
                <TradingViewChart
                  symbol={symbol}
                  theme="dark"
                  currentPrice={currentPrice}
                  positions={openPositions.map(pos => ({
                    id: pos.contractId,
                    entryPrice: pos.entryPrice,
                    direction: pos.direction,
                    takeProfit: pos.takeProfit,
                    stopLoss: pos.stopLoss,
                  }))}
                  onUpdatePosition={(id, updates) => {
                    setOpenPositions(prev => prev.map(pos =>
                      pos.contractId === id
                        ? { ...pos, ...updates }
                        : pos
                    ));
                  }}
                  drawings={showSignals ? affiliateSignals : undefined}
                />
              )}
            </div>

            {/* Positions - inside chart section */}
            <div className="positions-section">
              <div className="positions-header">
                <button
                  className={`positions-tab ${activeTab === 'positions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('positions')}
                >
                  Positions
                  {openPositions.length > 0 && (
                    <span className="positions-tab-badge">{openPositions.length}</span>
                  )}
                </button>
                <button
                  className={`positions-tab ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  Trade History
                </button>
              </div>

              <div className="positions-body">
                {activeTab === 'positions' && (
                  <>
                    {openPositions.length === 0 ? (
                      <div className="positions-empty">No open positions</div>
                    ) : (
                      openPositions.map((pos) => (
                        <div key={pos.contractId} className="position-row">
                          <span className="position-symbol">{pos.symbol}</span>
                          <span className={`position-side ${pos.direction === 'CALL' ? 'long' : 'short'}`}>
                            {pos.direction === 'CALL' ? 'Long' : 'Short'}
                          </span>
                          <span className="position-value">${pos.buyPrice.toFixed(2)}</span>
                          <span className="position-value">{formatPrice(pos.entryPrice)}</span>
                          <span className="position-value">{formatPrice(pos.currentPrice)}</span>
                          <span className={`position-pnl ${pos.profit >= 0 ? 'profit' : 'loss'}`}>
                            {pos.profit >= 0 ? '+' : ''}${pos.profit.toFixed(2)}
                          </span>
                          <button className="position-close" onClick={() => sellPosition(pos.contractId)}>
                            Close
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}

                {activeTab === 'history' && (
                  <>
                    {(() => { console.log('[Trade] Rendering history tab, tradeHistory.length:', tradeHistory.length); return null; })()}
                    {tradeHistory.length === 0 ? (
                      <div className="positions-empty">No trade history</div>
                    ) : (
                      tradeHistory.slice(0, 10).map((trade) => (
                        <div key={trade.id} className="history-row">
                          <span className="history-time">
                            {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="history-symbol">{trade.symbol}</span>
                          <span className={`history-side ${trade.contractType === 'CALL' ? 'long' : 'short'}`}>
                            {trade.contractType === 'CALL' ? 'Long' : 'Short'}
                          </span>
                          <span className="history-amount">${trade.amount.toFixed(2)}</span>
                          <span className={`history-pnl ${(trade.profit ?? 0) >= 0 ? 'profit' : 'loss'}`}>
                            {(trade.profit ?? 0) >= 0 ? '+' : ''}${(trade.profit ?? 0).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Order Panel */}
          <div className="order-panel">
            <div className="order-header">
              <div className="order-tabs">
                <button
                  className={`order-tab ${orderType === 'market' ? 'active' : ''}`}
                  onClick={() => setOrderType('market')}
                >
                  Market
                </button>
                <button
                  className={`order-tab ${orderType === 'limit' ? 'active' : ''}`}
                  onClick={() => setOrderType('limit')}
                >
                  Limit
                </button>
              </div>
            </div>

            <div className="order-body">
              {/* Leverage */}
              <div className="order-field">
                <div className="order-field-label">
                  <span>Leverage</span>
                  <span style={{ color: '#f0b90b' }}>{leverage}x</span>
                </div>
                <div className="leverage-slider">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={leverage}
                    onChange={(e) => setLeverage(Number(e.target.value))}
                    className="slider"
                  />
                  <div className="leverage-presets">
                    {[5, 10, 25, 50, 100].map((lev) => (
                      <button
                        key={lev}
                        className={`leverage-preset ${leverage === lev ? 'active' : ''}`}
                        onClick={() => setLeverage(lev)}
                      >
                        {lev}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Size / Amount */}
              <div className="order-field">
                <div className="order-field-label">
                  <span>Size</span>
                  <span className="order-field-max" onClick={() => setAmount(Math.floor(balance * 0.9))}>Max</span>
                </div>
                <div className="order-input-wrap">
                  <input
                    type="number"
                    className="order-input"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 100)}
                    min={1}
                  />
                  <span className="order-input-suffix">USD</span>
                </div>
                <div className="order-presets">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      className={`order-preset`}
                      onClick={() => setAmount(Math.floor(balance * pct / 100))}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Limit Price (only for limit orders) */}
              {orderType === 'limit' && (
                <div className="order-field">
                  <div className="order-field-label">
                    <span>Limit Price</span>
                  </div>
                  <div className="order-input-wrap">
                    <input
                      type="number"
                      className="order-input"
                      value={limitPrice || currentPrice}
                      onChange={(e) => setLimitPrice(Number(e.target.value))}
                      step="0.01"
                    />
                    <span className="order-input-suffix">USD</span>
                  </div>
                </div>
              )}

              {/* TP/SL Section */}
              <div className="tpsl-section">
                <div className="tpsl-header">
                  <span>TP/SL</span>
                  <span style={{ fontSize: '11px', color: '#848e9c' }}>Optional</span>
                </div>
                <div className="tpsl-row">
                  <div className="tpsl-field">
                    <label>Take Profit</label>
                    <div className="order-input-wrap">
                      <input
                        type="number"
                        className="order-input tpsl-input"
                        value={takeProfit}
                        onChange={(e) => setTakeProfit(e.target.value)}
                        placeholder="TP Price"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div className="tpsl-field">
                    <label>Stop Loss</label>
                    <div className="order-input-wrap">
                      <input
                        type="number"
                        className="order-input tpsl-input"
                        value={stopLoss}
                        onChange={(e) => setStopLoss(e.target.value)}
                        placeholder="SL Price"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Info */}
              <div className="order-info">
                <div className="order-info-row">
                  <span>Entry Price</span>
                  <span>{formatPrice(currentPrice)}</span>
                </div>
                <div className="order-info-row">
                  <span>Position Size</span>
                  <span>${(amount * leverage).toLocaleString()}</span>
                </div>
                <div className="order-info-row">
                  <span>Liquidation Price</span>
                  <span style={{ color: '#f6465d' }}>~${(currentPrice * 0.95).toFixed(2)}</span>
                </div>
              </div>

              {/* Trade Buttons */}
              <div className="trade-buttons">
                <button
                  className="trade-btn long"
                  onClick={() => executeTrade('CALL')}
                  disabled={isBuying || !symbol}
                >
                  <span className="trade-btn-label">{isBuying ? 'Opening...' : `Long ${leverage}x`}</span>
                  <span className="trade-btn-sub">Buy / Open Long</span>
                </button>

                <button
                  className="trade-btn short"
                  onClick={() => executeTrade('PUT')}
                  disabled={isBuying || !symbol}
                >
                  <span className="trade-btn-label">{isBuying ? 'Opening...' : `Short ${leverage}x`}</span>
                  <span className="trade-btn-sub">Sell / Open Short</span>
                </button>
              </div>

              {/* Show Analysis Button */}
              <button
                className="show-analysis-btn"
                onClick={fetchAnalysis}
                disabled={analysisLoading}
              >
                {analysisLoading ? (
                  <span>Loading...</span>
                ) : showSignals ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                    Hide Analysis
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="2" />
                      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                    </svg>
                    Show Analysis
                  </>
                )}
              </button>

              {/* Analysis info when showing */}
              {showSignals && affiliateSignals.length > 0 && (
                <div className="signals-panel">
                  <div className="signals-header">
                    <div className="signals-title">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF444F" strokeWidth="2">
                        <circle cx="12" cy="12" r="2" />
                        <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49" />
                      </svg>
                      <span style={{ color: '#FF444F' }}>Partner Analysis</span>
                      <span style={{ fontSize: 11, color: '#848e9c' }}>{affiliateSignals.length} drawing{affiliateSignals.length !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                      onClick={() => { setShowSignals(false); setAffiliateSignals([]); }}
                      style={{ background: 'none', border: 'none', color: '#848e9c', cursor: 'pointer', padding: 4 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Live Price */}
              <div className="live-price-display">
                <div className="live-price-label">
                  <div className="live-dot" />
                  Mark Price
                </div>
                <div className="live-price-value">{formatPrice(currentPrice)}</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
