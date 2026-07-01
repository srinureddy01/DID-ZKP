#!/bin/bash
# scripts/zkp/compile_circuits.sh
# Complete ZKP Circuit Compilation Script for DID Protocol

set -e  # Exit on error
set -o pipefail  # Exit on pipe failures

# ==================== Configuration ====================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directories
CIRCUIT_DIR="../../circuits"
BUILD_DIR="../../circuits/build"
POT_DIR="../../circuits/powersOfTau"
ZKEY_DIR="../../circuits/zkeys"
PUBLIC_DIR="../../frontend/public/circuits"

# Circuit files
CIRCUITS=(
    "AgeProof"
    "IdentityProof"
)

# Circuit configurations
declare -A CIRCUIT_CONFIG
CIRCUIT_CONFIG["AgeProof"]="32"
CIRCUIT_CONFIG["IdentityProof"]="256"

# Powers of Tau configuration
POT_SIZE=20  # 2^20 = ~1 million constraints (adjust based on circuit size)
POT_FILE="pot${POT_SIZE}_final.ptau"

# ==================== Helper Functions ====================

print_header() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_step() {
    echo -e "${CYAN}▶ $1${NC}"
}

# Check if command exists
check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed. Please install it first."
        return 1
    fi
    print_success "$1 is installed"
    return 0
}

# Create directory if it doesn't exist
ensure_directory() {
    if [ ! -d "$1" ]; then
        mkdir -p "$1"
        print_info "Created directory: $1"
    fi
}

# ==================== Main Compilation Functions ====================

check_dependencies() {
    print_header "Checking Dependencies"
    
    local missing_deps=0
    
    # Check circom
    if ! check_command "circom"; then
        print_error "circom is not installed. Install with: npm install -g circom"
        missing_deps=$((missing_deps + 1))
    fi
    
    # Check snarkjs
    if ! check_command "snarkjs"; then
        print_error "snarkjs is not installed. Install with: npm install -g snarkjs"
        missing_deps=$((missing_deps + 1))
    fi
    
    # Check node
    if ! check_command "node"; then
        print_error "node is not installed. Install from https://nodejs.org/"
        missing_deps=$((missing_deps + 1))
    fi
    
    # Check npm
    if ! check_command "npm"; then
        print_error "npm is not installed. Install with: apt-get install npm"
        missing_deps=$((missing_deps + 1))
    fi
    
    # Check python3 (for some circomlib dependencies)
    if ! check_command "python3"; then
        print_warning "python3 is not installed (optional)"
    fi
    
    if [ $missing_deps -gt 0 ]; then
        print_error "Missing $missing_deps dependencies. Please install them and try again."
        exit 1
    fi
    
    # Check circomlib
    if [ ! -d "node_modules/circomlib" ] && [ ! -d "../node_modules/circomlib" ]; then
        print_warning "circomlib not found. Installing..."
        npm install circomlib
        print_success "circomlib installed"
    fi
    
    print_success "All dependencies are installed"
}

setup_directories() {
    print_header "Setting Up Directories"
    
    ensure_directory "$CIRCUIT_DIR"
    ensure_directory "$BUILD_DIR"
    ensure_directory "$POT_DIR"
    ensure_directory "$ZKEY_DIR"
    ensure_directory "$PUBLIC_DIR"
    
    print_success "Directories setup complete"
}

