// contracts/credentials/CredentialNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "../registry/DIDRegistry.sol";
import "../verifiers/ZKPVerifier.sol";

/**
 * @title CredentialNFT
 * @dev Issues verifiable credentials as Soulbound NFTs (non-transferable by default)
 * @notice Credentials are linked to DIDs and can be verified with ZKPs
 */
contract CredentialNFT is ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl {
    using Counters for Counters.Counter;
    using Strings for uint256;

    // ==================== Roles ====================
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // ==================== Structs ====================

    /**
     * @dev Credential metadata structure
     * @param credentialType Type of credential (e.g., "AgeVerification", "KYC", "Education")
     * @param issuerDID DID of the credential issuer
     * @param holderDID DID of the credential holder
     * @param issuedAt Timestamp when credential was issued
     * @param expiresAt Timestamp when credential expires (0 = never)
     * @param isRevoked Whether credential has been revoked
     * @param credentialHash Hash of credential data (off-chain storage)
     * @param zkpCompatible Whether this credential supports ZKP verification
     */
    struct Credential {
        string credentialType;
        string issuerDID;
        string holderDID;
        uint256 issuedAt;
        uint256 expiresAt;
        bool isRevoked;
        bytes32 credentialHash;
        bool zkpCompatible;
    }

    /**
     * @dev Credential issuance request
     * @param applicant Address requesting credential
     * @param applicantDID DID of applicant
     * @param credentialType Type requested
     * @param timestamp Request timestamp
     * @param isApproved Whether approved
     */
    struct IssuanceRequest {
        address applicant;
        string applicantDID;
        string credentialType;
        uint256 timestamp;
        bool isApproved;
    }

    // ==================== State Variables ====================

    // Counters
    Counters.Counter private _tokenIdCounter;
    Counters.Counter private _requestIdCounter;

    // Contract references
    DIDRegistry public didRegistry;
    ZKPVerifier public zkpVerifier;

    // Token ID to Credential mapping
    mapping(uint256 => Credential) public credentials;

    // DID to token IDs owned (supports multiple credentials per DID)
    mapping(string => uint256[]) private didToTokens;

    // Request ID to IssuanceRequest
    mapping(uint256 => IssuanceRequest) public issuanceRequests;

    // Token ID to nullifier (for ZKP verification)
    mapping(uint256 => bytes32) public tokenNullifiers;

    // Credential type to list of token IDs
    mapping(string => uint256[]) private credentialTypeToTokens;

    // Token ID to off-chain metadata URI
    mapping(uint256 => string) private _credentialMetadata;

    // Whether tokens are soulbound (non-transferable)
    bool public soulbound = true;

    // Base URI for credential metadata
    string private _baseURIString;

    // ==================== Events ====================

    event CredentialIssued(
        uint256 indexed tokenId,
        string indexed holderDID,
        string indexed credentialType,
        string issuerDID,
        uint256 issuedAt,
        uint256 expiresAt
    );

    event CredentialRevoked(
        uint256 indexed tokenId,
        string indexed holderDID,
        string indexed credentialType,
        address revoker,
        uint256 timestamp
    );

    event CredentialRenewed(
        uint256 indexed tokenId,
        string indexed holderDID,
        uint256 newExpiry,
        uint256 timestamp
    );

    event IssuanceRequested(
        uint256 indexed requestId,
        address indexed applicant,
        string applicantDID,
        string credentialType,
        uint256 timestamp
    );

    event IssuanceApproved(
        uint256 indexed requestId,
        uint256 indexed tokenId,
        address indexed issuer,
        uint256 timestamp
    );

    event SoulboundUpdated(bool indexed oldValue, bool indexed newValue);

    // ==================== Modifiers ====================

    /**
     * @dev Checks if credential is valid (not revoked and not expired)
     */
    modifier onlyValidCredential(uint256 tokenId) {
        require(_exists(tokenId), "Credential does not exist");
        Credential memory cred = credentials[tokenId];
        require(!cred.isRevoked, "Credential is revoked");
        require(cred.expiresAt == 0 || cred.expiresAt > block.timestamp, "Credential expired");
        _;
    }

    /**
     * @dev Checks if caller is the credential holder (via DID)
     */
    modifier onlyHolder(uint256 tokenId) {
        Credential memory cred = credentials[tokenId];
        address holderAddress = didRegistry.getDIDOwner(cred.holderDID);
        require(msg.sender == holderAddress, "Not credential holder");
        _;
    }

    /**
     * @dev Checks if caller has valid DID
     */
    modifier onlyValidDID(string memory did) {
        require(didRegistry.isDIDActive(did), "DID not active");
        _;
    }

    // ==================== Constructor ====================

    constructor(
        string memory name,
        string memory symbol,
        address _didRegistry,
        address _zkpVerifier
    ) ERC721(name, symbol) {
        require(_didRegistry != address(0), "Invalid DID Registry address");
        require(_zkpVerifier != address(0), "Invalid ZKP Verifier address");
        
        didRegistry = DIDRegistry(_didRegistry);
        zkpVerifier = ZKPVerifier(_zkpVerifier);
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ROLE, msg.sender);
        _grantRole(REVOKER_ROLE, msg.sender);
        _grantRole(VERIFIER_ROLE, msg.sender);
    }

    // ==================== Issuance Functions ====================

    /**
     * @dev Issue a new credential (only issuer role)
     * @param holderDID DID of credential holder
     * @param credentialType Type of credential
     * @param expiresAt Expiration timestamp (0 = never)
     * @param credentialHash Hash of credential data
     * @param metadataURI URI for credential metadata
     * @param zkpCompatible Whether credential supports ZKP
     */
    function issueCredential(
        string memory holderDID,
        string memory credentialType,
        uint256 expiresAt,
        bytes32 credentialHash,
        string memory metadataURI,
        bool zkpCompatible
    ) 
        external 
        onlyRole(ISSUER_ROLE)
        onlyValidDID(holderDID)
        returns (uint256)
    {
        require(bytes(credentialType).length > 0, "Credential type required");
        require(credentialHash != bytes32(0), "Credential hash required");
        
        // Get holder address from DID
        address holderAddress = didRegistry.getDIDOwner(holderDID);
        require(holderAddress != address(0), "Invalid holder DID");
        
        // Get issuer DID from caller's address
        string memory issuerDID = didRegistry.getDIDByOwner(msg.sender);
        require(bytes(issuerDID).length > 0, "Issuer has no DID");
        
        // Mint NFT
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        
        _safeMint(holderAddress, tokenId);
        
        // Set token URI
        _setTokenURI(tokenId, metadataURI);
        
        // Store credential data
        credentials[tokenId] = Credential({
            credentialType: credentialType,
            issuerDID: issuerDID,
            holderDID: holderDID,
            issuedAt: block.timestamp,
            expiresAt: expiresAt,
            isRevoked: false,
            credentialHash: credentialHash,
            zkpCompatible: zkpCompatible
        });
        
        // Store credential metadata
        _credentialMetadata[tokenId] = metadataURI;
        
        // Add to mappings
        didToTokens[holderDID].push(tokenId);
        credentialTypeToTokens[credentialType].push(tokenId);
        
        // Generate nullifier for ZKP
        bytes32 nullifier = keccak256(abi.encodePacked(tokenId, holderDID, block.timestamp));
        tokenNullifiers[tokenId] = nullifier;
        
        emit CredentialIssued(
            tokenId,
            holderDID,
            credentialType,
            issuerDID,
            block.timestamp,
            expiresAt
        );
        
        return tokenId;
    }

    /**
     * @dev Request credential issuance (user-initiated)
     * @param credentialType Type of credential requested
     * @param metadataURI Supporting metadata for request
     */
    function requestIssuance(
        string memory credentialType,
        string memory metadataURI
    ) 
        external 
        returns (uint256)
    {
        string memory applicantDID = didRegistry.getDIDByOwner(msg.sender);
        require(bytes(applicantDID).length > 0, "Caller has no DID");
        
        uint256 requestId = _requestIdCounter.current();
        _requestIdCounter.increment();
        
        issuanceRequests[requestId] = IssuanceRequest({
            applicant: msg.sender,
            applicantDID: applicantDID,
            credentialType: credentialType,
            timestamp: block.timestamp,
            isApproved: false
        });
        
        emit IssuanceRequested(
            requestId,
            msg.sender,
            applicantDID,
            credentialType,
            block.timestamp
        );
        
        return requestId;
    }

    /**
     * @dev Approve issuance request and issue credential
     * @param requestId Request ID to approve
     * @param expiresAt Expiration timestamp
     * @param credentialHash Hash of credential data
     * @param metadataURI URI for credential metadata
     */
    function approveIssuance(
        uint256 requestId,
        uint256 expiresAt,
        bytes32 credentialHash,
        string memory metadataURI
    ) 
        external 
        onlyRole(ISSUER_ROLE)
        returns (uint256)
    {
        IssuanceRequest memory request = issuanceRequests[requestId];
        require(!request.isApproved, "Request already approved");
        require(request.applicant != address(0), "Invalid request");
        
        // Mark as approved
        issuanceRequests[requestId].isApproved = true;
        
        // Issue credential
        uint256 tokenId = issueCredential(
            request.applicantDID,
            request.credentialType,
            expiresAt,
            credentialHash,
            metadataURI,
            true // Default to ZKP compatible
        );
        
        emit IssuanceApproved(requestId, tokenId, msg.sender, block.timestamp);
        
        return tokenId;
    }

    // ==================== Verification Functions ====================

    /**
     * @dev Verify credential using ZKP (privacy-preserving)
     * @param tokenId Credential token ID
     * @param nullifier Unique nullifier to prevent replay
     * @param proof ZK proof
     * @param publicSignals Public inputs
     */
    function verifyCredentialWithZKP(
        uint256 tokenId,
        bytes32 nullifier,
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[] memory publicSignals
    ) 
        external 
        onlyValidCredential(tokenId)
        returns (bool)
    {
        Credential memory cred = credentials[tokenId];
        require(cred.zkpCompatible, "Credential does not support ZKP");
        
        // Verify that nullifier matches credential
        require(tokenNullifiers[tokenId] != nullifier, "Nullifier already used");
        
        // Verify proof through ZKPVerifier
        zkpVerifier.verifyProof(
            cred.holderDID,
            ZKPVerifier.ProofType.CREDENTIAL_VERIFICATION,
            nullifier,
            a, b, c, publicSignals
        );
        
        // Update nullifier to prevent replay
        tokenNullifiers[tokenId] = nullifier;
        
        return true;
    }

    /**
     * @dev Verify credential ownership (non-privacy)
     * @param tokenId Credential token ID
     * @param proverAddress Address claiming ownership
     */
    function verifyOwnership(
        uint256 tokenId,
        address proverAddress
    ) 
        external 
        view 
        onlyValidCredential(tokenId)
        returns (bool)
    {
        return ownerOf(tokenId) == proverAddress;
    }

    /**
     * @dev Verify credential by DID
     * @param tokenId Credential token ID
     * @param proverDID DID claiming ownership
     */
    function verifyByDID(
        uint256 tokenId,
        string memory proverDID
    ) 
        external 
        view 
        onlyValidCredential(tokenId)
        returns (bool)
    {
        Credential memory cred = credentials[tokenId];
        address proverAddress = didRegistry.getDIDOwner(proverDID);
        return ownerOf(tokenId) == proverAddress;
    }

    // ==================== Management Functions ====================

    /**
     * @dev Revoke a credential (only revoker role)
     * @param tokenId Credential token ID
     * @param reason Reason for revocation (stored in event)
     */
    function revokeCredential(uint256 tokenId, string memory reason) 
        external 
        onlyRole(REVOKER_ROLE)
    {
        require(_exists(tokenId), "Credential does not exist");
        require(!credentials[tokenId].isRevoked, "Already revoked");
        
        credentials[tokenId].isRevoked = true;
        
        emit CredentialRevoked(
            tokenId,
            credentials[tokenId].holderDID,
            credentials[tokenId].credentialType,
            msg.sender,
            block.timestamp
        );
        
        // Optional: Burn the NFT?
        // _burn(tokenId); // Uncomment to burn instead of just marking
    }

    /**
     * @dev Renew an expired credential
     * @param tokenId Credential token ID
     * @param newExpiry New expiration timestamp
     */
    function renewCredential(uint256 tokenId, uint256 newExpiry)
        external
        onlyRole(ISSUER_ROLE)
        onlyValidCredential(tokenId)
    {
        require(newExpiry > block.timestamp, "Invalid expiry");
        
        credentials[tokenId].expiresAt = newExpiry;
        
        emit CredentialRenewed(
            tokenId,
            credentials[tokenId].holderDID,
            newExpiry,
            block.timestamp
        );
    }

    /**
     * @dev Set soulbound mode (non-transferable)
     * @param enabled Enable or disable soulbound
     */
    function setSoulbound(bool enabled) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        emit SoulboundUpdated(soulbound, enabled);
        soulbound = enabled;
    }

    /**
     * @dev Set base URI for metadata
     * @param baseURI New base URI
     */
    function setBaseURI(string memory baseURI) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _baseURIString = baseURI;
    }

    // ==================== Query Functions ====================

    /**
     * @dev Get all credentials for a DID
     * @param did DID to query
     * @return uint256[] Array of token IDs
     */
    function getCredentialsByDID(string memory did) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return didToTokens[did];
    }

    /**
     * @dev Get credentials by type
     * @param credentialType Type to query
     * @return uint256[] Array of token IDs
     */
    function getCredentialsByType(string memory credentialType) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return credentialTypeToTokens[credentialType];
    }

    /**
     * @dev Check if credential is valid
     * @param tokenId Credential token ID
     * @return bool Whether credential is valid
     */
    function isCredentialValid(uint256 tokenId) 
        external 
        view 
        returns (bool) 
    {
        if (!_exists(tokenId)) return false;
        
        Credential memory cred = credentials[tokenId];
        if (cred.isRevoked) return false;
        if (cred.expiresAt > 0 && cred.expiresAt <= block.timestamp) return false;
        
        return true;
    }

    /**
     * @dev Get full credential details
     * @param tokenId Credential token ID
     * @return Credential struct
     */
    function getCredential(uint256 tokenId) 
        external 
        view 
        returns (Credential memory) 
    {
        require(_exists(tokenId), "Credential does not exist");
        return credentials[tokenId];
    }

    /**
     * @dev Get credential holder address
     * @param tokenId Credential token ID
     * @return address Holder address
     */
    function getCredentialHolder(uint256 tokenId) 
        external 
        view 
        returns (address) 
    {
        require(_exists(tokenId), "Credential does not exist");
        return ownerOf(tokenId);
    }

    /**
     * @dev Get total supply of credentials
     * @return uint256 Total credentials issued
     */
    function totalCredentials() 
        external 
        view 
        returns (uint256) 
    {
        return _tokenIdCounter.current();
    }

    // ==================== Overrides ====================

    /**
     * @dev Override transfer to enforce soulbound if enabled
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 firstTokenId,
        uint256 batchSize
    ) internal virtual override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
        
        // Enforce soulbound: prevent transfers except minting (from == address(0))
        if (soulbound && from != address(0)) {
            require(
                hasRole(ISSUER_ROLE, msg.sender) || hasRole(VERIFIER_ROLE, msg.sender),
                "Soulbound credential: cannot transfer"
            );
        }
    }

    /**
     * @dev Override _burn
     */
    function _burn(uint256 tokenId) 
        internal 
        override(ERC721, ERC721URIStorage) 
    {
        super._burn(tokenId);
        delete _credentialMetadata[tokenId];
    }

    /**
     * @dev Override tokenURI
     */
    function tokenURI(uint256 tokenId) 
        public 
        view 
        override(ERC721, ERC721URIStorage) 
        returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Override supportsInterface
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
