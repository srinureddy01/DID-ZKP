// ipfs/schemas/validate-did.js
// DID Document validation script
// code was updated on 6/11/2026 -svr

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Load schemas
const didSchema = JSON.parse(fs.readFileSync(path.join(__dirname, 'did-schema.json'), 'utf8'));
const resolutionSchema = JSON.parse(fs.readFileSync(path.join(__dirname, 'did-resolution-result-schema.json'), 'utf8'));

// Initialize AJV validator
const ajv = new Ajv({ 
  allErrors: true, 
  verbose: true,
  strict: false 
});
addFormats(ajv);

// Compile schemas
const validateDIDDocument = ajv.compile(didSchema);
const validateResolutionResult = ajv.compile(resolutionSchema);

/**
 * Validate a DID document
 * @param {Object} document - DID document to validate
 * @returns {Object} Validation result
 */
function validateDIDDocument(document) {
  const valid = validateDIDDocument(document);
  
  return {
    valid: valid,
    errors: validateDIDDocument.errors,
    document: document
  };
}

/**
 * Validate a resolution result
 * @param {Object} result - Resolution result to validate
 * @returns {Object} Validation result
 */
function validateResolutionResult(result) {
  const valid = validateResolutionResult(result);
  
  return {
    valid: valid,
    errors: validateResolutionResult.errors,
    result: result
  };
}

/**
 * Get validation errors in human-readable format
 * @param {Array} errors - AJV errors array
 * @returns {Array} Formatted errors
 */
function formatValidationErrors(errors) {
  if (!errors) return [];
  
  return errors.map(error => ({
    field: error.instancePath || error.schemaPath,
    message: error.message,
    params: error.params
  }));
}

// CLI usage
if (require.main === module) {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('Usage: node validate-did.js <path-to-did-document.json>');
    process.exit(1);
  }
  
  try {
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const result = validateDIDDocument(document);
    
    if (result.valid) {
      console.log('✅ DID document is valid!');
      process.exit(0);
    } else {
      console.log('❌ DID document is invalid:');
      console.log(formatValidationErrors(result.errors));
      process.exit(1);
    }
  } catch (error) {
    console.error('Error reading or parsing file:', error.message);
    process.exit(1);
  }
}

module.exports = {
  validateDIDDocument,
  validateResolutionResult,
  formatValidationErrors,
  schemas: {
    did: didSchema,
    resolution: resolutionSchema
  }
};
