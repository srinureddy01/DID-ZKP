// scripts/zkp/generate_proof.js
// ZKP Proof Generation Script for DID Protocol

const fs = require('fs');
const path = require('path');
const snarkjs = require('snarkjs');
const crypto = require('crypto');

// ==================== Configuration ====================

const CONFIG = {
  // Circuit paths
  circuits: {
    ageProof: {
      wasm: '../../circuits/build/AgeProof_js/AgeProof.wasm',
      zkey: '../../circuits/zkeys/AgeProof.zkey',
      vkey: '../../frontend/public/circuits/AgeProof_verification_key.json',
    },
    identityProof: {
      wasm: '../../circuits/build/IdentityProof_js/IdentityProof.wasm',
      zkey: '../../circuits/zkeys/IdentityProof.zkey',
      vkey: '../../frontend/public/circuits/IdentityProof_verification_key.json',
    },
  },
  
  // Output directory
  outputDir: '../../proofs',
};

// ==================== Proof Generator Class ====================

class ZKPGenerator {
  constructor() {
    this.circuits = {};
    this.loaded = false;
  }

  /**
   * Load all circuit files
   */
  async loadCircuits() {
    if (this.loaded) return;
    
    console.log('📦 Loading circuits...');
    
    for (const [name, config] of Object.entries(CONFIG.circuits)) {
      try {
        // Check if files exist
        const wasmPath = path.resolve(__dirname, config.wasm);
        const zkeyPath = path.resolve(__dirname, config.zkey);
        
        if (!fs.existsSync(wasmPath)) {
          throw new Error(`WASM file not found: ${wasmPath}`);
        }
        
        if (!fs.existsSync(zkeyPath)) {
          throw new Error(`ZKEY file not found: ${zkeyPath}`);
        }
        
        this.circuits[name] = {
          wasm: wasmPath,
          zkey: zkeyPath,
          vkey: config.vkey ? path.resolve(__dirname, config.vkey) : null,
        };
        
        console.log(`  ✅ Loaded ${name}`);
      } catch (error) {
        console.error(`  ❌ Failed to load ${name}:`, error.message);
        throw error;
      }
    }
    
    this.loaded = true;
    console.log('✅ All circuits loaded successfully\n');
  }

