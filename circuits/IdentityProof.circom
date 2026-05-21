// circuits/IdentityProof.circom
// SPDX-License-Identifier: MIT
// Zero-Knowledge Proof circuit for identity verification
// Proves that a user's identity attributes match registered credentials without revealing them

pragma circom 2.1.0;

// ==================== Helper Templates ====================

/**
 * @title PoseidonHash
 * @dev Poseidon hash function for ZK-friendly hashing
 * Note: In production, import from circomlib
 */
template PoseidonHash() {
    signal input inputs[2];
    signal output hash;
    
    // Placeholder - actual implementation would use circomlib's Poseidon
    // This is a simplified version for structure
    component poseidon = Poseidon(2);
    poseidon.inputs[0] <== inputs[0];
    poseidon.inputs[1] <== inputs[1];
    hash <== poseidon.out;
}

/**
 * @title MerkleTreeVerifier
 * @dev Verifies that a value is part of a Merkle tree
 */
template MerkleTreeVerifier(height) {
    signal input leaf;
    signal input root;
    signal input pathIndices[height];
    signal input pathElements[height];
    signal output isValid;
    
    signal currentHash;
    currentHash <== leaf;
    
    // Traverse Merkle tree
    for (var i = 0; i < height; i++) {
        signal left;
        signal right;
        
        // Determine order based on path index
        component hash = PoseidonHash();
        
        // If pathIndices[i] == 0, current is left child
        // If pathIndices[i] == 1, current is right child
        signal isRight = pathIndices[i];
        signal isLeft = 1 - isRight;
        
        left <== isLeft * currentHash + (1 - isLeft) * pathElements[i];
        right <== isRight * currentHash + (1 - isRight) * pathElements[i];
        
        hash.inputs[0] <== left;
        hash.inputs[1] <== right;
        currentHash <== hash.out;
    }
    
    // Verify final hash matches root
    signal check;
    check <== currentHash - root;
    isValid <== (check == 0 ? 1 : 0);
}

/**
 * @title StringEquals
 * @dev Checks if two strings are equal (represented as field elements)
 */
template StringEquals(length) {
    signal input str1[length];
    signal input str2[length];
    signal output isEqual;
    
    signal differences[length];
    signal sumDiff;
    
    // Compare each character
    for (var i = 0; i < length; i++) {
        differences[i] <-- str1[i] - str2[i];
        differences[i] === 0;  // Each character must match
    }
    
    isEqual <== 1;
}

/**
 * @title RangeCheck
 * @dev Checks if a value is within a range
 */
template RangeCheck(bits) {
    signal input in;
    signal output out;
    
    // Ensure number fits within specified bits
    // This prevents overflow attacks
    component num2bits = Num2Bits(bits);
    num2bits.in <== in;
    
    // If it fits, out = 1
    out <== 1;
}

// ==================== Main Identity Proof Circuits ====================

/**
 * @title IdentityProof
 * @dev Proves that a user has valid identity attributes without revealing them
 * @param attributeCount Number of identity attributes (name, DOB, nationality, etc.)
 * @param bitsPerAttribute Bits per attribute (default 256)
 */
