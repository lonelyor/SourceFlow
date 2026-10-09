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
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

func saveImportUpload(file *multipart.FileHeader, writePath, label string) error {
	if file.Size < 0 {
		return fmt.Errorf("%s upload size is invalid: %d", label, file.Size)
	}
	if file.Size > gulu.MaxZipTotalUncompressedSize {
		return fmt.Errorf("%s upload exceeds size limit (%d > %d)", label, file.Size, gulu.MaxZipTotalUncompressedSize)
	}

	reader, err := file.Open()
	if err != nil {
		return err
	}
	defer reader.Close()

	writer, err := os.OpenFile(writePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return err
	}

	copied, copyErr := io.Copy(writer, io.LimitReader(reader, gulu.MaxZipTotalUncompressedSize+1))
	closeErr := writer.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if copied > gulu.MaxZipTotalUncompressedSize {
		_ = os.Remove(writePath)
		return fmt.Errorf("%s upload exceeds size limit (%d > %d)", label, copied, gulu.MaxZipTotalUncompressedSize)
	}
	return nil
}

func importSY(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(200, ret)

	util.PushEndlessProgress(model.Conf.Language(73))
	defer util.ClearPushProgress(100)

	form, err := c.MultipartForm()
	if err != nil {
		logging.LogErrorf("parse import .sf.zip failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	files := form.File["file"]
	if 1 > len(files) {
		logging.LogErrorf("parse import .sf.zip failed, no file found")
		ret.Code = -1
		ret.Msg = "no file found"
		return
	}
	file := files[0]
	importDir := filepath.Join(util.TempDir, "import")
	if err = os.MkdirAll(importDir, 0755); err != nil {
		logging.LogErrorf("make import dir [%s] failed: %s", importDir, err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	writePath := filepath.Join(importDir, file.Filename)
	if !util.IsSubPath(importDir, writePath) {
		logging.LogErrorf("import path [%s] is not sub path of import dir [%s]", writePath, importDir)
		ret.Code = -1
		ret.Msg = "import path is not sub path of import dir"
		return
	}

	defer os.RemoveAll(writePath)

	if err = saveImportUpload(file, writePath, ".sf.zip"); err != nil {
		logging.LogErrorf("write import .sf.zip failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	notebook := form.Value["notebook"][0]
	toPath := form.Value["toPath"][0]

	if util.InvalidIDPattern(notebook, ret) {
		return
	}

	model.TryCreateProtectionSnapshot("import-sy")

	err = model.ImportSY(writePath, notebook, toPath)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

func importData(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	util.PushEndlessProgress(model.Conf.Language(73))
	defer util.ClearPushProgress(100)

	form, err := c.MultipartForm()
	if err != nil {
		logging.LogErrorf("import data failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if 1 > len(form.File["file"]) {
		logging.LogErrorf("import data failed: %s", err)
		ret.Code = -1
		ret.Msg = "file not found"
		return
	}

	importDir := filepath.Join(util.TempDir, "import")
	err = os.MkdirAll(importDir, 0755)
	if err != nil {
		ret.Code = -1
		ret.Msg = "create temp import dir failed"
		return
	}
	dataZipPath := filepath.Join(importDir, util.CurrentTimeSecondsStr()+".zip")
	defer os.RemoveAll(dataZipPath)

	file := form.File["file"][0]
	logging.LogInfof("import data [name=%s, size=%d]", file.Filename, file.Size)
	if err = saveImportUpload(file, dataZipPath, ".zip"); err != nil {
		logging.LogErrorf("write import data .zip failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.TryCreateProtectionSnapshot("import-data")

	err = model.ImportData(dataZipPath)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

func importStdMd(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	notebook := arg["notebook"].(string)
	localPath := arg["localPath"].(string)
	toPath := arg["toPath"].(string)

	if util.InvalidIDPattern(notebook, ret) {
		return
	}

	if util.IsSubPath(util.WorkingDir, localPath) {
		msg := fmt.Sprintf("import from local path [%s] failed: local path is sub path of working dir", localPath)
		logging.LogErrorf("%s", msg)
		ret.Code = -1
		ret.Msg = msg
		return
	}

	if util.IsSensitivePath(localPath) {
		msg := fmt.Sprintf("import from local path [%s] failed: local path is sensitive path", localPath)
		logging.LogErrorf("%s", msg)
		ret.Code = -1
		ret.Msg = msg
		return
	}

	model.TryCreateProtectionSnapshot("import-std-md")

	err := model.ImportFromLocalPath(notebook, localPath, toPath)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

func importZipMd(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(200, ret)

	util.PushEndlessProgress(model.Conf.Language(73))
	defer util.ClearPushProgress(100)

	form, err := c.MultipartForm()
	if err != nil {
		logging.LogErrorf("parse import .zip failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	files := form.File["file"]
	if 1 > len(files) {
		logging.LogErrorf("parse import .zip failed, no file found")
		ret.Code = -1
		ret.Msg = "no file found"
		return
	}
	file := files[0]
	importDir := filepath.Join(util.TempDir, "import")
	if err = os.MkdirAll(importDir, 0755); err != nil {
		logging.LogErrorf("make import dir [%s] failed: %s", importDir, err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	writePath := filepath.Join(importDir, file.Filename)
	if !util.IsSubPath(importDir, writePath) {
		logging.LogErrorf("import path [%s] is not sub path of import dir [%s]", writePath, importDir)
		ret.Code = -1
		ret.Msg = "import path is not sub path of import dir"
		return
	}

	defer os.RemoveAll(writePath)

	if err = saveImportUpload(file, writePath, ".zip"); err != nil {
		logging.LogErrorf("write import .zip failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	notebook := form.Value["notebook"][0]
	toPath := form.Value["toPath"][0]

	if util.InvalidIDPattern(notebook, ret) {
		return
	}

	// 准备解压路径
	filenameMain := strings.TrimSuffix(file.Filename, filepath.Ext(file.Filename))
	unzipPath := filepath.Join(util.TempDir, "import", filenameMain)

	defer os.RemoveAll(unzipPath)

	// 解压 writePath 的 zip 到 unzipPath
	err = gulu.Zip.Unzip(writePath, unzipPath)
	if err != nil {
		logging.LogErrorf("unzip import .zip failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.TryCreateProtectionSnapshot("import-zip-md")

	// 调用本地导入逻辑
	err = model.ImportFromLocalPath(notebook, unzipPath, toPath)

	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// importMdUpload 通过上传 Markdown 文件字节进行导入，替代基于本地路径的 importStdMd。
//
// 旧实现 importStdMd 把用户通过文件对话框选择的绝对路径交给内核 os.Open 读取，
// 在 macOS 上内核子进程没有 TCC 权限读取 ~/Documents、~/Desktop 等受保护目录，
// 会导致系统调用阻塞、内核卡死甚至退出。本端点改为接收上传的文件字节，仅在内核
// 可读的工作区 TempDir 内重建目录结构后调用 ImportFromLocalPath，从根本上规避 TCC。
//
// 表单字段：
//   - notebook：目标笔记本 ID
//   - toPath：目标路径
//   - paths：JSON 字符串数组，与 file 部件一一对应，记录每个文件在源目录中的相对路径
//     （单文件为文件名；文件夹导入为 webkitRelativePath）
//   - file：一个或多个文件部件
func importMdUpload(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	util.PushEndlessProgress(model.Conf.Language(73))
	defer util.ClearPushProgress(100)

	notebook := c.PostForm("notebook")
	toPath := c.PostForm("toPath")
	if util.InvalidIDPattern(notebook, ret) {
		return
	}

	var relPaths []string
	if pathsJSON := c.PostForm("paths"); "" != pathsJSON {
		if err := json.Unmarshal([]byte(pathsJSON), &relPaths); nil != err {
			logging.LogErrorf("import md upload parse paths failed: %s", err)
			ret.Code = -1
			ret.Msg = "invalid paths"
			return
		}
	}

	form, err := c.MultipartForm()
	if nil != err {
		logging.LogErrorf("import md upload parse form failed: %s", err)
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
	if len(relPaths) != len(files) {
		ret.Code = -1
		ret.Msg = "paths and files count mismatch"
		return
	}

	stagingRoot := filepath.Join(util.TempDir, "import", "mdupload-"+gulu.Rand.String(7))
	defer os.RemoveAll(stagingRoot)

	// 判定是单文件还是文件夹导入：任一相对路径含分隔符即为文件夹导入，首个路径段为顶层目录名。
	isFolder := false
	topDir := ""
	for _, rp := range relPaths {
		if strings.Contains(filepath.ToSlash(rp), "/") {
			isFolder = true
			topDir = strings.SplitN(filepath.ToSlash(rp), "/", 2)[0]
			break
		}
	}

	var importPath string
	if isFolder {
		// 顶层目录保留原名，使导入后的文档树根节点名称与源文件夹一致
		importPath = filepath.Join(stagingRoot, topDir)
	} else {
		importPath = stagingRoot
	}

	for i, fileHeader := range files {
		relPath := filepath.ToSlash(relPaths[i])
		// 去掉文件夹导入时的顶层目录前缀，使文件直接落在 importPath 之下
		if isFolder && strings.HasPrefix(relPath, topDir+"/") {
			relPath = strings.TrimPrefix(relPath, topDir+"/")
		}
		// 安全：清理并禁止越界（绝对路径、父级遍历）
		cleanRel := filepath.Clean(filepath.FromSlash(relPath))
		if filepath.IsAbs(cleanRel) || strings.HasPrefix(filepath.ToSlash(cleanRel), "../") || cleanRel == ".." {
			ret.Code = -1
			ret.Msg = "invalid file path in upload"
			return
		}
		writePath := filepath.Join(importPath, cleanRel)
		if !util.IsSubPath(importPath, writePath) {
			ret.Code = -1
			ret.Msg = "invalid file path in upload"
			return
		}
		if mkErr := os.MkdirAll(filepath.Dir(writePath), 0755); nil != mkErr {
			ret.Code = -1
			ret.Msg = mkErr.Error()
			return
		}
		if err = saveImportUpload(fileHeader, writePath, ".md"); nil != err {
			logging.LogErrorf("write import md upload file failed: %s", err)
			ret.Code = -1
			ret.Msg = err.Error()
			return
		}
	}

	model.TryCreateProtectionSnapshot("import-std-md")

	if isFolder {
		// 文件夹导入：传入顶层目录，ImportFromLocalPath 会以其名称为根文档遍历
		err = model.ImportFromLocalPath(notebook, importPath, toPath)
	} else {
		// 单文件导入：传入具体文件路径
		entries, _ := os.ReadDir(importPath)
		if 1 != len(entries) {
			ret.Code = -1
			ret.Msg = "invalid single file upload"
			return
		}
		err = model.ImportFromLocalPath(notebook, filepath.Join(importPath, entries[0].Name()), toPath)
	}
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}