  /**
   * Generate a proof for a circuit
   * @param {string} circuitName - Name of the circuit ('ageProof' or 'identityProof')
   * @param {Object} inputs - Circuit inputs
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated proof
   */
  async generateProof(circuitName, inputs, options = {}) {
    if (!this.loaded) {
      await this.loadCircuits();
    }
    
    const circuit = this.circuits[circuitName];
    if (!circuit) {
      throw new Error(`Circuit not found: ${circuitName}`);
    }
    
    console.log(`🔐 Generating ${circuitName} proof...`);
    
    try {
      // Step 1: Generate witness and proof
      const startTime = Date.now();
      
      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        inputs,
        circuit.wasm,
        circuit.zkey
      );
      
      const generationTime = Date.now() - startTime;
      
      // Step 2: Verify the proof (optional)
      let verified = false;
      if (circuit.vkey && fs.existsSync(circuit.vkey)) {
        try {
          const vkey = JSON.parse(fs.readFileSync(circuit.vkey, 'utf8'));
          verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
        } catch (error) {
          console.warn('⚠️ Proof verification skipped:', error.message);
        }
      }
      
      // Step 3: Format for Solidity
      const formattedProof = this.formatProofForSolidity(proof);
      
      // Step 4: Generate proof metadata
      const metadata = {
        circuit: circuitName,
        generatedAt: new Date().toISOString(),
        generationTime: `${generationTime}ms`,
        verified: verified,
        publicSignals: publicSignals.map(s => s.toString()),
        nullifier: options.nullifier || this.generateNullifier(inputs),
        timestamp: Date.now(),
      };
      
      const result = {
        success: true,
        proof: formattedProof,
        publicSignals: publicSignals.map(s => s.toString()),
        metadata: metadata,
        rawProof: proof,
        verified: verified,
      };
      
      console.log(`  ✅ Proof generated in ${generationTime}ms`);
      console.log(`  📊 Public signals: ${publicSignals.length}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Failed to generate ${circuitName} proof:`, error.message);
      throw error;
    }
  }

  /**
   * Format proof for Solidity contract
   * @param {Object} proof - Raw proof from snarkjs
   * @returns {Object} Formatted proof
   */
  formatProofForSolidity(proof) {
    // Format for Solidity's groth16 verifier
    return {
      a: [
        proof.pi_a[0].toString(),
        proof.pi_a[1].toString(),
      ],
      b: [
        [
          proof.pi_b[0][1].toString(),
          proof.pi_b[0][0].toString(),
        ],
        [
          proof.pi_b[1][1].toString(),
          proof.pi_b[1][0].toString(),
        ],
      ],
      c: [
        proof.pi_c[0].toString(),
        proof.pi_c[1].toString(),
      ],
    };
  }

  /**
   * Generate a nullifier for replay protection
   * @param {Object} inputs - Circuit inputs
   * @returns {string} Nullifier
   */
  generateNullifier(inputs) {
    const data = JSON.stringify(inputs) + Date.now().toString();
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Save proof to file
   * @param {Object} proofResult - Proof result from generateProof
   * @param {string} filename - Output filename
   * @returns {string} File path
   */
  saveProof(proofResult, filename) {
    const outputDir = path.resolve(__dirname, CONFIG.outputDir);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filePath = path.join(outputDir, filename || `proof-${Date.now()}.json`);
    
    const output = {
      proof: proofResult.proof,
      publicSignals: proofResult.publicSignals,
      metadata: proofResult.metadata,
    };
    
    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));
    console.log(`💾 Proof saved to: ${filePath}`);
    
    return filePath;
  }

  /**
   * Save proof for Solidity verification
   * @param {Object} proofResult - Proof result
   * @param {string} filename - Output filename
   * @returns {string} File path
   */
  saveProofForSolidity(proofResult, filename) {
    const outputDir = path.resolve(__dirname, CONFIG.outputDir);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const filePath = path.join(outputDir, filename || `solidity-proof-${Date.now()}.json`);
    
    // Format for Solidity contract call
    const solidityProof = {
      a: proofResult.proof.a.map(s => s.toString()),
      b: proofResult.proof.b.map(inner => inner.map(s => s.toString())),
      c: proofResult.proof.c.map(s => s.toString()),
      publicSignals: proofResult.publicSignals.map(s => s.toString()),
    };
    
    fs.writeFileSync(filePath, JSON.stringify(solidityProof, null, 2));
    console.log(`💾 Solidity proof saved to: ${filePath}`);
    
    return filePath;
  }

  /**
   * Verify a proof with verification key
   * @param {Object} vkey - Verification key
   * @param {Object} proof - Proof object
   * @param {Array} publicSignals - Public signals
   * @returns {Promise<boolean>} True if valid
   */
  async verifyProof(vkey, proof, publicSignals) {
    try {
      const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
      return isValid;
    } catch (error) {
      console.error('Verification error:', error.message);
      return false;
    }
  }
}

// ==================== Specific Proof Generators ====================

/**
 * Generate Age Proof
 * @param {Object} params - Age proof parameters
 * @param {number} params.birthTimestamp - User's birth timestamp (private)
 * @param {number} params.currentTimestamp - Current timestamp (public)
 * @param {number} params.minAge - Minimum age requirement (public)
 * @param {string} params.nullifier - Unique nullifier
 * @returns {Promise<Object>} Age proof
 */
async function generateAgeProof(params) {
  const generator = new ZKPGenerator();
  await generator.loadCircuits();
  
  const inputs = {
    userBirthTimestamp: params.birthTimestamp,
    currentTimestamp: params.currentTimestamp || Math.floor(Date.now() / 1000),
    minAge: params.minAge || 18,
  };
  
  return generator.generateProof('ageProof', inputs, {
    nullifier: params.nullifier,
  });
}

