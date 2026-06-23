package model

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

var (
	validPluginNamePattern    = regexp.MustCompile(`^[a-z0-9][a-z0-9-_]{1,63}$`)
	validPluginVersionPattern = regexp.MustCompile(`^\d+\.\d+\.\d+([\-+][0-9A-Za-z.\-]+)?$`)
	validPluginPermissions    = map[string]bool{
		"storage":         true,
		"ui.topbar":       true,
		"ui.statusbar":    true,
		"ui.command":      true,
		"ui.dock":         true,
		"ui.setting":      true,
		"ui.tab":          true,
		"ui.dialog":       true,
		"ui.float":        true,
		"ui.notification": true,
		"workspace.read":  true,
		"workspace.write": true,
		"network.http":    true,
		"host.control":    true,
	}
	validPluginFrontends = map[string]bool{
		"desktop":        true,
		"desktop-window": true,
		"mobile":         true,
		"browser":        true,
		"all":            true,
	}
	validPluginBackends = map[string]bool{
		"windows": true,
		"linux":   true,
		"darwin":  true,
		"android": true,
		"ios":     true,
		"docker":  true,
		"all":     true,
	}
)

type PluginManifest struct {
	ManifestVersion       int               `json:"manifestVersion"`
	Name                  string            `json:"name"`
	DisplayName           map[string]string `json:"displayName"`
	Description           map[string]string `json:"description"`
	Version               string            `json:"version"`
	MinAppVersion         string            `json:"minAppVersion"`
	Author                string            `json:"author"`
	URL                   string            `json:"url"`
	Frontends             []string          `json:"frontends"`
	Backends              []string          `json:"backends"`
	Entry                 string            `json:"entry"`
	Style                 string            `json:"style"`
	Readme                map[string]string `json:"readme"`
	Permissions           []string          `json:"permissions"`
	AllowedRequireModules []string          `json:"allowedRequireModules"`
}

func LoadPluginManifest(pluginDir string) (*PluginManifest, error) {
	manifestPath := filepath.Join(pluginDir, "plugin.json")
	data, err := filelock.ReadFile(manifestPath)
	if err != nil {
		return nil, err
	}
	ret := &PluginManifest{}
	if err = gulu.JSON.UnmarshalJSON(data, ret); err != nil {
		return nil, err
	}
	normalizePluginManifest(ret)
	if err = ValidatePluginManifest(ret, pluginDir); err != nil {
		return nil, err
	}
	return ret, nil
}

func normalizePluginManifest(manifest *PluginManifest) {
	if manifest.ManifestVersion <= 0 {
		manifest.ManifestVersion = 1
	}
	manifest.Name = strings.TrimSpace(manifest.Name)
	manifest.Version = strings.TrimSpace(manifest.Version)
	manifest.MinAppVersion = strings.TrimSpace(manifest.MinAppVersion)
	manifest.Entry = strings.TrimSpace(manifest.Entry)
	manifest.Style = strings.TrimSpace(manifest.Style)
	if "" == manifest.Entry {
		manifest.Entry = "index.js"
	}
	if "" == manifest.Style {
		manifest.Style = "index.css"
	}
	manifest.Permissions = gulu.Str.RemoveDuplicatedElem(trimStringSlice(manifest.Permissions))
	manifest.Frontends = gulu.Str.RemoveDuplicatedElem(trimStringSlice(manifest.Frontends))
	manifest.Backends = gulu.Str.RemoveDuplicatedElem(trimStringSlice(manifest.Backends))
	manifest.AllowedRequireModules = gulu.Str.RemoveDuplicatedElem(trimStringSlice(manifest.AllowedRequireModules))
}

func ValidatePluginManifest(manifest *PluginManifest, pluginDir string) error {
	if nil == manifest {
		return errors.New("plugin manifest is missing")
	}
	if 1 != manifest.ManifestVersion {
		return fmt.Errorf("unsupported plugin manifest version: %d", manifest.ManifestVersion)
	}
	if !validPluginNamePattern.MatchString(manifest.Name) {
		return errors.New("plugin name must match ^[a-z0-9][a-z0-9-_]{1,63}$")
	}
	if "" == getPreferredLocaleString(manifest.DisplayName, "") {
		return errors.New("plugin displayName is required")
	}
	if "" == manifest.Version {
		return errors.New("plugin version is required")
	}
	if !validPluginVersionPattern.MatchString(manifest.Version) {
		return errors.New("plugin version must be semantic version like 1.0.0")
	}
	if "" == manifest.MinAppVersion {
		return errors.New("plugin minAppVersion is required")
	}
	if !validPluginVersionPattern.MatchString(manifest.MinAppVersion) {
		return errors.New("plugin minAppVersion must be semantic version like 1.0.0")
	}
	if "" == manifest.Entry {
		return errors.New("plugin entry is required")
	}
	if len(manifest.Permissions) == 0 {
		return errors.New("plugin permissions are required")
	}
	for _, permission := range manifest.Permissions {
		if !validPluginPermissions[permission] {
			return fmt.Errorf("unsupported plugin permission: %s", permission)
		}
	}
	if !filelock.IsExist(filepath.Join(pluginDir, manifest.Entry)) {
		return fmt.Errorf("plugin entry file not found: %s", manifest.Entry)
	}
	if "" != manifest.Style && !filelock.IsExist(filepath.Join(pluginDir, manifest.Style)) {
		return fmt.Errorf("plugin style file not found: %s", manifest.Style)
	}
	for _, frontend := range manifest.Frontends {
		if !validPluginFrontends[frontend] {
			return fmt.Errorf("unsupported plugin frontend: %s", frontend)
		}
	}
	for _, backend := range manifest.Backends {
		if !validPluginBackends[backend] {
			return fmt.Errorf("unsupported plugin backend: %s", backend)
		}
	}
	for _, moduleName := range manifest.AllowedRequireModules {
		if strings.Contains(moduleName, "..") || strings.ContainsAny(moduleName, `\/`) {
			return fmt.Errorf("invalid allowed require module: %s", moduleName)
		}
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func trimStringSlice(values []string) []string {
	ret := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); "" != trimmed {
			ret = append(ret, trimmed)
		}
	}
	return ret
}

func getPreferredLocaleString(m map[string]string, fallback string) string {
	if len(m) == 0 {
		return fallback
	}
	lang := ""
	if nil != Conf {
		lang = strings.TrimSpace(Conf.Lang)
	}
	if "" != lang {
		if v := strings.TrimSpace(m[lang]); "" != v {
			return v
		}
	}
	if v := strings.TrimSpace(m["default"]); "" != v {
		return v
	}
	if v := strings.TrimSpace(m["en_US"]); "" != v {
		return v
	}
	return fallback
}
