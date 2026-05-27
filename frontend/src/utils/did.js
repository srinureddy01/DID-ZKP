// frontend/src/utils/did.js
// DID (Decentralized Identity) management utilities

import { utils } from 'ethers';
import { uploadToIPFS, getFromIPFS, getGatewayUrl } from './ipfs';

// ==================== Constants ====================

// DID Method specification
const DID_METHOD = 'example';
const DID_CONTEXT = 'https://www.w3.org/ns/did/v1';
const DID_CONTEXT_SECURITY = 'https://w3id.org/security/suites/ed25519-2020/v1';

// JSON-LD contexts
const JSONLD_CONTEXTS = {
  did: DID_CONTEXT,
  security: DID_CONTEXT_SECURITY,
  credential: 'https://www.w3.org/2018/credentials/v1'
};

// DID Document schemas
const DID_DOCUMENT_SCHEMA = {
  type: 'object',
  required: ['@context', 'id'],
  properties: {
    '@context': { type: 'array' },
    id: { type: 'string' },
    controller: { type: 'string' },
    verificationMethod: { type: 'array' },
    authentication: { type: 'array' },
    assertionMethod: { type: 'array' },
    keyAgreement: { type: 'array' },
    capabilityInvocation: { type: 'array' },
    capabilityDelegation: { type: 'array' },
    service: { type: 'array' },
    alsoKnownAs: { type: 'array' },
    created: { type: 'string' },
    updated: { type: 'string' }
  }
};

// ==================== DID Formatting & Validation ====================

/**
 * Validate DID format
 * @param {string} did - DID string to validate
 * @returns {boolean} True if valid
 */
export const validateDIDFormat = (did) => {
  if (!did || typeof did !== 'string') return false;
  
  // DID format: did:method:identifier
  const didRegex = /^did:[a-z0-9]+:[a-zA-Z0-9_.-]+$/;
  return didRegex.test(did);
};

/**
 * Parse DID into components
 * @param {string} did - DID string
 * @returns {Object} DID components
 * @throws {Error} If DID format is invalid
 */
export const parseDID = (did) => {
  if (!validateDIDFormat(did)) {
    throw new Error(`Invalid DID format: ${did}`);
  }
  
  const parts = did.split(':');
  return {
    scheme: parts[0],      // 'did'
    method: parts[1],      // e.g., 'example', 'ethr'
    id: parts[2],          // unique identifier
    did: did,
    namespace: `${parts[0]}:${parts[1]}`
  };
};

/**
 * Generate DID from components
 * @param {string} method - DID method (default: 'example')
 * @param {string} identifier - Unique identifier
 * @returns {string} DID string
 */
export const generateDID = (method = DID_METHOD, identifier) => {
  if (!identifier) {
    throw new Error('Identifier is required to generate DID');
  }
  
  // Sanitize identifier (allow only alphanumeric, underscore, hyphen)
  const sanitizedId = identifier.replace(/[^a-zA-Z0-9_-]/g, '');
  return `did:${method}:${sanitizedId}`;
};

/**
 * Generate DID from Ethereum address
 * @param {string} address - Ethereum address
 * @param {string} method - DID method (default: 'ethr')
 * @returns {string} DID string
 */
export const generateEthDID = (address, method = 'ethr') => {
  const cleanAddress = address.toLowerCase().replace('0x', '');
  return `did:${method}:${cleanAddress}`;
};

/**
 * Generate random DID identifier
 * @param {number} length - Identifier length (default: 16)
 * @returns {string} Random identifier
 */
export const generateRandomDIDIdentifier = (length = 16) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ==================== DID Document Creation ====================

/**
 * Create verification method object
 * @param {Object} params - Verification method parameters
 * @returns {Object} Verification method
 */
export const createVerificationMethod = (params) => {
  const {
    did,
    publicKeyMultibase,
    type = 'Ed25519VerificationKey2020',
    id = '#keys-1',
    controller
  } = params;
  
  return {
    id: `${did}${id}`,
    type: type,
    controller: controller || did,
    publicKeyMultibase: publicKeyMultibase
  };
};

