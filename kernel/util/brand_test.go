package util

import "testing"

func TestFTSTokenizerName(t *testing.T) {
	if got := FTSTokenizerName(); "sourceflow" != got {
		t.Fatalf("FTSTokenizerName() = %q, want sourceflow", got)
	}
	if got := FTSTokenizerCaseInsensitive(); "sourceflow case_insensitive" != got {
		t.Fatalf("FTSTokenizerCaseInsensitive() = %q, want sourceflow case_insensitive", got)
	}
}
