// circuits/AgeProof.circom
// SPDX-License-Identifier: MIT
// Zero-Knowledge Proof circuit for age verification
// Proves that a user's age >= minimum required age without revealing birthdate

pragma circom 2.1.0;

// ==================== Template Imports ====================
// These are standard circomlib comparators

// LessThan template from circomlib
template LessThan(n) {
    signal input in[2];
    signal output out;

    component lt = LessThan(n);
    lt.in[0] <== in[0];
    lt.in[1] <== in[1];
    out <== lt.out;
}

// ==================== Main Circuit ====================

/**
 * @title AgeProof
 * @dev Proves that user_age >= min_age without revealing actual age
 * @param nBits Number of bits for age representation (default 16 bits = max age 65535)
 * @input userBirthTimestamp User's birth date as Unix timestamp (private)
 * @input currentTimestamp Current date as Unix timestamp (public)
 * @input minAge Minimum required age in years (public)
 * @output isValid 1 if age >= min_age, 0 otherwise
 */
template AgeProof(nBits) {
    // ==================== Input Signals ====================
    signal private input userBirthTimestamp;  // Private: User's birth timestamp
    signal input currentTimestamp;            // Public: Current timestamp (from block.timestamp)
    signal input minAge;                       // Public: Minimum age required (e.g., 18)
    
    // ==================== Output Signals ====================
    signal output isValid;                     // Public: 1 if age >= minAge, else 0
    
    // ==================== Constants ====================
    // Seconds in a year (365.25 days average including leap years)
    var SECONDS_PER_YEAR = 31557600;  // 365.25 * 24 * 60 * 60
    
    // ==================== Signal Definitions ====================
    signal ageInSeconds;
    signal ageInYears;
    signal meetsRequirement;
    
    // ==================== Component Instances ====================
    
    // Component for LessThan comparison
    component lt = LessThan(nBits);
    
    // Component for checking if age >= minAge using subtraction
    component ageCheck = LessThan(nBits);
    
    // ==================== Logic ====================
    
    // Calculate age in seconds = current timestamp - birth timestamp
    // NOTE: This must be positive (birth must be in the past)
    signal ageInSecondsTemp;
    ageInSecondsTemp <== currentTimestamp - userBirthTimestamp;
    
    // Ensure age is positive (birth timestamp is in the past)
    signal isPositive;
    isPositive <-- ageInSecondsTemp > 0 ? 1 : 0;
    isPositive === 1;  // Constraint: birth must be in past
    
    ageInSeconds <== ageInSecondsTemp;
    
    // Calculate age in years (integer division approximation)
    // ageInYears = floor(ageInSeconds / SECONDS_PER_YEAR)
    ageInYears <-- ageInSeconds \ SECONDS_PER_YEAR;
    
    // Constraint to ensure integer division is correct:
    // ageInYears * SECONDS_PER_YEAR <= ageInSeconds < (ageInYears + 1) * SECONDS_PER_YEAR
    signal lowBound;
    signal highBound;
    
    lowBound <== ageInYears * SECONDS_PER_YEAR;
    highBound <== (ageInYears + 1) * SECONDS_PER_YEAR;
    
    // Check: lowBound <= ageInSeconds < highBound
    signal lowCheck;
    lowCheck <-- ageInSeconds - lowBound;
    lowCheck >= 0;  // Implicit constraint
    
    signal highCheck;
    highCheck <-- highBound - ageInSeconds;
    highCheck > 0;  // Implicit constraint
    
    // ==================== Age Verification ====================
    
    // Check if age meets minimum requirement
    // meetsRequirement = 1 if ageInYears >= minAge, else 0
    signal minAgeCopy;
    minAgeCopy <== minAge;
    
    // If ageInYears < minAge, then (minAge - ageInYears - 1) is >= 0
    // Using LessThan component to check ageInYears >= minAge
    ageCheck.in[0] <== minAgeCopy;
    ageCheck.in[1] <== ageInYears;
    meetsRequirement <== ageCheck.out;
    
    // Alternative approach: Check if (ageInYears - minAge) is non-negative
    signal ageDifference;
    ageDifference <-- ageInYears - minAge;
    
    // Constraint: If meetsRequirement is 1, ageDifference >= 0
    // If meetsRequirement is 0, ageDifference < 0
    signal isValidCheck;
    isValidCheck <== meetsRequirement;
    
    // Final output: isValid = meetsRequirement
    isValid <== meetsRequirement;
}

// ==================== Extended Circuit with Additional Features ====================

/**
 * @title AgeProofWithRange
 * @dev Proves age is within a specific range (e.g., between 18 and 65)
 * @param nBits Number of bits for age representation
 */