/**
 * Create service endpoint object
 * @param {Object} params - Service parameters
 * @returns {Object} Service object
 */
export const createService = (params) => {
  const {
    did,
    type,
    serviceEndpoint,
    id = '#service-1',
    description = ''
  } = params;
  
  const service = {
    id: `${did}${id}`,
    type: type,
    serviceEndpoint: serviceEndpoint
  };
  
  if (description) {
    service.description = description;
  }
  
  return service;
};

/**
 * Create DID document (JSON-LD format)
 * @param {Object} params - DID document parameters
 * @returns {Object} DID document
 */
export const createDIDDocument = (params) => {
  const {
    did,
    controller,
    publicKey,
    verificationMethods = [],
    authentication = [],
    assertionMethod = [],
    keyAgreement = [],
    services = [],
    alsoKnownAs = [],
    profile = {}
  } = params;
  
  const timestamp = new Date().toISOString();
  
  // Default verification method if not provided
  const methods = verificationMethods.length > 0 
    ? verificationMethods 
    : [createVerificationMethod({ did, publicKeyMultibase: publicKey })];
  
  const document = {
    '@context': [DID_CONTEXT, DID_CONTEXT_SECURITY],
    id: did,
    controller: controller || did,
    verificationMethod: methods,
    authentication: authentication.length > 0 ? authentication : [`${did}#keys-1`],
    assertionMethod: assertionMethod.length > 0 ? assertionMethod : [`${did}#keys-1`],
    created: timestamp,
    updated: timestamp
  };
  
  // Add optional fields
  if (keyAgreement.length > 0) {
    document.keyAgreement = keyAgreement;
  }
  
  if (services.length > 0) {
    document.service = services;
  }
  
  if (alsoKnownAs.length > 0) {
    document.alsoKnownAs = alsoKnownAs;
  }
  
  // Add profile if provided
  if (Object.keys(profile).length > 0) {
    document.profile = profile;
  }
  
  return document;
};

/**
 * Update DID document timestamp
 * @param {Object} document - DID document
 * @returns {Object} Updated document
 */
export const updateDIDDocumentTimestamp = (document) => {
  return {
    ...document,
    updated: new Date().toISOString()
  };
};

// ==================== DID Document Hashing ====================

/**
 * Hash DID document
 * @param {Object} document - DID document
 * @returns {Promise<string>} SHA256 hash (hex)
 */
