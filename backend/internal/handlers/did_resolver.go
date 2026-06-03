// backend/internal/handlers/did_resolver.go
package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/gorilla/mux"
	shell "github.com/ipfs/go-ipfs-api"

	"did-protocol-backend/internal/models"
	"did-protocol-backend/internal/services"
	"did-protocol-backend/pkg/blockchain"
)

// DIDResolver handles all DID resolution operations
type DIDResolver struct {
	blockchainClient *blockchain.Client
	ipfsClient       *shell.Shell
	didService       *services.DIDService
	cache            *ResolutionCache
	logger           *Logger
}

// ResolutionCache manages caching of DID resolutions
type ResolutionCache struct {
	entries map[string]*CacheEntry
	mu      sync.RWMutex
	ttl     time.Duration
}

// CacheEntry represents a single cache entry
type CacheEntry struct {
	Result    *models.DIDResolutionResult
	ExpiresAt time.Time
}

// ResolutionOptions contains options for DID resolution
type ResolutionOptions struct {
	Accept      string
	VersionId   string
	VersionTime string
	NoCache     bool
}

// Logger is a simple logger for the handler
type Logger struct {
	enabled bool
}

func (l *Logger) Info(format string, args ...interface{}) {
	if l.enabled {
		fmt.Printf("[INFO] "+format+"\n", args...)
	}
}

func (l *Logger) Error(format string, args ...interface{}) {
	if l.enabled {
		fmt.Printf("[ERROR] "+format+"\n", args...)
	}
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
		cache: &ResolutionCache{
			entries: make(map[string]*CacheEntry),
			ttl:     5 * time.Minute,
		},
		logger: &Logger{enabled: true},
	}
}

// ==================== Main Resolution Endpoints ====================

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
	
	r.logger.Info("Resolving DID: %s", did)
	
	// Validate DID format
	if !r.validateDIDFormat(did) {
		r.sendError(w, "Invalid DID format. Expected format: did:method:identifier", http.StatusBadRequest)
		return
	}
	
	// Parse DID components
	didComponents, err := r.parseDID(did)
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to parse DID: %v", err), http.StatusBadRequest)
		return
	}
	
	// Check cache first
	if !req.URL.Query().Has("nocache") {
		if cached := r.cache.get(did, versionId, versionTime); cached != nil {
			r.logger.Info("Cache hit for DID: %s", did)
			r.sendSuccess(w, cached)
			return
		}
	}
	
	// Resolve DID document
	resolutionResult, err := r.resolve(did, didComponents, &ResolutionOptions{
		Accept:      accept,
		VersionId:   versionId,
		VersionTime: versionTime,
	})
	if err != nil {
		r.logger.Error("Failed to resolve DID %s: %v", did, err)
		r.sendError(w, fmt.Sprintf("Failed to resolve DID: %v", err), http.StatusNotFound)
		return
	}
	
	// Cache the result
	r.cache.set(did, versionId, versionTime, resolutionResult)
	
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
	
	r.logger.Info("Resolving metadata for DID: %s", did)
	
	// Validate DID format
	if !r.validateDIDFormat(did) {
		r.sendError(w, "Invalid DID format", http.StatusBadRequest)
		return
	}
	
	// Get metadata from blockchain
	metadata, err := r.blockchainClient.GetDIDMetadata(did)
	if err != nil {
		r.logger.Error("Failed to get metadata for %s: %v", did, err)
		r.sendError(w, "DID not found", http.StatusNotFound)
		return
	}
	
	// Get document from IPFS to get additional metadata
	documentHash := metadata.DocumentHash
	var profile map[string]interface{}
	
	if documentHash != "" {
		document, err := r.ipfsClient.Cat(documentHash)
		if err == nil {
			var didDoc map[string]interface{}
			if json.NewDecoder(document).Decode(&didDoc) == nil {
				if p, ok := didDoc["profile"]; ok {
					profile = p.(map[string]interface{})
				}
			}
		}
	}
	
	response := models.DIDMetadataResponse{
		DID:          did,
		Owner:        metadata.Owner,
		Created:      metadata.Created,
		Updated:      metadata.Updated,
		IsActive:     metadata.IsActive,
		DocumentHash: documentHash,
		Profile:      profile,
	}
	
	r.sendSuccess(w, response)
}

