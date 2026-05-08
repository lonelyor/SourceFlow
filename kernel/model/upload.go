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
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

type picGoUploadResponse struct {
	Success bool            `json:"success"`
	Result  json.RawMessage `json:"result"`
	Message string          `json:"message"`
}

func InsertLocalAssets(id string, assetAbsPaths []string, isUpload bool, copyAsAssetArg ...bool) (succMap map[string]interface{}, err error) {
	succMap = map[string]interface{}{}
	copyAsAsset := 0 < len(copyAsAssetArg) && copyAsAssetArg[0]

	bt := treenode.GetBlockTree(id)
	if nil == bt {
		err = errors.New(Conf.Language(71))
		return
	}

	docDirLocalPath := filepath.Join(util.DataDir, bt.BoxID, path.Dir(bt.Path))
	assetsDirPath := getAssetsDir(filepath.Join(util.DataDir, bt.BoxID), docDirLocalPath)
	if !gulu.File.IsExist(assetsDirPath) {
		if err = os.MkdirAll(assetsDirPath, 0755); err != nil {
			return
		}
	}

	for _, assetAbsPath := range assetAbsPaths {
		baseName := filepath.Base(assetAbsPath)
		fName := baseName
		fName = util.FilterUploadFileName(fName)
		if "" == fName {
			fName = "attachment"
		}
		ext := filepath.Ext(fName)
		fName = strings.TrimSuffix(fName, ext)
		ext = strings.ToLower(ext)
		fName += ext
		isDir := gulu.File.IsDir(assetAbsPath)
		if (isDir || !isUpload) && !copyAsAsset {
			if !strings.HasPrefix(assetAbsPath, "\\\\") {
				assetAbsPath = "file://" + assetAbsPath
			}
			succMap[baseName] = assetAbsPath
			continue
		}

		if strings.EqualFold(filepath.Clean(assetsDirPath), filepath.Clean(assetAbsPath)) {
			succMap[baseName] = "assets/"
			continue
		}

		if util.IsSubPath(assetsDirPath, assetAbsPath) {
			// 已经位于 assets 目录下的资源文件不处理
			// Dragging a file from the assets folder into the editor causes the kernel to exit https://github.com/lonelyor/SourceFlow/issues/15355
			relPath, relErr := filepath.Rel(assetsDirPath, assetAbsPath)
			if nil != relErr {
				err = relErr
				return
			}
			assetRelPath := "assets/" + filepath.ToSlash(relPath)
			if isDir && !strings.HasSuffix(assetRelPath, "/") {
				assetRelPath += "/"
			}
			succMap[baseName] = assetRelPath
			continue
		}

		if isDir {
			fName = util.AssetName(fName, ast.NewNodeID())
			writePath := filepath.Join(assetsDirPath, fName)
			if err = filelock.Copy(assetAbsPath, writePath); err != nil {
				return
			}
			succMap[baseName] = "assets/" + fName + "/"
			continue
		}

		fi, statErr := os.Stat(assetAbsPath)
		if nil != statErr {
			err = statErr
			return
		}
		f, openErr := os.Open(assetAbsPath)
		if nil != openErr {
			err = openErr
			return
		}

		hash, hashErr := util.GetEtagByHandle(f, fi.Size())
		if nil != hashErr {
			f.Close()
			return
		}

		if 1 > fi.Size() {
			hash = "random_1_" + gulu.Rand.String(12)
		}

		existAssetPath := GetAssetPathByHash(hash)
		if "" != existAssetPath {
			originalName := util.RemoveID(filepath.Base(existAssetPath))
			if strings.ToLower(fName) != strings.ToLower(originalName) {
				hash = "random_2_" + gulu.Rand.String(12)
			}
		}

		if "" != existAssetPath && !strings.HasPrefix(hash, "random_") {
			succMap[baseName] = strings.TrimPrefix(existAssetPath, "/")
			f.Close()
		} else {
			fName = util.AssetName(fName, ast.NewNodeID())
			writePath := filepath.Join(assetsDirPath, fName)
			if _, err = f.Seek(0, io.SeekStart); err != nil {
				f.Close()
				return
			}
			if err = filelock.WriteFileByReader(writePath, f); err != nil {
				f.Close()
				return
			}
			f.Close()

			p := "assets/" + fName
			succMap[baseName] = p
			cache.SetAssetHash(hash, p)
		}
	}
	IncSync()
	return
}

