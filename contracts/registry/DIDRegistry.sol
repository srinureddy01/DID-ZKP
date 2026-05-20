// contracts/registry/DIDRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DIDRegistry
 * @dev Decentralized Identity Registry on blockchain
 * @notice Manages DIDs (Decentralized Identifiers) with their associated DID documents
 * @dev Each DID is controlled by an Ethereum address (owner)
 */
contract DIDRegistry {
    // ==================== Structs ====================

    /**
     * @dev DID Document structure
     * @param did The DID string (e.g., "did:example:123")
     * @param owner Address that controls this DID
     * @param documentHash IPFS hash (CID) of the full DID document
     * @param created Timestamp when DID was registered
     * @param updated Timestamp when DID was last updated
     * @param isActive Whether DID is active (not revoked)
     */
    struct DIDDocument {
        string did;
        address owner;
        string documentHash;    // IPFS CID
        uint256 created;
        uint256 updated;
        bool isActive;
    }

    // ==================== State Variables ====================

    // Mapping from DID hash (keccak256 of DID string) to DID Document
    mapping(bytes32 => DIDDocument) private didRegistry;

    // Mapping from owner address to their DID (one-to-one mapping)
    mapping(address => bytes32) private ownerToDIDHash;

    // Array of all registered DIDs (for enumeration - optional)
    bytes32[] private allDIDs;

    // ==================== Events ====================

    /**
     * @dev Emitted when a new DID is registered
     * @param did The DID string
     * @param owner Address that owns the DID
     * @param documentHash IPFS hash of DID document
     * @param timestamp Block timestamp
     */
    event DIDRegistered(
        string indexed did,
        address indexed owner,
        string documentHash,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a DID document is updated
     * @param did The DID string
     * @param owner Address that owns the DID
     * @param newDocumentHash New IPFS hash of DID document
     * @param timestamp Block timestamp
     */
    event DIDUpdated(
        string indexed did,
        address indexed owner,
        string newDocumentHash,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a DID is revoked (deactivated)
     * @param did The DID string
     * @param owner Address that revoked the DID
     * @param timestamp Block timestamp
     */
    event DIDRevoked(
        string indexed did,
        address indexed owner,
        uint256 timestamp
    );

    /**
     * @dev Emitted when a DID is reactivated
     * @param did The DID string
     * @param owner Address that reactivated the DID
     * @param timestamp Block timestamp
     */
    event DIDReactivated(
        string indexed did,
        address indexed owner,
        uint256 timestamp
    );

    /**
     * @dev Emitted when ownership is transferred
     * @param did The DID string
     * @param oldOwner Previous owner
     * @param newOwner New owner
     * @param timestamp Block timestamp
     */
    event OwnershipTransferred(
        string indexed did,
        address indexed oldOwner,
        address indexed newOwner,
        uint256 timestamp
    );

    // ==================== Modifiers ====================

    /**
     * @dev Checks if DID exists
     */
    modifier didExists(bytes32 didHash) {
        require(didRegistry[didHash].owner != address(0), "DID does not exist");
        _;
    }

    /**
     * @dev Checks if DID is active
     */
    modifier didActive(bytes32 didHash) {
        require(didRegistry[didHash].isActive, "DID is revoked or inactive");
        _;
    }

    /**
     * @dev Checks if caller is the DID owner
     */
    modifier onlyDIDOwner(bytes32 didHash) {
        require(didRegistry[didHash].owner == msg.sender, "Not DID owner");
        _;
    }

    /**
     * @dev Checks if owner doesn't already have a DID
     */
    modifier noExistingDID(address owner) {
        require(ownerToDIDHash[owner] == 0, "Owner already has a DID");
        _;
    }

    // ==================== Core Functions ====================

    /**
     * @dev Register a new DID
     * @param did The DID string (e.g., "did:example:123")
     * @param documentHash IPFS CID of the DID document
     */
    function registerDID(string calldata did, string calldata documentHash) 
        external 
        noExistingDID(msg.sender) 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        
        // Check if DID already exists
        require(didRegistry[didHash].owner == address(0), "DID already registered");
        require(bytes(did).length > 0, "DID cannot be empty");
        require(bytes(documentHash).length > 0, "Document hash cannot be empty");
        
        // Store DID document
        didRegistry[didHash] = DIDDocument({
            did: did,
            owner: msg.sender,
            documentHash: documentHash,
            created: block.timestamp,
            updated: block.timestamp,
            isActive: true
        });
        
        // Track owner mapping
        ownerToDIDHash[msg.sender] = didHash;
        
        // Add to enumeration
        allDIDs.push(didHash);
        
        emit DIDRegistered(did, msg.sender, documentHash, block.timestamp);
    }

    /**
     * @dev Update DID document
     * @param did The DID string
     * @param newDocumentHash New IPFS CID of DID document
     */
    function updateDIDDocument(string calldata did, string calldata newDocumentHash) 
        external 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        
        require(didExists(didHash), "DID does not exist");
        require(didActive(didHash), "DID is revoked");
        require(onlyDIDOwner(didHash), "Not DID owner");
        require(bytes(newDocumentHash).length > 0, "Document hash cannot be empty");
        
        // Update document hash and timestamp
        didRegistry[didHash].documentHash = newDocumentHash;
        didRegistry[didHash].updated = block.timestamp;
        
        emit DIDUpdated(did, msg.sender, newDocumentHash, block.timestamp);
    }

    /**
     * @dev Revoke DID (deactivate)
     * @param did The DID string
     */
    function revokeDID(string calldata did) 
        external 
        didExists(keccak256(abi.encodePacked(did)))
        onlyDIDOwner(keccak256(abi.encodePacked(did)))
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        
        require(didRegistry[didHash].isActive, "DID already revoked");
        
        didRegistry[didHash].isActive = false;
        didRegistry[didHash].updated = block.timestamp;
        
        emit DIDRevoked(did, msg.sender, block.timestamp);
    }

    /**
     * @dev Reactivate a revoked DID
     * @param did The DID string
     */
    function reactivateDID(string calldata did) 
        external 
        didExists(keccak256(abi.encodePacked(did)))
        onlyDIDOwner(keccak256(abi.encodePacked(did)))
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        
        require(!didRegistry[didHash].isActive, "DID already active");
        
        didRegistry[didHash].isActive = true;
        didRegistry[didHash].updated = block.timestamp;
        
        emit DIDReactivated(did, msg.sender, block.timestamp);
    }

    /**
     * @dev Transfer ownership of DID to another address
     * @param did The DID string
     * @param newOwner Address to transfer ownership to
     */
    function transferOwnership(string calldata did, address newOwner) 
        external 
        didExists(keccak256(abi.encodePacked(did)))
        onlyDIDOwner(keccak256(abi.encodePacked(did)))
    {
        require(newOwner != address(0), "Invalid new owner");
        require(ownerToDIDHash[newOwner] == 0, "New owner already has a DID");
        
        bytes32 didHash = keccak256(abi.encodePacked(did));
        address oldOwner = didRegistry[didHash].owner;
        
        // Update mappings
        delete ownerToDIDHash[oldOwner];
        ownerToDIDHash[newOwner] = didHash;
        
        // Update DID document
        didRegistry[didHash].owner = newOwner;
        didRegistry[didHash].updated = block.timestamp;
        
        emit OwnershipTransferred(did, oldOwner, newOwner, block.timestamp);
    }

    // ==================== View Functions ====================

    /**
     * @dev Resolve DID to get full document
     * @param did The DID string
     * @return DIDDocument struct
     */
    function resolveDID(string calldata did) 
        external 
        view 
        returns (DIDDocument memory) 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        require(didExists(didHash), "DID does not exist");
        return didRegistry[didHash];
    }

    /**
     * @dev Get document hash (IPFS CID) for a DID
     * @param did The DID string
     * @return documentHash IPFS CID
     */
    function getDIDDocumentHash(string calldata did) 
        external 
        view 
        returns (string memory) 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        require(didExists(didHash), "DID does not exist");
        return didRegistry[didHash].documentHash;
    }

    /**
     * @dev Check if DID exists
     * @param did The DID string
     * @return bool
     */
    function isDIDRegistered(string calldata did) 
        external 
        view 
        returns (bool) 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        return didRegistry[didHash].owner != address(0);
    }

    /**
     * @dev Check if DID is active
     * @param did The DID string
     * @return bool
     */
    function isDIDActive(string calldata did) 
        external 
        view 
        returns (bool) 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        return didExists(didHash) && didRegistry[didHash].isActive;
    }

    /**
     * @dev Get owner of a DID
     * @param did The DID string
     * @return owner address
     */
    function getDIDOwner(string calldata did) 
        external 
        view 
        returns (address) 
    {
        bytes32 didHash = keccak256(abi.encodePacked(did));
        require(didExists(didHash), "DID does not exist");
        return didRegistry[didHash].owner;
    }

    /**
     * @dev Get DID owned by an address
     * @param owner Address
     * @return did string
     */
    function getDIDByOwner(address owner) 
        external 
        view 
        returns (string memory) 
    {
        bytes32 didHash = ownerToDIDHash[owner];
        require(didHash != 0, "Owner has no DID");
        return didRegistry[didHash].did;
    }

    /**
     * @dev Get total number of registered DIDs
     * @return uint256
     */
    function getTotalDIDCount() 
        external 
        view 
        returns (uint256) 
    {
        return allDIDs.length;
    }

    /**
     * @dev Get DID by index (for enumeration)
     * @param index Index in the array
     * @return did string
     */
    function getDIDByIndex(uint256 index) 
        external 
        view 
        returns (string memory) 
    {
        require(index < allDIDs.length, "Index out of bounds");
        return didRegistry[allDIDs[index]].did;
    }

    // ==================== Internal Functions ====================

    /**
     * @dev Internal function to check if a DID exists (gas optimized)
     */
    function _didExists(bytes32 didHash) internal view returns (bool) {
        return didRegistry[didHash].owner != address(0);
    }
}
