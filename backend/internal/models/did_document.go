// backend/internal/models/did_document.go
package models

import (
	"encoding/json"
	"time"
)

// ==================== DID Core Types ====================

// DIDComponents represents the parsed components of a DID
type DIDComponents struct {
	Scheme     string `json:"scheme"`     // "did"
	Method     string `json:"method"`     // e.g., "example", "ethr", "indy"
	Identifier string `json:"identifier"` // Method-specific identifier
	Did        string `json:"did"`        // Full DID string
	MethodSpecificID string `json:"methodSpecificId,omitempty"`
}

// DIDDocument represents a complete DID Document according to W3C specification
type DIDDocument struct {
	Context              []string               `json:"@context"`
	ID                   string                 `json:"id"`
	Controller           []string               `json:"controller,omitempty"`
	AlsoKnownAs          []string               `json:"alsoKnownAs,omitempty"`
	VerificationMethod   []VerificationMethod   `json:"verificationMethod,omitempty"`
	Authentication       []interface{}          `json:"authentication,omitempty"`
	AssertionMethod      []interface{}          `json:"assertionMethod,omitempty"`
	KeyAgreement         []interface{}          `json:"keyAgreement,omitempty"`
	CapabilityInvocation []interface{}          `json:"capabilityInvocation,omitempty"`
	CapabilityDelegation []interface{}          `json:"capabilityDelegation,omitempty"`
	Service              []Service              `json:"service,omitempty"`
	Created              string                 `json:"created,omitempty"`
	Updated              string                 `json:"updated,omitempty"`
	Profile              *DIDProfile            `json:"profile,omitempty"`
	Metadata             *DIDDocumentMetadata   `json:"metadata,omitempty"`
	Proof                []DIDProof             `json:"proof,omitempty"`
	Extensions           map[string]interface{} `json:"-"`
}

// VerificationMethod represents a verification method in a DID Document
type VerificationMethod struct {
	ID                 string `json:"id"`
	Type               string `json:"type"`
	Controller         string `json:"controller"`
	PublicKeyMultibase string `json:"publicKeyMultibase,omitempty"`
	PublicKeyJwk       map[string]interface{} `json:"publicKeyJwk,omitempty"`
	BlockchainAccountID string `json:"blockchainAccountId,omitempty"`
	EthereumAddress    string `json:"ethereumAddress,omitempty"`
}

// Service represents a service endpoint in a DID Document
type Service struct {
	ID              string                 `json:"id"`
	Type            string                 `json:"type"`
	ServiceEndpoint interface{}            `json:"serviceEndpoint"`
	Description     string                 `json:"description,omitempty"`
	RoutingKeys     []string               `json:"routingKeys,omitempty"`
	Accept          []string               `json:"accept,omitempty"`
	Properties      map[string]interface{} `json:"-"`
}

// DIDProfile represents user profile information attached to a DID
type DIDProfile struct {
	Name        string            `json:"name,omitempty"`
	Description string            `json:"description,omitempty"`
	Email       string            `json:"email,omitempty"`
	Website     string            `json:"website,omitempty"`
	Avatar      string            `json:"avatar,omitempty"`
	Location    string            `json:"location,omitempty"`
	Social      map[string]string `json:"social,omitempty"`
	CreatedAt   string            `json:"createdAt,omitempty"`
	UpdatedAt   string            `json:"updatedAt,omitempty"`
}

// DIDDocumentMetadata represents metadata about a DID Document
type DIDDocumentMetadata struct {
	Created         string `json:"created"`
	Updated         string `json:"updated"`
	Deactivated     bool   `json:"deactivated"`
	VersionID       string `json:"versionId,omitempty"`
	NextUpdate      string `json:"nextUpdate,omitempty"`
	BlockNumber     uint64 `json:"blockNumber,omitempty"`
	TransactionHash string `json:"transactionHash,omitempty"`
}

// DIDProof represents a cryptographic proof for a DID Document
type DIDProof struct {
	Type               string    `json:"type"`
	Created            time.Time `json:"created"`
	VerificationMethod string    `json:"verificationMethod"`
	ProofPurpose       string    `json:"proofPurpose"`
	ProofValue         string    `json:"proofValue,omitempty"`
	Jws                string    `json:"jws,omitempty"`
}

