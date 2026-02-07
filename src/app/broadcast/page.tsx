'use client';

import { useState, useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  IconHome,
  IconUsers,
  IconWallet,
  IconFileAnalytics,
  IconSettings,
  IconBroadcast,
  IconChevronDown,
} from '@tabler/icons-react';
import { DerivClient } from '@/lib/deriv';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Drawing, TextDrawing, Point, SYMBOLS } from '@/types';

// Dynamic import for TradingViewChart (client-side only)
const TradingViewChart = dynamic(() => import('@/components/TradingViewChart'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e11', borderRadius: '12px' }}>
      <span style={{ color: '#666' }}>Loading chart...</span>
    </div>
  ),
});

type DrawingMode = 'select' | 'trendline' | 'horizontal' | 'rectangle' | 'arrow' | 'text' | null;

const COLORS = [
  '#FF444F',
  '#22c55e',
  '#3b82f6',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
  '#ffffff',
];

export default function BroadcastPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [symbol, setSymbol] = useState('1HZ100V');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastLoading, setBroadcastLoading] = useState(false);
  const [activeNav, setActiveNav] = useState('broadcast');

  // Drawing state
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [lineWidth] = useState(2);
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textInputPosition, setTextInputPosition] = useState<{ x: number; y: number } | null>(null);
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);

  const derivClientRef = useRef<DerivClient | null>(null);

  const navItems = [
    { icon: IconHome, label: 'Overview', id: 'dashboard', href: '/' },
    { icon: IconUsers, label: 'Affiliates', id: 'affiliates', href: '/affiliates' },
    { icon: IconBroadcast, label: 'Broadcast', id: 'broadcast', href: '/broadcast' },
    { icon: IconWallet, label: 'Earnings', id: 'commissions', href: '/earnings' },
    { icon: IconFileAnalytics, label: 'Analytics', id: 'reports', href: '/analytics' },
    { icon: IconSettings, label: 'Settings', id: 'settings', href: '/settings' },
  ];

  // Load saved drawings
  useEffect(() => {
    const savedDrawings = localStorage.getItem('broadcast_partner_drawings');
    if (savedDrawings) {
      try {
        const parsed = JSON.parse(savedDrawings);
        setDrawings(parsed);
      } catch (e) {
        console.error('Failed to parse saved drawings:', e);
      }
    }
    setIsLoading(false);
  }, []);

  // Connect to Deriv for live prices (header display)
  useEffect(() => {
    const connectDeriv = async () => {
      try {
        const client = new DerivClient();
        await client.connect();
        derivClientRef.current = client;
        setIsConnected(true);

        // Subscribe to ticks for current price
        await client.subscribeTicks(symbol, (tick) => {
          if (tick.tick) {
            setCurrentPrice(tick.tick.quote);
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
  };

  // Save drawings to localStorage
  const saveDrawings = (newDrawings: Drawing[]) => {
    setDrawings(newDrawings);
    localStorage.setItem('broadcast_partner_drawings', JSON.stringify(newDrawings));
    localStorage.setItem(
      `broadcast_partner_${symbol}`,
      JSON.stringify({
        drawings: newDrawings,
        symbol,
        updatedAt: new Date().toISOString(),
      })
    );
  };

  // Handle new drawing completed
  const handleDrawingComplete = (drawing: Drawing) => {
    const newDrawings = [...drawings, drawing];
    saveDrawings(newDrawings);
  };

  // Handle text input request from chart
  const handleTextInputRequest = (chartPoint: Point, pixelPos: { x: number; y: number }) => {
    setPendingTextPoint(chartPoint);
    setTextInputPosition(pixelPos);
    setShowTextInput(true);
  };

  // Submit text drawing
  const handleTextSubmit = () => {
    if (!pendingTextPoint || !textInput.trim()) {
      setShowTextInput(false);
      setPendingTextPoint(null);
      setTextInput('');
      return;
    }

    const newDrawing: TextDrawing = {
      id: crypto.randomUUID(),
      type: 'text',
      referralCode: 'partner',
      symbol,
      color: selectedColor,
      lineWidth,
      position: pendingTextPoint,
      text: textInput,
      fontSize: 14,
      backgroundColor: '#1a1a28',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newDrawings = [...drawings, newDrawing];
    saveDrawings(newDrawings);

    setShowTextInput(false);
    setPendingTextPoint(null);
    setTextInput('');
  };

  // Delete selected drawing
  const deleteSelectedDrawing = () => {
    if (!selectedDrawing) return;
    const newDrawings = drawings.filter((d) => d.id !== selectedDrawing);
    saveDrawings(newDrawings);
    setSelectedDrawing(null);
  };

  // Clear all drawings
  const clearAllDrawings = () => {
    saveDrawings([]);
    setSelectedDrawing(null);
  };

  // Toggle live broadcast
  const toggleLive = () => {
    setIsLive(!isLive);
    localStorage.setItem('broadcast_partner_live', (!isLive).toString());
    if (!isLive) {
      notifications.show({
        title: 'Broadcast Started',
        message: 'Your analysis is now visible to all your clients',
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

  // Broadcast drawings to database (toggle on/off)
  const toggleBroadcast = async () => {
    if (drawings.length === 0 && !isBroadcasting) {
      notifications.show({
        title: 'No Drawings',
        message: 'Draw some analysis on the chart first',
        color: 'yellow',
      });
      return;
    }

    setBroadcastLoading(true);
    try {
      if (!isBroadcasting) {
        if (isSupabaseConfigured()) {
          const { error } = await (supabase as any)
            .from('broadcast_drawings')
            .upsert({
              symbol,
              drawings: JSON.stringify(drawings),
              is_live: true,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'symbol' });

          if (error) throw error;
        }

        localStorage.setItem(`broadcast_partner_${symbol}`, JSON.stringify({
          drawings,
          symbol,
          is_live: true,
          updatedAt: new Date().toISOString(),
        }));

        setIsBroadcasting(true);
        notifications.show({
          title: 'Analysis Broadcasted',
          message: `${drawings.length} drawing(s) are now visible to your clients`,
          color: 'teal',
        });
      } else {
        if (isSupabaseConfigured()) {
          const { error } = await (supabase as any)
            .from('broadcast_drawings')
            .upsert({
              symbol,
              drawings: JSON.stringify([]),
              is_live: false,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'symbol' });

          if (error) throw error;
        }

        localStorage.removeItem(`broadcast_partner_${symbol}`);

        setIsBroadcasting(false);
        notifications.show({
          title: 'Broadcast Stopped',
          message: 'Analysis hidden from clients',
          color: 'yellow',
        });
      }
    } catch (err) {
      console.error('Broadcast error:', err);
      notifications.show({
        title: 'Broadcast Failed',
        message: 'Could not save drawings. Check your connection.',
        color: 'red',
      });
    } finally {
      setBroadcastLoading(false);
    }
  };

  const isDrawingMode = drawingMode !== null && drawingMode !== 'select';

  // Tool button component
  const ToolButton = ({ mode, icon, label }: { mode: DrawingMode; icon: React.ReactNode; label: string }) => (
    <button
      onClick={() => setDrawingMode(mode)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        background: drawingMode === mode ? 'rgba(255, 68, 79, 0.2)' : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${drawingMode === mode ? '#FF444F' : 'rgba(255, 255, 255, 0.1)'}`,
        borderRadius: 6,
        color: drawingMode === mode ? '#FF444F' : '#a1a1aa',
        fontSize: 12,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        fontWeight: drawingMode === mode ? 600 : 400,
      }}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

        :root {
          --bg-primary: #0a0a0b;
          --bg-secondary: #111113;
          --bg-tertiary: #18181b;
          --bg-elevated: #1f1f23;
          --border-subtle: rgba(255, 255, 255, 0.06);
          --border-medium: rgba(255, 255, 255, 0.1);
          --text-primary: #fafafa;
          --text-secondary: #a1a1aa;
          --text-muted: #52525b;
          --accent: #FF444F;
          --accent-glow: rgba(255, 68, 79, 0.15);
          --success: #10b981;
          --warning: #f59e0b;
        }

        * { font-family: 'Outfit', sans-serif; box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        body {
          margin: 0;
          padding: 0;
          background: var(--bg-primary);
          color: var(--text-primary);
        }

        .broadcast-layout {
          display: flex;
          min-height: 100vh;
        }

        .sidebar {
          width: 240px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          position: fixed;
          height: 100vh;
          z-index: 100;
        }

        .logo-section {
          padding: 24px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          text-decoration: none;
        }

        .logo-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, var(--accent) 0%, #ff6b73 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 18px;
          color: white;
          box-shadow: 0 4px 20px var(--accent-glow);
        }

        .logo-text {
          font-weight: 600;
          font-size: 18px;
          color: var(--text-primary);
        }

        .nav-section {
          flex: 1;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .nav-label {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 8px 12px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
        }

        .nav-item:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: var(--accent);
          color: white;
          box-shadow: 0 4px 20px var(--accent-glow);
        }

        .main-content {
          flex: 1;
          margin-left: 240px;
          display: flex;
          flex-direction: column;
          height: 100vh;
        }

        .broadcast-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border-subtle);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .page-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .header-center {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .symbol-selector {
          position: relative;
        }

        .symbol-button {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-medium);
          border-radius: 8px;
          color: var(--text-primary);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          min-width: 220px;
          transition: all 0.15s;
        }

        .symbol-button:hover {
          background: var(--bg-elevated);
          border-color: var(--accent);
        }

        .symbol-dropdown {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          right: 0;
          background: var(--bg-elevated);
          border: 1px solid var(--border-medium);
          border-radius: 10px;
          max-height: 300px;
          overflow-y: auto;
          z-index: 200;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .symbol-option {
          padding: 12px 16px;
          cursor: pointer;
          font-size: 13px;
          border-bottom: 1px solid var(--border-subtle);
          transition: background 0.15s;
          color: var(--text-secondary);
        }

        .symbol-option:hover {
          background: rgba(255, 68, 79, 0.1);
          color: var(--text-primary);
        }

        .current-price {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: var(--bg-tertiary);
          border-radius: 8px;
        }

        .price-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .price-value {
          font-size: 18px;
          font-weight: 600;
          font-family: 'JetBrains Mono', monospace;
          color: var(--success);
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: ${isConnected ? 'var(--success)' : 'var(--warning)'};
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: ${isConnected ? 'var(--success)' : 'var(--warning)'};
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
          background: ${isLive ? 'linear-gradient(135deg, var(--success) 0%, #059669 100%)' : 'var(--bg-tertiary)'};
          border: 1px solid ${isLive ? 'var(--success)' : 'var(--border-medium)'};
          border-radius: 8px;
          color: ${isLive ? '#fff' : 'var(--text-secondary)'};
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .live-button:hover {
          transform: translateY(-1px);
          box-shadow: ${isLive ? '0 4px 20px rgba(16, 185, 129, 0.3)' : 'none'};
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: ${isLive ? '#fff' : 'var(--text-muted)'};
          border-radius: 50%;
          animation: ${isLive ? 'pulse 1.5s infinite' : 'none'};
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .broadcast-body {
          flex: 1;
          display: flex;
          gap: 20px;
          padding: 20px;
          overflow: hidden;
        }

        .chart-section {
          flex: 1;
          background: var(--bg-secondary);
          border-radius: 16px;
          border: 1px solid var(--border-subtle);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .chart-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: rgba(10, 10, 15, 0.95);
          border-bottom: 1px solid var(--border-subtle);
          flex-wrap: wrap;
        }

        .chart-container {
          flex: 1;
          min-height: 0;
        }

        .sidebar-panel {
          width: 320px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .panel {
          background: var(--bg-secondary);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          overflow: hidden;
        }

        .panel-header {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-subtle);
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .panel-content {
          padding: 16px;
        }

        .info-card {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 14px;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.15);
          border-radius: 10px;
          margin-bottom: 16px;
        }

        .info-icon {
          color: #818cf8;
          flex-shrink: 0;
        }

        .info-text {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .drawing-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 250px;
          overflow-y: auto;
        }

        .drawing-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          background: var(--bg-tertiary);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
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
          color: var(--text-primary);
          font-weight: 500;
        }

        .drawing-delete {
          padding: 4px;
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.15s;
        }

        .drawing-delete:hover {
          background: rgba(255, 68, 79, 0.1);
          color: var(--accent);
        }

        .empty-state {
          text-align: center;
          padding: 30px;
          color: var(--text-muted);
          font-size: 13px;
        }

      `}</style>

      <div className="broadcast-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="logo-section">
            <Link href="/" className="logo">
              <div className="logo-icon">D</div>
              <span className="logo-text">Deriv Partner</span>
            </Link>
          </div>

          <nav className="nav-section">
            <div className="nav-label">Main Menu</div>
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {/* Header */}
          <header className="broadcast-header">
            <div className="header-left">
              <h1 className="page-title">Broadcast Analysis</h1>
            </div>

            <div className="header-center">
              <div className="symbol-selector">
                <button
                  className="symbol-button"
                  onClick={() => setSymbolDropdownOpen(!symbolDropdownOpen)}
                >
                  <span>{SYMBOLS.find((s) => s.value === symbol)?.label || symbol}</span>
                  <IconChevronDown size={16} />
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
            </div>
          </header>

          {/* Body */}
          <div className="broadcast-body">
            {/* Chart */}
            <div className="chart-section">
              {/* Drawing Toolbar */}
              <div className="chart-toolbar">
                {/* Mode indicator */}
                {isDrawingMode && (
                  <div style={{
                    padding: '4px 10px',
                    background: 'rgba(255, 68, 79, 0.15)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#FF444F',
                    fontWeight: 500,
                  }}>
                    Drawing Mode
                  </div>
                )}

                {/* Drawing tools */}
                <ToolButton
                  mode={null}
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                    </svg>
                  }
                  label="Select"
                />
                <ToolButton
                  mode="trendline"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="4" y1="20" x2="20" y2="4" />
                    </svg>
                  }
                  label="Trend"
                />
                <ToolButton
                  mode="horizontal"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="4" y1="12" x2="20" y2="12" />
                    </svg>
                  }
                  label="H-Line"
                />
                <ToolButton
                  mode="rectangle"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="6" width="16" height="12" rx="1" />
                    </svg>
                  }
                  label="Zone"
                />
                <ToolButton
                  mode="arrow"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="5" y1="19" x2="19" y2="5" />
                      <polyline points="12 5 19 5 19 12" />
                    </svg>
                  }
                  label="Arrow"
                />
                <ToolButton
                  mode="text"
                  icon={
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="4 7 4 4 20 4 20 7" />
                      <line x1="12" y1="4" x2="12" y2="20" />
                      <line x1="8" y1="20" x2="16" y2="20" />
                    </svg>
                  }
                  label="Text"
                />

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                {/* Color picker */}
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      background: color,
                      border: selectedColor === color ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer',
                      boxShadow: selectedColor === color ? `0 0 6px ${color}` : 'none',
                      padding: 0,
                    }}
                  />
                ))}

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                {/* Actions */}
                <button
                  onClick={deleteSelectedDrawing}
                  disabled={!selectedDrawing}
                  style={{
                    padding: '5px 10px',
                    background: 'rgba(255, 68, 79, 0.1)',
                    border: '1px solid rgba(255, 68, 79, 0.3)',
                    borderRadius: 4,
                    color: '#FF444F',
                    fontSize: 11,
                    cursor: selectedDrawing ? 'pointer' : 'not-allowed',
                    opacity: selectedDrawing ? 1 : 0.5,
                  }}
                >
                  Delete
                </button>
                <button
                  onClick={clearAllDrawings}
                  style={{
                    padding: '5px 10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 4,
                    color: '#a1a1aa',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Clear All
                </button>

                <span style={{ fontSize: 10, color: '#71717a', marginLeft: 4 }}>
                  {drawings.length} drawing{drawings.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Chart */}
              <div className="chart-container">
                <TradingViewChart
                  symbol={symbol}
                  theme="dark"
                  currentPrice={currentPrice}
                  drawings={drawings}
                  drawingMode={drawingMode}
                  selectedColor={selectedColor}
                  drawingLineWidth={lineWidth}
                  selectedDrawing={selectedDrawing}
                  onDrawingComplete={handleDrawingComplete}
                  onDrawingSelect={setSelectedDrawing}
                  onTextInputRequest={handleTextInputRequest}
                  referralCode="partner"
                />
              </div>
            </div>

            {/* Sidebar Panels */}
            <aside className="sidebar-panel">
              {/* Info */}
              <div className="info-card">
                <svg className="info-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <div className="info-text">
                  Draw your analysis on the chart. When you go live, all your invited clients will see your drawings in real-time.
                </div>
              </div>

              {/* Drawings List */}
              <div className="panel">
                <div className="panel-header">
                  <span>Your Drawings</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 400 }}>{drawings.length}</span>
                </div>
                <div className="panel-content">
                  {drawings.length === 0 ? (
                    <div className="empty-state">
                      <div style={{ fontSize: 28, marginBottom: 8 }}>&#x270F;&#xFE0F;</div>
                      <div>No drawings yet</div>
                      <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                        Use the toolbar to start drawing
                      </div>
                    </div>
                  ) : (
                    <div className="drawing-list">
                      {drawings.map((drawing) => (
                        <div key={drawing.id} className="drawing-item">
                          <div className="drawing-info">
                            <div className="drawing-color" style={{ background: drawing.color }} />
                            <span className="drawing-type">
                              {drawing.type === 'trendline' && 'Trend Line'}
                              {drawing.type === 'horizontal' && 'Horizontal Line'}
                              {drawing.type === 'rectangle' && 'Zone'}
                              {drawing.type === 'arrow' && 'Arrow'}
                              {drawing.type === 'text' && `"${(drawing as any).text}"`}
                            </span>
                          </div>
                          <button
                            className="drawing-delete"
                            onClick={() => {
                              const newDrawings = drawings.filter((d) => d.id !== drawing.id);
                              saveDrawings(newDrawings);
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

              {/* Broadcast Button */}
              <button
                onClick={toggleBroadcast}
                disabled={broadcastLoading}
                style={{
                  width: '100%',
                  padding: '14px 20px',
                  borderRadius: 12,
                  border: isBroadcasting ? '1px solid rgba(255, 68, 79, 0.4)' : '1px solid rgba(34, 197, 94, 0.4)',
                  background: isBroadcasting
                    ? 'linear-gradient(135deg, rgba(255, 68, 79, 0.15) 0%, rgba(255, 68, 79, 0.05) 100%)'
                    : 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.05) 100%)',
                  color: isBroadcasting ? '#FF444F' : '#22c55e',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: broadcastLoading ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                  opacity: broadcastLoading ? 0.7 : 1,
                }}
              >
                {broadcastLoading ? (
                  <span>Saving...</span>
                ) : isBroadcasting ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                    Stop Broadcast
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="2" />
                      <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                    </svg>
                    Broadcast
                  </>
                )}
              </button>
            </aside>
          </div>
        </main>
      </div>

      {/* Text input popup */}
      {showTextInput && textInputPosition && (
        <div
          style={{
            position: 'fixed',
            left: textInputPosition.x,
            top: textInputPosition.y,
            zIndex: 10001,
            background: '#1a1a28',
            padding: 12,
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
          }}
        >
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') {
                setShowTextInput(false);
                setPendingTextPoint(null);
                setTextInput('');
              }
            }}
            placeholder="Enter label..."
            autoFocus
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 4,
              padding: '8px 12px',
              color: '#fff',
              fontSize: 13,
              width: 200,
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button
              onClick={handleTextSubmit}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: '#FF444F',
                border: 'none',
                borderRadius: 4,
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Add
            </button>
            <button
              onClick={() => {
                setShowTextInput(false);
                setPendingTextPoint(null);
                setTextInput('');
              }}
              style={{
                flex: 1,
                padding: '6px 12px',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: 4,
                color: '#a1a1aa',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
