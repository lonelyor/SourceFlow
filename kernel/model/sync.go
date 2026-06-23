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
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/filesys"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu/cloud"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/html"
)

func SyncDataDownload() {
	defer logging.Recover()
	started := time.Now()

	if !checkSync(false, false, true) {
		recordSyncDiagnostic("download", "download", "skipped", started, true, false, false, "Sync download skipped by current sync policy", nil, nil)
		return
	}

	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)
	if !isProviderOnline(true) { // 这个操作比较耗时，所以要先推送 syncing 事件后再判断网络，这样才能给用户更即时的反馈
		util.BroadcastByType("main", "syncing", 2, Conf.Language(28), nil)
		recordSyncDiagnostic("download", "download", "error", started, true, false, false, Conf.Language(76), nil, nil)
		return
	}

	lockSync()
	defer unlockSync()

	now := util.CurrentTimeMillis()
	Conf.Sync.Synced = now

	err := syncRepoDownload()
	code := 1
	if err != nil {
		code = 2
	}
	util.BroadcastByType("main", "syncing", code, Conf.Sync.Stat, nil)
}

func SyncDataUpload() {
	defer logging.Recover()
	started := time.Now()

	if !checkSync(false, false, true) {
		recordSyncDiagnostic("upload", "upload", "skipped", started, true, false, false, "Sync upload skipped by current sync policy", nil, nil)
		return
	}

	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)
	if !isProviderOnline(true) { // 这个操作比较耗时，所以要先推送 syncing 事件后再判断网络，这样才能给用户更即时的反馈
		util.BroadcastByType("main", "syncing", 2, Conf.Language(28), nil)
		recordSyncDiagnostic("upload", "upload", "error", started, true, false, false, Conf.Language(76), nil, nil)
		return
	}

	lockSync()
	defer unlockSync()

	now := util.CurrentTimeMillis()
	Conf.Sync.Synced = now

	err := syncRepoUpload()
	code := 1
	if err != nil {
		code = 2
	}
	util.BroadcastByType("main", "syncing", code, Conf.Sync.Stat, nil)
	return
}

var (
	syncSameCount    = atomic.Int32{}
	autoSyncErrCount = 0
	fixSyncInterval  = 5 * time.Minute

	syncPlanTimeLock = sync.Mutex{}
	syncPlanTime     = time.Now().Add(fixSyncInterval)

	BootSyncSucc = -1 // -1：未执行，0：执行成功，1：执行失败
	ExitSyncSucc = -1
)

func IsBootSyncReadonlyGuardActive() bool {
	return Conf.Sync.Enabled && 3 != Conf.Sync.Mode && conf.ProviderLocal != Conf.Sync.Provider && 1 == BootSyncSucc
}

func IsBootSyncReadonlyGuardAllowed(path string) bool {
	if "" == path {
		return false
	}
	if strings.HasPrefix(path, "/api/sync/") {
		return true
	}
	switch path {
	case "/api/repo/initRepoKey", "/api/repo/initRepoKeyFromPassphrase", "/api/repo/importRepoKey":
		return true
	default:
		return false
	}
}

type BootSyncGuardInfo struct {
	Reason        string `json:"reason"`
	Summary       string `json:"summary"`
	Detail        string `json:"detail"`
	PrimaryAction string `json:"primaryAction"`
	PrimaryLabel  string `json:"primaryLabel"`
	PrimaryTarget string `json:"primaryTarget"`
}

func bootSyncGuardLang(zh, en string) string {
	if "zh_CN" == Conf.Lang {
		return zh
	}
	return en
}

func trimBootSyncGuardDetail(detail string) string {
	detail = strings.TrimSpace(detail)
	if "" == detail {
		return ""
	}

	syncFailedPrefix := strings.TrimSpace(fmt.Sprintf(Conf.Language(80), ""))
	if "" != syncFailedPrefix && strings.HasPrefix(detail, syncFailedPrefix) {
		detail = strings.TrimSpace(strings.TrimPrefix(detail, syncFailedPrefix))
	}
	if strings.Contains(detail, "<") {
		return ""
	}
	return detail
}

func bootSyncGuardDetailMessage() string {
	detail := trimBootSyncGuardDetail(Conf.Sync.Stat)
	if "" != detail {
		return detail
	}

	for _, record := range GetSyncDiagnostics(5) {
		if "error" != record.Status {
			continue
		}
		if "boot" != record.Trigger && "boot-background" != record.Trigger {
			continue
		}
		detail = trimBootSyncGuardDetail(record.Message)
		if "" != detail {
			return detail
		}
	}
	return ""
}

func bootSyncGuardDetailContains(detail string, candidates ...string) bool {
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if "" != candidate && strings.Contains(detail, candidate) {
			return true
		}
	}
	return false
}

