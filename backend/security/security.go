package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	secretKey     []byte
	secretKeyOnce sync.Once
)

// InitSecretKey sets up the HMAC signing key. It reads it from environment
// variable SECURE_KEY, or dynamically generates a cryptographically secure random key on startup.
func InitSecretKey() {
	secretKeyOnce.Do(func() {
		envKey := os.Getenv("SECURE_KEY")
		if envKey != "" {
			secretKey = []byte(envKey)
			return
		}

		// Fallback to generating a secure random key
		randomKey := make([]byte, 32)
		_, err := rand.Read(randomKey)
		if err != nil {
			// Extremely unlikely failure: fallback to static secret
			secretKey = []byte("internal-file-manager-default-static-fallback-key-2026")
			return
		}
		secretKey = randomKey
	})
}

// GenerateDownloadToken generates a cryptographically signed, URL-safe download token.
func GenerateDownloadToken(systemName string, validity time.Duration) string {
	InitSecretKey()

	expiresAt := time.Now().Add(validity).UnixMilli()
	
	// Construct the payload as: <systemName>:<expiresAt>
	payload := fmt.Sprintf("%s:%d", systemName, expiresAt)
	payloadBytes := []byte(payload)
	
	// Calculate HMAC-SHA256 signature
	mac := hmac.New(sha256.New, secretKey)
	mac.Write(payloadBytes)
	signatureBytes := mac.Sum(nil)
	
	// Encode payload and signature to base64url format
	payloadEncoded := base64.RawURLEncoding.EncodeToString(payloadBytes)
	signatureEncoded := base64.RawURLEncoding.EncodeToString(signatureBytes)
	
	return fmt.Sprintf("%s.%s", payloadEncoded, signatureEncoded)
}

// VerifyDownloadToken decodes and cryptographically validates the token.
// Returns the systemName of the target file if valid, or an error if invalid/expired.
func VerifyDownloadToken(token string) (string, error) {
	InitSecretKey()

	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", fmt.Errorf("invalid token format")
	}

	payloadEncoded, signatureEncoded := parts[0], parts[1]

	// Decode signature
	signatureBytes, err := base64.RawURLEncoding.DecodeString(signatureEncoded)
	if err != nil {
		return "", fmt.Errorf("invalid signature encoding")
	}

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadEncoded)
	if err != nil {
		return "", fmt.Errorf("invalid payload encoding")
	}

	// Cryptographically verify signature using hmac.Equal to protect against timing attacks
	mac := hmac.New(sha256.New, secretKey)
	mac.Write(payloadBytes)
	expectedSignatureBytes := mac.Sum(nil)

	if !hmac.Equal(signatureBytes, expectedSignatureBytes) {
		return "", fmt.Errorf("invalid signature")
	}

	// Parse payload
	payload := string(payloadBytes)
	lastColonIdx := strings.LastIndex(payload, ":")
	if lastColonIdx == -1 {
		return "", fmt.Errorf("invalid payload format")
	}

	systemName := payload[:lastColonIdx]
	expiresAtStr := payload[lastColonIdx+1:]

	expiresAt, err := strconv.ParseInt(expiresAtStr, 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid expiration timestamp")
	}

	// Check if token has expired
	if time.Now().UnixMilli() > expiresAt {
		return "", fmt.Errorf("download link has expired")
	}

	return systemName, nil
}
