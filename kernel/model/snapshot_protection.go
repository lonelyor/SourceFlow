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
	"fmt"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu/cloud"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu/entity"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

const (
	autoHourlySnapshotTagPrefix = "auto-hourly-"
	autoDailySnapshotTagPrefix  = "auto-daily-"
	protectSnapshotTagPrefix    = "protect-"
)

type SnapshotProtectionStat struct {
	LocalHistoryRetentionDays int    `json:"localHistoryRetentionDays"`
	LocalHistorySize          int64  `json:"localHistorySize"`
	HLocalHistorySize         string `json:"hLocalHistorySize"`
	LocalRepoSize             int64  `json:"localRepoSize"`
	HLocalRepoSize            string `json:"hLocalRepoSize"`
	RemoteRepoSize            int64  `json:"remoteRepoSize"`
	HRemoteRepoSize           string `json:"hRemoteRepoSize"`
	LocalSnapshotCount        int    `json:"localSnapshotCount"`
	LocalTagCount             int    `json:"localTagCount"`
	LocalRestorePointCount    int    `json:"localRestorePointCount"`
	RemoteSnapshotCount       int    `json:"remoteSnapshotCount"`
	RemoteTagCount            int    `json:"remoteTagCount"`
	RemoteRestorePointCount   int    `json:"remoteRestorePointCount"`
	RemoteRetentionHours      int    `json:"remoteRetentionHours"`
	RemoteRetentionDays       int    `json:"remoteRetentionDays"`
}

var (
	snapshotProtectionRunning       = atomic.Bool{}
	snapshotProtectionCleanupLock   = sync.Mutex{}
	lastSnapshotProtectionCleanupAt time.Time
)

func GetSnapshotProtectionStat() (ret *SnapshotProtectionStat, err error) {
	ret = &SnapshotProtectionStat{
		LocalHistoryRetentionDays: Conf.Editor.HistoryRetentionDays,
		RemoteRetentionHours:      Conf.Repo.RemoteRetentionRecentHours,
		RemoteRetentionDays:       Conf.Repo.RemoteRetentionRecentDays,
	}

	ret.LocalHistorySize = calcDirSize(util.HistoryDir)
	ret.HLocalHistorySize = humanize.BytesCustomCeil(uint64(ret.LocalHistorySize), 2)
	ret.LocalRepoSize = calcDirSize(util.RepoDir)
	ret.HLocalRepoSize = humanize.BytesCustomCeil(uint64(ret.LocalRepoSize), 2)

	if 1 > len(Conf.Repo.Key) {
		return
	}

	repo, repoErr := newRepository()
	if nil != repoErr {
		logging.LogWarnf("get snapshot protection stat new repository failed: %s", repoErr)
		return
	}

	localSnapshots, _, totalLocalSnapshots, getLocalSnapshotsErr := repo.GetIndexLogs(1, 1)
	if nil == getLocalSnapshotsErr {
		if 0 < len(localSnapshots) || 0 < totalLocalSnapshots {
			ret.LocalSnapshotCount = totalLocalSnapshots
		}
	}

	localTags, getLocalTagsErr := repo.GetTagLogs()
	if nil == getLocalTagsErr {
		ret.LocalTagCount = len(localTags)
	}
	ret.LocalRestorePointCount = ret.LocalSnapshotCount + ret.LocalTagCount

	cloudConf, cloudErr := buildCloudConf()
	if nil != cloudErr {
		logging.LogWarnf("build snapshot protection cloud config failed: %s", cloudErr)
		return
	}
	cloudRepo, cloudErr := newCloudRepo(cloudConf)
	if nil != cloudErr {
		logging.LogWarnf("create snapshot protection cloud repo failed: %s", cloudErr)
		return
	}

	remoteIndexes, getRemoteIndexesErr := getAllCloudIndexes(cloudRepo)
	if nil == getRemoteIndexesErr {
		ret.RemoteSnapshotCount = len(remoteIndexes)
	}
	remoteTags, getRemoteTagsErr := cloudRepo.GetTags()
	if nil == getRemoteTagsErr {
		ret.RemoteTagCount = len(remoteTags)
	}
	ret.RemoteRestorePointCount = ret.RemoteSnapshotCount + ret.RemoteTagCount

	remoteStat, getRemoteStatErr := cloudRepo.GetStat()
	if nil == getRemoteStatErr && nil != remoteStat {
		ret.RemoteRepoSize = remoteStat.Sync.Size + remoteStat.Backup.Size
		ret.HRemoteRepoSize = humanize.BytesCustomCeil(uint64(ret.RemoteRepoSize), 2)
	}
	return
}

