// frontend/src/utils/ipfs.js
import { create } from 'ipfs-http-client';
import { Buffer } from 'buffer';

// ==================== Configuration ====================

// IPFS Gateway configurations
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://dweb.link/ipfs/',
  'https://ipfs.infura.io/ipfs/'
];

// Default IPFS client configuration
const IPFS_CONFIG = {
  host: process.env.REACT_APP_IPFS_HOST || 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  headers: {
    authorization: process.env.REACT_APP_IPFS_AUTH || ''
  }
};

// Pinata configuration (for pinning)
const PINATA_API_KEY = process.env.REACT_APP_PINATA_API_KEY;
const PINATA_API_SECRET = process.env.REACT_APP_PINATA_API_SECRET;

// ==================== IPFS Client Initialization ====================

/**
 * Create IPFS client instance
 * @returns {Object} IPFS client
 */
export const getIPFSClient = () => {
  try {
    // Try to connect to local IPFS node first
    const localClient = create({ url: 'http://localhost:5001' });
    return localClient;
  } catch (error) {
    console.warn('Local IPFS node not found, using remote gateway:', error);
    // Fallback to remote gateway
    return create(IPFS_CONFIG);
  }
};

const ipfsClient = getIPFSClient();

// ==================== Core IPFS Operations ====================

/**
 * Upload data to IPFS
 * @param {any} data - Data to upload (object, string, buffer, file)
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with CID and details
 */
export const uploadToIPFS = async (data, options = {}) => {
  try {
    let content;
    let contentType = 'application/json';
    
    // Handle different data types
    if (typeof data === 'object' && !Buffer.isBuffer(data) && !(data instanceof File)) {
      content = JSON.stringify(data, null, 2);
      contentType = 'application/json';
    } else if (typeof data === 'string') {
      content = data;
      contentType = 'text/plain';
    } else if (data instanceof File) {
      content = data;
      contentType = data.type;
    } else if (Buffer.isBuffer(data)) {
      content = data;
      contentType = 'application/octet-stream';
    } else {
      content = JSON.stringify(data);
      contentType = 'application/json';
    }
    
    // Add metadata
    const metadata = {
      'Content-Type': contentType,
      'x-created': new Date().toISOString(),
      ...options.metadata
    };
    
    // Upload to IPFS
    const result = await ipfsClient.add(
      { content, path: options.path || 'file' },
      {
        pin: options.pin || true,
        wrapWithDirectory: options.wrapWithDirectory || false,
        cidVersion: options.cidVersion || 1,
        progress: options.onProgress
      }
    );
    
    const cid = result.cid.toString();
    const ipfsUrl = `ipfs://${cid}`;
    const gatewayUrls = IPFS_GATEWAYS.map(gateway => `${gateway}${cid}`);
    
    return {
      success: true,
      cid: cid,
      url: ipfsUrl,
      gatewayUrls: gatewayUrls,
      size: result.size,
      path: result.path,
      timestamp: new Date().toISOString(),
      metadata: metadata
    };
    
  } catch (error) {
    console.error('IPFS upload error:', error);
    throw new Error(`Failed to upload to IPFS: ${error.message}`);
  }
};

/**
 * Get data from IPFS by CID
 * @param {string} cid - IPFS CID
 * @param {Object} options - Options (gateway, timeout)
 * @returns {Promise<any>} Retrieved data
 */
