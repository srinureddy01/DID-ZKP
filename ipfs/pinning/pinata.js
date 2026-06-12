// ipfs/pinning/pinata.js
// Pinata IPFS Pinning Service Client for DID Protocols

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== Configuration ====================

class PinataClient {
  constructor(apiKey, apiSecret, options = {}) {
    if (!apiKey || !apiSecret) {
      throw new Error('Pinata API key and secret are required');
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseURL = options.baseURL || 'https://api.pinata.cloud';
    this.gatewayURL = options.gatewayURL || 'https://gateway.pinata.cloud';
    this.timeout = options.timeout || 30000;
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 1000;

    // Create axios instance with authentication
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'pinata_api_key': this.apiKey,
        'pinata_secret_api_key': this.apiSecret,
        'Content-Type': 'application/json',
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  // ==================== Error Handling ====================

  handleError(error) {
    if (error.response) {
      // Server responded with error status
      const status = error.response.status;
      const message = error.response.data?.error || error.response.statusText;
      
      if (status === 401) {
        throw new Error('Pinata authentication failed: Invalid API key or secret');
      } else if (status === 429) {
        throw new Error('Rate limit exceeded. Please try again later');
      } else if (status >= 500) {
        throw new Error(`Pinata server error (${status}): ${message}`);
      } else {
        throw new Error(`Pinata API error (${status}): ${message}`);
      }
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Network error: Unable to reach Pinata service');
    } else {
      // Something else happened
      throw new Error(`Pinata client error: ${error.message}`);
    }
  }

  async retryOperation(operation, context = '') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts) {
          console.warn(`Retry ${attempt}/${this.retryAttempts} for ${context}: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  // ==================== Pinning Operations ====================

  /**
   * Pin a file from local filesystem
   * @param {string} filePath - Path to local file
   * @param {Object} options - Pin options (pinataMetadata, pinataOptions)
   * @returns {Promise<Object>} Pin result
   */
  async pinFileFromFS(filePath, options = {}) {
    const fileStream = fs.createReadStream(filePath);
    const filename = path.basename(filePath);
    return this.pinFileFromStream(fileStream, filename, options);
  }

  /**
   * Pin a file from buffer/stream
   * @param {Buffer|Stream} fileData - File data as buffer or stream
   * @param {string} filename - Name of the file
   * @param {Object} options - Pin options
   * @returns {Promise<Object>} Pin result
   */
  async pinFileFromStream(fileData, filename, options = {}) {
    return this.retryOperation(async () => {
      const formData = new FormData();
      
      // Append file
      formData.append('file', fileData, { filename });
      
      // Append metadata if provided
      if (options.pinataMetadata) {
        formData.append('pinataMetadata', JSON.stringify(options.pinataMetadata));
      }
      
      // Append options if provided
      if (options.pinataOptions) {
        formData.append('pinataOptions', JSON.stringify(options.pinataOptions));
      }
      
      const response = await this.client.post('/pinning/pinFileToIPFS', formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });
      
      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        pinSize: response.data.PinSize,
        timestamp: response.data.Timestamp,
        gatewayURL: this.getGatewayURL(response.data.IpfsHash),
      };
    }, `pinFile ${filename}`);
  }

  /**
   * Pin JSON data to IPFS
   * @param {Object} jsonData - JSON object to pin
   * @param {Object} options - Pin options
   * @returns {Promise<Object>} Pin result
   */
  async pinJSON(jsonData, options = {}) {
    return this.retryOperation(async () => {
      const requestBody = {
        pinataContent: jsonData,
      };
      
      if (options.pinataMetadata) {
        requestBody.pinataMetadata = options.pinataMetadata;
      }
      
      if (options.pinataOptions) {
        requestBody.pinataOptions = options.pinataOptions;
      }
      
      const response = await this.client.post('/pinning/pinJSONToIPFS', requestBody);
      
      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        pinSize: response.data.PinSize,
        timestamp: response.data.Timestamp,
        gatewayURL: this.getGatewayURL(response.data.IpfsHash),
      };
    }, 'pinJSON');
  }

  /**
   * Pin by CID (hash already uploaded to IPFS)
   * @param {string} hash - IPFS hash/CID to pin
   * @param {Object} options - Pin options
   * @returns {Promise<Object>} Pin result
   */
  async pinByHash(hash, options = {}) {
    return this.retryOperation(async () => {
      const requestBody = {
        hashToPin: hash,
      };
      
      if (options.pinataMetadata) {
        requestBody.pinataMetadata = options.pinataMetadata;
      }
      
      if (options.pinataOptions) {
        requestBody.pinataOptions = options.pinataOptions;
      }
      
      const response = await this.client.post('/pinning/pinByHash', requestBody);
      
      return {
        success: true,
        ipfsHash: response.data.ipfsHash,
        pinSize: response.data.pinSize,
        timestamp: response.data.timestamp,
        gatewayURL: this.getGatewayURL(response.data.ipfsHash),
      };
    }, `pinByHash ${hash}`);
  }

  // ==================== Unpinning Operations ====================

  /**
   * Unpin a file by hash
   * @param {string} hash - IPFS hash to unpin
   * @returns {Promise<Object>} Unpin result
   */
  async unpin(hash) {
    return this.retryOperation(async () => {
      await this.client.delete(`/pinning/unpin/${hash}`);
      
      return {
        success: true,
        ipfsHash: hash,
        message: 'Successfully unpinned',
        timestamp: new Date().toISOString(),
      };
    }, `unpin ${hash}`);
  }

  // ==================== Query Operations ====================

  /**
   * Get list of pinned items
   * @param {Object} filters - Query filters
   * @returns {Promise<Object>} List of pins
   */
  async getPinnedItems(filters = {}) {
    return this.retryOperation(async () => {
      const queryParams = new URLSearchParams();
      
      if (filters.hashContains) queryParams.append('hashContains', filters.hashContains);
      if (filters.pinStart) queryParams.append('pinStart', filters.pinStart);
      if (filters.pinEnd) queryParams.append('pinEnd', filters.pinEnd);
      if (filters.unpinStart) queryParams.append('unpinStart', filters.unpinStart);
      if (filters.unpinEnd) queryParams.append('unpinEnd', filters.unpinEnd);
      if (filters.pinSizeMin) queryParams.append('pinSizeMin', filters.pinSizeMin);
      if (filters.pinSizeMax) queryParams.append('pinSizeMax', filters.pinSizeMax);
      if (filters.status) queryParams.append('status', filters.status);
      if (filters.pageLimit) queryParams.append('pageLimit', filters.pageLimit);
      if (filters.pageOffset) queryParams.append('pageOffset', filters.pageOffset);
      
      const response = await this.client.get(`/data/pinList?${queryParams.toString()}`);
      
      return {
        success: true,
        count: response.data.count,
        rows: response.data.rows,
      };
    }, 'getPinnedItems');
  }

  /**
   * Get pin by hash
   * @param {string} hash - IPFS hash
   * @returns {Promise<Object>} Pin details
   */
  async getPinByHash(hash) {
    const pins = await this.getPinnedItems({ hashContains: hash, pageLimit: 1 });
    
    if (pins.rows && pins.rows.length > 0) {
      return {
        success: true,
        pin: pins.rows[0],
      };
    }
    
    return {
      success: false,
      message: 'Pin not found',
    };
  }

  /**
   * Check if hash is pinned
   * @param {string} hash - IPFS hash
   * @returns {Promise<boolean>} True if pinned
   */
  async isPinned(hash) {
    const result = await this.getPinByHash(hash);
    return result.success;
  }

  // ==================== User Operations ====================

  /**
   * Get user information
   * @returns {Promise<Object>} User data
   */
  async getUser() {
    return this.retryOperation(async () => {
      const response = await this.client.get('/data/testAuthentication');
      
      return {
        success: true,
        email: response.data.email,
        isCreator: response.data.isCreator,
        isParent: response.data.isParent,
        isVerified: response.data.isVerified,
        pinCount: response.data.pinCount,
        pinSizeTotal: response.data.pinSizeTotal,
        pinSizeUsed: response.data.pinSizeUsed,
      };
    }, 'getUser');
  }

  /**
   * Get user pin policy
   * @returns {Promise<Object>} Pin policy
   */
  async getUserPinPolicy() {
    return this.retryOperation(async () => {
      const response = await this.client.get('/psa/user/pinPolicy');
      
      return {
        success: true,
        pinPolicy: response.data,
      };
    }, 'getUserPinPolicy');
  }

  // ==================== Upload Operations ====================

  /**
   * Upload file without pinning (just upload to IPFS)
   * @param {Buffer|Stream} fileData - File data
   * @param {string} filename - File name
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(fileData, filename) {
    return this.retryOperation(async () => {
      const formData = new FormData();
      formData.append('file', fileData, { filename });
      
      const response = await this.client.post('/pinning/uploadFile', formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });
      
      return {
        success: true,
        ipfsHash: response.data.IpfsHash,
        gatewayURL: this.getGatewayURL(response.data.IpfsHash),
      };
    }, `uploadFile ${filename}`);
  }

  // ==================== Batch Operations ====================

  /**
   * Pin multiple files in batch
   * @param {Array} files - Array of {data, filename, options}
   * @returns {Promise<Array>} Batch results
   */
  async batchPinFiles(files) {
    const results = [];
    
    for (const file of files) {
      try {
        const result = await this.pinFileFromStream(file.data, file.filename, file.options);
        results.push({
          success: true,
          filename: file.filename,
          ...result,
        });
      } catch (error) {
        results.push({
          success: false,
          filename: file.filename,
          error: error.message,
        });
      }
    }
    
    return results;
  }

  /**
   * Pin multiple JSON objects in batch
   * @param {Array} items - Array of {data, options}
   * @returns {Promise<Array>} Batch results
   */
  async batchPinJSON(items) {
    const results = [];
    
    for (const item of items) {
      try {
        const result = await this.pinJSON(item.data, item.options);
        results.push({
          success: true,
          ...result,
        });
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
        });
      }
    }
    
    return results;
  }

  // ==================== Metadata Operations ====================

  /**
   * Update pin metadata
   * @param {string} hash - IPFS hash
   * @param {Object} metadata - New metadata
   * @returns {Promise<Object>} Update result
   */
  async updatePinMetadata(hash, metadata) {
    return this.retryOperation(async () => {
      await this.client.put(`/pinning/hashMetadata`, {
        ipfsPinHash: hash,
        name: metadata.name,
        keyvalues: metadata.keyvalues,
      });
      
      return {
        success: true,
        ipfsHash: hash,
        message: 'Metadata updated successfully',
        timestamp: new Date().toISOString(),
      };
    }, `updatePinMetadata ${hash}`);
  }

  // ==================== DID Document Utilities ====================

  /**
   * Pin a DID document to IPFS
   * @param {Object} didDocument - DID document object
   * @param {string} did - DID string
   * @returns {Promise<Object>} Pin result
   */
  async pinDIDDocument(didDocument, did) {
    const metadata = {
      name: `DID Document: ${did}`,
      keyvalues: {
        type: 'did-document',
        did: did,
        version: '1.0',
        timestamp: new Date().toISOString(),
      },
    };
    
    const options = {
      pinataMetadata: metadata,
      pinataOptions: {
        cidVersion: 1,
      },
    };
    
    const result = await this.pinJSON(didDocument, options);
    
    return {
      ...result,
      did: did,
      documentType: 'did-document',
    };
  }

  /**
   * Pin a credential to IPFS
   * @param {Object} credential - Verifiable credential
   * @param {string} holderDID - Holder's DID
   * @param {string} credentialType - Type of credential
   * @returns {Promise<Object>} Pin result
   */
  async pinCredential(credential, holderDID, credentialType) {
    const metadata = {
      name: `Credential: ${credentialType}`,
      keyvalues: {
        type: 'verifiable-credential',
        holderDID: holderDID,
        credentialType: credentialType,
        timestamp: new Date().toISOString(),
      },
    };
    
    const options = {
      pinataMetadata: metadata,
      pinataOptions: {
        cidVersion: 1,
      },
    };
    
    const result = await this.pinJSON(credential, options);
    
    return {
      ...result,
      holderDID: holderDID,
      credentialType: credentialType,
      documentType: 'verifiable-credential',
    };
  }

  // ==================== Webhook Operations ====================

  /**
   * Create a webhook
   * @param {string} url - Webhook URL
   * @param {Array} events - Events to listen for
   * @returns {Promise<Object>} Webhook result
   */
  async createWebhook(url, events = ['pin', 'unpin']) {
    return this.retryOperation(async () => {
      const response = await this.client.post('/psa/webhooks', {
        url: url,
        events: events,
      });
      
      return {
        success: true,
        webhookId: response.data.id,
        url: response.data.url,
        events: response.data.events,
        timestamp: new Date().toISOString(),
      };
    }, 'createWebhook');
  }

  /**
   * Get webhooks list
   * @returns {Promise<Object>} List of webhooks
   */
  async getWebhooks() {
    return this.retryOperation(async () => {
      const response = await this.client.get('/psa/webhooks');
      
      return {
        success: true,
        webhooks: response.data,
        count: response.data.length,
      };
    }, 'getWebhooks');
  }

  /**
   * Delete a webhook
   * @param {string} webhookId - Webhook ID
   * @returns {Promise<Object>} Delete result
   */
  async deleteWebhook(webhookId) {
    return this.retryOperation(async () => {
      await this.client.delete(`/psa/webhooks/${webhookId}`);
      
      return {
        success: true,
        message: 'Webhook deleted successfully',
        timestamp: new Date().toISOString(),
      };
    }, 'deleteWebhook');
  }

  // ==================== Utility Methods ====================

  /**
   * Get gateway URL for a hash
   * @param {string} hash - IPFS hash
   * @returns {string} Gateway URL
   */
  getGatewayURL(hash) {
    return `${this.gatewayURL}/ipfs/${hash}`;
  }

  /**
   * Get multiple gateway URLs
   * @param {string} hash - IPFS hash
   * @returns {Array} Array of gateway URLs
   */
  getGatewayURLs(hash) {
    return [
      `https://ipfs.io/ipfs/${hash}`,
      `https://cloudflare-ipfs.com/ipfs/${hash}`,
      `${this.gatewayURL}/ipfs/${hash}`,
      `https://dweb.link/ipfs/${hash}`,
    ];
  }

  /**
   * Extract CID from IPFS URL
   * @param {string} url - IPFS URL
   * @returns {string|null} CID or null
   */
  extractCID(url) {
    const patterns = [
      /ipfs:\/\/([a-zA-Z0-9]+)/,
      /\/ipfs\/([a-zA-Z0-9]+)/,
      /ipfs\/([a-zA-Z0-9]+)/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }

  /**
   * Validate CID format
   * @param {string} cid - CID to validate
   * @returns {boolean} True if valid
   */
  isValidCID(cid) {
    const cidV0Pattern = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
    const cidV1Pattern = /^[a-zA-Z0-9]{46,59}$/;
    
    return cidV0Pattern.test(cid) || cidV1Pattern.test(cid);
  }

  /**
   * Generate file hash for verification
   * @param {Buffer} buffer - File buffer
   * @returns {string} SHA256 hash
   */
  generateFileHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // ==================== Health Check ====================

  /**
   * Test connection to Pinata
   * @returns {Promise<boolean>} True if connected
   */
  async testConnection() {
    try {
      const user = await this.getUser();
      return user.success;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get rate limit status
   * @returns {Promise<Object>} Rate limit info
   */
  async getRateLimit() {
    try {
      const response = await this.client.get('/data/rateLimit');
      return {
        success: true,
        limit: response.data.limit,
        remaining: response.data.remaining,
        reset: response.data.reset,
        resetTime: new Date(response.data.reset * 1000).toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get usage statistics
   * @returns {Promise<Object>} Usage stats
   */
  async getUsageStats() {
    try {
      const user = await this.getUser();
      const pins = await this.getPinnedItems({ pageLimit: 1 });
      
      return {
        success: true,
        totalPins: user.pinCount,
        totalSizeUsed: user.pinSizeUsed,
        totalSizeLimit: user.pinSizeTotal,
        usagePercentage: (user.pinSizeUsed / user.pinSizeTotal) * 100,
        estimatedCost: this.estimateCost(user.pinSizeUsed),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Estimate cost based on storage size
   * @param {number} bytes - Size in bytes
   * @returns {Object} Cost estimate
   */
  estimateCost(bytes) {
    const gb = bytes / (1024 * 1024 * 1024);
    const pricePerGB = 0.15; // Approximate Pinata pricing
    const monthlyCost = gb * pricePerGB;
    
    return {
      sizeGB: gb.toFixed(4),
      monthlyCostUSD: monthlyCost.toFixed(2),
      yearlyCostUSD: (monthlyCost * 12).toFixed(2),
    };
  }
}

// ==================== Factory Function ====================

/**
 * Create a new Pinata client instance
 * @param {string} apiKey - Pinata API key
 * @param {string} apiSecret - Pinata API secret
 * @param {Object} options - Additional options
 * @returns {PinataClient} Pinata client instance
 */
function createPinataClient(apiKey, apiSecret, options = {}) {
  return new PinataClient(apiKey, apiSecret, options);
}

/**
 * Create client from environment variables
 * @returns {PinataClient} Configured client
 */
function createClientFromEnv() {
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_API_SECRET;
  const gatewayURL = process.env.PINATA_GATEWAY_URL;
  
  if (!apiKey || !apiSecret) {
    throw new Error('PINATA_API_KEY and PINATA_API_SECRET environment variables are required');
  }
  
  return new PinataClient(apiKey, apiSecret, { gatewayURL });
}

// ==================== Export ====================

module.exports = {
  PinataClient,
  createPinataClient,
  createClientFromEnv,
};