export const hashDIDDocument = async (document) => {
  const jsonString = JSON.stringify(document);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

/**
 * Generate DID document metadata
 * @param {Object} document - DID document
 * @param {string} cid - IPFS CID
 * @returns {Object} Metadata
 */
export const generateDIDMetadata = (document, cid) => {
  return {
    did: document.id,
    cid: cid,
    version: '1.0',
    created: document.created,
    updated: document.updated,
    hash: null, // Would be populated after hashing
    size: JSON.stringify(document).length,
    gatewayUrls: cid ? getGatewayUrl(cid) : null
  };
};

// ==================== DID Storage (IPFS) ====================

/**
 * Store DID document on IPFS
 * @param {Object} document - DID document
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} IPFS upload result
 */
export const storeDIDDocument = async (document, options = {}) => {
  if (!validateDIDFormat(document.id)) {
    throw new Error(`Invalid DID in document: ${document.id}`);
  }
  
  const enrichedDocument = {
    ...document,
    metadata: {
      ...document.metadata,
      storedAt: new Date().toISOString(),
      schema: DID_CONTEXT,
      version: '1.0'
    }
  };
  
  const result = await uploadToIPFS(enrichedDocument, {
    path: `${document.id}/did.json`,
    metadata: {
      type: 'did-document',
      did: document.id
    },
    ...options
  });
  
  return result;
};

/**
 * Retrieve DID document from IPFS
 * @param {string} cid - IPFS CID
 * @returns {Promise<Object>} DID document
 */
export const retrieveDIDDocument = async (cid) => {
  const document = await getFromIPFS(cid);
  
  // Validate document structure
  if (!document['@context'] || !document.id) {
    console.warn('Retrieved document may not be a valid DID document');
  }
  
  return document;
};

// ==================== DID Resolution ====================

/**
 * Resolve DID to document (local resolution)
 * @param {string} did - DID to resolve
 * @param {Object} registry - DID Registry contract
 * @returns {Promise<Object>} Resolution result
 */
export const resolveDID = async (did, registry) => {
  if (!validateDIDFormat(did)) {
    throw new Error(`Invalid DID format: ${did}`);
  }
  
  try {
    // Get document hash from registry
    const documentHash = await registry.getDIDDocumentHash(did);
    
    if (!documentHash || documentHash === '') {
      return {
        success: false,
        did: did,
        error: 'DID document not found',
        document: null,
        metadata: null
      };
    }
    
    // Retrieve document from IPFS
    const document = await retrieveDIDDocument(documentHash);
    
    // Get metadata from registry
    const metadata = await registry.resolveDID(did);
    
    return {
      success: true,
      did: did,
      document: document,
      metadata: {
        owner: metadata.owner,
        created: metadata.created,
        updated: metadata.updated,
        isActive: metadata.isActive,
        documentHash: metadata.documentHash
      },
      cid: documentHash
    };
    
  } catch (error) {
    console.error(`Error resolving DID ${did}:`, error);
    return {
      success: false,
      did: did,
      error: error.message,
      document: null,
      metadata: null
    };
  }
};

/**
 * Resolve DID to document with caching
 * @param {string} did - DID to resolve
 * @param {Object} registry - DID Registry contract
 * @param {Object} cache - Cache object
 * @returns {Promise<Object>} Resolution result
 */
const resolutionCache = new Map();

export const resolveDIDWithCache = async (did, registry, options = {}) => {
  const cacheTime = options.cacheTime || 60000; // 1 minute
  const cacheKey = `did:${did}`;
  
  // Check cache
  if (resolutionCache.has(cacheKey)) {
    const cached = resolutionCache.get(cacheKey);
    if (Date.now() - cached.timestamp < cacheTime) {
      return cached.result;
    }
  }
  
  // Resolve
  const result = await resolveDID(did, registry);
  
  // Cache result
  resolutionCache.set(cacheKey, {
    result: result,
    timestamp: Date.now()
  });
  
  return result;
};

/**
 * Clear DID resolution cache
 * @param {string} did - Specific DID to clear (optional)
 */
export const clearDIDCache = (did = null) => {
  if (did) {
    resolutionCache.delete(`did:${did}`);
  } else {
    resolutionCache.clear();
  }
};

// ==================== DID Validation & Verification ====================

/**
 * Verify DID ownership
 * @param {string} did - DID to verify
 * @param {string} address - Ethereum address
 * @param {Object} registry - DID Registry contract
 * @returns {Promise<boolean>} True if owner matches
 */
export const verifyDIDOwnership = async (did, address, registry) => {
  try {
    const owner = await registry.getDIDOwner(did);
    return owner.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Error verifying DID ownership:', error);
    return false;
  }
};

/**
 * Check if DID is active
 * @param {string} did - DID to check
 * @param {Object} registry - DID Registry contract
 * @returns {Promise<boolean>} True if active
 */
export const isDIDActive = async (did, registry) => {
  try {
    return await registry.isDIDActive(did);
  } catch (error) {
    console.error('Error checking DID active status:', error);
    return false;
  }
};

/**
 * Get DID owner address
 * @param {string} did - DID to query
 * @param {Object} registry - DID Registry contract
 * @returns {Promise<string|null>} Owner address or null
 */
export const getDIDOwner = async (did, registry) => {
  try {
    return await registry.getDIDOwner(did);
  } catch (error) {
    console.error('Error getting DID owner:', error);
    return null;
  }
};

// ==================== DID Utility Functions ====================

/**
 * Format DID for display (truncated)
 * @param {string} did - DID string
 * @param {number} startChars - Characters to show at start
 * @param {number} endChars - Characters to show at end
 * @returns {string} Formatted DID
 */
export const formatDID = (did, startChars = 12, endChars = 6) => {
  if (!did) return '';
  if (did.length <= startChars + endChars) return did;
  
  const start = did.slice(0, startChars);
  const end = did.slice(-endChars);
  return `${start}...${end}`;
};

/**
 * Extract DID method from DID string
 * @param {string} did - DID string
 * @returns {string} DID method
 */
export const getDIDMethod = (did) => {
  const parsed = parseDID(did);
  return parsed.method;
};

/**
 * Extract DID identifier from DID string
 * @param {string} did - DID string
 * @returns {string} DID identifier
 */
export const getDIDIdentifier = (did) => {
  const parsed = parseDID(did);
  return parsed.id;
};

/**
 * Validate DID document structure
 * @param {Object} document - DID document to validate
 * @returns {Object} Validation result
 */
export const validateDIDDocument = (document) => {
  const errors = [];
  const warnings = [];
  
  // Check required fields
  if (!document['@context']) {
    errors.push('Missing @context');
  }
  
  if (!document.id) {
    errors.push('Missing id');
  } else if (!validateDIDFormat(document.id)) {
    errors.push(`Invalid DID format: ${document.id}`);
  }
  
  if (!document.verificationMethod || document.verificationMethod.length === 0) {
    warnings.push('No verification methods defined');
  }
  
  if (!document.authentication || document.authentication.length === 0) {
    warnings.push('No authentication methods defined');
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    document: document
  };
};

// ==================== DID Template Generation ====================

/**
 * Generate minimal DID document template
 * @param {string} did - DID string
 * @param {string} publicKey - Public key
 * @returns {Object} Minimal DID document
 */
export const generateMinimalDIDDocument = (did, publicKey) => {
  return createDIDDocument({
    did: did,
    publicKey: publicKey,
    authentication: [`${did}#keys-1`],
    assertionMethod: [`${did}#keys-1`]
  });
};

/**
 * Generate full DID document template with profile
 * @param {string} did - DID string
 * @param {string} publicKey - Public key
 * @param {Object} profile - Profile information
 * @returns {Object} Full DID document
 */
export const generateFullDIDDocument = (did, publicKey, profile = {}) => {
  return createDIDDocument({
    did: did,
    publicKey: publicKey,
    services: [
      createService({
        did: did,
        type: 'LinkedDomains',
        serviceEndpoint: profile.website || '',
        id: '#website'
      }),
      createService({
        did: did,
        type: 'IdentityHub',
        serviceEndpoint: 'https://hub.example.com',
        id: '#hub'
      })
    ],
    profile: {
      name: profile.name || '',
      description: profile.description || '',
      email: profile.email || '',
      avatar: profile.avatar || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });
};

// ==================== Export Default ====================

export default {
  // Formatting & Validation
  validateDIDFormat,
  parseDID,
  generateDID,
  generateEthDID,
  generateRandomDIDIdentifier,
  formatDID,
  getDIDMethod,
  getDIDIdentifier,
  
  // Document creation
  createDIDDocument,
  createVerificationMethod,
  createService,
  updateDIDDocumentTimestamp,
  generateMinimalDIDDocument,
  generateFullDIDDocument,
  
  // Document validation
  validateDIDDocument,
  hashDIDDocument,
  generateDIDMetadata,
  
  // Storage
  storeDIDDocument,
  retrieveDIDDocument,
  
  // Resolution
  resolveDID,
  resolveDIDWithCache,
  clearDIDCache,
  
  // Verification
  verifyDIDOwnership,
  isDIDActive,
  getDIDOwner,
  
  // Constants
  DID_METHOD,
  DID_CONTEXT,
  JSONLD_CONTEXTS,
  DID_DOCUMENT_SCHEMA
};
