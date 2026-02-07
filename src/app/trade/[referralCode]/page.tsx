'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import dynamic from 'next/dynamic';
import { getAffiliateByReferralCode, getAffiliateByReferralCodeAsync, createClient, createClientAsync, updateClientTokenAsync, getClients, getClientsAsync, addTrade, addTradeAsync, updateTrade, updateTradeAsync, getTrades } from '@/lib/store';

// Dynamic import for TradingView chart (client-side only)
const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06060a', borderRadius: '12px' }}>
      <span style={{ color: '#666' }}>Loading chart...</span>
    </div>
  ),
});
import { DerivClient, generateOAuthUrl } from '@/lib/deriv';
import { Trade, Drawing, PriceMarkerDrawing } from '@/types';
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

  const [symbol, setSymbol] = useState('');
  const [availableSymbols, setAvailableSymbols] = useState<Array<{ value: string; label: string }>>([]);
  const [amount, setAmount] = useState<number>(10);
  const [duration, setDuration] = useState<number>(1);
  const [durationUnit, setDurationUnit] = useState<string>('m');
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'history'>('positions');
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false);
  const [highPrice, setHighPrice] = useState<number>(0);
  const [lowPrice, setLowPrice] = useState<number>(0);
  const [priceChangePercent, setPriceChangePercent] = useState<number>(0);

  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [tradeHistory, setTradeHistory] = useState<Trade[]>([]);
  const [isBuying, setIsBuying] = useState(false);

  // Affiliate signals
  const [affiliateSignals, setAffiliateSignals] = useState<Drawing[]>([]);
  const [showSignals, setShowSignals] = useState(true);

  const derivClientRef = useRef<DerivClient | null>(null);
  const lastPriceRef = useRef<number>(0);
  const openPriceRef = useRef<number>(0);

  const durationOptions = [
    { value: 't', label: 'Ticks' },
    { value: 's', label: 'Seconds' },
    { value: 'm', label: 'Minutes' },
    { value: 'h', label: 'Hours' },
  ];

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
        await derivClient.connect(userToken);
        setIsConnected(true);

        const balanceRes = await derivClient.getBalance(true);
        setBalance(balanceRes.balance.balance);
        setAccountId(balanceRes.balance.loginid);
        setAccountType(derivClient.getAccountType(balanceRes.balance.loginid));

        derivClient.subscribeToBalance((data) => {
          setBalance(data.balance.balance);
        });

        const activeSymbols = await derivClient.getActiveSymbols();
        const openSymbols = activeSymbols.filter(s => s.isOpen);

        // Get forex pairs
        const forexSymbols = openSymbols
          .filter(s => s.market === 'forex')
          .map(s => ({ value: s.symbol, label: s.display_name }));

        // Get crypto symbols
        const cryptoSymbols = openSymbols
          .filter(s => s.market === 'cryptocurrency')
          .map(s => ({ value: s.symbol, label: s.display_name }));

        // Only forex and crypto - no synthetic indices
        let symbolsToUse = [...forexSymbols, ...cryptoSymbols];

        if (symbolsToUse.length === 0) {
          notifications.show({
            title: 'No Markets Available',
            message: 'All markets are currently closed. Please try again later.',
            color: 'yellow',
          });
        }

        setAvailableSymbols(symbolsToUse);

        const defaultSymbol = symbolsToUse[0]?.value || 'frxEURUSD';
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

  // Load affiliate signals/drawings from partner broadcast
  useEffect(() => {
    const loadAffiliateSignals = () => {
      try {
        let allSignals: Drawing[] = [];

        // First, try to load from partner's broadcast (main dashboard owner)
        const partnerData = localStorage.getItem(`broadcast_partner_${symbol}`);
        if (partnerData) {
          const parsed = JSON.parse(partnerData);
          if (parsed.drawings && Array.isArray(parsed.drawings)) {
            allSignals = [...allSignals, ...parsed.drawings];
          }
        } else {
          // Fallback to general partner drawings
          const partnerGeneral = localStorage.getItem('broadcast_partner_drawings');
          if (partnerGeneral) {
            const drawings = JSON.parse(partnerGeneral);
            const relevantSignals = drawings.filter((d: Drawing) =>
              d.symbol === symbol || d.type === 'pricemarker'
            );
            allSignals = [...allSignals, ...relevantSignals];
          }
        }

        // Also check for affiliate-specific broadcasts (if any)
        const affiliateData = localStorage.getItem(`broadcast_${referralCode}_${symbol}`);
        if (affiliateData) {
          const parsed = JSON.parse(affiliateData);
          if (parsed.drawings && Array.isArray(parsed.drawings)) {
            allSignals = [...allSignals, ...parsed.drawings];
          }
        }

        setAffiliateSignals(allSignals);
      } catch (e) {
        console.error('Failed to load affiliate signals:', e);
      }
    };

    if (symbol) {
      loadAffiliateSignals();
      // Poll for updates every 5 seconds
      const interval = setInterval(loadAffiliateSignals, 5000);
      return () => clearInterval(interval);
    }
  }, [symbol, referralCode]);

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
      await derivClient.connect(manualToken.trim());

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

  const executeTrade = async (direction: 'CALL' | 'PUT') => {
    if (!derivClientRef.current || isBuying || !symbol) return;

    setIsBuying(true);

    try {
      const proposal = await derivClientRef.current.getProposal({
        symbol,
        amount,
        contractType: direction,
        duration,
        durationUnit: durationUnit as 's' | 'm' | 'h' | 't',
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

          const tradeUpdate: { sellPrice: number | undefined; profit: number; status: 'won' | 'lost' | 'sold' } = {
            sellPrice: poc.exit_tick,
            profit: poc.profit,
            status: poc.status === 'won' ? 'won' : poc.status === 'lost' ? 'lost' : 'sold',
          };

          // Update in both memory and Supabase
          updateTrade(poc.contract_id, tradeUpdate);
          updateTradeAsync(poc.contract_id, tradeUpdate).catch(err =>
            console.error('[Trade] Failed to update in database:', err)
          );

          setTradeHistory(getTrades().filter(t => t.accountId === clientId));

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

  const sellPosition = async (contractId: number) => {
    if (!derivClientRef.current) return;

    try {
      await derivClientRef.current.sell(contractId, 0);
      notifications.show({
        title: 'Position Closed',
        message: 'Trade sold successfully',
        color: 'blue',
      });
    } catch (err: any) {
      notifications.show({
        title: 'Sell Failed',
        message: err.message || 'Failed to sell position',
        color: 'red',
      });
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
            max-width: 400px;
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
          background: #06060a;
          font-family: 'Inter', sans-serif;
          color: #fafafa;
          overflow-x: hidden;
        }

        /* Keyframes */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(255, 68, 79, 0.4)); }
          50% { filter: drop-shadow(0 0 20px rgba(255, 68, 79, 0.6)); }
        }

        @keyframes priceUp {
          0% { color: #fafafa; }
          50% { color: #22c55e; text-shadow: 0 0 20px rgba(34, 197, 94, 0.5); }
          100% { color: #fafafa; }
        }

        @keyframes priceDown {
          0% { color: #fafafa; }
          50% { color: #FF444F; text-shadow: 0 0 20px rgba(255, 68, 79, 0.5); }
          100% { color: #fafafa; }
        }

        @keyframes borderGlow {
          0%, 100% { border-color: rgba(255, 68, 79, 0.2); }
          50% { border-color: rgba(255, 68, 79, 0.5); }
        }

        @keyframes livePulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0; }
        }

        .fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .fade-in-1 { animation-delay: 0.1s; opacity: 0; }
        .fade-in-2 { animation-delay: 0.2s; opacity: 0; }
        .fade-in-3 { animation-delay: 0.3s; opacity: 0; }

        /* Terminal Container */
        .terminal {
          min-height: 100vh;
          background:
            radial-gradient(ellipse at 20% 0%, rgba(255, 68, 79, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 100%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
            linear-gradient(180deg, #06060a 0%, #0a0a0f 100%);
        }

        /* Header */
        .header {
          background: rgba(10, 10, 15, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .header-inner {
          max-width: 1800px;
          margin: 0 auto;
          padding: 16px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .logo-area {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .logo {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b73 50%, #FF444F 100%);
          background-size: 200% 200%;
          animation: glow 3s ease-in-out infinite;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          color: white;
          letter-spacing: -1px;
        }

        .brand {
          display: flex;
          flex-direction: column;
        }

        .brand-name {
          font-weight: 700;
          font-size: 18px;
          color: #fafafa;
          letter-spacing: -0.5px;
        }

        .brand-sub {
          font-size: 11px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .badge {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .badge-glass {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.06);
          color: #a1a1aa;
        }

        .badge-affiliate {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
          border: 1px solid rgba(139, 92, 246, 0.2);
          color: #a5b4fc;
        }

        .badge-live {
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          position: relative;
        }

        .live-dot::after {
          content: '';
          position: absolute;
          inset: 0;
          background: #22c55e;
          border-radius: 50%;
          animation: livePulse 2s ease-out infinite;
        }

        .badge-balance {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.1) 100%);
          border: 1px solid rgba(34, 197, 94, 0.25);
          color: #4ade80;
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          font-size: 15px;
        }

        .logout-btn {
          padding: 8px 16px;
          background: rgba(255, 68, 79, 0.1);
          border: 1px solid rgba(255, 68, 79, 0.2);
          border-radius: 8px;
          color: #FF444F;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .logout-btn:hover {
          background: rgba(255, 68, 79, 0.2);
          border-color: #FF444F;
        }

        /* Main Layout */
        .main {
          max-width: 1800px;
          margin: 0 auto;
          padding: 24px 32px;
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 24px;
        }

        /* Chart Panel */
        .chart-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .chart-card {
          background: linear-gradient(180deg, rgba(15, 15, 20, 0.8) 0%, rgba(10, 10, 15, 0.6) 100%);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          overflow: hidden;
        }

        .chart-top {
          padding: 20px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .chart-left {
          display: flex;
          align-items: center;
          gap: 24px;
        }

        /* Custom Dropdown */
        .dropdown {
          position: relative;
        }

        .dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 18px;
          background: rgba(255, 68, 79, 0.08);
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
          min-width: 200px;
        }

        .dropdown-trigger:hover {
          background: rgba(255, 68, 79, 0.12);
          border-color: rgba(255, 68, 79, 0.3);
        }

        .dropdown-trigger.open {
          border-color: #FF444F;
          box-shadow: 0 0 0 3px rgba(255, 68, 79, 0.1);
        }

        .dropdown-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b73 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dropdown-text {
          flex: 1;
          text-align: left;
        }

        .dropdown-label {
          font-size: 10px;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 2px;
        }

        .dropdown-value {
          font-size: 14px;
          font-weight: 600;
          color: #fafafa;
        }

        .dropdown-arrow {
          color: #71717a;
          transition: transform 0.2s;
        }

        .dropdown-trigger.open .dropdown-arrow {
          transform: rotate(180deg);
        }

        .dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #13131a;
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          z-index: 50;
          max-height: 300px;
          overflow-y: auto;
        }

        .dropdown-item {
          padding: 12px 18px;
          cursor: pointer;
          transition: all 0.15s;
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .dropdown-item:last-child {
          border-bottom: none;
        }

        .dropdown-item:hover {
          background: rgba(255, 68, 79, 0.1);
        }

        .dropdown-item.active {
          background: rgba(255, 68, 79, 0.15);
          color: #FF444F;
        }

        .dropdown-item-icon {
          width: 8px;
          height: 8px;
          background: #22c55e;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .dropdown-item-text {
          font-size: 14px;
          color: #e4e4e7;
        }

        .dropdown-item.active .dropdown-item-text {
          color: #FF444F;
          font-weight: 500;
        }

        /* Price Display */
        .price-area {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .price-row {
          display: flex;
          align-items: baseline;
          gap: 12px;
        }

        .price-main {
          font-size: 36px;
          font-weight: 800;
          font-family: 'Space Mono', monospace;
          color: #fafafa;
          letter-spacing: -2px;
        }

        .price-main.up { animation: priceUp 0.4s ease-out; }
        .price-main.down { animation: priceDown 0.4s ease-out; }

        .price-change {
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
        }

        .price-change.positive {
          background: rgba(34, 197, 94, 0.15);
          color: #22c55e;
        }

        .price-change.negative {
          background: rgba(255, 68, 79, 0.15);
          color: #FF444F;
        }

        .price-label {
          font-size: 11px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        /* Market Stats */
        .market-stats {
          display: flex;
          gap: 20px;
        }

        .stat {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .stat-label {
          font-size: 10px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 14px;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
        }

        .stat-value.high { color: #22c55e; }
        .stat-value.low { color: #FF444F; }

        .chart-container {
          height: 600px;
          width: 100%;
          min-width: 400px;
          position: relative;
          display: block;
          box-sizing: border-box;
        }

        .chart-container > div {
          width: 100% !important;
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

        /* Positions Card */
        .positions-card {
          background: linear-gradient(180deg, rgba(15, 15, 20, 0.8) 0%, rgba(10, 10, 15, 0.6) 100%);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 20px;
          overflow: hidden;
        }

        .tabs-bar {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .tab {
          flex: 1;
          padding: 18px 24px;
          background: none;
          border: none;
          color: #52525b;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .tab:hover { color: #a1a1aa; }

        .tab.active { color: #fafafa; }

        .tab.active::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 24px;
          right: 24px;
          height: 2px;
          background: linear-gradient(90deg, #FF444F, #ff6b73);
          border-radius: 2px 2px 0 0;
        }

        .tab-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 8px;
          margin-left: 8px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b73 100%);
          border-radius: 12px;
          font-size: 12px;
          font-weight: 700;
          color: white;
        }

        .positions-body {
          padding: 20px;
          max-height: 280px;
          overflow-y: auto;
        }

        .empty {
          text-align: center;
          padding: 48px 20px;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          background: rgba(255, 68, 79, 0.1);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
        }

        .empty-text {
          color: #52525b;
          font-size: 14px;
        }

        .position {
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.01) 100%);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 18px;
          margin-bottom: 12px;
          transition: all 0.2s;
        }

        .position:hover {
          border-color: rgba(255, 68, 79, 0.2);
          transform: translateY(-2px);
        }

        .position:last-child { margin-bottom: 0; }

        .position-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .position-symbol {
          font-weight: 700;
          font-size: 16px;
        }

        .direction {
          padding: 6px 12px;
          border-radius: 8px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .direction.rise {
          background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%);
          color: #22c55e;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .direction.fall {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.2) 0%, rgba(255, 68, 79, 0.1) 100%);
          color: #FF444F;
          border: 1px solid rgba(255, 68, 79, 0.3);
        }

        .position-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }

        .position-stat {
          text-align: center;
          padding: 12px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
        }

        .position-stat-label {
          font-size: 10px;
          color: #52525b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }

        .position-stat-value {
          font-size: 15px;
          font-weight: 600;
          font-family: 'Space Mono', monospace;
        }

        .position-stat-value.profit { color: #22c55e; }
        .position-stat-value.loss { color: #FF444F; }

        .close-btn {
          width: 100%;
          padding: 12px;
          background: rgba(255, 68, 79, 0.1);
          border: 1px solid rgba(255, 68, 79, 0.2);
          border-radius: 10px;
          color: #FF444F;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .close-btn:hover {
          background: rgba(255, 68, 79, 0.2);
          border-color: #FF444F;
          transform: translateY(-1px);
        }

        /* History */
        .history-row {
          display: grid;
          grid-template-columns: 70px 1fr 70px 80px 90px;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          margin-bottom: 8px;
          font-size: 13px;
        }

        .history-row:last-child { margin-bottom: 0; }

        .history-time {
          color: #52525b;
          font-family: 'Space Mono', monospace;
          font-size: 12px;
        }

        .history-symbol { font-weight: 500; }

        .history-price {
          font-family: 'Space Mono', monospace;
          text-align: right;
        }

        .history-profit {
          font-family: 'Space Mono', monospace;
          font-weight: 600;
          text-align: right;
        }

        .history-profit.positive { color: #22c55e; }
        .history-profit.negative { color: #FF444F; }

        /* Trade Panel */
        .trade-panel { animation: slideIn 0.5s ease-out forwards; }

        .trade-card {
          background: linear-gradient(180deg, rgba(15, 15, 20, 0.9) 0%, rgba(10, 10, 15, 0.7) 100%);
          border: 1px solid rgba(255, 68, 79, 0.1);
          border-radius: 20px;
          overflow: hidden;
          position: sticky;
          top: 100px;
        }

        .trade-top {
          padding: 24px;
          background: linear-gradient(180deg, rgba(255, 68, 79, 0.1) 0%, transparent 100%);
          border-bottom: 1px solid rgba(255, 68, 79, 0.08);
          text-align: center;
        }

        .trade-title {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 4px;
          letter-spacing: -0.5px;
        }

        .trade-subtitle {
          font-size: 13px;
          color: #71717a;
        }

        .trade-body { padding: 24px; }

        .field { margin-bottom: 24px; }

        .field-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .field-label-text {
          font-size: 12px;
          font-weight: 600;
          color: #a1a1aa;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .field-label-hint {
          font-size: 11px;
          color: #52525b;
        }

        .field-input {
          width: 100%;
          padding: 16px 18px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 68, 79, 0.1);
          border-radius: 12px;
          color: #fafafa;
          font-size: 18px;
          font-family: 'Space Mono', monospace;
          font-weight: 700;
          transition: all 0.2s;
        }

        .field-input:hover { border-color: rgba(255, 68, 79, 0.25); }

        .field-input:focus {
          outline: none;
          border-color: #FF444F;
          box-shadow: 0 0 0 4px rgba(255, 68, 79, 0.1);
        }

        .presets {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .preset {
          padding: 10px 8px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          color: #71717a;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Inter', sans-serif;
        }

        .preset:hover {
          background: rgba(255, 68, 79, 0.1);
          border-color: rgba(255, 68, 79, 0.2);
          color: #fafafa;
        }

        .preset.active {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.2) 0%, rgba(255, 68, 79, 0.1) 100%);
          border-color: rgba(255, 68, 79, 0.4);
          color: #FF444F;
        }

        .duration-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .small-dropdown {
          position: relative;
        }

        .small-dropdown-trigger {
          width: 100%;
          padding: 16px 18px;
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 68, 79, 0.1);
          border-radius: 12px;
          color: #fafafa;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: 'Inter', sans-serif;
        }

        .small-dropdown-trigger:hover {
          border-color: rgba(255, 68, 79, 0.25);
        }

        .small-dropdown-trigger.open {
          border-color: #FF444F;
        }

        .small-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #13131a;
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
          z-index: 50;
        }

        .small-dropdown-item {
          padding: 14px 18px;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 14px;
          color: #e4e4e7;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .small-dropdown-item:last-child { border-bottom: none; }
        .small-dropdown-item:hover { background: rgba(255, 68, 79, 0.1); }

        .small-dropdown-item.active {
          background: rgba(255, 68, 79, 0.15);
          color: #FF444F;
          font-weight: 500;
        }

        /* Trade Buttons */
        .trade-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 28px;
        }

        .trade-btn {
          width: 100%;
          padding: 20px 24px;
          border: none;
          border-radius: 14px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          font-family: 'Inter', sans-serif;
          text-transform: uppercase;
          letter-spacing: 1px;
          position: relative;
          overflow: hidden;
        }

        .trade-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
          opacity: 0;
          transition: opacity 0.3s;
        }

        .trade-btn:hover::before { opacity: 1; }

        .trade-btn.rise {
          background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
          color: white;
          box-shadow:
            0 4px 20px rgba(34, 197, 94, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn.rise:hover {
          transform: translateY(-3px);
          box-shadow:
            0 8px 30px rgba(34, 197, 94, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn.fall {
          background: linear-gradient(135deg, #FF444F 0%, #dc2626 100%);
          color: white;
          box-shadow:
            0 4px 20px rgba(255, 68, 79, 0.4),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn.fall:hover {
          transform: translateY(-3px);
          box-shadow:
            0 8px 30px rgba(255, 68, 79, 0.5),
            inset 0 1px 0 rgba(255, 255, 255, 0.1);
        }

        .trade-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }

        .trade-btn:active:not(:disabled) {
          transform: translateY(-1px);
        }

        .btn-icon {
          width: 24px;
          height: 24px;
        }

        /* Live Price Card */
        .live-price-card {
          margin-top: 24px;
          padding: 20px;
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.1) 0%, rgba(255, 68, 79, 0.03) 100%);
          border: 1px solid rgba(255, 68, 79, 0.15);
          border-radius: 14px;
          text-align: center;
          animation: borderGlow 3s ease-in-out infinite;
        }

        .live-price-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-size: 11px;
          color: #71717a;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }

        .live-indicator {
          width: 6px;
          height: 6px;
          background: #FF444F;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }

        .live-price-value {
          font-size: 32px;
          font-weight: 800;
          font-family: 'Space Mono', monospace;
          background: linear-gradient(135deg, #fafafa 0%, #d4d4d8 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -1px;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
        ::-webkit-scrollbar-thumb { background: rgba(255, 68, 79, 0.3); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255, 68, 79, 0.5); }

        /* Responsive */
        @media (max-width: 1200px) {
          .main { grid-template-columns: 1fr; }
          .trade-panel { order: -1; }
          .trade-card { position: static; }
        }
      `}</style>

      <div className="terminal">
        {/* Header */}
        <header className="header fade-in">
          <div className="header-inner">
            <div className="logo-area">
              <div className="logo">D</div>
              <div className="brand">
                <span className="brand-name">Deriv Trading</span>
                <span className="brand-sub">Professional Terminal</span>
              </div>
            </div>

            <div className="header-right">
              <div className="badge badge-affiliate">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {affiliateName}
              </div>

              <div className="badge badge-live">
                <div className="live-dot" />
                Live
              </div>

              <div className="badge badge-glass" title={accountType}>
                {accountId}
              </div>

              <div className="badge badge-balance">
                ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>

              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="main">
          {/* Chart Panel */}
          <div className="chart-panel">
            <div className="chart-card fade-in fade-in-1">
              <div className="chart-top">
                <div className="chart-left">
                  {/* Symbol Dropdown */}
                  <div className="dropdown">
                    <div
                      className={`dropdown-trigger ${symbolDropdownOpen ? 'open' : ''}`}
                      onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                    >
                      <div className="dropdown-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                          <polyline points="16 7 22 7 22 13" />
                        </svg>
                      </div>
                      <div className="dropdown-text">
                        <div className="dropdown-label">Market</div>
                        <div className="dropdown-value">{getSymbolLabel()}</div>
                      </div>
                      <svg className="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>

                    {symbolDropdownOpen && (
                      <div className="dropdown-menu">
                        {availableSymbols.map(s => (
                          <div
                            key={s.value}
                            className={`dropdown-item ${symbol === s.value ? 'active' : ''}`}
                            onClick={() => handleSymbolChange(s.value)}
                          >
                            <div className="dropdown-item-icon" />
                            <span className="dropdown-item-text">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Price Display */}
                  <div className="price-area">
                    <div className="price-row">
                      <span className={`price-main ${priceChange === 'up' ? 'up' : priceChange === 'down' ? 'down' : ''}`}>
                        {formatPrice(currentPrice)}
                      </span>
                      <span className={`price-change ${priceChangePercent >= 0 ? 'positive' : 'negative'}`}>
                        {priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
                      </span>
                    </div>
                    <span className="price-label">Live Market Price</span>
                  </div>
                </div>

                {/* Market Stats */}
                <div className="market-stats">
                  <div className="stat">
                    <span className="stat-label">24h High</span>
                    <span className="stat-value high">{formatPrice(highPrice)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">24h Low</span>
                    <span className="stat-value low">{formatPrice(lowPrice)}</span>
                  </div>
                </div>
              </div>

              <div className="chart-container">
                {symbol && <TradingViewChart symbol={symbol} theme="dark" height={600} />}
              </div>

              {/* Affiliate Signals */}
              {affiliateSignals.length > 0 && (
                <div className="signals-panel fade-in">
                  <div className="signals-header">
                    <div className="signals-title">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF444F" strokeWidth="2">
                        <circle cx="12" cy="12" r="2" />
                        <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                      </svg>
                      <span>Signals from {affiliateName}</span>
                    </div>
                    <button
                      className="signals-toggle"
                      onClick={() => setShowSignals(!showSignals)}
                    >
                      {showSignals ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {showSignals && (
                    <div className="signals-list">
                      {affiliateSignals
                        .filter(s => s.type === 'pricemarker' || s.type === 'horizontal')
                        .slice(0, 5)
                        .map((signal) => {
                          const isPriceMarker = signal.type === 'pricemarker';
                          const priceMarker = signal as PriceMarkerDrawing;
                          const isBuy = isPriceMarker && priceMarker.side === 'buy';
                          const price = isPriceMarker ? priceMarker.price : (signal as any).price;

                          return (
                            <div
                              key={signal.id}
                              className={`signal-item ${isBuy ? 'buy' : 'sell'}`}
                            >
                              <div className="signal-icon">
                                {isBuy ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                                    <polyline points="18 15 12 9 6 15" />
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF444F" strokeWidth="2.5">
                                    <polyline points="6 9 12 15 18 9" />
                                  </svg>
                                )}
                              </div>
                              <div className="signal-info">
                                <span className="signal-type">
                                  {isPriceMarker ? (priceMarker.label || (isBuy ? 'BUY' : 'SELL')) : 'Level'}
                                </span>
                                <span className="signal-price">{price?.toFixed(2)}</span>
                              </div>
                              <div className={`signal-diff ${price && currentPrice ? (currentPrice > price ? 'above' : 'below') : ''}`}>
                                {price && currentPrice ? (
                                  currentPrice > price ? `+${((currentPrice - price) / price * 100).toFixed(2)}%` : `${((currentPrice - price) / price * 100).toFixed(2)}%`
                                ) : '-'}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Positions */}
            <div className="positions-card fade-in fade-in-2">
              <div className="tabs-bar">
                <button
                  className={`tab ${activeTab === 'positions' ? 'active' : ''}`}
                  onClick={() => setActiveTab('positions')}
                >
                  Open Positions
                  {openPositions.length > 0 && (
                    <span className="tab-badge">{openPositions.length}</span>
                  )}
                </button>
                <button
                  className={`tab ${activeTab === 'history' ? 'active' : ''}`}
                  onClick={() => setActiveTab('history')}
                >
                  Trade History
                </button>
              </div>

              <div className="positions-body">
                {activeTab === 'positions' && (
                  <>
                    {openPositions.length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon">📊</div>
                        <p className="empty-text">No open positions</p>
                      </div>
                    ) : (
                      openPositions.map((pos) => (
                        <div key={pos.contractId} className="position">
                          <div className="position-top">
                            <span className="position-symbol">{pos.symbol}</span>
                            <span className={`direction ${pos.direction === 'CALL' ? 'rise' : 'fall'}`}>
                              {pos.direction === 'CALL' ? 'Rise' : 'Fall'}
                            </span>
                          </div>
                          <div className="position-grid">
                            <div className="position-stat">
                              <div className="position-stat-label">Entry</div>
                              <div className="position-stat-value">{formatPrice(pos.entryPrice)}</div>
                            </div>
                            <div className="position-stat">
                              <div className="position-stat-label">Current</div>
                              <div className="position-stat-value">{formatPrice(pos.currentPrice)}</div>
                            </div>
                            <div className="position-stat">
                              <div className="position-stat-label">P/L</div>
                              <div className={`position-stat-value ${pos.profit >= 0 ? 'profit' : 'loss'}`}>
                                {pos.profit >= 0 ? '+' : ''}{pos.profit.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <button className="close-btn" onClick={() => sellPosition(pos.contractId)}>
                            Close Position
                          </button>
                        </div>
                      ))
                    )}
                  </>
                )}

                {activeTab === 'history' && (
                  <>
                    {tradeHistory.length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon">📈</div>
                        <p className="empty-text">No trade history</p>
                      </div>
                    ) : (
                      tradeHistory.slice(0, 15).map((trade) => (
                        <div key={trade.id} className="history-row">
                          <span className="history-time">
                            {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="history-symbol">{trade.symbol}</span>
                          <span className={`direction ${trade.contractType === 'CALL' ? 'rise' : 'fall'}`}>
                            {trade.contractType === 'CALL' ? 'Rise' : 'Fall'}
                          </span>
                          <span className="history-price">${trade.buyPrice?.toFixed(2)}</span>
                          <span className={`history-profit ${(trade.profit || 0) >= 0 ? 'positive' : 'negative'}`}>
                            {(trade.profit || 0) >= 0 ? '+' : ''}${(trade.profit || 0).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Trade Panel */}
          <div className="trade-panel">
            <div className="trade-card fade-in fade-in-3">
              <div className="trade-top">
                <h2 className="trade-title">Place Trade</h2>
                <p className="trade-subtitle">{getSymbolLabel()}</p>
              </div>

              <div className="trade-body">
                <div className="field">
                  <div className="field-label">
                    <span className="field-label-text">Amount</span>
                    <span className="field-label-hint">USD</span>
                  </div>
                  <input
                    type="number"
                    className="field-input"
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value) || 10)}
                    min={1}
                    max={1000}
                  />
                  <div className="presets">
                    {[5, 10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        className={`preset ${amount === preset ? 'active' : ''}`}
                        onClick={() => setAmount(preset)}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <div className="field-label">
                    <span className="field-label-text">Duration</span>
                  </div>
                  <div className="duration-grid">
                    <input
                      type="number"
                      className="field-input"
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value) || 1)}
                      min={1}
                      max={60}
                    />
                    <div className="small-dropdown">
                      <div
                        className={`small-dropdown-trigger ${durationDropdownOpen ? 'open' : ''}`}
                        onClick={() => setDurationDropdownOpen(!durationDropdownOpen)}
                      >
                        <span>{durationOptions.find(o => o.value === durationUnit)?.label}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </div>
                      {durationDropdownOpen && (
                        <div className="small-dropdown-menu">
                          {durationOptions.map(opt => (
                            <div
                              key={opt.value}
                              className={`small-dropdown-item ${durationUnit === opt.value ? 'active' : ''}`}
                              onClick={() => {
                                setDurationUnit(opt.value);
                                setDurationDropdownOpen(false);
                              }}
                            >
                              {opt.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="trade-buttons">
                  <button
                    className="trade-btn rise"
                    onClick={() => executeTrade('CALL')}
                    disabled={isBuying || !symbol}
                  >
                    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                    {isBuying ? 'Placing...' : 'Rise'}
                  </button>

                  <button
                    className="trade-btn fall"
                    onClick={() => executeTrade('PUT')}
                    disabled={isBuying || !symbol}
                  >
                    <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                    {isBuying ? 'Placing...' : 'Fall'}
                  </button>
                </div>

                <div className="live-price-card">
                  <div className="live-price-label">
                    <div className="live-indicator" />
                    Live Price
                  </div>
                  <div className="live-price-value">{formatPrice(currentPrice)}</div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
