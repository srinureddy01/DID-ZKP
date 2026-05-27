Key Features of useWallet.js:

1.Complete Wallet Management - Connect, disconnect, network switching

2.Auto-Connection - Checks for existing connections on page load

3.Event Listeners - Handles account/network changes automatically

4.Contract Initialization - Automatically initializes all three contracts

5.Error Handling - Comprehensive error messages and recovery

6.Network Validation - Ensures correct network, prompts to switch

7.Balance Display - Gets and formats account balance

8.Memoized Values - Optimized re-renders with useMemo

9.Cleanup - Proper event listener cleanup on unmount

Key Features of useContract.js:

1.Transaction Management - Execute transactions with gas estimation

2.View Functions - Call read-only contract methods

3.Event Handling - Listen to and query past events

4.Specific Hooks - DIDRegistry, ZKPVerifier, CredentialNFT hooks

5.Loading States - Track transaction and loading status

6.Error Handling - Comprehensive error catching
