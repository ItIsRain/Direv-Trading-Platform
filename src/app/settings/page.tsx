'use client';

import { useState, useEffect } from 'react';
import { Text, Badge, Avatar, Switch } from '@mantine/core';
import {
  IconUsers,
  IconHome,
  IconSettings,
  IconBell,
  IconWallet,
  IconFileAnalytics,
  IconShield,
  IconArrowLeft,
  IconUser,
  IconLock,
  IconCreditCard,
  IconMail,
  IconBellRinging,
  IconPalette,
  IconWorld,
  IconKey,
  IconDevices,
  IconTrash,
  IconCheck,
  IconPencil,
  IconChevronRight
} from '@tabler/icons-react';
import Link from 'next/link';

export default function SettingsPage() {
  const [activeNav, setActiveNav] = useState('settings');
  const [activeSection, setActiveSection] = useState('profile');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);

  const navItems = [
    { icon: IconHome, label: 'Overview', id: 'dashboard', href: '/' },
    { icon: IconUsers, label: 'Affiliates', id: 'affiliates', href: '/affiliates' },
    { icon: IconWallet, label: 'Earnings', id: 'commissions', href: '/earnings' },
    { icon: IconFileAnalytics, label: 'Analytics', id: 'reports', href: '/analytics' },
    { icon: IconSettings, label: 'Settings', id: 'settings', href: '/settings' },
  ];

  const settingsSections = [
    { icon: IconUser, label: 'Profile', id: 'profile' },
    { icon: IconLock, label: 'Security', id: 'security' },
    { icon: IconBellRinging, label: 'Notifications', id: 'notifications' },
    { icon: IconCreditCard, label: 'Billing', id: 'billing' },
    { icon: IconKey, label: 'API Keys', id: 'api' },
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
          --danger: #ef4444;
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

        .content-area {
          padding: 32px;
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 32px;
        }

        .settings-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .settings-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s ease;
          color: var(--text-secondary);
          border: none;
          background: transparent;
          font-size: 14px;
          font-weight: 500;
        }

        .settings-nav-item:hover {
          background: var(--bg-tertiary);
          color: var(--text-primary);
        }

        .settings-nav-item.active {
          background: var(--bg-secondary);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
        }

        .settings-content {
          display: flex;
          flex-direction: column;
          gap: 24px;
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
        }

        .card-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }

        .card-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }

        .card-body { padding: 24px; }

        .profile-header {
          display: flex;
          align-items: center;
          gap: 20px;
          margin-bottom: 32px;
        }

        .profile-avatar {
          width: 80px;
          height: 80px;
          border-radius: 16px;
          background: linear-gradient(135deg, var(--accent) 0%, #ff6b73 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          font-weight: 600;
          color: white;
          position: relative;
        }

        .avatar-edit {
          position: absolute;
          bottom: -4px;
          right: -4px;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          background: var(--bg-secondary);
          border: 2px solid var(--bg-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--text-secondary);
          transition: all 0.2s ease;
        }

        .avatar-edit:hover {
          background: var(--accent);
          color: white;
        }

        .profile-info h3 {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }

        .profile-info p {
          font-size: 14px;
          color: var(--text-muted);
          margin: 0;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group.full {
          grid-column: span 2;
        }

        .form-label {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .form-input {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 12px 14px;
          color: var(--text-primary);
          font-size: 14px;
          transition: all 0.2s ease;
        }

        .form-input:focus {
          outline: none;
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        .form-input::placeholder {
          color: var(--text-muted);
        }

        .primary-btn {
          background: var(--accent);
          color: white;
          border: none;
          padding: 12px 24px;
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

        .secondary-btn {
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--border-subtle);
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .secondary-btn:hover {
          background: var(--bg-elevated);
          border-color: var(--border-medium);
        }

        .danger-btn {
          background: rgba(239, 68, 68, 0.1);
          color: var(--danger);
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s ease;
        }

        .danger-btn:hover {
          background: rgba(239, 68, 68, 0.15);
          border-color: rgba(239, 68, 68, 0.3);
        }

        .btn-group {
          display: flex;
          gap: 12px;
          margin-top: 24px;
        }

        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .setting-item:last-child {
          border-bottom: none;
        }

        .setting-info h4 {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }

        .setting-info p {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }

        .security-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 20px;
          background: var(--bg-tertiary);
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          margin-bottom: 12px;
        }

        .security-icon {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          background: var(--accent-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }

        .security-info {
          flex: 1;
        }

        .security-info h4 {
          font-size: 14px;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0 0 4px 0;
        }

        .security-info p {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }

        .status-enabled {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          background: rgba(16, 185, 129, 0.1);
          color: var(--success);
        }

        .status-disabled {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          background: var(--bg-elevated);
          color: var(--text-muted);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .animate-in { animation: fadeIn 0.4s ease forwards; }
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
                <h1>Settings</h1>
                <p>Manage your account preferences</p>
              </div>
            </div>
          </header>

          <div className="content-area">
            {/* Settings Navigation */}
            <div className="settings-nav">
              {settingsSections.map((section) => (
                <button
                  key={section.id}
                  className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <section.icon size={18} stroke={1.5} />
                  <span>{section.label}</span>
                </button>
              ))}
            </div>

            {/* Settings Content */}
            <div className="settings-content">
              {activeSection === 'profile' && (
                <div className="card animate-in">
                  <div className="card-header">
                    <h3 className="card-title">Profile Information</h3>
                    <p className="card-subtitle">Update your personal details</p>
                  </div>
                  <div className="card-body">
                    <div className="profile-header">
                      <div className="profile-avatar">
                        MA
                        <div className="avatar-edit">
                          <IconPencil size={14} />
                        </div>
                      </div>
                      <div className="profile-info">
                        <h3>Mohamed Al-Rashid</h3>
                        <p>Premium Partner since Jan 2023</p>
                      </div>
                    </div>

                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">First Name</label>
                        <input type="text" className="form-input" defaultValue="Mohamed" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Last Name</label>
                        <input type="text" className="form-input" defaultValue="Al-Rashid" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input type="email" className="form-input" defaultValue="mohamed@lynq.ae" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Phone Number</label>
                        <input type="tel" className="form-input" defaultValue="+971 50 123 4567" />
                      </div>
                      <div className="form-group full">
                        <label className="form-label">Company</label>
                        <input type="text" className="form-input" defaultValue="Lynq Trading LLC" />
                      </div>
                    </div>

                    <div className="btn-group">
                      <button className="primary-btn">
                        <IconCheck size={16} />
                        Save Changes
                      </button>
                      <button className="secondary-btn">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'security' && (
                <>
                  <div className="card animate-in">
                    <div className="card-header">
                      <h3 className="card-title">Security Settings</h3>
                      <p className="card-subtitle">Keep your account secure</p>
                    </div>
                    <div className="card-body">
                      <div className="security-item">
                        <div className="security-icon">
                          <IconLock size={22} />
                        </div>
                        <div className="security-info">
                          <h4>Password</h4>
                          <p>Last changed 30 days ago</p>
                        </div>
                        <button className="secondary-btn">Change</button>
                      </div>

                      <div className="security-item">
                        <div className="security-icon">
                          <IconShield size={22} />
                        </div>
                        <div className="security-info">
                          <h4>Two-Factor Authentication</h4>
                          <p>Add an extra layer of security</p>
                        </div>
                        <Switch
                          checked={twoFactor}
                          onChange={(e) => setTwoFactor(e.currentTarget.checked)}
                          color="red"
                          size="md"
                        />
                      </div>

                      <div className="security-item">
                        <div className="security-icon">
                          <IconDevices size={22} />
                        </div>
                        <div className="security-info">
                          <h4>Active Sessions</h4>
                          <p>3 devices currently logged in</p>
                        </div>
                        <button className="secondary-btn">Manage</button>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <h3 className="card-title">Danger Zone</h3>
                      <p className="card-subtitle">Irreversible actions</p>
                    </div>
                    <div className="card-body">
                      <button className="danger-btn">
                        <IconTrash size={16} />
                        Delete Account
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeSection === 'notifications' && (
                <div className="card animate-in">
                  <div className="card-header">
                    <h3 className="card-title">Notification Preferences</h3>
                    <p className="card-subtitle">Choose what updates you receive</p>
                  </div>
                  <div className="card-body">
                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Email Notifications</h4>
                        <p>Receive updates about your affiliates and earnings</p>
                      </div>
                      <Switch
                        checked={emailNotifications}
                        onChange={(e) => setEmailNotifications(e.currentTarget.checked)}
                        color="red"
                        size="md"
                      />
                    </div>

                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Push Notifications</h4>
                        <p>Get instant alerts on your browser</p>
                      </div>
                      <Switch
                        checked={pushNotifications}
                        onChange={(e) => setPushNotifications(e.currentTarget.checked)}
                        color="red"
                        size="md"
                      />
                    </div>

                    <div className="setting-item">
                      <div className="setting-info">
                        <h4>Marketing Emails</h4>
                        <p>Receive tips and product updates</p>
                      </div>
                      <Switch
                        checked={marketingEmails}
                        onChange={(e) => setMarketingEmails(e.currentTarget.checked)}
                        color="red"
                        size="md"
                      />
                    </div>

                    <div className="btn-group">
                      <button className="primary-btn">
                        <IconCheck size={16} />
                        Save Preferences
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'billing' && (
                <div className="card animate-in">
                  <div className="card-header">
                    <h3 className="card-title">Billing & Payments</h3>
                    <p className="card-subtitle">Manage your payment methods</p>
                  </div>
                  <div className="card-body">
                    <div className="security-item">
                      <div className="security-icon">
                        <IconCreditCard size={22} />
                      </div>
                      <div className="security-info">
                        <h4>Bank Account</h4>
                        <p>ADCB •••• 4521</p>
                      </div>
                      <span className="status-enabled">
                        <IconCheck size={14} />
                        Primary
                      </span>
                    </div>

                    <div className="security-item">
                      <div className="security-icon">
                        <IconWallet size={22} />
                      </div>
                      <div className="security-info">
                        <h4>PayPal</h4>
                        <p>mohamed@lynq.ae</p>
                      </div>
                      <span className="status-disabled">Secondary</span>
                    </div>

                    <div className="btn-group">
                      <button className="secondary-btn">Add Payment Method</button>
                    </div>
                  </div>
                </div>
              )}

              {activeSection === 'api' && (
                <div className="card animate-in">
                  <div className="card-header">
                    <h3 className="card-title">API Keys</h3>
                    <p className="card-subtitle">Manage your API access</p>
                  </div>
                  <div className="card-body">
                    <div className="security-item">
                      <div className="security-icon">
                        <IconKey size={22} />
                      </div>
                      <div className="security-info">
                        <h4>Production Key</h4>
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>sk_live_••••••••••••4f2a</p>
                      </div>
                      <span className="status-enabled">
                        <IconCheck size={14} />
                        Active
                      </span>
                    </div>

                    <div className="security-item">
                      <div className="security-icon">
                        <IconKey size={22} />
                      </div>
                      <div className="security-info">
                        <h4>Test Key</h4>
                        <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>sk_test_••••••••••••8b1c</p>
                      </div>
                      <span className="status-enabled">
                        <IconCheck size={14} />
                        Active
                      </span>
                    </div>

                    <div className="btn-group">
                      <button className="primary-btn">Generate New Key</button>
                      <button className="secondary-btn">View Documentation</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
