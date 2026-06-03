// backend/internal/models/credential.go
package models

import "time"

type Credential struct {
	TokenID        uint64                 `json:"tokenId"`
	CredentialID   string                 `json:"credentialId"`
	CredentialType string                 `json:"credentialType"`
	IssuerDID      string                 `json:"issuerDID"`
	HolderDID      string                 `json:"holderDID"`
	IssuedAt       uint64                 `json:"issuedAt"`
	ExpiresAt      uint64                 `json:"expiresAt"`
	IsActive       bool                   `json:"isActive"`
	IsRevoked      bool                   `json:"isRevoked"`
	ZKPCompatible  bool                   `json:"zkpCompatible"`
	IPFSCID        string                 `json:"ipfsCid"`
	Data           map[string]interface{} `json:"data,omitempty"`
}

type UserCredentialsResponse struct {
	DID         string        `json:"did"`
	Credentials []*Credential `json:"credentials"`
	Total       int           `json:"total"`
}

type CredentialVerificationResponse struct {
	CredentialID   string    `json:"credentialId"`
	TokenID        uint64    `json:"tokenId"`
	CredentialType string    `json:"credentialType"`
	IsValid        bool      `json:"isValid"`
	IsRevoked      bool      `json:"isRevoked"`
	IsExpired      bool      `json:"isExpired"`
	ZKPVerified    bool      `json:"zkpVerified"`
	VerifiedAt     time.Time `json:"verifiedAt"`
}

type RevokeCredentialResponse struct {
	TokenID   uint64    `json:"tokenId"`
	Revoked   bool      `json:"revoked"`
	Reason    string    `json:"reason"`
	TxHash    string    `json:"txHash"`
	RevokedAt time.Time `json:"revokedAt"`
}

type CredentialRequest struct {
	RequestID      string                 `json:"requestId"`
	HolderDID      string                 `json:"holderDID"`
	CredentialType string                 `json:"credentialType"`
	Requirements   map[string]interface{} `json:"requirements"`
	Status         string                 `json:"status"`
	RequestedAt    time.Time              `json:"requestedAt"`
	CallbackURL    string                 `json:"callbackURL,omitempty"`
}