func GetBootSyncGuardInfo() *BootSyncGuardInfo {
	if !IsBootSyncReadonlyGuardActive() {
		return nil
	}

	detail := bootSyncGuardDetailMessage()
	info := &BootSyncGuardInfo{
		Reason:        "unknown",
		Summary:       bootSyncGuardLang("启动时没能安全确认云端状态。你的本地笔记还在，当前先进入只读保护。", "Startup could not safely confirm the cloud state. Your local notes are still here, so editing is temporarily protected."),
		Detail:        detail,
		PrimaryAction: "retry",
		PrimaryLabel:  bootSyncGuardLang("立即同步", "Sync now"),
		PrimaryTarget: "",
	}

	switch {
	case bootSyncGuardDetailContains(detail, Conf.Language(76), Conf.Language(219)):
		info.Reason = "network"
		info.Summary = bootSyncGuardLang("启动时没能连接到云端存储。你的本地笔记还在，当前先进入只读保护。", "Startup could not reach the cloud storage. Your local notes are still here, so editing is temporarily protected.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请检查网络、代理或云存储服务状态，然后再点一次“立即同步”。", "Check the network, proxy, or cloud storage status, then try syncing again.")
		}
	case bootSyncGuardDetailContains(detail, Conf.Language(188), Conf.Language(189)):
		info.Reason = "locked"
		info.Summary = bootSyncGuardLang("云端同步目录暂时被其他设备占用。你的本地笔记还在，当前先进入只读保护。", "The cloud sync directory is temporarily occupied by another device. Your local notes are still here, so editing is temporarily protected.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("通常是另一台设备还在同步，或者上次同步异常中断。稍后再试即可。", "Another device is usually still syncing, or the previous sync exited unexpectedly. Try again later.")
		}
	case bootSyncGuardDetailContains(detail, Conf.Language(26), Conf.Language(135)):
		info.Reason = "repo-key"
		info.Summary = bootSyncGuardLang("数据仓库密钥异常，当前无法安全确认云端数据，所以先进入只读保护。", "The data repo key is not usable for safe cloud verification, so editing is temporarily protected.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请先检查或导入正确的数据仓库密钥。", "Check or import the correct data repo key first.")
		}
		info.PrimaryAction = "settings"
		info.PrimaryLabel = bootSyncGuardLang("打开数据仓库设置", "Open data repo settings")
		info.PrimaryTarget = "about"
	case bootSyncGuardDetailContains(detail, Conf.Language(31)):
		info.Reason = "auth"
		info.Summary = bootSyncGuardLang("云端账号或访问权限异常，当前无法安全确认云端数据，所以先进入只读保护。", "Cloud account or access permission failed, so editing is temporarily protected until cloud data can be verified safely.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请检查登录状态和云端存储凭据。", "Check the sign-in state and cloud storage credentials.")
		}
		info.PrimaryAction = "settings"
		info.PrimaryLabel = bootSyncGuardLang("打开同步设置", "Open sync settings")
		info.PrimaryTarget = "repos"
	case bootSyncGuardDetailContains(detail, Conf.Language(23), Conf.Language(129), Conf.Language(213)):
		info.Reason = "repo"
		info.Summary = bootSyncGuardLang("云端数据或数据仓库校验异常，当前无法安全同步，所以先进入只读保护。", "Cloud data or repo validation failed, so editing is temporarily protected until sync can be made safe again.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请先检查数据仓库和云端目录状态，再决定是否需要重置或重新恢复。", "Check the data repo and cloud directory first, then decide whether reset or recovery is needed.")
		}
		info.PrimaryAction = "settings"
		info.PrimaryLabel = bootSyncGuardLang("打开数据仓库设置", "Open data repo settings")
		info.PrimaryTarget = "about"
	case bootSyncGuardDetailContains(detail, Conf.Language(249), Conf.Language(250), Conf.Language(33)):
		info.Reason = "config"
		info.Summary = bootSyncGuardLang("同步配置或权限异常，当前无法安全确认云端数据，所以先进入只读保护。", "Sync configuration or permission failed, so editing is temporarily protected until cloud data can be verified safely.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请逐项检查同步配置、存储权限以及本地读写权限。", "Check the sync settings, storage permissions, and local read/write permissions.")
		}
		info.PrimaryAction = "settings"
		info.PrimaryLabel = bootSyncGuardLang("打开同步设置", "Open sync settings")
		info.PrimaryTarget = "repos"
	case bootSyncGuardDetailContains(detail, Conf.Language(195)):
		info.Reason = "time"
		info.Summary = bootSyncGuardLang("系统时间异常，当前无法安全确认云端数据，所以先进入只读保护。", "System time is incorrect, so editing is temporarily protected until cloud data can be verified safely.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请校准系统时间后，再点一次“立即同步”。", "Correct the system time, then try syncing again.")
		}
	case bootSyncGuardDetailContains(detail, Conf.Language(212)):
		info.Reason = "version"
		info.Summary = bootSyncGuardLang("当前版本不适合继续同步，当前先进入只读保护。", "This version should not continue syncing, so editing is temporarily protected.")
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("请先升级到较新的版本后，再继续处理同步。", "Upgrade to a newer version before continuing with sync.")
		}
		info.PrimaryAction = "settings"
		info.PrimaryLabel = bootSyncGuardLang("打开关于", "Open About")
		info.PrimaryTarget = "about"
	default:
		if "" == info.Detail {
			info.Detail = bootSyncGuardLang("你可以先查看数据历史，或者处理完问题后再点一次“立即同步”。", "You can review data history first, then try syncing again after the issue is resolved.")
		}
	}
	return info
}

