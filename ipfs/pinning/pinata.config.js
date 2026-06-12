// ipfs/pinning/pinata.config.js
// Pinata configuration helper

const config = {
  // Development configuration
  development: {
    apiKey: process.env.PINATA_API_KEY_DEV || '',
    apiSecret: process.env.PINATA_API_SECRET_DEV || '',
    gatewayURL: process.env.PINATA_GATEWAY_URL_DEV || 'https://gateway.pinata.cloud',
    baseURL: 'https://api.pinata.cloud',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
  
  // Production configuration
  production: {
    apiKey: process.env.PINATA_API_KEY_PROD || '',
    apiSecret: process.env.PINATA_API_SECRET_PROD || '',
    gatewayURL: process.env.PINATA_GATEWAY_URL_PROD || 'https://gateway.pinata.cloud',
    baseURL: 'https://api.pinata.cloud',
    timeout: 30000,
    retryAttempts: 5,
    retryDelay: 2000,
  },
  
  // Staging configuration
  staging: {
    apiKey: process.env.PINATA_API_KEY_STAGING || '',
    apiSecret: process.env.PINATA_API_SECRET_STAGING || '',
    gatewayURL: process.env.PINATA_GATEWAY_URL_STAGING || 'https://gateway.pinata.cloud',
    baseURL: 'https://api.pinata.cloud',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 1000,
  },
};

function getConfig(env = process.env.NODE_ENV || 'development') {
  return config[env] || config.development;
}

function validateConfig(configObj) {
  if (!configObj.apiKey || !configObj.apiSecret) {
    throw new Error('Invalid Pinata configuration: API key and secret are required');
  }
  return true;
}

function createClientFromConfig(env) {
  const cfg = getConfig(env);
  validateConfig(cfg);
  
  const { createPinataClient } = require('./pinata');
  return createPinataClient(cfg.apiKey, cfg.apiSecret, {
    gatewayURL: cfg.gatewayURL,
    baseURL: cfg.baseURL,
    timeout: cfg.timeout,
    retryAttempts: cfg.retryAttempts,
    retryDelay: cfg.retryDelay,
  });
}

module.exports = {
  config,
  getConfig,
  validateConfig,
  createClientFromConfig,
};
