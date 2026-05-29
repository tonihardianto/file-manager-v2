package security

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// SessionClaims are values encoded in the stateless session token.
type SessionClaims struct {
	UserID    string
	Name      string
	Role      string
	ExpiresAt int64
}

// GenerateSessionToken signs user claims into an HMAC-protected, URL-safe token.
func GenerateSessionToken(userID, name, role string, validity time.Duration) string {
	InitSecretKey()

	expiresAt := time.Now().Add(validity).UnixMilli()
	payload := fmt.Sprintf("%s|%s|%s|%d", userID, name, role, expiresAt)
	payloadBytes := []byte(payload)

	mac := hmac.New(sha256.New, secretKey)
	mac.Write(payloadBytes)
	sig := mac.Sum(nil)

	return fmt.Sprintf(
		"%s.%s",
		base64.RawURLEncoding.EncodeToString(payloadBytes),
		base64.RawURLEncoding.EncodeToString(sig),
	)
}

// VerifySessionToken validates signature and expiry, then returns claims.
func VerifySessionToken(token string) (SessionClaims, error) {
	InitSecretKey()

	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return SessionClaims{}, fmt.Errorf("invalid token format")
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return SessionClaims{}, fmt.Errorf("invalid payload encoding")
	}
	signatureBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return SessionClaims{}, fmt.Errorf("invalid signature encoding")
	}

	mac := hmac.New(sha256.New, secretKey)
	mac.Write(payloadBytes)
	expected := mac.Sum(nil)
	if !hmac.Equal(signatureBytes, expected) {
		return SessionClaims{}, fmt.Errorf("invalid signature")
	}

	segments := strings.Split(string(payloadBytes), "|")
	if len(segments) != 4 {
		return SessionClaims{}, fmt.Errorf("invalid payload format")
	}

	expiresAt, err := strconv.ParseInt(segments[3], 10, 64)
	if err != nil {
		return SessionClaims{}, fmt.Errorf("invalid expiration")
	}
	if time.Now().UnixMilli() > expiresAt {
		return SessionClaims{}, fmt.Errorf("session expired")
	}

	return SessionClaims{
		UserID:    segments[0],
		Name:      segments[1],
		Role:      segments[2],
		ExpiresAt: expiresAt,
	}, nil
}
