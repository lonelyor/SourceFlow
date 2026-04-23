package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestSerializePortableLocalEndpointInsidePortableRoot(t *testing.T) {
	portableRoot := t.TempDir()
	t.Setenv("SOURCEFLOW_PORTABLE_DIR", portableRoot)

	endpoint := filepath.Join(portableRoot, "backup", "snapshots")
	got := serializePortableLocalEndpoint(endpoint)
	want := filepath.ToSlash(filepath.Join("backup", "snapshots"))
	if got != want {
		t.Fatalf("serializePortableLocalEndpoint() = %q, want %q", got, want)
	}
}

func TestSerializePortableLocalEndpointOutsidePortableRoot(t *testing.T) {
	portableRoot := t.TempDir()
	externalRoot := t.TempDir()
	t.Setenv("SOURCEFLOW_PORTABLE_DIR", portableRoot)

	endpoint := filepath.Join(externalRoot, "backup", "snapshots")
	got := serializePortableLocalEndpoint(endpoint)
	want := filepath.Clean(endpoint)
	if got != want {
		t.Fatalf("serializePortableLocalEndpoint() = %q, want %q", got, want)
	}
}

func TestPrepareSyncProviderLocalAllowsOutsidePortableRoot(t *testing.T) {
	portableRoot := t.TempDir()
	externalRoot := t.TempDir()
	workspaceDir := filepath.Join(portableRoot, "workspace")
	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		t.Fatalf("create workspace dir failed: %v", err)
	}
	t.Setenv("SOURCEFLOW_PORTABLE_DIR", portableRoot)

	oldConf := Conf
	oldLang := util.Lang
	oldLangs := util.Langs
	oldWorkspaceDir := util.WorkspaceDir
	defer func() {
		Conf = oldConf
		util.Lang = oldLang
		util.Langs = oldLangs
		util.WorkspaceDir = oldWorkspaceDir
	}()

	Conf = NewAppConf()
	Conf.Lang = "en_US"
	util.Lang = "en_US"
	util.Langs = map[string]map[int]string{
		"en_US": {
			77: "invalid local backup dir: %s",
		},
	}
	util.WorkspaceDir = workspaceDir

	endpoint := filepath.Join(externalRoot, "backup", "snapshots")
	if err := os.MkdirAll(endpoint, 0o755); err != nil {
		t.Fatalf("create backup dir failed: %v", err)
	}
	local := &conf.Local{
		Endpoint:       endpoint,
		Timeout:        60,
		ConcurrentReqs: 16,
	}

	if err := prepareSyncProviderLocal(local, true); err != nil {
		t.Fatalf("prepareSyncProviderLocal() returned error: %v", err)
	}
	if local.Endpoint != filepath.Clean(endpoint) {
		t.Fatalf("prepareSyncProviderLocal() endpoint = %q, want %q", local.Endpoint, filepath.Clean(endpoint))
	}
}
