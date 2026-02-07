'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Text, Badge, CopyButton, Avatar } from '@mantine/core';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  IconUsers,
  IconUserPlus,
  IconChartLine,
  IconCurrencyDollar,
  IconCopy,
  IconCheck,
  IconHome,
  IconSettings,
  IconBell,
  IconSearch,
  IconChevronRight,
  IconWallet,
  IconFileAnalytics,
  IconShield,
  IconArrowUpRight,
  IconArrowDownRight,
  IconPlus,
  IconTrendingUp,
  IconActivity,
  IconClock,
  IconBolt
} from '@tabler/icons-react';
import Link from 'next/link';
import { initializePartner, getAffiliates, getClients, getTrades, getStats, getStatsAsync, getAffiliatesAsync, getRecentActivityAsync, getWeeklyDataAsync, getTopAffiliatesAsync } from '@/lib/store';
import type { Affiliate } from '@/types';

// OAuth callback handler component
function OAuthCallbackHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token1 = searchParams.get('token1');
    const acct1 = searchParams.get('acct1');

    if (token1 && acct1) {
      console.log('[OAuth Callback] Received tokens, redirecting...');

      // Get the stored referral code
      const referralCode = localStorage.getItem('deriv_oauth_referral');

      if (referralCode) {
        // Store the tokens for this referral code
        localStorage.setItem(`deriv_token_${referralCode}`, token1);
        localStorage.setItem(`deriv_account_${referralCode}`, acct1);

        // Clean up
        localStorage.removeItem('deriv_oauth_referral');

        // Redirect to the trade page
        console.log('[OAuth Callback] Redirecting to /trade/' + referralCode);
        router.push(`/trade/${referralCode}`);
      } else {
        // No referral code stored, just clean URL
        console.log('[OAuth Callback] No referral code found, staying on home page');
        window.history.replaceState({}, '', '/');
      }
    }
  }, [searchParams, router]);

  return null;
}

