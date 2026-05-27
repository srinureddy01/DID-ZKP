// frontend/src/App.jsx
import React from 'react';
import { useWallet } from './hooks/useWallet';
import Dashboard from './components/Dashboard';

function App() {
  const {
    isConnected,
    isConnecting,
    account,
    contracts,
    connectWallet,
    disconnectWallet,
    error
  } = useWallet();

  if (!isConnected) {
    return (
      <div className="app">
        <button onClick={connectWallet} disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <Dashboard
      signer={contracts.signer}
      didRegistry={contracts.didRegistry}
      zkpVerifier={contracts.zkpVerifier}
      credentialNFT={contracts.credentialNFT}
      account={account}
    />
  );
}
