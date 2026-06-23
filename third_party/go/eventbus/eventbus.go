// EventBus - Event Bus for SourceFlow.
// Copyright (c) 2022-present, b3log.org
//
// EventBus is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//         http://license.coscl.org.cn/MulanPSL2
//
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND,
// EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT,
// MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
//
// See the Mulan PSL v2 for more details.

package eventbus

import "github.com/asaskevich/EventBus"

var bus = EventBus.New()

func Publish(topic string, arg ...interface{}) {
	bus.Publish(topic, arg...)
}

func Subscribe(topic string, handler interface{}) error {
	return bus.Subscribe(topic, handler)
}

// 消息推送事件。
const (
	CtxPushMsg = "pushMsg"

	CtxPushMsgToNone = iota
	CtxPushMsgToProgress
	CtxPushMsgToStatusBar
	CtxPushMsgToStatusBarAndProgress
)

// 数据库索引事件。
const (
	EvtSQLInsertBlocks       = "sql.insert.blocks"
	EvtSQLInsertBlocksFTS    = "sql.insert.blocks_fts"
	EvtSQLDeleteBlocks       = "sql.delete.blocks"
	EvtSQLUpdateBlocksHPaths = "sql.update.blocks.hPaths"

	EvtSQLInsertHistory      = "sql.insert.history"
	EvtSQLInsertAssetContent = "sql.insert.assetContent"

	EvtSQLIndexChanged = "sql.index.changed"
	EvtSQLIndexFlushed = "sql.index.flushed"
)

// 数据仓库本地事件。
const (
	EvtCheckoutBeforeWalkData    = "repo.checkout.beforeWalkData"
	EvtCheckoutWalkData          = "repo.checkout.walkData"
	EvtCheckoutUpsertFiles       = "repo.checkout.upsertFiles"
	EvtCheckoutUpsertFile        = "repo.checkout.upsertFile"
	EvtCheckoutRemoveFiles       = "repo.checkout.removeFiles"
	EvtCheckoutRemoveFile        = "repo.checkout.removeFile"
	EvtIndexBeforeWalkData       = "repo.index.beforeWalkData"
	EvtIndexWalkData             = "repo.index.walkData"
	EvtIndexBeforeGetLatestFiles = "repo.index.beforeGetLatestFiles"
	EvtIndexGetLatestFile        = "repo.index.getLatestFile"
	EvtIndexUpsertFiles          = "repo.index.upsertFiles"
	EvtIndexUpsertFile           = "repo.index.upsertFile"
)

// 数据仓库云端同步事件。
const (
	EvtCloudLock                   = "repo.cloudLock"
	EvtCloudUnlock                 = "repo.cloudUnlock"
	EvtCloudBeforeUploadIndex      = "repo.cloudBeforeUploadIndex"
	EvtCloudBeforeUploadFiles      = "repo.cloudBeforeUploadFiles"
	EvtCloudBeforeUploadFile       = "repo.cloudBeforeUploadFile"
	EvtCloudBeforeUploadChunks     = "repo.cloudBeforeUploadChunks"
	EvtCloudBeforeUploadChunk      = "repo.cloudBeforeUploadChunk"
	EvtCloudBeforeDownloadIndex    = "repo.cloudBeforeDownloadIndex"
	EvtCloudBeforeDownloadFiles    = "repo.cloudBeforeDownloadFiles"
	EvtCloudBeforeDownloadFile     = "repo.cloudBeforeDownloadFile"
	EvtCloudBeforeDownloadChunks   = "repo.cloudBeforeDownloadChunks"
	EvtCloudBeforeDownloadChunk    = "repo.cloudBeforeDownloadChunk"
	EvtCloudBeforeDownloadRef      = "repo.cloudBeforeDownloadRef"
	EvtCloudBeforeUploadRef        = "repo.cloudBeforeUploadRef"
	EvtCloudBeforeUploadIndexes    = "repo.cloudBeforeUploadIndexes"
	EvtCloudBeforeUploadCheckIndex = "repo.cloudBeforeUploadCheckIndex"
	EvtCloudBeforeFixObjects       = "repo.cloudBeforeFixObjects"
	EvtCloudAfterFixObjects        = "repo.cloudAfterFixObjects"
	EvtCloudCorrupted              = "repo.cloudCorrupted"
)

// 云端数据仓库清理事件。
const (
	EvtCloudPurgeListObjects     = "repo.cloudPurgeListObjects"
	EvtCloudPurgeListIndexes     = "repo.cloudPurgeListIndexes"
	EvtCloudPurgeListRefs        = "repo.cloudPurgeListRefs"
	EvtCloudPurgeDownloadIndexes = "repo.cloudPurgeDownloadIndexes"
	EvtCloudPurgeDownloadFiles   = "repo.cloudPurgeDownloadFiles"
	EvtCloudPurgeRemoveObjects   = "repo.cloudPurgeRemoveObjects"
	EvtCloudPurgeRemoveIndexes   = "repo.cloudPurgeRemoveIndexes"
	EvtCloudPurgeRemoveIndexesV2 = "repo.cloudPurgeRemoveIndexesV2"
)
