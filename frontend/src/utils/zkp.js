// frontend/src/utils/zkp.js
// Zero-Knowledge Proof utilities using snarkjs

import * as snarkjs from 'snarkjs';
import { utils } from 'ethers';

// ==================== Configuration ====================

// Circuit file paths (from public directory)
const CIRCUITS = {
  ageProof: {
    wasm: '/circuits/AgeProof.wasm',
    zkey: '/circuits/AgeProof_final.zkey',
    vkey: '/circuits/verification_key.json'
  },
  identityProof: {
    wasm: '/circuits/IdentityProof.wasm',
    zkey: '/circuits/IdentityProof_final.zkey',
    vkey: '/circuits/verification_key.json'
  }
};

// Cache for loaded circuits
let circuitCache = {};

// ==================== Helper Functions ====================

/**
 * Convert number to field element (BigInt)
 * @param {number|string|BigInt} value - Value to convert
 * @returns {BigInt} Field element
 */
export const toFieldElement = (value) => {
  const bigInt = BigInt(value);
  const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  return bigInt % FIELD_SIZE;
};

/**
 * Convert date to timestamp (seconds)
 * @param {Date|string} date - Date object or string
 * @returns {number} Unix timestamp
 */
export const dateToTimestamp = (date) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor(d.getTime() / 1000);
};

/**
 * Generate unique nullifier
 * @param {string} account - User's Ethereum address
 * @param {string} context - Context string (e.g., 'age', 'identity')
 * @param {number} timestamp - Optional timestamp
 * @returns {string} Nullifier (hex string)
 */
export const generateNullifier = (account, context, timestamp = null) => {
  const ts = timestamp || Date.now();
  const data = `${account.toLowerCase()}:${context}:${ts}`;
  return utils.keccak256(utils.toUtf8Bytes(data));
};

/**
 * Generate random salt for commitments
 * @returns {bigint} Random salt
 */
export const generateSalt = () => {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return BigInt('0x' + Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
};

/**
 * Load circuit files
 * @param {string} circuitType - 'ageProof' or 'identityProof'
 * @returns {Promise<Object>} Circuit files
 */
export const loadCircuit = async (circuitType) => {
  if (circuitCache[circuitType]) {
    return circuitCache[circuitType];
  }

  const circuit = CIRCUITS[circuitType];
  if (!circuit) {
    throw new Error(`Unknown circuit type: ${circuitType}`);
  }

  try {
    // Load verification key
    const vkeyResponse = await fetch(circuit.vkey);
    const vkey = await vkeyResponse.json();

    circuitCache[circuitType] = {
      wasm: circuit.wasm,
      zkey: circuit.zkey,
      vkey: vkey
    };

    return circuitCache[circuitType];
  } catch (error) {
    console.error(`Error loading circuit ${circuitType}:`, error);
    throw new Error(`Failed to load circuit: ${error.message}`);
  }
};

/**
 * Load all circuits
 * @returns {Promise<Object>} All loaded circuits
 */
export const loadAllCircuits = async () => {
  const ageProof = await loadCircuit('ageProof');
  const identityProof = await loadCircuit('identityProof');
  return { ageProof, identityProof };
};

// ==================== Age Proof Functions ====================

/**
 * Generate age proof
 * @param {Object} inputs - Proof inputs
 * @param {number} inputs.birthTimestamp - User's birth timestamp (private)
 * @param {number} inputs.currentTimestamp - Current timestamp (public)
 * @param {number} inputs.minAge - Minimum age requirement (public)
 * @param {string} inputs.nullifier - Unique nullifier for replay protection
 * @returns {Promise<Object>} Proof object
 */
export const proveAge = async (inputs) => {
  const { birthTimestamp, currentTimestamp, minAge, nullifier } = inputs;

  // Validate inputs
  if (!birthTimestamp || !currentTimestamp) {
    throw new Error('Birth timestamp and current timestamp are required');
  }

  // Prepare circuit inputs
  const circuitInputs = {
    userBirthTimestamp: toFieldElement(birthTimestamp),
    currentTimestamp: toFieldElement(currentTimestamp),
    minAge: toFieldElement(minAge),
    nullifier: toFieldElement(nullifier)
  };

  try {
    // Load circuit
    const circuit = await loadCircuit('ageProof');

    // Generate witness and proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      circuit.wasm,
      circuit.zkey
    );

    // Format proof for Solidity
    const formattedProof = formatProofForSolidity(proof);

    return {
      success: true,
      proof: formattedProof,
      publicSignals: publicSignals.map(s => s.toString()),
      circuitInputs: {
        currentTimestamp: currentTimestamp.toString(),
        minAge: minAge.toString()
      },
      nullifier: nullifier
    };
  } catch (error) {
    console.error('Age proof generation error:', error);
    throw new Error(`Failed to generate age proof: ${error.message}`);
  }
};

