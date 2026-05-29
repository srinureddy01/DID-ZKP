// frontend/src/App.jsx
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Hooks
import { useWallet } from './hooks/useWallet';

// Components
import ConnectWallet from './components/ConnectWallet';
import Dashboard from './components/Dashboard';
import RegisterDID from './components/RegisterDID';
import ProveIdentity from './components/ProveIdentity';
import CredentialList from './components/CredentialList';

// Context (optional, for global state)
import { AppProvider, useAppContext } from './context/AppContext';

// Styles
import './styles/App.css';
import './styles/themes.css';

// ==================== Main App Component ====================

const AppContent = () => {
  // Use the wallet hook
  const {
    account,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    isInitialized,
    isLoading,
    balance,
    networkName,
    error: walletError,
    contracts,
    connectWallet,
    disconnectWallet,
    switchNetwork,
    refreshBalance,
    walletInfo
  } = useWallet();

  // App state
  const [activeTab, setActiveTab] = useState('dashboard');
  const [userDID, setUserDID] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved ? JSON.parse(saved) : false;
  });

  // Load user DID when wallet connects
  useEffect(() => {
    const loadUserDID = async () => {
      if (contracts.didRegistry && account) {
        try {
          const did = await contracts.didRegistry.getDIDByOwner(account);
          setUserDID(did && did !== '' ? did : null);
        } catch (err) {
          console.error('Error loading user DID:', err);
          setUserDID(null);
        }
      }
    };
    
    if (isConnected && contracts.didRegistry) {
      loadUserDID();
    }
  }, [isConnected, contracts.didRegistry, account, refreshTrigger]);

  // Apply dark mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Handle DID registration success
  const handleDIDRegistered = (data) => {
    setUserDID(data.did);
    setRefreshTrigger(prev => prev + 1);
    setActiveTab('dashboard');
  };

  // Handle disconnect
  const handleDisconnect = () => {
    setUserDID(null);
    setActiveTab('dashboard');
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(prev => !prev);
  };

  // Render network warning if not on correct network
  if (isConnected && !isCorrectNetwork) {
    return (
      <div className="network-warning">
        <div className="warning-card">
          <div className="warning-icon">⚠️</div>
          <h2>Wrong Network</h2>
          <p>Please switch to the correct network to use this application.</p>
          <div className="network-info">
            <span>Current Network: {networkName || 'Unknown'}</span>
            <span>Required: Hardhat Local (Chain ID: 31337)</span>
          </div>
          <button onClick={switchNetwork} className="btn-switch-network">
            Switch to Hardhat Local
          </button>
          <button onClick={disconnectWallet} className="btn-disconnect">
            Disconnect Wallet
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading || (isConnected && !isInitialized)) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <h3>Loading Application...</h3>
        <p>Initializing contracts and services</p>
      </div>
    );
  }

  return (
    <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-icon">🆔</span>
            {!sidebarCollapsed && <span className="logo-text">DID Protocol</span>}
          </div>
          <button onClick={toggleSidebar} className="sidebar-toggle">
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-icon">📊</span>
            {!sidebarCollapsed && <span className="nav-text">Dashboard</span>}
          </button>

          {!userDID && isConnected && (
            <button
              className={`nav-item ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              <span className="nav-icon">🆔</span>
              {!sidebarCollapsed && <span className="nav-text">Register DID</span>}
            </button>
          )}

          {userDID && (
            <>
              <button
                className={`nav-item ${activeTab === 'verify' ? 'active' : ''}`}
                onClick={() => setActiveTab('verify')}
              >
                <span className="nav-icon">🔐</span>
                {!sidebarCollapsed && <span className="nav-text">Verify Identity</span>}
              </button>

              <button
                className={`nav-item ${activeTab === 'credentials' ? 'active' : ''}`}
                onClick={() => setActiveTab('credentials')}
              >
                <span className="nav-icon">📜</span>
                {!sidebarCollapsed && <span className="nav-text">Credentials</span>}
              </button>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button onClick={toggleDarkMode} className="theme-toggle">
            <span className="nav-icon">{darkMode ? '☀️' : '🌙'}</span>
            {!sidebarCollapsed && <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>}
          </button>
          
          {isConnected && (
            <div className="wallet-status">
              <div className="status-dot connected"></div>
              {!sidebarCollapsed && (
                <div className="wallet-info">
                  <div className="wallet-address">{walletInfo.formattedAddress}</div>
                  <div className="wallet-balance">{balance} ETH</div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        {/* Top Bar */}
        <header className="app-header">
          <div className="header-left">
            <h1>
              {activeTab === 'dashboard' && 'Dashboard'}
              {activeTab === 'register' && 'Register Your DID'}
              {activeTab === 'verify' && 'Identity Verification'}
              {activeTab === 'credentials' && 'My Credentials'}
            </h1>
          </div>

          <div className="header-right">
            {isConnected ? (
              <div className="wallet-connected">
                <div className="wallet-badge">
                  <span className="badge-icon">🟢</span>
                  <span className="badge-text">{walletInfo.formattedAddress}</span>
                  <span className="badge-separator">|</span>
                  <span className="badge-balance">{balance} {walletInfo.networkSymbol || 'ETH'}</span>
                </div>
                <button onClick={disconnectWallet} className="btn-disconnect-small" title="Disconnect">
                  🔌
                </button>
              </div>
            ) : (
              <ConnectWallet 
                onConnect={() => {}} 
                onDisconnect={handleDisconnect}
              />
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="app-content">
          {!isConnected ? (
            <div className="welcome-screen">
              <div className="welcome-card">
                <div className="welcome-icon">🔐</div>
                <h2>Welcome to DID Protocol</h2>
                <p>A decentralized identity management system with zero-knowledge proofs</p>
                <div className="feature-grid">
                  <div className="feature-item">
                    <span className="feature-icon">🆔</span>
                    <span>Self-Sovereign Identity</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">🔒</span>
                    <span>Zero-Knowledge Proofs</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">📜</span>
                    <span>Verifiable Credentials</span>
                  </div>
                  <div className="feature-item">
                    <span className="feature-icon">🌐</span>
                    <span>IPFS Storage</span>
                  </div>
                </div>
                <ConnectWallet 
                  onConnect={() => {}} 
                  onDisconnect={handleDisconnect}
                />
                {walletError && (
                  <div className="error-message">{walletError}</div>
                )}
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <Dashboard
                  signer={contracts.signer}
                  didRegistry={contracts.didRegistry}
                  zkpVerifier={contracts.zkpVerifier}
                  credentialNFT={contracts.credentialNFT}
                  account={account}
                />
              )}

              {activeTab === 'register' && (
                <RegisterDID
                  signer={contracts.signer}
                  didRegistry={contracts.didRegistry}
                  account={account}
                  onDIDRegistered={handleDIDRegistered}
                />
              )}

              {activeTab === 'verify' && userDID && (
                <ProveIdentity
                  signer={contracts.signer}
                  zkpVerifier={contracts.zkpVerifier}
                  didRegistry={contracts.didRegistry}
                  account={account}
                  did={userDID}
                />
              )}

              {activeTab === 'credentials' && userDID && (
                <CredentialList
                  credentialNFT={contracts.credentialNFT}
                  didRegistry={contracts.didRegistry}
                  account={account}
                  did={userDID}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="app-footer">
          <div className="footer-content">
            <p>&copy; 2024 DID Protocol. All rights reserved.</p>
            <div className="footer-links">
              <a href="#" target="_blank" rel="noopener noreferrer">Documentation</a>
              <a href="#" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a href="#" target="_blank" rel="noopener noreferrer">Terms</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

// ==================== App with Provider ====================

const App = () => {
  return (
    <Router>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </Router>
  );
};

export default App;
