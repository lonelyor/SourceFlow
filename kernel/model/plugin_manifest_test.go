package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	confpkg "github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestLoadPluginManifestNormalizesDefaults(t *testing.T) {
	pluginDir := t.TempDir()
	writePluginTestFile(t, filepath.Join(pluginDir, "index.js"), "module.exports = class {};\n")
	writePluginTestFile(t, filepath.Join(pluginDir, "index.css"), ".plugin-test {}\n")
	writePluginTestFile(t, filepath.Join(pluginDir, "plugin.json"), `{
  "name": "sourceflow-test",
  "displayName": {
    "default": "SourceFlow Test"
  },
  "version": "1.0.0",
  "minAppVersion": "0.1.0",
  "permissions": ["storage", "storage"],
  "frontends": ["desktop", "desktop"],
  "backends": ["all", "all"],
  "allowedRequireModules": ["electron", "electron"]
}`)

	oldConf := Conf
	Conf = NewAppConf()
	Conf.Lang = "en_US"
	Conf.Bazaar = confpkg.NewBazaar()
	defer func() {
		Conf = oldConf
	}()

	manifest, err := LoadPluginManifest(pluginDir)
	if err != nil {
		t.Fatalf("LoadPluginManifest() returned error: %v", err)
	}
	if manifest.ManifestVersion != 1 {
		t.Fatalf("ManifestVersion = %d, want 1", manifest.ManifestVersion)
	}
	if manifest.Entry != "index.js" {
		t.Fatalf("Entry = %q, want index.js", manifest.Entry)
	}
	if manifest.Style != "index.css" {
		t.Fatalf("Style = %q, want index.css", manifest.Style)
	}
	if len(manifest.Permissions) != 1 || manifest.Permissions[0] != "storage" {
		t.Fatalf("Permissions = %#v, want [storage]", manifest.Permissions)
	}
	if len(manifest.Frontends) != 1 || manifest.Frontends[0] != "desktop" {
		t.Fatalf("Frontends = %#v, want [desktop]", manifest.Frontends)
	}
	if len(manifest.Backends) != 1 || manifest.Backends[0] != "all" {
		t.Fatalf("Backends = %#v, want [all]", manifest.Backends)
	}
	if len(manifest.AllowedRequireModules) != 1 || manifest.AllowedRequireModules[0] != "electron" {
		t.Fatalf("AllowedRequireModules = %#v, want [electron]", manifest.AllowedRequireModules)
	}
}

func TestLoadPluginManifestRejectsInvalidPermission(t *testing.T) {
	pluginDir := t.TempDir()
	writePluginTestFile(t, filepath.Join(pluginDir, "index.js"), "module.exports = class {};\n")
	writePluginTestFile(t, filepath.Join(pluginDir, "index.css"), ".plugin-test {}\n")
	writePluginTestFile(t, filepath.Join(pluginDir, "plugin.json"), `{
  "manifestVersion": 1,
  "name": "sourceflow-test",
  "displayName": {
    "default": "SourceFlow Test"
  },
  "version": "1.0.0",
  "minAppVersion": "0.1.0",
  "permissions": ["ui.invalid"]
}`)

	oldConf := Conf
	Conf = NewAppConf()
	Conf.Lang = "en_US"
	Conf.Bazaar = confpkg.NewBazaar()
	defer func() {
		Conf = oldConf
	}()

	_, err := LoadPluginManifest(pluginDir)
	if err == nil {
		t.Fatal("LoadPluginManifest() returned nil error, want validation failure")
	}
	if !strings.Contains(err.Error(), "unsupported plugin permission") {
		t.Fatalf("LoadPluginManifest() error = %q, want unsupported permission", err)
	}
}

func writePluginTestFile(t *testing.T, filePath, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		t.Fatalf("create dir %s failed: %v", filepath.Dir(filePath), err)
	}
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		t.Fatalf("write file %s failed: %v", filePath, err)
	}
}

func withPluginTestEnv(t *testing.T) func() {
	t.Helper()
	oldConf := Conf
	oldLang := util.Lang
	oldDataDir := util.DataDir
	oldTempDir := util.TempDir

	rootDir := t.TempDir()
	util.DataDir = filepath.Join(rootDir, "data")
	util.TempDir = filepath.Join(rootDir, "temp")
	util.Lang = "en_US"
	if err := os.MkdirAll(util.DataDir, 0o755); err != nil {
		t.Fatalf("create data dir failed: %v", err)
	}
	if err := os.MkdirAll(util.TempDir, 0o755); err != nil {
		t.Fatalf("create temp dir failed: %v", err)
	}

	Conf = NewAppConf()
	Conf.Lang = "en_US"
	Conf.Bazaar = confpkg.NewBazaar()
	Conf.Bazaar.Trust = true
	Conf.Bazaar.PluginDisabled = false

	return func() {
		Conf = oldConf
		util.Lang = oldLang
		util.DataDir = oldDataDir
		util.TempDir = oldTempDir
	}
}
