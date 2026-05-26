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

package model

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/kernel/bazaar"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

// Petal stores runtime plugin payload. The name is kept internally during the transition
// to the SourceFlow plugin system, but all public APIs use "plugin".
type Petal struct {
	Name              string          `json:"name"`              // Plugin name
	DisplayName       string          `json:"displayName"`       // Plugin display name
	Enabled           bool            `json:"enabled"`           // Whether enabled
	Incompatible      bool            `json:"incompatible"`      // Whether incompatible
	DisabledInPublish bool            `json:"disabledInPublish"` // Whether disabled in publish mode
	DisallowInstall   bool            `json:"disallowInstall"`   // Whether disallow install
	DisabledReason    string          `json:"disabledReason"`    // Why the plugin is currently disabled
	PermissionDigest  string          `json:"permissionDigest"`  // Reviewed permission signature
	Manifest          *PluginManifest `json:"manifest"`          // Manifest and permission declaration

	JS   string                 `json:"js"`   // JS code
	CSS  string                 `json:"css"`  // CSS code
	I18n map[string]interface{} `json:"i18n"` // i18n text
}

func SetPetalEnabled(name string, enabled bool, frontend string) (ret *Petal, err error) {
	petals := getPetals()

	found, displayName, incompatible, disabledInPublish, disallowInstall := bazaar.ParseInstalledPlugin(name, frontend)
	if !found {
		logging.LogErrorf("plugin [%s] not found", name)
		return
	}

	ret = getPetalByName(name, petals)
	if nil == ret {
		ret = &Petal{
			Name: name,
		}
		petals = append(petals, ret)
	}
	ret.DisplayName = displayName
	ret.Enabled = enabled
	ret.Incompatible = incompatible
	ret.DisabledInPublish = disabledInPublish
	ret.DisallowInstall = disallowInstall
	if enabled {
		ret.DisabledReason = ""
	}

	if enabled {
		manifest, manifestErr := LoadPluginManifest(filepath.Join(util.DataDir, "plugins", name))
		if nil != manifestErr {
			err = manifestErr
			return
		}
		ret.Manifest = manifest
		ret.PermissionDigest = pluginPermissionDigest(manifest)
	}

	if enabled && incompatible {
		err = fmt.Errorf("%s", Conf.Language(205))
		logging.LogInfof("plugin [%s] is incompatible [%s]", name, frontend)
		return
	}

	if enabled && disallowInstall {
		msg := "require upgrade SourceFlow to use this plugin [" + name + "]"
		err = fmt.Errorf("%s", msg)
		logging.LogInfof("%s", msg)
		return
	}

	savePetals(petals)
	loadCode(ret)
	return
}

func SetPluginEnabled(name string, enabled bool, frontend string) (ret *Petal, err error) {
	return SetPetalEnabled(name, enabled, frontend)
}

func getPetalByName(name string, petals []*Petal) (ret *Petal) {
	for _, p := range petals {
		if name == p.Name {
			ret = p
			break
		}
	}
	return
}

func LoadPetals(frontend string, isPublish bool) (ret []*Petal) {
	ret = []*Petal{}

	if Conf.Bazaar.PluginDisabled {
		return
	}

	if !Conf.Bazaar.Trust {
		// 移动端没有集市模块，所以要默认开启，桌面端和 Docker 容器需要用户手动确认过信任后才能开启
		if util.ContainerStd == util.Container || util.ContainerDocker == util.Container {
			return
		}
	}

	var petalNames []string
	petals := getPetals()
	for _, petal := range petals {
		_, petal.DisplayName, petal.Incompatible, petal.DisabledInPublish, petal.DisallowInstall = bazaar.ParseInstalledPlugin(petal.Name, frontend)
		if !petal.Enabled || petal.Incompatible || (isPublish && petal.DisabledInPublish) || petal.DisallowInstall {
			if petal.DisallowInstall {
				SetPetalEnabled(petal.Name, false, frontend)
				logging.LogInfof("plugin [%s] disallowed install, auto disabled", petal.Name)
			}
			continue
		}

		manifest, manifestErr := LoadPluginManifest(filepath.Join(util.DataDir, "plugins", petal.Name))
		if nil != manifestErr {
			logging.LogErrorf("load plugin [%s] manifest failed before enable check: %s", petal.Name, manifestErr)
			continue
		}
		digest := pluginPermissionDigest(manifest)
		if "" == petal.PermissionDigest {
			petal.Manifest = manifest
			petal.PermissionDigest = digest
			savePetals(petals)
		}
		if "" != petal.PermissionDigest && petal.PermissionDigest != digest {
			petal.Enabled = false
			petal.Manifest = manifest
			petal.DisabledReason = pluginPermissionChangedDisableReason()
			petal.PermissionDigest = ""
			savePetals(petals)
			logging.LogInfof("plugin [%s] permissions changed, auto disabled until user re-confirms", petal.Name)
			continue
		}

		loadCode(petal)
		ret = append(ret, petal)
		petalNames = append(petalNames, petal.Name)
	}

	logging.LogDebugf("loaded petals [frontend=%s, isPublish=%v, petals=[%s]]", frontend, isPublish, strings.Join(petalNames, ","))
	return
}

