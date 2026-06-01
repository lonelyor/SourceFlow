package api

import "testing"

func TestNormalizeAppearanceCodeBlockSkin(t *testing.T) {
	if got := normalizeAppearanceCodeBlockSkin("mac"); "mac" != got {
		t.Fatalf("normalizeAppearanceCodeBlockSkin() = %q, want mac", got)
	}
	if got := normalizeAppearanceCodeBlockSkin("ITEM2"); "default" != got {
		t.Fatalf("normalizeAppearanceCodeBlockSkin() = %q, want default for invalid skin", got)
	}
	if got := normalizeAppearanceCodeBlockSkin("iTerm2"); "iterm2" != got {
		t.Fatalf("normalizeAppearanceCodeBlockSkin() = %q, want iterm2", got)
	}
	if got := normalizeAppearanceCodeBlockSkin(" minimal "); "minimal" != got {
		t.Fatalf("normalizeAppearanceCodeBlockSkin() = %q, want minimal", got)
	}
	if got := normalizeAppearanceCodeBlockSkin("bad"); defaultAppearanceCodeBlockSkin != got {
		t.Fatalf("normalizeAppearanceCodeBlockSkin() = %q, want %q", got, defaultAppearanceCodeBlockSkin)
	}
}

func TestNormalizeAppearanceFileTreeDensity(t *testing.T) {
	if got := normalizeAppearanceFileTreeDensity("compact"); "compact" != got {
		t.Fatalf("normalizeAppearanceFileTreeDensity() = %q, want compact", got)
	}
	if got := normalizeAppearanceFileTreeDensity(" Loose "); "loose" != got {
		t.Fatalf("normalizeAppearanceFileTreeDensity() = %q, want loose", got)
	}
	if got := normalizeAppearanceFileTreeDensity("bad"); "default" != got {
		t.Fatalf("normalizeAppearanceFileTreeDensity() = %q, want default", got)
	}
	if got := normalizeAppearanceFileTreeDensity(""); "default" != got {
		t.Fatalf("normalizeAppearanceFileTreeDensity() = %q, want default", got)
	}
}

func TestNormalizeAppearanceFileTreeFontSize(t *testing.T) {
	if got := normalizeAppearanceFileTreeFontSize(0); 0 != got {
		t.Fatalf("normalizeAppearanceFileTreeFontSize() = %d, want 0", got)
	}
	if got := normalizeAppearanceFileTreeFontSize(8); 10 != got {
		t.Fatalf("normalizeAppearanceFileTreeFontSize() = %d, want 10", got)
	}
	if got := normalizeAppearanceFileTreeFontSize(16); 16 != got {
		t.Fatalf("normalizeAppearanceFileTreeFontSize() = %d, want 16", got)
	}
	if got := normalizeAppearanceFileTreeFontSize(40); 20 != got {
		t.Fatalf("normalizeAppearanceFileTreeFontSize() = %d, want 20", got)
	}
}
