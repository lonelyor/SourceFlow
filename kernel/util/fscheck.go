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

package util

import (
	"errors"
	"fmt"
	"io"
	"os"
	"time"
)

// CheckReadable 在不持有任何锁的情况下预检导入源路径是否可读。
//
// macOS 上内核子进程可能没有 TCC 权限去读取用户通过文件对话框选择的路径
// （~/Documents、~/Desktop 等受保护目录），此时系统调用会阻塞或返回权限错误。
// 该函数在 timeout 内探测可读性，避免在持有 syncLock 期间阻塞而把整个导入（以及
// 后续所有导入）永久冻结。超时后调用方会拿到一个明确的错误，而被阻塞的系统调用
// 对应的 goroutine 会随用户处理 TCC 提示后自行退出（可接受的泄漏，远好过全盘冻结）。
func CheckReadable(path string, timeout time.Duration) error {
	type result struct {
		err error
	}
	done := make(chan result, 1)
	go func() {
		done <- result{err: probeReadable(path)}
	}()
	select {
	case r := <-done:
		return r.err
	case <-time.After(timeout):
		return fmt.Errorf("read check timed out after %s (path may be blocked by macOS TCC or held by another process)", timeout)
	}
}

func probeReadable(path string) error {
	info, err := os.Stat(path)
	if err != nil {
		return err
	}
	if info.IsDir() {
		f, err := os.Open(path)
		if err != nil {
			return err
		}
		defer f.Close()
		// ReadDir(1) 在空目录上返回 io.EOF，说明目录本身可读，应视为通过。
		if _, err := f.ReadDir(1); err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, os.ErrClosed) {
			return err
		}
		return nil
	}
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return nil
}
