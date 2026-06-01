// backend/internal/handlers/did.go
package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/gorilla/mux"

	"did-protocol-backend/internal/models"
	"did-protocol-backend/pkg/blockchain"
	"did-protocol-backend/pkg/ipfs"
)

type DIDHandler struct {
	blockchain *blockchain.Client
	ipfs       *ipfs.Client
}

func NewDIDHandler(blockchain *blockchain.Client, ipfs *ipfs.Client) *DIDHandler {
	return &DIDHandler{
		blockchain: blockchain,
		ipfs:       ipfs,
	}
}

func (h *DIDHandler) RegisterDID(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterDIDRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate request
	if req.DID == "" || req.PublicKey == "" {
		http.Error(w, "DID and public key are required", http.StatusBadRequest)
		return
	}

	// Create DID document
	doc := models.CreateDIDDocument(req.DID, req.PublicKey, req.Profile)

	// Upload to IPFS
	cid, err := h.ipfs.UploadJSON(doc)
	if err != nil {
		http.Error(w, "Failed to upload to IPFS", http.StatusInternalServerError)
		return
	}

	// Register on blockchain
	txHash, err := h.blockchain.RegisterDID(req.DID, cid)
	if err != nil {
		http.Error(w, "Failed to register DID on blockchain", http.StatusInternalServerError)
		return
	}

	response := models.RegisterDIDResponse{
		DID:       req.DID,
		CID:       cid,
		TxHash:    txHash,
		Document:  doc,
		CreatedAt: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *DIDHandler) ResolveDID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	did := vars["did"]

	if did == "" {
		http.Error(w, "DID is required", http.StatusBadRequest)
		return
	}

	// Get document hash from blockchain
	docHash, err := h.blockchain.GetDIDDocumentHash(did)
	if err != nil {
		http.Error(w, "DID not found", http.StatusNotFound)
		return
	}

	// Get document from IPFS
	document, err := h.ipfs.GetJSON(docHash)
	if err != nil {
		http.Error(w, "Failed to retrieve DID document", http.StatusInternalServerError)
		return
	}

	// Get metadata from blockchain
	metadata, err := h.blockchain.GetDIDMetadata(did)
	if err != nil {
		http.Error(w, "Failed to get DID metadata", http.StatusInternalServerError)
		return
	}

	response := models.ResolveDIDResponse{
		DID:        did,
		Document:   document,
		Metadata:   metadata,
		DocumentHash: docHash,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *DIDHandler) UpdateDID(w http.ResponseWriter, r *http.Request) {
	var req models.UpdateDIDRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get existing document
	existingDoc, err := h.ipfs.GetJSON(req.CID)
	if err != nil {
		http.Error(w, "Failed to get existing document", http.StatusInternalServerError)
		return
	}

	// Update document
	updatedDoc := models.UpdateDIDDocument(existingDoc, req.Updates)

	// Upload updated document to IPFS
	newCID, err := h.ipfs.UploadJSON(updatedDoc)
	if err != nil {
		http.Error(w, "Failed to upload updated document", http.StatusInternalServerError)
		return
	}

	// Update on blockchain
	txHash, err := h.blockchain.UpdateDIDDocument(req.DID, newCID)
	if err != nil {
		http.Error(w, "Failed to update DID on blockchain", http.StatusInternalServerError)
		return
	}

	response := models.UpdateDIDResponse{
		DID:       req.DID,
		OldCID:    req.CID,
		NewCID:    newCID,
		TxHash:    txHash,
		UpdatedAt: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *DIDHandler) RevokeDID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	did := vars["did"]

	if did == "" {
		http.Error(w, "DID is required", http.StatusBadRequest)
		return
	}

	txHash, err := h.blockchain.RevokeDID(did)
	if err != nil {
		http.Error(w, "Failed to revoke DID", http.StatusInternalServerError)
		return
	}

	response := models.RevokeDIDResponse{
		DID:     did,
		TxHash:  txHash,
		Revoked: true,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *DIDHandler) GetDIDByOwner(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	address := vars["address"]

	if !common.IsHexAddress(address) {
		http.Error(w, "Invalid Ethereum address", http.StatusBadRequest)
		return
	}

	did, err := h.blockchain.GetDIDByOwner(address)
	if err != nil {
		http.Error(w, "No DID found for this owner", http.StatusNotFound)
		return
	}

	response := models.GetDIDByOwnerResponse{
		Address: address,
		DID:     did,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (h *DIDHandler) VerifyDID(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	did := vars["did"]

	isActive, err := h.blockchain.IsDIDActive(did)
	if err != nil {
		http.Error(w, "Failed to verify DID", http.StatusInternalServerError)
		return
	}

	owner, _ := h.blockchain.GetDIDOwner(did)

	response := models.VerifyDIDResponse{
		DID:      did,
		IsActive: isActive,
		Owner:    owner,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