func MaintainSnapshotProtection() (ret *SnapshotProtectionStat, err error) {
	if err = maintainSnapshotProtection(true); nil != err {
		return
	}
	ret, err = GetSnapshotProtectionStat()
	return
}

func MaintainSnapshotProtectionInBackground(reason string) {
	if snapshotProtectionRunning.Swap(true) {
		return
	}

	go func() {
		defer snapshotProtectionRunning.Store(false)
		if err := maintainSnapshotProtection(false); nil != err {
			logging.LogWarnf("maintain snapshot protection [%s] failed: %s", reason, err)
		}
	}()
}

func CreateProtectionSnapshot(action string) (err error) {
	if 1 > len(Conf.Repo.Key) {
		return nil
	}

	repo, err := newRepository()
	if nil != err {
		return
	}
	return createProtectionSnapshotWithRepo(repo, action)
}

func TryCreateProtectionSnapshot(action string) {
	if err := CreateProtectionSnapshot(action); nil != err {
		logging.LogWarnf("create protection snapshot [%s] failed: %s", action, err)
	}
}

func createProtectionSnapshotWithRepo(repo *dejavu.Repo, action string) (err error) {
	if nil == repo || 1 > len(Conf.Repo.Key) {
		return nil
	}

	action = normalizeProtectionAction(action)
	FlushTxQueue()
	index, err := repo.Index(fmt.Sprintf("Protection before %s", strings.ReplaceAll(action, "-", " ")), false, nil)
	if nil != err {
		return
	}
	return repo.AddTag(index.ID, buildProtectionTagName(action))
}

func maintainSnapshotProtection(force bool) (err error) {
	if 1 > len(Conf.Repo.Key) {
		return nil
	}

	repo, err := newRepository()
	if nil != err {
		return
	}

	if force {
		if err = purgeLocalRepoByRetention(repo); nil != err {
			return
		}
	}

	purgeRemote := shouldPurgeRemoteSnapshotProtection(force)
	if err = maintainRemoteSnapshotRetention(repo, purgeRemote); nil != err {
		return
	}
	if purgeRemote {
		markRemoteSnapshotProtectionPurged()
	}
	return
}

func shouldPurgeRemoteSnapshotProtection(force bool) bool {
	if force {
		return true
	}

	snapshotProtectionCleanupLock.Lock()
	defer snapshotProtectionCleanupLock.Unlock()
	return time.Since(lastSnapshotProtectionCleanupAt) >= 6*time.Hour
}

func markRemoteSnapshotProtectionPurged() {
	snapshotProtectionCleanupLock.Lock()
	defer snapshotProtectionCleanupLock.Unlock()
	lastSnapshotProtectionCleanupAt = time.Now()
}

func purgeLocalRepoByRetention(repo *dejavu.Repo) (err error) {
	now := time.Now()

	dateGroupedIndexes := map[string][]*entity.Index{}
	page := 1
	for {
		indexes, pageCount, _, getErr := repo.GetIndexes(page, 512)
		if nil != getErr {
			err = getErr
			return
		}
		if 1 > len(indexes) {
			break
		}

		tooOld := false
		for _, index := range indexes {
			if now.UnixMilli()-index.Created <= int64(Conf.Repo.IndexRetentionDays)*24*60*60*1000 {
				date := time.UnixMilli(index.Created).Format("2006-01-02")
				dateGroupedIndexes[date] = append(dateGroupedIndexes[date], index)
			} else {
				tooOld = true
				break
			}
		}
		if tooOld {
			break
		}
		page++
		if page > pageCount {
			break
		}
	}

	retainIDs := []string{}
	todayDate := now.Format("2006-01-02")
	for date, indexes := range dateGroupedIndexes {
		if todayDate == date || len(indexes) <= Conf.Repo.RetentionIndexesDaily {
			for _, index := range indexes {
				retainIDs = append(retainIDs, index.ID)
			}
			continue
		}

		for _, index := range pickRetainedIndexes(indexes, Conf.Repo.RetentionIndexesDaily) {
			retainIDs = append(retainIDs, index.ID)
		}
	}

	retainIDs = gulu.Str.RemoveDuplicatedElem(retainIDs)
	if 3 > len(retainIDs) {
		return nil
	}

	_, err = repo.Purge(retainIDs...)
	return
}

func pickRetainedIndexes(indexes []*entity.Index, retainCount int) (ret []*entity.Index) {
	if retainCount >= len(indexes) {
		return indexes
	}
	if 1 >= retainCount {
		return []*entity.Index{indexes[0]}
	}

	selected := map[int]bool{}
	for i := 0; i < retainCount; i++ {
		pos := i * (len(indexes) - 1) / (retainCount - 1)
		if selected[pos] {
			continue
		}
		selected[pos] = true
		ret = append(ret, indexes[pos])
	}
	return
}

