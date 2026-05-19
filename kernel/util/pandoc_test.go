// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package util

import (
	"archive/zip"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBuiltInPandocInstallDirCandidatesUseStablePortableRoot(t *testing.T) {
	oldWorkingDir := WorkingDir
	oldHomeDir := HomeDir
	oldTempDir := TempDir
	defer func() {
		WorkingDir = oldWorkingDir
		HomeDir = oldHomeDir
		TempDir = oldTempDir
	}()

	root := t.TempDir()
	portableRoot := filepath.Join(root, "portable")
	WorkingDir = filepath.Join(root, "app")
	HomeDir = filepath.Join(root, "home")
	TempDir = filepath.Join(root, "workspace", "temp")
	t.Setenv(PortableDirEnv, portableRoot)
	t.Setenv(ConfigDirEnv, "")

	dirs := builtInPandocInstallDirCandidates()
	if 0 == len(dirs) {
		t.Fatalf("expected built-in pandoc install dir candidates")
	}

	wantPrefix := filepath.Join(portableRoot, "pandoc-runtime", "pandoc", "v"+Ver, runtime.GOOS+"-"+runtime.GOARCH)
	if dirs[0] != wantPrefix {
		t.Fatalf("first install dir = %q, want portable stable dir %q", dirs[0], wantPrefix)
	}
	for _, dir := range dirs {
		if dir == TempDir || strings.HasPrefix(dir, TempDir+string(filepath.Separator)) {
			t.Fatalf("pandoc install dir should not use temp: %q", dir)
		}
	}
}

func TestIsLegacyTempPandocBinPath(t *testing.T) {
	oldTempDir := TempDir
	defer func() {
		TempDir = oldTempDir
	}()

	TempDir = filepath.Join(t.TempDir(), "workspace", "temp")
	legacyBinPath := filepath.Join(TempDir, "pandoc", "bin", "pandoc")
	if runtime.GOOS == "windows" {
		legacyBinPath += ".exe"
	}
	if !isLegacyTempPandocBinPath(legacyBinPath) {
		t.Fatalf("expected legacy temp pandoc path to be detected")
	}

	stableBinPath := filepath.Join(filepath.Dir(TempDir), "pandoc-runtime", "bin", filepath.Base(legacyBinPath))
	if isLegacyTempPandocBinPath(stableBinPath) {
		t.Fatalf("stable pandoc path should not be treated as legacy temp")
	}
}

func TestInstallBuiltInPandocFromZip(t *testing.T) {
	root := t.TempDir()
	sourceDir := filepath.Join(root, "source")
	sourceBinDir := filepath.Join(sourceDir, "bin")
	if err := os.MkdirAll(sourceBinDir, 0755); err != nil {
		t.Fatal(err)
	}

	pandocName := "pandoc"
	if runtime.GOOS == "windows" {
		pandocName += ".exe"
	}
	mainPath := filepath.Join(root, "main.go")
	if err := os.WriteFile(mainPath, []byte(`package main

import "fmt"

func main() {
	fmt.Println("pandoc 9.9.9")
}
`), 0644); err != nil {
		t.Fatal(err)
	}
	sourceBinPath := filepath.Join(sourceBinDir, pandocName)
	cmd := exec.Command("go", "build", "-o", sourceBinPath, mainPath)
	if output, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("build fake pandoc failed: %s\n%s", err, output)
	}

	zipPath := filepath.Join(root, "pandoc.zip")
	if err := zipDirectory(sourceDir, zipPath); err != nil {
		t.Fatal(err)
	}

	installDir := filepath.Join(root, "stable", "pandoc-runtime", "pandoc", "v"+Ver, runtime.GOOS+"-"+runtime.GOARCH)
	if err := installBuiltInPandoc(zipPath, installDir); err != nil {
		t.Fatalf("install built-in pandoc failed: %s", err)
	}
	if got := getPandocVer(builtInPandocBinPath(installDir)); got != "9.9.9" {
		t.Fatalf("installed pandoc version = %q, want 9.9.9", got)
	}
}

func TestParsePandocUpdateManifestValueSelectsPlatform(t *testing.T) {
	raw := map[string]interface{}{
		"windows-amd64": map[string]interface{}{
			"version": "3.1.12",
			"url":     "https://example.com/pandoc-windows-amd64.zip",
			"urls": []interface{}{
				"https://mirror.example.com/pandoc-windows-amd64.zip",
				"https://example.com/pandoc-windows-amd64.zip",
			},
			"sha256": "ABCDEF",
		},
		"linux-amd64": map[string]interface{}{
			"version": "3.1.11",
			"url":     "https://example.com/pandoc-linux-amd64.zip",
			"sha256":  "123456",
		},
	}

	manifest := parsePandocUpdateManifestValue(raw, "windows-amd64")
	if nil == manifest {
		t.Fatalf("expected manifest")
	}
	if manifest.Version != "3.1.12" {
		t.Fatalf("version = %q, want 3.1.12", manifest.Version)
	}
	if manifest.SHA256 != "abcdef" {
		t.Fatalf("sha256 = %q, want abcdef", manifest.SHA256)
	}
	if len(manifest.URLs) != 2 {
		t.Fatalf("urls = %#v, want deduplicated two urls", manifest.URLs)
	}
	if manifest.URLs[0] != "https://mirror.example.com/pandoc-windows-amd64.zip" {
		t.Fatalf("url was unexpectedly normalized: %#v", manifest.URLs)
	}
}

func TestComparePandocVersion(t *testing.T) {
	if !isPandocUpdateNewer("3.1.12", "pandoc 3.1.11") {
		t.Fatalf("expected 3.1.12 to be newer than 3.1.11")
	}
	if isPandocUpdateNewer("3.1.12", "3.1.12") {
		t.Fatalf("same version should not be newer")
	}
	if normalizePandocVersion("pandoc 3.1.12\n") != "3.1.12" {
		t.Fatalf("pandoc version was not normalized")
	}
}

func zipDirectory(sourceDir, zipPath string) error {
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return err
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	return filepath.Walk(sourceDir, func(path string, info os.FileInfo, walkErr error) error {
		if nil != walkErr {
			return walkErr
		}
		if info.IsDir() {
			return nil
		}

		relPath, err := filepath.Rel(sourceDir, path)
		if err != nil {
			return err
		}
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(relPath)
		header.Method = zip.Deflate
		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})
}