func LoadPlugins(frontend string, isPublish bool) (ret []*Petal) {
	return LoadPetals(frontend, isPublish)
}

func loadCode(petal *Petal) {
	pluginDir := filepath.Join(util.DataDir, "plugins", petal.Name)
	manifest, err := LoadPluginManifest(pluginDir)
	if err != nil {
		logging.LogErrorf("load plugin [%s] manifest failed: %s", petal.Name, err)
		return
	}
	petal.Manifest = manifest
	if "" == petal.PermissionDigest {
		petal.PermissionDigest = pluginPermissionDigest(manifest)
	}
	jsPath := filepath.Join(pluginDir, manifest.Entry)
	if !filelock.IsExist(jsPath) {
		logging.LogErrorf("plugin [%s] js not found", petal.Name)
		return
	}

	data, err := filelock.ReadFile(jsPath)
	if err != nil {
		logging.LogErrorf("read plugin [%s] js failed: %s", petal.Name, err)
		return
	}
	petal.JS = string(data)

	petal.CSS = ""
	cssPath := filepath.Join(pluginDir, manifest.Style)
	if "" != manifest.Style && filelock.IsExist(cssPath) {
		data, err = filelock.ReadFile(cssPath)
		if err != nil {
			logging.LogErrorf("read plugin [%s] css failed: %s", petal.Name, err)
		} else {
			petal.CSS = string(data)
		}
	}

	i18nDir := filepath.Join(pluginDir, "i18n")
	if gulu.File.IsDir(i18nDir) {
		langJSONs, readErr := os.ReadDir(i18nDir)
		if nil != readErr {
			logging.LogErrorf("read plugin [%s] i18n failed: %s", petal.Name, readErr)
		} else if 0 < len(langJSONs) {
			preferredLang := Conf.Lang + ".json"
			foundPreferredLang := false
			foundEnUS := false
			foundZhCN := false
			for _, langJSON := range langJSONs {
				if langJSON.Name() == preferredLang {
					foundPreferredLang = true
					break
				}
				if langJSON.Name() == "en_US.json" {
					foundEnUS = true
				}
				if langJSON.Name() == "zh_CN.json" {
					foundZhCN = true
				}
			}

			if !foundPreferredLang {
				if foundEnUS {
					preferredLang = "en_US.json"
				} else if foundZhCN {
					preferredLang = "zh_CN.json"
				} else {
					preferredLang = langJSONs[0].Name()
				}
			}

			if langFilePath := filepath.Join(i18nDir, preferredLang); gulu.File.IsExist(langFilePath) {
				data, err = filelock.ReadFile(langFilePath)
				if err != nil {
					logging.LogErrorf("read plugin [%s] i18n failed: %s", petal.Name, err)
				} else {
					petal.I18n = map[string]interface{}{}
					if err = gulu.JSON.UnmarshalJSON(data, &petal.I18n); err != nil {
						logging.LogErrorf("unmarshal plugin [%s] i18n failed: %s", petal.Name, err)
					}
				}
			}
		}
	}
}

func pluginPermissionDigest(manifest *PluginManifest) string {
	if nil == manifest {
		return ""
	}
	permissions := append([]string{}, manifest.Permissions...)
	sort.Strings(permissions)
	sum := sha256.Sum256([]byte(strings.Join(permissions, "\x1f")))
	return hex.EncodeToString(sum[:])
}

func pluginPermissionChangedDisableReason() string {
	if nil != Conf && "zh_CN" == strings.TrimSpace(Conf.Lang) {
		return "插件权限已变化，请重新确认后再启用"
	}
	return "Plugin permissions changed. Review and enable it again."
}

var petalsStoreLock = sync.Mutex{}

