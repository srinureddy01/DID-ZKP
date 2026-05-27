// frontend/src/hooks/useContract.js
import { useState, useCallback, useEffect } from 'react';
import { ethers } from 'ethers';

/**
 * Custom hook for contract interactions
 * @param {Object} signer - Ethers signer instance
 * @param {Object} contractInstance - Contract instance
 * @param {Object} options - Additional options
 * @returns {Object} Contract interaction methods and states
 */
export const useContract = (signer, contractInstance, options = {}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [transactionPending, setTransactionPending] = useState(false);
  const [transactionHash, setTransactionHash] = useState(null);

  /**
   * Execute a contract transaction
   * @param {Function} contractMethod - Contract method to call
   * @param {Array} args - Method arguments
   * @param {Object} txOptions - Transaction options (gas, value, etc.)
   * @returns {Object} Transaction result
   */
  const executeTransaction = useCallback(async (contractMethod, args = [], txOptions = {}) => {
    if (!contractInstance) {
      setError('Contract not initialized');
      return null;
    }
    
    setLoading(true);
    setError(null);
    setTransactionPending(true);
    setTransactionHash(null);
    
    try {
      // Estimate gas if not provided
      let gasOptions = { ...txOptions };
      if (!gasOptions.gasLimit) {
        try {
          const estimatedGas = await contractMethod.estimateGas(...args);
          gasOptions.gasLimit = estimatedGas.mul(120).div(100); // Add 20% buffer
        } catch (estimateErr) {
          console.warn('Gas estimation failed, using default:', estimateErr);
        }
      }
      
      // Send transaction
      const tx = await contractMethod(...args, gasOptions);
      setTransactionHash(tx.hash);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      setTransactionPending(false);
      setLoading(false);
      
      return {
        success: true,
        transaction: tx,
        receipt: receipt,
        hash: tx.hash
      };
      
    } catch (err) {
      console.error('Transaction error:', err);
      setError(err.message || 'Transaction failed');
      setTransactionPending(false);
      setLoading(false);
      return {
        success: false,
        error: err.message,
        hash: null
      };
    }
  }, [contractInstance]);

  /**
   * Call a contract view function (read-only)
   * @param {Function} contractMethod - Contract method to call
   * @param {Array} args - Method arguments
   * @returns {any} Result from contract call
   */
  const callViewFunction = useCallback(async (contractMethod, args = []) => {
    if (!contractInstance) {
      setError('Contract not initialized');
      return null;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const result = await contractMethod(...args);
      setLoading(false);
      return result;
    } catch (err) {
      console.error('Contract call error:', err);
      setError(err.message || 'Contract call failed');
      setLoading(false);
      return null;
    }
  }, [contractInstance]);

  /**
   * Listen for contract events
   * @param {string} eventName - Name of the event
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  const listenToEvent = useCallback((eventName, callback) => {
    if (!contractInstance) return () => {};
    
    const eventFilter = contractInstance.filters[eventName]();
    const listener = (...args) => callback(...args);
    
    contractInstance.on(eventFilter, listener);
    
    // Return unsubscribe function
    return () => {
      contractInstance.off(eventFilter, listener);
    };
  }, [contractInstance]);

  /**
   * Query past events
   * @param {string} eventName - Name of the event
   * @param {Object} filter - Event filter (fromBlock, toBlock)
   * @returns {Array} Array of events
   */
  const queryPastEvents = useCallback(async (eventName, filter = {}) => {
    if (!contractInstance) return [];
    
    const fromBlock = filter.fromBlock || 0;
    const toBlock = filter.toBlock || 'latest';
    
    try {
      const events = await contractInstance.queryFilter(
        contractInstance.filters[eventName](),
        fromBlock,
        toBlock
      );
      return events;
    } catch (err) {
      console.error(`Error querying ${eventName} events:`, err);
      return [];
    }
  }, [contractInstance]);

  // Reset states
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setTransactionPending(false);
    setTransactionHash(null);
  }, []);

  return {
    // States
    loading,
    error,
    transactionPending,
    transactionHash,
    
    // Methods
    executeTransaction,
    callViewFunction,
    listenToEvent,
    queryPastEvents,
    reset,
    
    // Utils
    isReady: !!contractInstance && !!signer
  };
};

/**
 * Specific hook for DID Registry interactions
 */
