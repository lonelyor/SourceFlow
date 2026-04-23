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

//go:build !mobile

package main

import (
	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/job"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/server"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
)

func main() {
	util.Boot()

	model.InitConf()
	go server.Serve(false, model.Conf.CookieKey)
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
	go util.InitPandoc()
	go model.AutoGenerateFileHistory()
	go cache.LoadAssets()
	go util.CheckFileSysStatus()

	model.WatchAssets()
	model.WatchEmojis()
	model.WatchThemes()
	model.HandleSignal()
}