export default function PartnerDashboard() {
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [stats, setStats] = useState({ totalAffiliates: 0, totalClients: 0, totalTrades: 0, totalVolume: 0, totalProfit: 0, totalCommissions: 0 });
  const [activeNav, setActiveNav] = useState('dashboard');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [recentActivity, setRecentActivity] = useState<Array<{ type: 'signup' | 'trade' | 'payout'; name: string; time: string; amount?: number }>>([]);
  const [weeklyData, setWeeklyData] = useState<Array<{ day: string; trades: number; clients: number; volume: number }>>([]);
  const [topAffiliatesData, setTopAffiliatesData] = useState<Array<{ id: string; name: string; clients: number; trades: number; volume: number; commission: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    initializePartner();
    refreshData();

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshData = async () => {
    setIsLoading(true);
    try {
      // Fetch real data from Supabase
      const [statsData, affiliatesData, activityData, weeklyDataResult, topAffiliates] = await Promise.all([
        getStatsAsync(),
        getAffiliatesAsync(),
        getRecentActivityAsync(5),
        getWeeklyDataAsync(),
        getTopAffiliatesAsync(3),
      ]);

      setStats(statsData);
      setAffiliates(affiliatesData);
      setRecentActivity(activityData);
      setWeeklyData(weeklyDataResult);
      setTopAffiliatesData(topAffiliates);
    } catch (error) {
      console.error('[Dashboard] Error fetching data:', error);
      // Fallback to in-memory data
      setAffiliates(getAffiliates());
      setStats({ ...getStats(), totalCommissions: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  // Animated line chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Generate smooth curve data
    const points: { x: number; y: number }[] = [];
    const dataPoints = [30, 45, 35, 55, 48, 62, 58, 75, 68, 85, 78, 92];

    for (let i = 0; i < dataPoints.length; i++) {
      points.push({
        x: (i / (dataPoints.length - 1)) * width,
        y: height - (dataPoints[i] / 100) * (height - 40) - 20
      });
    }

    let animationProgress = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = (height / 5) * i + 20;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(255, 68, 79, 0.3)');
      gradient.addColorStop(1, 'rgba(255, 68, 79, 0)');

      // Draw filled area
      ctx.beginPath();
      ctx.moveTo(0, height);

      const progress = Math.min(animationProgress, 1);
      const visiblePoints = Math.floor(points.length * progress);

      for (let i = 0; i <= visiblePoints && i < points.length; i++) {
        if (i === 0) {
          ctx.lineTo(points[i].x, points[i].y);
        } else {
          const xc = (points[i].x + points[i - 1].x) / 2;
          const yc = (points[i].y + points[i - 1].y) / 2;
          ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
      }

      if (visiblePoints > 0 && visiblePoints < points.length) {
        ctx.lineTo(points[visiblePoints - 1].x, height);
      } else if (visiblePoints >= points.length) {
        ctx.lineTo(width, height);
      }

      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw line
      ctx.beginPath();
      for (let i = 0; i <= visiblePoints && i < points.length; i++) {
        if (i === 0) {
          ctx.moveTo(points[i].x, points[i].y);
        } else {
          const xc = (points[i].x + points[i - 1].x) / 2;
          const yc = (points[i].y + points[i - 1].y) / 2;
          ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
        }
      }
      ctx.strokeStyle = '#FF444F';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Glow effect
      ctx.shadowColor = '#FF444F';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Draw points
      for (let i = 0; i <= visiblePoints && i < points.length; i++) {
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#FF444F';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
      }

      if (animationProgress < 1) {
        animationProgress += 0.02;
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, []);

  const getClientCount = (affiliateId: string) => {
    return getClients().filter(c => c.affiliateId === affiliateId).length;
  };

  const getTradeCount = (affiliateId: string) => {
    const clientIds = getClients().filter(c => c.affiliateId === affiliateId).map(c => c.id);
    return getTrades().filter(t => clientIds.includes(t.accountId)).length;
  };

  const navItems = [
    { icon: IconHome, label: 'Overview', id: 'dashboard', href: '/' },
    { icon: IconUsers, label: 'Affiliates', id: 'affiliates', href: '/affiliates' },
    { icon: IconWallet, label: 'Earnings', id: 'commissions', href: '/earnings' },
    { icon: IconFileAnalytics, label: 'Analytics', id: 'reports', href: '/analytics' },
    { icon: IconSettings, label: 'Settings', id: 'settings', href: '/settings' },
  ];

  // Get icon and color for activity type
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'signup': return { icon: IconUserPlus, color: '#10b981' };
      case 'trade': return { icon: IconChartLine, color: '#FF444F' };
      case 'payout': return { icon: IconWallet, color: '#f59e0b' };
      default: return { icon: IconActivity, color: '#a1a1aa' };
    }
  };

  // Calculate weekly performance values (normalize to percentages)
  const maxWeeklyTrades = Math.max(...weeklyData.map(d => d.trades), 1);
  const weeklyPerformance = weeklyData.map(d => ({
    day: d.day,
    value: Math.round((d.trades / maxWeeklyTrades) * 100) || 10,
  }));

  // Commission breakdown calculated from top affiliates
  const totalVolume = topAffiliatesData.reduce((sum, a) => sum + a.volume, 0);
  const commissionBreakdown = topAffiliatesData.map(aff => ({
    name: aff.name,
    value: totalVolume > 0 ? Math.round((aff.volume / totalVolume) * 100) : 0,
    commission: aff.commission,
  }));

  return (
    <>
      {/* Handle OAuth callback from Deriv */}
      <Suspense fallback={null}>
        <OAuthCallbackHandler />
      </Suspense>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

        :root {
          --bg-primary: #08080a;
          --bg-secondary: #0f0f12;
          --bg-tertiary: #151518;
          --bg-elevated: #1a1a1f;
          --bg-card: linear-gradient(145deg, #111114 0%, #0d0d0f 100%);
          --border-subtle: rgba(255, 255, 255, 0.04);
          --border-medium: rgba(255, 255, 255, 0.08);
          --border-glow: rgba(255, 68, 79, 0.3);
          --text-primary: #ffffff;
          --text-secondary: #a1a1aa;
          --text-muted: #52525b;
          --accent: #FF444F;
          --accent-light: #ff6b73;
          --accent-glow: rgba(255, 68, 79, 0.15);
          --accent-glow-strong: rgba(255, 68, 79, 0.4);
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

        /* Sidebar */
        .sidebar {
          width: 260px;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          position: fixed;
          height: 100vh;
          z-index: 100;
        }

        .logo-section {
          padding: 28px 24px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .logo-icon {
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          color: white;
          box-shadow: 0 8px 32px var(--accent-glow-strong);
          position: relative;
        }

        .logo-icon::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--accent) 0%, transparent 50%);
          z-index: -1;
          opacity: 0.5;
        }

        .logo-text {
          font-weight: 700;
          font-size: 20px;
          color: var(--text-primary);
          letter-spacing: -0.03em;
        }

        .nav-section {
          flex: 1;
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .nav-label {
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          padding: 12px 14px 8px;
          margin-top: 12px;
        }

        .nav-label:first-child { margin-top: 0; }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          color: var(--text-secondary);
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          position: relative;
          overflow: hidden;
        }

        .nav-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 0;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
          transition: height 0.25s ease;
        }

        .nav-item:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .nav-item:hover::before {
          height: 20px;
        }

        .nav-item.active {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
          color: white;
          box-shadow: 0 8px 32px var(--accent-glow-strong);
        }

        .nav-item.active::before {
          display: none;
        }

        .nav-item-special {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.08) 0%, rgba(255, 68, 79, 0.02) 100%);
          border: 1px solid rgba(255, 68, 79, 0.15);
        }

        .nav-item-special:hover {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.12) 0%, rgba(255, 68, 79, 0.05) 100%);
          border-color: rgba(255, 68, 79, 0.25);
        }

        .user-section {
          padding: 20px;
          border-top: 1px solid var(--border-subtle);
        }

        .user-card {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          background: var(--bg-tertiary);
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
        }

        .user-info { flex: 1; min-width: 0; }
        .user-name { font-size: 14px; font-weight: 600; color: var(--text-primary); }
        .user-role { font-size: 12px; color: var(--text-muted); }

        .user-status {
          width: 10px;
          height: 10px;
          background: var(--success);
          border-radius: 50%;
          box-shadow: 0 0 10px var(--success);
        }

        /* Main Content */
        .main-content {
          flex: 1;
          margin-left: 260px;
          background: var(--bg-primary);
          position: relative;
        }

        .main-content::before {
          content: '';
          position: fixed;
          top: 0;
          right: 0;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .top-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(8, 8, 10, 0.85);
          backdrop-filter: blur(24px);
          border-bottom: 1px solid var(--border-subtle);
          padding: 20px 36px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .header-left h1 {
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.03em;
          margin: 0;
        }

        .header-left p {
          font-size: 14px;
          color: var(--text-muted);
          margin: 6px 0 0 0;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .search-box {
          position: relative;
        }

        .search-box input {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 12px 16px 12px 44px;
          color: var(--text-primary);
          font-size: 14px;
          width: 260px;
          transition: all 0.25s ease;
        }

        .search-box input::placeholder { color: var(--text-muted); }

        .search-box input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 4px var(--accent-glow);
        }

        .search-box svg {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .icon-btn {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.25s ease;
          position: relative;
        }

        .icon-btn:hover {
          background: var(--bg-elevated);
          color: var(--text-primary);
          border-color: var(--border-medium);
          transform: translateY(-2px);
        }

        .icon-btn .notification-dot {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 8px;
          height: 8px;
          background: var(--accent);
          border-radius: 50%;
          box-shadow: 0 0 8px var(--accent);
        }

        .primary-btn {
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: all 0.25s ease;
          box-shadow: 0 8px 32px var(--accent-glow-strong);
        }

        .primary-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px var(--accent-glow-strong);
        }

        .content-area {
          padding: 36px;
          position: relative;
          z-index: 1;
        }

        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 20px;
          margin-bottom: 28px;
        }

        .stat-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          padding: 24px;
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, var(--accent), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .stat-card:hover {
          border-color: var(--border-medium);
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .stat-card:hover::before {
          opacity: 1;
        }

        .stat-card.featured {
          background: linear-gradient(145deg, rgba(255, 68, 79, 0.1) 0%, var(--bg-secondary) 100%);
          border-color: rgba(255, 68, 79, 0.2);
        }

        .stat-card.featured::after {
          content: '';
          position: absolute;
          top: -50%;
          right: -50%;
          width: 100%;
          height: 100%;
          background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
          pointer-events: none;
        }

        .stat-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .stat-icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }

        .stat-icon-wrap.red {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.2) 0%, rgba(255, 68, 79, 0.05) 100%);
          color: var(--accent);
        }

        .stat-icon-wrap.green {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%);
          color: var(--success);
        }

        .stat-icon-wrap.orange {
          background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.05) 100%);
          color: var(--warning);
        }

        .stat-icon-wrap.purple {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(139, 92, 246, 0.05) 100%);
          color: #8b5cf6;
        }

        .stat-trend {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 10px;
          border-radius: 8px;
        }

        .stat-trend.up {
          background: rgba(16, 185, 129, 0.1);
          color: var(--success);
        }

        .stat-trend.down {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .stat-value {
          font-size: 36px;
          font-weight: 700;
          color: var(--text-primary);
          letter-spacing: -0.03em;
          line-height: 1;
          margin-bottom: 8px;
        }

        .stat-label {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .stat-sparkline {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px;
          opacity: 0.5;
        }

        /* Main Grid Layout */
        .main-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }

        .card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          overflow: hidden;
        }

        .card-header {
          padding: 24px 28px;
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
          gap: 12px;
        }

        .card-title svg {
          color: var(--accent);
        }

        .card-body {
          padding: 28px;
        }

        /* Chart */
        .chart-canvas {
          width: 100%;
          height: 220px;
          display: block;
        }

        .chart-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 16px;
          padding: 0 8px;
        }

        .chart-label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Activity Feed */
        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .activity-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .activity-item:hover {
          background: var(--bg-tertiary);
        }

        .activity-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .activity-info {
          flex: 1;
        }

        .activity-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .activity-time {
          font-size: 12px;
          color: var(--text-muted);
        }

        .activity-badge {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 500;
        }

        /* Secondary Grid */
        .secondary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }

        /* Weekly Chart */
        .weekly-bars {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          height: 140px;
          gap: 12px;
        }

        .weekly-bar-group {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
        }

        .weekly-bar {
          width: 100%;
          border-radius: 6px;
          transition: all 0.3s ease;
          position: relative;
        }

        .weekly-bar::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 6px;
          background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%);
        }

        .weekly-bar:hover {
          filter: brightness(1.2);
          transform: scaleY(1.05);
          transform-origin: bottom;
        }

        .weekly-label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 500;
        }

        /* Countries */
        .country-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .country-item {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .country-flag {
          font-size: 24px;
        }

        .country-info {
          flex: 1;
        }

        .country-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin-bottom: 6px;
        }

        .country-bar-bg {
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;
        }

        .country-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent), var(--accent-light));
          border-radius: 3px;
          transition: width 0.5s ease;
        }

        .country-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
        }

        /* Affiliates Preview */
        .affiliate-preview {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .affiliate-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          background: var(--bg-tertiary);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          transition: all 0.2s ease;
        }

        .affiliate-row:hover {
          border-color: var(--border-medium);
          transform: translateX(4px);
        }

        .affiliate-avatar {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 16px;
          color: white;
        }

        .affiliate-info {
          flex: 1;
        }

        .affiliate-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
        }

        .affiliate-stats {
          font-size: 12px;
          color: var(--text-muted);
        }

        .affiliate-amount {
          font-size: 14px;
          font-weight: 600;
          color: var(--success);
          font-family: 'JetBrains Mono', monospace;
        }

        .view-all-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px;
          background: transparent;
          border: 1px dashed var(--border-medium);
          border-radius: 12px;
          color: var(--text-secondary);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 8px;
        }

        .view-all-btn:hover {
          background: var(--bg-tertiary);
          border-style: solid;
          color: var(--text-primary);
        }

        /* Live indicator */
        .live-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: var(--success);
          font-weight: 500;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          background: var(--success);
          border-radius: 50%;
          animation: pulse-live 2s infinite;
        }

        @keyframes pulse-live {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
          50% { opacity: 0.8; box-shadow: 0 0 0 8px rgba(16, 185, 129, 0); }
        }

        /* Animations */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-16px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .animate-in { animation: fadeIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }
        .slide-in { animation: slideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards; }

        .delay-1 { animation-delay: 0.1s; opacity: 0; }
        .delay-2 { animation-delay: 0.15s; opacity: 0; }
        .delay-3 { animation-delay: 0.2s; opacity: 0; }
        .delay-4 { animation-delay: 0.25s; opacity: 0; }
        .delay-5 { animation-delay: 0.3s; opacity: 0; }
        .delay-6 { animation-delay: 0.35s; opacity: 0; }
      `}</style>

      <div className="dashboard-container">
        {/* Sidebar */}
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
                onClick={() => setActiveNav(item.id)}
              >
                <item.icon size={20} stroke={1.5} />
                <span>{item.label}</span>
              </Link>
            ))}

            <span className="nav-label">Intelligence</span>
            <Link href="/dashboard" className="nav-item nav-item-special">
              <IconShield size={20} stroke={1.5} />
              <span style={{ flex: 1 }}>Fraud Detection</span>
              <Badge size="xs" color="red" variant="filled">Live</Badge>
            </Link>
          </nav>

          <div className="user-section">
            <div className="user-card">
              <Avatar color="red" radius="md" size={44}>MA</Avatar>
              <div className="user-info">
                <div className="user-name">Mohamed Al-Rashid</div>
                <div className="user-role">Premium Partner</div>
              </div>
              <div className="user-status" />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          <header className="top-header">
            <div className="header-left">
              <h1>Dashboard</h1>
              <p>Welcome back, Mohamed. Here's your network overview.</p>
            </div>
            <div className="header-right">
              <div className="search-box">
                <IconSearch size={18} />
                <input type="text" placeholder="Search anything..." />
              </div>
              <button className="icon-btn">
                <IconBell size={20} />
                <span className="notification-dot" />
              </button>
              <Link href="/affiliates">
                <button className="primary-btn">
                  <IconPlus size={18} />
                  <span>New Affiliate</span>
                </button>
              </Link>
            </div>
          </header>

          <div className="content-area">
            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card featured animate-in delay-1">
                <div className="stat-header">
                  <div className="stat-icon-wrap red">
                    <IconCurrencyDollar size={26} />
                  </div>
                  <div className="stat-trend up">
                    <IconArrowUpRight size={14} />
                    24.5%
                  </div>
                </div>
                <div className="stat-value">${stats.totalVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="stat-label">Total Volume</div>
              </div>

              <div className="stat-card animate-in delay-2">
                <div className="stat-header">
                  <div className="stat-icon-wrap green">
                    <IconUsers size={24} />
                  </div>
                  <div className="stat-trend up">
                    <IconArrowUpRight size={14} />
                    12%
                  </div>
                </div>
                <div className="stat-value">{stats.totalAffiliates}</div>
                <div className="stat-label">Active Affiliates</div>
              </div>

              <div className="stat-card animate-in delay-3">
                <div className="stat-header">
                  <div className="stat-icon-wrap orange">
                    <IconUserPlus size={24} />
                  </div>
                  <div className="stat-trend up">
                    <IconArrowUpRight size={14} />
                    8%
                  </div>
                </div>
                <div className="stat-value">{stats.totalClients}</div>
                <div className="stat-label">Total Clients</div>
              </div>

              <div className="stat-card animate-in delay-4">
                <div className="stat-header">
                  <div className="stat-icon-wrap purple">
                    <IconChartLine size={24} />
                  </div>
                  <div className="stat-trend up">
                    <IconArrowUpRight size={14} />
                    18%
                  </div>
                </div>
                <div className="stat-value">{stats.totalTrades}</div>
                <div className="stat-label">Total Trades</div>
              </div>

              <div className="stat-card featured animate-in delay-5" style={{ background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.1) 0%, var(--bg-secondary) 100%)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                <div className="stat-header">
                  <div className="stat-icon-wrap" style={{ background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)', color: 'var(--success)' }}>
                    <IconWallet size={24} />
                  </div>
                  <div className="stat-trend up">
                    <IconArrowUpRight size={14} />
                    4.5%
                  </div>
                </div>
                <div className="stat-value" style={{ color: 'var(--success)' }}>${stats.totalCommissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div className="stat-label">My Earnings (4.5%)</div>
              </div>
            </div>

            {/* Revenue Chart - Full Width */}
            <div className="card animate-in delay-5" style={{ marginBottom: '24px' }}>
              <div className="card-header">
                <div className="card-title">
                  <IconTrendingUp size={22} />
                  Trading Volume Overview
                </div>
                <div className="live-indicator">
                  <span className="live-dot" />
                  Live
                </div>
              </div>
              <div className="card-body">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart
                    data={weeklyData.length > 0 ? weeklyData : [
                      { day: 'Mon', volume: 0 },
                      { day: 'Tue', volume: 0 },
                      { day: 'Wed', volume: 0 },
                      { day: 'Thu', volume: 0 },
                      { day: 'Fri', volume: 0 },
                      { day: 'Sat', volume: 0 },
                      { day: 'Sun', volume: 0 },
                    ]}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF444F" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#FF444F" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="day" stroke="#52525b" fontSize={12} />
                    <YAxis stroke="#52525b" fontSize={12} tickFormatter={(value) => `$${value}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#18181b',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        color: '#fff',
                      }}
                      formatter={(value: number) => [`$${value.toFixed(2)}`, 'Volume']}
                    />
                    <Area type="monotone" dataKey="volume" stroke="#FF444F" fillOpacity={1} fill="url(#colorVolume)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Secondary Grid */}
            <div className="secondary-grid">
              {/* Weekly Performance */}
              <div className="card animate-in">
                <div className="card-header">
                  <div className="card-title">
                    <IconBolt size={20} />
                    Weekly Performance
                  </div>
                </div>
                <div className="card-body">
                  <div className="weekly-bars">
                    {weeklyPerformance.map((data, i) => (
                      <div key={i} className="weekly-bar-group">
                        <div
                          className="weekly-bar"
                          style={{
                            height: `${data.value}%`,
                            background: data.value === Math.max(...weeklyPerformance.map(d => d.value))
                              ? 'linear-gradient(180deg, var(--accent) 0%, var(--accent-light) 100%)'
                              : 'linear-gradient(180deg, #3f3f46 0%, #27272a 100%)',
                            boxShadow: data.value === Math.max(...weeklyPerformance.map(d => d.value)) ? '0 8px 24px var(--accent-glow-strong)' : 'none'
                          }}
                        />
                        <span className="weekly-label">{data.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Commission Breakdown */}
              <div className="card animate-in">
                <div className="card-header">
                  <div className="card-title">
                    <IconCurrencyDollar size={20} />
                    Commission Breakdown
                  </div>
                </div>
                <div className="card-body">
                  <div className="country-list">
                    {commissionBreakdown.length > 0 ? commissionBreakdown.map((item, i) => (
                      <div key={i} className="country-item">
                        <div className="affiliate-avatar" style={{ width: 32, height: 32, borderRadius: 8, fontSize: 14 }}>
                          {item.name.charAt(0)}
                        </div>
                        <div className="country-info">
                          <div className="country-name">{item.name}</div>
                          <div className="country-bar-bg">
                            <div
                              className="country-bar-fill"
                              style={{ width: `${Math.max(item.value, 5)}%` }}
                            />
                          </div>
                        </div>
                        <span className="country-value" style={{ color: 'var(--success)' }}>${item.commission.toFixed(2)}</span>
                      </div>
                    )) : (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        No commission data yet
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Affiliates */}
              <div className="card animate-in">
                <div className="card-header">
                  <div className="card-title">
                    <IconUsers size={20} />
                    Top Affiliates
                  </div>
                </div>
                <div className="card-body" style={{ padding: '20px' }}>
                  <div className="affiliate-preview">
                    {topAffiliatesData.length > 0 ? topAffiliatesData.map((affiliate) => (
                      <div key={affiliate.id} className="affiliate-row">
                        <div className="affiliate-avatar">
                          {affiliate.name.charAt(0)}
                        </div>
                        <div className="affiliate-info">
                          <div className="affiliate-name">{affiliate.name}</div>
                          <div className="affiliate-stats">{affiliate.clients} clients · {affiliate.trades} trades</div>
                        </div>
                        <div className="affiliate-amount">${affiliate.volume.toFixed(2)}</div>
                      </div>
                    )) : affiliates.slice(0, 3).map((affiliate) => (
                      <div key={affiliate.id} className="affiliate-row">
                        <div className="affiliate-avatar">
                          {affiliate.name.charAt(0)}
                        </div>
                        <div className="affiliate-info">
                          <div className="affiliate-name">{affiliate.name}</div>
                          <div className="affiliate-stats">{getClientCount(affiliate.id)} clients · {getTradeCount(affiliate.id)} trades</div>
                        </div>
                        <div className="affiliate-amount">$0.00</div>
                      </div>
                    ))}
                    {affiliates.length === 0 && topAffiliatesData.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        No affiliates yet
                      </div>
                    )}
                  </div>
                  <Link href="/affiliates" style={{ textDecoration: 'none' }}>
                    <button className="view-all-btn">
                      View All Affiliates
                      <IconChevronRight size={16} />
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
