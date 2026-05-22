// frontend/src/components/ConnectWallet.jsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import PropTypes from 'prop-types';

// Contract ABIs (import from your compiled contracts)
import DIDRegistryABI from '../contracts/DIDRegistry.json';
import ZKPVerifierABI from '../contracts/ZKPVerifier.json';
import CredentialNFTABI from '../contracts/CredentialNFT.json';

// Contract addresses (from deployment)
import {
  DID_REGISTRY_ADDRESS,
  ZKP_VERIFIER_ADDRESS,
  CREDENTIAL_NFT_ADDRESS,
  CHAIN_ID,
  CHAIN_NAME,
  CHAIN_RPC_URL,
  CHAIN_CURRENCY_SYMBOL,
  CHAIN_EXPLORER_URL
} from '../config/contracts';

const ConnectWallet = ({ onConnect, onDisconnect, children }) => {
  // ==================== State Variables ====================
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [balance, setBalance] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  
  // Contract instances
  const [didRegistry, setDidRegistry] = useState(null);
  const [zkpVerifier, setZkpVerifier] = useState(null);
  const [credentialNFT, setCredentialNFT] = useState(null);
  
  // Network info
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(true);
  const [networkName, setNetworkName] = useState('');

  // ==================== Helper Functions ====================

  /**
   * Get network name from chain ID
   */
  const getNetworkName = (chainIdHex) => {
    const id = parseInt(chainIdHex, 16);
    const networks = {
      1: 'Ethereum Mainnet',
      5: 'Goerli Testnet',
      11155111: 'Sepolia Testnet',
      31337: 'Hardhat Local',
      1337: 'Ganache Local',
      [CHAIN_ID]: CHAIN_NAME
    };
    return networks[id] || `Chain ID: ${id}`;
  };

  /**
   * Check if connected to correct network
   */
  const checkNetwork = async (providerInstance) => {
    try {
      const network = await providerInstance.getNetwork();
      const currentChainId = Number(network.chainId);
      const targetChainId = Number(CHAIN_ID);
      
      setIsCorrectNetwork(currentChainId === targetChainId);
      setChainId(currentChainId);
      setNetworkName(getNetworkName(`0x${currentChainId.toString(16)}`));
      
      return currentChainId === targetChainId;
    } catch (err) {
      console.error('Error checking network:', err);
      return false;
    }
  };

  /**
   * Get account balance
   */
  const getBalance = async (signerInstance, address) => {
    try {
      const balanceWei = await signerInstance.provider.getBalance(address);
      const balanceEth = ethers.utils.formatEther(balanceWei);
      setBalance(parseFloat(balanceEth).toFixed(4));
    } catch (err) {
      console.error('Error getting balance:', err);
      setBalance(null);
    }
  };

  /**
   * Initialize contract instances
   */
  const initContracts = async (signerInstance) => {
    try {
      const didRegistryInstance = new ethers.Contract(
        DID_REGISTRY_ADDRESS,
        DIDRegistryABI.abi,
        signerInstance
      );
      
      const zkpVerifierInstance = new ethers.Contract(
        ZKP_VERIFIER_ADDRESS,
        ZKPVerifierABI.abi,
        signerInstance
      );
      
      const credentialNFTInstance = new ethers.Contract(
        CREDENTIAL_NFT_ADDRESS,
        CredentialNFTABI.abi,
        signerInstance
      );
      
      setDidRegistry(didRegistryInstance);
      setZkpVerifier(zkpVerifierInstance);
      setCredentialNFT(credentialNFTInstance);
      
      return {
        didRegistry: didRegistryInstance,
        zkpVerifier: zkpVerifierInstance,
        credentialNFT: credentialNFTInstance
      };
    } catch (err) {
      console.error('Error initializing contracts:', err);
      setError('Failed to initialize contract connections');
      return null;
    }
  };

  /**
   * Handle account change
   */
  const handleAccountsChanged = async (accounts) => {
    if (accounts.length === 0) {
      // User disconnected
      handleDisconnect();
    } else if (accounts[0] !== account) {
      // Account changed
      const newAccount = accounts[0];
      setAccount(newAccount);
      
      if (provider && signer) {
        await getBalance(signer, newAccount);
        
        // Call onConnect callback with new account info
        if (onConnect) {
          onConnect({
            account: newAccount,
            chainId,
            provider,
            signer,
            contracts: { didRegistry, zkpVerifier, credentialNFT }
          });
        }
      }
    }
  };

  /**
   * Handle chain change
   */
  const handleChainChanged = async (chainIdHex) => {
    // Reload page on network change (recommended by MetaMask)
    window.location.reload();
  };

  /**
   * Connect to wallet
   */
  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      // Check if MetaMask is installed
      if (!window.ethereum) {
        throw new Error('MetaMask not detected. Please install MetaMask extension.');
      }
      
      // Request account access
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      if (accounts.length === 0) {
        throw new Error('No accounts found. Please unlock MetaMask.');
      }
      
      // Setup provider and signer
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      const web3Signer = web3Provider.getSigner();
      const currentAccount = accounts[0];
      
      setProvider(web3Provider);
      setSigner(web3Signer);
      setAccount(currentAccount);
      
      // Check network
      const isCorrect = await checkNetwork(web3Provider);
      if (!isCorrect) {
        setError(`Please switch to ${CHAIN_NAME} network`);
        setIsConnecting(false);
        return;
      }
      
      // Get balance
      await getBalance(web3Signer, currentAccount);
      
      // Initialize contracts
      const contracts = await initContracts(web3Signer);
      
      setIsConnected(true);
      
      // Call onConnect callback
      if (onConnect) {
        onConnect({
          account: currentAccount,
          chainId,
          provider: web3Provider,
          signer: web3Signer,
          contracts
        });
      }
      
      // Setup event listeners
      setupEventListeners();
      
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Setup MetaMask event listeners
   */
  const setupEventListeners = () => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }
  };

  /**
   * Remove event listeners
   */
  const removeEventListeners = () => {
    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    }
  };

  /**
   * Disconnect wallet
   */
  const handleDisconnect = () => {
    setAccount(null);
    setChainId(null);
    setIsConnected(false);
    setBalance(null);
    setProvider(null);
    setSigner(null);
    setDidRegistry(null);
    setZkpVerifier(null);
    setCredentialNFT(null);
    setError(null);
    setIsCorrectNetwork(true);
    
    removeEventListeners();
    
    if (onDisconnect) {
      onDisconnect();
    }
  };

  /**
   * Switch to correct network
   */
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(CHAIN_ID).toString(16)}` }]
      });
    } catch (switchError) {
      // Chain not added, add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${Number(CHAIN_ID).toString(16)}`,
              chainName: CHAIN_NAME,
              nativeCurrency: {
                name: CHAIN_CURRENCY_SYMBOL,
                symbol: CHAIN_CURRENCY_SYMBOL,
                decimals: 18
              },
              rpcUrls: [CHAIN_RPC_URL],
              blockExplorerUrls: [CHAIN_EXPLORER_URL]
            }]
          });
        } catch (addError) {
          console.error('Error adding network:', addError);
          setError('Failed to add network. Please add it manually.');
        }
      } else {
        console.error('Error switching network:', switchError);
        setError('Failed to switch network. Please switch manually.');
      }
    }
  };

  /**
   * Format address for display
   */
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  /**
   * Copy address to clipboard
   */
  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      // You could add a toast notification here
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      removeEventListeners();
    };
  }, []);

  // ==================== Render ====================
  
  return (
    <div className="connect-wallet-container">
      {!isConnected ? (
        <div className="wallet-connect-section">
          <div className="wallet-info">
            <h3>Connect Your Wallet</h3>
            <p>Connect your wallet to interact with the DID Protocol</p>
          </div>
          
          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
              {!isCorrectNetwork && (
                <button onClick={switchNetwork} className="switch-network-btn">
                  Switch to {CHAIN_NAME}
                </button>
              )}
            </div>
          )}
          
          <button 
            onClick={connectWallet} 
            disabled={isConnecting}
            className="connect-btn"
          >
            {isConnecting ? (
              <span className="loading-spinner">🔄 Connecting...</span>
            ) : (
              <>
                <img src="/metamask-icon.svg" alt="MetaMask" className="wallet-icon" />
                Connect MetaMask
              </>
            )}
          </button>
          
          <div className="network-info">
            <span className="network-label">Required Network:</span>
            <span className="network-value">{CHAIN_NAME}</span>
          </div>
        </div>
      ) : (
        <div className="wallet-connected-section">
          <div className="wallet-status">
            <div className="status-indicator connected"></div>
            <span className="status-text">Connected</span>
          </div>
          
          <div className="account-info">
            <div className="account-details">
              <div className="account-address" onClick={copyAddress}>
                <span className="address-label">Account:</span>
                <span className="address-value" title={account}>
                  {formatAddress(account)}
                </span>
                <button className="copy-btn" onClick={copyAddress}>
                  📋
                </button>
              </div>
              
              {balance && (
                <div className="account-balance">
                  <span className="balance-label">Balance:</span>
                  <span className="balance-value">
                    {balance} {CHAIN_CURRENCY_SYMBOL}
                  </span>
                </div>
              )}
              
              <div className="network-badge">
                <span className="network-badge-label">Network:</span>
                <span className="network-badge-value">{networkName}</span>
              </div>
            </div>
          </div>
          
          {children && (
            <div className="wallet-children">
              {children}
            </div>
          )}
          
          <button onClick={handleDisconnect} className="disconnect-btn">
            Disconnect
          </button>
        </div>
      )}
      
      <style jsx>{`
        .connect-wallet-container {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
        }
        
        .wallet-connect-section {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 2rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 1rem;
          color: white;
          text-align: center;
        }
        
        .wallet-info h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.5rem;
        }
        
        .wallet-info p {
          margin: 0 0 1.5rem 0;
          opacity: 0.9;
        }
        
        .connect-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: white;
          color: #667eea;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .connect-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .connect-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        
        .wallet-icon {
          width: 24px;
          height: 24px;
        }
        
        .error-message {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(255,0,0,0.2);
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          font-size: 0.875rem;
          flex-wrap: wrap;
          justify-content: center;
        }
        
        .switch-network-btn {
          background: white;
          color: #667eea;
          border: none;
          padding: 0.25rem 0.75rem;
          border-radius: 0.25rem;
          cursor: pointer;
          font-size: 0.75rem;
          font-weight: 600;
        }
        
        .network-info {
          margin-top: 1rem;
          font-size: 0.75rem;
          opacity: 0.8;
        }
        
        .network-label {
          margin-right: 0.25rem;
        }
        
        /* Connected state styles */
        .wallet-connected-section {
          background: #1a1a2e;
          border-radius: 1rem;
          padding: 1rem;
          border: 1px solid #2d2d4e;
        }
        
        .wallet-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #2d2d4e;
        }
        
        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        
        .status-indicator.connected {
          background: #4caf50;
          box-shadow: 0 0 8px #4caf50;
        }
        
        .status-text {
          font-size: 0.875rem;
          color: #a0a0b0;
        }
        
        .account-info {
          margin-bottom: 1rem;
        }
        
        .account-details {
          background: #0d0d1a;
          border-radius: 0.5rem;
          padding: 0.75rem;
        }
        
        .account-address {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.25rem 0;
        }
        
        .address-label, .balance-label, .network-badge-label {
          font-size: 0.75rem;
          color: #a0a0b0;
        }
        
        .address-value, .balance-value, .network-badge-value {
          font-size: 0.875rem;
          font-weight: 500;
          color: white;
        }
        
        .copy-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.875rem;
          padding: 0.125rem 0.25rem;
          opacity: 0.6;
          transition: opacity 0.2s;
        }
        
        .copy-btn:hover {
          opacity: 1;
        }
        
        .account-balance {
          margin-top: 0.25rem;
        }
        
        .network-badge {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #2d2d4e;
        }
        
        .wallet-children {
          margin: 1rem 0;
        }
        
        .disconnect-btn {
          width: 100%;
          padding: 0.5rem;
          background: rgba(255,69,58,0.2);
          color: #ff453a;
          border: 1px solid rgba(255,69,58,0.3);
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        
        .disconnect-btn:hover {
          background: rgba(255,69,58,0.3);
        }
        
        .loading-spinner {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
      `}</style>
    </div>
  );
};

// PropTypes for type checking
ConnectWallet.propTypes = {
  onConnect: PropTypes.func,
  onDisconnect: PropTypes.func,
  children: PropTypes.node
};

// Default props
ConnectWallet.defaultProps = {
  onConnect: null,
  onDisconnect: null,
  children: null
};

export default ConnectWallet;
