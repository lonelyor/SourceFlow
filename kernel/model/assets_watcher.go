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

//go:build !darwin

package model

import (
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

var assetsWatcher *fsnotify.Watcher

func WatchAssets() {
	if !isFileWatcherAvailable() {
		return
	}

	go watchAssets()
}

func watchAssets() {
	CloseWatchAssets()
	assetsDir := filepath.Join(util.DataDir, "assets")

	var err error
	assetsWatcher, err = fsnotify.NewWatcher()
	if err != nil {
		logging.LogErrorf("add assets watcher for folder [%s] failed: %s", assetsDir, err)
		return
	}

	if !gulu.File.IsDir(assetsDir) {
		os.MkdirAll(assetsDir, 0755)
	}

	if err = assetsWatcher.Add(assetsDir); err != nil {
		logging.LogErrorf("add assets watcher for folder [%s] failed: %s", assetsDir, err)
		CloseWatchAssets()
		return
	}

	go func() {
		defer logging.Recover()

		var (
			timer     *time.Timer
			lastEvent fsnotify.Event
		)
		timer = time.NewTimer(100 * time.Millisecond)
		<-timer.C // timer should be expired at first

		for {
			select {
			case event, ok := <-assetsWatcher.Events:
				if !ok {
					return
				}

				lastEvent = event
				timer.Reset(time.Millisecond * 100)
			case err, ok := <-assetsWatcher.Errors:
				if !ok {
					return
				}
				logging.LogErrorf("watch assets failed: %s", err)
			case <-timer.C:
				//logging.LogInfof("assets changed: %s", lastEvent)
				if lastEvent.Op&fsnotify.Write == fsnotify.Write {
					IncSync()
				}

				// 重新缓存资源文件，以便使用 /资源 搜索
				go cache.LoadAssets()

				if lastEvent.Op&fsnotify.Remove == fsnotify.Remove {
					HandleAssetsRemoveEvent(lastEvent.Name)
				} else {
					HandleAssetsChangeEvent(lastEvent.Name)
				}
			}
		}
	}()
}

func CloseWatchAssets() {
	if nil != assetsWatcher {
		assetsWatcher.Close()
		assetsWatcher = nil
	}
}