download_powers_of_tau() {
    print_header "Setting Up Powers of Tau"
    
    local pot_file_path="$POT_DIR/$POT_FILE"
    
    # Check if powers of tau already exists
    if [ -f "$pot_file_path" ]; then
        print_info "Powers of Tau file already exists: $pot_file_path"
        return 0
    fi
    
    print_info "Downloading Powers of Tau (this may take a while)..."
    print_warning "Size: ~2GB for POT_SIZE=$POT_SIZE"
    
    # Try to download from multiple sources
    local download_urls=(
        "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_${POT_SIZE}.ptau"
        "https://storage.googleapis.com/plonk-verifier/powersOfTau28_hez_final_${POT_SIZE}.ptau"
        "https://github.com/iden3/snarkjs/raw/master/powersOfTau28_hez_final_${POT_SIZE}.ptau"
    )
    
    local downloaded=false
    for url in "${download_urls[@]}"; do
        print_info "Trying: $url"
        if wget -O "$pot_file_path.tmp" "$url" 2>/dev/null; then
            mv "$pot_file_path.tmp" "$pot_file_path"
            downloaded=true
            print_success "Downloaded Powers of Tau successfully"
            break
        fi
    done
    
    if [ "$downloaded" = false ]; then
        print_error "Failed to download Powers of Tau from all sources"
        print_info "Please manually download from:"
        print_info "https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_${POT_SIZE}.ptau"
        print_info "And place it at: $pot_file_path"
        exit 1
    fi
    
    # Verify the file
    if [ -f "$pot_file_path" ]; then
        local file_size=$(stat -f%z "$pot_file_path" 2>/dev/null || stat -c%s "$pot_file_path" 2>/dev/null || echo "0")
        if [ "$file_size" -gt 1000000 ]; then
            print_success "Powers of Tau file verified (size: $file_size bytes)"
        else
            print_warning "Powers of Tau file appears too small. May be corrupted."
        fi
    fi
}

compile_circuit() {
    local circuit_name=$1
    local circuit_file="$CIRCUIT_DIR/${circuit_name}.circom"
    local build_file="$BUILD_DIR/${circuit_name}"
    
    print_header "Compiling Circuit: $circuit_name"
    
    if [ ! -f "$circuit_file" ]; then
        print_error "Circuit file not found: $circuit_file"
        return 1
    fi
    
    print_info "Compiling: $circuit_file"
    
    # Compile circuit
    if circom "$circuit_file" --r1cs --wasm --sym --c --output "$BUILD_DIR"; then
        print_success "Circuit compiled successfully"
        
        # Move the generated files to appropriate locations
        if [ -f "$BUILD_DIR/${circuit_name}.r1cs" ]; then
            print_info "Generated: ${circuit_name}.r1cs"
        fi
        
        if [ -d "$BUILD_DIR/${circuit_name}_js" ]; then
            print_info "Generated: ${circuit_name}_js directory"
            # Copy WASM to public directory for frontend
            cp "$BUILD_DIR/${circuit_name}_js/${circuit_name}.wasm" "$PUBLIC_DIR/"
            print_success "WASM copied to frontend public directory"
        fi
        
        return 0
    else
        print_error "Circuit compilation failed for: $circuit_name"
        return 1
    fi
}

setup_circuit_zkp() {
    local circuit_name=$1
    local r1cs_file="$BUILD_DIR/${circuit_name}.r1cs"
    local wasm_file="$BUILD_DIR/${circuit_name}_js/${circuit_name}.wasm"
    local zkey_file="$ZKEY_DIR/${circuit_name}.zkey"
    local vkey_file="$PUBLIC_DIR/${circuit_name}_verification_key.json"
    local pot_file="$POT_DIR/$POT_FILE"
    
    print_header "Setting Up ZKP for: $circuit_name"
    
    # Check if R1CS exists
    if [ ! -f "$r1cs_file" ]; then
        print_error "R1CS file not found: $r1cs_file"
        return 1
    fi
    
    # Check if WASM exists
    if [ ! -f "$wasm_file" ]; then
        print_error "WASM file not found: $wasm_file"
        return 1
    fi
    
    # Check if Powers of Tau exists
    if [ ! -f "$pot_file" ]; then
        print_error "Powers of Tau file not found: $pot_file"
        return 1
    fi
    
    # Step 1: Generate ZKEY
    print_step "Generating ZKEY for $circuit_name"
    if snarkjs groth16 setup "$r1cs_file" "$pot_file" "$zkey_file"; then
        print_success "ZKEY generated for $circuit_name"
    else
        print_error "Failed to generate ZKEY for $circuit_name"
        return 1
    fi
    
    # Step 2: Export verification key
    print_step "Exporting verification key for $circuit_name"
    if snarkjs zkey export verificationkey "$zkey_file" "$vkey_file"; then
        print_success "Verification key exported: $vkey_file"
    else
        print_error "Failed to export verification key for $circuit_name"
        return 1
    fi
    
    # Step 3: Create Solidity verifier (optional)
    print_step "Creating Solidity verifier for $circuit_name"
    local verifier_file="$ZKEY_DIR/${circuit_name}Verifier.sol"
    if snarkjs zkey export solidityverifier "$zkey_file" "$verifier_file"; then
        print_success "Solidity verifier created: $verifier_file"
    else
        print_warning "Failed to create Solidity verifier for $circuit_name"
    fi
    
    # Step 4: Export ZKEY to public directory for frontend
    print_step "Copying ZKEY to frontend public directory"
    if cp "$zkey_file" "$PUBLIC_DIR/${circuit_name}.zkey"; then
        print_success "ZKEY copied to frontend public directory"
    else
        print_warning "Failed to copy ZKEY to frontend"
    fi
    
    # Step 5: Generate a sample proof (for testing)
    print_step "Generating sample proof for $circuit_name"
    if snarkjs groth16 prove "$zkey_file" "$wasm_file" /dev/null /dev/null 2>/dev/null; then
        print_success "Sample proof generation tested successfully"
    else
        print_warning "Sample proof generation failed (may require input file)"
    fi
    
    print_success "ZKP setup complete for: $circuit_name"
}

