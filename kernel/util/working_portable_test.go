package util

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetWorkspaceConfPathPortableUsesSystemAuxDir(t *testing.T) {
	oldHomeDir := HomeDir
	oldPortableDir := os.Getenv("SOURCEFLOW_PORTABLE_DIR")
	oldConfigDir := os.Getenv("SOURCEFLOW_CONFIG_DIR")
	defer func() {
		HomeDir = oldHomeDir
		if "" == oldPortableDir {
			os.Unsetenv("SOURCEFLOW_PORTABLE_DIR")
		} else {
			os.Setenv("SOURCEFLOW_PORTABLE_DIR", oldPortableDir)
		}
		if "" == oldConfigDir {
			os.Unsetenv("SOURCEFLOW_CONFIG_DIR")
		} else {
			os.Setenv("SOURCEFLOW_CONFIG_DIR", oldConfigDir)
		}
	}()

	HomeDir = filepath.Join(os.TempDir(), "sourceflow-home")
	portableRoot := filepath.Join(os.TempDir(), "sourceflow-portable")
	os.Setenv("SOURCEFLOW_PORTABLE_DIR", portableRoot)
	os.Setenv("SOURCEFLOW_CONFIG_DIR", "userdata")

	got := GetWorkspaceConfPath()
	want := filepath.Join(portableRoot, "userdata", "portable", "workspace.json")
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("GetWorkspaceConfPath() = %q, want %q", got, want)
	}
}

func TestGetWorkspaceConfPathNonPortableUsesUserConfDir(t *testing.T) {
	oldHomeDir := HomeDir
	oldPortableDir := os.Getenv("SOURCEFLOW_PORTABLE_DIR")
	oldConfigDir := os.Getenv("SOURCEFLOW_CONFIG_DIR")
	defer func() {
		HomeDir = oldHomeDir
		if "" == oldPortableDir {
			os.Unsetenv("SOURCEFLOW_PORTABLE_DIR")
		} else {
			os.Setenv("SOURCEFLOW_PORTABLE_DIR", oldPortableDir)
		}
		if "" == oldConfigDir {
			os.Unsetenv("SOURCEFLOW_CONFIG_DIR")
		} else {
			os.Setenv("SOURCEFLOW_CONFIG_DIR", oldConfigDir)
		}
	}()

	HomeDir = filepath.Join(os.TempDir(), "sourceflow-home")
	os.Unsetenv("SOURCEFLOW_PORTABLE_DIR")
	configDir := filepath.Join(os.TempDir(), "sourceflow-config")
	os.Setenv("SOURCEFLOW_CONFIG_DIR", configDir)

	got := GetWorkspaceConfPath()
	want := filepath.Join(configDir, "workspace.json")
	if filepath.Clean(got) != filepath.Clean(want) {
		t.Fatalf("GetWorkspaceConfPath() = %q, want %q", got, want)
	}
}

func TestInitWorkspaceDirPortableEnsuresUserConfDirWhenWorkspaceCacheExists(t *testing.T) {
	oldHomeDir := HomeDir
	oldWorkspaceDir := WorkspaceDir
	oldWorkspaceName := WorkspaceName
	oldConfDir := ConfDir
	oldDataDir := DataDir
	oldRepoDir := RepoDir
	oldHistoryDir := HistoryDir
	oldTempDir := TempDir
	oldLogPath := LogPath
	oldDBPath := DBPath
	oldHistoryDBPath := HistoryDBPath
	oldAssetContentDBPath := AssetContentDBPath
	oldBlockTreeDBPath := BlockTreeDBPath
	oldSnippetsPath := SnippetsPath
	oldShortcutsPath := ShortcutsPath
	oldPortableDir := os.Getenv("SOURCEFLOW_PORTABLE_DIR")
	oldConfigDir := os.Getenv("SOURCEFLOW_CONFIG_DIR")
	oldTMPDIR := os.Getenv("TMPDIR")
	oldTEMP := os.Getenv("TEMP")
	oldTMP := os.Getenv("TMP")
	defer func() {
		HomeDir = oldHomeDir
		WorkspaceDir = oldWorkspaceDir
		WorkspaceName = oldWorkspaceName
		ConfDir = oldConfDir
		DataDir = oldDataDir
		RepoDir = oldRepoDir
		HistoryDir = oldHistoryDir
		TempDir = oldTempDir
		LogPath = oldLogPath
		DBPath = oldDBPath
		HistoryDBPath = oldHistoryDBPath
		AssetContentDBPath = oldAssetContentDBPath
		BlockTreeDBPath = oldBlockTreeDBPath
		SnippetsPath = oldSnippetsPath
		ShortcutsPath = oldShortcutsPath
		if "" == oldPortableDir {
			os.Unsetenv("SOURCEFLOW_PORTABLE_DIR")
		} else {
			os.Setenv("SOURCEFLOW_PORTABLE_DIR", oldPortableDir)
		}
		if "" == oldConfigDir {
			os.Unsetenv("SOURCEFLOW_CONFIG_DIR")
		} else {
			os.Setenv("SOURCEFLOW_CONFIG_DIR", oldConfigDir)
		}
		if "" == oldTMPDIR {
			os.Unsetenv("TMPDIR")
		} else {
			os.Setenv("TMPDIR", oldTMPDIR)
		}
		if "" == oldTEMP {
			os.Unsetenv("TEMP")
		} else {
			os.Setenv("TEMP", oldTEMP)
		}
		if "" == oldTMP {
			os.Unsetenv("TMP")
		} else {
			os.Setenv("TMP", oldTMP)
		}
	}()

	HomeDir = filepath.Join(t.TempDir(), "home")
	portableRoot := filepath.Join(t.TempDir(), "portable")
	workspaceDir := filepath.Join(t.TempDir(), "workspace")
	if err := os.MkdirAll(workspaceDir, 0755); err != nil {
		t.Fatalf("create workspace dir failed: %v", err)
	}
	os.Setenv("SOURCEFLOW_PORTABLE_DIR", portableRoot)
	os.Unsetenv("SOURCEFLOW_CONFIG_DIR")

	workspaceConfPath := GetWorkspaceConfPath()
	if err := os.MkdirAll(filepath.Dir(workspaceConfPath), 0755); err != nil {
		t.Fatalf("create workspace conf dir failed: %v", err)
	}
	if err := os.WriteFile(workspaceConfPath, []byte(`["existing-workspace"]`), 0644); err != nil {
		t.Fatalf("write workspace conf failed: %v", err)
	}

	userConfDir := GetUserConfDir()
	if stat, err := os.Stat(userConfDir); err != nil {
		t.Fatalf("portable user conf dir should exist after writing workspace cache, got err=%v", err)
	} else if !stat.IsDir() {
		t.Fatalf("portable user conf path should be a directory: %s", userConfDir)
	}

	initWorkspaceDir(workspaceDir)

	if stat, err := os.Stat(userConfDir); err != nil {
		t.Fatalf("portable user conf dir was not created: %v", err)
	} else if !stat.IsDir() {
		t.Fatalf("portable user conf path is not a directory: %s", userConfDir)
	}
}
