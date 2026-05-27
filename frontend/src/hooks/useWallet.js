// frontend/src/hooks/useWallet.js
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';

// Contract ABIs and addresses
import DIDRegistryABI from '../contracts/DIDRegistry.json';
import ZKPVerifierABI from '../contracts/ZKPVerifier.json';
import CredentialNFTABI from '../contracts/CredentialNFT.json';

// Configuration
import {
  DID_REGISTRY_ADDRESS,
  ZKP_VERIFIER_ADDRESS,
  CREDENTIAL_NFT_ADDRESS,
  CHAIN_ID,
  CHAIN_NAME,
  CHAIN_RPC_URL,
  CHAIN_CURRENCY_SYMBOL
} from '../config/contracts';

/**
 * Custom hook for wallet management
 * @returns {Object} Wallet state and methods
 */
export const useWallet = () => {
  // ==================== State Variables ====================
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [balance, setBalance] = useState(null);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [error, setError] = useState(null);
  
  // Contract instances
  const [didRegistry, setDidRegistry] = useState(null);
  const [zkpVerifier, setZkpVerifier] = useState(null);
  const [credentialNFT, setCredentialNFT] = useState(null);
  
  // Network information
  const [networkName, setNetworkName] = useState('');
  const [networkExplorer, setNetworkExplorer] = useState('');
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // ==================== Helper Functions ====================

  /**
   * Get network name from chain ID
   */
  const getNetworkInfo = useCallback((chainIdHex) => {
    const id = parseInt(chainIdHex, 16);
    const networks = {
      1: { name: 'Ethereum Mainnet', explorer: 'https://etherscan.io', symbol: 'ETH' },
      5: { name: 'Goerli Testnet', explorer: 'https://goerli.etherscan.io', symbol: 'ETH' },
      11155111: { name: 'Sepolia Testnet', explorer: 'https://sepolia.etherscan.io', symbol: 'ETH' },
      31337: { name: 'Hardhat Local', explorer: '', symbol: 'ETH' },
      1337: { name: 'Ganache Local', explorer: '', symbol: 'ETH' },
    };
    
    const targetChainId = Number(CHAIN_ID);
    const network = networks[id] || { name: `Chain ID: ${id}`, explorer: '', symbol: 'ETH' };
    
    return {
      name: network.name,
      explorer: network.explorer,
      symbol: network.symbol,
      isCorrect: id === targetChainId,
      chainId: id
    };
  }, []);

  /**
   * Update network info
   */
  const updateNetworkInfo = useCallback(async (providerInstance) => {
    try {
      const network = await providerInstance.getNetwork();
      const chainIdHex = `0x${network.chainId.toString(16)}`;
      const info = getNetworkInfo(chainIdHex);
      
      setChainId(network.chainId);
      setNetworkName(info.name);
      setNetworkExplorer(info.explorer);
      setIsCorrectNetwork(info.isCorrect);
      
      return info;
    } catch (err) {
      console.error('Error getting network info:', err);
      return null;
    }
  }, [getNetworkInfo]);

  /**
   * Get account balance
   */
  const getBalance = useCallback(async (signerInstance, address) => {
    try {
      const balanceWei = await signerInstance.provider.getBalance(address);
      const balanceEth = ethers.utils.formatEther(balanceWei);
      const formattedBalance = parseFloat(balanceEth).toFixed(4);
      setBalance(formattedBalance);
      return formattedBalance;
    } catch (err) {
      console.error('Error getting balance:', err);
      setBalance(null);
      return null;
    }
  }, []);

  /**
   * Initialize contract instances
   */
  const initContracts = useCallback(async (signerInstance) => {
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
  }, []);

  /**
   * Connect to wallet
   */
  const connectWallet = useCallback(async () => {
    // Check if MetaMask is installed
    if (!window.ethereum) {
      setError('MetaMask not detected. Please install MetaMask extension.');
      return false;
    }
    
    setIsConnecting(true);
    setError(null);
    setIsLoading(true);
    
    try {
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
      const networkInfo = await updateNetworkInfo(web3Provider);
      
      if (!networkInfo.isCorrect) {
        setError(`Please switch to ${CHAIN_NAME} network`);
        setIsConnecting(false);
        setIsLoading(false);
        return false;
      }
      
      // Get balance
      await getBalance(web3Signer, currentAccount);
      
      // Initialize contracts
      await initContracts(web3Signer);
      
      setIsConnected(true);
      setIsInitialized(true);
      
      // Setup event listeners
      setupEventListeners();
      
      return true;
      
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
      setIsConnected(false);
      return false;
    } finally {
      setIsConnecting(false);
      setIsLoading(false);
    }
  }, [updateNetworkInfo, getBalance, initContracts]);

  /**
   * Disconnect wallet
   */
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setChainId(null);
    setIsConnected(false);
    setIsCorrectNetwork(false);
    setBalance(null);
    setProvider(null);
    setSigner(null);
    setDidRegistry(null);
    setZkpVerifier(null);
    setCredentialNFT(null);
    setError(null);
    setIsInitialized(false);
    setNetworkName('');
    setNetworkExplorer('');
    
    removeEventListeners();
    
    return true;
  }, []);

  /**
   * Switch to correct network
   */
  const switchNetwork = useCallback(async () => {
    if (!window.ethereum) return false;
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${Number(CHAIN_ID).toString(16)}` }]
      });
      return true;
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
              blockExplorerUrls: [CHAIN_EXPLORER_URL || `http://localhost:8545`]
            }]
          });
          return true;
        } catch (addError) {
          console.error('Error adding network:', addError);
          setError('Failed to add network. Please add it manually.');
          return false;
        }
      } else {
        console.error('Error switching network:', switchError);
        setError('Failed to switch network. Please switch manually.');
        return false;
      }
    }
  }, []);

  /**
   * Format address for display
   */
  const formatAddress = useCallback((address) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }, []);

  /**
   * Copy address to clipboard
   */
  const copyAddress = useCallback(async () => {
    if (account) {
      try {
        await navigator.clipboard.writeText(account);
        return true;
      } catch (err) {
        console.error('Error copying address:', err);
        return false;
      }
    }
    return false;
  }, [account]);

  /**
   * Refresh balance
   */
  const refreshBalance = useCallback(async () => {
    if (signer && account) {
      return await getBalance(signer, account);
    }
    return null;
  }, [signer, account, getBalance]);

  // ==================== Event Listeners ====================

  /**
   * Handle account change
   */
  const handleAccountsChanged = useCallback(async (accounts) => {
    if (accounts.length === 0) {
      // User disconnected
      disconnectWallet();
    } else if (accounts[0] !== account) {
      // Account changed
      const newAccount = accounts[0];
      setAccount(newAccount);
      
      if (provider && signer) {
        await getBalance(signer, newAccount);
        
        // Re-initialize contracts with new account
        await initContracts(signer);
      }
    }
  }, [account, provider, signer, getBalance, initContracts, disconnectWallet]);

  /**
   * Handle chain change
   */
  const handleChainChanged = useCallback(async (chainIdHex) => {
    // Reload page on network change (recommended by MetaMask)
    window.location.reload();
  }, []);

  /**
   * Setup event listeners
   */
  const setupEventListeners = useCallback(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
    }
  }, [handleAccountsChanged, handleChainChanged]);

  /**
   * Remove event listeners
   */
  const removeEventListeners = useCallback(() => {
    if (window.ethereum) {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    }
  }, [handleAccountsChanged, handleChainChanged]);

  /**
   * Check if wallet is already connected (on page load)
   */
  const checkExistingConnection = useCallback(async () => {
    if (!window.ethereum) return false;
    
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts'
      });
      
      if (accounts.length > 0) {
        await connectWallet();
        return true;
      }
    } catch (err) {
      console.error('Error checking existing connection:', err);
    }
    
    return false;
  }, [connectWallet]);

  // ==================== Memoized Values ====================

  const walletInfo = useMemo(() => ({
    account,
    chainId,
    isConnected,
    isCorrectNetwork,
    balance,
    networkName,
    networkExplorer,
    formattedAddress: formatAddress(account)
  }), [account, chainId, isConnected, isCorrectNetwork, balance, networkName, networkExplorer, formatAddress]);

  const contracts = useMemo(() => ({
    didRegistry,
    zkpVerifier,
    credentialNFT
  }), [didRegistry, zkpVerifier, credentialNFT]);

  // ==================== Effects ====================

  // Check for existing connection on mount
  useEffect(() => {
    checkExistingConnection();
    
    // Cleanup on unmount
    return () => {
      removeEventListeners();
    };
  }, [checkExistingConnection, removeEventListeners]);

  // ==================== Return ====================

  return {
    // State
    account,
    chainId,
    isConnected,
    isConnecting,
    isCorrectNetwork,
    isInitialized,
    isLoading,
    balance,
    networkName,
    networkExplorer,
    error,
    
    // Contracts
    contracts,
    didRegistry,
    zkpVerifier,
    credentialNFT,
    
    // Methods
    connectWallet,
    disconnectWallet,
    switchNetwork,
    formatAddress,
    copyAddress,
    refreshBalance,
    
    // Info
    walletInfo,
    
    // Utils
    getBalance,
    updateNetworkInfo
  };
};

export default useWallet;
