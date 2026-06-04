// backend/internal/services/ipfs_service.go
package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"sync"
	"time"

	"github.com/ipfs/go-ipfs-api"
	"github.com/ipfs/interface-go-ipfs-core/path"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/peer"
)

// IPFSService handles all IPFS operations including upload, download, pinning, and DHT operations
type IPFSService struct {
	shell    *shell.Shell
	config   *IPFSConfig
	cache    *IPFSCache
	logger   *IPFSLogger
	mu       sync.RWMutex
}

// IPFSConfig holds configuration for IPFS service
type IPFSConfig struct {
	Host          string
	Port          int
	APIEndpoint   string
	GatewayURL    string
	PinningService string
	EnableCache   bool
	CacheTTL      time.Duration
	MaxRetries    int
	RetryDelay    time.Duration
}

// IPFSCache manages caching of IPFS content
type IPFSCache struct {
	entries map[string]*CacheEntry
	mu      sync.RWMutex
	ttl     time.Duration
}

// CacheEntry represents a cached IPFS object
type CacheEntry struct {
	Data      []byte
	ContentType string
	ExpiresAt time.Time
	AccessCount int64
}

// IPFSLogger handles logging for IPFS operations
type IPFSLogger struct {
	Enabled bool
}

// UploadResult represents the result of an IPFS upload
type UploadResult struct {
	CID         string    `json:"cid"`
	Path        string    `json:"path"`
	Size        int64     `json:"size"`
	Name        string    `json:"name"`
	Timestamp   time.Time `json:"timestamp"`
	GatewayURLs []string  `json:"gatewayUrls"`
}

