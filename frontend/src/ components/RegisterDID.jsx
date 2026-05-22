// frontend/src/components/RegisterDID.jsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import PropTypes from 'prop-types';

// IPFS utilities
import { uploadToIPFS, pinToIPFS, getFromIPFS } from '../utils/ipfs';

// ZKP utilities
import { generateDIDDocument, validateDIDFormat } from '../utils/did';

const RegisterDID = ({ signer, didRegistry, account, onDIDRegistered }) => {
  // ==================== State Variables ====================
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // DID registration states
  const [did, setDid] = useState('');
  const [didSuffix, setDidSuffix] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [existingDID, setExistingDID] = useState(null);
  const [didDocument, setDidDocument] = useState(null);
  const [didMetadata, setDidMetadata] = useState(null);
  
  // DID document fields
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [avatar, setAvatar] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  
  // Additional options
  const [useIPFS, setUseIPFS] = useState(true);
  const [ipfsHash, setIpfsHash] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Custom DID options
  const [customDID, setCustomDID] = useState('');
  const [useCustomDID, setUseCustomDID] = useState(false);
  
  // ==================== Helper Functions ====================

  /**
   * Generate DID string
   */
  const generateDID = () => {
    if (useCustomDID && customDID) {
      return `did:example:${customDID}`;
    }
    const suffix = didSuffix || ethers.utils.id(account).substring(0, 16);
    return `did:example:${suffix}`;
  };

  /**
   * Generate public key from signer
   */
  const getPublicKeyFromSigner = async () => {
    try {
      const address = await signer.getAddress();
      // In production, you'd get the actual public key
      // For now, use address as public key identifier
      return `0x${address}`;
    } catch (err) {
      console.error('Error getting public key:', err);
      return '';
    }
  };

  /**
   * Create DID Document (JSON-LD format)
   */
  const createDIDDocument = async () => {
    const didString = generateDID();
    const pubKey = publicKey || await getPublicKeyFromSigner();
    const timestamp = Math.floor(Date.now() / 1000);
    
    const document = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/ed25519-2020/v1'
      ],
      id: didString,
      controller: didString,
      authentication: [
        {
          id: `${didString}#keys-1`,
          type: 'Ed25519VerificationKey2020',
          controller: didString,
          publicKeyMultibase: pubKey
        }
      ],
      assertionMethod: [
        `${didString}#keys-1`
      ],
      verificationMethod: [
        {
          id: `${didString}#keys-1`,
          type: 'Ed25519VerificationKey2020',
          controller: didString,
          publicKeyMultibase: pubKey
        }
      ],
      service: [
        {
          id: `${didString}#linked-domain`,
          type: 'LinkedDomains',
          serviceEndpoint: website || ''
        },
        {
          id: `${didString}#hub`,
          type: 'IdentityHub',
          serviceEndpoint: 'https://hub.example.com'
        }
      ],
      alsoKnownAs: [],
      profile: {
        name: displayName,
        description: description,
        email: email,
        website: website,
        avatar: avatarPreview || '',
        createdAt: timestamp,
        updatedAt: timestamp
      },
      created: new Date(timestamp * 1000).toISOString(),
      updated: new Date(timestamp * 1000).toISOString()
    };
    
    // Remove empty fields
    if (!website) delete document.service[0];
    if (!displayName && !description && !email) delete document.profile;
    
    return document;
  };

  /**
   * Upload DID document to IPFS
   */
  const uploadDIDDocumentToIPFS = async (document) => {
    try {
      const result = await uploadToIPFS(document);
      const cid = result.cid.toString();
      const ipfsUrl = `ipfs://${cid}`;
      
      // Pin to IPFS for persistence
      await pinToIPFS(cid);
      
      return {
        cid: cid,
        url: ipfsUrl,
        gatewayUrl: `https://ipfs.io/ipfs/${cid}`
      };
    } catch (err) {
      console.error('IPFS upload error:', err);
      throw new Error('Failed to upload to IPFS');
    }
  };

  /**
   * Check if user already has a DID
   */
  const checkExistingDID = async () => {
    if (!didRegistry || !account) return;
    
    try {
      const existingDid = await didRegistry.getDIDByOwner(account);
      if (existingDid && existingDid !== '') {
        setIsRegistered(true);
        setExistingDID(existingDid);
        
        // Fetch DID document if exists
        const docHash = await didRegistry.getDIDDocumentHash(existingDid);
        if (docHash && docHash !== '') {
          setIpfsHash(docHash);
          // Try to fetch from IPFS
          try {
            const document = await getFromIPFS(docHash);
            setDidDocument(document);
            // Populate form fields from document
            if (document.profile) {
              setDisplayName(document.profile.name || '');
              setDescription(document.profile.description || '');
              setEmail(document.profile.email || '');
              setWebsite(document.profile.website || '');
            }
          } catch (ipfsErr) {
            console.warn('Could not fetch DID document from IPFS:', ipfsErr);
          }
        }
        
        return existingDid;
      }
    } catch (err) {
      // User might not have a DID yet (error means no DID found)
      if (!err.message?.includes('Owner has no DID')) {
        console.error('Error checking existing DID:', err);
      }
      setIsRegistered(false);
    }
    return null;
  };

  /**
   * Get DID metadata from blockchain
   */
  const getDIDMetadata = async (didString) => {
    try {
      const doc = await didRegistry.resolveDID(didString);
      setDidMetadata({
        owner: doc.owner,
        created: new Date(doc.created * 1000).toLocaleString(),
        updated: new Date(doc.updated * 1000).toLocaleString(),
        isActive: doc.isActive,
        documentHash: doc.documentHash
      });
      return doc;
    } catch (err) {
      console.error('Error resolving DID:', err);
      return null;
    }
  };

  // ==================== Main Actions ====================

  /**
   * Register new DID
   */
  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Validate inputs
      if (!displayName.trim()) {
        throw new Error('Display name is required');
      }
      
      const didString = generateDID();
      
      // Validate DID format
      if (!validateDIDFormat(didString)) {
        throw new Error('Invalid DID format');
      }
      
      // Create DID document
      const didDocumentData = await createDIDDocument();
      
      let documentHash = '';
      let ipfsData = null;
      
      // Upload to IPFS if enabled
      if (useIPFS) {
        ipfsData = await uploadDIDDocumentToIPFS(didDocumentData);
        documentHash = ipfsData.cid;
        setIpfsHash(documentHash);
      } else {
        // Use direct hash (for testing)
        documentHash = ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(JSON.stringify(didDocumentData))
        );
      }
      
      // Register DID on blockchain
      const tx = await didRegistry.registerDID(didString, documentHash);
      await tx.wait();
      
      setSuccess({
        message: 'DID registered successfully!',
        did: didString,
        txHash: tx.hash,
        ipfsHash: documentHash,
        ipfsUrl: ipfsData?.gatewayUrl
      });
      
      setIsRegistered(true);
      setExistingDID(didString);
      
      // Get metadata
      await getDIDMetadata(didString);
      
      // Callback
      if (onDIDRegistered) {
        onDIDRegistered({
          did: didString,
          documentHash: documentHash,
          txHash: tx.hash
        });
      }
      
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to register DID');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update existing DID document
   */
  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setIsUpdating(true);
    
    try {
      const didString = existingDID;
      if (!didString) {
        throw new Error('No DID to update');
      }
      
      // Create updated DID document
      const didDocumentData = await createDIDDocument();
      
      let documentHash = '';
      let ipfsData = null;
      
      if (useIPFS) {
        ipfsData = await uploadDIDDocumentToIPFS(didDocumentData);
        documentHash = ipfsData.cid;
        setIpfsHash(documentHash);
      } else {
        documentHash = ethers.utils.keccak256(
          ethers.utils.toUtf8Bytes(JSON.stringify(didDocumentData))
        );
      }
      
      // Update on blockchain
      const tx = await didRegistry.updateDIDDocument(didString, documentHash);
      await tx.wait();
      
      setSuccess({
        message: 'DID document updated successfully!',
        did: didString,
        txHash: tx.hash,
        ipfsHash: documentHash
      });
      
      // Refresh metadata
      await getDIDMetadata(didString);
      
    } catch (err) {
      console.error('Update error:', err);
      setError(err.message || 'Failed to update DID document');
    } finally {
      setLoading(false);
      setIsUpdating(false);
    }
  };

  /**
   * Revoke DID
   */
  const handleRevoke = async () => {
    if (!window.confirm('Are you sure you want to revoke your DID? This action can be reversed by reactivating.')) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const tx = await didRegistry.revokeDID(existingDID);
      await tx.wait();
      
      setSuccess({
        message: 'DID revoked successfully!',
        did: existingDID,
        txHash: tx.hash
      });
      
      // Refresh metadata
      await getDIDMetadata(existingDID);
      
    } catch (err) {
      console.error('Revoke error:', err);
      setError(err.message || 'Failed to revoke DID');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reactivate DID
   */
  const handleReactivate = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const tx = await didRegistry.reactivateDID(existingDID);
      await tx.wait();
      
      setSuccess({
        message: 'DID reactivated successfully!',
        did: existingDID,
        txHash: tx.hash
      });
      
      // Refresh metadata
      await getDIDMetadata(existingDID);
      
    } catch (err) {
      console.error('Reactivation error:', err);
      setError(err.message || 'Failed to reactivate DID');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle avatar file upload
   */
  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
        // In production, upload to IPFS here
      };
      reader.readAsDataURL(file);
      setAvatar(file);
    }
  };

  // ==================== Effects ====================

  // Check if user already has a DID on component mount
  useEffect(() => {
    if (didRegistry && account) {
      checkExistingDID();
    }
  }, [didRegistry, account]);

  // Generate default DID suffix from account
  useEffect(() => {
    if (account && !didSuffix) {
      const shortAddress = account.substring(2, 18);
      setDidSuffix(shortAddress);
    }
  }, [account]);

  // ==================== Render ====================

  return (
    <div className="register-did-container">
      <div className="did-header">
        <h2>Decentralized Identity (DID)</h2>
        <p>Register and manage your self-sovereign identity on the blockchain</p>
      </div>
      
      {error && (
        <div className="error-alert">
          <span className="error-icon">❌</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="close-btn">×</button>
        </div>
      )}
      
      {success && (
        <div className="success-alert">
          <span className="success-icon">✅</span>
          <div className="success-content">
            <strong>{success.message}</strong>
            {success.did && <p className="success-did">DID: {success.did}</p>}
            {success.txHash && (
              <p className="success-tx">
                TX: <a href={`https://etherscan.io/tx/${success.txHash}`} target="_blank" rel="noopener noreferrer">
                  {success.txHash.slice(0, 16)}...
                </a>
              </p>
            )}
            {success.ipfsUrl && (
              <p className="success-ipfs">
                IPFS: <a href={success.ipfsUrl} target="_blank" rel="noopener noreferrer">
                  View on IPFS
                </a>
              </p>
            )}
          </div>
          <button onClick={() => setSuccess(null)} className="close-btn">×</button>
        </div>
      )}
      
      {isRegistered && existingDID ? (
        // DID Management View
        <div className="did-management">
          <div className="did-info-card">
            <h3>Your Decentralized Identity</h3>
            <div className="did-details">
              <div className="did-detail-item">
                <span className="detail-label">DID:</span>
                <code className="detail-value">{existingDID}</code>
                <button 
                  onClick={() => navigator.clipboard.writeText(existingDID)}
                  className="copy-btn-small"
                >
                  📋
                </button>
              </div>
              
              {didMetadata && (
                <>
                  <div className="did-detail-item">
                    <span className="detail-label">Status:</span>
                    <span className={`status-badge ${didMetadata.isActive ? 'active' : 'revoked'}`}>
                      {didMetadata.isActive ? 'Active' : 'Revoked'}
                    </span>
                  </div>
                  <div className="did-detail-item">
                    <span className="detail-label">Created:</span>
                    <span className="detail-value">{didMetadata.created}</span>
                  </div>
                  <div className="did-detail-item">
                    <span className="detail-label">Last Updated:</span>
                    <span className="detail-value">{didMetadata.updated}</span>
                  </div>
                  <div className="did-detail-item">
                    <span className="detail-label">IPFS Hash:</span>
                    <code className="detail-value-small">{ipfsHash.slice(0, 30)}...</code>
                  </div>
                </>
              )}
            </div>
          </div>
          
          <div className="did-update-form">
            <h3>{isUpdating ? 'Update DID Document' : 'Edit DID Profile'}</h3>
            <form onSubmit={isUpdating ? handleUpdate : handleRegister}>
              <div className="form-group">
                <label>Display Name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="John Doe"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe yourself or your organization"
                  rows="3"
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
                
                <div className="form-group">
                  <label>Website</label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label>Avatar</label>
                <div className="avatar-upload">
                  {avatarPreview && (
                    <img src={avatarPreview} alt="Avatar preview" className="avatar-preview" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="avatar-input"
                  />
                </div>
              </div>
              
              <div className="form-checkbox">
                <label>
                  <input
                    type="checkbox"
                    checked={useIPFS}
                    onChange={(e) => setUseIPFS(e.target.checked)}
                  />
                  Store DID document on IPFS (recommended)
                </label>
              </div>
              
              <div className="button-group">
                <button 
                  type="submit" 
                  disabled={loading}
                  className="btn-primary"
                >
                  {loading ? 'Processing...' : (isUpdating ? 'Update DID' : 'Save Changes')}
                </button>
                
                {!isUpdating && didMetadata?.isActive && (
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={loading}
                    className="btn-danger"
                  >
                    Revoke DID
                  </button>
                )}
                
                {!isUpdating && !didMetadata?.isActive && (
                  <button
                    type="button"
                    onClick={handleReactivate}
                    disabled={loading}
                    className="btn-warning"
                  >
                    Reactivate DID
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      ) : (
        // Registration View
        <div className="did-registration">
          <div className="registration-info">
            <h3>Register Your Decentralized Identity</h3>
            <p>By registering a DID, you gain:</p>
            <ul>
              <li>✓ Self-sovereign identity ownership</li>
              <li>✓ Ability to receive verifiable credentials</li>
              <li>✓ Zero-knowledge proof verification</li>
              <li>✓ Cross-platform identity interoperability</li>
            </ul>
          </div>
          
          <form onSubmit={handleRegister} className="registration-form">
            <div className="form-group">
              <label>Display Name *</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                required
                disabled={loading}
              />
            </div>
            
            <div className="form-group">
              <label>Description (Optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell others about yourself"
                rows="3"
                disabled={loading}
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  disabled={loading}
                />
              </div>
              
              <div className="form-group">
                <label>Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  disabled={loading}
                />
              </div>
            </div>
            
            <div className="form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={useCustomDID}
                  onChange={(e) => setUseCustomDID(e.target.checked)}
                  disabled={loading}
                />
                Use custom DID suffix
              </label>
            </div>
            
            {useCustomDID && (
              <div className="form-group">
                <label>Custom DID Suffix</label>
                <div className="did-preview">
                  <span className="did-prefix">did:example:</span>
                  <input
                    type="text"
                    value={customDID}
                    onChange={(e) => setCustomDID(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                    placeholder="your-custom-id"
                    disabled={loading}
                  />
                </div>
                <small>Only letters, numbers, underscores, and hyphens allowed</small>
              </div>
            )}
            
            <div className="did-preview-box">
              <span className="preview-label">Your DID will be:</span>
              <code className="did-preview-value">{generateDID()}</code>
            </div>
            
            <div className="form-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={useIPFS}
                  onChange={(e) => setUseIPFS(e.target.checked)}
                  disabled={loading}
                />
                Store DID document on IPFS (recommended for production)
              </label>
            </div>
            
            <button type="submit" disabled={loading} className="btn-register">
              {loading ? (
                <span className="loading-spinner">⏳ Registering...</span>
              ) : (
                'Register DID'
              )}
            </button>
          </form>
        </div>
      )}
      
      <style jsx>{`
        .register-did-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          background: #ffffff;
          border-radius: 1rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        
        .did-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .did-header h2 {
          margin: 0 0 0.5rem 0;
          color: #1a1a2e;
        }
        
        .did-header p {
          color: #666;
          margin: 0;
        }
        
        /* Form Styles */
        .form-group {
          margin-bottom: 1.25rem;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #333;
        }
        
        .form-group input,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 0.5rem;
          font-size: 1rem;
          transition: border-color 0.2s;
        }
        
        .form-group input:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #667eea;
        }
        
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }
        
        .form-checkbox {
          margin: 1rem 0;
        }
        
        .form-checkbox label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        
        /* DID Preview */
        .did-preview {
          display: flex;
          align-items: center;
          border: 1px solid #ddd;
          border-radius: 0.5rem;
          overflow: hidden;
        }
        
        .did-prefix {
          background: #f5f5f5;
          padding: 0.75rem;
          font-family: monospace;
          color: #666;
        }
        
        .did-preview input {
          border: none;
          flex: 1;
          padding: 0.75rem;
        }
        
        .did-preview-box {
          background: #f5f5f5;
          padding: 0.75rem;
          border-radius: 0.5rem;
          margin: 1rem 0;
        }
        
        .preview-label {
          font-size: 0.875rem;
          color: #666;
          margin-right: 0.5rem;
        }
        
        .did-preview-value {
          font-family: monospace;
          font-size: 0.875rem;
          color: #667eea;
        }
        
        /* Buttons */
        .button-group {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }
        
        .btn-register,
        .btn-primary {
          width: 100%;
          padding: 0.75rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s;
        }
        
        .btn-register:hover:not(:disabled),
        .btn-primary:hover:not(:disabled) {
          transform: translateY(-1px);
        }
        
        .btn-danger {
          padding: 0.75rem 1.5rem;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
        }
        
        .btn-warning {
          padding: 0.75rem 1.5rem;
          background: #ffc107;
          color: #333;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
        }
        
        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
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
        
        /* DID Info Card */
        .did-info-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 1.5rem;
          border-radius: 1rem;
          margin-bottom: 2rem;
        }
        
        .did-info-card h3 {
          margin: 0 0 1rem 0;
        }
        
        .did-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .did-detail-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        
        .detail-label {
          font-weight: 600;
          min-width: 100px;
        }
        
        .detail-value,
        .detail-value-small {
          font-family: monospace;
          word-break: break-all;
        }
        
        .status-badge {
          padding: 0.25rem 0.5rem;
          border-radius: 0.25rem;
          font-size: 0.75rem;
          font-weight: 600;
        }
        
        .status-badge.active {
          background: #4caf50;
          color: white;
        }
        
        .status-badge.revoked {
          background: #f44336;
          color: white;
        }
        
        .copy-btn-small {
          background: rgba(255,255,255,0.2);
          border: none;
          border-radius: 0.25rem;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
        }
        
        /* Avatar */
        .avatar-upload {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .avatar-preview {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          object-fit: cover;
        }
        
        /* Registration Info */
        .registration-info {
          background: #f5f5f5;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
        }
        
        .registration-info ul {
          margin: 0.5rem 0 0 1.5rem;
          padding: 0;
        }
        
        .registration-info li {
          margin: 0.25rem 0;
        }
        
        /* Responsive */
        @media (max-width: 640px) {
          .register-did-container {
            padding: 1rem;
          }
          
          .form-row {
            grid-template-columns: 1fr;
          }
          
          .button-group {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

RegisterDID.propTypes = {
  signer: PropTypes.object.isRequired,
  didRegistry: PropTypes.object.isRequired,
  account: PropTypes.string.isRequired,
  onDIDRegistered: PropTypes.func
};

export default RegisterDID;
