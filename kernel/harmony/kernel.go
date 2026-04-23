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

package main

import (
	"C"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/job"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/server"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

//export StartKernelFast
func StartKernelFast(container, appDir, workspaceBaseDir, localIPs *C.char) {
	go server.Serve(true, model.Conf.CookieKey)
}

//export StartKernel
func StartKernel(container, appDir, workspaceBaseDir, timezoneID, localIPs, lang, osVer *C.char) {
	SetTimezone(C.GoString(container), C.GoString(appDir), C.GoString(timezoneID))
	util.Mode = "prod"
	util.MobileOSVer = C.GoString(osVer)
	util.LocalIPs = strings.Split(C.GoString(localIPs), ",")
	util.BootMobile(C.GoString(container), C.GoString(appDir), C.GoString(workspaceBaseDir), C.GoString(lang))

	model.InitConf()
	go server.Serve(false, model.Conf.CookieKey)
	go func() {
		model.InitAppearance()
		sql.InitDatabase(false)
		sql.SetCaseSensitive(model.Conf.Search.CaseSensitive)
		sql.SetIndexAssetPath(model.Conf.Search.IndexAssetPath)

		model.BootSyncData()
		model.InitBoxes()

		util.SetBooted()
		util.PushClearAllMsg()

		job.StartCron()
		go sql.InitHistoryDatabase(false)
		go sql.InitAssetContentDatabase(false)
		go model.EnsureFlashcardsLoaded()
		go util.EnsureAssetsTextsLoaded()
		go model.AutoGenerateFileHistory()
		go cache.LoadAssets()
	}()
}

//export Language
func Language(num int) string {
	return model.Conf.Language(num)
}

//export ShowMsg
func ShowMsg(msg string, timeout int) {
	util.PushMsg(msg, timeout)
}

//export IsHttpServing
func IsHttpServing() bool {
	return util.HttpServing
}

//export SetHttpServerPort
func SetHttpServerPort(port int) {
	filelock.AndroidServerPort = port
}

//export GetCurrentWorkspacePath
func GetCurrentWorkspacePath() *C.char {
	return C.CString(util.WorkspaceDir)
}

//export GetAssetAbsPath
func GetAssetAbsPath(relativePath *C.char) *C.char {
	absPath, err := model.GetAssetAbsPath(C.GoString(relativePath))
	if nil != err {
		logging.LogErrorf("get asset abs path failed: %s", err)
		return relativePath
	}
	return C.CString(absPath)
}

//export GetMimeTypeByExt
func GetMimeTypeByExt(ext string) string {
	return util.GetMimeTypeByExt(ext)
}

//export SetTimezone
func SetTimezone(container, appDir, timezoneID string) {
	z, err := time.LoadLocation(strings.TrimSpace(timezoneID))
	if err != nil {
		fmt.Printf("load location failed: %s\n", err)
		time.Local = time.FixedZone("CST", 8*3600)
		return
	}
	time.Local = z
}

//export DisableFeature
func DisableFeature(feature *C.char) {
	util.DisableFeature(C.GoString(feature))
}

//export Unzip
func Unzip(zipFilePath, destination *C.char) {
	var zipPath, destPath string = C.GoString(zipFilePath), C.GoString(destination)
	if err := gulu.Zip.Unzip(zipPath, destPath); nil != err {
		logging.LogErrorf("unzip [%s] failed: %s", zipPath, err)
		panic(err)
	}
}

//export Exit
func Exit() {
	os.Exit(logging.ExitCodeOk)
}

func main() {}
