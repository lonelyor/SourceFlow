package util

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestResolvePathUnderRejectsTraversal(t *testing.T) {
	root := t.TempDir()
	if _, err := ResolvePathUnder(root, "/../outside.sf"); err == nil {
		t.Fatal("ResolvePathUnder must reject parent traversal")
	}
	if _, err := ResolvePathUnder(root, `..\outside.sf`); err == nil {
		t.Fatal("ResolvePathUnder must reject backslash parent traversal")
	}
	if _, err := ResolvePathUnder(root, `C:\outside.sf`); err == nil {
		t.Fatal("ResolvePathUnder must reject drive-qualified paths")
	}
}

func TestResolvePathUnderAllowsRootRelativeSlashPath(t *testing.T) {
	root := t.TempDir()
	got, err := ResolvePathUnder(root, "/20260601120000-abcdefg.sf")
	if err != nil {
		t.Fatalf("ResolvePathUnder returned error: %s", err)
	}
	want := filepath.Join(root, "20260601120000-abcdefg.sf")
	if got != want {
		t.Fatalf("resolved path = %q, want %q", got, want)
	}
}

// TestIsSensitivePathKeepsSystemCritical 断言系统核心目录仍被判定为敏感。
func TestIsSensitivePathKeepsSystemCritical(t *testing.T) {
	critical := []string{
		"/etc/passwd",
		"/proc/self/status",
		"/sys/kernel",
		"/root/.bashrc",
		"/bin/sh",
		"/sbin/init",
		"/boot/vmlinuz",
		"/dev/null",
	}
	for _, p := range critical {
		if !IsSensitivePath(p) {
			t.Fatalf("IsSensitivePath(%q) = false, want true", p)
		}
	}
}

// TestIsSensitivePathAllowsDesktopImportSources 断言桌面端合法导入来源不再被误判。
// 这些是 macOS/Linux 上用户经文件对话框常选的路径，之前因前缀一刀切被拒绝。
func TestIsSensitivePathAllowsDesktopImportSources(t *testing.T) {
	legit := []string{
		"/tmp/import-note.md",
		"/var/folders/xx/T/note.md", // macOS $TMPDIR
		"/usr/local/notes/readme.md",
		"/opt/homebrew/notes/readme.md",
		"/Users/test/Documents/notes/readme.md",
		"/home/test/notes/readme.md",
	}
	for _, p := range legit {
		if IsSensitivePath(p) {
			t.Fatalf("IsSensitivePath(%q) = true, want false", p)
		}
	}
}

// TestCheckReadableAllowsReadableFile 验证可读文件/目录正常通过。
func TestCheckReadableAllowsReadableFile(t *testing.T) {
	dir := t.TempDir()
	if err := CheckReadable(dir, 2*time.Second); err != nil {
		t.Fatalf("CheckReadable(dir) = %s, want nil", err)
	}
	f := filepath.Join(dir, "note.md")
	if err := os.WriteFile(f, []byte("# hi"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := CheckReadable(f, 2*time.Second); err != nil {
		t.Fatalf("CheckReadable(file) = %s, want nil", err)
	}
}

// TestCheckReadableFailsOnMissing 验证不存在的路径返回错误。
func TestCheckReadableFailsOnMissing(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "nope.md")
	if err := CheckReadable(missing, 2*time.Second); err == nil {
		t.Fatal("CheckReadable(missing) = nil, want error")
	}
}
