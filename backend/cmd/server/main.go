// backend/cmd/server/main.go
package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/rs/cors"

	"did-protocol-backend/internal/config"
	"did-protocol-backend/internal/handlers"
	"did-protocol-backend/internal/middleware"
	"did-protocol-backend/pkg/blockchain"
	"did-protocol-backend/pkg/ipfs"
	"did-protocol-backend/pkg/zkp"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Initialize blockchain client
	blockchainClient, err := blockchain.NewClient(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to blockchain: %v", err)
	}
	defer blockchainClient.Close()

	// Initialize IPFS client
	ipfsClient, err := ipfs.NewClient(cfg)
	if err != nil {
		log.Fatalf("Failed to connect to IPFS: %v", err)
	}

	// Initialize ZKP verifier
	zkpVerifier, err := zkp.NewVerifier(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize ZKP verifier: %v", err)
	}

	// Initialize handlers
	didHandler := handlers.NewDIDHandler(blockchainClient, ipfsClient)
	credentialHandler := handlers.NewCredentialHandler(blockchainClient, ipfsClient)
	verificationHandler := handlers.NewVerificationHandler(blockchainClient, zkpVerifier)
	ipfsHandler := handlers.NewIPFSHandler(ipfsClient)

	// Setup router
	router := mux.NewRouter()

	// Apply middleware
	router.Use(middleware.Logging)
	router.Use(middleware.Recovery)
	router.Use(middleware.RateLimit(cfg.RateLimit))
	router.Use(middleware.CORS(cfg))

	// API routes
	api := router.PathPrefix("/api/v1").Subrouter()

	// Health check
	api.HandleFunc("/health", handlers.HealthCheck).Methods("GET")

	// DID routes
	api.HandleFunc("/did/register", didHandler.RegisterDID).Methods("POST")
	api.HandleFunc("/did/resolve/{did}", didHandler.ResolveDID).Methods("GET")
	api.HandleFunc("/did/update", didHandler.UpdateDID).Methods("PUT")
	api.HandleFunc("/did/revoke/{did}", didHandler.RevokeDID).Methods("DELETE")
	api.HandleFunc("/did/owner/{address}", didHandler.GetDIDByOwner).Methods("GET")
	api.HandleFunc("/did/verify/{did}", didHandler.VerifyDID).Methods("GET")

	// Credential routes
	api.HandleFunc("/credential/issue", credentialHandler.IssueCredential).Methods("POST")
	api.HandleFunc("/credential/{tokenId}", credentialHandler.GetCredential).Methods("GET")
	api.HandleFunc("/credential/revoke/{tokenId}", credentialHandler.RevokeCredential).Methods("DELETE")
	api.HandleFunc("/credential/verify/{tokenId}", credentialHandler.VerifyCredential).Methods("GET")
	api.HandleFunc("/credential/user/{did}", credentialHandler.GetUserCredentials).Methods("GET")
	api.HandleFunc("/credential/request", credentialHandler.RequestCredential).Methods("POST")

	// Verification routes
	api.HandleFunc("/verify/age", verificationHandler.VerifyAge).Methods("POST")
	api.HandleFunc("/verify/identity", verificationHandler.VerifyIdentity).Methods("POST")
	api.HandleFunc("/verify/proof", verificationHandler.VerifyProof).Methods("POST")
	api.HandleFunc("/verify/status/{requestId}", verificationHandler.GetVerificationStatus).Methods("GET")

	// IPFS routes
	api.HandleFunc("/ipfs/upload", ipfsHandler.UploadToIPFS).Methods("POST")
	api.HandleFunc("/ipfs/get/{cid}", ipfsHandler.GetFromIPFS).Methods("GET")
	api.HandleFunc("/ipfs/pin/{cid}", ipfsHandler.PinToIPFS).Methods("POST")

	// Start server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Server starting on port %s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited gracefully")
}