// ==================== Resolution Results ====================

// DIDResolutionResult represents the result of resolving a DID
type DIDResolutionResult struct {
	DID            string                 `json:"did"`
	Document       *DIDDocument           `json:"document"`
	DocumentHash   string                 `json:"documentHash"`
	Metadata       *DIDResolutionMetadata `json:"metadata"`
	ResolutionTime time.Time              `json:"resolutionTime"`
	Method         string                 `json:"method"`
	Identifier     string                 `json:"identifier"`
	Services       []Service              `json:"services,omitempty"`
}

// DIDResolutionMetadata contains metadata about the resolution process
type DIDResolutionMetadata struct {
	ContentType      string            `json:"contentType,omitempty"`
	Error            string            `json:"error,omitempty"`
	ErrorMessage     string            `json:"errorMessage,omitempty"`
	Retrieved        string            `json:"retrieved,omitempty"`
	VersionID        string            `json:"versionId,omitempty"`
	NextUpdate       string            `json:"nextUpdate,omitempty"`
	Properties       map[string]interface{} `json:"-"`
}

// DIDDocumentMetadataResponse represents DID metadata from blockchain
type DIDDocumentMetadataResponse struct {
	DID          string    `json:"did"`
	Owner        string    `json:"owner"`
	Created      time.Time `json:"created"`
	Updated      time.Time `json:"updated"`
	IsActive     bool      `json:"isActive"`
	DocumentHash string    `json:"documentHash"`
	BlockNumber  uint64    `json:"blockNumber,omitempty"`
	Profile      *DIDProfile `json:"profile,omitempty"`
}

// ==================== Request/Response Types ====================

// RegisterDIDRequest represents a request to register a DID
type RegisterDIDRequest struct {
	DID       string                 `json:"did"`
	PublicKey string                 `json:"publicKey"`
	Profile   *DIDProfile            `json:"profile,omitempty"`
	Services  []Service              `json:"services,omitempty"`
	Options   map[string]interface{} `json:"options,omitempty"`
}

// RegisterDIDResponse represents a response from DID registration
type RegisterDIDResponse struct {
	DID       string       `json:"did"`
	CID       string       `json:"cid"`
	TxHash    string       `json:"txHash"`
	Document  *DIDDocument `json:"document"`
	CreatedAt time.Time    `json:"createdAt"`
}

// UpdateDIDRequest represents a request to update a DID Document
type UpdateDIDRequest struct {
	DID     string                 `json:"did"`
	CID     string                 `json:"cid"`
	Updates map[string]interface{} `json:"updates"`
}