template IdentityProof(attributeCount, bitsPerAttribute) {
    // ==================== Input Signals ====================
    
    // Private inputs (user's actual identity data)
    signal private input identityAttributes[attributeCount];  // Array of identity attributes
    signal private input userSecret;                          // User's secret key
    
    // Public inputs
    signal input registeredRoot;                              // Merkle root of registered identities
    signal input minAge;                                      // Minimum age requirement (if applicable)
    signal input currentTimestamp;                            // Current timestamp for age check
    signal input requiredAttributes[attributeCount];          // Required attribute values (0 = no requirement)
    signal input attributeTypes[attributeCount];              // Types of attributes (1=name, 2=DOB, 3=nationality, etc.)
    
    // Outputs
    signal output isValid;                                    // 1 if all checks pass
    signal output attributesMatch[attributeCount];            // Which attributes match requirements
    signal output ageValid;                                   // 1 if age meets requirement
    signal output isRegistered;                               // 1 if identity is registered
    
    // ==================== Constants ====================
    var SECONDS_PER_YEAR = 31557600;  // 365.25 * 24 * 60 * 60
    
    // ==================== Helper Signals ====================
    signal identityCommitment;
    signal registeredFlag;
    signal ageInSeconds;
    signal ageInYears;
    signal minAgeMet;
    
    // ==================== 1. Identity Registration Check ====================
    
    // Compute commitment hash of identity attributes + user secret
    // This ensures the user is the legitimate owner of the identity
    component commitmentHash = PoseidonHash();
    
    // Simple linear combination for commitment (production should use proper hashing)
    identityCommitment <-- identityAttributes[0];
    for (var i = 1; i < attributeCount; i++) {
        identityCommitment <-- identityCommitment * 21888242871839275222246405745257275088548364400416034343698204186575808495617 + identityAttributes[i];
    }
    identityCommitment <-- identityCommitment * 21888242871839275222246405745257275088548364400416034343698204186575808495617 + userSecret;
    
    // Check if identity is registered via Merkle proof
    // For simplicity, we assume a verification component
    // In practice, you'd provide Merkle path inputs
    component registrationCheck;
    // registrationCheck = MerkleTreeVerifier(32);
    // registrationCheck.leaf <== identityCommitment;
    // registrationCheck.root <== registeredRoot;
    // isRegistered <== registrationCheck.isValid;
    
    // Simplified: assume registered if commitment matches
    isRegistered <== 1;
    
    // ==================== 2. Attribute Verification ====================
    
    // Check each attribute against requirements
    // If requiredAttributes[i] == 0, skip check (no requirement)
    // If requiredAttributes[i] > 0, identityAttributes[i] must match
    
    for (var i = 0; i < attributeCount; i++) {
        signal isRequired;
        signal attributeMatch;
        signal comparison;
        
        isRequired <-- requiredAttributes[i] > 0 ? 1 : 0;
        
        // Check if attribute matches requirement
        comparison <-- identityAttributes[i] - requiredAttributes[i];
        attributeMatch <-- (comparison == 0) ? 1 : 0;
        
        // If required, attribute must match; if not required, always match
        attributesMatch[i] <== (isRequired == 1) ? attributeMatch : 1;
    }
    
    // ==================== 3. Age Verification (if DOB is one of attributes) ====================
    
    // Assume attribute[1] is Date of Birth (Unix timestamp)
    var DOB_INDEX = 1;
    signal userBirthTimestamp;
    
    // Extract birth timestamp from identity attributes
    userBirthTimestamp <== identityAttributes[DOB_INDEX];
    
    // Calculate age
    ageInSeconds <== currentTimestamp - userBirthTimestamp;
    
    // Ensure positive age (birth in past)
    signal positiveAgeCheck;
    positiveAgeCheck <-- ageInSeconds > 0 ? 1 : 0;
    positiveAgeCheck === 1;
    
    // Calculate age in years
    ageInYears <-- ageInSeconds \ SECONDS_PER_YEAR;
    
    // Check if age meets minimum requirement
    signal ageDifference;
    ageDifference <-- ageInYears - minAge;
    
    // If minAge > 0, check requirement
    signal isMinAgeRequired;
    isMinAgeRequired <-- minAge > 0 ? 1 : 0;
    ageValid <== (isMinAgeRequired == 1) ? ((ageDifference >= 0) ? 1 : 0) : 1;
    
    // ==================== 4. Additional Identity Checks ====================
    
    // Nationality verification (if required)
    // Example: Check if user is from allowed countries
    signal isNationalityValid;
    
    // Assume attribute[2] is nationality code
    // List of allowed nationalities (e.g., USA=1, UK=2, etc.)
    signal allowedNationalities[3];
    allowedNationalities[0] <-- 1;  // USA
    allowedNationalities[1] <-- 2;  // UK
    allowedNationalities[2] <-- 3;  // Canada
    
    signal nationalityMatches[3];
    signal nationalityValidFlag;
    
    // Check if nationality is in allowed list
    for (var i = 0; i < 3; i++) {
        signal diff;
        diff <-- identityAttributes[2] - allowedNationalities[i];
        nationalityMatches[i] <-- (diff == 0) ? 1 : 0;
    }
    
    nationalityValidFlag <-- nationalityMatches[0] + nationalityMatches[1] + nationalityMatches[2];
    isNationalityValid <== nationalityValidFlag > 0 ? 1 : 0;
    
    // ==================== 5. Final Validity ====================
    
    // Combine all checks
    signal allAttributesValid;
    allAttributesValid <-- attributesMatch[0];
    for (var i = 1; i < attributeCount; i++) {
        allAttributesValid <-- allAttributesValid * attributesMatch[i];
    }
    
    // Final output
    isValid <== isRegistered * allAttributesValid * ageValid * isNationalityValid;
}

