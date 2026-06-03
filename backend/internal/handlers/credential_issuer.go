// backend/internal/handlers/credential_issuer.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/gorilla/mux"
	"github.com/google/uuid"
	shell "github.com/ipfs/go-ipfs-api"

	"did-protocol-backend/internal/models"
	"did-protocol-backend/internal/services"
	"did-protocol-backend/pkg/blockchain"
)

// CredentialIssuer handles credential issuance and management
type CredentialIssuer struct {
	blockchainClient *blockchain.Client
	ipfsClient       *shell.Shell
	credentialService *services.CredentialService
	zkpService       *services.ZKPService
	cache            *CredentialCache
	logger           *Logger
}

// CredentialCache manages caching of credentials
type CredentialCache struct {
	entries map[string]*CredentialCacheEntry
	mu      sync.RWMutex
	ttl     time.Duration
}

// CredentialCacheEntry represents a cached credential
type CredentialCacheEntry struct {
	Credential *models.Credential
	ExpiresAt  time.Time
}

// IssueCredentialRequest represents a credential issuance request
type IssueCredentialRequest struct {
	HolderDID      string                 `json:"holderDID"`
	CredentialType string                 `json:"credentialType"`
	ExpiresAt      *time.Time             `json:"expiresAt,omitempty"`
	CredentialData map[string]interface{} `json:"credentialData"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
	ZKPCompatible  bool                   `json:"zkpCompatible"`
}

// IssueCredentialResponse represents the response for credential issuance
type IssueCredentialResponse struct {
	TokenID        uint64                 `json:"tokenId"`
	CredentialID   string                 `json:"credentialId"`
	HolderDID      string                 `json:"holderDID"`
	CredentialType string                 `json:"credentialType"`
	IssuedAt       time.Time              `json:"issuedAt"`
	ExpiresAt      *time.Time             `json:"expiresAt,omitempty"`
	IPFSCID        string                 `json:"ipfsCid"`
	TxHash         string                 `json:"txHash"`
	Credential     map[string]interface{} `json:"credential"`
}

// VerifyCredentialRequest represents a credential verification request
type VerifyCredentialRequest struct {
	CredentialID string                 `json:"credentialId"`
	TokenID      uint64                 `json:"tokenId,omitempty"`
	VerifierDID  string                 `json:"verifierDID,omitempty"`
	Proof        map[string]interface{} `json:"proof,omitempty"`
}

// NewCredentialIssuer creates a new credential issuer handler
func NewCredentialIssuer(
	blockchainClient *blockchain.Client,
	ipfsClient *shell.Shell,
	credentialService *services.CredentialService,
	zkpService *services.ZKPService,
) *CredentialIssuer {
	return &CredentialIssuer{
		blockchainClient:  blockchainClient,
		ipfsClient:        ipfsClient,
		credentialService: credentialService,
		zkpService:        zkpService,
		cache: &CredentialCache{
			entries: make(map[string]*CredentialCacheEntry),
			ttl:     10 * time.Minute,
		},
		logger: &Logger{enabled: true},
	}
}

// ==================== Credential Issuance ====================

// IssueCredential issues a new verifiable credential
func (c *CredentialIssuer) IssueCredential(w http.ResponseWriter, req *http.Request) {
	var issuanceReq IssueCredentialRequest
	if err := json.NewDecoder(req.Body).Decode(&issuanceReq); err != nil {
		c.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if issuanceReq.HolderDID == "" {
		c.sendError(w, "Holder DID is required", http.StatusBadRequest)
		return
	}
	if issuanceReq.CredentialType == "" {
		c.sendError(w, "Credential type is required", http.StatusBadRequest)
		return
	}
	if issuanceReq.CredentialData == nil {
		c.sendError(w, "Credential data is required", http.StatusBadRequest)
		return
	}

	c.logger.Info("Issuing credential of type '%s' to holder '%s'", issuanceReq.CredentialType, issuanceReq.HolderDID)

	// Get issuer DID from API key or authentication context
	issuerDID := req.Header.Get("X-Issuer-DID")
	if issuerDID == "" {
		c.sendError(w, "Issuer DID is required", http.StatusUnauthorized)
		return
	}

	// Generate credential ID
	credentialID := fmt.Sprintf("urn:uuid:%s", uuid.New().String())

	// Create verifiable credential
	credential := c.createVerifiableCredential(
		credentialID,
		issuanceReq.HolderDID,
		issuerDID,
		issuanceReq.CredentialType,
		issuanceReq.CredentialData,
		issuanceReq.ExpiresAt,
	)

	// Add ZKP compatibility flag
	if issuanceReq.ZKPCompatible {
		credential["zkpCompatible"] = true
	}

	// Upload credential to IPFS
	cid, err := c.ipfsClient.Add(strings.NewReader(c.toJSON(credential)))
	if err != nil {
		c.logger.Error("Failed to upload credential to IPFS: %v", err)
		c.sendError(w, "Failed to store credential", http.StatusInternalServerError)
		return
	}

	// Issue credential on blockchain
	expiresAt := uint64(0)
	if issuanceReq.ExpiresAt != nil {
		expiresAt = uint64(issuanceReq.ExpiresAt.Unix())
	}

	credentialHash := c.hashCredentialData(credential)
	txHash, tokenID, err := c.blockchainClient.IssueCredential(
		issuanceReq.HolderDID,
		issuanceReq.CredentialType,
		expiresAt,
		credentialHash,
		cid.String(),
		issuanceReq.ZKPCompatible,
	)
	if err != nil {
		c.logger.Error("Failed to issue credential on blockchain: %v", err)
		c.sendError(w, "Failed to issue credential", http.StatusInternalServerError)
		return
	}

	response := IssueCredentialResponse{
		TokenID:        tokenID,
		CredentialID:   credentialID,
		HolderDID:      issuanceReq.HolderDID,
		CredentialType: issuanceReq.CredentialType,
		IssuedAt:       time.Now(),
		ExpiresAt:      issuanceReq.ExpiresAt,
		IPFSCID:        cid.String(),
		TxHash:         txHash,
		Credential:     credential,
	}

	c.sendSuccess(w, response)
}

// IssueAgeCredential issues a specialized age verification credential
func (c *CredentialIssuer) IssueAgeCredential(w http.ResponseWriter, req *http.Request) {
	var ageReq struct {
		HolderDID      string     `json:"holderDID"`
		DateOfBirth    string     `json:"dateOfBirth"`
		ExpiresAt      *time.Time `json:"expiresAt,omitempty"`
		AgeVerification struct {
			IsOver18 bool `json:"isOver18"`
			IsOver21 bool `json:"isOver21"`
			IsOver65 bool `json:"isOver65"`
		} `json:"ageVerification"`
	}

	if err := json.NewDecoder(req.Body).Decode(&ageReq); err != nil {
		c.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if ageReq.HolderDID == "" || ageReq.DateOfBirth == "" {
		c.sendError(w, "Holder DID and date of birth are required", http.StatusBadRequest)
		return
	}

	// Parse date of birth
	dob, err := time.Parse("2006-01-02", ageReq.DateOfBirth)
	if err != nil {
		c.sendError(w, "Invalid date format. Use YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	// Calculate age verifications
	now := time.Now()
	age := now.Year() - dob.Year()
	if now.YearDay() < dob.YearDay() {
		age--
	}

	ageReq.AgeVerification.IsOver18 = age >= 18
	ageReq.AgeVerification.IsOver21 = age >= 21
	ageReq.AgeVerification.IsOver65 = age >= 65

	// Create age credential data
	credentialData := map[string]interface{}{
		"dateOfBirthHash": c.hashString(ageReq.DateOfBirth),
		"ageVerification": ageReq.AgeVerification,
		"age":             age,
		"verifiedAt":      now.Format(time.RFC3339),
	}

	issuanceReq := IssueCredentialRequest{
		HolderDID:      ageReq.HolderDID,
		CredentialType: "AgeVerificationCredential",
		ExpiresAt:      ageReq.ExpiresAt,
		CredentialData: credentialData,
		ZKPCompatible:  true,
	}

	// Reuse the issue credential logic
	c.IssueCredential(w, req)
}

// IssueKYCCredential issues a KYC verification credential
func (c *CredentialIssuer) IssueKYCCredential(w http.ResponseWriter, req *http.Request) {
	var kycReq struct {
		HolderDID        string     `json:"holderDID"`
		FullName         string     `json:"fullName"`
		Nationality      string     `json:"nationality"`
		DocumentNumber   string     `json:"documentNumber"`
		DocumentType     string     `json:"documentType"`
		VerifiedAt       time.Time  `json:"verifiedAt"`
		ExpiresAt        *time.Time `json:"expiresAt,omitempty"`
		KYCProvider      string     `json:"kycProvider"`
		VerificationLevel string    `json:"verificationLevel"`
	}

	if err := json.NewDecoder(req.Body).Decode(&kycReq); err != nil {
		c.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if kycReq.HolderDID == "" || kycReq.FullName == "" {
		c.sendError(w, "Holder DID and full name are required", http.StatusBadRequest)
		return
	}

	// Create KYC credential data (with hashed sensitive fields)
	credentialData := map[string]interface{}{
		"fullNameHash":       c.hashString(kycReq.FullName),
		"nationality":        kycReq.Nationality,
		"documentType":       kycReq.DocumentType,
		"documentHash":       c.hashString(kycReq.DocumentNumber),
		"kycProvider":        kycReq.KYCProvider,
		"verificationLevel":  kycReq.VerificationLevel,
		"verifiedAt":         kycReq.VerifiedAt.Format(time.RFC3339),
		"kycComplete":        true,
	}

	issuanceReq := IssueCredentialRequest{
		HolderDID:      kycReq.HolderDID,
		CredentialType: "KYCCredential",
		ExpiresAt:      kycReq.ExpiresAt,
		CredentialData: credentialData,
		ZKPCompatible:  true,
	}

	c.IssueCredential(w, req)
}

// ==================== Credential Retrieval ====================

// GetCredential retrieves a credential by token ID
func (c *CredentialIssuer) GetCredential(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	tokenIDStr := vars["tokenId"]
	
	tokenID, err := strconv.ParseUint(tokenIDStr, 10, 64)
	if err != nil {
		c.sendError(w, "Invalid token ID", http.StatusBadRequest)
		return
	}

	// Check cache
	if cached := c.cache.get(tokenIDStr); cached != nil {
		c.sendSuccess(w, cached)
		return
	}

	// Get credential from blockchain
	credential, err := c.blockchainClient.GetCredential(tokenID)
	if err != nil {
		c.sendError(w, "Credential not found", http.StatusNotFound)
		return
	}

	// Get credential data from IPFS if available
	if credential.IPFSCID != "" {
		credentialData, err := c.ipfsClient.Cat(credential.IPFSCID)
		if err == nil {
			var data map[string]interface{}
			if json.NewDecoder(credentialData).Decode(&data) == nil {
				credential.Data = data
			}
		}
	}

	// Cache the credential
	c.cache.set(tokenIDStr, credential)

	c.sendSuccess(w, credential)
}

// GetCredentialByID retrieves a credential by its UUID
func (c *CredentialIssuer) GetCredentialByID(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	credentialID := vars["credentialId"]
	
	if credentialID == "" {
		c.sendError(w, "Credential ID is required", http.StatusBadRequest)
		return
	}

	// Check cache
	if cached := c.cache.get(credentialID); cached != nil {
		c.sendSuccess(w, cached)
		return
	}

	// Get credential from blockchain by ID
	credential, err := c.blockchainClient.GetCredentialByID(credentialID)
	if err != nil {
		c.sendError(w, "Credential not found", http.StatusNotFound)
		return
	}

	c.cache.set(credentialID, credential)
	c.sendSuccess(w, credential)
}

// GetUserCredentials retrieves all credentials for a user
func (c *CredentialIssuer) GetUserCredentials(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		c.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}

	// Get token IDs for the DID
	tokenIDs, err := c.blockchainClient.GetCredentialsByDID(did)
	if err != nil {
		c.sendError(w, "Failed to retrieve credentials", http.StatusInternalServerError)
		return
	}

	credentials := make([]*models.Credential, 0, len(tokenIDs))
	for _, tokenID := range tokenIDs {
		cred, err := c.blockchainClient.GetCredential(tokenID)
		if err != nil {
			c.logger.Error("Failed to get credential %d: %v", tokenID, err)
			continue
		}
		credentials = append(credentials, cred)
	}

	response := models.UserCredentialsResponse{
		DID:         did,
		Credentials: credentials,
		Total:       len(credentials),
	}

	c.sendSuccess(w, response)
}

// ==================== Credential Verification ====================

// VerifyCredential verifies a credential's validity
func (c *CredentialIssuer) VerifyCredential(w http.ResponseWriter, req *http.Request) {
	var verifyReq VerifyCredentialRequest
	if err := json.NewDecoder(req.Body).Decode(&verifyReq); err != nil {
		c.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if verifyReq.CredentialID == "" && verifyReq.TokenID == 0 {
		c.sendError(w, "Either credential ID or token ID is required", http.StatusBadRequest)
		return
	}

	var credential *models.Credential
	var err error

	if verifyReq.TokenID > 0 {
		credential, err = c.blockchainClient.GetCredential(verifyReq.TokenID)
	} else {
		credential, err = c.blockchainClient.GetCredentialByID(verifyReq.CredentialID)
	}

	if err != nil {
		c.sendError(w, "Credential not found", http.StatusNotFound)
		return
	}

	// Check validity
	isValid := credential.IsActive && !credential.IsRevoked
	if credential.ExpiresAt > 0 && credential.ExpiresAt < uint64(time.Now().Unix()) {
		isValid = false
	}

	// If ZKP proof provided, verify it
	zkpValid := true
	if verifyReq.Proof != nil && credential.ZKPCompatible {
		zkpValid, err = c.zkpService.VerifyCredentialProof(credential, verifyReq.Proof)
		if err != nil {
			zkpValid = false
		}
	}

	response := models.CredentialVerificationResponse{
		CredentialID:   credential.CredentialID,
		TokenID:        credential.TokenID,
		CredentialType: credential.CredentialType,
		IsValid:        isValid,
		IsRevoked:      credential.IsRevoked,
		IsExpired:      credential.ExpiresAt > 0 && credential.ExpiresAt < uint64(time.Now().Unix()),
		ZKPVerified:    zkpValid,
		VerifiedAt:     time.Now(),
	}

	c.sendSuccess(w, response)
}

// VerifyCredentialZKP verifies a credential using Zero-Knowledge Proof
func (c *CredentialIssuer) VerifyCredentialZKP(w http.ResponseWriter, req *http.Request) {
	var zkpReq struct {
		TokenID        uint64                   `json:"tokenId"`
		Proof          map[string]interface{}   `json:"proof"`
		PublicSignals  []string                 `json:"publicSignals"`
		RevealedAttributes map[string]interface{} `json:"revealedAttributes,omitempty"`
	}

	if err := json.NewDecoder(req.Body).Decode(&zkpReq); err != nil {
		c.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if zkpReq.TokenID == 0 {
		c.sendError(w, "Token ID is required", http.StatusBadRequest)
		return
	}

	// Get credential
	credential, err := c.blockchainClient.GetCredential(zkpReq.TokenID)
	if err != nil {
		c.sendError(w, "Credential not found", http.StatusNotFound)
		return
	}

	if !credential.ZKPCompatible {
		c.sendError(w, "Credential does not support ZKP verification", http.StatusBadRequest)
		return
	}

	// Verify ZKP
	isValid, err := c.zkpService.VerifyCredentialZKP(credential, zkpReq.Proof, zkpReq.PublicSignals)
	if err != nil {
		c.logger.Error("ZKP verification failed: %v", err)
		c.sendError(w, "ZKP verification failed", http.StatusBadRequest)
		return
	}

	response := map[string]interface{}{
		"verified":          isValid,
		"tokenId":           zkpReq.TokenID,
		"credentialType":    credential.CredentialType,
		"verificationTime":  time.Now(),
		"revealedAttributes": zkpReq.RevealedAttributes,
	}

	c.sendSuccess(w, response)
}

// ==================== Credential Revocation ====================

// RevokeCredential revokes an issued credential
func (c *CredentialIssuer) RevokeCredential(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	tokenIDStr := vars["tokenId"]
	
	tokenID, err := strconv.ParseUint(tokenIDStr, 10, 64)
	if err != nil {
		c.sendError(w, "Invalid token ID", http.StatusBadRequest)
		return
	}

	var revokeReq struct {
		Reason string `json:"reason"`
	}

	json.NewDecoder(req.Body).Decode(&revokeReq)

	c.logger.Info("Revoking credential %d: %s", tokenID, revokeReq.Reason)

	// Revoke on blockchain
	txHash, err := c.blockchainClient.RevokeCredential(tokenID, revokeReq.Reason)
	if err != nil {
		c.logger.Error("Failed to revoke credential: %v", err)
		c.sendError(w, "Failed to revoke credential", http.StatusInternalServerError)
		return
	}

	// Clear from cache
	c.cache.delete(tokenIDStr)

	response := models.RevokeCredentialResponse{
		TokenID:     tokenID,
		Revoked:     true,
		Reason:      revokeReq.Reason,
		TxHash:      txHash,
		RevokedAt:   time.Now(),
	}

	c.sendSuccess(w, response)
}

// ==================== Credential Request ====================

// RequestCredential handles credential requests from users
func (c *CredentialIssuer) RequestCredential(w http.ResponseWriter, req *http.Request) {
	var requestReq struct {
		HolderDID      string                 `json:"holderDID"`
		CredentialType string                 `json:"credentialType"`
		Requirements   map[string]interface{} `json:"requirements"`
		CallbackURL    string                 `json:"callbackURL,omitempty"`
	}

	if err := json.NewDecoder(req.Body).Decode(&requestReq); err != nil {
		c.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if requestReq.HolderDID == "" || requestReq.CredentialType == "" {
		c.sendError(w, "Holder DID and credential type are required", http.StatusBadRequest)
		return
	}

	// Create credential request
	requestID := uuid.New().String()
	credentialRequest := models.CredentialRequest{
		RequestID:      requestID,
		HolderDID:      requestReq.HolderDID,
		CredentialType: requestReq.CredentialType,
		Requirements:   requestReq.Requirements,
		Status:         "pending",
		RequestedAt:    time.Now(),
		CallbackURL:    requestReq.CallbackURL,
	}

	// Store request (in production, save to database)
	// For now, just return the request ID

	response := map[string]interface{}{
		"requestId":      requestID,
		"status":         "pending",
		"message":        "Credential request submitted. Awaiting issuer approval.",
		"requestDetails": credentialRequest,
	}

	c.sendSuccess(w, response)
}

// ==================== Helper Methods ====================

// createVerifiableCredential creates a W3C verifiable credential
func (c *CredentialIssuer) createVerifiableCredential(
	id, holderDID, issuerDID, credentialType string,
	credentialData map[string]interface{},
	expiresAt *time.Time,
) map[string]interface{} {
	credential := map[string]interface{}{
		"@context": []string{
			"https://www.w3.org/2018/credentials/v1",
			"https://www.w3.org/2018/credentials/examples/v1",
		},
		"id":                  id,
		"type":                []string{"VerifiableCredential", credentialType},
		"issuer":              issuerDID,
		"issuanceDate":        time.Now().Format(time.RFC3339),
		"credentialSubject": map[string]interface{}{
			"id":   holderDID,
			"data": credentialData,
		},
		"credentialStatus": map[string]interface{}{
			"id":   fmt.Sprintf("%s#status", id),
			"type": "CredentialStatusList2020",
		},
	}

	if expiresAt != nil {
		credential["expirationDate"] = expiresAt.Format(time.RFC3339)
	}

	// Add proof placeholder (would be signed in production)
	credential["proof"] = map[string]interface{}{
		"type":               "Ed25519Signature2020",
		"created":            time.Now().Format(time.RFC3339),
		"verificationMethod": fmt.Sprintf("%s#keys-1", issuerDID),
		"proofPurpose":       "assertionMethod",
	}

	return credential
}

// hashCredentialData hashes credential data for blockchain storage
func (c *CredentialIssuer) hashCredentialData(credential map[string]interface{}) string {
	data := c.toJSON(credential)
	return fmt.Sprintf("0x%x", c.hashString(data))
}

// hashString creates a SHA256 hash of a string
func (c *CredentialIssuer) hashString(s string) string {
	hash := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", hash[:])
}

// toJSON converts an object to JSON string
func (c *CredentialIssuer) toJSON(obj interface{}) string {
	data, _ := json.Marshal(obj)
	return string(data)
}

// ==================== Cache Management ====================

func (c *CredentialCache) get(key string) *models.Credential {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.entries[key]
	if !exists {
		return nil
	}

	if time.Now().After(entry.ExpiresAt) {
		return nil
	}

	return entry.Credential
}

func (c *CredentialCache) set(key string, credential *models.Credential) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.entries[key] = &CredentialCacheEntry{
		Credential: credential,
		ExpiresAt:  time.Now().Add(c.ttl),
	}
}

func (c *CredentialCache) delete(key string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}

// ==================== Response Helpers ====================

func (c *CredentialIssuer) sendSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

func (c *CredentialIssuer) sendError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// ==================== Health Check ====================

func (c *CredentialIssuer) HealthCheck(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"service":   "credential-issuer",
		"timestamp": time.Now(),
	})
}