type providerOnlineCacheEntry struct {
	provider      int
	checkURL      string
	skipTLSVerify bool
	online        bool
	errMsg        string
	cachedAt      time.Time
}

var (
	providerOnlineCacheTTL = 5 * time.Second
	providerOnlineCache    struct {
		lock  sync.Mutex
		entry providerOnlineCacheEntry
	}
)

func SyncDataJob() {
	syncPlanTimeLock.Lock()
	if time.Now().Before(syncPlanTime) {
		syncPlanTimeLock.Unlock()
		return
	}
	syncPlanTimeLock.Unlock()

	SyncData(false)
}

func BootSyncData() {
	defer logging.Recover()
	started := time.Now()

	if Conf.Sync.Perception {
		connectSyncWebSocket()
	}

	if !checkSync(true, false, false) {
		recordSyncDiagnostic("boot", "download", "skipped", started, false, true, false, "Boot sync skipped by current sync policy", nil, nil)
		return
	}

	if conf.ProviderLocal == Conf.Sync.Provider {
		// Local File System is used as a backup target rather than a merge-first sync target.
		// Do not block startup or show boot sync failure prompts for local backups.
		BootSyncSucc = 0
		planSyncAfter(time.Second)
		recordSyncDiagnostic("boot", "download", "success", started, false, true, false, "Local snapshot backup does not require boot merge", nil, nil)
		return
	}

	if !isProviderOnline(false) {
		BootSyncSucc = 1
		util.PushErrMsg(Conf.Language(76), 7000)
		recordSyncDiagnostic("boot", "download", "error", started, false, true, false, Conf.Language(76), nil, nil)
		return
	}

	lockSync()
	defer unlockSync()

	util.IncBootProgress(3, "Syncing data from the cloud...")
	BootSyncSucc = 0
	logging.LogInfof("sync before boot")

	now := util.CurrentTimeMillis()
	Conf.Sync.Synced = now
	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)
	err := bootSyncRepo()
	code := 1
	if err != nil {
		code = 2
		recordSyncDiagnostic("boot", "download", "error", started, false, true, false, err.Error(), nil, nil)
	} else {
		recordSyncDiagnostic("boot", "download", "success", started, false, true, false, "Boot sync completed, background merge will continue if remote changes were fetched", nil, nil)
	}
	util.BroadcastByType("main", "syncing", code, Conf.Sync.Stat, nil)
	return
}

func SyncData(byHand bool) {
	trigger := "auto"
	if byHand {
		trigger = "manual"
	}
	syncData(false, byHand, trigger)
}

func lockSync() {
	syncLock.Lock()
	isSyncing.Store(true)
}

func unlockSync() {
	isSyncing.Store(false)
	syncLock.Unlock()
}

func syncData(exit, byHand bool, trigger string) {
	defer logging.Recover()
	started := time.Now()

	if !checkSync(false, exit, byHand) {
		recordSyncDiagnostic(trigger, "bidirectional", "skipped", started, byHand, false, exit, "Bidirectional sync skipped by current sync policy", nil, nil)
		return
	}

	lockSync()
	defer unlockSync()

	util.BroadcastByType("main", "syncing", 0, Conf.Language(81), nil)
	if !exit && !isProviderOnline(byHand) { // 这个操作比较耗时，所以要先推送 syncing 事件后再判断网络，这样才能给用户更即时的反馈
		util.BroadcastByType("main", "syncing", 2, Conf.Language(28), nil)
		recordSyncDiagnostic(trigger, "bidirectional", "error", started, byHand, false, exit, Conf.Language(76), nil, nil)
		return
	}

	if exit {
		ExitSyncSucc = 0
		logging.LogInfof("sync before exit")
		msgId := util.PushMsg(Conf.Language(81), 1000*60*15)
		defer func() {
			util.PushClearMsg(msgId)
		}()
	}

	now := util.CurrentTimeMillis()
	Conf.Sync.Synced = now

	dataChanged, err := syncRepo(exit, byHand, trigger)
	code := 1
	if err != nil {
		code = 2
	}
	util.BroadcastByType("main", "syncing", code, Conf.Sync.Stat, nil)

	if Conf.Sync.Perception {
		connectSyncWebSocket()
	}
	if dataChanged && Conf.Sync.Perception && "perception" != trigger {
		go probeSyncPerception()
	}
	return
}

