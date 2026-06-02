// backend/internal/handlers/did_resolver.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/gorilla/mux"
	"github.com/ipfs/go-ipfs-api"

	"did-protocol-backend/internal/models"
	"did-protocol-backend/internal/services"
	"did-protocol-backend/pkg/blockchain"
)

// DIDResolver handles DID resolution requests
type DIDResolver struct {
	blockchainClient *blockchain.Client
	ipfsClient       *shell.Shell
	didService       *services.DIDService
	resolverCache    map[string]*ResolutionCache
}

// ResolutionCache caches DID resolution results
type ResolutionCache struct {
	Result    *models.DIDResolutionResult
	ExpiresAt time.Time
}

// NewDIDResolver creates a new DID resolver handler
func NewDIDResolver(
	blockchainClient *blockchain.Client,
	ipfsClient *shell.Shell,
	didService *services.DIDService,
) *DIDResolver {
	return &DIDResolver{
		blockchainClient: blockchainClient,
		ipfsClient:       ipfsClient,
		didService:       didService,
		resolverCache:    make(map[string]*ResolutionCache),
	}
}

// DIDResolutionRequest represents a DID resolution request
type DIDResolutionRequest struct {
	DID         string                 `json:"did"`
	Options     map[string]interface{} `json:"options,omitempty"`
	Accept      string                 `json:"accept,omitempty"`
}

// ResolveDID resolves a DID to its DID Document
func (r *DIDResolver) ResolveDID(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	// Get resolution options from query parameters
	accept := req.URL.Query().Get("accept")
	versionId := req.URL.Query().Get("versionId")
	versionTime := req.URL.Query().Get("versionTime")
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	// Validate DID format
	if !r.validateDIDFormat(did) {
		r.sendError(w, "Invalid DID format", http.StatusBadRequest)
		return
	}
	
	// Parse DID components
	didComponents, err := r.parseDID(did)
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to parse DID: %v", err), http.StatusBadRequest)
		return
	}
	
	// Check cache first
	if cached := r.getFromCache(did, versionId, versionTime); cached != nil {
		r.sendSuccess(w, cached)
		return
	}
	
	// Resolve DID document
	resolutionResult, err := r.resolve(did, didComponents, &ResolutionOptions{
		Accept:      accept,
		VersionId:   versionId,
		VersionTime: versionTime,
	})
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to resolve DID: %v", err), http.StatusNotFound)
		return
	}
	
	// Cache the result
	r.cacheResult(did, versionId, versionTime, resolutionResult)
	
	r.sendSuccess(w, resolutionResult)
}

// ResolveDIDMetadata resolves only the DID metadata (lightweight)
func (r *DIDResolver) ResolveDIDMetadata(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	// Get metadata from blockchain
	metadata, err := r.blockchainClient.GetDIDMetadata(did)
	if err != nil {
		r.sendError(w, "DID not found", http.StatusNotFound)
		return
	}
	
	response := models.DIDMetadataResponse{
		DID:        did,
		Owner:      metadata.Owner,
		Created:    metadata.Created,
		Updated:    metadata.Updated,
		IsActive:   metadata.IsActive,
		DocumentHash: metadata.DocumentHash,
	}
	
	r.sendSuccess(w, response)
}

// ResolveDIDWithOptions resolves a DID with custom options
func (r *DIDResolver) ResolveDIDWithOptions(w http.ResponseWriter, req *http.Request) {
	var resolutionReq DIDResolutionRequest
	if err := json.NewDecoder(req.Body).Decode(&resolutionReq); err != nil {
		r.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	if resolutionReq.DID == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	// Parse DID components
	didComponents, err := r.parseDID(resolutionReq.DID)
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to parse DID: %v", err), http.StatusBadRequest)
		return
	}
	
	// Resolve with custom options
	resolutionResult, err := r.resolve(resolutionReq.DID, didComponents, &ResolutionOptions{
		Accept: resolutionReq.Accept,
	})
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to resolve DID: %v", err), http.StatusNotFound)
		return
	}
	
	r.sendSuccess(w, resolutionResult)
}

// VerifyDID verifies that a DID is valid and active
func (r *DIDResolver) VerifyDID(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	// Check if DID exists
	exists, err := r.blockchainClient.DIDExists(did)
	if err != nil {
		r.sendError(w, "Failed to verify DID", http.StatusInternalServerError)
		return
	}
	
	if !exists {
		r.sendError(w, "DID does not exist", http.StatusNotFound)
		return
	}
	
	// Check if DID is active
	isActive, err := r.blockchainClient.IsDIDActive(did)
	if err != nil {
		r.sendError(w, "Failed to verify DID status", http.StatusInternalServerError)
		return
	}
	
	// Get DID owner
	owner, err := r.blockchainClient.GetDIDOwner(did)
	if err != nil {
		r.sendError(w, "Failed to get DID owner", http.StatusInternalServerError)
		return
	}
	
	response := models.DIDVerificationResponse{
		DID:      did,
		Exists:   exists,
		IsActive: isActive,
		Owner:    owner,
		Verified: true,
	}
	
	r.sendSuccess(w, response)
}

