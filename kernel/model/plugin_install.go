package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/bazaar"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func prepareLocalPluginPackage(zipPath string) (tmpRoot, srcPath string, manifest *PluginManifest, err error) {
	tmpRoot = filepath.Join(util.TempDir, "plugins", gulu.Rand.String(7))
	if err = os.RemoveAll(tmpRoot); err != nil {
		return "", "", nil, err
	}
	if err = os.MkdirAll(tmpRoot, 0755); err != nil {
		return "", "", nil, err
	}

	unzipPath := filepath.Join(tmpRoot, "unzipped")
	if err = gulu.Zip.Unzip(zipPath, unzipPath); err != nil {
		return "", "", nil, fmt.Errorf("unzip plugin package failed: %w", err)
	}

	srcPath = unzipPath
	dirs, err := os.ReadDir(unzipPath)
	if err != nil {
		return "", "", nil, err
	}
	if 1 == len(dirs) && dirs[0].IsDir() {
		srcPath = filepath.Join(unzipPath, dirs[0].Name())
	}

	manifest, err = LoadPluginManifest(srcPath)
	if err != nil {
		return "", "", nil, err
	}
	return tmpRoot, srcPath, manifest, nil
}

func InstallLocalPluginPackage(zipPath string, overwrite bool) (*PluginManifest, error) {
	tmpRoot, srcPath, manifest, err := prepareLocalPluginPackage(zipPath)
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(tmpRoot)

	targetPath := filepath.Join(util.DataDir, "plugins", manifest.Name)
	if !overwrite && filelock.IsExist(targetPath) {
		return nil, errors.New("plugin already exists, please uninstall it first or allow overwrite")
	}

	if err = os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return nil, err
	}
	if overwrite {
		if err = os.RemoveAll(targetPath); err != nil {
			return nil, err
		}
	}
	if err = filelock.Copy(srcPath, targetPath); err != nil {
		return nil, err
	}
	if err = os.Chtimes(targetPath, time.Now(), time.Now()); err != nil {
		// ignore mtime failure
	}
	return manifest, nil
}

func InspectLocalPluginPackage(zipPath string) (*PluginManifest, string, error) {
	tmpRoot, _, manifest, err := prepareLocalPluginPackage(zipPath)
	if err != nil {
		return nil, "", err
	}
	defer os.RemoveAll(tmpRoot)
	checksum, err := calcFileSHA256(zipPath)
	if err != nil {
		return nil, "", err
	}
	return manifest, checksum, nil
}

func InstallLocalPluginPackageFromTemp(uploadPath string) (*PluginManifest, error) {
	manifest, err := InstallLocalPluginPackage(uploadPath, true)
	if err != nil {
		return nil, err
	}
	if checksum, checksumErr := calcFileSHA256(uploadPath); checksumErr == nil {
		bazaar.SetPackageInstallRecord("plugins", manifest.Name, time.Now(), "local-zip", "", checksum)
	}
	normalizePluginPostInstall(manifest)
	return manifest, nil
}

func normalizePluginPostInstall(manifest *PluginManifest) {
	if nil == manifest {
		return
	}
	petals := getPetals()
	petal := getPetalByName(manifest.Name, petals)
	if nil == petal {
		petal = &Petal{
			Name:    manifest.Name,
			Enabled: false,
		}
		petals = append(petals, petal)
	}
	petal.DisplayName = getPreferredLocaleString(manifest.DisplayName, manifest.Name)
	petal.Manifest = manifest
	petal.DisabledReason = ""
	savePetals(petals)
}

func ValidateLocalPluginFolder(folderPath string) (*PluginManifest, error) {
	folderPath = strings.TrimSpace(folderPath)
	if "" == folderPath {
		return nil, errors.New("plugin folder path is empty")
	}
	return LoadPluginManifest(folderPath)
}

func calcFileSHA256(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err = io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