// PinResult represents the result of pinning content
type PinResult struct {
	CID       string    `json:"cid"`
	Pinned    bool      `json:"pinned"`
	PinTime   time.Time `json:"pinTime"`
	Provider  string    `json:"provider"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
}

// IPFSOperationStats tracks statistics for IPFS operations
type IPFSOperationStats struct {
	TotalUploads   int64         `json:"totalUploads"`
	TotalDownloads int64         `json:"totalDownloads"`
	TotalPins      int64         `json:"totalPins"`
	AverageLatency time.Duration `json:"averageLatency"`
	CacheHitRate   float64       `json:"cacheHitRate"`
}

// NewIPFSService creates a new IPFS service instance
func NewIPFSService(config *IPFSConfig) (*IPFSService, error) {
	if config == nil {
		config = &IPFSConfig{
			Host:          "localhost",
			Port:          5001,
			APIEndpoint:   "http://localhost:5001",
			GatewayURL:    "https://ipfs.io/ipfs/",
			EnableCache:   true,
			CacheTTL:      10 * time.Minute,
			MaxRetries:    3,
			RetryDelay:    1 * time.Second,
		}
	}

	// Create IPFS shell client
	shell := shell.NewShell(config.APIEndpoint)
	
	// Test connection
	if !shell.IsUp() {
		return nil, fmt.Errorf("IPFS node not reachable at %s", config.APIEndpoint)
	}

	service := &IPFSService{
		shell:  shell,
		config: config,
		cache: &IPFSCache{
			entries: make(map[string]*CacheEntry),
			ttl:     config.CacheTTL,
		},
		logger: &IPFSLogger{Enabled: true},
	}

	service.log("IPFS Service initialized", config.APIEndpoint)
	
	return service, nil
}

// ==================== Core IPFS Operations ====================

// UploadJSON uploads JSON data to IPFS
func (s *IPFSService) UploadJSON(data interface{}, options map[string]interface{}) (*UploadResult, error) {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal JSON: %w", err)
	}

	return s.UploadBytes(jsonData, "application/json", options)
}

// UploadBytes uploads raw bytes to IPFS
func (s *IPFSService) UploadBytes(data []byte, contentType string, options map[string]interface{}) (*UploadResult, error) {
	startTime := time.Now()
	
	reader := bytes.NewReader(data)
	cid, err := s.uploadWithRetry(reader, options)
	if err != nil {
		s.logger.Error("Failed to upload bytes: %v", err)
		return nil, fmt.Errorf("upload failed: %w", err)
	}

	result := &UploadResult{
		CID:       cid,
		Size:      int64(len(data)),
		Timestamp: time.Now(),
		GatewayURLs: s.getGatewayURLs(cid),
	}

	s.logger.Info("Uploaded %d bytes to IPFS, CID: %s, duration: %v", 
		len(data), cid, time.Since(startTime))
	
	return result, nil
}

// UploadFile uploads a file to IPFS
func (s *IPFSService) UploadFile(fileHeader *multipart.FileHeader, options map[string]interface{}) (*UploadResult, error) {
	file, err := fileHeader.Open()
	if err != nil {
		return nil, fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	cid, err := s.uploadWithRetry(file, options)
	if err != nil {
		return nil, fmt.Errorf("file upload failed: %w", err)
	}

	result := &UploadResult{
		CID:       cid,
		Size:      fileHeader.Size,
		Name:      fileHeader.Filename,
		Timestamp: time.Now(),
		GatewayURLs: s.getGatewayURLs(cid),
	}

	s.logger.Info("Uploaded file '%s' to IPFS, CID: %s", fileHeader.Filename, cid)
	
	return result, nil
}

// UploadDirectory uploads a directory of files to IPFS
func (s *IPFSService) UploadDirectory(files map[string][]byte, options map[string]interface{}) (*UploadResult, error) {
	// Create a temporary directory structure in memory
	// This is simplified - in production you'd want to create a proper CAR file
	
	var allData []byte
	for name, content := range files {
		allData = append(allData, []byte(name)...)
		allData = append(allData, content...)
	}

	return s.UploadBytes(allData, "application/directory", options)
}

// GetJSON retrieves and parses JSON data from IPFS
func (s *IPFSService) GetJSON(cid string, result interface{}) error {
	data, err := s.GetBytes(cid)
	if err != nil {
		return err
	}

	if err := json.Unmarshal(data, result); err != nil {
		return fmt.Errorf("failed to unmarshal JSON: %w", err)
	}

	return nil
}

// GetBytes retrieves raw bytes from IPFS
func (s *IPFSService) GetBytes(cid string) ([]byte, error) {
	startTime := time.Now()
	
	// Check cache first
	if s.config.EnableCache {
		if cached := s.cache.get(cid); cached != nil {
			s.logger.Info("Cache hit for CID: %s", cid)
			return cached.Data, nil
		}
	}

	// Read from IPFS
	reader, err := s.shell.Cat(cid)
	if err != nil {
		return nil, fmt.Errorf("failed to read from IPFS: %w", err)
	}
	defer reader.Close()

	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read data: %w", err)
	}

	// Cache the result
	if s.config.EnableCache {
		s.cache.set(cid, data, "")
	}

	s.logger.Info("Retrieved %d bytes from IPFS, CID: %s, duration: %v", 
		len(data), cid, time.Since(startTime))
	
	return data, nil
}

// GetFile retrieves a file from IPFS and returns it as a reader
func (s *IPFSService) GetFile(cid string) (io.ReadCloser, error) {
	reader, err := s.shell.Cat(cid)
	if err != nil {
		return nil, fmt.Errorf("failed to get file: %w", err)
	}
	return reader, nil
}

// ==================== Pinning Operations ====================

// PinContent pins content to IPFS to ensure persistence
func (s *IPFSService) PinContent(cid string, options map[string]interface{}) (*PinResult, error) {
	startTime := time.Now()
	
	// Check if already pinned
	isPinned, err := s.IsPinned(cid)
	if err != nil {
		s.logger.Error("Failed to check pin status: %v", err)
	}
	
	if isPinned {
		return &PinResult{
			CID:     cid,
			Pinned:  true,
			PinTime: time.Now(),
		}, nil
	}

	// Pin the content
	err = s.shell.Pin(cid)
	if err != nil {
		return nil, fmt.Errorf("failed to pin content: %w", err)
	}

	result := &PinResult{
		CID:      cid,
		Pinned:   true,
		PinTime:  time.Now(),
		Provider: "local",
	}

	s.logger.Info("Pinned content %s, duration: %v", cid, time.Since(startTime))
	
	return result, nil
}

// UnpinContent removes a pin from IPFS
func (s *IPFSService) UnpinContent(cid string) error {
	err := s.shell.Unpin(cid)
	if err != nil {
		return fmt.Errorf("failed to unpin content: %w", err)
	}
	
	s.logger.Info("Unpinned content: %s", cid)
	return nil
}

// IsPinned checks if content is pinned on IPFS
func (s *IPFSService) IsPinned(cid string) (bool, error) {
	pins, err := s.shell.Pins()
	if err != nil {
		return false, fmt.Errorf("failed to list pins: %w", err)
	}
	
	for _, pin := range pins {
		if pin == cid {
			return true, nil
		}
	}
	
	return false, nil
}

// ListPins returns all pinned CIDs
func (s *IPFSService) ListPins() ([]string, error) {
	pins, err := s.shell.Pins()
	if err != nil {
		return nil, fmt.Errorf("failed to list pins: %w", err)
	}
	
	pinList := make([]string, 0, len(pins))
	for pin := range pins {
		pinList = append(pinList, pin)
	}
	
	return pinList, nil
}

// ==================== DHT Operations ====================

// ProvideContent announces content to the DHT
func (s *IPFSService) ProvideContent(cid string) error {
	err := s.shell.DHTProvide(cid, true)
	if err != nil {
		return fmt.Errorf("failed to provide content: %w", err)
	}
	
	s.logger.Info("Content %s provided to DHT", cid)
	return nil
}

// FindProviders finds peers that have the content
func (s *IPFSService) FindProviders(cid string) ([]peer.AddrInfo, error) {
	providers, err := s.shell.DHTFindProvs(cid)
	if err != nil {
		return nil, fmt.Errorf("failed to find providers: %w", err)
	}
	
	return providers, nil
}

// FindPeer finds a peer in the DHT
func (s *IPFSService) FindPeer(peerID string) (*peer.AddrInfo, error) {
	addrInfo, err := s.shell.DHTFindPeer(peerID)
	if err != nil {
		return nil, fmt.Errorf("failed to find peer: %w", err)
	}
	
	return &addrInfo, nil
}

// ==================== IPNS Operations ====================

// PublishIPNS publishes an IPFS path to IPNS
func (s *IPFSService) PublishIPNS(cid string, keyName string) (string, error) {
	ipnsPath, err := s.shell.Publish(cid, keyName)
	if err != nil {
		return "", fmt.Errorf("failed to publish to IPNS: %w", err)
	}
	
	s.logger.Info("Published %s to IPNS: %s", cid, ipnsPath)
	return ipnsPath, nil
}

// ResolveIPNS resolves an IPNS name to an IPFS path
func (s *IPFSService) ResolveIPNS(ipnsName string) (string, error) {
	path, err := s.shell.Resolve(ipnsName)
	if err != nil {
		return "", fmt.Errorf("failed to resolve IPNS: %w", err)
	}
	
	return path, nil
}

// ==================== MFS (Mutable File System) Operations ====================

// WriteToMFS writes content to MFS
func (s *IPFSService) WriteToMFS(path string, data []byte) error {
	reader := bytes.NewReader(data)
	err := s.shell.FilesWrite(path, reader, shell.FilesWrite.Create(true))
	if err != nil {
		return fmt.Errorf("failed to write to MFS: %w", err)
	}
	
	s.logger.Info("Wrote %d bytes to MFS path: %s", len(data), path)
	return nil
}

// ReadFromMFS reads content from MFS
func (s *IPFSService) ReadFromMFS(path string) ([]byte, error) {
	reader, err := s.shell.FilesRead(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read from MFS: %w", err)
	}
	defer reader.Close()
	
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to read data: %w", err)
	}
	
	return data, nil
}

// ListMFSDirectory lists contents of an MFS directory
func (s *IPFSService) ListMFSDirectory(path string) ([]string, error) {
	entries, err := s.shell.FilesLs(path)
	if err != nil {
		return nil, fmt.Errorf("failed to list MFS directory: %w", err)
	}
	
	return entries, nil
}

// ==================== Object Operations ====================

// GetObjectStat returns statistics about an IPFS object
func (s *IPFSService) GetObjectStat(cid string) (*shell.ObjectStat, error) {
	stat, err := s.shell.ObjectStat(cid)
	if err != nil {
		return nil, fmt.Errorf("failed to get object stats: %w", err)
	}
	
	return stat, nil
}

// GetObjectLinks returns the links of an IPFS object
func (s *IPFSService) GetObjectLinks(cid string) ([]shell.Link, error) {
	links, err := s.shell.ObjectLinks(cid)
	if err != nil {
		return nil, fmt.Errorf("failed to get object links: %w", err)
	}
	
	return links, nil
}

// ==================== Gateway Operations ====================

// GetGatewayURL returns the gateway URL for a CID
func (s *IPFSService) GetGatewayURL(cid string) string {
	return fmt.Sprintf("%s%s", s.config.GatewayURL, cid)
}

// getGatewayURLs returns multiple gateway URLs for a CID
func (s *IPFSService) getGatewayURLs(cid string) []string {
	gateways := []string{
		fmt.Sprintf("https://ipfs.io/ipfs/%s", cid),
		fmt.Sprintf("https://cloudflare-ipfs.com/ipfs/%s", cid),
		fmt.Sprintf("https://gateway.pinata.cloud/ipfs/%s", cid),
		fmt.Sprintf("https://dweb.link/ipfs/%s", cid),
	}
	
	if s.config.GatewayURL != "" {
		gateways = append([]string{fmt.Sprintf("%s%s", s.config.GatewayURL, cid)}, gateways...)
	}
	
	return gateways
}

// ==================== Utility Functions ====================

// uploadWithRetry attempts to upload with retry logic
func (s *IPFSService) uploadWithRetry(reader io.Reader, options map[string]interface{}) (string, error) {
	var lastErr error
	
	for attempt := 0; attempt < s.config.MaxRetries; attempt++ {
		if attempt > 0 {
			time.Sleep(s.config.RetryDelay)
			s.logger.Info("Retry attempt %d/%d", attempt+1, s.config.MaxRetries)
		}
		
		cid, err := s.shell.Add(reader)
		if err == nil {
			return cid, nil
		}
		
		lastErr = err
		s.logger.Error("Upload attempt %d failed: %v", attempt+1, err)
		
		// Reset reader for retry (if possible)
		if seeker, ok := reader.(io.Seeker); ok {
			seeker.Seek(0, 0)
		}
	}
	
	return "", fmt.Errorf("upload failed after %d attempts: %w", s.config.MaxRetries, lastErr)
}

// IsHealthy checks if the IPFS node is healthy
func (s *IPFSService) IsHealthy() bool {
	return s.shell.IsUp()
}

// GetVersion returns the IPFS node version
func (s *IPFSService) GetVersion() (string, error) {
	version, err := s.shell.Version()
	if err != nil {
		return "", fmt.Errorf("failed to get version: %w", err)
	}
	return version, nil
}

// GetID returns the IPFS node ID
func (s *IPFSService) GetID() (string, error) {
	id, err := s.shell.ID()
	if err != nil {
		return "", fmt.Errorf("failed to get ID: %w", err)
	}
	return id.ID, nil
}

// ==================== Statistics ====================

// GetStats returns statistics about IPFS operations
func (s *IPFSService) GetStats() *IPFSOperationStats {
	stats := &IPFSOperationStats{
		CacheHitRate: s.cache.getHitRate(),
	}
	return stats
}

// ==================== Cache Management ====================

func (c *IPFSCache) get(cid string) *CacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	entry, exists := c.entries[cid]
	if !exists {
		return nil
	}
	
	if time.Now().After(entry.ExpiresAt) {
		return nil
	}
	
	entry.AccessCount++
	return entry
}

func (c *IPFSCache) set(cid string, data []byte, contentType string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	
	c.entries[cid] = &CacheEntry{
		Data:        data,
		ContentType: contentType,
		ExpiresAt:   time.Now().Add(c.ttl),
		AccessCount: 0,
	}
}

func (c *IPFSCache) getHitRate() float64 {
	c.mu.RLock()
	defer c.mu.RUnlock()
	
	var totalAccess int64
	var cacheHits int64
	
	for _, entry := range c.entries {
		totalAccess += entry.AccessCount
		if entry.AccessCount > 0 {
			cacheHits++
		}
	}
	
	if totalAccess == 0 {
		return 0
	}
	
	return float64(cacheHits) / float64(len(c.entries))
}

// ClearCache clears the IPFS cache
func (s *IPFSService) ClearCache() {
	s.cache.mu.Lock()
	s.cache.entries = make(map[string]*CacheEntry)
	s.cache.mu.Unlock()
	
	s.logger.Info("IPFS cache cleared")
}

// ==================== Logging ====================

func (s *IPFSService) log(format string, args ...interface{}) {
	if s.logger.Enabled {
		fmt.Printf("[IPFS Service] "+format+"\n", args...)
	}
}

func (l *IPFSLogger) Info(format string, args ...interface{}) {
	if l.Enabled {
		fmt.Printf("[IPFS INFO] "+format+"\n", args...)
	}
}

func (l *IPFSLogger) Error(format string, args ...interface{}) {
	if l.Enabled {
		fmt.Printf("[IPFS ERROR] "+format+"\n", args...)
	}
}

//see the code above i think we have couple of errors --srinivasa Reddy 