func checkSync(boot, exit, byHand bool) bool {
	if 2 == Conf.Sync.Mode && !boot && !exit && !byHand { // 手动模式下只有启动和退出进行同步
		return false
	}

	if 3 == Conf.Sync.Mode && !byHand { // 完全手动模式下只有手动进行同步
		return false
	}

	if !Conf.Sync.Enabled {
		if byHand {
			util.PushMsg(Conf.Language(124), 5000)
		}
		return false
	}

	if !cloud.IsValidCloudDirName(Conf.Sync.CloudName) {
		if byHand {
			util.PushMsg(Conf.Language(123), 5000)
		}
		return false
	}

	if 7 < autoSyncErrCount && !byHand {
		logging.LogErrorf("failed to auto-sync too many times, delay auto-sync 64 minutes")
		util.PushErrMsg(Conf.Language(125), 1000*60*60)
		planSyncAfter(64 * time.Minute)
		return false
	}
	return true
}

// incReindex 增量重建索引。
func incReindex(upserts, removes []string) (upsertRootIDs, removeRootIDs []string) {
	upsertRootIDs = []string{}
	removeRootIDs = []string{}

	util.IncBootProgress(3, "Sync reindexing...")
	removeRootIDs = removeIndexes(removes) // 先执行 remove，否则移动文档时 upsert 会被忽略，导致未被索引
	upsertRootIDs = upsertIndexes(upserts)

	if 1 > len(removeRootIDs) {
		removeRootIDs = []string{}
	}
	if 1 > len(upsertRootIDs) {
		upsertRootIDs = []string{}
	}
	return
}

func removeIndexes(removeFilePaths []string) (removeRootIDs []string) {
	bootProgressPart := int32(10 / float64(len(removeFilePaths)))
	for _, removeFile := range removeFilePaths {
		if !strings.HasSuffix(removeFile, ".sf") {
			continue
		}

		rootID := util.GetTreeID(removeFile)
		removeRootIDs = append(removeRootIDs, rootID)

		msg := fmt.Sprintf(Conf.Language(39), rootID)
		util.IncBootProgress(bootProgressPart, msg)
		util.PushStatusBar(msg)

		cache.RemoveTreeData(rootID)
		sql.RemoveTreeQueue(rootID)
		bts := treenode.GetBlockTreesByRootID(rootID)
		for _, b := range bts {
			cache.RemoveBlockIAL(b.ID)
		}
		if block := treenode.GetBlockTree(rootID); nil != block {
			cache.RemoveDocIAL(block.Path)
		}
		treenode.RemoveBlockTreesByRootID(rootID)
	}

	if 1 > len(removeRootIDs) {
		removeRootIDs = []string{}
	}
	return
}

func upsertIndexes(upsertFilePaths []string) (upsertRootIDs []string) {
	luteEngine := util.NewLute()
	bootProgressPart := int32(10 / float64(len(upsertFilePaths)))
	for _, upsertFile := range upsertFilePaths {
		if !strings.HasSuffix(upsertFile, ".sf") {
			continue
		}

		upsertFile = filepath.ToSlash(upsertFile)
		upsertFile = strings.TrimPrefix(upsertFile, "/")

		box, _, found := strings.Cut(upsertFile, "/")
		if !found {
			// .sf 直接出现在 data 文件夹下，没有出现在笔记本文件夹下的情况
			continue
		}

		p := strings.TrimPrefix(upsertFile, box)
		msg := fmt.Sprintf(Conf.Language(40), util.GetTreeID(p))
		util.IncBootProgress(bootProgressPart, msg)
		util.PushStatusBar(msg)

		rootID := util.GetTreeID(p)
		cache.RemoveTreeData(rootID)
		tree, err0 := filesys.LoadTree(box, p, luteEngine)
		if nil != err0 {
			continue
		}
		treenode.UpsertBlockTree(tree)
		sql.UpsertTreeQueue(tree)

		bts := treenode.GetBlockTreesByRootID(rootID)
		for _, b := range bts {
			cache.RemoveBlockIAL(b.ID)
		}
		cache.RemoveDocIAL(tree.Path)

		upsertRootIDs = append(upsertRootIDs, rootID)
	}

	if 1 > len(upsertRootIDs) {
		upsertRootIDs = []string{}
	}
	return
}

func SetCloudSyncDir(name string) {
	if !cloud.IsValidCloudDirName(name) {
		util.PushErrMsg(Conf.Language(37), 5000)
		return
	}

	if Conf.Sync.CloudName == name {
		return
	}

	Conf.Sync.CloudName = name
	Conf.Save()
	resetSyncPerceptionState()
	connectSyncWebSocket()
}

