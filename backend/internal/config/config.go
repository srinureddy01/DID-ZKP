// backend/internal/config/config.go
package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	// Server
	Port         string
	Environment  string
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration

	// Blockchain
	BlockchainRPCURL      string
	ChainID               int64
	DIDRegistryAddress    string
	ZKPVerifierAddress    string
	CredentialNFTAddress  string
	PrivateKey            string

	// IPFS
	IPFSHost     string
	IPFSPort     int
	IPFSProtocol string
	PinataAPIKey string
	PinataSecret string

	// Security
	RateLimit        int
	JWTSecret        string
	APIKey           string

	// ZKP
	CircuitPath      string
	VerificationKeyPath string
}

func Load() (*Config, error) {
	readTimeout, _ := time.ParseDuration(getEnv("READ_TIMEOUT", "30s"))
	writeTimeout, _ := time.ParseDuration(getEnv("WRITE_TIMEOUT", "30s"))
	idleTimeout, _ := time.ParseDuration(getEnv("IDLE_TIMEOUT", "60s"))
	
	chainID, _ := strconv.ParseInt(getEnv("CHAIN_ID", "31337"), 10, 64)
	ipfsPort, _ := strconv.Atoi(getEnv("IPFS_PORT", "5001"))
	rateLimit, _ := strconv.Atoi(getEnv("RATE_LIMIT", "100"))

	return &Config{
		Port:         getEnv("PORT", "8080"),
		Environment:  getEnv("ENVIRONMENT", "development"),
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  idleTimeout,

		BlockchainRPCURL:     getEnv("BLOCKCHAIN_RPC_URL", "http://localhost:8545"),
		ChainID:              chainID,
		DIDRegistryAddress:   getEnv("DID_REGISTRY_ADDRESS", ""),
		ZKPVerifierAddress:   getEnv("ZKP_VERIFIER_ADDRESS", ""),
		CredentialNFTAddress: getEnv("CREDENTIAL_NFT_ADDRESS", ""),
		PrivateKey:           getEnv("PRIVATE_KEY", ""),

		IPFSHost:     getEnv("IPFS_HOST", "localhost"),
		IPFSPort:     ipfsPort,
		IPFSProtocol: getEnv("IPFS_PROTOCOL", "http"),
		PinataAPIKey: getEnv("PINATA_API_KEY", ""),
		PinataSecret: getEnv("PINATA_API_SECRET", ""),

		RateLimit:        rateLimit,
		JWTSecret:        getEnv("JWT_SECRET", "your-secret-key"),
		APIKey:           getEnv("API_KEY", ""),

		CircuitPath:        getEnv("CIRCUIT_PATH", "../circuits"),
		VerificationKeyPath: getEnv("VERIFICATION_KEY_PATH", "../circuits/verification_key.json"),
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