// ResolveDIDWithOptions resolves a DID with custom options via POST
func (r *DIDResolver) ResolveDIDWithOptions(w http.ResponseWriter, req *http.Request) {
	var resolutionReq models.DIDResolutionRequest
	if err := json.NewDecoder(req.Body).Decode(&resolutionReq); err != nil {
		r.sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	
	if resolutionReq.DID == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	r.logger.Info("Resolving DID with options: %s", resolutionReq.DID)
	
	// Validate DID format
	if !r.validateDIDFormat(resolutionReq.DID) {
		r.sendError(w, "Invalid DID format", http.StatusBadRequest)
		return
	}
	
	// Parse DID components
	didComponents, err := r.parseDID(resolutionReq.DID)
	if err != nil {
		r.sendError(w, fmt.Sprintf("Failed to parse DID: %v", err), http.StatusBadRequest)
		return
	}
	
	// Check cache
	if !resolutionReq.Options["nocache"].(bool) {
		versionId, _ := resolutionReq.Options["versionId"].(string)
		versionTime, _ := resolutionReq.Options["versionTime"].(string)
		if cached := r.cache.get(resolutionReq.DID, versionId, versionTime); cached != nil {
			r.sendSuccess(w, cached)
			return
		}
	}
	
	// Resolve with custom options
	resolutionResult, err := r.resolve(resolutionReq.DID, didComponents, &ResolutionOptions{
		Accept:      resolutionReq.Accept,
		VersionId:   resolutionReq.Options["versionId"].(string),
		VersionTime: resolutionReq.Options["versionTime"].(string),
	})
	if err != nil {
		r.logger.Error("Failed to resolve DID %s: %v", resolutionReq.DID, err)
		r.sendError(w, fmt.Sprintf("Failed to resolve DID: %v", err), http.StatusNotFound)
		return
	}
	
	// Cache the result
	r.cache.set(resolutionReq.DID, "", "", resolutionResult)
	
	r.sendSuccess(w, resolutionResult)
}

// ==================== Batch Resolution ====================

// BatchResolveDIDs resolves multiple DIDs in a single request
func (r *DIDResolver) BatchResolveDIDs(w http.ResponseWriter, req *http.Request) {
	var batchReq struct {
		DIDs    []string               `json:"dids"`
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
	
	r.logger.Info("Batch resolving %d DIDs", len(batchReq.DIDs))
	
	results := make([]*models.DIDResolutionResult, 0, len(batchReq.DIDs))
	errors := make(map[string]string)
	
	for _, did := range batchReq.DIDs {
		// Validate DID format
		if !r.validateDIDFormat(did) {
			errors[did] = "Invalid DID format"
			continue
		}
		
		// Parse DID components
		didComponents, err := r.parseDID(did)
		if err != nil {
			errors[did] = err.Error()
			continue
		}
		
		// Resolve
		result, err := r.resolve(did, didComponents, &ResolutionOptions{})
		if err != nil {
			errors[did] = err.Error()
			continue
		}
		
		results = append(results, result)
	}
	
	response := models.BatchResolutionResponse{
		Results:  results,
		Errors:   errors,
		Total:    len(batchReq.DIDs),
		Resolved: len(results),
	}
	
	r.sendSuccess(w, response)
}

// ==================== Verification Endpoints ====================

// VerifyDID verifies that a DID is valid and active
func (r *DIDResolver) VerifyDID(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	r.logger.Info("Verifying DID: %s", did)
	
	// Check if DID exists
	exists, err := r.blockchainClient.DIDExists(did)
	if err != nil {
		r.logger.Error("Failed to check DID existence: %v", err)
		r.sendError(w, "Failed to verify DID", http.StatusInternalServerError)
		return
	}
	
	if !exists {
		response := models.DIDVerificationResponse{
			DID:      did,
			Exists:   false,
			IsActive: false,
			Verified: false,
			Message:  "DID does not exist",
		}
		r.sendSuccess(w, response)
		return
	}
	
	// Check if DID is active
	isActive, err := r.blockchainClient.IsDIDActive(did)
	if err != nil {
		r.logger.Error("Failed to check DID active status: %v", err)
		r.sendError(w, "Failed to verify DID status", http.StatusInternalServerError)
		return
	}
	
	// Get DID owner
	owner, err := r.blockchainClient.GetDIDOwner(did)
	if err != nil {
		r.logger.Error("Failed to get DID owner: %v", err)
		r.sendError(w, "Failed to get DID owner", http.StatusInternalServerError)
		return
	}
	
	response := models.DIDVerificationResponse{
		DID:      did,
		Exists:   exists,
		IsActive: isActive,
		Owner:    owner,
		Verified: true,
		Message:  "DID is valid and active",
	}
	
	r.sendSuccess(w, response)
}

// VerifyDIDOwnership verifies that an address owns a DID
func (r *DIDResolver) VerifyDIDOwnership(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	address := vars["address"]
	
	if did == "" || address == "" {
		r.sendError(w, "DID and address are required", http.StatusBadRequest)
		return
	}
	
	// Validate Ethereum address
	if !common.IsHexAddress(address) {
		r.sendError(w, "Invalid Ethereum address", http.StatusBadRequest)
		return
	}
	
	// Get DID owner
	owner, err := r.blockchainClient.GetDIDOwner(did)
	if err != nil {
		r.sendError(w, "Failed to get DID owner", http.StatusInternalServerError)
		return
	}
	
	isOwner := strings.EqualFold(owner, address)
	
	response := map[string]interface{}{
		"did":       did,
		"address":   address,
		"owner":     owner,
		"isOwner":   isOwner,
		"verified":  isOwner,
	}
	
	r.sendSuccess(w, response)
}

// ==================== History Endpoints ====================

// GetDIDHistory retrieves the history of DID document changes
func (r *DIDResolver) GetDIDHistory(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
	if did == "" {
		r.sendError(w, "DID is required", http.StatusBadRequest)
		return
	}
	
	r.logger.Info("Getting history for DID: %s", did)
	
	// Get historical versions from blockchain events
	events, err := r.blockchainClient.GetDIDHistory(did)
	if err != nil {
		r.logger.Error("Failed to get DID history: %v", err)
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

// GetDIDVersion retrieves a specific version of a DID document
func (r *DIDResolver) GetDIDVersion(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	version := vars["version"]
	
	if did == "" || version == "" {
		r.sendError(w, "DID and version are required", http.StatusBadRequest)
		return
	}
	
	r.logger.Info("Getting version %s of DID: %s", version, did)
	
	// Get specific version from blockchain
	document, err := r.blockchainClient.GetDIDVersion(did, version)
	if err != nil {
		r.logger.Error("Failed to get DID version: %v", err)
		r.sendError(w, "Version not found", http.StatusNotFound)
		return
	}
	
	r.sendSuccess(w, document)
}

// ==================== Resolution with Proof ====================

// ResolveDIDWithProof resolves a DID and returns a verifiable proof
func (r *DIDResolver) ResolveDIDWithProof(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	did := vars["did"]
	
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
	
	// Resolve the DID document
	resolutionResult, err := r.resolve(did, didComponents, &ResolutionOptions{})
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

// ==================== Internal Resolution Logic ====================

// resolve performs the actual DID resolution
func (r *DIDResolver) resolve(did string, components *models.DIDComponents, options *ResolutionOptions) (*models.DIDResolutionResult, error) {
	// Step 1: Get document hash from blockchain
	documentHash, err := r.blockchainClient.GetDIDDocumentHash(did)
	if err != nil {
		return nil, fmt.Errorf("DID not found on blockchain: %w", err)
	}
	
	// Step 2: Retrieve DID document from IPFS
	documentReader, err := r.ipfsClient.Cat(documentHash)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve DID document from IPFS: %w", err)
	}
	
	var didDocument map[string]interface{}
	if err := json.NewDecoder(documentReader).Decode(&didDocument); err != nil {
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
	
	// Step 6: Add service endpoints from DID document
	services := r.extractServices(didDocument)
	
	return &models.DIDResolutionResult{
		DID:            did,
		Document:       didDocument,
		DocumentHash:   documentHash,
		Metadata:       metadata,
		ResolutionTime: time.Now(),
		Method:         components.Method,
		Identifier:     components.Identifier,
		Services:       services,
	}, nil
}

// ==================== Validation Methods ====================

// validateDIDFormat validates the DID format according to W3C spec
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
	
	// Method should only contain lowercase alphanumeric and hyphens
	methodRegex := `^[a-z0-9-]+$`
	if !regexp.MustCompile(methodRegex).MatchString(parts[1]) {
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
	
	// Validate ID matches format
	if id, ok := document["id"].(string); ok {
		if !r.validateDIDFormat(id) {
			return fmt.Errorf("invalid id in document: %s", id)
		}
	}
	
	// Validate verification methods
	if vms, ok := document["verificationMethod"].([]interface{}); ok {
		if len(vms) == 0 {
			return fmt.Errorf("at least one verification method required")
		}
	}
	
	return nil
}

// ==================== Helper Methods ====================

// applyContentNegotiation applies content negotiation based on Accept header
func (r *DIDResolver) applyContentNegotiation(document map[string]interface{}, accept string) map[string]interface{} {
	switch accept {
	case "application/did+json":
		// Return as-is
		return document
	case "application/did+ld+json":
		// Ensure JSON-LD context is present
		if _, ok := document["@context"]; !ok {
			document["@context"] = "https://www.w3.org/ns/did/v1"
		}
		return document
	default:
		return document
	}
}

// extractServices extracts service endpoints from DID document
func (r *DIDResolver) extractServices(document map[string]interface{}) []map[string]interface{} {
	services := []map[string]interface{}{}
	
	if svcs, ok := document["service"].([]interface{}); ok {
		for _, svc := range svcs {
			if service, ok := svc.(map[string]interface{}); ok {
				services = append(services, service)
			}
		}
	}
	
	return services
}

// generateResolutionProof generates a proof of DID resolution
func (r *DIDResolver) generateResolutionProof(did string, result *models.DIDResolutionResult) map[string]interface{} {
	return map[string]interface{}{
		"type":           "DIDResolutionProof",
		"did":            did,
		"documentHash":   result.DocumentHash,
		"resolutionTime": result.ResolutionTime,
		"blockchainConfirmation": map[string]interface{}{
			"blockNumber": result.Metadata.BlockNumber,
			"txHash":      result.Metadata.TransactionHash,
		},
	}
}

// ==================== Cache Management ====================

// get retrieves a cached resolution result
func (c *ResolutionCache) get(did, versionId, versionTime string) *models.DIDResolutionResult {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	cacheKey := fmt.Sprintf("%s:%s:%s", did, versionId, versionTime)
	entry, exists := c.entries[cacheKey]
	
	if !exists {
		return nil
	}
	
	if time.Now().After(entry.ExpiresAt) {
		return nil
	}
	
	return entry.Result
}

// set stores a resolution result in cache
func (c *ResolutionCache) set(did, versionId, versionTime string, result *models.DIDResolutionResult) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	cacheKey := fmt.Sprintf("%s:%s:%s", did, versionId, versionTime)
	c.entries[cacheKey] = &CacheEntry{
		Result:    result,
		ExpiresAt: time.Now().Add(c.ttl),
	}
}

// ClearCache clears the resolution cache
func (r *DIDResolver) ClearCache(w http.ResponseWriter, req *http.Request) {
	r.cache.mu.Lock()
	r.cache.entries = make(map[string]*CacheEntry)
	r.cache.mu.Unlock()
	
	r.sendSuccess(w, map[string]string{"status": "cache cleared"})
}

// GetCacheStats returns cache statistics
func (r *DIDResolver) GetCacheStats(w http.ResponseWriter, req *http.Request) {
	r.cache.mu.RLock()
	cacheSize := len(r.cache.entries)
	r.cache.mu.RUnlock()
	
	stats := map[string]interface{}{
		"cacheSize":    cacheSize,
		"cacheEntries": cacheSize,
		"ttlSeconds":   int(r.cache.ttl.Seconds()),
	}
	
	r.sendSuccess(w, stats)
}

// ==================== Response Helpers ====================

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

// ==================== Health Check ====================

// HealthCheck handles health check requests
func (r *DIDResolver) HealthCheck(w http.ResponseWriter, req *http.Request) {
	// Check blockchain connection
	blockchainHealthy := r.blockchainClient.IsHealthy()
	
	// Check IPFS connection
	ipfsHealthy := r.ipfsClient.IsUp()
	
	status := "healthy"
	code := http.StatusOK
	
	if !blockchainHealthy || !ipfsHealthy {
		status = "degraded"
		code = http.StatusServiceUnavailable
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    status,
		"service":   "did-resolver",
		"timestamp": time.Now(),
		"checks": map[string]bool{
			"blockchain": blockchainHealthy,
			"ipfs":       ipfsHealthy,
		},
	})
}
