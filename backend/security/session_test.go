package security

import (
	"testing"
	"time"
)

func TestSessionTokenGenerationAndVerification(t *testing.T) {
	token := GenerateSessionToken("1", "admin", "admin", 5*time.Second)
	if token == "" {
		t.Fatal("expected non-empty session token")
	}

	claims, err := VerifySessionToken(token)
	if err != nil {
		t.Fatalf("expected valid token, got error: %v", err)
	}
	if claims.UserID != "1" || claims.Name != "admin" || claims.Role != "admin" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestSessionTokenExpiration(t *testing.T) {
	token := GenerateSessionToken("1", "admin", "admin", 1*time.Millisecond)
	time.Sleep(10 * time.Millisecond)

	_, err := VerifySessionToken(token)
	if err == nil {
		t.Fatal("expected expired session token error")
	}
}

func TestSessionTokenTampering(t *testing.T) {
	token := GenerateSessionToken("1", "admin", "admin", 5*time.Second)
	tampered := token[:len(token)-1] + "x"

	_, err := VerifySessionToken(tampered)
	if err == nil {
		t.Fatal("expected invalid signature error")
	}
}
