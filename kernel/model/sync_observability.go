package model

import (
	"errors"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu/cloud"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

type SyncDiagnosticRecord struct {
	ID                string `json:"id"`
	Trigger           string `json:"trigger"`
	Direction         string `json:"direction"`
	Status            string `json:"status"`
	Provider          string `json:"provider"`
	ByHand            bool   `json:"byHand"`
	Boot              bool   `json:"boot"`
	Exit              bool   `json:"exit"`
	StartedAt         int64  `json:"startedAt"`
	FinishedAt        int64  `json:"finishedAt"`
	DurationMs        int64  `json:"durationMs"`
	Message           string `json:"message"`
	Conflicts         int    `json:"conflicts"`
	Upserts           int    `json:"upserts"`
	Removes           int    `json:"removes"`
	UploadFileCount   int    `json:"uploadFileCount"`
	DownloadFileCount int    `json:"downloadFileCount"`
	UploadBytes       int64  `json:"uploadBytes"`
	DownloadBytes     int64  `json:"downloadBytes"`
	UploadBytesText   string `json:"uploadBytesText"`
	DownloadBytesText string `json:"downloadBytesText"`
}

type SyncPerceptionStatus struct {
	Enabled          bool   `json:"enabled"`
	Running          bool   `json:"running"`
	PollIntervalSec  int    `json:"pollIntervalSec"`
	LastCheckedAt    int64  `json:"lastCheckedAt"`
	LastRemoteChange int64  `json:"lastRemoteChangeAt"`
	LastTriggeredAt  int64  `json:"lastTriggeredAt"`
	LastRemoteLatest string `json:"lastRemoteLatestID"`
	LastError        string `json:"lastError"`
	LastTrigger      string `json:"lastTrigger"`
}

const (
	maxSyncDiagnosticRecords = 20
	syncPerceptionPollIntvl  = 20 * time.Second
	syncPerceptionWarmup     = 6 * time.Second
)

var syncDiagnosticsState = struct {
	lock    sync.Mutex
	records []*SyncDiagnosticRecord
}{}

type syncPerceptionRuntime struct {
	lock             sync.Mutex
	stop             chan struct{}
	running          atomic.Bool
	lastCheckedAt    int64
	lastRemoteChange int64
	lastTriggeredAt  int64
	lastRemoteLatest string
	lastError        string
	lastTrigger      string
}

var perceptionRuntime = &syncPerceptionRuntime{}

func recordSyncDiagnostic(trigger, direction, status string, started time.Time, byHand, boot, exit bool, message string, mergeResult *dejavu.MergeResult, trafficStat *dejavu.TrafficStat) {
	if started.IsZero() {
		started = time.Now()
	}

	finished := time.Now()
	record := &SyncDiagnosticRecord{
		ID:         gulu.Rand.String(7),
		Trigger:    trigger,
		Direction:  direction,
		Status:     status,
		Provider:   conf.ProviderToStr(Conf.Sync.Provider),
		ByHand:     byHand,
		Boot:       boot,
		Exit:       exit,
		StartedAt:  started.UnixMilli(),
		FinishedAt: finished.UnixMilli(),
		DurationMs: finished.Sub(started).Milliseconds(),
		Message:    strings.TrimSpace(message),
	}
	if mergeResult != nil {
		record.Conflicts = len(mergeResult.Conflicts)
		record.Upserts = len(mergeResult.Upserts)
		record.Removes = len(mergeResult.Removes)
	}
	if trafficStat != nil {
		record.UploadFileCount = trafficStat.UploadFileCount
		record.DownloadFileCount = trafficStat.DownloadFileCount
		record.UploadBytes = trafficStat.UploadBytes
		record.DownloadBytes = trafficStat.DownloadBytes
		record.UploadBytesText = humanize.BytesCustomCeil(uint64(maxSyncDiagnosticBytes(trafficStat.UploadBytes)), 2)
		record.DownloadBytesText = humanize.BytesCustomCeil(uint64(maxSyncDiagnosticBytes(trafficStat.DownloadBytes)), 2)
	}

	syncDiagnosticsState.lock.Lock()
	defer syncDiagnosticsState.lock.Unlock()

	syncDiagnosticsState.records = append([]*SyncDiagnosticRecord{record}, syncDiagnosticsState.records...)
	if len(syncDiagnosticsState.records) > maxSyncDiagnosticRecords {
		syncDiagnosticsState.records = syncDiagnosticsState.records[:maxSyncDiagnosticRecords]
	}
}

func GetSyncDiagnostics(limit int) (ret []*SyncDiagnosticRecord) {
	if limit <= 0 || limit > maxSyncDiagnosticRecords {
		limit = maxSyncDiagnosticRecords
	}

	syncDiagnosticsState.lock.Lock()
	defer syncDiagnosticsState.lock.Unlock()

	ret = make([]*SyncDiagnosticRecord, 0, limit)
	for i, record := range syncDiagnosticsState.records {
		if i >= limit {
			break
		}
		cloned := *record
		ret = append(ret, &cloned)
	}
	return
}

func GetSyncPerceptionStatus() *SyncPerceptionStatus {
	perceptionRuntime.lock.Lock()
	defer perceptionRuntime.lock.Unlock()
	return &SyncPerceptionStatus{
		Enabled:          Conf.Sync.Perception,
		Running:          perceptionRuntime.running.Load(),
		PollIntervalSec:  int(syncPerceptionPollIntvl / time.Second),
		LastCheckedAt:    perceptionRuntime.lastCheckedAt,
		LastRemoteChange: perceptionRuntime.lastRemoteChange,
		LastTriggeredAt:  perceptionRuntime.lastTriggeredAt,
		LastRemoteLatest: perceptionRuntime.lastRemoteLatest,
		LastError:        perceptionRuntime.lastError,
		LastTrigger:      perceptionRuntime.lastTrigger,
	}
}

func resetSyncPerceptionState() {
	perceptionRuntime.lock.Lock()
	defer perceptionRuntime.lock.Unlock()
	perceptionRuntime.lastCheckedAt = 0
	perceptionRuntime.lastRemoteChange = 0
	perceptionRuntime.lastTriggeredAt = 0
	perceptionRuntime.lastRemoteLatest = ""
	perceptionRuntime.lastError = ""
	perceptionRuntime.lastTrigger = ""
}

func updateSyncPerceptionObservation(latestID, errMsg string) {
	perceptionRuntime.lock.Lock()
	defer perceptionRuntime.lock.Unlock()
	perceptionRuntime.lastCheckedAt = util.CurrentTimeMillis()
	perceptionRuntime.lastRemoteLatest = latestID
	perceptionRuntime.lastError = strings.TrimSpace(errMsg)
	if "" == errMsg {
		perceptionRuntime.lastError = ""
	}
}

func markSyncPerceptionRemoteChange(latestID, trigger string) {
	perceptionRuntime.lock.Lock()
	defer perceptionRuntime.lock.Unlock()
	now := util.CurrentTimeMillis()
	perceptionRuntime.lastCheckedAt = now
	perceptionRuntime.lastRemoteChange = now
	perceptionRuntime.lastTriggeredAt = now
	perceptionRuntime.lastRemoteLatest = latestID
	perceptionRuntime.lastError = ""
	perceptionRuntime.lastTrigger = trigger
}

func updateSyncPerceptionBaseline(repo *dejavu.Repo) {
	if !Conf.Sync.Perception || repo == nil {
		return
	}

	cloudLatest, err := repo.GetCloudLatest(nil)
	if err != nil && !errors.Is(err, cloud.ErrCloudObjectNotFound) {
		updateSyncPerceptionObservation("", err.Error())
		return
	}

	latestID := ""
	if cloudLatest != nil {
		latestID = cloudLatest.ID
	}
	updateSyncPerceptionObservation(latestID, "")
}

func probeSyncPerception() {
	if !Conf.Sync.Perception || !Conf.Sync.Enabled || 1 != Conf.Sync.Mode || isSyncing.Load() || isBootSyncing.Load() {
		return
	}

	repo, err := newRepository()
	if err != nil {
		updateSyncPerceptionObservation("", err.Error())
		return
	}

	cloudLatest, err := repo.GetCloudLatest(nil)
	if err != nil && !errors.Is(err, cloud.ErrCloudObjectNotFound) {
		updateSyncPerceptionObservation("", err.Error())
		return
	}

	latestID := ""
	if cloudLatest != nil {
		latestID = cloudLatest.ID
	}

	perceptionRuntime.lock.Lock()
	previousID := perceptionRuntime.lastRemoteLatest
	perceptionRuntime.lastCheckedAt = util.CurrentTimeMillis()
	perceptionRuntime.lastError = ""
	if "" == previousID {
		perceptionRuntime.lastRemoteLatest = latestID
		perceptionRuntime.lock.Unlock()
		return
	}
	if previousID == latestID {
		perceptionRuntime.lastRemoteLatest = latestID
		perceptionRuntime.lock.Unlock()
		return
	}
	perceptionRuntime.lock.Unlock()

	markSyncPerceptionRemoteChange(latestID, "remote-latest-changed")
	recordSyncDiagnostic("perception", "observe", "noticed", time.Now(), false, false, false, "Remote latest snapshot changed, scheduled an immediate sync", nil, nil)
	go syncData(false, false, "perception")
}

func startSyncPerceptionLoop() {
	if !Conf.Sync.Perception || !Conf.Sync.Enabled || 1 != Conf.Sync.Mode {
		stopSyncPerceptionLoop()
		return
	}
	if perceptionRuntime.running.Load() {
		return
	}

	perceptionRuntime.lock.Lock()
	if perceptionRuntime.running.Load() {
		perceptionRuntime.lock.Unlock()
		return
	}
	stopCh := make(chan struct{})
	perceptionRuntime.stop = stopCh
	perceptionRuntime.running.Store(true)
	perceptionRuntime.lock.Unlock()

	go func(stop <-chan struct{}) {
		defer perceptionRuntime.running.Store(false)

		warmup := time.NewTimer(syncPerceptionWarmup)
		defer warmup.Stop()
		ticker := time.NewTicker(syncPerceptionPollIntvl)
		defer ticker.Stop()

		for {
			select {
			case <-stop:
				return
			case <-warmup.C:
				probeSyncPerception()
			case <-ticker.C:
				probeSyncPerception()
			}
		}
	}(stopCh)
}

func stopSyncPerceptionLoop() {
	perceptionRuntime.lock.Lock()
	defer perceptionRuntime.lock.Unlock()

	if perceptionRuntime.stop != nil {
		close(perceptionRuntime.stop)
		perceptionRuntime.stop = nil
	}
	perceptionRuntime.running.Store(false)
}

func maxSyncDiagnosticBytes(value int64) int64 {
	if value > 0 {
		return value
	}
	return 0
}
