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
	"io"
	"os"
	"strings"
	"sync"

	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

var (
	lockMutex      = sync.Mutex{}
	operatingFiles = map[string]*sync.Mutex{}
)

func Lock(filePath string) {
	lock(filePath)
}

func Unlock(filePath string) {
	unlock(filePath)
}

func OpenFile(filePath string, flag int, perm os.FileMode) (file *os.File, err error) {
	lock(filePath)

	file, err = os.OpenFile(filePath, flag, perm)
	if err == nil {
		return
	}
	unlock(filePath)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "open file [%s] failed: %s", filePath, err)
		return
	}
	return
}

func CloseFile(file *os.File) (err error) {
	if nil == file {
		return
	}

	defer unlock(file.Name())

	err = file.Close()
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "close file [%s] failed: %s", file.Name(), err)
		return
	}
	return
}

func IsExist(filePath string) (ret bool) {
	lock(filePath)
	defer unlock(filePath)

	return gulu.File.IsExist(filePath)
}

func IsHidden(filePath string) (ret bool) {
	lock(filePath)
	defer unlock(filePath)

	return gulu.File.IsHidden(filePath)
}

func Copy(src, dest string) (err error) {
	lock(src)
	defer unlock(src)

	err = gulu.File.Copy(src, dest)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "copy [src=%s, dest=%s] failed: %s", src, dest, err)
		return
	}
	return
}

func CopyWithoutHidden(src, dest string) (err error) {
	lock(src)
	defer unlock(src)

	err = gulu.File.CopyWithoutHidden(src, dest)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "copy without hidden [src=%s, dest=%s] failed: %s", src, dest, err)
		return
	}
	return

}

func CopyNewtimes(src, dest string) (err error) {
	lock(src)
	defer unlock(src)

	err = gulu.File.CopyNewtimes(src, dest)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "copy [src=%s, dest=%s] failed: %s", src, dest, err)
		return
	}
	return
}

func Rename(p, newP string) (err error) {
	if p == newP {
		return nil
	}

	lock(p)
	defer unlock(p)

	if gulu.File.IsExist(newP) && gulu.File.IsDir(p) && gulu.File.IsDir(newP) {
		err = gulu.File.Copy(p, newP)
		if isDenied(err) {
			logging.LogFatalf(logging.ExitCodeFileSysErr, "copy [p=%s, newP=%s] failed: %s", p, newP, err)
			return
		}
		err = os.RemoveAll(p)
		if isDenied(err) {
			logging.LogFatalf(logging.ExitCodeFileSysErr, "remove [%s] failed: %s", p, err)
			return
		}
		return
	}

	err = os.Rename(p, newP)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "rename [p=%s, newP=%s] failed: %s", p, newP, err)
		return
	}
	return
}

func Remove(p string) (err error) {
	lock(p)
	defer unlock(p)

	err = os.RemoveAll(p)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "remove file [%s] failed: %s", p, err)
		return
	}
	return
}

func RemoveWithoutFatal(p string) (err error) {
	lock(p)
	defer unlock(p)

	err = os.RemoveAll(p)
	return
}

func ReadFile(filePath string) (data []byte, err error) {
	lock(filePath)
	defer unlock(filePath)

	data, err = os.ReadFile(filePath)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "read file [%s] failed: %s", filePath, err)
		return
	}
	return
}

func WriteFile(filePath string, data []byte) (err error) {
	lock(filePath)
	defer unlock(filePath)

	err = gulu.File.WriteFileSafer(filePath, data, 0644)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "write file [%s] failed: %s", filePath, err)
		return
	}
	return
}

func WriteFileByReader(filePath string, reader io.Reader) (err error) {
	lock(filePath)
	defer unlock(filePath)

	err = gulu.File.WriteFileSaferByReader(filePath, reader, 0644)
	if isDenied(err) {
		logging.LogFatalf(logging.ExitCodeFileSysErr, "write file [%s] failed: %s", filePath, err)
	}
	return
}

func isDenied(err error) bool {
	if nil == err {
		return false
	}

	if errors.Is(err, os.ErrPermission) {
		return true
	}

	errMsg := strings.ToLower(err.Error())
	return strings.Contains(errMsg, "access is denied") || strings.Contains(errMsg, "used by another process")
}

func lock(filePath string) {
	lockMutex.Lock()
	mutex := operatingFiles[filePath]
	if nil == mutex {
		mutex = &sync.Mutex{}
		operatingFiles[filePath] = mutex
	}
	lockMutex.Unlock()
	mutex.Lock()
}

func unlock(filePath string) {
	lockMutex.Lock()
	mutex := operatingFiles[filePath]
	//delete(operatingFiles, filePath) 删了的话并发情况下会导致死锁，得考虑新的回收机制
	lockMutex.Unlock()
	if nil != mutex {
		mutex.Unlock()
	}
}