func Upload(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(200, ret)

	form, err := c.MultipartForm()
	if err != nil {
		logging.LogErrorf("insert asset failed: %s", err)
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	assetsDirPath := filepath.Join(util.DataDir, "assets")
	if nil != form.Value["id"] {
		id := form.Value["id"][0]
		bt := treenode.GetBlockTree(id)
		if nil == bt {
			ret.Code = -1
			ret.Msg = Conf.Language(71)
			return
		}
		docDirLocalPath := filepath.Join(util.DataDir, bt.BoxID, path.Dir(bt.Path))
		assetsDirPath = getAssetsDir(filepath.Join(util.DataDir, bt.BoxID), docDirLocalPath)
	}

	relAssetsDirPath := "assets"
	if nil != form.Value["assetsDirPath"] {
		relAssetsDirPath = form.Value["assetsDirPath"][0]
		assetsDirPath = filepath.Join(util.DataDir, relAssetsDirPath)
		if !util.IsAbsPathInWorkspace(assetsDirPath) {
			ret.Code = -1
			ret.Msg = "Path [" + assetsDirPath + "] is not in workspace"
			return
		}
	}
	if !gulu.File.IsExist(assetsDirPath) {
		if err = os.MkdirAll(assetsDirPath, 0755); err != nil {
			ret.Code = -1
			ret.Msg = err.Error()
			return
		}
	}

	var errFiles []string
	succMap := map[string]interface{}{}
	files := form.File["file[]"]
	skipIfDuplicated := false // 默认不跳过重复文件，但是有的场景需要跳过，比如上传 PDF 标注图片 https://github.com/lonelyor/SourceFlow/issues/10666
	if nil != form.Value["skipIfDuplicated"] {
		skipIfDuplicated = "true" == form.Value["skipIfDuplicated"][0]
	}
	if Conf.Editor.AssetUploadProvider == conf.EditorAssetUploadProviderPicGo {
		picgoFiles, localFiles := splitPicGoUploadFiles(files)
		if 0 < len(picgoFiles) {
			picgoErrFiles, picgoSuccMap, picgoErr := uploadImageFilesViaPicGo(picgoFiles, Conf.Editor.PicGoServerURL)
			errFiles = append(errFiles, picgoErrFiles...)
			for name, uploaded := range picgoSuccMap {
				succMap[name] = uploaded
			}
			if nil != picgoErr {
				ret.Code = 1
				ret.Msg = picgoErr.Error()
			}
		}
		if 0 < len(localFiles) {
			localErrFiles, localSuccMap, localMsg := uploadFileHeadersToAssets(localFiles, assetsDirPath, relAssetsDirPath, skipIfDuplicated)
			errFiles = append(errFiles, localErrFiles...)
			for name, uploaded := range localSuccMap {
				succMap[name] = uploaded
			}
			if "" == ret.Msg && "" != localMsg {
				ret.Code = 1
				ret.Msg = localMsg
			}
		}
	} else {
		errFiles, succMap, ret.Msg = uploadFileHeadersToAssets(files, assetsDirPath, relAssetsDirPath, skipIfDuplicated)
	}

	ret.Data = map[string]interface{}{
		"errFiles": errFiles,
		"succMap":  succMap,
	}

	if 0 < len(succMap) {
		IncSync()
	}
}

func uploadFileHeadersToAssets(files []*multipart.FileHeader, assetsDirPath, relAssetsDirPath string, skipIfDuplicated bool) (errFiles []string, succMap map[string]interface{}, msg string) {
	succMap = map[string]interface{}{}

	for _, file := range files {
		baseName := file.Filename
		_, lastID := util.LastID(baseName)
		if !ast.IsNodeIDPattern(lastID) {
			lastID = ""
		}

		needUnzip2Dir := false
		if gulu.OS.IsDarwin() {
			if strings.HasSuffix(baseName, ".rtfd.zip") {
				needUnzip2Dir = true
			}
		}

		fName := baseName
		fName = util.FilterUploadFileName(fName)
		ext := filepath.Ext(fName)
		fName = strings.TrimSuffix(fName, ext)
		ext = strings.ToLower(ext)
		fName += ext
		f, openErr := file.Open()
		if nil != openErr {
			errFiles = append(errFiles, fName)
			msg = openErr.Error()
			break
		}

		hash, hashErr := util.GetEtagByHandle(f, file.Size)
		if nil != hashErr {
			errFiles = append(errFiles, fName)
			msg = hashErr.Error()
			f.Close()
			break
		}

		if 1 > file.Size {
			hash = "random_1_" + gulu.Rand.String(12)
		}

		existAssetPath := GetAssetPathByHash(hash)
		if "" != existAssetPath {
			originalName := util.RemoveID(filepath.Base(existAssetPath))
			if strings.ToLower(fName) != strings.ToLower(originalName) {
				hash = "random_2_" + gulu.Rand.String(12)
			}
		}

		if "" != existAssetPath && !strings.HasPrefix(hash, "random_") {
			succMap[baseName] = strings.TrimPrefix(existAssetPath, "/")
			f.Close()
			continue
		}

		if skipIfDuplicated {
			// 复制 PDF 矩形注解时不再重复插入图片 No longer upload image repeatedly when copying PDF rectangle annotation https://github.com/lonelyor/SourceFlow/issues/10666
			pattern := assetsDirPath + string(os.PathSeparator) + strings.TrimSuffix(fName, ext)
			_, patternLastID := util.LastID(fName)
			if lastID != "" && lastID != patternLastID {
				// 文件名太长被截断了，通过之前的 lastID 来匹配 PDF files with too long file names cannot generate annotated images https://github.com/lonelyor/SourceFlow/issues/15739
				pattern = assetsDirPath + string(os.PathSeparator) + "*" + lastID + ext
			} else {
				pattern += "*" + ext
			}

			matches, globErr := filepath.Glob(pattern)
			if nil != globErr {
				logging.LogErrorf("glob failed: %s", globErr)
			} else if 0 < len(matches) {
				fName = filepath.Base(matches[0])
				succMap[baseName] = strings.TrimPrefix(path.Join(relAssetsDirPath, fName), "/")
				f.Close()
				continue
			}
		}

		if "" == lastID {
			lastID = ast.NewNodeID()
		}
		fName = util.AssetName(fName, lastID)
		writePath := filepath.Join(assetsDirPath, fName)
		tmpDir := filepath.Join(util.TempDir, "convert", "zip", gulu.Rand.String(7))
		if needUnzip2Dir {
			if mkErr := os.MkdirAll(tmpDir, 0755); nil != mkErr {
				errFiles = append(errFiles, fName)
				msg = mkErr.Error()
				f.Close()
				break
			}
			writePath = filepath.Join(tmpDir, fName)
		}

		if _, seekErr := f.Seek(0, io.SeekStart); nil != seekErr {
			logging.LogErrorf("seek failed: %s", seekErr)
			errFiles = append(errFiles, fName)
			msg = seekErr.Error()
			f.Close()
			break
		}
		if writeErr := filelock.WriteFileByReader(writePath, f); nil != writeErr {
			logging.LogErrorf("write file failed: %s", writeErr)
			errFiles = append(errFiles, fName)
			msg = writeErr.Error()
			f.Close()
			break
		}
		f.Close()

		if needUnzip2Dir {
			baseName = strings.TrimSuffix(file.Filename, ".rtfd.zip") + ".rtfd"
			fName = baseName
			fName = util.FilterUploadFileName(fName)
			ext = filepath.Ext(fName)
			fName = strings.TrimSuffix(fName, ext)
			ext = strings.ToLower(ext)
			fName += ext
			fName = util.AssetName(fName, ast.NewNodeID())
			tmpDir2 := filepath.Join(util.TempDir, "convert", "zip", gulu.Rand.String(7))
			if unzipErr := gulu.Zip.Unzip(writePath, tmpDir2); nil != unzipErr {
				errFiles = append(errFiles, fName)
				msg = unzipErr.Error()
				break
			}

			entries, readErr := os.ReadDir(tmpDir2)
			if nil != readErr {
				logging.LogErrorf("read dir [%s] failed: %s", tmpDir2, readErr)
				errFiles = append(errFiles, fName)
				msg = readErr.Error()
				break
			}
			if 1 > len(entries) {
				logging.LogErrorf("read dir [%s] failed: no entry", tmpDir2)
				errFiles = append(errFiles, fName)
				msg = "no entry"
				break
			}
			dirName := entries[0].Name()
			srcDir := filepath.Join(tmpDir2, dirName)
			entries, readErr = os.ReadDir(srcDir)
			if nil != readErr {
				logging.LogErrorf("read dir [%s] failed: %s", filepath.Join(tmpDir2, entries[0].Name()), readErr)
				errFiles = append(errFiles, fName)
				msg = readErr.Error()
				break
			}
			destDir := filepath.Join(assetsDirPath, fName)
			for _, entry := range entries {
				from := filepath.Join(srcDir, entry.Name())
				to := filepath.Join(destDir, entry.Name())
				if copyErr := gulu.File.Copy(from, to); nil != copyErr {
					logging.LogErrorf("copy [%s] to [%s] failed: %s", from, to, copyErr)
					errFiles = append(errFiles, fName)
					msg = copyErr.Error()
					break
				}
			}
			os.RemoveAll(tmpDir)
			os.RemoveAll(tmpDir2)
		}

		p := strings.TrimPrefix(path.Join(relAssetsDirPath, fName), "/")
		succMap[baseName] = p
		cache.SetAssetHash(hash, p)
	}
	return
}

func splitPicGoUploadFiles(files []*multipart.FileHeader) (picgoFiles, localFiles []*multipart.FileHeader) {
	for _, file := range files {
		if isPicGoImageFile(file) {
			picgoFiles = append(picgoFiles, file)
		} else {
			localFiles = append(localFiles, file)
		}
	}
	return
}

func isPicGoImageFile(file *multipart.FileHeader) bool {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	for _, imageExt := range util.SourceFlowAssetsImage {
		if ext == imageExt {
			return true
		}
	}
	return strings.HasPrefix(strings.ToLower(strings.TrimSpace(file.Header.Get("Content-Type"))), "image/")
}

func uploadImageFilesViaPicGo(files []*multipart.FileHeader, endpoint string) (errFiles []string, succMap map[string]interface{}, err error) {
	succMap = map[string]interface{}{}
	for _, file := range files {
		url, uploadErr := uploadSingleImageViaPicGo(file, endpoint)
		if nil != uploadErr {
			errFiles = append(errFiles, file.Filename)
			if nil == err {
				err = uploadErr
			}
			continue
		}
		succMap[file.Filename] = url
	}
	return
}

func uploadSingleImageViaPicGo(file *multipart.FileHeader, endpoint string) (string, error) {
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	src, err := file.Open()
	if nil != err {
		return "", err
	}
	defer src.Close()

	part, err := writer.CreateFormFile("files", file.Filename)
	if nil != err {
		return "", err
	}
	if _, err = io.Copy(part, src); nil != err {
		return "", err
	}
	if err = writer.Close(); nil != err {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, endpoint, body)
	if nil != err {
		return "", err
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := (&http.Client{Timeout: 60 * time.Second}).Do(req)
	if nil != err {
		return "", fmt.Errorf("PicGo upload failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if nil != err {
		return "", err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("PicGo upload failed with status %d", resp.StatusCode)
	}

	parsed := &picGoUploadResponse{}
	if err = json.Unmarshal(respBody, parsed); nil != err {
		return "", fmt.Errorf("invalid PicGo response: %w", err)
	}
	if !parsed.Success {
		msg := strings.TrimSpace(parsed.Message)
		if "" == msg {
			msg = "PicGo upload failed"
		}
		return "", errors.New(msg)
	}

	return parsePicGoUploadResult(parsed.Result)
}

func parsePicGoUploadResult(raw json.RawMessage) (string, error) {
	var list []string
	if err := json.Unmarshal(raw, &list); nil == err && 0 < len(list) {
		if url := strings.TrimSpace(list[0]); "" != url {
			return url, nil
		}
	}

	var single string
	if err := json.Unmarshal(raw, &single); nil == err {
		if url := strings.TrimSpace(single); "" != url {
			return url, nil
		}
	}
	return "", errors.New("invalid PicGo upload result")
}

func getAssetsDir(boxLocalPath, docDirLocalPath string) (assets string) {
	assets = filepath.Join(docDirLocalPath, "assets")
	if !filelock.IsExist(assets) {
		assets = filepath.Join(boxLocalPath, "assets")
		if !filelock.IsExist(assets) {
			assets = filepath.Join(util.DataDir, "assets")
		}
	}
	return
}
