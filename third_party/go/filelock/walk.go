// FileLock - Read and write files with lock.
// Copyright (c) 2022-present, b3log.org
//
// FileLock is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//         http://license.coscl.org.cn/MulanPSL2
//
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
// EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
// MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
//
// See the Mulan PSL v2 for more details.

package filelock

import (
	"errors"
	"fmt"
	"io/fs"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

var (
	Container         = ""
	AndroidServerPort = 6906 // Android HTTP 服务器端口
)

func Walk(root string, fn fs.WalkDirFunc) error {
	if "harmony" == Container {
		return filepath.WalkDir(root, fn)
	}

	if strings.Contains(runtime.GOOS, "android") {
		// Android 系统上统一使用 Android HTTP 服务器来遍历文件
		// Data sync may cause data loss on Android 14 https://github.com/lonelyor/SourceFlow/issues/10205

		start := time.Now()
		req := httpclient.NewCloudFileRequest2m()
		req.SetBody(map[string]interface{}{"dir": root})
		req.SetContentType("application/json; charset=utf-8")
		resp, err := req.Post("http://[::1]:" + fmt.Sprintf("%d", AndroidServerPort) + "/api/walkDir")
		logging.LogInfof("walk dir [%s] cost [%s]", root, time.Since(start))
		if nil != err {
			logging.LogErrorf("walk dir [%s] failed: %s", root, err)
			return filepath.WalkDir(root, fn)
		}
		if 200 != resp.StatusCode {
			logging.LogErrorf("walk dir [%s] failed: %d", root, resp.StatusCode)
			return filepath.WalkDir(root, fn)
		}

		result := map[string]interface{}{}
		if err = resp.UnmarshalJson(&result); nil != err {
			logging.LogErrorf("walk dir [%s] failed: %s", root, err)
			return errors.New("walk dir failed")
		}

		code := result["code"].(float64)
		if 0 != code {
			msgResult := result["msg"]
			var msg string
			if nil != msgResult {
				msg = msgResult.(string)
			}
			logging.LogErrorf("walk dir [%s] failed: %f, %s", root, code, msg)
			return errors.New("walk dir failed")
		}

		data := result["data"].(map[string]interface{})
		filesData := data["files"].([]interface{})
		var infos []*RemoteFile
		for _, f := range filesData {
			info := &RemoteFile{info: f.(map[string]interface{})}
			infos = append(infos, info)
		}

		skipFiles := map[string]bool{}
		for _, info := range infos {
			p := info.Path()
			skip := false
			for skipFile, _ := range skipFiles {
				if strings.HasPrefix(p, skipFile) {
					skip = true
				}
			}
			if skip {
				//logging.LogInfof("skip walk [%s]", p)
				continue
			}

			err = fn(p, fs.FileInfoToDirEntry(info), nil)
			if nil != err {
				if errors.Is(err, fs.SkipDir) || errors.Is(err, fs.SkipAll) {
					skipFiles[p] = true
					//logging.LogInfof("skip walk [%s]", p)
					continue
				}

				logging.LogErrorf("walk [%s] failed: %s", p, err)
				return err
			}
		}
		return nil
	}
	return filepath.WalkDir(root, fn)
}

type RemoteFile struct {
	info map[string]interface{}
}

func (f *RemoteFile) Path() string {
	return f.info["path"].(string)
}

func (f *RemoteFile) Name() string {
	return f.info["name"].(string)
}

func (f *RemoteFile) Size() int64 {
	return int64(f.info["size"].(float64))
}

func (f *RemoteFile) Mode() fs.FileMode {
	if f.IsDir() {
		return 0755
	}
	return 0644
}

func (f *RemoteFile) ModTime() time.Time {
	ms := int64(f.info["updated"].(float64))
	return time.UnixMilli(ms)
}

func (f *RemoteFile) IsDir() bool {
	return f.info["isDir"].(bool)
}

func (f *RemoteFile) Sys() interface{} {
	return nil
}