/**
 * Generate Identity Proof
 * @param {Object} params - Identity proof parameters
 * @param {Array} params.userName - User name as field array
 * @param {number} params.userNationality - Nationality code
 * @param {Array} params.userDocumentNumber - Document number as field array
 * @param {number} params.userBirthTimestamp - Birth timestamp
 * @param {number} params.userSecret - User secret
 * @param {number} params.currentTimestamp - Current timestamp
 * @param {number} params.minAge - Minimum age requirement
 * @param {number} params.requiredName - Whether name is required
 * @param {number} params.requiredNationality - Whether nationality is required
 * @param {number} params.requiredDocument - Whether document is required
 * @param {Array} params.expectedName - Expected name for verification
 * @param {number} params.expectedNationality - Expected nationality
 * @param {number} params.expectedDocumentHash - Expected document hash
 * @returns {Promise<Object>} Identity proof
 */
async function generateIdentityProof(params) {
  const generator = new ZKPGenerator();
  await generator.loadCircuits();
  
  const inputs = {
    userName: params.userName || Array(32).fill(0),
    userNationality: params.userNationality || 0,
    userDocumentNumber: params.userDocumentNumber || Array(20).fill(0),
    userBirthTimestamp: params.userBirthTimestamp || 0,
    userSecret: params.userSecret || 0,
    currentTimestamp: params.currentTimestamp || Math.floor(Date.now() / 1000),
    minAge: params.minAge || 0,
    requiredName: params.requiredName || 0,
    requiredNationality: params.requiredNationality || 0,
    requiredDocument: params.requiredDocument || 0,
    expectedName: params.expectedName || Array(32).fill(0),
    expectedNationality: params.expectedNationality || 0,
    expectedDocumentHash: params.expectedDocumentHash || 0,
  };
  
  return generator.generateProof('identityProof', inputs, {
    nullifier: params.nullifier,
  });
}

// ==================== Helper Functions ====================

/**
 * Convert string to field array
 * @param {string} str - String to convert
 * @param {number} length - Array length
 * @returns {Array} Field array
 */
