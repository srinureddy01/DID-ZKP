// backend/internal/models/did.go
package models

import "time"

type RegisterDIDRequest struct {
	DID       string                 `json:"did"`
	PublicKey string                 `json:"publicKey"`
	Profile   map[string]interface{} `json:"profile,omitempty"`
}

type RegisterDIDResponse struct {
	DID       string                 `json:"did"`
	CID       string                 `json:"cid"`
	TxHash    string                 `json:"txHash"`
	Document  map[string]interface{} `json:"document"`
	CreatedAt time.Time              `json:"createdAt"`
}

type ResolveDIDResponse struct {
	DID          string                 `json:"did"`
	Document     map[string]interface{} `json:"document"`
	Metadata     map[string]interface{} `json:"metadata"`
	DocumentHash string                 `json:"documentHash"`
}

type UpdateDIDRequest struct {
	DID     string                 `json:"did"`
	CID     string                 `json:"cid"`
	Updates map[string]interface{} `json:"updates"`
}

type UpdateDIDResponse struct {
	DID       string    `json:"did"`
	OldCID    string    `json:"oldCid"`
	NewCID    string    `json:"newCid"`
	TxHash    string    `json:"txHash"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type RevokeDIDResponse struct {
	DID     string `json:"did"`
	TxHash  string `json:"txHash"`
	Revoked bool   `json:"revoked"`
}

type GetDIDByOwnerResponse struct {
	Address string `json:"address"`
	DID     string `json:"did"`
}

type VerifyDIDResponse struct {
	DID      string `json:"did"`
	IsActive bool   `json:"isActive"`
	Owner    string `json:"owner"`
}

func CreateDIDDocument(did, publicKey string, profile map[string]interface{}) map[string]interface{} {
	doc := map[string]interface{}{
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
		"authentication": []string{did + "#keys-1"},
		"assertionMethod": []string{did + "#keys-1"},
		"created":        time.Now().Format(time.RFC3339),
		"updated":        time.Now().Format(time.RFC3339),
	}

	if profile != nil {
		doc["profile"] = profile
	}

	return doc
}

func UpdateDIDDocument(existingDoc map[string]interface{}, updates map[string]interface{}) map[string]interface{} {
	for key, value := range updates {
		existingDoc[key] = value
	}
	existingDoc["updated"] = time.Now().Format(time.RFC3339)
	return existingDoc
}
// backend/internal/models/did.go (add these types)

type DIDComponents struct {
	Scheme     string `json:"scheme"`
	Method     string `json:"method"`
	Identifier string `json:"identifier"`
	Did        string `json:"did"`
}

type DIDMetadata struct {
	Owner           string    `json:"owner"`
	Created         time.Time `json:"created"`
	Updated         time.Time `json:"updated"`
	IsActive        bool      `json:"isActive"`
	DocumentHash    string    `json:"documentHash"`
	BlockNumber     uint64    `json:"blockNumber,omitempty"`
	TransactionHash string    `json:"transactionHash,omitempty"`
}

type DIDResolutionResult struct {
	DID            string                 `json:"did"`
	Document       map[string]interface{} `json:"document"`
	DocumentHash   string                 `json:"documentHash"`
	Metadata       *DIDMetadata           `json:"metadata"`
	ResolutionTime time.Time              `json:"resolutionTime"`
	Method         string                 `json:"method"`
	Identifier     string                 `json:"identifier"`
}

type DIDMetadataResponse struct {
	DID          string    `json:"did"`
	Owner        string    `json:"owner"`
	Created      time.Time `json:"created"`
	Updated      time.Time `json:"updated"`
	IsActive     bool      `json:"isActive"`
	DocumentHash string    `json:"documentHash"`
}

type DIDVerificationResponse struct {
	DID      string `json:"did"`
	Exists   bool   `json:"exists"`
	IsActive bool   `json:"isActive"`
	Owner    string `json:"owner"`
	Verified bool   `json:"verified"`
}

type BatchResolutionResponse struct {
	Results  []*DIDResolutionResult `json:"results"`
	Errors   map[string]string      `json:"errors"`
	Total    int                    `json:"total"`
	Resolved int                    `json:"resolved"`
}

type DIDHistoryResponse struct {
	DID     string                   `json:"did"`
	Entries []map[string]interface{} `json:"entries"`
	Count   int                      `json:"count"`
}

type DIDResolutionWithProofResponse struct {
	DID        string                 `json:"did"`
	Document   map[string]interface{} `json:"document"`
	Metadata   *DIDMetadata           `json:"metadata"`
	Proof      map[string]interface{} `json:"proof"`
	VerifiedAt time.Time              `json:"verifiedAt"`
}
