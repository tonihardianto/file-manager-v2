package security

import (
	"testing"
	"time"
)

func TestTokenGenerationAndVerification(t *testing.T) {
	systemName := "reports/2026/quarterly.pdf"
	validity := 5 * time.Second

	token := GenerateDownloadToken(systemName, validity)
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	// Verify token right away
	gotName, err := VerifyDownloadToken(token)
	if err != nil {
		t.Fatalf("expected verification to succeed, got error: %v", err)
	}

	if gotName != systemName {
		t.Errorf("expected systemName %q, got %q", systemName, gotName)
	}
}

func TestTokenExpiration(t *testing.T) {
	systemName := "reports/short_lived.pdf"
	// Create a token that expires instantly (1 millisecond)
	token := GenerateDownloadToken(systemName, 1*time.Millisecond)

	// Wait 10ms for expiration
	time.Sleep(10 * time.Millisecond)

	_, err := VerifyDownloadToken(token)
	if err == nil {
		t.Fatal("expected error due to expiration, but got nil")
	}

	if err.Error() != "download link has expired" {
		t.Errorf("expected expiration error message, got %q", err.Error())
	}
}

func TestTokenTampering(t *testing.T) {
	systemName := "sensitive_file.txt"
	token := GenerateDownloadToken(systemName, 10*time.Second)

	// Tamper with the token signature (e.g. change the last character)
	tamperedToken := token[:len(token)-1] + "A"
	if token == tamperedToken {
		tamperedToken = token + "A"
	}

	_, err := VerifyDownloadToken(tamperedToken)
	if err == nil {
		t.Fatal("expected validation error for tampered token, but got nil")
	}
}
