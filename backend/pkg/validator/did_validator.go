// backend/pkg/validator/did_validator.go
// all the validation nned to be seen -- test code 
package validator

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/xeipuuv/gojsonschema"
)

// DIDValidator handles validation of DID documents against the schema
type DIDValidator struct {
	schemaLoader *gojsonschema.Schema
	schemaJSON   json.RawMessage
}

// NewDIDValidator creates a new DID validator instance
func NewDIDValidator(schemaPath string) (*DIDValidator, error) {
	schemaLoader := gojsonschema.NewReferenceLoader("file://" + schemaPath)
	schema, err := gojsonschema.NewSchema(schemaLoader)
	if err != nil {
		return nil, fmt.Errorf("failed to load schema: %w", err)
	}

	return &DIDValidator{
		schemaLoader: schema,
	}, nil
}

// Validate validates a DID document against the schema
func (v *DIDValidator) Validate(document map[string]interface{}) (*ValidationResult, error) {
	documentLoader := gojsonschema.NewGoLoader(document)
	
	result, err := v.schemaLoader.Validate(documentLoader)
	if err != nil {
		return nil, fmt.Errorf("validation failed: %w", err)
	}

	validationResult := &ValidationResult{
		Valid: result.Valid(),
		Errors: make([]ValidationError, 0),
	}

	if !result.Valid() {
		for _, err := range result.Errors() {
			validationResult.Errors = append(validationResult.Errors, ValidationError{
				Field:   err.Field(),
				Message: err.Description(),
				Type:    err.Type(),
			})
		}
	}

	return validationResult, nil
}

// ValidationResult represents the result of a validation
type ValidationResult struct {
	Valid  bool              `json:"valid"`
	Errors []ValidationError `json:"errors,omitempty"`
}

// ValidationError represents a single validation error
type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
	Type    string `json:"type"`
}

// Additional validation methods
func (v *DIDValidator) ValidateDIDFormat(did string) bool {
	pattern := `^did:[a-z0-9]+:[a-zA-Z0-9_.-]+$`
	matched, _ := regexp.MatchString(pattern, did)
	return matched
}

func (v *DIDValidator) ValidateVerificationMethod(method map[string]interface{}) bool {
	// Check required fields
	if _, ok := method["id"]; !ok {
		return false
	}
	if _, ok := method["type"]; !ok {
		return false
	}
	if _, ok := method["controller"]; !ok {
		return false
	}
	
	// Check at least one key representation
	hasKey := false
	if _, ok := method["publicKeyMultibase"]; ok {
		hasKey = true
	}
	if _, ok := method["publicKeyJwk"]; ok {
		hasKey = true
	}
	if _, ok := method["ethereumAddress"]; ok {
		hasKey = true
	}
	
	return hasKey
}

func (v *DIDValidator) ValidateService(service map[string]interface{}) bool {
	if _, ok := service["id"]; !ok {
		return false
	}
	if _, ok := service["type"]; !ok {
		return false
	}
	if _, ok := service["serviceEndpoint"]; !ok {
		return false
	}
	return true
}

func (v *DIDValidator) ValidateTimestamp(timestamp string) bool {
	_, err := time.Parse(time.RFC3339, timestamp)
	return err == nil
}

// ValidateDIDDocumentComplete performs comprehensive validation
func (v *DIDValidator) ValidateDIDDocumentComplete(document map[string]interface{}) (*CompleteValidationResult, error) {
	result := &CompleteValidationResult{
		Valid:        true,
		Warnings:     make([]string, 0),
		Errors:       make([]string, 0),
		Suggestions:  make([]string, 0),
	}

	// 1. Schema validation
	schemaResult, err := v.Validate(document)
	if err != nil {
		return nil, err
	}
	
	if !schemaResult.Valid {
		result.Valid = false
		for _, err := range schemaResult.Errors {
			result.Errors = append(result.Errors, fmt.Sprintf("%s: %s", err.Field, err.Message))
		}
	}

	// 2. Check verification methods
	if vms, ok := document["verificationMethod"].([]interface{}); ok && len(vms) > 0 {
		hasAuthentication := false
		if _, ok := document["authentication"]; ok {
			hasAuthentication = true
		}
		if _, ok := document["assertionMethod"]; ok {
			hasAuthentication = true
		}
		
		if !hasAuthentication {
			result.Warnings = append(result.Warnings, 
				"DID document has verification methods but no authentication or assertion methods")
			result.Suggestions = append(result.Suggestions,
				"Add 'authentication' or 'assertionMethod' field referencing verification methods")
		}
	}

	// 3. Check timestamp consistency
	if created, ok := document["created"].(string); ok {
		if !v.ValidateTimestamp(created) {
			result.Errors = append(result.Errors, "Invalid 'created' timestamp format")
		}
	}
	
	if updated, ok := document["updated"].(string); ok {
		if !v.ValidateTimestamp(updated) {
			result.Errors = append(result.Errors, "Invalid 'updated' timestamp format")
		}
	}

	// 4. Check profile completeness
	if profile, ok := document["profile"].(map[string]interface{}); ok {
		if _, ok := profile["name"]; !ok {
			result.Warnings = append(result.Warnings, "Profile exists but missing 'name' field")
		}
	}

	// 5. Check service endpoints
	if services, ok := document["service"].([]interface{}); ok {
		for i, svc := range services {
			service, ok := svc.(map[string]interface{})
			if !ok {
				continue
			}
			if _, ok := service["serviceEndpoint"]; !ok {
				result.Errors = append(result.Errors, 
					fmt.Sprintf("Service at index %d missing 'serviceEndpoint'", i))
			}
		}
	}

	return result, nil
}

// CompleteValidationResult represents comprehensive validation results
type CompleteValidationResult struct {
	Valid       bool     `json:"valid"`
	Warnings    []string `json:"warnings,omitempty"`
	Errors      []string `json:"errors,omitempty"`
	Suggestions []string `json:"suggestions,omitempty"`
}
