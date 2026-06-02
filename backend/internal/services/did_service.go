// backend/internal/services/did_service.go
package services

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/ipfs/go-ipfs-api"

	"did-protocol-backend/internal/models"
	"did-protocol-backend/pkg/blockchain"
)

type DIDService struct {
	blockchainClient *blockchain.Client
	ipfsClient       *shell.Shell
}

func NewDIDService(blockchainClient *blockchain.Client, ipfsClient *shell.Shell) *DIDService {
	return &DIDService{
		blockchainClient: blockchainClient,
		ipfsClient:       ipfsClient,
	}
}

func (s *DIDService) CreateDIDDocument(did, publicKey string, profile map[string]interface{}) (map[string]interface{}, error) {
	document := map[string]interface{}{
		"@context": []string{
			"https://www.w3.org/ns/did/v1",
			"https://w3id.org/security/suites/ed25519-2020/v1",
		},
		"id":         did,
		"controller": did,
		"verificationMethod": []map[string]interface{}{
			{
				"id":                 did + "#keys-1",
				"type":               "Ed25519VerificationKey2020",
				"controller":         did,
				"publicKeyMultibase": publicKey,
			},
		},
		"authentication":  []string{did + "#keys-1"},
		"assertionMethod": []string{did + "#keys-1"},
		"created":         time.Now().Format(time.RFC3339),
		"updated":         time.Now().Format(time.RFC3339),
	}
	
	if profile != nil {
		document["profile"] = profile
	}
	
	return document, nil
}

func (s *DIDService) UpdateDIDDocument(existingCID string, updates map[string]interface{}) (map[string]interface{}, error) {
	// Retrieve existing document
	existingDoc, err := s.ipfsClient.Cat(existingCID)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve existing document: %w", err)
	}
	
	var document map[string]interface{}
	if err := json.NewDecoder(existingDoc).Decode(&document); err != nil {
		return nil, fmt.Errorf("failed to parse existing document: %w", err)
	}
	
	// Apply updates
	for key, value := range updates {
		document[key] = value
	}
	
	// Update timestamp
	document["updated"] = time.Now().Format(time.RFC3339)
	
	return document, nil
}
