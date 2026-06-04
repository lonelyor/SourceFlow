package api

import "testing"

func TestShouldSuggestRebuildIndexForExitSync(t *testing.T) {
	tests := []struct {
		name   string
		detail string
		want   bool
	}{
		{
			name:   "tree missing",
			detail: "同步失败：tree not found (Provider: S3)",
			want:   true,
		},
		{
			name:   "block tree missing",
			detail: "sync failed: block tree not found [id=20260604120000-abcdefg]",
			want:   true,
		},
		{
			name:   "network failure",
			detail: "sync failed: connection timeout",
			want:   false,
		},
		{
			name:   "notebook missing",
			detail: "sync failed: notebook not found",
			want:   false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := shouldSuggestRebuildIndexForExitSync(test.detail)
			if got != test.want {
				t.Fatalf("shouldSuggestRebuildIndexForExitSync(%q) = %v, want %v", test.detail, got, test.want)
			}
		})
	}
}