func savePetals(petals []*Petal) {
	petalsStoreLock.Lock()
	defer petalsStoreLock.Unlock()
	savePetals0(petals)
}

func savePetals0(petals []*Petal) {
	if 1 > len(petals) {
		petals = []*Petal{}
	}

	petalDir := filepath.Join(util.DataDir, "storage", "plugins")
	confPath := filepath.Join(petalDir, "plugins.json")
	data, err := gulu.JSON.MarshalIndentJSON(petals, "", "\t")
	if err != nil {
		logging.LogErrorf("marshal petals failed: %s", err)
		return
	}
	if err = filelock.WriteFile(confPath, data); err != nil {
		logging.LogErrorf("write petals [%s] failed: %s", confPath, err)
		return
	}
}

func pruneLegacyPluginDirs() {
	pluginsDir := filepath.Join(util.DataDir, "plugins")
	entries, err := os.ReadDir(pluginsDir)
	if err != nil {
		if !os.IsNotExist(err) {
			logging.LogErrorf("read plugins dir [%s] failed: %s", pluginsDir, err)
		}
		return
	}

	quarantineDir := filepath.Join(util.DataDir, "storage", "plugins", "legacy-removed")
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		pluginDir := filepath.Join(pluginsDir, name)
		pluginJSONPath := filepath.Join(pluginDir, "plugin.json")
		packageJSONPath := filepath.Join(pluginDir, "package.json")
		indexJSPath := filepath.Join(pluginDir, "index.js")
		if !filelock.IsExist(pluginJSONPath) && !filelock.IsExist(packageJSONPath) && !filelock.IsExist(indexJSPath) {
			continue
		}

		if _, err = LoadPluginManifest(pluginDir); nil == err {
			continue
		}

		if mkdirErr := os.MkdirAll(quarantineDir, 0755); nil == mkdirErr {
			targetDir := filepath.Join(quarantineDir, fmt.Sprintf("%s-%d", name, time.Now().UnixMilli()))
			if renameErr := os.Rename(pluginDir, targetDir); nil == renameErr {
				bazaar.RemovePackageInfo("plugins", name)
				logging.LogInfof("quarantined legacy plugin [%s] to [%s]", name, targetDir)
				continue
			}
		}

		if removeErr := os.RemoveAll(pluginDir); nil != removeErr {
			logging.LogErrorf("remove legacy plugin [%s] failed: %s", pluginDir, removeErr)
			continue
		}
		bazaar.RemovePackageInfo("plugins", name)
		logging.LogInfof("removed legacy plugin [%s]", pluginDir)
	}
}

func getPetals() (ret []*Petal) {
	petalsStoreLock.Lock()
	defer petalsStoreLock.Unlock()

	ret = []*Petal{}
	petalDir := filepath.Join(util.DataDir, "storage", "plugins")
	pruneLegacyPluginDirs()
	if err := os.MkdirAll(petalDir, 0755); err != nil {
		logging.LogErrorf("create petal dir [%s] failed: %s", petalDir, err)
		return
	}

	confPath := filepath.Join(petalDir, "plugins.json")
	if !filelock.IsExist(confPath) {
		data, err := gulu.JSON.MarshalIndentJSON(ret, "", "\t")
		if err != nil {
			logging.LogErrorf("marshal petals failed: %s", err)
			return
		}
		if err = filelock.WriteFile(confPath, data); err != nil {
			logging.LogErrorf("write petals [%s] failed: %s", confPath, err)
			return
		}
		return
	}

	data, err := filelock.ReadFile(confPath)
	if err != nil {
		logging.LogErrorf("read petal file [%s] failed: %s", confPath, err)
		return
	}

	if err = gulu.JSON.UnmarshalJSON(data, &ret); err != nil {
		logging.LogErrorf("unmarshal petals failed: %s", err)
		return
	}

	var tmp []*Petal
	pluginsDir := filepath.Join(util.DataDir, "plugins")
	for _, petal := range ret {
		pluginJSONPath := filepath.Join(pluginsDir, petal.Name, "plugin.json")
		if filelock.IsExist(pluginJSONPath) {
			tmp = append(tmp, petal)
		} else {
			// 插件不存在时，删除对应的持久化信息
			bazaar.RemovePackageInfo("plugins", petal.Name)
		}
	}
	if len(tmp) != len(ret) {
		savePetals0(tmp)
		ret = tmp
	}
	if 1 > len(ret) {
		ret = []*Petal{}
	}
	return
}