func SetSyncGenerateConflictDoc(b bool) {
	Conf.Sync.GenerateConflictDoc = b
	Conf.Save()
}

func SetSyncEnable(b bool) {
	if b {
		if !cloud.IsValidCloudDirName(Conf.Sync.CloudName) {
			Conf.Sync.CloudName = "main"
		}
		planSyncAfter(time.Second)
	} else {
		BootSyncSucc = 0
	}
	Conf.Sync.Enabled = b
	Conf.Save()
	if b {
		connectSyncWebSocket()
		return
	}
	closeSyncWebSocket()
	resetSyncPerceptionState()
}

func SetSyncInterval(interval int) {
	if 30 > interval {
		interval = 30
	}
	if 43200 < interval {
		interval = 43200
	}

	Conf.Sync.Interval = interval
	Conf.Save()
	planSyncAfter(time.Duration(interval) * time.Second)
}

func SetSyncPerception(enabled bool) {
	Conf.Sync.Perception = enabled
	Conf.Save()
	if enabled {
		connectSyncWebSocket()
		return
	}
	closeSyncWebSocket()
	resetSyncPerceptionState()
}

func SetSyncMode(mode int) {
	Conf.Sync.Mode = mode
	if 3 == mode {
		BootSyncSucc = 0
	}
	Conf.Save()
	if Conf.Sync.Perception {
		connectSyncWebSocket()
	}
}

func SetSyncProvider(provider int) (err error) {
	switch provider {
	case conf.ProviderS3, conf.ProviderWebDAV, conf.ProviderLocal:
	default:
		err = errors.New("unsupported sync provider, use S3, WebDAV, or Local File System")
		return
	}
	Conf.Sync.Provider = provider
	Conf.Sync.Mode = 1
	if conf.ProviderLocal == provider {
		BootSyncSucc = 0
	}
	Conf.Save()
	resetSyncPerceptionState()
	connectSyncWebSocket()
	return
}

func SetSyncProviderS3(s3 *conf.S3) (err error) {
	s3.Endpoint = strings.TrimSpace(s3.Endpoint)
	s3.Endpoint = util.NormalizeEndpoint(s3.Endpoint)
	s3.AccessKey = strings.TrimSpace(s3.AccessKey)
	s3.SecretKey = strings.TrimSpace(s3.SecretKey)
	s3.Bucket = strings.TrimSpace(s3.Bucket)
	s3.Region = strings.TrimSpace(s3.Region)
	s3.Timeout = util.NormalizeTimeout(s3.Timeout)
	s3.ConcurrentReqs = util.NormalizeConcurrentReqs(s3.ConcurrentReqs, conf.ProviderS3)

	if !cloud.IsValidCloudDirName(s3.Bucket) {
		util.PushErrMsg(Conf.Language(37), 5000)
		return
	}

	Conf.Sync.S3 = s3
	Conf.Save()
	resetSyncPerceptionState()
	connectSyncWebSocket()
	return
}

func SetSyncProviderWebDAV(webdav *conf.WebDAV) (err error) {
	webdav.Endpoint = strings.TrimSpace(webdav.Endpoint)
	webdav.Endpoint = util.NormalizeEndpoint(webdav.Endpoint)

	// 不支持配置坚果云 WebDAV 进行同步 https://github.com/lonelyor/SourceFlow/issues/7657
	if strings.Contains(strings.ToLower(webdav.Endpoint), "dav.jianguoyun.com") {
		err = errors.New(Conf.Language(194))
		return
	}

	webdav.Username = strings.TrimSpace(webdav.Username)
	webdav.Password = strings.TrimSpace(webdav.Password)
	webdav.Timeout = util.NormalizeTimeout(webdav.Timeout)
	webdav.ConcurrentReqs = util.NormalizeConcurrentReqs(webdav.ConcurrentReqs, conf.ProviderWebDAV)

	Conf.Sync.WebDAV = webdav
	Conf.Save()
	resetSyncPerceptionState()
	connectSyncWebSocket()
	return
}

func serializePortableLocalEndpoint(endpoint string) string {
	endpoint = strings.TrimSpace(endpoint)
	if "" == endpoint {
		return ""
	}

	resolved := util.ResolvePortablePath(util.NormalizeLocalPath(endpoint))
	if "" == resolved {
		return ""
	}

	absPath, err := filepath.Abs(resolved)
	if nil == err {
		resolved = absPath
	}

	if util.IsPortableMode() && util.IsSubPath(util.GetPortableRootDir(), resolved) {
		if serialized := util.SerializePortablePath(resolved); "" != serialized {
			return serialized
		}
	}
	return filepath.Clean(resolved)
}

