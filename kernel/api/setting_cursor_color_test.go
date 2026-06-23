package api

import "testing"

func TestNormalizeEditorCursorColorSupportsAllPresetColors(t *testing.T) {
	cases := []string{
		"#ffffff",
		"#ff9f1a",
		"#ff6b6b",
		"#ffd166",
		"#b8ff1f",
		"#42d392",
		"#ff8fb8",
		"#225cff",
		"#4fc3ff",
		"#00c2ff",
		"#a46bff",
	}
	for _, current := range cases {
		if got := normalizeEditorCursorColor(current); got != current {
			t.Fatalf("normalizeEditorCursorColor(%q) = %q", current, got)
		}
	}
}
