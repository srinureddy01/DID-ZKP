// contracts/verifiers/ZKPVerifier.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "../registry/DIDRegistry.sol";

/**
 * @title ZKPVerifier
 * @dev Verifies Zero-Knowledge Proofs on-chain
 * @notice Supports age verification, identity proofs, and custom credential verification
 * @dev Uses groth16 verification protocol (compatible with snarkjs)
 */
contract ZKPVerifier {
    // ==================== Structs ====================

    /**
     * @dev Proof verification request
     * @param proverDID DID of the person proving something
     * @param verifierDID DID of the party verifying (optional)
     * @param proofType Type of proof (age, identity, credential)
     * @param timestamp When proof was submitted
     * @param isValid Whether proof passed verification
     * @param publicInputsHash Hash of public inputs for replay protection
     */
    struct VerificationRequest {
        string proverDID;
        string verifierDID;
        ProofType proofType;
        uint256 timestamp;
        bool isValid;
        bytes32 publicInputsHash;
    }

    /**
     * @dev Supported proof types
     */
    enum ProofType {
        AGE_VERIFICATION,
        IDENTITY_VERIFICATION,
        CREDENTIAL_VERIFICATION,
        CUSTOM
    }

    /**
     * @dev Verification key structure for different proof types
     * @param vkHash Hash of the verification key
     * @param isActive Whether this key is still valid
     * @param proofType Which proof type this key handles
     * @param createdAt When key was registered
     */
    struct VerificationKey {
        bytes32 vkHash;
        bool isActive;
        ProofType proofType;
        uint256 createdAt;
    }

    /**
     * @dev Age proof specific public inputs
     * @param minAge Minimum age requirement (e.g., 18)
     * @param userAgeHash Hash of the user's actual age (hidden)
     * @param isValidAge Whether age meets requirement
     */
    struct AgeProofInputs {
        uint256 minAge;
        bytes32 userAgeHash;
        bool isValidAge;
    }

    // ==================== State Variables ====================

    // DID Registry contract reference
    DIDRegistry public didRegistry;

    // Verification keys for different proof types
    mapping(ProofType => VerificationKey) public verificationKeys;

    // Track used nullifiers to prevent replay attacks
    mapping(bytes32 => bool) public usedNullifiers;

    // Track verification requests
    mapping(bytes32 => VerificationRequest) public verificationRequests;

    // User -> proof type -> last verification time
    mapping(address => mapping(ProofType => uint256)) public lastVerificationTime;

    // Cooldown period between verifications (default: 1 minute)
    uint256 public verificationCooldown = 60;

    // Counter for total verifications
    uint256 public totalVerifications;

    // ==================== Events ====================

    /**
     * @dev Emitted when a proof is verified successfully
     */
    event ProofVerified(
        address indexed prover,
        string indexed proverDID,
        ProofType indexed proofType,
        bytes32 requestId,
        uint256 timestamp,
        bytes32 nullifier
    );

    /**
     * @dev Emitted when a proof verification fails
     */
    event ProofVerificationFailed(
        address indexed prover,
        string indexed proverDID,
        ProofType indexed proofType,
        string reason,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a verification key is registered
     */
    event VerificationKeyRegistered(
        ProofType indexed proofType,
        bytes32 vkHash,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a verification key is updated
     */
    event VerificationKeyUpdated(
        ProofType indexed proofType,
        bytes32 oldVkHash,
        bytes32 newVkHash,
        uint256 timestamp
    );

    /**
     * @dev Emitted when verification cooldown is updated
     */
    event VerificationCooldownUpdated(
        uint256 oldCooldown,
        uint256 newCooldown
    );

    // ==================== Modifiers ====================

    /**
     * @dev Checks if DID is registered and active
     */
    modifier onlyActiveDID(string memory did) {
        require(didRegistry.isDIDActive(did), "DID not active or not registered");
        _;
    }

    /**
     * @dev Prevents replay attacks using nullifiers
     */
    modifier notReplayed(bytes32 nullifier) {
        require(!usedNullifiers[nullifier], "Proof already used (replay attack)");
        _;
    }

    /**
     * @dev Enforces cooldown period between verifications
     */
    modifier respectCooldown(address user, ProofType proofType) {
        require(
            block.timestamp >= lastVerificationTime[user][proofType] + verificationCooldown,
            "Verification cooldown active"
        );
        _;
    }

    // ==================== Constructor ====================

    constructor(address _didRegistry) {
        require(_didRegistry != address(0), "Invalid DID Registry address");
        didRegistry = DIDRegistry(_didRegistry);
    }

    // ==================== Core Verification Functions ====================

    /**
     * @dev Verify age proof (most common use case)
     * @param did Prover's DID
     * @param minAge Minimum age requirement (e.g., 18)
     * @param nullifier Unique value to prevent replay
     * @param proof The ZK proof (a, b, c)
     * @param publicSignals Public inputs from the proof
     */
    function verifyAgeProof(
        string calldata did,
        uint256 minAge,
        bytes32 nullifier,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] calldata publicSignals
    ) 
        external 
        onlyActiveDID(did)
        notReplayed(nullifier)
        respectCooldown(msg.sender, ProofType.AGE_VERIFICATION)
    {
        // Verify the proof using groth16
        bool isValid = _verifyGroth16Proof(
            verificationKeys[ProofType.AGE_VERIFICATION].vkHash,
            a, b, c, publicSignals
        );
        
        if (!isValid) {
            emit ProofVerificationFailed(
                msg.sender, 
                did, 
                ProofType.AGE_VERIFICATION,
                "Invalid proof",
                block.timestamp
            );
            revert("Age proof verification failed");
        }

        // Extract age validity from public signals
        // Assuming publicSignals[0] = 1 if age >= minAge, else 0
        bool isAgeValid = (publicSignals.length > 0 && publicSignals[0] == 1);
        
        require(isAgeValid, "Age requirement not met");

        // Mark nullifier as used
        usedNullifiers[nullifier] = true;
        
        // Update last verification time
        lastVerificationTime[msg.sender][ProofType.AGE_VERIFICATION] = block.timestamp;
        
        // Store verification request
        bytes32 requestId = keccak256(
            abi.encodePacked(did, nullifier, block.timestamp)
        );
        
        verificationRequests[requestId] = VerificationRequest({
            proverDID: did,
            verifierDID: "",
            proofType: ProofType.AGE_VERIFICATION,
            timestamp: block.timestamp,
            isValid: true,
            publicInputsHash: keccak256(abi.encodePacked(publicSignals))
        });
        
        totalVerifications++;
        
        emit ProofVerified(
            msg.sender,
            did,
            ProofType.AGE_VERIFICATION,
            requestId,
            block.timestamp,
            nullifier
        );
    }

    /**
     * @dev Generic proof verification for any ZKP
     * @param did Prover's DID
     * @param proofType Type of proof being verified
     * @param nullifier Unique value to prevent replay
     * @param a G1 point a
     * @param b G2 point b
     * @param c G1 point c
     * @param publicSignals Public inputs
     */
    function verifyProof(
        string calldata did,
        ProofType proofType,
        bytes32 nullifier,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] calldata publicSignals
    ) 
        external 
        onlyActiveDID(did)
        notReplayed(nullifier)
        respectCooldown(msg.sender, proofType)
    {
        // Check if verification key exists and is active
        require(
            verificationKeys[proofType].isActive,
            "Verification key not registered for this proof type"
        );
        
        // Verify the proof
        bool isValid = _verifyGroth16Proof(
            verificationKeys[proofType].vkHash,
            a, b, c, publicSignals
        );
        
        require(isValid, "Proof verification failed");
        
        // Mark nullifier as used
        usedNullifiers[nullifier] = true;
        
        // Update last verification time
        lastVerificationTime[msg.sender][proofType] = block.timestamp;
        
        // Store verification request
        bytes32 requestId = keccak256(
            abi.encodePacked(did, proofType, nullifier, block.timestamp)
        );
        
        verificationRequests[requestId] = VerificationRequest({
            proverDID: did,
            verifierDID: "",
            proofType: proofType,
            timestamp: block.timestamp,
            isValid: true,
            publicInputsHash: keccak256(abi.encodePacked(publicSignals))
        });
        
        totalVerifications++;
        
        emit ProofVerified(
            msg.sender,
            did,
            proofType,
            requestId,
            block.timestamp,
            nullifier
        );
    }

    /**
     * @dev Batch verify multiple proofs in one transaction (gas efficient)
     * @param did Prover's DID
     * @param proofTypes Array of proof types
     * @param nullifiers Array of nullifiers
     * @param proofs Array of proofs (a, b, c)
     * @param allPublicSignals Array of public signals arrays
     */
    function batchVerifyProofs(
        string calldata did,
        ProofType[] calldata proofTypes,
        bytes32[] calldata nullifiers,
        uint256[2][] calldata a,
        uint256[2][2][] calldata b,
        uint256[2][] calldata c,
        uint256[][] calldata allPublicSignals
    ) 
        external 
        onlyActiveDID(did)
    {
        require(
            proofTypes.length == nullifiers.length &&
            proofTypes.length == a.length &&
            proofTypes.length == b.length &&
            proofTypes.length == c.length &&
            proofTypes.length == allPublicSignals.length,
            "Array length mismatch"
        );
        
        uint256 successCount = 0;
        
        for (uint256 i = 0; i < proofTypes.length; i++) {
            // Skip if nullifier already used
            if (usedNullifiers[nullifiers[i]]) {
                continue;
            }
            
            // Check cooldown for each proof type
            if (lastVerificationTime[msg.sender][proofTypes[i]] + verificationCooldown > block.timestamp) {
                continue;
            }
            
            // Verify proof
            if (_verifyGroth16Proof(
                verificationKeys[proofTypes[i]].vkHash,
                a[i], b[i], c[i], allPublicSignals[i]
            )) {
                usedNullifiers[nullifiers[i]] = true;
                lastVerificationTime[msg.sender][proofTypes[i]] = block.timestamp;
                successCount++;
            }
        }
        
        require(successCount > 0, "No valid proofs in batch");
        
        emit ProofVerified(
            msg.sender,
            did,
            ProofType.CUSTOM,
            bytes32(successCount),
            block.timestamp,
            bytes32(successCount)
        );
    }

    // ==================== Internal Functions ====================

    /**
     * @dev Internal groth16 proof verification
     * @notice This is a placeholder - actual implementation uses precompiled contracts
     * @param vkHash Hash of verification key
     * @param a G1 point a
     * @param b G2 point b
     * @param c G1 point c
     * @param publicSignals Public inputs
     * @return bool Whether proof is valid
     */
    function _verifyGroth16Proof(
        bytes32 vkHash,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory publicSignals
    ) internal view returns (bool) {
        // In production, you would use the precompiled contract at address 0x07
        // or 0x08 for alt_bn128 curve pairing checks
        
        // This is a simplified version - actual implementation would be:
        // (bool success, bool isValid) = address(0x07).staticcall(encodedProof);
        
        // For now, we assume the proof is valid if it passes basic checks
        // In production, integrate with snarkjs verifier.sol generated code
        
        // Basic sanity checks
        require(a[0] < 21888242871839275222246405745257275088548364400416034343698204186575808495617, "Invalid a[0]");
        require(a[1] < 21888242871839275222246405745257275088548364400416034343698204186575808495617, "Invalid a[1]");
        require(c[0] < 21888242871839275222246405745257275088548364400416034343698204186575808495617, "Invalid c[0]");
        require(c[1] < 21888242871839275222246405745257275088548364400416034343698204186575808495617, "Invalid c[1]");
        
        // In production, replace with actual pairing check
        // This is a temporary implementation for testing
        return vkHash != bytes32(0);
    }

    // ==================== Admin Functions ====================

    /**
     * @dev Register verification key for a proof type
     * @param proofType Type of proof
     * @param vkHash Hash of verification key
     */
    function registerVerificationKey(
        ProofType proofType,
        bytes32 vkHash
    ) 
        external 
    {
        require(vkHash != bytes32(0), "Invalid verification key hash");
        require(!verificationKeys[proofType].isActive, "Verification key already registered");
        
        verificationKeys[proofType] = VerificationKey({
            vkHash: vkHash,
            isActive: true,
            proofType: proofType,
            createdAt: block.timestamp
        });
        
        emit VerificationKeyRegistered(proofType, vkHash, block.timestamp);
    }

    /**
     * @dev Update verification key
     * @param proofType Type of proof
     * @param newVkHash New verification key hash
     */
    function updateVerificationKey(
        ProofType proofType,
        bytes32 newVkHash
    ) 
        external 
    {
        require(verificationKeys[proofType].isActive, "Verification key not active");
        require(newVkHash != bytes32(0), "Invalid verification key hash");
        
        bytes32 oldVkHash = verificationKeys[proofType].vkHash;
        
        verificationKeys[proofType].vkHash = newVkHash;
        verificationKeys[proofType].createdAt = block.timestamp;
        
        emit VerificationKeyUpdated(proofType, oldVkHash, newVkHash, block.timestamp);
    }

    /**
     * @dev Set verification cooldown period
     * @param newCooldown New cooldown in seconds
     */
    function setVerificationCooldown(uint256 newCooldown) external {
        require(newCooldown <= 3600, "Cooldown too high (max 1 hour)");
        
        uint256 oldCooldown = verificationCooldown;
        verificationCooldown = newCooldown;
        
        emit VerificationCooldownUpdated(oldCooldown, newCooldown);
    }

    // ==================== View Functions ====================

    /**
     * @dev Check if a nullifier has been used
     * @param nullifier Nullifier to check
     * @return bool Whether nullifier is used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    /**
     * @dev Get verification request by ID
     * @param requestId Request ID
     * @return VerificationRequest struct
     */
    function getVerificationRequest(bytes32 requestId) 
        external 
        view 
        returns (VerificationRequest memory) 
    {
        return verificationRequests[requestId];
    }

    /**
     * @dev Get time until next verification is allowed
     * @param user Address of user
     * @param proofType Proof type
     * @return uint256 Seconds until cooldown ends (0 if ready)
     */
    function getCooldownRemaining(address user, ProofType proofType) 
        external 
        view 
        returns (uint256) 
    {
        uint256 lastTime = lastVerificationTime[user][proofType];
        if (lastTime == 0) return 0;
        
        uint256 timePassed = block.timestamp - lastTime;
        if (timePassed >= verificationCooldown) return 0;
        
        return verificationCooldown - timePassed;
    }

    /**
     * @dev Get verification key info
     * @param proofType Proof type
     * @return VerificationKey struct
     */
    function getVerificationKey(ProofType proofType) 
        external 
        view 
        returns (VerificationKey memory) 
    {
        return verificationKeys[proofType];
    }
}