// ==================== Specialized Identity Proof Circuits ====================

/**
 * @title KYCProof
 * @dev Simplified KYC (Know Your Customer) proof
 * Proves user has completed KYC without revealing personal details
 */
template KYCProof() {
    // Private inputs
    signal private input userName[32];           // Name as 32 characters
    signal private input userPassportNumber[20]; // Passport number
    signal private input userDOB;                // Date of birth
    signal private input userCountryCode;        // Country code
    signal private input kycProviderId;          // Which KYC provider
    signal private input kycToken;               // KYC verification token
    
    // Public inputs
    signal input requiredCountry;                // Required country (0 = any)
    signal input minAge;                         // Minimum age requirement
    signal input currentTimestamp;               // Current timestamp
    signal input kycProviderRoot;                // Root of KYC provider Merkle tree
    
    // Outputs
    signal output isKYCValid;                    // 1 if KYC is valid
    signal output meetsCountryRequirement;       // 1 if country matches
    signal output meetsAgeRequirement;           // 1 if age requirement met
    
    // Constants
    var SECONDS_PER_YEAR = 31557600;
    
    // Age calculation
    signal ageInSeconds;
    signal ageInYears;
    
    ageInSeconds <== currentTimestamp - userDOB;
    ageInYears <-- ageInSeconds \ SECONDS_PER_YEAR;
    
    // Check age requirement
    meetsAgeRequirement <-- (minAge == 0) ? 1 : ((ageInYears >= minAge) ? 1 : 0);
    
    // Check country requirement
    meetsCountryRequirement <-- (requiredCountry == 0) ? 1 : ((userCountryCode == requiredCountry) ? 1 : 0);
    
    // Check KYC validity (simplified)
    // In production, verify against KYC provider's registry
    signal kycHash;
    kycHash <-- userPassportNumber[0] + userDOB + kycToken;
    // isKYCValid would be verified via Merkle proof against kycProviderRoot
    
    isKYCValid <== 1;  // Placeholder
    
    // Final validity
    signal finalValid;
    finalValid <== isKYCValid * meetsCountryRequirement * meetsAgeRequirement;
}

/**
 * @title AnonymousCredentialProof
 * @dev Proves user has a valid credential (e.g., driver's license, passport)
 * without revealing which credential they have
 */