func prepareSyncProviderLocal(local *conf.Local, validateExist bool) (err error) {
	local.Endpoint = strings.TrimSpace(local.Endpoint)
	local.Endpoint = util.ResolvePortablePath(util.NormalizeLocalPath(local.Endpoint))
	if "" == local.Endpoint {
		err = fmt.Errorf(Conf.Language(77), "empty endpoint")
		return
	}

	absPath, err := filepath.Abs(local.Endpoint)
	if nil != err {
		msg := fmt.Sprintf("get endpoint [%s] abs path failed: %s", local.Endpoint, err)
		logging.LogErrorf("%s", msg)
		err = fmt.Errorf(Conf.Language(77), msg)
		return
	}
	if validateExist && !gulu.File.IsExist(absPath) {
		msg := fmt.Sprintf("endpoint [%s] not exist", local.Endpoint)
		logging.LogErrorf("%s", msg)
		err = fmt.Errorf(Conf.Language(77), msg)
		return
	}
	if util.IsAbsPathInWorkspace(absPath) || filepath.Clean(absPath) == filepath.Clean(util.WorkspaceDir) {
		msg := fmt.Sprintf("endpoint [%s] is in workspace", local.Endpoint)
		logging.LogErrorf("%s", msg)
		err = fmt.Errorf(Conf.Language(77), msg)
		return
	}

	if util.IsSubPath(absPath, util.WorkspaceDir) {
		msg := fmt.Sprintf("endpoint [%s] is parent of workspace", local.Endpoint)
		logging.LogErrorf("%s", msg)
		err = fmt.Errorf(Conf.Language(77), msg)
		return
	}

	local.Endpoint = absPath
	local.Timeout = util.NormalizeTimeout(local.Timeout)
	local.ConcurrentReqs = util.NormalizeConcurrentReqs(local.ConcurrentReqs, conf.ProviderLocal)
	return
}

func SetSyncProviderLocal(local *conf.Local) (err error) {
	if err = prepareSyncProviderLocal(local, true); nil != err {
		return
	}

	Conf.Sync.Local = local
	BootSyncSucc = 0
	Conf.Save()
	resetSyncPerceptionState()
	connectSyncWebSocket()
	return
}

var (
	syncLock  = sync.Mutex{}
	isSyncing = atomic.Bool{}
)

func CreateCloudSyncDir(name string) (err error) {
	switch Conf.Sync.Provider {
	case conf.ProviderLocal:
		break
	default:
		err = errors.New(Conf.Language(131))
		return
	}

	name = strings.TrimSpace(name)
	name = util.RemoveInvalid(name)
	if !cloud.IsValidCloudDirName(name) {
		return errors.New(Conf.Language(37))
	}

	repo, err := newRepository()
	if err != nil {
		return
	}

	err = repo.CreateCloudRepo(name)
	if err != nil {
		err = errors.New(formatRepoErrorMsg(err))
		return
	}
	return
}

func RemoveCloudSyncDir(name string) (err error) {
	switch Conf.Sync.Provider {
	case conf.ProviderLocal:
		break
	default:
		err = errors.New(Conf.Language(131))
		return
	}

	msgId := util.PushMsg(Conf.Language(116), 15000)

	if "" == name {
		return
	}

	repo, err := newRepository()
	if err != nil {
		return
	}

	err = repo.RemoveCloudRepo(name)
	if err != nil {
		err = errors.New(formatRepoErrorMsg(err))
		return
	}

	util.PushClearMsg(msgId)
	time.Sleep(500 * time.Millisecond)
	if Conf.Sync.CloudName == name {
		Conf.Sync.CloudName = "main"
		Conf.Save()
		util.PushMsg(Conf.Language(155), 5000)
	}
	return
}

func ListCloudSyncDir() (syncDirs []*Sync, hSize string, err error) {
	syncDirs = []*Sync{}
	var dirs []*cloud.Repo
	var size int64

	repo, err := newRepository()
	if err != nil {
		return
	}

	dirs, size, err = repo.GetCloudRepos()
	if err != nil {
		err = errors.New(formatRepoErrorMsg(err))
		return
	}
	if 1 > len(dirs) {
		dirs = append(dirs, &cloud.Repo{
			Name:    "main",
			Size:    0,
			Updated: time.Now().Format("2006-01-02 15:04:05"),
		})
	}

	for _, d := range dirs {
		dirSize := d.Size
		sync := &Sync{
			Size:      dirSize,
			HSize:     humanize.BytesCustomCeil(uint64(dirSize), 2),
			Updated:   d.Updated,
			CloudName: d.Name,
		}
		syncDirs = append(syncDirs, sync)
	}
	hSize = humanize.BytesCustomCeil(uint64(size), 2)
	if conf.ProviderS3 == Conf.Sync.Provider {
		Conf.Sync.CloudName = syncDirs[0].CloudName
		Conf.Save()
	}
	return
}