export const useDIDRegistry = (signer, contractInstance) => {
  const baseContract = useContract(signer, contractInstance);
  
  const registerDID = useCallback(async (did, documentHash) => {
    return baseContract.executeTransaction(
      contractInstance.registerDID,
      [did, documentHash]
    );
  }, [baseContract, contractInstance]);
  
  const updateDIDDocument = useCallback(async (did, newDocumentHash) => {
    return baseContract.executeTransaction(
      contractInstance.updateDIDDocument,
      [did, newDocumentHash]
    );
  }, [baseContract, contractInstance]);
  
  const revokeDID = useCallback(async (did) => {
    return baseContract.executeTransaction(
      contractInstance.revokeDID,
      [did]
    );
  }, [baseContract, contractInstance]);
  
  const reactivateDID = useCallback(async (did) => {
    return baseContract.executeTransaction(
      contractInstance.reactivateDID,
      [did]
    );
  }, [baseContract, contractInstance]);
  
  const resolveDID = useCallback(async (did) => {
    return baseContract.callViewFunction(
      contractInstance.resolveDID,
      [did]
    );
  }, [baseContract, contractInstance]);
  
  const getDIDByOwner = useCallback(async (owner) => {
    return baseContract.callViewFunction(
      contractInstance.getDIDByOwner,
      [owner]
    );
  }, [baseContract, contractInstance]);
  
  const isDIDActive = useCallback(async (did) => {
    return baseContract.callViewFunction(
      contractInstance.isDIDActive,
      [did]
    );
  }, [baseContract, contractInstance]);
  
  return {
    ...baseContract,
    registerDID,
    updateDIDDocument,
    revokeDID,
    reactivateDID,
    resolveDID,
    getDIDByOwner,
    isDIDActive
  };
};

/**
 * Specific hook for ZKP Verifier interactions
 */
export const useZKPVerifier = (signer, contractInstance) => {
  const baseContract = useContract(signer, contractInstance);
  
  const verifyAgeProof = useCallback(async (did, minAge, nullifier, a, b, c, publicSignals) => {
    return baseContract.executeTransaction(
      contractInstance.verifyAgeProof,
      [did, minAge, nullifier, a, b, c, publicSignals]
    );
  }, [baseContract, contractInstance]);
  
  const verifyProof = useCallback(async (did, proofType, nullifier, a, b, c, publicSignals) => {
    return baseContract.executeTransaction(
      contractInstance.verifyProof,
      [did, proofType, nullifier, a, b, c, publicSignals]
    );
  }, [baseContract, contractInstance]);
  
  const isNullifierUsed = useCallback(async (nullifier) => {
    return baseContract.callViewFunction(
      contractInstance.isNullifierUsed,
      [nullifier]
    );
  }, [baseContract, contractInstance]);
  
  const getTotalVerifications = useCallback(async () => {
    return baseContract.callViewFunction(
      contractInstance.totalVerifications
    );
  }, [baseContract, contractInstance]);
  
  return {
    ...baseContract,
    verifyAgeProof,
    verifyProof,
    isNullifierUsed,
    getTotalVerifications
  };
};

/**
 * Specific hook for Credential NFT interactions
 */
export const useCredentialNFT = (signer, contractInstance) => {
  const baseContract = useContract(signer, contractInstance);
  
  const issueCredential = useCallback(async (holderDID, credentialType, expiresAt, credentialHash, metadataURI, zkpCompatible) => {
    return baseContract.executeTransaction(
      contractInstance.issueCredential,
      [holderDID, credentialType, expiresAt, credentialHash, metadataURI, zkpCompatible]
    );
  }, [baseContract, contractInstance]);
  
  const revokeCredential = useCallback(async (tokenId, reason) => {
    return baseContract.executeTransaction(
      contractInstance.revokeCredential,
      [tokenId, reason]
    );
  }, [baseContract, contractInstance]);
  
  const getCredential = useCallback(async (tokenId) => {
    return baseContract.callViewFunction(
      contractInstance.getCredential,
      [tokenId]
    );
  }, [baseContract, contractInstance]);
  
  const isCredentialValid = useCallback(async (tokenId) => {
    return baseContract.callViewFunction(
      contractInstance.isCredentialValid,
      [tokenId]
    );
  }, [baseContract, contractInstance]);
  
  const getCredentialsByDID = useCallback(async (did) => {
    return baseContract.callViewFunction(
      contractInstance.getCredentialsByDID,
      [did]
    );
  }, [baseContract, contractInstance]);
  
  const balanceOf = useCallback(async (address) => {
    return baseContract.callViewFunction(
      contractInstance.balanceOf,
      [address]
    );
  }, [baseContract, contractInstance]);
  
  return {
    ...baseContract,
    issueCredential,
    revokeCredential,
    getCredential,
    isCredentialValid,
    getCredentialsByDID,
    balanceOf
  };
};

export default useContract;