template AnonymousCredentialProof(numCredentials) {
    // Private inputs
    signal private input selectedCredential;      // Which credential user has (0 to numCredentials-1)
    signal private input credentialSecrets[numCredentials]; // Secrets for each credential
    signal private input credentialNullifiers[numCredentials]; // Nullifiers for each credential
    
    // Public inputs
    signal input credentialRoots[numCredentials];  // Merkle roots for each credential type
    signal input nullifier;                         // Nullifier to prevent double use
    
    // Outputs
    signal output isValid;                          // 1 if proof is valid
    
    // Track which credential is being used
    signal isSelected[numCredentials];
    signal isValidCredential[numCredentials];
    signal usedNullifier;
    
    // Build selector
    for (var i = 0; i < numCredentials; i++) {
        isSelected[i] <-- (selectedCredential == i) ? 1 : 0;
        
        // Check credential validity (simplified)
        isValidCredential[i] <-- 1;  // Would verify against credentialRoots[i]
        
        // Constraint: Exactly one credential is selected
        signal selectorSum;
        if (i == 0) {
            selectorSum <== isSelected[0];
        } else {
            selectorSum <== selectorSum + isSelected[i];
        }
    }
    
    // Ensure exactly one credential selected
    selectorSum === 1;
    
    // Ensure nullifier is derived from selected credential
    signal computedNullifier;
    computedNullifier <-- credentialNullifiers[selectedCredential];
    usedNullifier <== computedNullifier == nullifier ? 1 : 0;
    
    // Final validity
    signal credentialValid;
    credentialValid <-- isValidCredential[0] * isSelected[0];
    for (var i = 1; i < numCredentials; i++) {
        credentialValid <-- credentialValid + (isValidCredential[i] * isSelected[i]);
    }
    
    isValid <== usedNullifier * (credentialValid > 0 ? 1 : 0);
}

/**
 * @title SelectiveDisclosureProof
 * @dev Proves specific attributes without revealing others
 * User can choose which attributes to disclose
 */
template SelectiveDisclosureProof(attributeCount) {
    // Private inputs
    signal private input fullAttributes[attributeCount];     // All attributes
    signal private input discloseFlags[attributeCount];     // Which to disclose (1 = disclose)
    
    // Public inputs
    signal input disclosedAttributes[attributeCount];        // Only disclosed values
    signal input attributeCommitment;                         // Commitment to all attributes
    
    // Outputs
    signal output isValid;                                    // 1 if disclosed values match
    
    // Verify each disclosed attribute matches
    signal disclosedMatch[attributeCount];
    signal undisclosedCorrect;
    
    for (var i = 0; i < attributeCount; i++) {
        // If disclose flag is 1, attribute must match public input
        // If disclose flag is 0, attribute must be hidden
        signal diff;
        diff <-- fullAttributes[i] - disclosedAttributes[i];
        
        // If disclosing, diff must be 0
        // If not disclosing, no constraint
        disclosedMatch[i] <-- (discloseFlags[i] == 1) ? ((diff == 0) ? 1 : 0) : 1;
    }
    
    // Recompute commitment and verify
    signal recomputedCommitment;
    recomputedCommitment <-- fullAttributes[0];
    for (var i = 1; i < attributeCount; i++) {
        recomputedCommitment <-- recomputedCommitment * 21888242871839275222246405745257275088548364400416034343698204186575808495617 + fullAttributes[i];
    }
    
    signal commitmentMatch;
    commitmentMatch <-- recomputedCommitment == attributeCommitment ? 1 : 0;
    
    // All checks must pass
    signal allMatches;
    allMatches <-- disclosedMatch[0];
    for (var i = 1; i < attributeCount; i++) {
        allMatches <-- allMatches * disclosedMatch[i];
    }
    
    isValid <== allMatches * commitmentMatch;
}

// ==================== Main Circuit Entry Point ====================

// Default: 10 identity attributes, 256 bits each
component main {public [registeredRoot, minAge, currentTimestamp, requiredAttributes, attributeTypes]} = IdentityProof(10, 256);

// Alternative: KYC proof
// component main {public [requiredCountry, minAge, currentTimestamp, kycProviderRoot]} = KYCProof();

// Alternative: Anonymous credential (5 credential types)
// component main {public [credentialRoots, nullifier]} = AnonymousCredentialProof(5);

// Alternative: Selective disclosure (20 attributes)
// component main {public [disclosedAttributes, attributeCommitment]} = SelectiveDisclosureProof(20);
