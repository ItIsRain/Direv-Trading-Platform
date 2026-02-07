# Deriv Affiliate Trading Platform

A white-label trading platform that connects Deriv affiliates with their referred clients. Affiliates invite users through unique referral links, users create their own Deriv demo accounts, and trade binary options on synthetic indices — all while affiliates earn commissions.

---

## What It Does

### For Affiliates
- Create a network of referred traders
- Generate unique referral links for each sub-affiliate
- Track client signups, trades, and volume in real-time
- Earn commissions on every trade made by referred users
- Attach Deriv affiliate tokens for automatic commission attribution

### For Traders
- Sign up through an affiliate's referral link
- Create your own Deriv demo account with $10,000 virtual funds
- Trade synthetic indices (Volatility, Boom/Crash, Jump indices)
- View live candlestick charts with real-time price updates
- Execute Rise/Fall binary options trades
- Track open positions and trade history

---

## Platform Sections

### Partner Dashboard (`/`)
The main control center showing:
- Total affiliates in your network
- Total clients referred across all affiliates
- Trade volume and profit statistics
- Quick access to affiliate management

### Affiliate Management (`/affiliates`)
Create and manage your affiliate network:
- Add new affiliates with name, email
- Paste a Deriv referral link to auto-extract affiliate tokens
- Each affiliate gets a unique referral code
- View client count and activity per affiliate
- Copy referral links to share

### Trading Interface (`/trade/[referralCode]`)
Where the actual trading happens:
- **New users**: Create a Deriv demo account (email verification required)
- **Existing users**: Login with API token
- **Live charts**: Real-time candlestick charts powered by TradingView's Lightweight Charts
- **Trade execution**: Buy Rise (Call) or Fall (Put) contracts
- **Open positions**: Track active trades with live profit/loss
- **Trade history**: View completed trades and results

### Earnings (`/earnings`)
Commission tracking dashboard:
- Monthly earnings breakdown
- Trade counts per period
- Payout history and status
- Visual earnings chart

### Analytics (`/analytics`)
Performance insights:
- Traffic source breakdown
- Top performing affiliates
- Weekly activity heatmap
- Client conversion metrics

### Fraud Detection (`/dashboard`)
LunarGraph AI-powered monitoring:
- Force-directed graph visualization of your network
- Trade correlation analysis (detects mirror trading)
- Timing pattern detection
- Automated fraud alerts
- AI copilot for investigating suspicious activity

---

## How Trading Works

1. **User arrives via referral link** → `/trade/abc123`
2. **First-time user flow**:
   - Enter email and country
   - Receive verification code via email
   - Create password (8-25 chars, must include uppercase, lowercase, number)
   - Account created with affiliate attribution
   - Login with API token to start trading
3. **Trading**:
   - Select a synthetic index (Volatility 100, Boom 500, etc.)
   - Choose stake amount and duration
   - Click Rise (price will go up) or Fall (price will go down)
   - Watch position in real-time
   - Trade settles automatically at expiry

---

## Current Limitations

- **API Token Login**: Users must manually get their API token from Deriv after account creation (OAuth doesn't work with localhost)
- **Demo Accounts Only**: Currently supports virtual/demo trading only
- **Manual Token Entry**: No automatic authentication flow after signup

---

## Potential Improvements

### User Experience
- **OAuth Integration for Production**: Enable seamless login when deployed to a real domain
- **One-Click Account Linking**: After signup, automatically open Deriv to generate and copy API token
- **Remember Login**: Store authenticated sessions across browser restarts
- **Mobile Responsive Design**: Optimize trading interface for mobile devices
- **Dark/Light Theme Toggle**: User preference for interface appearance

### Trading Features
- **More Contract Types**: Add Touch/No Touch, Digit Matches, Lookbacks
- **Multipliers**: Support Deriv's multiplier contracts for larger exposure
- **Trading Signals**: AI-powered buy/sell recommendations
- **Copy Trading**: Let clients copy successful traders' positions
- **Trading Bots**: Automated trading strategies
- **Price Alerts**: Notifications when assets hit target prices
- **Technical Indicators**: RSI, MACD, Bollinger Bands overlays on charts

### Affiliate Features
- **Multi-Level Commissions**: Earn from sub-affiliate referrals (MLM structure)
- **Custom Commission Tiers**: Different rates based on volume
- **Promotional Materials**: Banners, landing pages, marketing assets
- **Affiliate Leaderboard**: Gamified competition between affiliates
- **Automated Payouts**: Direct integration with payment providers
- **Referral Link Analytics**: Click tracking, conversion funnels

### Platform Features
- **Real Account Support**: Enable live trading with real money
- **Multiple Brokers**: Integrate with other binary options APIs beyond Deriv
- **White-Label Customization**: Custom branding, logos, colors per affiliate
- **Multi-Currency Support**: Trade in USD, EUR, GBP, crypto
- **Client Wallet System**: Internal balance management
- **Chat Support**: In-app messaging with affiliates/support
- **Push Notifications**: Trade results, account alerts, promotions

### Analytics & Reporting
- **Advanced Analytics**: Cohort analysis, lifetime value calculations
- **Export Reports**: Download CSV/PDF of trades, earnings, clients
- **Real-Time Dashboard**: WebSocket-powered live statistics
- **Revenue Forecasting**: Predictive analytics for earnings
- **Client Behavior Insights**: Trading patterns, active hours, preferred markets

### Security & Compliance
- **Two-Factor Authentication**: SMS/TOTP for login security
- **IP Whitelisting**: Restrict access by location
- **Audit Logs**: Track all platform actions
- **KYC Integration**: Verify client identities
- **Responsible Trading Tools**: Deposit limits, self-exclusion, reality checks

---

## Supported Markets

All synthetic indices available 24/7:

**Volatility Indices**
- Volatility 10, 25, 50, 75, 100 (1-second variants)

**Boom/Crash Indices**
- Boom 500, Boom 1000
- Crash 500, Crash 1000

**Jump Indices**
- Jump 10, 25, 50, 75, 100

---

## Data Storage

The platform supports two modes:
- **Supabase** (configured): Persistent database storage for affiliates, clients, and trades
- **In-Memory** (default): Data stored in browser, resets on refresh

---

## Built With

- Next.js 14 (App Router)
- Mantine UI Components
- Deriv WebSocket API
- Lightweight Charts (TradingView)
- Supabase (optional)
