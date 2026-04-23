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

package conf

import (
	"path/filepath"

	"github.com/lonelyor/sourceflow/kernel/util"
)

type Repo struct {
	Key []byte `json:"key"` // AES 密钥

	// 同步索引计时，单位毫秒，超过该时间则提示用户索引性能下降
	// If the data repo indexing time is greater than 12s, prompt user to purge the data repo https://github.com/lonelyor/SourceFlow/issues/9613
	// Supports configuring data sync index time-consuming prompts https://github.com/lonelyor/SourceFlow/issues/9698
	SyncIndexTiming int64 `json:"syncIndexTiming"`

	// 自动清理数据仓库 Automatic purge for local data repo https://github.com/lonelyor/SourceFlow/issues/13091
	IndexRetentionDays    int `json:"indexRetentionDays"`    // 索引保留天数
	RetentionIndexesDaily int `json:"retentionIndexesDaily"` // 每日保留索引数

	// 远端恢复点保留策略。当前仅提供默认值，后续再开放前端配置入口。
	RemoteRetentionRecentHours int `json:"remoteRetentionRecentHours"` // 最近 N 小时每小时保留一个恢复点
	RemoteRetentionRecentDays  int `json:"remoteRetentionRecentDays"`  // 最近 N 天每天保留一个恢复点
}

func NewRepo() *Repo {
	return &Repo{
		SyncIndexTiming:            12 * 1000,
		IndexRetentionDays:         180,
		RetentionIndexesDaily:      2,
		RemoteRetentionRecentHours: 24,
		RemoteRetentionRecentDays:  7,
	}
}

func (*Repo) GetSaveDir() string {
	return filepath.Join(util.WorkspaceDir, "repo")
}
