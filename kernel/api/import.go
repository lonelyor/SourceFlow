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

	var dataZipFile *os.File
	var fileReader io.ReadCloser
	defer func() {
		if dataZipFile != nil {
			_ = dataZipFile.Close()
		}
		if fileReader != nil {
			_ = fileReader.Close()
		}
	}()

	dataZipFile, err = os.Create(dataZipPath)
	if err != nil {
		logging.LogErrorf("create temp file failed: %s", err)
		ret.Code = -1
		ret.Msg = "create temp file failed"
		return
	}
	file := form.File["file"][0]
	logging.LogInfof("import data [name=%s, size=%d]", file.Filename, file.Size)
	fileReader, err = file.Open()
	if err != nil {
		logging.LogErrorf("open upload file failed: %s", err)
		ret.Code = -1
		ret.Msg = "open file failed"
		return
	}
	_, err = io.Copy(dataZipFile, fileReader)
	if err != nil {
		logging.LogErrorf("read upload file failed: %s", err)
		ret.Code = -1
		ret.Msg = "read file failed"
		return
	}
	if err = dataZipFile.Close(); err != nil {
		logging.LogErrorf("close file failed: %s", err)
		ret.Code = -1
		ret.Msg = "close file failed"
		return
	}
	dataZipFile = nil
	if err = fileReader.Close(); err != nil {
		logging.LogErrorf("close upload reader failed: %s", err)
		ret.Code = -1
		ret.Msg = "close file failed"
		return
	}
	fileReader = nil

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
