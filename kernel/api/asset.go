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
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/djherbis/times"
	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

func statAsset(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	path := arg["path"].(string)
	var p string
	if strings.HasPrefix(path, "assets/") {
		var err error
		p, err = model.GetAssetAbsPath(path)
		if err != nil {
			ret.Code = 1
			return
		}

	} else if localPath := util.FileURLToLocalPath(path); localPath != "" {
		p = localPath
	} else {
		ret.Code = 1
		return
	}

	if !util.IsAbsPathInWorkspace(p) {
		ret.Code = 1
		return
	}

	info, err := os.Stat(p)
	if err != nil {
		ret.Code = 1
		return
	}

	t, err := times.Stat(p)
	if err != nil {
		ret.Code = 1
		return
	}

	updated := t.ModTime().UnixMilli()
	hUpdated := t.ModTime().Format("2006-01-02 15:04:05")
	created := updated
	hCreated := hUpdated
	// Check birthtime before use
	if t.HasBirthTime() {
		created = t.BirthTime().UnixMilli()
		hCreated = t.BirthTime().Format("2006-01-02 15:04:05")
	}

	ret.Data = map[string]interface{}{
		"size":     info.Size(),
		"hSize":    humanize.IBytesCustomCeil(uint64(info.Size()), 2),
		"created":  created,
		"hCreated": hCreated,
		"updated":  updated,
		"hUpdated": hUpdated,
	}
}

func fullReindexAssetContent(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	model.ReindexAssetContent()
}

func getImageOCRText(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var path string
	if nil == arg["path"] {
		ret.Data = map[string]interface{}{
			"text": "",
		}
		return
	}

	path = arg["path"].(string)

	ret.Data = map[string]interface{}{
		"text": util.GetAssetText(path),
	}
}

func setImageOCRText(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	path := arg["path"].(string)
	text := arg["text"].(string)
	util.SetAssetText(path, text)

	// 刷新 OCR 结果到数据库
	util.NodeOCRQueueLock.Lock()
	defer util.NodeOCRQueueLock.Unlock()
	for _, id := range util.NodeOCRQueue {
		sql.IndexNodeQueue(id)
	}
	util.NodeOCRQueue = nil
}

func ocr(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	path := arg["path"].(string)

	ocrJSON, err := util.OcrAsset(path)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		ret.Data = map[string]interface{}{"closeTimeout": 7000}
		return
	}

	ret.Data = map[string]interface{}{
		"text":    util.GetOcrJsonText(ocrJSON),
		"ocrJSON": ocrJSON,
	}
}

func renameAsset(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	oldPath := arg["oldPath"].(string)
	newName := arg["newName"].(string)
	newPath, err := model.RenameAsset(oldPath, newName)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		ret.Data = map[string]interface{}{"closeTimeout": 5000}
		return
	}
	ret.Data = map[string]interface{}{
		"newPath": newPath,
	}
}

func getDocImageAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	id := arg["id"].(string)
	assets, err := model.DocImageAssets(id)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	if model.IsReadOnlyRoleContext(c) {
		publishAccess := model.GetPublishAccess()
		if !model.CheckBlockIdAccessableByPublishAccess(c, publishAccess, id) {
			ret.Code = -1
			ret.Msg = fmt.Sprintf(model.Conf.Language(15), id)
			return
		}
	}
	ret.Data = assets
}

func getDocAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	id := arg["id"].(string)
	assets, err := model.DocAssets(id)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	if model.IsReadOnlyRoleContext(c) {
		publishAccess := model.GetPublishAccess()
		if !model.CheckBlockIdAccessableByPublishAccess(c, publishAccess, id) {
			ret.Code = -1
			ret.Msg = fmt.Sprintf(model.Conf.Language(15), id)
			return
		}
	}
	ret.Data = assets
}

func setFileAnnotation(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	p := arg["path"].(string)
	p = strings.ReplaceAll(p, "%23", "#")
	data := arg["data"].(string)
	writePath, err := resolveFileAnnotationAbsPath(p)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	if err := filelock.WriteFile(writePath, []byte(data)); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.IncSync()
}

func getFileAnnotation(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	p := arg["path"].(string)
	p = strings.ReplaceAll(p, "%23", "#")
	readPath, err := resolveFileAnnotationAbsPath(p)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		ret.Data = map[string]interface{}{"closeTimeout": 5000}
		return
	}
	if !filelock.IsExist(readPath) {
		ret.Code = 1
		return
	}

	data, err := filelock.ReadFile(readPath)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]interface{}{
		"data": string(data),
	}
}

func resolveFileAnnotationAbsPath(assetRelPath string) (ret string, err error) {
	filePath := strings.TrimSuffix(assetRelPath, ".sya")
	absPath, err := model.GetAssetAbsPath(filePath)
	if err != nil {
		return
	}
	dir := filepath.Dir(absPath)
	base := filepath.Base(assetRelPath)
	ret = filepath.Join(dir, base)
	return
}

func removeUnusedAsset(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	p := arg["path"].(string)
	asset := model.RemoveUnusedAsset(p)
	ret.Data = map[string]interface{}{
		"path": asset,
	}
}

func removeUnusedAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	paths := model.RemoveUnusedAssets()
	ret.Data = map[string]interface{}{
		"paths": paths,
	}
}

func getUnusedAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	unusedAssets := model.UnusedAssets(true)
	total := len(unusedAssets)

	// List only 512 unreferenced assets https://github.com/lonelyor/SourceFlow/issues/13075
	const maxUnusedAssets = 512
	if total > maxUnusedAssets {
		unusedAssets = unusedAssets[:maxUnusedAssets]
		util.PushMsg(fmt.Sprintf(model.Conf.Language(251), total, maxUnusedAssets), 5000)
	}

	ret.Data = unusedAssets
}

func getMissingAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	missingAssets := model.MissingAssets()
	ret.Data = missingAssets
}

func resolveAssetPath(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	path := arg["path"].(string)
	p, err := model.GetAssetAbsPath(path)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		ret.Data = map[string]interface{}{"closeTimeout": 3000}
		return
	}
	ret.Data = p
	return
}

func insertLocalAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	assetPathsArg := arg["assetPaths"].([]interface{})
	var assetPaths []string
	for _, pathArg := range assetPathsArg {
		assetPaths = append(assetPaths, pathArg.(string))
	}
	isUpload := true
	isUploadArg := arg["isUpload"]
	if nil != isUploadArg {
		isUpload = isUploadArg.(bool)
	}
	copyAsAsset := false
	copyAsAssetArg := arg["copyAsAsset"]
	if nil != copyAsAssetArg {
		copyAsAsset = copyAsAssetArg.(bool)
	}
	id := arg["id"].(string)
	succMap, err := model.InsertLocalAssets(id, assetPaths, isUpload, copyAsAsset)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]interface{}{
		"succMap": succMap,
	}
}

// uploadLocalAssets 通过上传文件字节插入本地资源，替代基于绝对路径的 insertLocalAssets。
//
// 与 importStdUpload 同理：旧实现把拖拽/选择的绝对路径交给内核 os.Open，在 macOS 上内核
// 子进程没有 TCC 权限读取 ~/Documents 等受保护目录，导致卡死或内核退出。本端点改为接收
// 上传的文件字节，写入内核可读的工作区 TempDir 暂存目录，再复用 InsertLocalAssets 处理，
// 从根本上规避 TCC。
//
// 表单字段：id、isUpload、copyAsAsset，以及一个或多个 file 部件（文件名保留原名）。
func uploadLocalAssets(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	id := c.PostForm("id")
	if "" == id {
		ret.Code = -1
		ret.Msg = "id is required"
		return
	}
	isUpload := true
	if v := c.PostForm("isUpload"); "" != v {
		isUpload = "true" == v
	}
	copyAsAsset := false
	if v := c.PostForm("copyAsAsset"); "" != v {
		copyAsAsset = "true" == v
	}

	form, err := c.MultipartForm()
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	files := form.File["file"]
	if 1 > len(files) {
		ret.Code = -1
		ret.Msg = "no file found"
		return
	}

	stagingDir := filepath.Join(util.TempDir, "import", "assets-"+gulu.Rand.String(7))
	defer os.RemoveAll(stagingDir)

	var assetPaths []string
	for _, fileHeader := range files {
		baseName := filepath.Base(fileHeader.Filename)
		baseName = util.FilterUploadFileName(baseName)
		if "" == baseName {
			baseName = "attachment"
		}
		writePath := filepath.Join(stagingDir, baseName)
		if !util.IsSubPath(stagingDir, writePath) {
			ret.Code = -1
			ret.Msg = "invalid file name in upload"
			return
		}
		if mkErr := os.MkdirAll(stagingDir, 0755); nil != mkErr {
			ret.Code = -1
			ret.Msg = mkErr.Error()
			return
		}
		if writeErr := saveUploadedAsset(fileHeader, writePath); nil != writeErr {
			logging.LogErrorf("write uploaded asset failed: %s", writeErr)
			ret.Code = -1
			ret.Msg = writeErr.Error()
			return
		}
		assetPaths = append(assetPaths, writePath)
	}

	succMap, err := model.InsertLocalAssets(id, assetPaths, isUpload, copyAsAsset)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = map[string]interface{}{
		"succMap": succMap,
	}
}

// saveUploadedAsset 将上传的资源文件字节写入 writePath，并施加与导入一致的大小上限。
func saveUploadedAsset(file *multipart.FileHeader, writePath string) error {
	if file.Size < 0 {
		return fmt.Errorf("upload size is invalid: %d", file.Size)
	}
	if file.Size > gulu.MaxZipTotalUncompressedSize {
		return fmt.Errorf("upload exceeds size limit (%d > %d)", file.Size, gulu.MaxZipTotalUncompressedSize)
	}
	reader, err := file.Open()
	if nil != err {
		return err
	}
	defer reader.Close()
	writer, err := os.OpenFile(writePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if nil != err {
		return err
	}
	copied, copyErr := io.Copy(writer, io.LimitReader(reader, gulu.MaxZipTotalUncompressedSize+1))
	closeErr := writer.Close()
	if nil != copyErr {
		return copyErr
	}
	if nil != closeErr {
		return closeErr
	}
	if copied > gulu.MaxZipTotalUncompressedSize {
		_ = os.Remove(writePath)
		return fmt.Errorf("upload exceeds size limit (%d > %d)", copied, gulu.MaxZipTotalUncompressedSize)
	}
	return nil
}
