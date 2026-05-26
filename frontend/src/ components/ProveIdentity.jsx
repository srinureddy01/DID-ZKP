 
// frontend/src/components/ProveIdentity.jsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import PropTypes from 'prop-types';

// ZKP utilities
import { 
  generateAgeProof, 
  generateIdentityProof,
  verifyProof,
  generateNullifier,
  loadCircuits,
  proveAge,
  proveIdentity
} from '../utils/zkp';

// IPFS utilities
import { getFromIPFS } from '../utils/ipfs';

const ProveIdentity = ({ signer, zkpVerifier, didRegistry, account, did }) => {
  // ==================== State Variables ====================
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('age'); // 'age' or 'identity'
  
  // Age proof states
  const [birthDate, setBirthDate] = useState('');
  const [minAge, setMinAge] = useState(18);
  const [ageProofResult, setAgeProofResult] = useState(null);
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageProofGenerated, setAgeProofGenerated] = useState(false);
  const [ageProof, setAgeProof] = useState(null);
  
  // Identity proof states
  const [identityAttributes, setIdentityAttributes] = useState({
    fullName: '',
    nationality: '',
    documentNumber: '',
    dateOfBirth: ''
  });
  const [requiredAttributes, setRequiredAttributes] = useState({
    fullName: false,
    nationality: false,
    documentNumber: false,
    minAge: 18
  });
  const [identityProofResult, setIdentityProofResult] = useState(null);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [identityProofGenerated, setIdentityProofGenerated] = useState(false);
  const [identityProof, setIdentityProof] = useState(null);
  
  // Common states
  const [nullifier, setNullifier] = useState(null);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [circuitsLoaded, setCircuitsLoaded] = useState(false);
  const [userDID, setUserDID] = useState(null);
  
  // ==================== Helper Functions ====================

  /**
   * Load user's DID
   */
  const loadUserDID = async () => {
    if (!didRegistry || !account) return;
    
    try {
      const userDid = await didRegistry.getDIDByOwner(account);
      if (userDid && userDid !== '') {
        setUserDID(userDid);
      }
    } catch (err) {
      console.error('Error loading DID:', err);
    }
  };

  /**
   * Load ZKP circuits
   */
  const loadZKPCircuits = async () => {
    try {
      setLoading(true);
      await loadCircuits();
      setCircuitsLoaded(true);
    } catch (err) {
      console.error('Error loading circuits:', err);
      setError('Failed to load ZKP circuits. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Calculate age from birth date
   */
  const calculateAge = (birthDateString) => {
    const birth = new Date(birthDateString);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  /**
   * Convert birth date to timestamp
   */
  const dateToTimestamp = (dateString) => {
    return Math.floor(new Date(dateString).getTime() / 1000);
  };

  /**
   * Get current timestamp
   */
  const getCurrentTimestamp = () => {
    return Math.floor(Date.now() / 1000);
  };

  /**
   * Format timestamp to date
   */
  const timestampToDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // ==================== Age Proof Functions ====================

  /**
   * Generate age proof
   */
  const handleGenerateAgeProof = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAgeProofGenerated(false);
    setAgeVerified(false);
    
    try {
      if (!birthDate) {
        throw new Error('Please enter your birth date');
      }
      
      if (!userDID) {
        throw new Error('No DID found. Please register a DID first.');
      }
      
      // Calculate age
      const userAge = calculateAge(birthDate);
      if (userAge < minAge) {
        throw new Error(`You are ${userAge} years old. Minimum age required is ${minAge}.`);
      }
      
      // Generate nullifier to prevent replay attacks
      const newNullifier = generateNullifier(account, 'age', Date.now());
      setNullifier(newNullifier);
      
      // Convert birth date to timestamp
      const birthTimestamp = dateToTimestamp(birthDate);
      const currentTimestamp = getCurrentTimestamp();
      
      // Generate ZK proof
      const proof = await proveAge({
        birthTimestamp,
        currentTimestamp,
        minAge,
        nullifier: newNullifier
      });
      
      setAgeProof(proof);
      setAgeProofGenerated(true);
      
      setSuccess({
        message: 'Age proof generated successfully!',
        details: `Proving you are at least ${minAge} years old without revealing your birth date.`
      });
      
    } catch (err) {
      console.error('Age proof generation error:', err);
      setError(err.message || 'Failed to generate age proof');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verify age proof on-chain
   */
  const handleVerifyAgeProof = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!ageProof) {
        throw new Error('No proof generated. Please generate a proof first.');
      }
      
      if (!zkpVerifier) {
        throw new Error('ZKP Verifier contract not available');
      }
      
      if (!userDID) {
        throw new Error('No DID found. Please register a DID first.');
      }
      
      // Verify proof on blockchain
      const tx = await zkpVerifier.verifyAgeProof(
        userDID,
        minAge,
        nullifier,
        ageProof.a,
        ageProof.b,
        ageProof.c,
        ageProof.publicSignals
      );
      
      await tx.wait();
      
      setAgeVerified(true);
      setAgeProofResult({
        verified: true,
        txHash: tx.hash,
        timestamp: new Date().toISOString(),
        minAge: minAge,
        nullifier: nullifier
      });
      
      setSuccess({
        message: '✅ Age verification successful!',
        details: `You have proven that you are at least ${minAge} years old.`
      });
      
      // Add to verification requests
      addVerificationRequest('age', true, tx.hash);
      
    } catch (err) {
      console.error('Age verification error:', err);
      setError(err.message || 'Failed to verify age proof');
      addVerificationRequest('age', false, null, err.message);
    } finally {
      setLoading(false);
    }
  };

  // ==================== Identity Proof Functions ====================

  /**
   * Generate identity proof
   */
  const handleGenerateIdentityProof = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIdentityProofGenerated(false);
    setIdentityVerified(false);
    
    try {
      if (!identityAttributes.fullName && requiredAttributes.fullName) {
        throw new Error('Full name is required');
      }
      
      if (!identityAttributes.nationality && requiredAttributes.nationality) {
        throw new Error('Nationality is required');
      }
      
      if (!userDID) {
        throw new Error('No DID found. Please register a DID first.');
      }
      
      // Generate nullifier
      const newNullifier = generateNullifier(account, 'identity', Date.now());
      setNullifier(newNullifier);
      
      // Prepare identity data
      const identityData = {
        name: identityAttributes.fullName,
        nationality: identityAttributes.nationality,
        documentNumber: identityAttributes.documentNumber,
        dateOfBirth: identityAttributes.dateOfBirth,
        minAge: requiredAttributes.minAge,
        currentTimestamp: getCurrentTimestamp()
      };
      
      // Generate ZK proof
      const proof = await proveIdentity(identityData, requiredAttributes);
      
      setIdentityProof(proof);
      setIdentityProofGenerated(true);
      
      setSuccess({
        message: 'Identity proof generated successfully!',
        details: 'Your identity proof is ready for verification.'
      });
      
    } catch (err) {
      console.error('Identity proof generation error:', err);
      setError(err.message || 'Failed to generate identity proof');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verify identity proof on-chain
   */
  const handleVerifyIdentityProof = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (!identityProof) {
        throw new Error('No proof generated. Please generate a proof first.');
      }
      
      if (!zkpVerifier) {
        throw new Error('ZKP Verifier contract not available');
      }
      
      if (!userDID) {
        throw new Error('No DID found. Please register a DID first.');
      }
      
      // Verify proof on blockchain
      const tx = await zkpVerifier.verifyProof(
        userDID,
        1, // IDENTITY_VERIFICATION proof type
        nullifier,
        identityProof.a,
        identityProof.b,
        identityProof.c,
        identityProof.publicSignals
      );
      
      await tx.wait();
      
      setIdentityVerified(true);
      setIdentityProofResult({
        verified: true,
        txHash: tx.hash,
        timestamp: new Date().toISOString(),
        attributesRevealed: Object.keys(requiredAttributes).filter(k => requiredAttributes[k])
      });
      
      setSuccess({
        message: '✅ Identity verification successful!',
        details: 'Your identity has been verified without revealing sensitive information.'
      });
      
      addVerificationRequest('identity', true, tx.hash);
      
    } catch (err) {
      console.error('Identity verification error:', err);
      setError(err.message || 'Failed to verify identity proof');
      addVerificationRequest('identity', false, null, err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Add verification request to history
   */
  const addVerificationRequest = (type, success, txHash, errorMsg = null) => {
    const newRequest = {
      id: Date.now(),
      type: type,
      timestamp: new Date().toISOString(),
      success: success,
      txHash: txHash,
      error: errorMsg,
      minAge: type === 'age' ? minAge : requiredAttributes.minAge
    };
    
    setVerificationRequests(prev => [newRequest, ...prev].slice(0, 10));
  };

  /**
   * Reset age proof
   */
  const resetAgeProof = () => {
    setAgeProof(null);
    setAgeProofGenerated(false);
    setAgeVerified(false);
    setAgeProofResult(null);
    setBirthDate('');
  };

  /**
   * Reset identity proof
   */
  const resetIdentityProof = () => {
    setIdentityProof(null);
    setIdentityProofGenerated(false);
    setIdentityVerified(false);
    setIdentityProofResult(null);
  };

  // ==================== Effects ====================

  useEffect(() => {
    if (didRegistry && account) {
      loadUserDID();
    }
  }, [didRegistry, account]);

  useEffect(() => {
    loadZKPCircuits();
  }, []);

  // ==================== Render ====================

  return (
    <div className="prove-identity-container">
      <div className="proof-header">
        <h2>Zero-Knowledge Identity Verification</h2>
        <p>Prove your identity or age without revealing personal data using ZKPs</p>
        {userDID && (
          <div className="did-badge">
            <span className="did-label">Your DID:</span>
            <code className="did-value">{userDID}</code>
          </div>
        )}
      </div>
      
      {error && (
        <div className="error-alert">
          <span className="error-icon">WRONG</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="close-btn">×</button>
        </div>
      )}
      
      {success && (
        <div className="success-alert">
          <span className="success-icon">CORRECT</span>
          <div className="success-content">
            <strong>{success.message}</strong>
            {success.details && <p>{success.details}</p>}
          </div>
          <button onClick={() => setSuccess(null)} className="close-btn">×</button>
        </div>
      )}
      
      {/* Tab Navigation */}
      <div className="proof-tabs">
        <button
          className={`tab-btn ${activeTab === 'age' ? 'active' : ''}`}
          onClick={() => setActiveTab('age')}
        >
            Age Verification
        </button>
        <button
          className={`tab-btn ${activeTab === 'identity' ? 'active' : ''}`}
          onClick={() => setActiveTab('identity')}
        >
            Identity Verification
        </button>
      </div>
      
      {/* Age Proof Tab */}
      {activeTab === 'age' && (
        <div className="proof-section">
          <div className="proof-description">
            <h3>Age Verification (Zero-Knowledge)</h3>
            <p>
              Prove that you are at least a certain age without revealing your exact birth date.
              The verifier only learns that you meet the age requirement, nothing more.
            </p>
            <div className="feature-list">
              <span>✓ Private birth date</span>
              <span>✓ Replay protection</span>
              <span>✓ On-chain verification</span>
            </div>
          </div>
          
          {!ageProofGenerated ? (
            <form onSubmit={handleGenerateAgeProof} className="proof-form">
              <div className="form-group">
                <label>Your Birth Date *</label>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                  disabled={loading}
                />
                <small>Your birth date is never revealed to verifiers</small>
              </div>
              
              <div className="form-group">
                <label>Minimum Age Required</label>
                <div className="age-selector">
                  <input
                    type="range"
                    min="13"
                    max="100"
                    value={minAge}
                    onChange={(e) => setMinAge(parseInt(e.target.value))}
                    disabled={loading}
                  />
                  <span className="age-value">{minAge} years</span>
                </div>
              </div>
              
              <button type="submit" disabled={loading || !circuitsLoaded} className="btn-generate">
                {loading ? '⏳ Generating Proof...' : 'KEY Generate Age Proof'}
              </button>
            </form>
          ) : (
            <div className="proof-result">
              <div className="proof-status">
                <div className="status-icon">KEY</div>
                <h3>Proof Generated Successfully</h3>
                <p>Your zero-knowledge proof is ready for verification</p>
              </div>
              
              <div className="proof-details">
                <div className="detail-item">
                  <span className="detail-label">Claim:</span>
                  <span className="detail-value">Age ≥ {minAge} years</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Nullifier:</span>
                  <code className="detail-code">{nullifier?.slice(0, 20)}...</code>
                </div>
                <div className="detail-item">
                  <span className="detail-label">DID:</span>
                  <code className="detail-code">{userDID}</code>
                </div>
              </div>
              
              {!ageVerified ? (
                <button onClick={handleVerifyAgeProof} disabled={loading} className="btn-verify">
                  {loading ? '⏳ Verifying on-chain...' : '  Submit & Verify Proof'}
                </button>
              ) : (
                <div className="verification-success">
                  <div className="success-check">✓</div>
                  <h4>Verification Successful!</h4>
                  <p>Your age has been verified on the blockchain</p>
                  {ageProofResult?.txHash && (
                    <a
                      href={`https://etherscan.io/tx/${ageProofResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tx-link"
                    >
                      View Transaction →
                    </a>
                  )}
                </div>
              )}
              
              <button onClick={resetAgeProof} className="btn-reset">
                Generate New Proof
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Identity Proof Tab */}
      {activeTab === 'identity' && (
        <div className="proof-section">
          <div className="proof-description">
            <h3>Identity Verification (Zero-Knowledge)</h3>
            <p>
              Prove specific attributes about your identity without revealing the actual data.
              Choose which attributes to disclose and verify them privately.
            </p>
          </div>
          
          {!identityProofGenerated ? (
            <form onSubmit={handleGenerateIdentityProof} className="proof-form">
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={requiredAttributes.fullName}
                    onChange={(e) => setRequiredAttributes(prev => ({ ...prev, fullName: e.target.checked }))}
                  />
                  Verify Full Name
                </label>
                {requiredAttributes.fullName && (
                  <input
                    type="text"
                    value={identityAttributes.fullName}
                    onChange={(e) => setIdentityAttributes(prev => ({ ...prev, fullName: e.target.value }))}
                    placeholder="Enter your full name"
                    required
                  />
                )}
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={requiredAttributes.nationality}
                    onChange={(e) => setRequiredAttributes(prev => ({ ...prev, nationality: e.target.checked }))}
                  />
                  Verify Nationality
                </label>
                {requiredAttributes.nationality && (
                  <select
                    value={identityAttributes.nationality}
                    onChange={(e) => setIdentityAttributes(prev => ({ ...prev, nationality: e.target.value }))}
                    required
                  >
                    <option value="">Select nationality</option>
                    <option value="US">United States</option>
                    <option value="UK">United Kingdom</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="DE">Germany</option>
                    <option value="FR">France</option>
                    <option value="JP">Japan</option>
                  </select>
                )}
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={requiredAttributes.minAge > 0}
                    onChange={(e) => setRequiredAttributes(prev => ({ 
                      ...prev, 
                      minAge: e.target.checked ? 18 : 0 
                    }))}
                  />
                  Verify Minimum Age
                </label>
                {requiredAttributes.minAge > 0 && (
                  <div className="age-selector">
                    <input
                      type="range"
                      min="13"
                      max="100"
                      value={requiredAttributes.minAge}
                      onChange={(e) => setRequiredAttributes(prev => ({ 
                        ...prev, 
                        minAge: parseInt(e.target.value) 
                      }))}
                    />
                    <span className="age-value">{requiredAttributes.minAge} years</span>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={requiredAttributes.documentNumber}
                    onChange={(e) => setRequiredAttributes(prev => ({ ...prev, documentNumber: e.target.checked }))}
                  />
                  Verify Document Number (private)
                </label>
                {requiredAttributes.documentNumber && (
                  <input
                    type="text"
                    value={identityAttributes.documentNumber}
                    onChange={(e) => setIdentityAttributes(prev => ({ ...prev, documentNumber: e.target.value }))}
                    placeholder="Enter document number"
                  />
                )}
              </div>
              
              <div className="form-group">
                <label>Date of Birth (always private)</label>
                <input
                  type="date"
                  value={identityAttributes.dateOfBirth}
                  onChange={(e) => setIdentityAttributes(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                />
                <small>Used only for age verification, never revealed</small>
              </div>
              
              <button type="submit" disabled={loading || !circuitsLoaded} className="btn-generate">
                {loading ? '⏳ Generating Identity Proof...' : 'KEY Generate Identity Proof'}
              </button>
            </form>
          ) : (
            <div className="proof-result">
              <div className="proof-status">
                <div className="status-icon">KEY</div>
                <h3>Identity Proof Generated</h3>
                <p>Your zero-knowledge identity proof is ready</p>
              </div>
              
              <div className="proof-details">
                <div className="detail-item">
                  <span className="detail-label">Revealed Attributes:</span>
                  <span className="detail-value">
                    {Object.keys(requiredAttributes).filter(k => requiredAttributes[k] && k !== 'minAge').join(', ') || 'None'}
                    {requiredAttributes.minAge > 0 && ` (Min Age: ${requiredAttributes.minAge})`}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Hidden Attributes:</span>
                  <span className="detail-value">
                    {Object.keys(identityAttributes).filter(k => identityAttributes[k] && !requiredAttributes[k]).join(', ') || 'All shown'}
                  </span>
                </div>
              </div>
              
              {!identityVerified ? (
                <button onClick={handleVerifyIdentityProof} disabled={loading} className="btn-verify">
                  {loading ? '⏳ Verifying on-chain...' : 'KEY Submit & Verify Identity Proof'}
                </button>
              ) : (
                <div className="verification-success">
                  <div className="success-check">✓</div>
                  <h4>Identity Verified!</h4>
                  <p>Your identity has been verified on the blockchain</p>
                </div>
              )}
              
              <button onClick={resetIdentityProof} className="btn-reset">
                Generate New Proof
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* Verification History */}
      {verificationRequests.length > 0 && (
        <div className="verification-history">
          <h3>Recent Verification Requests</h3>
          <div className="history-list">
            {verificationRequests.map(req => (
              <div key={req.id} className={`history-item ${req.success ? 'success' : 'failed'}`}>
                <div className="history-icon">
                  {req.success ? 'CORRECT' : 'WRONG'}
                </div>
                <div className="history-details">
                  <div className="history-type">
                    {req.type === 'age' ? 'Age Verification' : 'Identity Verification'}
                  </div>
                  <div className="history-time">{req.timestamp}</div>
                  {req.minAge && <div className="history-info">Min Age: {req.minAge}</div>}
                  {req.txHash && (
                    <a href="#" className="history-tx">View TX</a>
                  )}
                  {req.error && <div className="history-error">{req.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <style jsx>{`
        .prove-identity-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem;
          background: #ffffff;
          border-radius: 1rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .proof-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .proof-header h2 {
          margin: 0 0 0.5rem 0;
          color: #1a1a2e;
        }
        
        .proof-header p {
          color: #666;
          margin: 0 0 1rem 0;
        }
        
        .did-badge {
          background: #f5f5f5;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
        }
        
        .did-label {
          font-weight: 600;
          color: #666;
        }
        
        .did-value {
          font-family: monospace;
          color: #667eea;
        }
        
        /* Tabs */
        .proof-tabs {
          display: flex;
          gap: 1rem;
          margin-bottom: 2rem;
          border-bottom: 2px solid #eee;
        }
        
        .tab-btn {
          padding: 0.75rem 1.5rem;
          background: none;
          border: none;
          font-size: 1rem;
          cursor: pointer;
          color: #666;
          transition: all 0.2s;
        }
        
        .tab-btn.active {
          color: #667eea;
          border-bottom: 2px solid #667eea;
          margin-bottom: -2px;
        }
        
        /* Forms */
        .proof-section {
          animation: fadeIn 0.3s ease;
        }
        
        .proof-description {
          background: linear-gradient(135deg, #667eea10 0%, #764ba210 100%);
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
        }
        
        .proof-description h3 {
          margin: 0 0 0.5rem 0;
          color: #667eea;
        }
        
        .feature-list {
          display: flex;
          gap: 1rem;
          margin-top: 0.5rem;
          font-size: 0.875rem;
          color: #4caf50;
        }
        
        .proof-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .form-group label {
          font-weight: 500;
          color: #333;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .form-group input[type="text"],
        .form-group input[type="date"],
        .form-group select {
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 0.5rem;
          font-size: 1rem;
        }
        
        .age-selector {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .age-selector input {
          flex: 1;
        }
        
        .age-value {
          min-width: 70px;
          font-weight: 600;
          color: #667eea;
        }
        
        /* Buttons */
        .btn-generate,
        .btn-verify,
        .btn-reset {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-generate {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .btn-verify {
          background: #4caf50;
          color: white;
        }
        
        .btn-reset {
          background: #6c757d;
          color: white;
          margin-top: 1rem;
        }
        
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* Proof Result */
        .proof-result {
          text-align: center;
          padding: 2rem;
          background: #f8f9fa;
          border-radius: 0.5rem;
        }
        
        .status-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }
        
        .proof-details {
          text-align: left;
          background: white;
          padding: 1rem;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        
        .detail-item {
          display: flex;
          gap: 0.5rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid #eee;
        }
        
        .detail-label {
          font-weight: 600;
          min-width: 120px;
          color: #666;
        }
        
        .detail-code {
          font-family: monospace;
          font-size: 0.75rem;
          color: #667eea;
          word-break: break-all;
        }
        
        .verification-success {
          text-align: center;
          padding: 1rem;
          background: #e8f5e9;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        
        .success-check {
          font-size: 3rem;
          color: #4caf50;
        }
        
        /* History */
        .verification-history {
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid #eee;
        }
        
        .verification-history h3 {
          margin: 0 0 1rem 0;
        }
        
        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .history-item {
          display: flex;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 0.5rem;
          border-left: 4px solid;
        }
        
        .history-item.success {
          border-left-color: #4caf50;
        }
        
        .history-item.failed {
          border-left-color: #f44336;
        }
        
        .history-details {
          flex: 1;
        }
        
        .history-type {
          font-weight: 600;
        }
        
        .history-time {
          font-size: 0.75rem;
          color: #999;
        }
        
        .history-error {
          color: #f44336;
          font-size: 0.75rem;
          margin-top: 0.25rem;
        }
        
        /* Alerts */
        .error-alert,
        .success-alert {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .error-alert {
          background: #fee;
          border: 1px solid #fcc;
          color: #c33;
        }
        
        .success-alert {
          background: #efe;
          border: 1px solid #cfc;
          color: #3c3;
        }
        
        .close-btn {
          margin-left: auto;
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @media (max-width: 640px) {
          .prove-identity-container {
            padding: 1rem;
          }
          
          .detail-item {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

ProveIdentity.propTypes = {
  signer: PropTypes.object.isRequired,
  zkpVerifier: PropTypes.object.isRequired,
  didRegistry: PropTypes.object.isRequired,
  account: PropTypes.string.isRequired,
  did: PropTypes.string
};

export default ProveIdentity;