function stringToFieldArray(str, length) {
  const arr = new Array(length).fill(0);
  for (let i = 0; i < Math.min(str.length, length); i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
}

/**
 * Calculate age from birth timestamp
 * @param {number} birthTimestamp - Birth timestamp
 * @param {number} currentTimestamp - Current timestamp
 * @returns {number} Age in years
 */
function calculateAge(birthTimestamp, currentTimestamp) {
  const birthDate = new Date(birthTimestamp * 1000);
  const currentDate = new Date(currentTimestamp * 1000);
  let age = currentDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = currentDate.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Generate sample user data for identity proof
 * @returns {Object} Sample user data
 */
function generateSampleUserData() {
  return {
    name: "Alice",
    nationality: 1, // USA
    documentNumber: "1234567890",
    birthTimestamp: 946684800, // Jan 1, 2000
    secret: 123456789,
  };
}

// ==================== CLI Interface ====================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  
  console.log('\n🔐 DID Protocol ZKP Generator\n');
  
  const generator = new ZKPGenerator();
  await generator.loadCircuits();
  
  switch (command) {
    case 'age': {
      // Generate age proof
      const birthDate = args[1] ? new Date(args[1]) : new Date('2000-01-01');
      const birthTimestamp = Math.floor(birthDate.getTime() / 1000);
      const minAge = parseInt(args[2]) || 18;
      
      console.log(`📅 Birth Date: ${birthDate.toISOString().split('T')[0]}`);
      console.log(`🎯 Min Age: ${minAge}`);
      
      const result = await generateAgeProof({
        birthTimestamp,
        minAge,
      });
      
      if (result.success) {
        generator.saveProofForSolidity(result, `age-proof-${Date.now()}.json`);
        console.log('\n✅ Age proof generated successfully!');
        console.log(`📊 Public Signals: ${result.publicSignals.join(', ')}`);
      }
      break;
    }
    
    case 'identity': {
      // Generate identity proof
      const userData = generateSampleUserData();
      const requiredAttributes = {
        requiredName: 1,
        requiredNationality: 1,
        requiredDocument: 0,
        minAge: 18,
      };
      
      console.log('👤 Generating identity proof for:', userData.name);
      
      const result = await generateIdentityProof({
        userName: stringToFieldArray(userData.name, 32),
        userNationality: userData.nationality,
        userDocumentNumber: stringToFieldArray(userData.documentNumber, 20),
        userBirthTimestamp: userData.birthTimestamp,
        userSecret: userData.secret,
        minAge: requiredAttributes.minAge,
        requiredName: requiredAttributes.requiredName,
        requiredNationality: requiredAttributes.requiredNationality,
        requiredDocument: requiredAttributes.requiredDocument,
        expectedName: stringToFieldArray(userData.name, 32),
        expectedNationality: userData.nationality,
        expectedDocumentHash: 0,
      });
      
      if (result.success) {
        generator.saveProofForSolidity(result, `identity-proof-${Date.now()}.json`);
        console.log('\n✅ Identity proof generated successfully!');
        console.log(`📊 Public Signals: ${result.publicSignals.join(', ')}`);
      }
      break;
    }
    
    case 'verify': {
      // Verify a proof
      const proofPath = args[1];
      if (!proofPath) {
        console.error('❌ Please provide proof file path');
        console.log('Usage: node generate_proof.js verify <proof-file>');
        process.exit(1);
      }
      
      const proofData = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
      const circuitName = proofData.metadata?.circuit || 'ageProof';
      const circuit = generator.circuits[circuitName];
      
      if (!circuit || !circuit.vkey) {
        console.error('❌ Circuit or verification key not found');
        process.exit(1);
      }
      
      const vkey = JSON.parse(fs.readFileSync(circuit.vkey, 'utf8'));
      const isValid = await generator.verifyProof(
        vkey,
        proofData.proof,
        proofData.publicSignals
      );
      
      console.log(isValid ? '✅ Proof is valid!' : '❌ Proof is invalid!');
      break;
    }
    
    case 'batch': {
      // Generate multiple proofs
      const count = parseInt(args[1]) || 5;
      console.log(`📦 Generating ${count} age proofs...`);
      
      for (let i = 0; i < count; i++) {
        const birthDate = new Date(2000 - i, 0, 1);
        const birthTimestamp = Math.floor(birthDate.getTime() / 1000);
        const minAge = 18 + (i % 10);
        
        const result = await generateAgeProof({
          birthTimestamp,
          minAge,
        });
        
        if (result.success) {
          generator.saveProofForSolidity(result, `age-proof-${i}-${Date.now()}.json`);
          console.log(`  ✅ Proof ${i + 1}/${count} generated`);
        }
      }
      break;
    }
    
    case 'help':
    default: {
      console.log('Usage:');
      console.log('  node generate_proof.js age [birthDate] [minAge]');
      console.log('  node generate_proof.js identity');
      console.log('  node generate_proof.js verify <proof-file>');
      console.log('  node generate_proof.js batch [count]');
      console.log('  node generate_proof.js help');
      console.log('');
      console.log('Examples:');
      console.log('  node generate_proof.js age 2000-01-01 18');
      console.log('  node generate_proof.js identity');
      console.log('  node generate_proof.js verify proof.json');
      console.log('  node generate_proof.js batch 10');
      break;
    }
  }
}

// ==================== Export ====================

module.exports = {
  ZKPGenerator,
  generateAgeProof,
  generateIdentityProof,
  stringToFieldArray,
  calculateAge,
  generateSampleUserData,
};

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
}
