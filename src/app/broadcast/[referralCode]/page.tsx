'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getAffiliateByReferralCode } from '@/lib/store';
import { DerivClient } from '@/lib/deriv';
import { Drawing, CandleData, SYMBOLS } from '@/types';

// Dynamic import for BroadcastChart (client-side only)
const BroadcastChart = dynamic(() => import('@/components/BroadcastChart'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#06060a', borderRadius: '12px' }}>
      <span style={{ color: '#666' }}>Loading chart...</span>
    </div>
  ),
});

export default function BroadcastPage() {
  const params = useParams();
  const referralCode = params.referralCode as string;

  const [affiliateName, setAffiliateName] = useState('Unknown');
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [symbol, setSymbol] = useState('1HZ100V');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [clientCount, setClientCount] = useState(0);
  const [isLive, setIsLive] = useState(false);

  const derivClientRef = useRef<DerivClient | null>(null);

  // Load affiliate info and saved drawings
  useEffect(() => {
    const affiliate = getAffiliateByReferralCode(referralCode);
    if (affiliate) {
      setAffiliateName(affiliate.name);
    }

    // Load saved drawings from localStorage
    const savedDrawings = localStorage.getItem(`broadcast_drawings_${referralCode}`);
    if (savedDrawings) {
      try {
        const parsed = JSON.parse(savedDrawings);
        setDrawings(parsed);
      } catch (e) {
        console.error('Failed to parse saved drawings:', e);
      }
    }

    setIsLoading(false);
  }, [referralCode]);

  // Connect to Deriv for live prices
  useEffect(() => {
    const connectDeriv = async () => {
      try {
        const client = new DerivClient();
        await client.connect();
        derivClientRef.current = client;
        setIsConnected(true);

        // Get initial candle data
        const history = await client.getTickHistory(symbol, 100, 60);
        setCandles(history);

        if (history.length > 0) {
          setCurrentPrice(history[history.length - 1].close);
        }

        // Subscribe to ticks
        await client.subscribeTicks(symbol, (tick) => {
          if (tick.tick) {
            setCurrentPrice(tick.tick.quote);

            // Update or add candle
            setCandles((prev) => {
              const newCandles = [...prev];
              const currentMinute = Math.floor(tick.tick!.epoch / 60) * 60;
              const lastCandle = newCandles[newCandles.length - 1];

              if (lastCandle && lastCandle.time === currentMinute) {
                // Update existing candle
                lastCandle.close = tick.tick!.quote;
                lastCandle.high = Math.max(lastCandle.high, tick.tick!.quote);
                lastCandle.low = Math.min(lastCandle.low, tick.tick!.quote);
              } else {
                // New candle
                newCandles.push({
                  time: currentMinute,
                  open: tick.tick!.quote,
                  high: tick.tick!.quote,
                  low: tick.tick!.quote,
                  close: tick.tick!.quote,
                });
                // Keep last 200 candles
                if (newCandles.length > 200) {
                  newCandles.shift();
                }
              }

              return newCandles;
            });
          }
        });
      } catch (err) {
        console.error('Failed to connect to Deriv:', err);
        notifications.show({
          title: 'Connection Error',
          message: 'Failed to connect to price feed',
          color: 'red',
        });
      }
    };

    connectDeriv();

    return () => {
      if (derivClientRef.current) {
        derivClientRef.current.disconnect();
      }
    };
  }, [symbol]);

  // Handle symbol change
  const handleSymbolChange = async (newSymbol: string) => {
    if (derivClientRef.current) {
      await derivClientRef.current.unsubscribeTicks(symbol);
    }
    setSymbol(newSymbol);
    setSymbolDropdownOpen(false);
    setCandles([]);
  };

  // Save drawings
  const handleDrawingsChange = (newDrawings: Drawing[]) => {
    setDrawings(newDrawings);
    localStorage.setItem(`broadcast_drawings_${referralCode}`, JSON.stringify(newDrawings));

    // Also save with symbol-specific key for clients to load
    localStorage.setItem(
      `broadcast_${referralCode}_${symbol}`,
      JSON.stringify({
        drawings: newDrawings,
        symbol,
        updatedAt: new Date().toISOString(),
      })
    );
  };

  // Toggle live broadcast
  const toggleLive = () => {
    setIsLive(!isLive);
    if (!isLive) {
      notifications.show({
        title: 'Broadcast Started',
        message: 'Your analysis is now visible to your clients',
        color: 'teal',
      });
    } else {
      notifications.show({
        title: 'Broadcast Stopped',
        message: 'Your analysis is no longer visible to clients',
        color: 'yellow',
      });
    }
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#06060a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #06060a;
          font-family: 'Inter', sans-serif;
          color: #fafafa;
        }

        .broadcast-container {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .broadcast-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          background: rgba(17, 17, 23, 0.8);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(10px);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
        }

        .logo-icon {
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #FF444F 0%, #ff6b74 100%);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 18px;
          color: #fff;
        }

        .logo-text {
          font-size: 18px;
          font-weight: 600;
          color: #fafafa;
        }

        .affiliate-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: rgba(255, 68, 79, 0.1);
          border: 1px solid rgba(255, 68, 79, 0.2);
          border-radius: 20px;
        }

        .affiliate-badge-icon {
          width: 8px;
          height: 8px;
          background: #FF444F;
          border-radius: 50%;
        }

        .affiliate-badge-text {
          font-size: 13px;
          color: #FF444F;
          font-weight: 500;
        }

        .header-center {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .symbol-selector {
          position: relative;
        }

        .symbol-button {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #fafafa;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          min-width: 220px;
        }

        .symbol-button:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        .symbol-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: #1a1a28;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          max-height: 300px;
          overflow-y: auto;
          z-index: 100;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .symbol-option {
          padding: 12px 16px;
          cursor: pointer;
          font-size: 13px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          transition: background 0.15s;
        }

        .symbol-option:hover {
          background: rgba(255, 68, 79, 0.1);
        }

        .symbol-option:last-child {
          border-bottom: none;
        }

        .current-price {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
        }

        .price-label {
          font-size: 12px;
          color: #71717a;
        }

        .price-value {
          font-size: 18px;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
          color: #22c55e;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .live-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: ${isLive ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : 'rgba(255, 255, 255, 0.05)'};
          border: 1px solid ${isLive ? '#22c55e' : 'rgba(255, 255, 255, 0.1)'};
          border-radius: 8px;
          color: ${isLive ? '#fff' : '#a1a1aa'};
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .live-button:hover {
          transform: translateY(-1px);
          box-shadow: ${isLive ? '0 4px 20px rgba(34, 197, 94, 0.3)' : 'none'};
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: ${isLive ? '#fff' : '#71717a'};
          border-radius: 50%;
          animation: ${isLive ? 'pulse 1.5s infinite' : 'none'};
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .client-count {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 6px;
          font-size: 12px;
          color: #71717a;
        }

        .back-link {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          color: #71717a;
          text-decoration: none;
          font-size: 13px;
          border-radius: 6px;
          transition: all 0.15s;
        }

        .back-link:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fafafa;
        }

        .broadcast-main {
          flex: 1;
          padding: 20px;
          display: flex;
          gap: 20px;
        }

        .chart-container {
          flex: 1;
          background: #0d0d14;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          overflow: hidden;
          position: relative;
          min-height: 600px;
        }

        .sidebar {
          width: 320px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel {
          background: #0d0d14;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          overflow: hidden;
        }

        .panel-header {
          padding: 14px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 13px;
          font-weight: 600;
          color: #a1a1aa;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .panel-content {
          padding: 16px;
        }

        .drawing-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 300px;
          overflow-y: auto;
        }

        .drawing-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .drawing-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .drawing-color {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }

        .drawing-type {
          font-size: 12px;
          color: #fafafa;
          font-weight: 500;
        }

        .drawing-delete {
          padding: 4px;
          background: none;
          border: none;
          color: #71717a;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .drawing-delete:hover {
          background: rgba(255, 68, 79, 0.1);
          color: #FF444F;
        }

        .empty-state {
          text-align: center;
          padding: 30px;
          color: #52525b;
          font-size: 13px;
        }

        .empty-state-icon {
          font-size: 32px;
          margin-bottom: 10px;
          opacity: 0.5;
        }

        .info-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 10px;
        }

        .info-icon {
          width: 20px;
          height: 20px;
          color: #818cf8;
          flex-shrink: 0;
        }

        .info-text {
          font-size: 12px;
          color: #a1a1aa;
          line-height: 1.5;
        }

        .share-url {
          padding: 14px;
        }

        .share-url-label {
          font-size: 11px;
          color: #71717a;
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .share-url-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
        }

        .share-url-text {
          flex: 1;
          font-size: 12px;
          color: #fafafa;
          font-family: 'JetBrains Mono', monospace;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .copy-button {
          padding: 6px 10px;
          background: rgba(255, 68, 79, 0.1);
          border: 1px solid rgba(255, 68, 79, 0.2);
          border-radius: 4px;
          color: #FF444F;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .copy-button:hover {
          background: rgba(255, 68, 79, 0.2);
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: ${isConnected ? '#22c55e' : '#f59e0b'};
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${isConnected ? '#22c55e' : '#f59e0b'};
        }
      `}</style>

      <div className="broadcast-container">
        {/* Header */}
        <header className="broadcast-header">
          <div className="header-left">
            <Link href="/" className="logo">
              <div className="logo-icon">D</div>
              <span className="logo-text">Broadcast</span>
            </Link>

            <div className="affiliate-badge">
              <div className="affiliate-badge-icon" />
              <span className="affiliate-badge-text">{affiliateName}</span>
            </div>
          </div>

          <div className="header-center">
            <div className="symbol-selector">
              <button
                className="symbol-button"
                onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
              >
                <span>{SYMBOLS.find((s) => s.value === symbol)?.label || symbol}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {symbolDropdownOpen && (
                <div className="symbol-dropdown">
                  {SYMBOLS.map((s) => (
                    <div
                      key={s.value}
                      className="symbol-option"
                      onClick={() => handleSymbolChange(s.value)}
                    >
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="current-price">
              <span className="price-label">Price</span>
              <span className="price-value">{currentPrice.toFixed(2)}</span>
            </div>

            <div className="connection-status">
              <div className="status-dot" />
              {isConnected ? 'Connected' : 'Connecting...'}
            </div>
          </div>

          <div className="header-right">
            <button className="live-button" onClick={toggleLive}>
              <div className="live-dot" />
              {isLive ? 'LIVE' : 'Go Live'}
            </button>

            <div className="client-count">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {clientCount} viewers
            </div>

            <Link href="/affiliates" className="back-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back
            </Link>
          </div>
        </header>

        {/* Main Content */}
        <main className="broadcast-main">
          {/* Chart */}
          <div className="chart-container">
            <BroadcastChart
              symbol={symbol}
              referralCode={referralCode}
              candles={candles}
              currentPrice={currentPrice}
              onDrawingsChange={handleDrawingsChange}
              initialDrawings={drawings}
            />
          </div>

          {/* Sidebar */}
          <aside className="sidebar">
            {/* Info */}
            <div className="info-card">
              <svg className="info-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <div className="info-text">
                Draw your analysis on the chart. Your invited clients will see your drawings in real-time when you go live.
              </div>
            </div>

            {/* Drawings List */}
            <div className="panel">
              <div className="panel-header">
                <span>Your Drawings</span>
                <span style={{ color: '#FF444F', fontWeight: 400 }}>{drawings.length}</span>
              </div>
              <div className="panel-content">
                {drawings.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-icon">✏️</div>
                    <div>No drawings yet</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Use the toolbar on the chart to start drawing</div>
                  </div>
                ) : (
                  <div className="drawing-list">
                    {drawings.map((drawing) => (
                      <div key={drawing.id} className="drawing-item">
                        <div className="drawing-info">
                          <div
                            className="drawing-color"
                            style={{ background: drawing.color }}
                          />
                          <span className="drawing-type">
                            {drawing.type === 'trendline' && 'Trend Line'}
                            {drawing.type === 'horizontal' && 'Horizontal Line'}
                            {drawing.type === 'rectangle' && 'Zone'}
                            {drawing.type === 'arrow' && 'Arrow'}
                            {drawing.type === 'text' && `"${(drawing as any).text}"`}
                            {drawing.type === 'pricemarker' && `${(drawing as any).side.toUpperCase()} Signal`}
                          </span>
                        </div>
                        <button
                          className="drawing-delete"
                          onClick={() => {
                            const newDrawings = drawings.filter((d) => d.id !== drawing.id);
                            setDrawings(newDrawings);
                            handleDrawingsChange(newDrawings);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Client Link */}
            <div className="panel">
              <div className="panel-header">
                <span>Client Trading Link</span>
              </div>
              <div className="share-url">
                <div className="share-url-label">Share this with your clients</div>
                <div className="share-url-box">
                  <span className="share-url-text">
                    {typeof window !== 'undefined' ? `${window.location.origin}/trade/${referralCode}` : ''}
                  </span>
                  <button
                    className="copy-button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/trade/${referralCode}`);
                      notifications.show({
                        title: 'Copied!',
                        message: 'Link copied to clipboard',
                        color: 'teal',
                      });
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="panel">
              <div className="panel-header">
                <span>Quick Signals</span>
              </div>
              <div className="panel-content" style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => {
                    const newDrawing = {
                      id: Math.random().toString(36).substr(2, 9),
                      type: 'pricemarker' as const,
                      referralCode,
                      symbol,
                      color: '#22c55e',
                      lineWidth: 2,
                      price: currentPrice,
                      label: 'BUY NOW',
                      side: 'buy' as const,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    };
                    const newDrawings = [...drawings, newDrawing];
                    setDrawings(newDrawings);
                    handleDrawingsChange(newDrawings);
                    notifications.show({
                      title: 'Buy Signal Added',
                      message: `Buy signal at ${currentPrice.toFixed(2)}`,
                      color: 'teal',
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    borderRadius: 8,
                    color: '#22c55e',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  BUY
                </button>
                <button
                  onClick={() => {
                    const newDrawing = {
                      id: Math.random().toString(36).substr(2, 9),
                      type: 'pricemarker' as const,
                      referralCode,
                      symbol,
                      color: '#FF444F',
                      lineWidth: 2,
                      price: currentPrice,
                      label: 'SELL NOW',
                      side: 'sell' as const,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    };
                    const newDrawings = [...drawings, newDrawing];
                    setDrawings(newDrawings);
                    handleDrawingsChange(newDrawings);
                    notifications.show({
                      title: 'Sell Signal Added',
                      message: `Sell signal at ${currentPrice.toFixed(2)}`,
                      color: 'red',
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: 'rgba(255, 68, 79, 0.1)',
                    border: '1px solid rgba(255, 68, 79, 0.3)',
                    borderRadius: 8,
                    color: '#FF444F',
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  SELL
                </button>
              </div>
            </div>
          </aside>
        </main>
      </div>
    </>
  );
}