export const getFromIPFS = async (cid, options = {}) => {
  try {
    // Try multiple gateways in case one fails
    const gateways = options.gateways || IPFS_GATEWAYS;
    let lastError = null;
    
    for (const gateway of gateways) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);
        
        const response = await fetch(`${gateway}${cid}`, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json, text/plain, */*'
          }
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            return await response.json();
          } else {
            return await response.text();
          }
        }
      } catch (err) {
        lastError = err;
        console.warn(`Gateway ${gateway} failed:`, err.message);
        continue;
      }
    }
    
    throw lastError || new Error('All gateways failed');
    
  } catch (error) {
    console.error('IPFS retrieval error:', error);
    throw new Error(`Failed to retrieve from IPFS: ${error.message}`);
  }
};

/**
 * Pin content to IPFS (persist storage)
 * @param {string} cid - CID to pin
 * @param {Object} options - Pin options
 * @returns {Promise<Object>} Pin result
 */
export const pinToIPFS = async (cid, options = {}) => {
  try {
    // Try to pin using Pinata if API keys are available
    if (PINATA_API_KEY && PINATA_API_SECRET) {
      const response = await fetch('https://api.pinata.cloud/pinning/pinByHash', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_API_SECRET
        },
        body: JSON.stringify({
          hashToPin: cid,
          pinataMetadata: {
            name: options.name || `DID-${cid}`,
            keyvalues: options.metadata || {}
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          cid: cid,
          service: 'pinata',
          pinId: result.id
        };
      }
    }
    
    // Fallback: Pin using local IPFS node
    const result = await ipfsClient.pin.add(cid);
    return {
      success: true,
      cid: cid,
      service: 'local',
      pinId: result.cid.toString()
    };
    
  } catch (error) {
    console.error('IPFS pinning error:', error);
    return {
      success: false,
      cid: cid,
      error: error.message
    };
  }
};

/**
 * Unpin content from IPFS
 * @param {string} cid - CID to unpin
 * @returns {Promise<Object>} Unpin result
 */
export const unpinFromIPFS = async (cid) => {
  try {
    await ipfsClient.pin.rm(cid);
    return {
      success: true,
      cid: cid,
      message: 'Successfully unpinned'
    };
  } catch (error) {
    console.error('IPFS unpinning error:', error);
    return {
      success: false,
      cid: cid,
      error: error.message
    };
  }
};

/**
 * Check if content is pinned
 * @param {string} cid - CID to check
 * @returns {Promise<boolean>} True if pinned
 */
export const isPinned = async (cid) => {
  try {
    const pins = await ipfsClient.pin.ls({ paths: [cid] });
    for await (const pin of pins) {
      if (pin.cid.toString() === cid) {
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking pin status:', error);
    return false;
  }
};

// ==================== DID Document Specific Functions ====================

/**
 * Upload DID document to IPFS
 * @param {Object} didDocument - DID document object
 * @param {string} did - DID string
 * @returns {Promise<Object>} Upload result
 */
export const uploadDIDDocument = async (didDocument, did) => {
  const enrichedDocument = {
    ...didDocument,
    metadata: {
      ...didDocument.metadata,
      did: did,
      version: '1.0',
      uploadedAt: new Date().toISOString(),
      schema: 'https://www.w3.org/ns/did/v1'
    }
  };
  
  const result = await uploadToIPFS(enrichedDocument, {
    path: `${did}/did.json`,
    metadata: {
      type: 'did-document',
      did: did
    }
  });
  
  return result;
};

/**
 * Get DID document from IPFS
 * @param {string} cid - CID of DID document
 * @returns {Promise<Object>} DID document
 */
export const getDIDDocument = async (cid) => {
  const document = await getFromIPFS(cid);
  
  // Validate DID document structure
  if (!document['@context'] && !document.id) {
    console.warn('Retrieved document may not be a valid DID document');
  }
  
  return document;
};

// ==================== Credential Functions ====================

/**
 * Upload credential to IPFS
 * @param {Object} credential - Credential object
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result
 */
export const uploadCredential = async (credential, options = {}) => {
  const enrichedCredential = {
    ...credential,
    metadata: {
      ...credential.metadata,
      version: '1.0',
      uploadedAt: new Date().toISOString(),
      type: 'verifiable-credential'
    }
  };
  
  const result = await uploadToIPFS(enrichedCredential, {
    path: options.path || `credentials/${Date.now()}`,
    metadata: options.metadata
  });
  
  return result;
};

/**
 * Get credential from IPFS
 * @param {string} cid - Credential CID
 * @returns {Promise<Object>} Credential object
 */
export const getCredential = async (cid) => {
  return await getFromIPFS(cid);
};

// ==================== File Upload Functions ====================

/**
 * Upload file to IPFS
 * @param {File} file - File object
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} Upload result
 */
export const uploadFile = async (file, onProgress) => {
  const result = await uploadToIPFS(file, {
    path: file.name,
    onProgress: onProgress,
    metadata: {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    }
  });
  
  return result;
};

/**
 * Upload multiple files to IPFS
 * @param {File[]} files - Array of files
 * @param {Function} onProgress - Progress callback per file
 * @returns {Promise<Object[]>} Upload results
 */
export const uploadMultipleFiles = async (files, onProgress) => {
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    const result = await uploadFile(files[i], (progress) => {
      if (onProgress) {
        onProgress(i, files.length, progress);
      }
    });
    results.push(result);
  }
  
  return results;
};

// ==================== Utility Functions ====================

/**
 * Get gateway URL for a CID
 * @param {string} cid - IPFS CID
 * @param {number} gatewayIndex - Gateway index (0 = fastest)
 * @returns {string} Gateway URL
 */
export const getGatewayUrl = (cid, gatewayIndex = 0) => {
  if (!cid) return '';
  const gateway = IPFS_GATEWAYS[gatewayIndex] || IPFS_GATEWAYS[0];
  return `${gateway}${cid}`;
};

/**
 * Get all gateway URLs for a CID
 * @param {string} cid - IPFS CID
 * @returns {string[]} Array of gateway URLs
 */
export const getAllGatewayUrls = (cid) => {
  if (!cid) return [];
  return IPFS_GATEWAYS.map(gateway => `${gateway}${cid}`);
};

/**
 * Get IPFS URL (ipfs:// protocol)
 * @param {string} cid - IPFS CID
 * @returns {string} IPFS URL
 */
export const getIPFSUrl = (cid) => {
  if (!cid) return '';
  return `ipfs://${cid}`;
};

/**
 * Extract CID from IPFS URL
 * @param {string} url - IPFS URL (ipfs:// or gateway URL)
 * @returns {string|null} CID or null
 */
export const extractCID = (url) => {
  if (!url) return null;
  
  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    return url.substring(7);
  }
  
  // Handle gateway URLs
  for (const gateway of IPFS_GATEWAYS) {
    if (url.startsWith(gateway)) {
      return url.substring(gateway.length);
    }
  }
  
  // Check if it's just a CID
  const cidRegex = /^[a-zA-Z0-9]{46,59}$/;
  if (cidRegex.test(url)) {
    return url;
  }
  
  return null;
};

/**
 * Validate CID format
 * @param {string} cid - CID to validate
 * @returns {boolean} True if valid CID
 */
export const isValidCID = (cid) => {
  if (!cid) return false;
  
  // CIDv0: Qm... (46 chars)
  const cidv0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
  
  // CIDv1: Various formats (46-59 chars)
  const cidv1Regex = /^[a-zA-Z0-9]{46,59}$/;
  
  return cidv0Regex.test(cid) || cidv1Regex.test(cid);
};

/**
 * Get file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Human readable size
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Create a signed IPFS URL with expiry (for private content)
 * @param {string} cid - IPFS CID
 * @param {number} expiresIn - Expiry in seconds
 * @param {string} secret - Secret key for signing
 * @returns {Promise<string>} Signed URL
 */
export const createSignedUrl = async (cid, expiresIn = 3600, secret = '') => {
  // This would typically be done on a backend server
  // For client-side, you'd need a signing service
  const timestamp = Math.floor(Date.now() / 1000) + expiresIn;
  const signature = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${cid}:${timestamp}:${secret}`)
  );
  
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `/api/ipfs/${cid}?expires=${timestamp}&sig=${signatureHex}`;
};

// ==================== Batch Operations ====================

/**
 * Upload multiple items to IPFS in parallel
 * @param {Array<Object>} items - Array of {data, options}
 * @returns {Promise<Array<Object>>} Array of results
 */
export const batchUploadToIPFS = async (items) => {
  const uploads = items.map(item => 
    uploadToIPFS(item.data, item.options)
  );
  
  const results = await Promise.allSettled(uploads);
  
  return results.map((result, index) => ({
    index: index,
    success: result.status === 'fulfilled',
    result: result.status === 'fulfilled' ? result.value : null,
    error: result.status === 'rejected' ? result.reason.message : null
  }));
};

// ==================== Cache Management ====================

// Simple in-memory cache
const cache = new Map();

/**
 * Get from IPFS with caching
 * @param {string} cid - IPFS CID
 * @param {Object} options - Options (cacheTime in ms)
 * @returns {Promise<any>} Retrieved data
 */
export const getFromIPFSCached = async (cid, options = {}) => {
  const cacheKey = `ipfs:${cid}`;
  const cacheTime = options.cacheTime || 60000; // 1 minute default
  
  // Check cache
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < cacheTime) {
      return cached.data;
    }
  }
  
  // Fetch from IPFS
  const data = await getFromIPFS(cid, options);
  
  // Store in cache
  cache.set(cacheKey, {
    data: data,
    timestamp: Date.now()
  });
  
  return data;
};

/**
 * Clear IPFS cache
 * @param {string} cid - Specific CID to clear (optional)
 */
export const clearIPFSCache = (cid = null) => {
  if (cid) {
    const cacheKey = `ipfs:${cid}`;
    cache.delete(cacheKey);
  } else {
    cache.clear();
  }
};

// ==================== Export Default ====================

export default {
  // Core operations
  uploadToIPFS,
  getFromIPFS,
  pinToIPFS,
  unpinFromIPFS,
  isPinned,
  
  // DID specific
  uploadDIDDocument,
  getDIDDocument,
  
  // Credential specific
  uploadCredential,
  getCredential,
  
  // File operations
  uploadFile,
  uploadMultipleFiles,
  
  // Utilities
  getGatewayUrl,
  getAllGatewayUrls,
  getIPFSUrl,
  extractCID,
  isValidCID,
  formatFileSize,
  createSignedUrl,
  
  // Batch operations
  batchUploadToIPFS,
  
  // Cache
  getFromIPFSCached,
  clearIPFSCache,
  
  // Client
  getIPFSClient
};
