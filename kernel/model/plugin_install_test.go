package model

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func TestExamplePluginPackageCanBeInstalledAndLoaded(t *testing.T) {
	restoreEnv := withPluginTestEnv(t)
	defer restoreEnv()

	exampleDir := filepath.Clean(filepath.Join("..", "..", "examples", "plugins", "sourceflow-hello"))
	if stat, err := os.Stat(exampleDir); err != nil || !stat.IsDir() {
		t.Fatalf("example plugin dir missing: %s (%v)", exampleDir, err)
	}

	zipPath := filepath.Join(t.TempDir(), "sourceflow-hello.zip")
	if err := zipFolder(exampleDir, zipPath); err != nil {
		t.Fatalf("zipFolder() failed: %v", err)
	}

	inspectedManifest, checksum, err := InspectLocalPluginPackage(zipPath)
	if err != nil {
		t.Fatalf("InspectLocalPluginPackage() returned error: %v", err)
	}
	if inspectedManifest.Name != "sourceflow-hello" {
		t.Fatalf("inspected manifest.Name = %q, want sourceflow-hello", inspectedManifest.Name)
	}
	if checksum == "" {
		t.Fatal("expected plugin zip checksum to be populated")
	}

	manifest, err := InstallLocalPluginPackageFromTemp(zipPath)
	if err != nil {
		t.Fatalf("InstallLocalPluginPackageFromTemp() returned error: %v", err)
	}
	if manifest.Name != "sourceflow-hello" {
		t.Fatalf("manifest.Name = %q, want sourceflow-hello", manifest.Name)
	}

	statePath := filepath.Join(util.DataDir, "storage", "plugins", "plugins.json")
	stateData, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("read plugins state failed: %v", err)
	}
	if !strings.Contains(string(stateData), `"sourceflow-hello"`) {
		t.Fatalf("plugins state does not contain sourceflow-hello: %s", string(stateData))
	}

	petal, err := SetPluginEnabled("sourceflow-hello", true, "desktop")
	if err != nil {
		t.Fatalf("SetPluginEnabled() returned error: %v", err)
	}
	if petal.Manifest == nil || petal.Manifest.Name != "sourceflow-hello" {
		t.Fatalf("SetPluginEnabled() manifest = %#v, want sourceflow-hello", petal.Manifest)
	}

	loaded := LoadPlugins("desktop", false)
	if len(loaded) != 1 {
		t.Fatalf("LoadPlugins() len = %d, want 1", len(loaded))
	}
	if loaded[0].Manifest == nil || loaded[0].Manifest.Name != "sourceflow-hello" {
		t.Fatalf("LoadPlugins()[0].Manifest = %#v, want sourceflow-hello", loaded[0].Manifest)
	}
	if !strings.Contains(loaded[0].JS, "SourceFlowHelloPlugin") {
		t.Fatalf("loaded JS does not look like example plugin")
	}
	if !strings.Contains(loaded[0].CSS, "sourceflow-hello-status") {
		t.Fatalf("loaded CSS does not look like example plugin")
	}
}

func TestPluginPermissionChangeAutoDisablesEnabledPlugin(t *testing.T) {
	restoreEnv := withPluginTestEnv(t)
	defer restoreEnv()

	exampleDir := filepath.Clean(filepath.Join("..", "..", "examples", "plugins", "sourceflow-hello"))
	zipPath := filepath.Join(t.TempDir(), "sourceflow-hello.zip")
	if err := zipFolder(exampleDir, zipPath); err != nil {
		t.Fatalf("zipFolder() failed: %v", err)
	}

	manifest, err := InstallLocalPluginPackageFromTemp(zipPath)
	if err != nil {
		t.Fatalf("InstallLocalPluginPackageFromTemp() returned error: %v", err)
	}
	if _, err = SetPluginEnabled(manifest.Name, true, "desktop"); err != nil {
		t.Fatalf("SetPluginEnabled() returned error: %v", err)
	}

	pluginJSONPath := filepath.Join(util.DataDir, "plugins", manifest.Name, "plugin.json")
	data, err := os.ReadFile(pluginJSONPath)
	if err != nil {
		t.Fatalf("read plugin.json failed: %v", err)
	}
	updated := strings.Replace(string(data), `"ui.setting"`, `"ui.setting", "network.http"`, 1)
	if err = os.WriteFile(pluginJSONPath, []byte(updated), 0o644); err != nil {
		t.Fatalf("write plugin.json failed: %v", err)
	}

	loaded := LoadPlugins("desktop", false)
	if len(loaded) != 0 {
		t.Fatalf("LoadPlugins() len = %d, want 0 after permission change", len(loaded))
	}

	petals := getPetals()
	petal := getPetalByName(manifest.Name, petals)
	if nil == petal {
		t.Fatalf("expected installed plugin state to exist")
	}
	if petal.Enabled {
		t.Fatalf("expected plugin to be auto disabled after permission change")
	}
	if petal.PermissionDigest != "" {
		t.Fatalf("expected permission digest to be cleared after forced disable, got %q", petal.PermissionDigest)
	}
}

func zipFolder(sourceDir, zipPath string) error {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	writer := zip.NewWriter(zipFile)
	defer writer.Close()

	parentDir := filepath.Dir(sourceDir)
	return filepath.Walk(sourceDir, func(currentPath string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if currentPath == sourceDir {
			return nil
		}
		relativePath, err := filepath.Rel(parentDir, currentPath)
		if err != nil {
			return err
		}
		relativePath = filepath.ToSlash(relativePath)
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = relativePath
		if info.IsDir() {
			header.Name += "/"
			_, err = writer.CreateHeader(header)
			return err
		}
		header.Method = zip.Deflate
		entryWriter, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}
		file, err := os.Open(currentPath)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(entryWriter, file)
		return err
	})
}
