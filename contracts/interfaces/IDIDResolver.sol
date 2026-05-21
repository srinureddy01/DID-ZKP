// contracts/interfaces/IDIDResolver.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IDIDResolver
 * @dev Interface for DID resolution across different DID methods
 * @notice Allows pluggable DID resolution implementations (did:ethr, did:indy, etc.)
 * @dev Follows W3C DID Core specification principles
 */
interface IDIDResolver {
    // ==================== Structs ====================

    /**
     * @dev DID Document metadata
     * @param did The DID string (e.g., "did:example:123")
     * @param controller DID that controls this identity (if different from owner)
     * @param created Timestamp of creation (Unix timestamp)
     * @param updated Timestamp of last update
     * @param deactivated Whether DID is deactivated/revoked
     */
    struct DIDDocumentMetadata {
        string did;
        string controller;
        uint256 created;
        uint256 updated;
        bool deactivated;
    }

    /**
     * @dev Verification method (public key, etc.)
     * @param id Verification method ID (e.g., "#keys-1")
     * @param type Method type (e.g., "Ed25519VerificationKey2020")
     * @param controller DID of controller
     * @param publicKeyMultibase Public key in multibase format
     */
    struct VerificationMethod {
        string id;
        string type;
        string controller;
        string publicKeyMultibase;
    }

    /**
     * @dev Service endpoint
     * @param id Service ID
     * @param type Service type (e.g., "LinkedDomains")
     * @param serviceEndpoint URL or endpoint string
     */
    struct Service {
        string id;
        string type;
        string serviceEndpoint;
    }

    /**
     * @dev Complete DID Document response
     * @param context JSON-LD context (e.g., "https://www.w3.org/ns/did/v1")
     * @param id The DID string
     * @param verificationMethods Array of verification methods
     * @param authentication Keys for authentication (references to verification methods)
     * @param assertionMethod Keys for assertions
     * @param keyAgreement Keys for key agreement
     * @param capabilityInvocation Keys for capability invocation
     * @param capabilityDelegation Keys for capability delegation
     * @param services Array of services
     * @param metadata DID document metadata
     */
    struct DIDDocument {
        string context;
        string id;
        VerificationMethod[] verificationMethods;
        string[] authentication;
        string[] assertionMethod;
        string[] keyAgreement;
        string[] capabilityInvocation;
        string[] capabilityDelegation;
        Service[] services;
        DIDDocumentMetadata metadata;
    }

    // ==================== Core Resolution Functions ====================

    /**
     * @dev Resolve a DID to its full DID Document
     * @param did The DID string to resolve
     * @return DIDDocument Complete DID document with metadata
     */
    function resolve(string calldata did) external view returns (DIDDocument memory);

    /**
     * @dev Resolve a DID and get only metadata (lightweight)
     * @param did The DID string to resolve
     * @return DIDDocumentMetadata Basic metadata only
     */
    function resolveMetadata(string calldata did) external view returns (DIDDocumentMetadata memory);

    /**
     * @dev Check if a DID exists
     * @param did The DID string to check
     * @return bool True if DID exists
     */
    function isDIDExists(string calldata did) external view returns (bool);

    /**
     * @dev Check if a DID is active (exists and not deactivated)
     * @param did The DID string to check
     * @return bool True if active
     */
    function isDIDActive(string calldata did) external view returns (bool);

    // ==================== Verification Methods ====================

    /**
     * @dev Get verification methods for a DID
     * @param did The DID string
     * @return VerificationMethod[] Array of verification methods
     */
    function getVerificationMethods(string calldata did) external view returns (VerificationMethod[] memory);

    /**
     * @dev Get specific verification method by ID
     * @param did The DID string
     * @param methodId Verification method ID (e.g., "#keys-1")
     * @return VerificationMethod The verification method
     */
    function getVerificationMethod(string calldata did, string calldata methodId) external view returns (VerificationMethod memory);

    /**
     * @dev Get authentication verification methods (references)
     * @param did The DID string
     * @return string[] Array of authentication method references
     */
    function getAuthenticationMethods(string calldata did) external view returns (string[] memory);

    // ==================== Services ====================

    /**
     * @dev Get services for a DID
     * @param did The DID string
     * @return Service[] Array of services
     */
    function getServices(string calldata did) external view returns (Service[] memory);

    /**
     * @dev Get specific service by ID
     * @param did The DID string
     * @param serviceId Service ID
     * @return Service The service
     */
    function getService(string calldata did, string calldata serviceId) external view returns (Service memory);

    // ==================== Owner/Controller ====================

    /**
     * @dev Get controller/owner of a DID
     * @param did The DID string
     * @return address Ethereum address of controller (if applicable)
     */
    function getControllerAddress(string calldata did) external view returns (address);

    /**
     * @dev Get DID string from controller address
     * @param controller Controller address
     * @return string The DID string
     */
    function getDIDByController(address controller) external view returns (string memory);

    // ==================== Extensions ====================

    /**
     * @dev Resolve DID with custom options (e.g., specific version)
     * @param did The DID string
     * @param options JSON string of resolution options
     * @return DIDDocument Complete DID document
     */
    function resolveWithOptions(string calldata did, string calldata options) external view returns (DIDDocument memory);

    /**
     * @dev Get DID method supported by this resolver
     * @return string The DID method (e.g., "ethr", "indy", "example")
     */
    function getSupportedMethod() external view returns (string memory);
}