/**
 * Verify age proof
 * @param {Object} proof - Proof object
 * @param {Object} publicSignals - Public signals
 * @returns {Promise<boolean>} True if valid
 */
export const verifyAgeProof = async (proof, publicSignals) => {
  try {
    const circuit = await loadCircuit('ageProof');
    
    const isValid = await snarkjs.groth16.verify(
      circuit.vkey,
      publicSignals,
      proof
    );
    
    return isValid;
  } catch (error) {
    console.error('Age proof verification error:', error);
    return false;
  }
};

// ==================== Identity Proof Functions ====================

/**
 * Generate identity proof
 * @param {Object} identityData - User's identity data
 * @param {Object} requiredAttributes - Which attributes to verify
 * @returns {Promise<Object>} Proof object
 */
export const proveIdentity = async (identityData, requiredAttributes) => {
  const {
    name = '',
    nationality = '',
    documentNumber = '',
    dateOfBirth = '',
    additionalData = {}
  } = identityData;

  const {
    verifyName = false,
    verifyNationality = false,
    verifyDocument = false,
    minAge = 0
  } = requiredAttributes;

  // Prepare circuit inputs
  const circuitInputs = {
    // Private inputs (user's actual data)
    userName: stringToFieldArray(name, 32),
    userNationality: stringToFieldElement(nationality),
    userDocumentNumber: stringToFieldArray(documentNumber, 20),
    userBirthTimestamp: toFieldElement(dateToTimestamp(dateOfBirth)),
    userSecret: toFieldElement(generateSalt()),
    
    // Public inputs
    currentTimestamp: toFieldElement(Math.floor(Date.now() / 1000)),
    minAge: toFieldElement(minAge),
    requiredName: toFieldElement(verifyName ? 1 : 0),
    requiredNationality: toFieldElement(verifyNationality ? 1 : 0),
    requiredDocument: toFieldElement(verifyDocument ? 1 : 0),
    
    // Expected values (public for verification)
    expectedName: verifyName ? stringToFieldArray(name, 32) : Array(32).fill(0),
    expectedNationality: verifyNationality ? stringToFieldElement(nationality) : 0,
    expectedDocumentHash: verifyDocument ? hashDocumentNumber(documentNumber) : 0
  };

  try {
    // Load circuit
    const circuit = await loadCircuit('identityProof');

    // Generate witness and proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      circuitInputs,
      circuit.wasm,
      circuit.zkey
    );

    // Format proof for Solidity
    const formattedProof = formatProofForSolidity(proof);

    return {
      success: true,
      proof: formattedProof,
      publicSignals: publicSignals.map(s => s.toString()),
      circuitInputs: {
        minAge: minAge.toString(),
        timestamp: circuitInputs.currentTimestamp.toString(),
        attributesVerified: {
          name: verifyName,
          nationality: verifyNationality,
          document: verifyDocument
        }
      }
    };
  } catch (error) {
    console.error('Identity proof generation error:', error);
    throw new Error(`Failed to generate identity proof: ${error.message}`);
  }
};

/**
 * Verify identity proof
 * @param {Object} proof - Proof object
 * @param {Object} publicSignals - Public signals
 * @returns {Promise<boolean>} True if valid
 */
export const verifyIdentityProof = async (proof, publicSignals) => {
  try {
    const circuit = await loadCircuit('identityProof');
    
    const isValid = await snarkjs.groth16.verify(
      circuit.vkey,
      publicSignals,
      proof
    );
    
    return isValid;
  } catch (error) {
    console.error('Identity proof verification error:', error);
    return false;
  }
};