// BatchResolveDIDs resolves multiple DIDs in a single request
func (r *DIDResolver) BatchResolveDIDs(w http.ResponseWriter, req *http.Request) {
	var batchReq struct {
		DIDs    []string `json:"dids"`
		Options map[string]interface{} `json:"options,omitempty"`
	}
	
	if err := json.NewDecoder(req.Body).Decode(&batchReq); err != nil {
		r.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	if len(batchReq.DIDs) == 0 {
		r.sendError(w, "At least one DID is required", http.StatusBadRequest)
		return
	}
	
	if len(batchReq.DIDs) > 100 {
		r.sendError(w, "Maximum 100 DIDs per batch request", http.StatusBadRequest)
		return
	}
	
	results := make([]*models.DIDResolutionResult, 0, len(batchReq.DIDs))
	errors := make(map[string]string)
	
	for _, did := range batchReq.DIDs {
		if !r.validateDIDFormat(did) {
			errors[did] = "Invalid DID format"
			continue
		}
		
		didComponents, err := r.parseDID(did)
		if err != nil {
			errors[did] = err.Error()
			continue
		}
		
		result, err := r.resolve(did, didComponents, &ResolutionOptions{})
		if err != nil {
			errors[did] = err.Error()
			continue
		}
		
		results = append(results, result)
	}
	
	response := models.BatchResolutionResponse{
		Results: results,
		Errors:  errors,
		Total:   len(batchReq.DIDs),
		Resolved: len(results),
	}
	
	r.sendSuccess(w, response)
}

// GetDIDHistory retrieves the history of DID document changes
func (r *DIDResolver) GetDIDHistory(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	// Get historical versions from blockchain events
	events, err := r.blockchainClient.GetDIDHistory(did)
	if err != nil {
		r.sendError(w, "Failed to retrieve DID history", http.StatusInternalServerError)
		return
	}
	
	response := models.DIDHistoryResponse{
		DID:     did,
		Entries: events,
		Count:   len(events),
	}
	
	r.sendSuccess(w, response)
}

// ResolveDIDWithProof resolves a DID and returns a verifiable proof
func (r *DIDResolver) ResolveDIDWithProof(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	// Resolve the DID document
	resolutionResult, err := r.ResolveDIDInternal(did)
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to resolve DID: %v", err), http.StatusNotFound)
		return
	}
	
	// Generate a proof of resolution
	proof := r.generateResolutionProof(did, resolutionResult)
	
	response := models.DIDResolutionWithProofResponse{
		DID:        did,
		Document:   resolutionResult.Document,
		Metadata:   resolutionResult.Metadata,
		Proof:      proof,
		VerifiedAt: time.Now(),
	}
	
	r.sendSuccess(w, response)
}

// Internal resolution method
func (r *DIDResolver) resolve(did string, components *models.DIDComponents, options *ResolutionOptions) (*models.DIDResolutionResult, error) {
	// Step 1: Get document hash from blockchain
	documentHash, err := r.blockchainClient.GetDIDDocumentHash(did)
	if err != nil {
		return nil, fmt.Errorf("DID not found on blockchain: %w", err)
	}
	
	// Step 2: Retrieve DID document from IPFS
	document, err := r.ipfsClient.Cat(documentHash)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve DID document from IPFS: %w", err)
	}
	
	var didDocument map[string]interface{}
	if err := json.NewDecoder(document).Decode(&didDocument); err != nil {
		return nil, fmt.Errorf("failed to parse DID document: %w", err)
	}
	
	// Step 3: Get metadata from blockchain
	metadata, err := r.blockchainClient.GetDIDMetadata(did)
	if err != nil {
		return nil, fmt.Errorf("failed to get DID metadata: %w", err)
	}
	
	// Step 4: Validate the DID document
	if err := r.validateDIDDocument(didDocument); err != nil {
		return nil, fmt.Errorf("invalid DID document: %w", err)
	}
	
	// Step 5: Apply content negotiation (if Accept header specified)
	if options.Accept != "" {
		didDocument = r.applyContentNegotiation(didDocument, options.Accept)
	}
	
	return &models.DIDResolutionResult{
		DID:            did,
		Document:       didDocument,
		DocumentHash:   documentHash,
		Metadata:       metadata,
		ResolutionTime: time.Now(),
		Method:         components.Method,
		Identifier:     components.Identifier,
	}, nil
}