// UpdateDIDResponse represents a response from DID update
type UpdateDIDResponse struct {
	DID       string    `json:"did"`
	OldCID    string    `json:"oldCid"`
	NewCID    string    `json:"newCid"`
	TxHash    string    `json:"txHash"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// RevokeDIDResponse represents a response from DID revocation
type RevokeDIDResponse struct {
	DID     string    `json:"did"`
	TxHash  string    `json:"txHash"`
	Revoked bool      `json:"revoked"`
	RevokedAt time.Time `json:"revokedAt"`
}

// GetDIDByOwnerResponse represents a response for getting DID by owner
type GetDIDByOwnerResponse struct {
	Address string `json:"address"`
	DID     string `json:"did"`
}

// VerifyDIDResponse represents a response from DID verification
type VerifyDIDResponse struct {
	DID      string `json:"did"`
	Exists   bool   `json:"exists"`
	IsActive bool   `json:"isActive"`
	Owner    string `json:"owner"`
	Verified bool   `json:"verified"`
	Message  string `json:"message,omitempty"`
}

// DIDResolutionRequest represents a request to resolve a DID with options
type DIDResolutionRequest struct {
	DID     string                 `json:"did"`
	Accept  string                 `json:"accept,omitempty"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// ==================== Batch Operation Types ====================

// BatchResolutionResponse represents a response for batch DID resolution
type BatchResolutionResponse struct {
	Results  []*DIDResolutionResult `json:"results"`
	Errors   map[string]string      `json:"errors"`
	Total    int                    `json:"total"`
	Resolved int                    `json:"resolved"`
}

// BatchDIDRequest represents a batch request for multiple DIDs
type BatchDIDRequest struct {
	DIDs    []string               `json:"dids"`
	Options map[string]interface{} `json:"options,omitempty"`
}

// ==================== History Types ====================

// DIDHistoryEntry represents a single entry in DID document history
type DIDHistoryEntry struct {
	VersionID   string                 `json:"versionId"`
	Timestamp   time.Time              `json:"timestamp"`
	EventType   string                 `json:"eventType"` // "created", "updated", "deactivated", "reactivated"
	Transaction string                 `json:"transaction"`
	Document    *DIDDocument           `json:"document,omitempty"`
	Changes     map[string]interface{} `json:"changes,omitempty"`
}

// DIDHistoryResponse represents a response for DID history
type DIDHistoryResponse struct {
	DID     string             `json:"did"`
	Entries []*DIDHistoryEntry `json:"entries"`
	Count   int                `json:"count"`
}

// ==================== Resolution with Proof ====================

// DIDResolutionWithProofResponse represents a resolution result with proof
type DIDResolutionWithProofResponse struct {
	DID        string                 `json:"did"`
	Document   *DIDDocument           `json:"document"`
	Metadata   *DIDDocumentMetadata   `json:"metadata"`
	Proof      map[string]interface{} `json:"proof"`
	VerifiedAt time.Time              `json:"verifiedAt"`
}

// ResolutionProof represents a proof of DID resolution
type ResolutionProof struct {
	Type             string    `json:"type"`
	DID              string    `json:"did"`
	DocumentHash     string    `json:"documentHash"`
	ResolutionTime   time.Time `json:"resolutionTime"`
	BlockNumber      uint64    `json:"blockNumber"`
	TransactionHash  string    `json:"transactionHash"`
	Signature        string    `json:"signature,omitempty"`
}

// ==================== Helper Functions ====================

// NewDIDDocument creates a new DID Document with default values
func NewDIDDocument(did, publicKey string) *DIDDocument {
	now := time.Now().Format(time.RFC3339)
	
	verificationMethod := VerificationMethod{
		ID:                 did + "#keys-1",
		Type:               "Ed25519VerificationKey2020",
		Controller:         did,
		PublicKeyMultibase: publicKey,
	}
	
	return &DIDDocument{
		Context: []string{
			"https://www.w3.org/ns/did/v1",
			"https://w3id.org/security/suites/ed25519-2020/v1",
		},
		ID:         did,
		Controller: []string{did},
		VerificationMethod: []VerificationMethod{verificationMethod},
		Authentication:     []interface{}{did + "#keys-1"},
		AssertionMethod:    []interface{}{did + "#keys-1"},
		Created:            now,
		Updated:            now,
	}
}

// AddService adds a service to the DID Document
func (d *DIDDocument) AddService(service Service) {
	d.Service = append(d.Service, service)
	d.Updated = time.Now().Format(time.RFC3339)
}

// AddVerificationMethod adds a verification method to the DID Document
func (d *DIDDocument) AddVerificationMethod(method VerificationMethod) {
	d.VerificationMethod = append(d.VerificationMethod, method)
	d.Updated = time.Now().Format(time.RFC3339)
}

// SetProfile sets the profile information for the DID Document
func (d *DIDDocument) SetProfile(profile *DIDProfile) {
	d.Profile = profile
	if profile != nil {
		profile.UpdatedAt = time.Now().Format(time.RFC3339)
	}
	d.Updated = time.Now().Format(time.RFC3339)
}

// ToJSON converts the DID Document to JSON string
func (d *DIDDocument) ToJSON() (string, error) {
	data, err := json.MarshalIndent(d, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// Validate validates the DID Document structure
func (d *DIDDocument) Validate() error {
	if d.ID == "" {
		return fmt.Errorf("DID document missing id")
	}
	
	if len(d.Context) == 0 {
		return fmt.Errorf("DID document missing @context")
	}
	
	if len(d.VerificationMethod) == 0 {
		return fmt.Errorf("DID document must have at least one verification method")
	}
	
	return nil
}

// ==================== Service Helper Functions ====================

// NewService creates a new service endpoint
func NewService(id, serviceType, endpoint string) Service {
	return Service{
		ID:              id,
		Type:            serviceType,
		ServiceEndpoint: endpoint,
	}
}

// NewLinkedDomainService creates a linked domain service
func NewLinkedDomainService(did, domain string) Service {
	return Service{
		ID:              did + "#linked-domain",
		Type:            "LinkedDomains",
		ServiceEndpoint: domain,
	}
}

// NewIdentityHubService creates an identity hub service
func NewIdentityHubService(did, hubURL string) Service {
	return Service{
		ID:              did + "#hub",
		Type:            "IdentityHub",
		ServiceEndpoint: hubURL,
	}
}

// ==================== Profile Helper Functions ====================

// NewDIDProfile creates a new DID profile
func NewDIDProfile(name, description, email, website string) *DIDProfile {
	now := time.Now().Format(time.RFC3339)
	return &DIDProfile{
		Name:        name,
		Description: description,
		Email:       email,
		Website:     website,
		CreatedAt:   now,
		UpdatedAt:   now,
		Social:      make(map[string]string),
	}
}

// AddSocialLink adds a social media link to the profile
func (p *DIDProfile) AddSocialLink(platform, url string) {
	if p.Social == nil {
		p.Social = make(map[string]string)
	}
	p.Social[platform] = url
	p.UpdatedAt = time.Now().Format(time.RFC3339)
}

// ==================== Verification Method Helpers ====================

// NewEd25519VerificationMethod creates a new Ed25519 verification method
func NewEd25519VerificationMethod(did, publicKeyMultibase string) VerificationMethod {
	return VerificationMethod{
		ID:                 did + "#keys-ed25519",
		Type:               "Ed25519VerificationKey2020",
		Controller:         did,
		PublicKeyMultibase: publicKeyMultibase,
	}
}

// NewEthereumVerificationMethod creates an Ethereum-based verification method
func NewEthereumVerificationMethod(did, ethereumAddress string) VerificationMethod {
	return VerificationMethod{
		ID:              did + "#keys-eth",
		Type:            "EcdsaSecp256k1VerificationKey2019",
		Controller:      did,
		EthereumAddress: ethereumAddress,
	}
}

// NewJsonWebKeyMethod creates a verification method with JWK
func NewJsonWebKeyMethod(did, keyID string, jwk map[string]interface{}) VerificationMethod {
	return VerificationMethod{
		ID:           did + "#" + keyID,
		Type:         "JsonWebKey2020",
		Controller:   did,
		PublicKeyJwk: jwk,
	}
}

// ==================== DID Parsing Helpers ====================

// ParseDID parses a DID string into its components
func ParseDID(did string) (*DIDComponents, error) {
	parts := strings.Split(did, ":")
	if len(parts) != 3 {
		return nil, fmt.Errorf("invalid DID format: expected did:method:identifier")
	}
	
	if parts[0] != "did" {
		return nil, fmt.Errorf("invalid DID scheme: expected 'did'")
	}
	
	if parts[1] == "" {
		return nil, fmt.Errorf("DID method cannot be empty")
	}
	
	if parts[2] == "" {
		return nil, fmt.Errorf("DID identifier cannot be empty")
	}
	
	return &DIDComponents{
		Scheme:     parts[0],
		Method:     parts[1],
		Identifier: parts[2],
		Did:        did,
	}, nil
}

// ValidateDIDFormat validates the format of a DID string
func ValidateDIDFormat(did string) bool {
	parts := strings.Split(did, ":")
	if len(parts) != 3 {
		return false
	}
	
	if parts[0] != "did" {
		return false
	}
	
	if parts[1] == "" {
		return false
	}
	
	if parts[2] == "" {
		return false
	}
	
	return true
}

// ==================== JSON-LD Context Helpers ====================

// GetJSONLDContext returns the JSON-LD context for DID Documents
func GetJSONLDContext() map[string]interface{} {
	return map[string]interface{}{
		"@context": map[string]interface{}{
			"did": "https://www.w3.org/ns/did/v1",
			"Ed25519VerificationKey2020": "https://w3id.org/security#Ed25519VerificationKey2020",
			"EcdsaSecp256k1VerificationKey2019": "https://w3id.org/security#EcdsaSecp256k1VerificationKey2019",
			"JsonWebKey2020": "https://w3id.org/security#JsonWebKey2020",
		},
	}
}
