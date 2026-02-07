'use client';

import { useState, useEffect } from 'react';
import { Text, Badge, Avatar } from '@mantine/core';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import {
  IconUsers,
  IconHome,
  IconSettings,
  IconBell,
  IconSearch,
  IconChevronRight,
  IconWallet,
  IconFileAnalytics,
  IconShield,
  IconArrowLeft,
  IconArrowUpRight,
  IconArrowDownRight,
  IconCurrencyDollar,
  IconCalendar,
  IconDownload,
  IconTrendingUp,
  IconBroadcast
} from '@tabler/icons-react';
import Link from 'next/link';
import { initializePartner, getAffiliates, getClients, getTrades, getStats, getStatsAsync, getEarningsDataAsync } from '@/lib/store';

export default function EarningsPage() {
  const [activeNav, setActiveNav] = useState('commissions');
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [stats, setStats] = useState({ totalAffiliates: 0, totalClients: 0, totalTrades: 0, totalVolume: 0, totalProfit: 0, totalCommissions: 0 });
  const [earningsData, setEarningsData] = useState<Array<{ month: string; amount: number; trades: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializePartner();
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, earningsResult] = await Promise.all([
        getStatsAsync(),
        getEarningsDataAsync(),
      ]);
      setStats(statsData);
      if (earningsResult.length > 0) {
        setEarningsData(earningsResult);
      }
    } catch (error) {
      console.error('[Earnings] Error loading data:', error);
      setStats({ ...getStats(), totalCommissions: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  const navItems = [
    { icon: IconHome, label: 'Overview', id: 'dashboard', href: '/' },
    { icon: IconUsers, label: 'Affiliates', id: 'affiliates', href: '/affiliates' },
    { icon: IconBroadcast, label: 'Broadcast', id: 'broadcast', href: '/broadcast' },
    { icon: IconWallet, label: 'Earnings', id: 'commissions', href: '/earnings' },
    { icon: IconFileAnalytics, label: 'Analytics', id: 'reports', href: '/analytics' },
    { icon: IconSettings, label: 'Settings', id: 'settings', href: '/settings' },
  ];

  // Use real earnings data or fallback to empty
  const displayEarningsData = earningsData.length > 0 ? earningsData : [
    { month: 'Jan', amount: 0, trades: 0 },
    { month: 'Feb', amount: 0, trades: 0 },
    { month: 'Mar', amount: 0, trades: 0 },
  ];

  // Pending payouts based on commissions
  const pendingPayout = stats.totalCommissions;

  // Commission rate is 4.5%
  const commissionRate = 4.5;

  // This month's earnings (from latest month in data)
  const thisMonthEarnings = displayEarningsData.length > 0
    ? displayEarningsData[displayEarningsData.length - 1].amount
    : 0;

  const recentPayouts: Array<{ id: number; date: string; amount: number; status: string; method: string }> = [];

  const maxAmount = Math.max(...displayEarningsData.map(d => d.amount), 1);

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

        * { font-family: 'Outfit', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        .dashboard-container {
          min-height: 100vh;
          background: var(--bg-primary);
          display: flex;
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
          letter-spacing: -0.02em;
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
          margin-top: 16px;
        }

        .nav-label:first-child { margin-top: 0; }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-secondary);
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
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

        .nav-item-special {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.1) 0%, rgba(255, 68, 79, 0.05) 100%);
          border: 1px solid rgba(255, 68, 79, 0.2);
        }

        .user-section {
          padding: 16px;
          border-top: 1px solid var(--border-subtle);
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg-tertiary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }

        .user-info { flex: 1; min-width: 0; }
        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }
        .user-role { font-size: 12px; color: var(--text-muted); }

        .main-content {
          flex: 1;
          margin-left: 240px;
          background: var(--bg-primary);
        }

        .top-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(10, 10, 11, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border-subtle);
          padding: 16px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .back-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .back-btn:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
        }

        .header-left h1 {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .header-left p {
          font-size: 14px;
          color: var(--text-muted);
          margin: 4px 0 0 0;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .icon-btn:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
        }

        .primary-btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
          box-shadow: 0 4px 20px var(--accent-glow);
        }

        .primary-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 30px var(--accent-glow);
        }

        .content-area { padding: 32px; }

        .earnings-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .earning-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .earning-card.highlight {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.1) 0%, var(--bg-secondary) 100%);
          border-color: rgba(255, 68, 79, 0.2);
        }

        .earning-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .earning-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--accent-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }

        .earning-trend {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 500;
          padding: 4px 8px;
          border-radius: 6px;
        }

        .earning-trend.up {
          background: rgba(16, 185, 129, 0.1);
          color: var(--success);
        }

        .earning-label {
          font-size: 13px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }

        .earning-value {
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .earning-value.large {
          font-size: 36px;
        }

        .cards-row {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }

        .card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          overflow: hidden;
        }

        .card-header {
          padding: 20px 24px;
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .card-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .card-title svg { color: var(--accent); }

        .card-body { padding: 24px; }

        .period-tabs {
          display: flex;
          gap: 8px;
        }

        .period-tab {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .period-tab:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .period-tab.active {
          background: var(--accent);
          border-color: var(--accent);
          color: white;
        }

        .chart-container {
          display: flex;
          align-items: flex-end;
          gap: 16px;
          height: 200px;
          padding-top: 20px;
        }

        .chart-bar-group {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .chart-bar {
          width: 100%;
          background: linear-gradient(180deg, var(--accent) 0%, rgba(255, 68, 79, 0.5) 100%);
          border-radius: 6px 6px 0 0;
          transition: all 0.3s ease;
          min-height: 20px;
        }

        .chart-bar:hover {
          background: linear-gradient(180deg, #ff6b73 0%, var(--accent) 100%);
          transform: scaleY(1.02);
        }

        .chart-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .chart-value {
          font-size: 11px;
          color: var(--text-secondary);
          font-family: 'JetBrains Mono', monospace;
        }

        .payout-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .payout-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          background: var(--bg-tertiary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }

        .payout-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .payout-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--success);
        }

        .payout-details h4 {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0;
        }

        .payout-details p {
          font-size: 12px;
          color: var(--text-muted);
          margin: 4px 0 0 0;
        }

        .payout-amount {
          font-size: 16px;
          font-weight: 600;
          color: var(--success);
          font-family: 'JetBrains Mono', monospace;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          background: rgba(16, 185, 129, 0.1);
          color: var(--success);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-in { animation: fadeIn 0.4s ease forwards; }
        .delay-1 { animation-delay: 0.1s; opacity: 0; }
        .delay-2 { animation-delay: 0.2s; opacity: 0; }
        .delay-3 { animation-delay: 0.3s; opacity: 0; }
        .delay-4 { animation-delay: 0.4s; opacity: 0; }
      `}</style>

      <div className="dashboard-container">
        <aside className="sidebar">
          <div className="logo-section">
            <div className="logo">
              <div className="logo-icon">L</div>
              <span className="logo-text">LunarGraph</span>
            </div>
          </div>

          <nav className="nav-section">
            <span className="nav-label">Menu</span>
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
              >
                <item.icon size={18} stroke={1.5} />
                <span>{item.label}</span>
              </Link>
            ))}

            <span className="nav-label">Intelligence</span>
            <Link href="/dashboard" className="nav-item nav-item-special">
              <IconShield size={18} stroke={1.5} />
              <span style={{ flex: 1 }}>Fraud Detection</span>
              <Badge size="xs" color="red" variant="filled">Live</Badge>
            </Link>
          </nav>

          <div className="user-section">
            <div className="user-card">
              <Avatar color="red" radius="md" size={40}>MA</Avatar>
              <div className="user-info">
                <div className="user-name">Mohamed Al-Rashid</div>
                <div className="user-role">Premium Partner</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <header className="top-header">
            <div className="header-left">
              <Link href="/">
                <button className="back-btn">
                  <IconArrowLeft size={18} />
                </button>
              </Link>
              <div>
                <h1>Earnings</h1>
                <p>Track your commissions and payouts</p>
              </div>
            </div>
            <div className="header-right">
              <button className="icon-btn">
                <IconCalendar size={18} />
              </button>
              <button className="primary-btn">
                <IconDownload size={16} />
                <span>Export Report</span>
              </button>
            </div>
          </header>

          <div className="content-area">
            {/* Earnings Stats */}
            <div className="earnings-grid">
              <div className="earning-card highlight animate-in delay-1">
                <div className="earning-card-header">
                  <div className="earning-icon">
                    <IconCurrencyDollar size={24} />
                  </div>
                  <div className="earning-trend up">
                    <IconArrowUpRight size={14} />
                    24%
                  </div>
                </div>
                <div className="earning-label">Total Earnings</div>
                <div className="earning-value large">${stats.totalCommissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>

              <div className="earning-card animate-in delay-2">
                <div className="earning-card-header">
                  <div className="earning-icon">
                    <IconWallet size={24} />
                  </div>
                  <div className="earning-trend up">
                    <IconArrowUpRight size={14} />
                    {thisMonthEarnings > 0 ? '+' : ''}
                  </div>
                </div>
                <div className="earning-label">This Month</div>
                <div className="earning-value">${thisMonthEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>

              <div className="earning-card animate-in delay-3">
                <div className="earning-card-header">
                  <div className="earning-icon">
                    <IconTrendingUp size={24} />
                  </div>
                </div>
                <div className="earning-label">Pending Payout</div>
                <div className="earning-value">${pendingPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>

              <div className="earning-card animate-in delay-4">
                <div className="earning-card-header">
                  <div className="earning-icon">
                    <IconUsers size={24} />
                  </div>
                </div>
                <div className="earning-label">Commission Rate</div>
                <div className="earning-value">{commissionRate}%</div>
              </div>
            </div>

            {/* Charts and Payouts */}
            <div className="cards-row">
              <div className="card animate-in">
                <div className="card-header">
                  <div className="card-title">
                    <IconTrendingUp size={20} />
                    Earnings Overview
                  </div>
                  <div className="period-tabs">
                    <button
                      className={`period-tab ${selectedPeriod === 'week' ? 'active' : ''}`}
                      onClick={() => setSelectedPeriod('week')}
                    >
                      Week
                    </button>
                    <button
                      className={`period-tab ${selectedPeriod === 'month' ? 'active' : ''}`}
                      onClick={() => setSelectedPeriod('month')}
                    >
                      Month
                    </button>
                    <button
                      className={`period-tab ${selectedPeriod === 'year' ? 'active' : ''}`}
                      onClick={() => setSelectedPeriod('year')}
                    >
                      Year
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={displayEarningsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="month" stroke="#52525b" fontSize={12} />
                      <YAxis stroke="#52525b" fontSize={12} tickFormatter={(value) => `$${value}`} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#18181b',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          color: '#fff',
                        }}
                        formatter={(value: number) => [`$${value.toFixed(2)}`, 'Earnings']}
                      />
                      <Bar dataKey="amount" fill="#FF444F" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card animate-in">
                <div className="card-header">
                  <div className="card-title">
                    <IconWallet size={20} />
                    Recent Payouts
                  </div>
                </div>
                <div className="card-body">
                  <div className="payout-list">
                    {recentPayouts.length > 0 ? recentPayouts.slice(0, 3).map((payout) => (
                      <div key={payout.id} className="payout-item">
                        <div className="payout-info">
                          <div className="payout-icon">
                            <IconCurrencyDollar size={20} />
                          </div>
                          <div className="payout-details">
                            <h4>{payout.method}</h4>
                            <p>{payout.date}</p>
                          </div>
                        </div>
                        <div className="payout-amount">+${payout.amount.toFixed(2)}</div>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        No payouts yet. Commissions are pending.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Full Payout History */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <IconCurrencyDollar size={20} />
                  Payout History
                </div>
                <Text size="sm" c="dimmed">{recentPayouts.length} transactions</Text>
              </div>
              <div className="card-body" style={{ padding: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '14px 20px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--bg-tertiary)' }}>Date</th>
                      <th style={{ textAlign: 'left', padding: '14px 20px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--bg-tertiary)' }}>Method</th>
                      <th style={{ textAlign: 'left', padding: '14px 20px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--bg-tertiary)' }}>Amount</th>
                      <th style={{ textAlign: 'left', padding: '14px 20px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', background: 'var(--bg-tertiary)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayouts.length > 0 ? recentPayouts.map((payout) => (
                      <tr key={payout.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td style={{ padding: '16px 20px', color: 'var(--text-primary)', fontSize: 14 }}>{payout.date}</td>
                        <td style={{ padding: '16px 20px', color: 'var(--text-primary)', fontSize: 14 }}>{payout.method}</td>
                        <td style={{ padding: '16px 20px', color: 'var(--success)', fontSize: 14, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>+${payout.amount.toFixed(2)}</td>
                        <td style={{ padding: '16px 20px' }}>
                          <span className="status-badge">Completed</span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          No payout history yet. Your pending commissions: ${stats.totalCommissions.toFixed(2)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