func maintainRemoteSnapshotRetention(repo *dejavu.Repo, purge bool) (err error) {
	cloudConf, err := buildCloudConf()
	if nil != err {
		return
	}
	cloudRepo, err := newCloudRepo(cloudConf)
	if nil != err {
		return
	}

	indexes, err := getAllCloudIndexes(cloudRepo)
	if nil != err {
		return
	}

	keepTags := buildRemoteRetentionTags(indexes)
	existingTags, err := cloudRepo.GetTags()
	if nil != err {
		return
	}
	existingTagMap := map[string]string{}
	for _, tagRef := range existingTags {
		existingTagMap[tagRef.Name] = tagRef.ID
	}

	for tagName, id := range keepTags {
		if existingTagMap[tagName] == id {
			continue
		}
		if _, err = cloudRepo.UploadBytes(path.Join("refs", "tags", tagName), []byte(id), true); nil != err {
			return
		}
	}

	for _, tagRef := range existingTags {
		if !isAutoSnapshotTag(tagRef.Name) {
			continue
		}
		if _, ok := keepTags[tagRef.Name]; ok {
			continue
		}
		removeErr := cloudRepo.RemoveObject(path.Join("refs", "tags", tagRef.Name))
		if nil != removeErr && !os.IsNotExist(removeErr) && cloud.ErrCloudObjectNotFound != removeErr {
			err = removeErr
			return
		}
	}

	if purge {
		_, err = repo.PurgeCloud()
	}
	return
}

func buildRemoteRetentionTags(indexes []*entity.Index) (ret map[string]string) {
	ret = map[string]string{}
	if 1 > len(indexes) {
		return
	}

	now := time.Now()
	hourlyLookback := max(0, Conf.Repo.RemoteRetentionRecentHours-1)
	dailyLookback := max(0, Conf.Repo.RemoteRetentionRecentDays-1)
	hourlyCutoff := now.Add(-time.Duration(hourlyLookback) * time.Hour)
	dailyCutoff := now.AddDate(0, 0, -dailyLookback)
	hourlyBuckets := map[string]*entity.Index{}
	dailyBuckets := map[string]*entity.Index{}

	for _, index := range indexes {
		createdAt := time.UnixMilli(index.Created)
		if createdAt.After(hourlyCutoff) || createdAt.Equal(hourlyCutoff) {
			bucket := createdAt.Format("2006010215")
			if nil == hourlyBuckets[bucket] || hourlyBuckets[bucket].Created < index.Created {
				hourlyBuckets[bucket] = index
			}
		}
		if createdAt.After(dailyCutoff) || createdAt.Equal(dailyCutoff) {
			bucket := createdAt.Format("20060102")
			if nil == dailyBuckets[bucket] || dailyBuckets[bucket].Created < index.Created {
				dailyBuckets[bucket] = index
			}
		}
	}

	for bucket, index := range hourlyBuckets {
		ret[autoHourlySnapshotTagPrefix+bucket] = index.ID
	}
	for bucket, index := range dailyBuckets {
		ret[autoDailySnapshotTagPrefix+bucket] = index.ID
	}
	return
}

func getAllCloudIndexes(cloudRepo cloud.Cloud) (ret []*entity.Index, err error) {
	page := 1
	for {
		indexes, pageCount, _, getErr := cloudRepo.GetIndexes(page)
		if nil != getErr {
			err = getErr
			return
		}
		if 1 > len(indexes) {
			break
		}
		ret = append(ret, indexes...)
		page++
		if page > pageCount {
			break
		}
	}
	sort.Slice(ret, func(i, j int) bool {
		return ret[i].Created > ret[j].Created
	})
	return
}

func normalizeProtectionAction(action string) string {
	action = strings.TrimSpace(strings.ToLower(action))
	action = strings.ReplaceAll(action, " ", "-")
	action = util.RemoveInvalid(action)
	action = strings.Trim(action, "-")
	if "" == action {
		action = "manual"
	}
	return action
}

func buildProtectionTagName(action string) string {
	return fmt.Sprintf("%s%s-%s", protectSnapshotTagPrefix, normalizeProtectionAction(action), time.Now().Format("20060102-150405"))
}

func isAutoSnapshotTag(tagName string) bool {
	return strings.HasPrefix(tagName, autoHourlySnapshotTagPrefix) || strings.HasPrefix(tagName, autoDailySnapshotTagPrefix)
}

func calcDirSize(dir string) (size int64) {
	if !gulu.File.IsDir(dir) {
		return 0
	}

	_ = filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if nil != err || nil == info || info.IsDir() {
			return nil
		}
		size += info.Size()
		return nil
	})
	return
}