create_sample_inputs() {
    print_header "Creating Sample Inputs"
    
    # Create sample inputs for AgeProof
    local age_input="$CIRCUIT_DIR/inputs/AgeProof_input.json"
    ensure_directory "$(dirname "$age_input")"
    
    cat > "$age_input" << EOF
{
    "userBirthTimestamp": 946684800,
    "currentTimestamp": 1735171200,
    "minAge": 18
}
EOF
    print_success "Created AgeProof sample input: $age_input"
    
    # Create sample inputs for IdentityProof
    local identity_input="$CIRCUIT_DIR/inputs/IdentityProof_input.json"
    cat > "$identity_input" << EOF
{
    "userName": [65, 108, 105, 99, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "userNationality": 1,
    "userDocumentNumber": [49, 50, 51, 52, 53, 54, 55, 56, 57, 48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "userBirthTimestamp": 946684800,
    "userSecret": 123456789,
    "currentTimestamp": 1735171200,
    "minAge": 18,
    "requiredName": 1,
    "requiredNationality": 1,
    "requiredDocument": 0,
    "expectedName": [65, 108, 105, 99, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    "expectedNationality": 1,
    "expectedDocumentHash": 0
}
EOF
    print_success "Created IdentityProof sample input: $identity_input"
    
    print_success "Sample inputs created"
}

generate_proving_key() {
    print_header "Generating Proving Keys"
    
    for circuit_name in "${CIRCUITS[@]}"; do
        local zkey_file="$ZKEY_DIR/${circuit_name}.zkey"
        
        if [ -f "$zkey_file" ]; then
            print_info "ZKEY exists: $zkey_file"
            
            # Generate proving key (for frontend use)
            print_step "Generating proving key for $circuit_name"
            local proving_key="$PUBLIC_DIR/${circuit_name}_proving_key.json"
            
            # Extract proving key from zkey
            if snarkjs zkey export json "$zkey_file" "$proving_key" 2>/dev/null; then
                print_success "Proving key exported: $proving_key"
            else
                print_warning "Failed to export proving key for $circuit_name"
            fi
        else
            print_warning "ZKEY not found for $circuit_name. Skipping."
        fi
    done
}

create_circuit_summary() {
    print_header "Circuit Compilation Summary"
    
    local summary_file="$BUILD_DIR/circuit_summary.json"
    
    cat > "$summary_file" << EOF
{
    "compiledAt": "$(date -Iseconds)",
    "potSize": $POT_SIZE,
    "circuits": {
$(for circuit_name in "${CIRCUITS[@]}"; do
    local r1cs_file="$BUILD_DIR/${circuit_name}.r1cs"
    local wasm_file="$BUILD_DIR/${circuit_name}_js/${circuit_name}.wasm"
    local zkey_file="$ZKEY_DIR/${circuit_name}.zkey"
    local vkey_file="$PUBLIC_DIR/${circuit_name}_verification_key.json"
    
    cat << EOF
        "${circuit_name}": {
            "r1cs": "$([ -f "$r1cs_file" ] && echo "true" || echo "false")",
            "wasm": "$([ -f "$wasm_file" ] && echo "true" || echo "false")",
            "zkey": "$([ -f "$zkey_file" ] && echo "true" || echo "false")",
            "verificationKey": "$([ -f "$vkey_file" ] && echo "true" || echo "false")"
        }$( [ "$circuit_name" != "${CIRCUITS[-1]}" ] && echo "," || echo "" )
EOF
done)
    }
}
EOF
    
    print_success "Circuit summary saved to: $summary_file"
    
    # Print summary
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  CIRCUIT COMPILATION SUMMARY${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}Powers of Tau:${NC} $POT_FILE"
    echo -e "${BLUE}POT Size:${NC} $POT_SIZE (2^$POT_SIZE)"
    echo ""
    
    for circuit_name in "${CIRCUITS[@]}"; do
        echo -e "${CYAN}▶ ${circuit_name}${NC}"
        
        local r1cs_file="$BUILD_DIR/${circuit_name}.r1cs"
        local wasm_file="$BUILD_DIR/${circuit_name}_js/${circuit_name}.wasm"
        local zkey_file="$ZKEY_DIR/${circuit_name}.zkey"
        local vkey_file="$PUBLIC_DIR/${circuit_name}_verification_key.json"
        
        [ -f "$r1cs_file" ] && echo "  ✅ R1CS: ${circuit_name}.r1cs" || echo "  ❌ R1CS: Missing"
        [ -f "$wasm_file" ] && echo "  ✅ WASM: ${circuit_name}.wasm" || echo "  ❌ WASM: Missing"
        [ -f "$zkey_file" ] && echo "  ✅ ZKEY: ${circuit_name}.zkey" || echo "  ❌ ZKEY: Missing"
        [ -f "$vkey_file" ] && echo "  ✅ Verification Key: ${circuit_name}_verification_key.json" || echo "  ❌ Verification Key: Missing"
        echo ""
    done
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

clean_build() {
    print_header "Cleaning Build Directory"
    
    if [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"/*
        print_success "Cleaned build directory: $BUILD_DIR"
    fi
    
    if [ -d "$ZKEY_DIR" ]; then
        rm -rf "$ZKEY_DIR"/*
        print_success "Cleaned ZKEY directory: $ZKEY_DIR"
    fi
    
    print_success "Clean complete"
}

# ==================== Main Execution ====================

print_header "DID Protocol ZKP Circuit Compilation"

# Parse arguments
CLEAN=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN=true
            shift
            ;;
        --help)
            echo "Usage: ./compile_circuits.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean    Clean build directory before compiling"
            echo "  --help     Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Clean if requested
if [ "$CLEAN" = true ]; then
    clean_build
fi

# Run compilation steps
check_dependencies || exit 1
setup_directories || exit 1
download_powers_of_tau || exit 1

# Compile each circuit
for circuit_name in "${CIRCUITS[@]}"; do
    compile_circuit "$circuit_name" || exit 1
    setup_circuit_zkp "$circuit_name" || exit 1
done

# Create sample inputs
create_sample_inputs || exit 1

# Generate proving keys
generate_proving_key || exit 1

# Create summary
create_circuit_summary || exit 1

print_header "COMPILATION COMPLETE! 🚀"
print_success "All ZKP circuits have been compiled successfully"
print_info "Generated files are in:"
print_info "  - Circuits: $CIRCUIT_DIR"
print_info "  - Build: $BUILD_DIR"
print_info "  - ZKEY: $ZKEY_DIR"
print_info "  - Public (Frontend): $PUBLIC_DIR"
echo ""

print_info "Next steps:"
echo "  1. Deploy ZKPVerifier contract with the generated verification keys"
echo "  2. Use the WASM and ZKEY files in the frontend for proof generation"
echo "  3. Test with sample inputs:"
echo "     snarkjs groth16 prove $ZKEY_DIR/AgeProof.zkey $BUILD_DIR/AgeProof_js/AgeProof.wasm inputs/AgeProof_input.json proof.json public.json"
echo "  4. Verify the proof:"
echo "     snarkjs groth16 verify $PUBLIC_DIR/AgeProof_verification_key.json public.json proof.json"
echo ""

print_success "Happy proving! 🔐"

exit 0
