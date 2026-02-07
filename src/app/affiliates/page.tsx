'use client';

import { useState, useEffect } from 'react';
import { Text, Badge, CopyButton, Avatar } from '@mantine/core';
import {
  IconUsers,
  IconUserPlus,
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
  IconArrowLeft,
  IconPlus,
  IconMail,
  IconTrash
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { initializePartner, createAffiliate, getAffiliates, getClients, getTrades } from '@/lib/store';
import type { Affiliate } from '@/types';

export default function AffiliatesPage() {
  const [affiliateName, setAffiliateName] = useState('');
  const [affiliateEmail, setAffiliateEmail] = useState('');
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [generatedLink, setGeneratedLink] = useState('');
  const [activeNav, setActiveNav] = useState('affiliates');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const router = useRouter();

  useEffect(() => {
    initializePartner();
    refreshData();
  }, []);

  const refreshData = () => {
    setAffiliates(getAffiliates());
  };

  const handleCreateAffiliate = () => {
    if (!affiliateName.trim() || !affiliateEmail.trim()) {
      notifications.show({
        title: 'Error',
        message: 'Please enter both name and email',
        color: 'red',
      });
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(affiliateEmail)) {
      notifications.show({
        title: 'Invalid Email',
        message: 'Please enter a valid email address',
        color: 'red',
      });
      return;
    }

    const affiliate = createAffiliate(affiliateName, affiliateEmail);
    const link = `${window.location.origin}/trade/${affiliate.referralCode}`;
    setGeneratedLink(link);

    notifications.show({
      title: 'Affiliate Created!',
      message: `Referral link generated for ${affiliateName}`,
      color: 'teal',
    });

    setAffiliateName('');
    setAffiliateEmail('');
    refreshData();
  };

  const getClientCount = (affiliateId: string) => {
    return getClients().filter(c => c.affiliateId === affiliateId).length;
  };

  const getTradeCount = (affiliateId: string) => {
    const clientIds = getClients().filter(c => c.affiliateId === affiliateId).map(c => c.id);
    return getTrades().filter(t => clientIds.includes(t.accountId)).length;
  };

  const handleNavClick = (id: string) => {
    setActiveNav(id);
    if (id === 'dashboard') {
      router.push('/');
    }
  };

  const navItems = [
    { icon: IconHome, label: 'Overview', id: 'dashboard', href: '/' },
    { icon: IconUsers, label: 'Affiliates', id: 'affiliates', href: '/affiliates' },
    { icon: IconWallet, label: 'Earnings', id: 'commissions', href: '/earnings' },
    { icon: IconFileAnalytics, label: 'Analytics', id: 'reports', href: '/analytics' },
    { icon: IconSettings, label: 'Settings', id: 'settings', href: '/settings' },
  ];

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

        * {
          font-family: 'Outfit', sans-serif;
        }

        .mono {
          font-family: 'JetBrains Mono', monospace;
        }

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

        .nav-label:first-child {
          margin-top: 0;
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

        .nav-item-special:hover {
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.15) 0%, rgba(255, 68, 79, 0.1) 100%);
          border-color: rgba(255, 68, 79, 0.3);
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

        .user-info {
          flex: 1;
          min-width: 0;
        }

        .user-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .user-role {
          font-size: 12px;
          color: var(--text-muted);
        }

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
          letter-spacing: -0.02em;
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

        .search-box {
          position: relative;
        }

        .search-box input {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 10px 14px 10px 40px;
          color: var(--text-primary);
          font-size: 14px;
          width: 240px;
          transition: all 0.2s ease;
        }

        .search-box input::placeholder {
          color: var(--text-muted);
        }

        .search-box input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .search-box svg {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
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
          border-color: var(--border-medium);
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

        .content-area {
          padding: 32px;
        }

        .page-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 32px;
        }

        .mini-stat {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .mini-stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 10px;
          background: var(--accent-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }

        .mini-stat-content h3 {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .mini-stat-content p {
          font-size: 13px;
          color: var(--text-muted);
          margin: 4px 0 0 0;
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

        .card-title svg {
          color: var(--accent);
        }

        .card-body {
          padding: 24px;
        }

        .invite-form {
          display: grid;
          grid-template-columns: 1fr 1fr auto;
          gap: 16px;
          align-items: end;
        }

        .form-group label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .form-group input {
          width: 100%;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 12px 14px;
          color: var(--text-primary);
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .form-group input::placeholder {
          color: var(--text-muted);
        }

        .form-group input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .generated-link-box {
          margin-top: 20px;
          background: linear-gradient(135deg, rgba(255, 68, 79, 0.1) 0%, rgba(255, 68, 79, 0.05) 100%);
          border: 1px solid rgba(255, 68, 79, 0.2);
          border-radius: 10px;
          padding: 16px;
        }

        .generated-link-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }

        .generated-link-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .generated-link-content code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--text-secondary);
          word-break: break-all;
        }

        .table-container {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }

        .data-table th {
          text-align: left;
          padding: 14px 20px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: var(--bg-tertiary);
        }

        .data-table td {
          padding: 18px 20px;
          border-bottom: 1px solid var(--border-subtle);
          color: var(--text-primary);
          font-size: 14px;
        }

        .data-table tr:last-child td {
          border-bottom: none;
        }

        .data-table tr:hover td {
          background: rgba(255, 255, 255, 0.02);
        }

        .affiliate-cell {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .affiliate-avatar {
          width: 42px;
          height: 42px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent) 0%, #ff6b73 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 16px;
          color: white;
        }

        .affiliate-name {
          font-weight: 500;
          color: var(--text-primary);
          font-size: 15px;
        }

        .affiliate-email {
          font-size: 13px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .code-cell {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .code-text {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--text-secondary);
          background: var(--bg-tertiary);
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.active {
          background: rgba(16, 185, 129, 0.1);
          color: var(--success);
        }

        .status-badge.active::before {
          content: '';
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .copy-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: transparent;
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .copy-btn:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border-color: var(--border-medium);
        }

        .copy-btn.copied {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.3);
        }

        .action-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: transparent;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: var(--bg-tertiary);
          color: var(--accent);
        }

        .empty-state {
          text-align: center;
          padding: 80px 20px;
        }

        .empty-state-icon {
          width: 80px;
          height: 80px;
          border-radius: 20px;
          background: var(--bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        }

        .empty-state-icon svg {
          color: var(--text-muted);
        }

        .empty-state h3 {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 8px 0;
        }

        .empty-state p {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0 0 24px 0;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-in {
          animation: fadeIn 0.4s ease forwards;
        }

        .delay-1 { animation-delay: 0.1s; opacity: 0; }
        .delay-2 { animation-delay: 0.2s; opacity: 0; }
        .delay-3 { animation-delay: 0.3s; opacity: 0; }
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

        {/* Main Content */}
        <main className="main-content">
          <header className="top-header">
            <div className="header-left">
              <Link href="/">
                <button className="back-btn">
                  <IconArrowLeft size={18} />
                </button>
              </Link>
              <div>
                <h1>Affiliates</h1>
                <p>Manage your affiliate network and generate referral links</p>
              </div>
            </div>
            <div className="header-right">
              <div className="search-box">
                <IconSearch size={16} />
                <input type="text" placeholder="Search affiliates..." />
              </div>
              <button className="icon-btn">
                <IconBell size={18} />
              </button>
              <button className="primary-btn" onClick={() => setShowInviteForm(!showInviteForm)}>
                <IconPlus size={16} />
                <span>New Affiliate</span>
              </button>
            </div>
          </header>

          <div className="content-area">
            {/* Stats */}
            <div className="page-stats">
              <div className="mini-stat animate-in delay-1">
                <div className="mini-stat-icon">
                  <IconUsers size={24} />
                </div>
                <div className="mini-stat-content">
                  <h3>{affiliates.length}</h3>
                  <p>Total Affiliates</p>
                </div>
              </div>
              <div className="mini-stat animate-in delay-2">
                <div className="mini-stat-icon">
                  <IconUserPlus size={24} />
                </div>
                <div className="mini-stat-content">
                  <h3>{affiliates.reduce((acc, aff) => acc + getClientCount(aff.id), 0)}</h3>
                  <p>Total Clients</p>
                </div>
              </div>
              <div className="mini-stat animate-in delay-3">
                <div className="mini-stat-icon">
                  <IconChevronRight size={24} />
                </div>
                <div className="mini-stat-content">
                  <h3>{affiliates.reduce((acc, aff) => acc + getTradeCount(aff.id), 0)}</h3>
                  <p>Total Trades</p>
                </div>
              </div>
            </div>

            {/* Invite Form */}
            {showInviteForm && (
              <div className="card animate-in" style={{ marginBottom: 24 }}>
                <div className="card-header">
                  <div className="card-title">
                    <IconUserPlus size={20} />
                    Create New Affiliate
                  </div>
                </div>
                <div className="card-body">
                  <div className="invite-form">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        placeholder="Enter affiliate's full name"
                        value={affiliateName}
                        onChange={(e) => setAffiliateName(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        placeholder="affiliate@email.com"
                        value={affiliateEmail}
                        onChange={(e) => setAffiliateEmail(e.target.value)}
                      />
                    </div>
                    <button className="primary-btn" onClick={handleCreateAffiliate} style={{ height: 44 }}>
                      <IconPlus size={16} />
                      Generate Link
                    </button>
                  </div>

                  {generatedLink && (
                    <div className="generated-link-box">
                      <div className="generated-link-label">Referral Link Generated</div>
                      <div className="generated-link-content">
                        <code>{generatedLink}</code>
                        <CopyButton value={generatedLink}>
                          {({ copied, copy }) => (
                            <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
                              {copied ? <IconCheck size={16} color="#10b981" /> : <IconCopy size={16} />}
                            </button>
                          )}
                        </CopyButton>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Affiliates Table */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <IconUsers size={20} />
                  All Affiliates
                </div>
                <Text size="sm" c="dimmed">{affiliates.length} total</Text>
              </div>

              {affiliates.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <IconUsers size={40} stroke={1} />
                  </div>
                  <h3>No affiliates yet</h3>
                  <p>Create your first affiliate to start building your network</p>
                  <button className="primary-btn" onClick={() => setShowInviteForm(true)} style={{ margin: '0 auto' }}>
                    <IconPlus size={16} />
                    Create First Affiliate
                  </button>
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Affiliate</th>
                        <th>Referral Link</th>
                        <th>Clients</th>
                        <th>Trades</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {affiliates.map((affiliate) => (
                        <tr key={affiliate.id}>
                          <td>
                            <div className="affiliate-cell">
                              <div className="affiliate-avatar">
                                {affiliate.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="affiliate-name">{affiliate.name}</div>
                                <div className="affiliate-email">
                                  <IconMail size={12} />
                                  {affiliate.email}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="code-cell">
                              <span className="code-text">{affiliate.referralCode.slice(0, 12)}...</span>
                              <CopyButton value={`${typeof window !== 'undefined' ? window.location.origin : ''}/trade/${affiliate.referralCode}`}>
                                {({ copied, copy }) => (
                                  <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copy}>
                                    {copied ? <IconCheck size={14} color="#10b981" /> : <IconCopy size={14} />}
                                  </button>
                                )}
                              </CopyButton>
                            </div>
                          </td>
                          <td>
                            <Text size="sm" fw={500}>{getClientCount(affiliate.id)}</Text>
                          </td>
                          <td>
                            <Text size="sm" fw={500}>{getTradeCount(affiliate.id)}</Text>
                          </td>
                          <td>
                            <span className="status-badge active">Active</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="action-btn">
                                <IconChevronRight size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