func formatRepoErrorMsg(err error) string {
	msg := html.EscapeString(err.Error())
	if errors.Is(err, cloud.ErrCloudAuthFailed) {
		msg = Conf.Language(31)
	} else if errors.Is(err, cloud.ErrCloudObjectNotFound) {
		msg = Conf.Language(129)
	} else if errors.Is(err, dejavu.ErrLockCloudFailed) {
		msg = Conf.Language(188)
	} else if errors.Is(err, dejavu.ErrCloudLocked) {
		msg = Conf.Language(189)
	} else if errors.Is(err, dejavu.ErrRepoFatal) {
		msg = Conf.Language(23)
	} else if errors.Is(err, cloud.ErrSystemTimeIncorrect) {
		msg = Conf.Language(195)
	} else if errors.Is(err, cloud.ErrDeprecatedVersion) {
		msg = Conf.Language(212)
	} else if errors.Is(err, cloud.ErrCloudCheckFailed) {
		msg = Conf.Language(213)
	} else if errors.Is(err, cloud.ErrCloudServiceUnavailable) {
		msg = Conf.language(219)
	} else if errors.Is(err, cloud.ErrCloudForbidden) {
		msg = Conf.language(249)
	} else if errors.Is(err, cloud.ErrCloudTooManyRequests) {
		msg = Conf.language(250)
	} else if errors.Is(err, cloud.ErrDecryptFailed) {
		msg = Conf.Language(135)
	} else {
		logging.LogErrorf("sync failed caused by network: %s", msg)
		msgLowerCase := strings.ToLower(msg)
		if strings.Contains(msgLowerCase, "permission denied") || strings.Contains(msg, "access is denied") {
			msg = Conf.Language(33)
		} else if strings.Contains(msgLowerCase, "region was not a valid") {
			msg = Conf.language(254)
		} else if strings.Contains(msgLowerCase, "device or resource busy") || strings.Contains(msg, "is being used by another") {
			msg = fmt.Sprintf(Conf.Language(85), err)
		} else if strings.Contains(msgLowerCase, "cipher: message authentication failed") {
			msg = Conf.Language(135)
		} else if strings.Contains(msgLowerCase, "no such host") || strings.Contains(msgLowerCase, "connection failed") || strings.Contains(msgLowerCase, "hostname resolution") || strings.Contains(msgLowerCase, "No address associated with hostname") {
			msg = Conf.Language(24)
		} else if strings.Contains(msgLowerCase, "net/http: request canceled while waiting for connection") || strings.Contains(msgLowerCase, "exceeded while awaiting") || strings.Contains(msgLowerCase, "context deadline exceeded") || strings.Contains(msgLowerCase, "timeout") || strings.Contains(msgLowerCase, "context cancellation while reading body") {
			msg = Conf.Language(24)
		} else if strings.Contains(msgLowerCase, "connection") || strings.Contains(msgLowerCase, "refused") || strings.Contains(msgLowerCase, "socket") || strings.Contains(msgLowerCase, "eof") || strings.Contains(msgLowerCase, "closed") || strings.Contains(msgLowerCase, "network") {
			msg = Conf.Language(28)
		}
	}
	msg += " (Provider: " + conf.ProviderToStr(Conf.Sync.Provider) + ")"
	return msg
}

func getSyncIgnoreLines() (ret []string) {
	ignore := util.HiddenDataPath(util.DataDir, "syncignore")
	err := os.MkdirAll(filepath.Dir(ignore), 0755)
	if err != nil {
		return
	}
	if !gulu.File.IsExist(ignore) {
		if err = gulu.File.WriteFileSafer(ignore, nil, 0644); err != nil {
			logging.LogErrorf("create syncignore [%s] failed: %s", ignore, err)
			return
		}
	}
	data, err := os.ReadFile(ignore)
	if err != nil {
		logging.LogErrorf("read syncignore [%s] failed: %s", ignore, err)
		return
	}
	dataStr := string(data)
	dataStr = strings.ReplaceAll(dataStr, "\r\n", "\n")
	ret = strings.Split(dataStr, "\n")

	// 忽略用户指南
	ret = append(ret, "20210808180117-6v0mkxr/**/*")
	ret = append(ret, "20210808180117-czj9bvb/**/*")
	ret = append(ret, "20211226090932-5lcq56f/**/*")
	ret = append(ret, "20240530133126-axarxgx/**/*")
	// 忽略用户指南的数据库 JSON 文件
	for _, avName := range getAllUserGuideAVJSONFiles() {
		ret = append(ret, "/storage/av/"+avName)
	}

	ret = gulu.Str.RemoveDuplicatedElem(ret)
	return
}

func IncSync() {
	syncSameCount.Store(0)
	planSyncAfter(time.Duration(Conf.Sync.Interval) * time.Second)
}

func planSyncAfter(d time.Duration) {
	syncPlanTimeLock.Lock()
	syncPlanTime = time.Now().Add(d)
	syncPlanTimeLock.Unlock()
}

