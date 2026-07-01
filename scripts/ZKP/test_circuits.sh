#!/bin/bash
# scripts/zkp/test_circuits.sh
# Test the compiled circuits with sample inputs

set -e

# Directories
CIRCUIT_DIR="../../circuits"
BUILD_DIR="../../circuits/build"
ZKEY_DIR="../../circuits/zkeys"
PUBLIC_DIR="../../frontend/public/circuits"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Testing ZKP Circuits..."

test_circuit() {
    local circuit_name=$1
    echo "Testing: $circuit_name"
    
    local wasm="$BUILD_DIR/${circuit_name}_js/${circuit_name}.wasm"
    local zkey="$ZKEY_DIR/${circuit_name}.zkey"
    local input="$CIRCUIT_DIR/inputs/${circuit_name}_input.json"
    local proof="./proof.json"
    local public="./public.json"
    
    if [ ! -f "$wasm" ]; then
        echo -e "${RED}❌ WASM not found: $wasm${NC}"
        return 1
    fi
    
    if [ ! -f "$zkey" ]; then
        echo -e "${RED}❌ ZKEY not found: $zkey${NC}"
        return 1
    fi
    
    if [ ! -f "$input" ]; then
        echo -e "${RED}❌ Input not found: $input${NC}"
        return 1
    fi
    
    # Generate witness
    echo "  Generating witness..."
    if snarkjs groth16 prove "$zkey" "$wasm" "$input" "$proof" "$public" 2>/dev/null; then
        echo -e "${GREEN}✅ Proof generated successfully${NC}"
    else
        echo -e "${RED}❌ Proof generation failed${NC}"
        return 1
    fi
    
    # Verify proof
    local vkey="$PUBLIC_DIR/${circuit_name}_verification_key.json"
    if [ -f "$vkey" ]; then
        echo "  Verifying proof..."
        if snarkjs groth16 verify "$vkey" "$public" "$proof" 2>/dev/null; then
            echo -e "${GREEN}✅ Proof verified successfully${NC}"
        else
            echo -e "${RED}❌ Proof verification failed${NC}"
            return 1
        fi
    fi
    
    # Cleanup
    rm -f "$proof" "$public"
    
    return 0
}

# Test each circuit
for circuit in "AgeProof" "IdentityProof"; do
    test_circuit "$circuit" || exit 1
done

echo -e "${GREEN}✅ All circuits tested successfully${NC}"