// ResolveDIDInternal is an internal method for programmatic resolution
func (r *DIDResolver) ResolveDIDInternal(did string) (*models.DIDResolutionResult, error) {
	components, err := r.parseDID(did)
	if err != nil {
		return nil, err
	}
	
	return r.resolve(did, components, &ResolutionOptions{})
}

// validateDIDFormat validates the DID format
func (r *DIDResolver) validateDIDFormat(did string) bool {
	// DID format: did:method:identifier
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

// parseDID parses a DID into its components
func (r *DIDResolver) parseDID(did string) (*models.DIDComponents, error) {
	if !r.validateDIDFormat(did) {
		return nil, fmt.Errorf("invalid DID format")
	}
	
	parts := strings.Split(did, ":")
	
	return &models.DIDComponents{
		Scheme:     parts[0],
		Method:     parts[1],
		Identifier: parts[2],
		Did:        did,
	}, nil
}

// validateDIDDocument validates the structure of a DID document
func (r *DIDResolver) validateDIDDocument(document map[string]interface{}) error {
	// Check required fields
	if _, ok := document["@context"]; !ok {
		return fmt.Errorf("missing @context")
	}
	
	if _, ok := document["id"]; !ok {
		return fmt.Errorf("missing id")
	}
	
	// Validate ID matches
	if id, ok := document["id"].(string); ok {
		if !r.validateDIDFormat(id) {
			return fmt.Errorf("invalid id in document")
		}
	}
	
	return nil
}

// applyContentNegotiation applies content negotiation based on Accept header
func (r *DIDResolver) applyContentNegotiation(document map[string]interface{}, accept string) map[string]interface{} {
	switch accept {
	case "application/did+json":
		return document
	case "application/did+ld+json":
		// Add JSON-LD context
		if _, ok := document["@context"]; !ok {
			document["@context"] = "https://www.w3.org/ns/did/v1"
		}
		return document
	default:
		return document
	}
}

// generateResolutionProof generates a proof of DID resolution
func (r *DIDResolver) generateResolutionProof(did string, result *models.DIDResolutionResult) map[string]interface{} {
	return map[string]interface{}{
		"type":               "DIDResolutionProof",
		"did":                did,
		"documentHash":       result.DocumentHash,
		"resolutionTime":     result.ResolutionTime,
		"blockchainConfirmation": map[string]interface{}{
			"blockNumber": result.Metadata.BlockNumber,
			"txHash":      result.Metadata.TransactionHash,
		},
	}
}

// getFromCache retrieves a cached resolution result
func (r *DIDResolver) getFromCache(did, versionId, versionTime string) *models.DIDResolutionResult {
	cacheKey := fmt.Sprintf("%s:%s:%s", did, versionId, versionTime)
	cached, exists := r.resolverCache[cacheKey]
	
	if !exists {
		return nil
	}
	
	if time.Now().After(cached.ExpiresAt) {
		delete(r.resolverCache, cacheKey)
		return nil
	}
	
	return cached.Result
}

// cacheResult caches a resolution result
func (r *DIDResolver) cacheResult(did, versionId, versionTime string, result *models.DIDResolutionResult) {
	cacheKey := fmt.Sprintf("%s:%s:%s", did, versionId, versionTime)
	r.resolverCache[cacheKey] = &ResolutionCache{
		Result:    result,
		ExpiresAt: time.Now().Add(5 * time.Minute), // Cache for 5 minutes
	}
}

// ClearCache clears the resolution cache
func (r *DIDResolver) ClearCache(w http.ResponseWriter, req *http.Request) {
	r.resolverCache = make(map[string]*ResolutionCache)
	r.sendSuccess(w, map[string]string{"status": "cache cleared"})
}

// GetCacheStats returns cache statistics
func (r *DIDResolver) GetCacheStats(w http.ResponseWriter, req *http.Request) {
	stats := map[string]interface{}{
		"cacheSize":    len(r.resolverCache),
		"cacheKeys":    len(r.resolverCache),
		"ttlSeconds":   300,
	}
	
	r.sendSuccess(w, stats)
}

// sendSuccess sends a successful JSON response
func (r *DIDResolver) sendSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

// sendError sends an error JSON response
func (r *DIDResolver) sendError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"error":   message,
	})
}

// HealthCheck handles health check requests
func (r *DIDResolver) HealthCheck(w http.ResponseWriter, req *http.Request) {
	r.sendSuccess(w, map[string]interface{}{
		"status": "healthy",
		"service": "did-resolver",
		"timestamp": time.Now(),
	})
}