func localProviderUnavailableMsg(endpoint string) string {
	if "zh_CN" == Conf.Lang {
		return fmt.Sprintf("本地备份目录不可用，请重新选择目录 [%s]", endpoint)
	}
	return fmt.Sprintf("Local backup directory is unavailable, please choose it again [%s]", endpoint)
}

func isLocalProviderOnline() (ret bool, msg string) {
	if nil == Conf.Sync.Local {
		msg = localProviderUnavailableMsg("empty endpoint")
		return
	}

	endpoint := strings.TrimSpace(Conf.Sync.Local.Endpoint)
	if "" == endpoint {
		msg = localProviderUnavailableMsg("empty endpoint")
		return
	}

	endpoint = util.ResolvePortablePath(util.NormalizeLocalPath(endpoint))
	absPath, err := filepath.Abs(endpoint)
	if nil != err {
		msg = localProviderUnavailableMsg(endpoint)
		return
	}

	info, err := os.Stat(absPath)
	if nil != err || !info.IsDir() {
		msg = localProviderUnavailableMsg(absPath)
		return
	}

	ret = true
	return
}

func isProviderOnline(byHand bool) (ret bool) {
	var checkURL string
	var errMsg string
	skipTlsVerify := false
	switch Conf.Sync.Provider {
	case conf.ProviderS3:
		checkURL = Conf.Sync.S3.Endpoint
		skipTlsVerify = Conf.Sync.S3.SkipTlsVerify
	case conf.ProviderWebDAV:
		checkURL = Conf.Sync.WebDAV.Endpoint
		skipTlsVerify = Conf.Sync.WebDAV.SkipTlsVerify
	case conf.ProviderLocal:
		ret, errMsg = isLocalProviderOnline()
	default:
		logging.LogWarnf("unknown provider: %d", Conf.Sync.Provider)
		return false
	}

	if !byHand {
		providerOnlineCache.lock.Lock()
		cached := providerOnlineCache.entry
		providerOnlineCache.lock.Unlock()
		if cached.provider == Conf.Sync.Provider &&
			cached.checkURL == checkURL &&
			cached.skipTLSVerify == skipTlsVerify &&
			time.Since(cached.cachedAt) <= providerOnlineCacheTTL {
			ret = cached.online
			errMsg = cached.errMsg
			goto handled
		}
	}

	if conf.ProviderLocal != Conf.Sync.Provider {
		ret = util.IsOnline(checkURL, skipTlsVerify, 7000)
	}

	if !byHand {
		providerOnlineCache.lock.Lock()
		providerOnlineCache.entry = providerOnlineCacheEntry{
			provider:      Conf.Sync.Provider,
			checkURL:      checkURL,
			skipTLSVerify: skipTlsVerify,
			online:        ret,
			errMsg:        errMsg,
			cachedAt:      time.Now(),
		}
		providerOnlineCache.lock.Unlock()
	}

handled:
	if !ret {
		if 1 > autoSyncErrCount || byHand {
			if "" == errMsg {
				errMsg = Conf.Language(76)
			}
			util.PushErrMsg(errMsg+" (Provider: "+conf.ProviderToStr(Conf.Sync.Provider)+")", 5000)
		}
		if !byHand {
			planSyncAfter(fixSyncInterval)
			autoSyncErrCount++
		}
	}
	return
}

var (
	webSocketConn     *websocket.Conn
	webSocketConnLock = sync.Mutex{}
)

type OnlineKernel struct {
	ID       string `json:"id"`
	Hostname string `json:"hostname"`
	OS       string `json:"os"`
	Ver      string `json:"ver"`
}

var (
	onlineKernels     []*OnlineKernel
	onlineKernelsLock = sync.Mutex{}
)

func GetOnlineKernels() (ret []*OnlineKernel) {
	ret = []*OnlineKernel{}
	onlineKernelsLock.Lock()
	tmp := onlineKernels
	onlineKernelsLock.Unlock()
	for _, kernel := range tmp {
		if kernel.ID == KernelID {
			continue
		}

		ret = append(ret, kernel)
	}
	return
}

var closedSyncWebSocket = atomic.Bool{}

func closeSyncWebSocket() {
	defer logging.Recover()

	stopSyncPerceptionLoop()

	webSocketConnLock.Lock()
	defer webSocketConnLock.Unlock()

	if nil != webSocketConn {
		webSocketConn.Close()
		webSocketConn = nil
		closedSyncWebSocket.Store(true)
	}

	logging.LogInfof("sync websocket closed")
}

func connectSyncWebSocket() {
	startSyncPerceptionLoop()
}

var KernelID = gulu.Rand.String(7)

func dialSyncWebSocket() (c *websocket.Conn, err error) {
	err = errors.New("sync perception is disabled")
	return
}
