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

package api

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/emirpasic/gods/sets/hashset"
	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func loadPetals(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var frontend string
	if !util.ParseJsonArgs(arg, ret, util.BindJsonArg("frontend", true, &frontend)) {
		return
	}
	isPublish := model.IsReadOnlyRole(model.GetGinContextRole(c))

	ret.Data = model.LoadPetals(frontend, isPublish)
}

func loadPlugins(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var frontend string
	if !util.ParseJsonArgs(arg, ret, util.BindJsonArg("frontend", true, &frontend)) {
		return
	}
	isPublish := model.IsReadOnlyRole(model.GetGinContextRole(c))
	ret.Data = model.LoadPlugins(frontend, isPublish)
}

func setPetalEnabled(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var packageName, frontend, app string
	var enabled bool
	if !util.ParseJsonArgs(arg, ret,
		util.BindJsonArg("packageName", true, &packageName),
		util.BindJsonArg("enabled", true, &enabled),
		util.BindJsonArg("frontend", true, &frontend),
		util.BindJsonArg("app", false, &app),
	) {
		return
	}
	data, err := model.SetPetalEnabled(packageName, enabled, frontend)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = data
	if enabled {
		reloadPluginSet := hashset.New(packageName)
		model.PushReloadPlugin(nil, nil, reloadPluginSet, nil, app)
	} else {
		unloadPluginSet := hashset.New(packageName)
		model.PushReloadPlugin(nil, unloadPluginSet, nil, nil, app)
	}
}

func setPluginEnabled(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var packageName, frontend, app string
	var enabled bool
	if !util.ParseJsonArgs(arg, ret,
		util.BindJsonArg("packageName", true, &packageName),
		util.BindJsonArg("enabled", true, &enabled),
		util.BindJsonArg("frontend", true, &frontend),
		util.BindJsonArg("app", false, &app),
	) {
		return
	}
	data, err := model.SetPluginEnabled(packageName, enabled, frontend)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = data
	if enabled {
		reloadPluginSet := hashset.New(packageName)
		model.PushReloadPlugin(nil, nil, reloadPluginSet, nil, app)
	} else {
		unloadPluginSet := hashset.New(packageName)
		model.PushReloadPlugin(nil, unloadPluginSet, nil, nil, app)
	}
}

func installLocalPlugin(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		ret.Code = -1
		ret.Msg = "plugin package file is required"
		return
	}
	tmpDir := filepath.Join(util.TempDir, "plugin-import")
	if err = os.MkdirAll(tmpDir, 0755); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	tmpPath := filepath.Join(tmpDir, filepath.Base(fileHeader.Filename))
	if err = c.SaveUploadedFile(fileHeader, tmpPath); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	defer os.Remove(tmpPath)

	manifest, err := model.InstallLocalPluginPackageFromTemp(tmpPath)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]any{
		"name":        manifest.Name,
		"displayName": manifest.DisplayName,
		"description": manifest.Description,
		"version":     manifest.Version,
		"permissions": manifest.Permissions,
	}
}

func inspectLocalPlugin(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	fileHeader, err := c.FormFile("file")
	if err != nil {
		ret.Code = -1
		ret.Msg = "plugin package file is required"
		return
	}
	tmpDir := filepath.Join(util.TempDir, "plugin-import")
	if err = os.MkdirAll(tmpDir, 0755); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	tmpPath := filepath.Join(tmpDir, filepath.Base(fileHeader.Filename))
	if err = c.SaveUploadedFile(fileHeader, tmpPath); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	defer os.Remove(tmpPath)

	manifest, checksum, err := model.InspectLocalPluginPackage(tmpPath)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]any{
		"name":        manifest.Name,
		"displayName": manifest.DisplayName,
		"description": manifest.Description,
		"version":     manifest.Version,
		"author":      manifest.Author,
		"url":         manifest.URL,
		"frontends":   manifest.Frontends,
		"backends":    manifest.Backends,
		"permissions": manifest.Permissions,
		"integrity":   checksum,
	}
}
