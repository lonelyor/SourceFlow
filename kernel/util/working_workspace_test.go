package util

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func snapshotWorkingGlobals(t *testing.T) func() {
	t.Helper()
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
	oldContainer := Container
	return func() {
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
		Container = oldContainer
	}
}

func setupWorkspaceConfTest(t *testing.T) string {
	t.Helper()
	t.Cleanup(snapshotWorkingGlobals(t))
	root := t.TempDir()
	HomeDir = filepath.Join(root, "home")
	Container = ContainerStd
	t.Setenv(PortableDirEnv, "")
	t.Setenv(ConfigDirEnv, filepath.Join(root, "config"))
	t.Setenv(DefaultWorkspaceEnv, "")
	t.Setenv("TMPDIR", os.Getenv("TMPDIR"))
	t.Setenv("TEMP", os.Getenv("TEMP"))
	t.Setenv("TMP", os.Getenv("TMP"))
	return root
}

func writeWorkspaceConfForTest(t *testing.T, value any) {
	t.Helper()
	workspaceConf := GetWorkspaceConfPath()
	if err := os.MkdirAll(filepath.Dir(workspaceConf), 0755); err != nil {
		t.Fatalf("create workspace conf dir failed: %v", err)
	}
	data, err := json.MarshalIndent(value, "", "\t")
	if err != nil {
		t.Fatalf("marshal workspace conf failed: %v", err)
	}
	if err = os.WriteFile(workspaceConf, data, 0644); err != nil {
		t.Fatalf("write workspace conf failed: %v", err)
	}
}

func mustCreateWorkspaceDirs(t *testing.T, paths ...string) {
	t.Helper()
	for _, path := range paths {
		if err := os.MkdirAll(path, 0755); err != nil {
			t.Fatalf("create workspace dir %q failed: %v", path, err)
		}
	}
}

func TestReadWorkspacePathsAcceptsElectronObjectFormat(t *testing.T) {
	root := setupWorkspaceConfTest(t)
	previous := filepath.Join(root, "previous")
	current := filepath.Join(root, "current")
	missing := filepath.Join(root, "missing")
	mustCreateWorkspaceDirs(t, previous, current)
	writeWorkspaceConfForTest(t, map[string]any{
		"workspace": current,
		"workspaces": []any{
			current,
			missing,
			previous,
			"",
			42,
		},
	})

	got, err := ReadWorkspacePaths()
	if err != nil {
		t.Fatalf("ReadWorkspacePaths returned error: %v", err)
	}
	want := []string{previous, current}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ReadWorkspacePaths() = %#v, want %#v", got, want)
	}
}

func TestWriteWorkspacePathsKeepsElectronObjectFormat(t *testing.T) {
	root := setupWorkspaceConfTest(t)
	previous := filepath.Join(root, "previous")
	current := filepath.Join(root, "current")
	mustCreateWorkspaceDirs(t, previous, current)

	if err := WriteWorkspacePaths([]string{previous, current}); err != nil {
		t.Fatalf("WriteWorkspacePaths returned error: %v", err)
	}

	var state workspaceState
	data, err := os.ReadFile(GetWorkspaceConfPath())
	if err != nil {
		t.Fatalf("read workspace conf failed: %v", err)
	}
	if err = json.Unmarshal(data, &state); err != nil {
		t.Fatalf("workspace conf should be an object compatible with Electron: %v", err)
	}
	if state.Workspace != current {
		t.Fatalf("state.Workspace = %q, want %q", state.Workspace, current)
	}
	wantRecent := []string{current, previous}
	if !reflect.DeepEqual(state.Workspaces, wantRecent) {
		t.Fatalf("state.Workspaces = %#v, want %#v", state.Workspaces, wantRecent)
	}

	got, err := ReadWorkspacePaths()
	if err != nil {
		t.Fatalf("ReadWorkspacePaths returned error after write: %v", err)
	}
	wantRead := []string{previous, current}
	if !reflect.DeepEqual(got, wantRead) {
		t.Fatalf("ReadWorkspacePaths() = %#v, want %#v", got, wantRead)
	}
}

func TestInitWorkspaceDirUsesCurrentWorkspaceFromElectronObject(t *testing.T) {
	root := setupWorkspaceConfTest(t)
	previous := filepath.Join(root, "previous")
	current := filepath.Join(root, "current")
	mustCreateWorkspaceDirs(t, previous, current)
	writeWorkspaceConfForTest(t, map[string]any{
		"workspace":  current,
		"workspaces": []string{current, previous},
	})

	initWorkspaceDir("")

	if WorkspaceDir != current {
		t.Fatalf("WorkspaceDir = %q, want current workspace %q", WorkspaceDir, current)
	}
	got, err := ReadWorkspacePaths()
	if err != nil {
		t.Fatalf("ReadWorkspacePaths returned error after init: %v", err)
	}
	want := []string{previous, current}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ReadWorkspacePaths() = %#v, want %#v", got, want)
	}
}

func TestInitWorkspaceDirNormalizesLegacyArrayWorkspaceConf(t *testing.T) {
	root := setupWorkspaceConfTest(t)
	previous := filepath.Join(root, "previous")
	current := filepath.Join(root, "current")
	mustCreateWorkspaceDirs(t, previous, current)
	writeWorkspaceConfForTest(t, []string{previous, current})

	initWorkspaceDir("")

	var state workspaceState
	data, err := os.ReadFile(GetWorkspaceConfPath())
	if err != nil {
		t.Fatalf("read workspace conf failed: %v", err)
	}
	if err = json.Unmarshal(data, &state); err != nil {
		t.Fatalf("legacy workspace conf should be normalized to SourceFlow object format: %v", err)
	}
	if state.Workspace != current {
		t.Fatalf("state.Workspace = %q, want %q", state.Workspace, current)
	}
	wantRecent := []string{current, previous}
	if !reflect.DeepEqual(state.Workspaces, wantRecent) {
		t.Fatalf("state.Workspaces = %#v, want %#v", state.Workspaces, wantRecent)
	}
}

func TestInitWorkspaceDirRecoversWhenTempPathIsAFile(t *testing.T) {
	root := setupWorkspaceConfTest(t)
	current := filepath.Join(root, "current")
	mustCreateWorkspaceDirs(t, current)
	if err := os.WriteFile(filepath.Join(current, "temp"), []byte("stale temp placeholder"), 0644); err != nil {
		t.Fatalf("write temp placeholder failed: %v", err)
	}
	writeWorkspaceConfForTest(t, map[string]any{
		"workspace":  current,
		"workspaces": []string{current},
	})

	initWorkspaceDir("")

	if WorkspaceDir != current {
		t.Fatalf("WorkspaceDir = %q, want %q", WorkspaceDir, current)
	}
	if info, err := os.Stat(TempDir); err != nil || !info.IsDir() {
		t.Fatalf("TempDir should be recovered as a directory, info=%v err=%v", info, err)
	}
	osTmpDir := filepath.Join(TempDir, "os")
	if info, err := os.Stat(osTmpDir); err != nil || !info.IsDir() {
		t.Fatalf("os temp dir should be created, info=%v err=%v", info, err)
	}
	matches, err := filepath.Glob(filepath.Join(current, "temp.invalid-*"))
	if err != nil {
		t.Fatalf("glob quarantined temp path failed: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("quarantined temp file count = %d, want 1 (%#v)", len(matches), matches)
	}
}