// ==================== Generic Proof Functions ====================

/**
 * Format proof for Solidity contract
 * @param {Object} proof - Raw proof from snarkjs
 * @returns {Object} Formatted proof
 */
export const formatProofForSolidity = (proof) => {
  // Format for Solidity's groth16 verifier
  // Expected format: { a, b, c } where:
  // a = [a0, a1]
  // b = [[b00, b01], [b10, b11]]
  // c = [c0, c1]
  
  return {
    a: [
      utils.hexZeroPad(utils.hexlify(proof.pi_a[0]), 32),
      utils.hexZeroPad(utils.hexlify(proof.pi_a[1]), 32)
    ],
    b: [
      [
        utils.hexZeroPad(utils.hexlify(proof.pi_b[0][1]), 32),
        utils.hexZeroPad(utils.hexlify(proof.pi_b[0][0]), 32)
      ],
      [
        utils.hexZeroPad(utils.hexlify(proof.pi_b[1][1]), 32),
        utils.hexZeroPad(utils.hexlify(proof.pi_b[1][0]), 32)
      ]
    ],
    c: [
      utils.hexZeroPad(utils.hexlify(proof.pi_c[0]), 32),
      utils.hexZeroPad(utils.hexlify(proof.pi_c[1]), 32)
    ]
  };
};

/**
 * Convert string to field element array
 * @param {string} str - Input string
 * @param {number} length - Fixed length
 * @returns {bigint[]} Array of field elements
 */
export const stringToFieldArray = (str, length) => {
  const arr = new Array(length).fill(0n);
  for (let i = 0; i < Math.min(str.length, length); i++) {
    arr[i] = toFieldElement(str.charCodeAt(i));
  }
  return arr;
};

/**
 * Convert string to single field element
 * @param {string} str - Input string
 * @returns {bigint} Field element
 */
export const stringToFieldElement = (str) => {
  let result = 0n;
  for (let i = 0; i < str.length; i++) {
    result = (result * 256n + BigInt(str.charCodeAt(i))) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  }
  return result;
};

/**
 * Hash document number
 * @param {string} docNumber - Document number
 * @returns {bigint} Hash as field element
 */
export const hashDocumentNumber = (docNumber) => {
  const hash = utils.keccak256(utils.toUtf8Bytes(docNumber));
  return toFieldElement(hash);
};

/**
 * Verify any proof using verification key
 * @param {Object} proof - Proof object
 * @param {string[]} publicSignals - Public signals
 * @param {Object} vkey - Verification key
 * @returns {Promise<boolean>} True if valid
 */
export const verifyProof = async (proof, publicSignals, vkey) => {
  try {
    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
    return isValid;
  } catch (error) {
    console.error('Proof verification error:', error);
    return false;
  }
};

/**
 * Export verification key to JSON
 * @param {string} circuitType - 'ageProof' or 'identityProof'
 * @returns {Promise<Object>} Verification key
 */
export const exportVerificationKey = async (circuitType) => {
  const circuit = await loadCircuit(circuitType);
  return circuit.vkey;
};

// ==================== Commitment Functions ====================

/**
 * Generate Pedersen commitment (using Poseidon hash)
 * @param {bigint} value - Value to commit
 * @param {bigint} salt - Random salt
 * @returns {bigint} Commitment
 */
export const generateCommitment = (value, salt) => {
  // Simple hash-based commitment
  // In production, use Poseidon hash from circomlib
  const combined = (value * 21888242871839275222246405745257275088548364400416034343698204186575808495617n + salt) % 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  return combined;
};

/**
 ==================== Export Default ====================
 */
export default {
  // Age proof
  proveAge,
  verifyAgeProof,
  
  // Identity proof
  proveIdentity,
  verifyIdentityProof,
  
  // Generic
  loadCircuit,
  loadAllCircuits,
  verifyProof,
  formatProofForSolidity,
  exportVerificationKey,
  
  // Utilities
  toFieldElement,
  dateToTimestamp,
  generateNullifier,
  generateSalt,
  stringToFieldArray,
  stringToFieldElement,
  hashDocumentNumber,
  generateCommitment
};
