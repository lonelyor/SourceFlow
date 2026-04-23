package bazaar

import "testing"

func TestVerifyArchiveIntegrity(t *testing.T) {
	data := []byte("sourceflow-bazaar-test")
	expected := calcArchiveSHA256Hex(data)
	if err := verifyArchiveIntegrity(data, expected); err != nil {
		t.Fatalf("expected integrity verification to pass, got %v", err)
	}
	if err := verifyArchiveIntegrity(data, ""); err != nil {
		t.Fatalf("expected empty integrity to be accepted, got %v", err)
	}
	if err := verifyArchiveIntegrity(data, "deadbeef"); err == nil {
		t.Fatal("expected integrity verification to fail for mismatched hash")
	}
}
