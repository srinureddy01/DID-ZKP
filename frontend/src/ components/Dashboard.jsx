// THEIS IS THE MAIN SOURSE CODE HERE WE CAN FIND THE ALL THE DASHBOARD CODE AND ITS DONNECTIONS >> Dashboard.jsx
// frontend/src/components/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import PropTypes from 'prop-types';

// Import other components
import RegisterDID from './RegisterDID';
import ProveIdentity from './ProveIdentity';

// Utilities
import { getFromIPFS } from '../utils/ipfs';

const Dashboard = ({ 
  signer, 
  didRegistry, 
  zkpVerifier, 
  credentialNFT, 
  account,
  onRefresh
}) => {
  // ==================== State Variables ====================
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // DID states
  const [userDID, setUserDID] = useState(null);
  const [didDocument, setDidDocument] = useState(null);
  const [didMetadata, setDidMetadata] = useState(null);
  const [hasDID, setHasDID] = useState(false);
  
  // Credential states
  const [credentials, setCredentials] = useState([]);
  const [credentialCount, setCredentialCount] = useState(0);
  const [activeCredentials, setActiveCredentials] = useState(0);
  const [expiredCredentials, setExpiredCredentials] = useState(0);
  
  // Verification states
  const [verificationCount, setVerificationCount] = useState(0);
  const [recentVerifications, setRecentVerifications] = useState([]);
  const [zkpStats, setZkpStats] = useState({
    totalProofs: 0,
    ageProofs: 0,
    identityProofs: 0,
    successRate: 0
  });
  
  // Protocol stats
  const [protocolStats, setProtocolStats] = useState({
    totalDIDs: 0,
    totalCredentials: 0,
    totalVerifications: 0,
    activeUsers: 0
  });
  
  // UI states
  const [activeSection, setActiveSection] = useState('overview');
  const [selectedCredential, setSelectedCredential] = useState(null);
  const [showCredentialDetails, setShowCredentialDetails] = useState(false);
  
  // ==================== Helper Functions ====================

  /**
   * Format address for display
   */
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /**
   * Format timestamp to readable date
   */
  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  /**
   * Format file size
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ==================== Data Fetching Functions ====================

  /**
   * Load user's DID information
   */
  const loadUserDID = async () => {
    if (!didRegistry || !account) return null;
    
    try {
      const did = await didRegistry.getDIDByOwner(account);
      if (did && did !== '') {
        setUserDID(did);
        setHasDID(true);
        
        // Get DID document hash and metadata
        const docHash = await didRegistry.getDIDDocumentHash(did);
        const metadata = await didRegistry.resolveDID(did);
        setDidMetadata(metadata);
        
        // Fetch DID document from IPFS if available
        if (docHash && docHash !== '') {
          try {
            const document = await getFromIPFS(docHash);
            setDidDocument(document);
          } catch (ipfsErr) {
            console.warn('Could not fetch DID document from IPFS:', ipfsErr);
          }
        }
        
        return did;
      }
    } catch (err) {
      if (!err.message?.includes('Owner has no DID')) {
        console.error('Error loading DID:', err);
      }
      setHasDID(false);
    }
    return null;
  };

  /**
   * Load user's credentials
   */
  const loadCredentials = async () => {
    if (!credentialNFT || !account) return;
    
    try {
      // Get all credentials owned by this address
      const balance = await credentialNFT.balanceOf(account);
      setCredentialCount(Number(balance));
      
      const creds = [];
      let active = 0;
      let expired = 0;
      
      for (let i = 0; i < balance; i++) {
        try {
          const tokenId = await credentialNFT.tokenOfOwnerByIndex(account, i);
          const credential = await credentialNFT.getCredential(tokenId);
          const isValid = await credentialNFT.isCredentialValid(tokenId);
          const metadata = await credentialNFT.tokenURI(tokenId);
          
          const credData = {
            tokenId: Number(tokenId),
            type: credential.credentialType,
            issuerDID: credential.issuerDID,
            issuedAt: formatDate(credential.issuedAt),
            expiresAt: credential.expiresAt > 0 ? formatDate(credential.expiresAt) : 'Never',
            isRevoked: credential.isRevoked,
            isExpired: credential.expiresAt > 0 && credential.expiresAt < Math.floor(Date.now() / 1000),
            isValid: isValid,
            zkpCompatible: credential.zkpCompatible,
            metadataURI: metadata
          };
          
          creds.push(credData);
          
          if (credData.isValid && !credData.isRevoked && !credData.isExpired) {
            active++;
          } else {
            expired++;
          }
        } catch (err) {
          console.error(`Error loading credential ${i}:`, err);
        }
      }
      
      setCredentials(creds);
      setActiveCredentials(active);
      setExpiredCredentials(expired);
      
    } catch (err) {
      console.error('Error loading credentials:', err);
    }
  };

  /**
   * Load verification history
   */
  const loadVerificationHistory = async () => {
    if (!zkpVerifier) return;
    
    try {
      // Get total verifications
      const total = await zkpVerifier.totalVerifications();
      setVerificationCount(Number(total));
      
      // Get recent verification requests (from events, simplified)
      // In production, you'd query events or have a separate API
      const mockVerifications = [
        {
          id: 1,
          type: 'Age Verification',
          timestamp: new Date().toISOString(),
          status: 'success',
          txHash: '0x1234...5678'
        },
        {
          id: 2,
          type: 'Identity Verification',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          status: 'success',
          txHash: '0x8765...4321'
        }
      ];
      
      setRecentVerifications(mockVerifications);
      
      // Get ZKP stats
      // In production, query contract events for real stats
      setZkpStats({
        totalProofs: 42,
        ageProofs: 28,
        identityProofs: 14,
        successRate: 98
      });
      
    } catch (err) {
      console.error('Error loading verification history:', err);
    }
  };

  /**
   * Load protocol statistics
   */
  const loadProtocolStats = async () => {
    if (!didRegistry || !credentialNFT || !zkpVerifier) return;
    
    try {
      const totalDIDs = await didRegistry.getTotalDIDCount();
      const totalCredentials = await credentialNFT.totalCredentials();
      const totalVerifications = await zkpVerifier.totalVerifications();
      
      // Get active DIDs (simplified - would need to check each DID)
      const activeUsers = Number(totalDIDs);
      
      setProtocolStats({
        totalDIDs: Number(totalDIDs),
        totalCredentials: Number(totalCredentials),
        totalVerifications: Number(totalVerifications),
        activeUsers: activeUsers
      });
      
    } catch (err) {
      console.error('Error loading protocol stats:', err);
    }
  };

  /**
   * Refresh all dashboard data
   */
  const refreshAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      await Promise.all([
        loadUserDID(),
        loadCredentials(),
        loadVerificationHistory(),
        loadProtocolStats()
      ]);
      
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error refreshing dashboard:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==================== Action Functions ====================

  /**
   * Handle DID registration success
   */
  const handleDIDRegistered = async (data) => {
    await refreshAllData();
    setActiveSection('overview');
  };

  /**
   * View credential details
   */
  const viewCredentialDetails = (credential) => {
    setSelectedCredential(credential);
    setShowCredentialDetails(true);
  };

  /**
   * Export DID document as JSON
   */
  const exportDIDDocument = () => {
    if (!didDocument) return;
    
    const dataStr = JSON.stringify(didDocument, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `did-document-${userDID}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  // ==================== Effects ====================

  useEffect(() => {
    if (account && didRegistry && credentialNFT && zkpVerifier) {
      refreshAllData();
    }
  }, [account, didRegistry, credentialNFT, zkpVerifier, refreshTrigger]);

  // ==================== Render Components ====================

  /**
   * Render overview section
   */
  /**
   * Render overview section
   */
  const renderOverview = () => (
    <div className="overview-section">
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🆔</div>  
          <div className="stat-content">
            <div className="stat-value">{protocolStats.totalDIDs}</div>
            <div className="stat-label">Total DIDs</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">📜</div>
          <div className="stat-content">
            <div className="stat-value">{protocolStats.totalCredentials}</div>
            <div className="stat-label">Total Credentials</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-content">
            <div className="stat-value">{protocolStats.totalVerifications}</div>
            <div className="stat-label">Verifications</div>
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-value">{protocolStats.activeUsers}</div>
            <div className="stat-label">Active Users</div>
          </div>
        </div>
      </div>
      
      {/* User DID Card */}
      <div className="user-did-card">
        <h3>Your Decentralized Identity</h3>
        {hasDID && userDID ? (
          <div className="did-info">
            <div className="did-row">
              <span className="did-label">DID:</span>
              <code className="did-value">{userDID}</code>
              <button 
                onClick={() => navigator.clipboard.writeText(userDID)}
                className="copy-btn"
              >
                📋
              </button>
            </div>
            
            {didMetadata && (
              <>
                <div className="did-row">
                  <span className="did-label">Status:</span>
                  <span className={`status-badge ${didMetadata.isActive ? 'active' : 'revoked'}`}>
                    {didMetadata.isActive ? 'Active' : 'Revoked'}
                  </span>
                </div>
                <div className="did-row">
                  <span className="did-label">Created:</span>
                  <span className="did-value">{formatDate(didMetadata.created)}</span>
                </div>
                <div className="did-row">
                  <span className="did-label">Last Updated:</span>
                  <span className="did-value">{formatDate(didMetadata.updated)}</span>
                </div>
                {didDocument?.profile?.name && (
                  <div className="did-row">
                    <span className="did-label">Display Name:</span>
                    <span className="did-value">{didDocument.profile.name}</span>
                  </div>
                )}
              </>
            )}
            
            <div className="did-actions">
              <button onClick={exportDIDDocument} className="btn-secondary">
                📄 Export DID Document
              </button>
            </div>
          </div>
        ) : (
          <div className="no-did">
            <p>You don't have a DID yet.</p>
            <button 
              onClick={() => setActiveSection('register')}
              className="btn-primary"
            >
              Register Your DID
            </button>
          </div>
        )}
      </div>
      
      {/* Credentials Summary */}
      <div className="credentials-summary">
        <div className="section-header">
          <h3>Your Credentials</h3>
          <span className="badge">{credentialCount} total</span>
        </div>
        
        <div className="credential-stats">
          <div className="stat-item">
            <span className="stat-label">Active:</span>
            <span className="stat-value active">{activeCredentials}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Expired/Revoked:</span>
            <span className="stat-value expired">{expiredCredentials}</span>
          </div>
        </div>
        
        {credentials.length > 0 ? (
          <div className="credential-list">
            {credentials.slice(0, 3).map(cred => (
              <div key={cred.tokenId} className="credential-item">
                <div className="credential-icon">
                  {cred.isValid ? '✅' : '❌'}
                </div>
                <div className="credential-info">
                  <div className="credential-type">{cred.type}</div>
                  <div className="credential-meta">
                    Issued: {cred.issuedAt} | Expires: {cred.expiresAt}
                  </div>
                </div>
                <button 
                  onClick={() => viewCredentialDetails(cred)}
                  className="btn-link"
                >
                  View →
                </button>
              </div>
            ))}
            {credentials.length > 3 && (
              <button className="btn-view-all">View all {credentials.length} credentials</button>
            )}
          </div>
        ) : (
          <p className="no-data">No credentials yet. Request credentials from issuers.</p>
        )}
      </div>
      
      {/* ZKP Statistics */}
      <div className="zkp-stats">
        <h3>Zero-Knowledge Proof Statistics</h3>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-number">{zkpStats.totalProofs}</div>
            <div className="stat-label">Total Proofs</div>
          </div>
          <div className="stat-box">
            <div className="stat-number">{zkpStats.ageProofs}</div>
            <div className="stat-label">Age Proofs</div>
          </div>
          <div className="stat-box">
            <div className="stat-number">{zkpStats.identityProofs}</div>
            <div className="stat-label">Identity Proofs</div>
          </div>
          <div className="stat-box">
            <div className="stat-number">{zkpStats.successRate}%</div>
            <div className="stat-label">Success Rate</div>
          </div>
        </div>
      </div>
    </div>
  );

  /**
   * Render credentials section
   */
  const renderCredentials = () => (
    <div className="credentials-section">
      <div className="section-header">
        <h2>Your Credentials</h2>
        <button 
          onClick={loadCredentials}
          className="btn-icon"
          title="Refresh"
        >
          🔄
        </button>
      </div>
      
      {credentials.length > 0 ? (
        <div className="credentials-grid">
          {credentials.map(cred => (
            <div key={cred.tokenId} className={`credential-card ${!cred.isValid ? 'invalid' : ''}`}>
              <div className="credential-header">
                <div className="credential-type-badge">{cred.type}</div>
                {cred.zkpCompatible && (
                  <span className="zkp-badge" title="ZKP Compatible">🔒 ZKP</span>
                )}
              </div>
              
              <div className="credential-body">
                <div className="credential-detail">
                  <span className="detail-label">Token ID:</span>
                  <span className="detail-value">#{cred.tokenId}</span>
                </div>
                <div className="credential-detail">
                  <span className="detail-label">Issuer:</span>
                  <span className="detail-value">{formatAddress(cred.issuerDID)}</span>
                </div>
                <div className="credential-detail">
                  <span className="detail-label">Issued:</span>
                  <span className="detail-value">{cred.issuedAt}</span>
                </div>
                <div className="credential-detail">
                  <span className="detail-label">Expires:</span>
                  <span className={`detail-value ${cred.isExpired ? 'expired' : ''}`}>
                    {cred.expiresAt}
                  </span>
                </div>
                <div className="credential-status">
                  {cred.isRevoked ? (
                    <span className="status-revoked">Revoked</span>
                  ) : cred.isExpired ? (
                    <span className="status-expired">Expired</span>
                  ) : (
                    <span className="status-active">Active</span>
                  )}
                </div>
              </div>
              
              <div className="credential-footer">
                <button className="btn-verify-credential">
                  Verify with ZKP
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">📜</div>
          <h3>No Credentials Yet</h3>
          <p>You don't have any credentials issued to your DID.</p>
          <p>Request credentials from trusted issuers to get started.</p>
        </div>
      )}
    </div>
  );

  /**
   * Render verification section
   */
  const renderVerification = () => (
    <div className="verification-section">
      <ProveIdentity
        signer={signer}
        zkpVerifier={zkpVerifier}
        didRegistry={didRegistry}
        account={account}
        did={userDID}
      />
    </div>
  );

  /**
   * Render register section
   */
  const renderRegister = () => (
    <div className="register-section">
      <RegisterDID
        signer={signer}
        didRegistry={didRegistry}
        account={account}
        onDIDRegistered={handleDIDRegistered}
      />
    </div>
  );

  // ==================== Main Render ====================

  if (loading && !hasDID && credentialCount === 0) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {/* Sidebar Navigation */}
      <div className="dashboard-sidebar">
        <div className="sidebar-header">
          <h2>DID Protocol</h2>
          <div className="user-address">{formatAddress(account)}</div>
        </div>
        
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeSection === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveSection('overview')}
          >
            <span className="nav-icon">📊</span>
            <span>Overview</span>
          </button>
          
          <button
            className={`nav-item ${activeSection === 'credentials' ? 'active' : ''}`}
            onClick={() => setActiveSection('credentials')}
          >
            <span className="nav-icon">📜</span>
            <span>Credentials</span>
            {credentialCount > 0 && (
              <span className="nav-badge">{credentialCount}</span>
            )}
          </button>
          
          <button
            className={`nav-item ${activeSection === 'verify' ? 'active' : ''}`}
            onClick={() => setActiveSection('verify')}
          >
            <span className="nav-icon">🔐</span>
            <span>Verify Identity</span>
          </button>
          
          {!hasDID && (
            <button
              className={`nav-item ${activeSection === 'register' ? 'active' : ''}`}
              onClick={() => setActiveSection('register')}
            >
              <span className="nav-icon">🆔</span>
              <span>Register DID</span>
            </button>
          )}
        </nav>
        
        <div className="sidebar-footer">
          <div className="connection-status">
            <div className="status-dot connected"></div>
            <span>Connected</span>
          </div>
          <div className="network-info">
            <span className="network-name">Hardhat Local</span>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="dashboard-main">
        <div className="main-header">
          <h1>
            {activeSection === 'overview' && 'Dashboard Overview'}
            {activeSection === 'credentials' && 'My Credentials'}
            {activeSection === 'verify' && 'Identity Verification'}
            {activeSection === 'register' && 'Register Your DID'}
          </h1>
          <button onClick={refreshAllData} className="refresh-btn" title="Refresh">
            🔄
          </button>
        </div>
        
        {error && (
          <div className="error-banner">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        
        <div className="main-content">
          {activeSection === 'overview' && renderOverview()}
          {activeSection === 'credentials' && renderCredentials()}
          {activeSection === 'verify' && renderVerification()}
          {activeSection === 'register' && renderRegister()}
        </div>
      </div>
      
      {/* Credential Details Modal */}
      {showCredentialDetails && selectedCredential && (
        <div className="modal-overlay" onClick={() => setShowCredentialDetails(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Credential Details</h3>
              <button onClick={() => setShowCredentialDetails(false)}>×</button>
            </div>
            <div className="modal-body">
              <pre>{JSON.stringify(selectedCredential, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
      
      <style jsx>{`
        .dashboard-container {
          display: flex;
          min-height: 100vh;
          background: #f5f7fa;
        }
        
        /* Sidebar Styles */
        .dashboard-sidebar {
          width: 280px;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          color: white;
          display: flex;
          flex-direction: column;
          position: fixed;
          height: 100vh;
          overflow-y: auto;
        }
        
        .sidebar-header {
          padding: 2rem 1.5rem;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .sidebar-header h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
        }
        
        .user-address {
          font-family: monospace;
          font-size: 0.875rem;
          color: #a0a0b0;
        }
        
        .sidebar-nav {
          flex: 1;
          padding: 1.5rem 0;
        }
        
        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1.5rem;
          background: none;
          border: none;
          color: #a0a0b0;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 1rem;
        }
        
        .nav-item:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }
        
        .nav-item.active {
          background: rgba(102,126,234,0.2);
          color: white;
          border-right: 3px solid #667eea;
        }
        
        .nav-icon {
          font-size: 1.25rem;
        }
        
        .nav-badge {
          margin-left: auto;
          background: #667eea;
          color: white;
          padding: 0.125rem 0.5rem;
          border-radius: 1rem;
          font-size: 0.75rem;
        }
        
        .sidebar-footer {
          padding: 1.5rem;
          border-top: 1px solid rgba(255,255,255,0.1);
          font-size: 0.875rem;
        }
        
        .connection-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .status-dot.connected {
          background: #4caf50;
          box-shadow: 0 0 5px #4caf50;
        }
        
        /* Main Content Styles */
        .dashboard-main {
          flex: 1;
          margin-left: 280px;
          padding: 2rem;
        }
        
        .main-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }
        
        .main-header h1 {
          margin: 0;
          font-size: 1.75rem;
          color: #1a1a2e;
        }
        
        .refresh-btn {
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 0.5rem;
          transition: background 0.2s;
        }
        
        .refresh-btn:hover {
          background: #e0e0e0;
        }
        
        /* Stats Grid */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        
        .stat-card {
          background: white;
          padding: 1.5rem;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .stat-icon {
          font-size: 2rem;
        }
        
        .stat-value {
          font-size: 1.75rem;
          font-weight: bold;
          color: #667eea;
        }
        
        .stat-label {
          color: #666;
          font-size: 0.875rem;
        }
        
        /* User DID Card */
        .user-did-card {
          background: white;
          padding: 1.5rem;
          border-radius: 1rem;
          margin-bottom: 2rem;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .user-did-card h3 {
          margin: 0 0 1rem 0;
        }
        
        .did-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .did-label {
          min-width: 100px;
          color: #666;
        }
        
        .did-value {
          font-family: monospace;
          color: #333;
        }
        
        .copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
        }
        
        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
        }
        
        .status-badge.active {
          background: #e8f5e9;
          color: #4caf50;
        }
        
        .status-badge.revoked {
          background: #ffebee;
          color: #f44336;
        }
        
        .did-actions {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #f0f0f0;
        }
        
        /* Credentials Summary */
        .credentials-summary {
          background: white;
          padding: 1.5rem;
          border-radius: 1rem;
          margin-bottom: 2rem;
        }
        
        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .credential-stats {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .credential-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .credential-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 0.5rem;
        }
        
        .credential-type {
          font-weight: 600;
        }
        
        .credential-meta {
          font-size: 0.75rem;
          color: #666;
        }
        
        /* ZKP Stats */
        .zkp-stats {
          background: white;
          padding: 1.5rem;
          border-radius: 1rem;
        }
        
        .stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
          margin-top: 1rem;
        }
        
        .stat-box {
          text-align: center;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 0.5rem;
        }
        
        .stat-number {
          font-size: 1.5rem;
          font-weight: bold;
          color: #667eea;
        }
        
        /* Credentials Grid */
        .credentials-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
        }
        
        .credential-card {
          background: white;
          border-radius: 1rem;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .credential-card.invalid {
          opacity: 0.7;
        }
        
        .credential-header {
          padding: 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .credential-type-badge {
          font-weight: 600;
        }
        
        .zkp-badge {
          background: rgba(255,255,255,0.2);
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
        }
        
        .credential-body {
          padding: 1rem;
        }
        
        .credential-detail {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .credential-footer {
          padding: 1rem;
          border-top: 1px solid #f0f0f0;
        }
        
        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 3rem;
          background: white;
          border-radius: 1rem;
        }
        
        .empty-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }
        
        /* Buttons */
        .btn-primary {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
        }
        
        .btn-secondary {
          padding: 0.5rem 1rem;
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
        }
        
        .btn-link {
          background: none;
          border: none;
          color: #667eea;
          cursor: pointer;
        }
        
        /* Loading */
        .dashboard-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
        }
        
        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f0f0f0;
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        /* Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .modal-content {
          background: white;
          border-radius: 1rem;
          max-width: 600px;
          width: 90%;
          max-height: 80vh;
          overflow: auto;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid #f0f0f0;
        }
        
        .modal-body {
          padding: 1rem;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .dashboard-sidebar {
            transform: translateX(-100%);
            position: fixed;
            z-index: 100;
            transition: transform 0.3s;
          }
          
          .dashboard-main {
            margin-left: 0;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
          }
          
          .stats-row {
            grid-template
