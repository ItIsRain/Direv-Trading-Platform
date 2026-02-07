'use client';

import { useState, useEffect } from 'react';
import { Text, Badge, Avatar, RingProgress } from '@mantine/core';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  IconUsers,
  IconHome,
  IconSettings,
  IconBell,
  IconChevronRight,
  IconWallet,
  IconFileAnalytics,
  IconShield,
  IconArrowLeft,
  IconArrowUpRight,
  IconArrowDownRight,
  IconChartLine,
  IconChartBar,
  IconChartPie,
  IconCalendar,
  IconDownload,
  IconTrendingUp,
  IconWorld,
  IconDeviceDesktop,
  IconBroadcast
} from '@tabler/icons-react';
import Link from 'next/link';
import { initializePartner, getAffiliates, getClients, getTrades, getStats, getStatsAsync, getWeeklyDataAsync, getTopAffiliatesAsync } from '@/lib/store';

export default function AnalyticsPage() {
  const [activeNav, setActiveNav] = useState('reports');
  const [stats, setStats] = useState({ totalAffiliates: 0, totalClients: 0, totalTrades: 0, totalVolume: 0, totalProfit: 0, totalCommissions: 0 });
  const [affiliates, setAffiliates] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<Array<{ day: string; trades: number; clients: number; volume: number }>>([]);
  const [topPerformers, setTopPerformers] = useState<Array<{ id: string; name: string; clients: number; trades: number; volume: number; commission: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializePartner();
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statsData, weeklyDataResult, topAffiliates] = await Promise.all([
        getStatsAsync(),
        getWeeklyDataAsync(),
        getTopAffiliatesAsync(4),
      ]);

      setStats(statsData);
      if (weeklyDataResult.length > 0) {
        setWeeklyData(weeklyDataResult);
      }
      if (topAffiliates.length > 0) {
        setTopPerformers(topAffiliates);
      }
      setAffiliates(getAffiliates());
    } catch (error) {
      console.error('[Analytics] Error loading data:', error);
      setStats({ ...getStats(), totalCommissions: 0 });
      setAffiliates(getAffiliates());
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

  const trafficSources = [
    { name: 'Direct', value: 45, color: '#FF444F' },
    { name: 'Referral', value: 30, color: '#10b981' },
    { name: 'Social', value: 15, color: '#f59e0b' },
    { name: 'Organic', value: 10, color: '#6366f1' },
  ];

  // Use real weekly data or fallback
  const displayWeeklyData = weeklyData.length > 0 ? weeklyData : [
    { day: 'Mon', trades: 0, clients: 0, volume: 0 },
    { day: 'Tue', trades: 0, clients: 0, volume: 0 },
    { day: 'Wed', trades: 0, clients: 0, volume: 0 },
    { day: 'Thu', trades: 0, clients: 0, volume: 0 },
    { day: 'Fri', trades: 0, clients: 0, volume: 0 },
    { day: 'Sat', trades: 0, clients: 0, volume: 0 },
    { day: 'Sun', trades: 0, clients: 0, volume: 0 },
  ];

  // Use real top performers or fallback
  const displayTopPerformers = topPerformers.length > 0 ? topPerformers : [];

  const maxTrades = Math.max(...displayWeeklyData.map(d => d.trades), 1);

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
        .user-name { font-size: 14px; font-weight: 500; color: var(--text-primary); }
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

        .analytics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .metric-card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 20px;
        }

        .metric-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .metric-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: var(--accent-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }

        .metric-trend {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 500;
          color: var(--success);
        }

        .metric-value {
          font-size: 28px;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .metric-label {
          font-size: 13px;
          color: var(--text-muted);
        }

        .charts-row {
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

        .weekly-chart {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          height: 180px;
          gap: 12px;
        }

        .weekly-bar-group {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }

        .weekly-bar {
          width: 100%;
          max-width: 50px;
          background: linear-gradient(180deg, var(--accent) 0%, rgba(255, 68, 79, 0.4) 100%);
          border-radius: 6px 6px 0 0;
          transition: all 0.3s ease;
        }

        .weekly-bar:hover {
          background: linear-gradient(180deg, #ff6b73 0%, var(--accent) 100%);
        }

        .weekly-label {
          font-size: 12px;
          color: var(--text-muted);
        }

        .traffic-sources {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .traffic-item {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .traffic-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }

        .traffic-info {
          flex: 1;
        }

        .traffic-name {
          font-size: 14px;
          color: var(--text-primary);
          font-weight: 500;
        }

        .traffic-bar-bg {
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          margin-top: 6px;
          overflow: hidden;
        }

        .traffic-bar-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.5s ease;
        }

        .traffic-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
        }

        .performers-list {
          display: flex;
          flex-direction: column;
        }

        .performer-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .performer-item:last-child {
          border-bottom: none;
        }

        .performer-rank {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .performer-rank.top {
          background: linear-gradient(135deg, var(--accent) 0%, #ff6b73 100%);
          color: white;
        }

        .performer-avatar {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent) 0%, #ff6b73 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          color: white;
        }

        .performer-info {
          flex: 1;
        }

        .performer-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .performer-stats {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .performer-volume {
          font-size: 14px;
          font-weight: 600;
          color: var(--success);
          font-family: 'JetBrains Mono', monospace;
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
                <h1>Analytics</h1>
                <p>Insights into your affiliate network performance</p>
              </div>
            </div>
            <div className="header-right">
              <button className="icon-btn">
                <IconCalendar size={18} />
              </button>
              <button className="primary-btn">
                <IconDownload size={16} />
                <span>Export</span>
              </button>
            </div>
          </header>

          <div className="content-area">
            {/* Metrics Grid */}
            <div className="analytics-grid">
              <div className="metric-card animate-in delay-1">
                <div className="metric-header">
                  <div className="metric-icon">
                    <IconChartLine size={20} />
                  </div>
                  <div className="metric-trend">
                    <IconArrowUpRight size={14} />
                    18%
                  </div>
                </div>
                <div className="metric-value">{stats.totalTrades}</div>
                <div className="metric-label">Total Trades</div>
              </div>

              <div className="metric-card animate-in delay-2">
                <div className="metric-header">
                  <div className="metric-icon">
                    <IconUsers size={20} />
                  </div>
                  <div className="metric-trend">
                    <IconArrowUpRight size={14} />
                    12%
                  </div>
                </div>
                <div className="metric-value">{stats.totalClients}</div>
                <div className="metric-label">Active Clients</div>
              </div>

              <div className="metric-card animate-in delay-3">
                <div className="metric-header">
                  <div className="metric-icon">
                    <IconTrendingUp size={20} />
                  </div>
                  <div className="metric-trend">
                    <IconArrowUpRight size={14} />
                    24%
                  </div>
                </div>
                <div className="metric-value">${stats.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="metric-label">Total Volume</div>
              </div>

              <div className="metric-card animate-in delay-4">
                <div className="metric-header">
                  <div className="metric-icon">
                    <IconWorld size={20} />
                  </div>
                  <div className="metric-trend">
                    <IconArrowUpRight size={14} />
                    4.5%
                  </div>
                </div>
                <div className="metric-value">${stats.totalCommissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="metric-label">Total Commissions (4.5%)</div>
              </div>
            </div>

            {/* Weekly Activity Chart - Full Width */}
            <div className="card animate-in" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <div className="card-title">
                  <IconChartBar size={20} />
                  Weekly Trading Activity
                </div>
              </div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={displayWeeklyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" stroke="#52525b" fontSize={12} />
                    <YAxis stroke="#52525b" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="trades" fill="#FF444F" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Performers */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <IconTrendingUp size={20} />
                  Top Performing Affiliates
                </div>
                <Text size="sm" c="dimmed">This month</Text>
              </div>
              <div className="card-body">
                <div className="performers-list">
                  {displayTopPerformers.length > 0 ? displayTopPerformers.map((performer, i) => (
                    <div key={performer.id} className="performer-item">
                      <div className={`performer-rank ${i === 0 ? 'top' : ''}`}>{i + 1}</div>
                      <div className="performer-avatar">
                        {performer.name.charAt(0)}
                      </div>
                      <div className="performer-info">
                        <div className="performer-name">{performer.name}</div>
                        <div className="performer-stats">{performer.clients} clients · {performer.trades} trades</div>
                      </div>
                      <div className="performer-volume">${performer.volume.toLocaleString()}</div>
                    </div>
                  )) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      No affiliate data yet. Create affiliates to see performance.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