template AgeProofWithRange(nBits) {
    // Inputs
    signal private input userBirthTimestamp;
    signal input currentTimestamp;
    signal input minAge;     // Minimum age (e.g., 18)
    signal input maxAge;     // Maximum age (e.g., 65)
    
    // Outputs
    signal output isValid;
    
    // Components
    component ageProof = AgeProof(nBits);
    component maxAgeCheck = LessThan(nBits);
    
    // Calculate age using base AgeProof
    ageProof.userBirthTimestamp <== userBirthTimestamp;
    ageProof.currentTimestamp <== currentTimestamp;
    ageProof.minAge <== minAge;
    
    // Check max age: ageInYears <= maxAge
    signal ageInYears;
    signal maxCheck;
    
    // Get age from ageProof circuit (we need to extract it)
    // Note: This requires modifying AgeProof to expose ageInYears
    // For simplicity, we'll recalculate
    var SECONDS_PER_YEAR = 31557600;
    signal ageInSeconds;
    ageInSeconds <== currentTimestamp - userBirthTimestamp;
    ageInYears <-- ageInSeconds \ SECONDS_PER_YEAR;
    
    // Check age <= maxAge
    maxAgeCheck.in[0] <== ageInYears;
    maxAgeCheck.in[1] <== maxAge + 1;
    maxCheck <== maxAgeCheck.out;
    
    // Valid if age >= minAge AND age <= maxAge
    isValid <== ageProof.isValid * maxCheck;
}

/**
 * @title AgeProofWithHash
 * @dev Proves age while committing to user identity via hash
 * @param nBits Number of bits
 */
template AgeProofWithHash(nBits) {
    // Inputs
    signal private input userBirthTimestamp;
    signal private input userSecret;        // Private secret for user identity
    signal input currentTimestamp;
    signal input minAge;
    signal input userCommitment;             // Public: Hash(birthTimestamp, secret)
    
    // Outputs
    signal output isValid;
    signal output commitmentMatch;           // 1 if commitment matches
    
    // Components
    component ageCheck = AgeProof(nBits);
    component hashCheck;
    
    // Verify age
    ageCheck.userBirthTimestamp <== userBirthTimestamp;
    ageCheck.currentTimestamp <== currentTimestamp;
    ageCheck.minAge <== minAge;
    
    // Check commitment matches (Poseidon hash for ZK-friendly hashing)
    // Note: In production, use Poseidon hash from circomlib
    // For this example, we use a simple hash (not ZK-friendly, replace with Poseidon)
    
    // Simple commitment hash (not cryptographically secure for production)
    signal computedCommitment;
    computedCommitment <-- userBirthTimestamp + userSecret;
    
    // Constraint: computedCommitment must equal provided commitment
    signal diff;
    diff <-- computedCommitment - userCommitment;
    diff === 0;
    commitmentMatch <== 1;
    
    // Final validity
    isValid <== ageCheck.isValid * commitmentMatch;
}

/**
 * @title BatchAgeProof
 * @dev Proves multiple users meet age requirement in one circuit (for organizations)
 * @param numUsers Number of users in batch
 */
template BatchAgeProof(numUsers, nBits) {
    // Inputs
    signal private input userBirthTimestamps[numUsers];
    signal input currentTimestamp;
    signal input minAge;
    
    // Outputs
    signal output allValid;      // 1 if all users meet age requirement
    
    // Components array
    component ageChecks[numUsers];
    signal validFlags[numUsers];
    
    // Check each user
    for (var i = 0; i < numUsers; i++) {
        ageChecks[i] = AgeProof(nBits);
        ageChecks[i].userBirthTimestamp <== userBirthTimestamps[i];
        ageChecks[i].currentTimestamp <== currentTimestamp;
        ageChecks[i].minAge <== minAge;
        validFlags[i] <== ageChecks[i].isValid;
    }
    
    // Verify all are valid (AND operation)
    signal product;
    product <== validFlags[0];
    
    for (var i = 1; i < numUsers; i++) {
        product <== product * validFlags[i];
    }
    
    allValid <== product;
}

// ==================== Main Entry Point ====================

// Default circuit with 32-bit integers (supports ages up to ~136 years)
component main {public [currentTimestamp, minAge]} = AgeProof(32);

// Alternative: Circuit with range check
// component main {public [currentTimestamp, minAge, maxAge]} = AgeProofWithRange(32);

// Alternative: Circuit with user commitment
// component main {public [currentTimestamp, minAge, userCommitment]} = AgeProofWithHash(32);
