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

package sql

import (
	"database/sql"
	"errors"
	"fmt"
	"math"
	"path"
	"runtime/debug"
	"sync"
	"sync/atomic"
	"time"

	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/task"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dataparser"
	"github.com/lonelyor/sourceflow/third_party/go/eventbus"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
	"github.com/lonelyor/sourceflow/third_party/go/lute/render"
)

var (
	operationQueue []*dbQueueOperation
	dbQueueLock    = sync.Mutex{}
	dbQueueCond    = sync.NewCond(&dbQueueLock)
	txLock         = sync.Mutex{}
)

type dbQueueOperation struct {
	inQueueTime                   time.Time
	action                        string // upsert/delete/delete_id/rename/rename_sub_tree/delete_box/delete_box_refs/index/delete_ids/update_block_content/delete_assets
	indexTree                     *parse.Tree
	upsertTree                    *parse.Tree
	removeTreeBox, removeTreePath string
	removeTreeID                  string
	removeTreeIDs                 []string
	box                           string
	renameTree                    *parse.Tree
	block                         *Block
	id                            string
	removeAssetHashes             []string
	upsertTreeBytes               []byte
	renameTreeBytes               []byte
	indexTreeBytes                []byte
}

func snapshotTree(tree *parse.Tree) []byte {
	if tree == nil {
		return nil
	}
	if raw, ok := cache.GetTreeData(tree.ID); ok && len(raw) > 0 {
		snap := make([]byte, len(raw))
		copy(snap, raw)
		return snap
	}
	luteEngine := util.NewLute()
	renderer := render.NewJSONRenderer(tree, luteEngine.RenderOptions, luteEngine.ParseOptions)
	return renderer.Render()
}

func restoreTree(data []byte, boxID, treePath string) *parse.Tree {
	if data == nil {
		return nil
	}
	luteEngine := util.NewLute()
	tree, err := dataparser.ParseJSONWithoutFix(data, luteEngine.ParseOptions)
	if err != nil {
		logging.LogErrorf("restore tree from queue snapshot failed: %s", err)
		return nil
	}
	tree.Box = boxID
	tree.Path = treePath
	return tree
}

func FlushTxJob() {
	task.AppendTask(task.DatabaseIndexCommit, FlushQueue)
}

func WaitFlushTx() {
	WaitFlushTxWithTimeout(120 * time.Second)
}

func WaitFlushTxWithTimeout(timeout time.Duration) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	var printLog, lastPrintLog bool
	var i int
	deadline := time.Now().Add(timeout)

	for (len(operationQueue) > 0 || flushingTx.Load()) && time.Now().Before(deadline) {
		if i == 0 {
			dbQueueCond.Wait()
		} else {
			timer := time.AfterFunc(50*time.Millisecond, func() {
				dbQueueCond.Broadcast()
			})
			dbQueueCond.Wait()
			timer.Stop()
		}

		i++
		if 200 < i && !printLog {
			logging.LogWarnf("database is writing: \n%s", logging.ShortStack())
			printLog = true
		}
		if 1200 < i && !lastPrintLog {
			logging.LogWarnf("database is still writing")
			lastPrintLog = true
		}
	}

	if len(operationQueue) > 0 || flushingTx.Load() {
		logging.LogErrorf("WaitFlushTx timed out after %v, queue=%d, flushing=%v", timeout, len(operationQueue), flushingTx.Load())
	}
}

func ClearQueue() {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()
	operationQueue = nil
}

var flushingTx = atomic.Bool{}

func FlushQueue() {
	initDatabaseLock.Lock()
	defer initDatabaseLock.Unlock()

	ops := getOperations()
	total := len(ops)
	if 1 > total && !flushingTx.Load() {
		return
	}

	txLock.Lock()
	flushingTx.Store(true)
	defer func() {
		flushingTx.Store(false)
		txLock.Unlock()
		// 通知等待的协程队列已刷新完成
		dbQueueCond.Broadcast()
	}()

	start := time.Now()

	// logging.LogInfof("flushing database queue, total operations [%d]", total)

	// 如果有重命名子树的操作，则统计各路径前缀的块树数量，数量较大的话阻塞整个队列，以便尽可能合并重命名子树的操作
	var renameSubTreeOp *dbQueueOperation
	for _, op := range ops {
		if "rename_sub_tree" == op.action {
			renameSubTreeOp = op
			break
		}
	}
	if nil != renameSubTreeOp {
		childCount := treenode.CountBlockTreesByPathPrefix(path.Dir(renameSubTreeOp.renameTree.Path))
		if 512 < childCount {
			scale := math.Log(float64(childCount)/512.0+1.0) / math.Log(2.0)
			secs := 1.0 * scale
			if secs < 1.0 {
				secs = 1.0
			}
			if secs > 12.0 {
				secs = 12.0
			}
			logging.LogInfof("rename sub tree [%s] with large child count [%d], sleep [%.2fs] to wait for more operations", renameSubTreeOp.renameTree.Path, childCount, secs)
			time.Sleep(time.Duration(secs * float64(time.Second)))
		}
	}

	context := map[string]interface{}{eventbus.CtxPushMsg: eventbus.CtxPushMsgToStatusBar}
	if 512 < len(ops) {
		disableCache()
		defer enableCache()
	}

	groupOpsTotal := map[string]int{}
	for _, op := range ops {
		groupOpsTotal[op.action]++
	}

	groupOpsCurrent := map[string]int{}
	for i, op := range ops {
		if util.IsExiting.Load() {
			return
		}

		tx, err := beginTx()
		if err != nil {
			return
		}

		groupOpsCurrent[op.action]++
		context["current"] = groupOpsCurrent[op.action]
		context["total"] = groupOpsTotal[op.action]
		if err = execOp(op, tx, context); err != nil {
			tx.Rollback()
			closeTxPreparedStmts(tx)
			logging.LogErrorf("queue operation [%s] failed: %s", op.action, err)
			continue
		}

		if err = commitTx(tx); err != nil {
			logging.LogErrorf("commit tx failed: %s", err)
			continue
		}

		if 16 < i && 0 == i%128 {
			debug.FreeOSMemory()
		}
	}

	if 128 < total {
		debug.FreeOSMemory()
	}

	elapsed := time.Now().Sub(start).Milliseconds()
	if 7000 < elapsed {
		logging.LogInfof("database op tx [%dms]", elapsed)
	}

	// Push database index commit event https://github.com/lonelyor/SourceFlow/issues/8814
	util.BroadcastByType("main", "databaseIndexCommit", 0, "", nil)

	eventbus.Publish(eventbus.EvtSQLIndexFlushed)
}

func execOp(op *dbQueueOperation, tx *sql.Tx, context map[string]interface{}) (err error) {
	switch op.action {
	case "index":
		tree := op.indexTree
		if op.indexTreeBytes != nil {
			tree = restoreTree(op.indexTreeBytes, op.indexTree.Box, op.indexTree.Path)
			if tree == nil {
				tree = op.indexTree
			}
		}
		err = indexTree(tx, tree, context)
	case "upsert":
		tree := op.upsertTree
		if op.upsertTreeBytes != nil {
			tree = restoreTree(op.upsertTreeBytes, op.upsertTree.Box, op.upsertTree.Path)
			if tree == nil {
				tree = op.upsertTree
			}
		}
		err = upsertTree(tx, tree, context)
	case "delete":
		err = batchDeleteByPathPrefix(tx, op.removeTreeBox, op.removeTreePath)
	case "delete_id":
		err = deleteByRootID(tx, op.removeTreeID, context)
	case "delete_ids":
		err = batchDeleteByRootIDs(tx, op.removeTreeIDs, context)
	case "rename":
		tree := op.renameTree
		if op.renameTreeBytes != nil {
			tree = restoreTree(op.renameTreeBytes, op.renameTree.Box, op.renameTree.Path)
			if tree == nil {
				tree = op.renameTree
			}
		}
		err = batchUpdateHPath(tx, tree, context)
		if err != nil {
			break
		}
		err = updateRootContent(tx, path.Base(tree.HPath), tree.Root.IALAttr("updated"), tree.ID)
	case "rename_sub_tree":
		tree := op.renameTree
		if op.renameTreeBytes != nil {
			tree = restoreTree(op.renameTreeBytes, op.renameTree.Box, op.renameTree.Path)
			if tree == nil {
				tree = op.renameTree
			}
		}
		err = batchUpdatePath(tx, tree, context)
	case "delete_box":
		err = deleteByBoxTx(tx, op.box)
	case "delete_box_refs":
		err = deleteRefsByBoxTx(tx, op.box)
	case "update_refs":
		tree := op.upsertTree
		if op.upsertTreeBytes != nil {
			tree = restoreTree(op.upsertTreeBytes, op.upsertTree.Box, op.upsertTree.Path)
			if tree == nil {
				tree = op.upsertTree
			}
		}
		err = upsertRefs(tx, tree)
	case "delete_refs":
		tree := op.upsertTree
		if op.upsertTreeBytes != nil {
			tree = restoreTree(op.upsertTreeBytes, op.upsertTree.Box, op.upsertTree.Path)
			if tree == nil {
				tree = op.upsertTree
			}
		}
		err = deleteRefs(tx, tree)
	case "update_block_content":
		err = updateBlockContent(tx, op.block)
	case "delete_assets":
		err = deleteAssetsByHashes(tx, op.removeAssetHashes)
	case "index_node":
		err = indexNode(tx, op.id)
	default:
		msg := fmt.Sprintf("unknown operation [%s]", op.action)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
	}
	return
}

func IndexNodeQueue(id string) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{id: id, inQueueTime: time.Now(), action: "index_node"}
	for i, op := range operationQueue {
		if "index_node" == op.action && op.id == id {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func BatchRemoveAssetsQueue(hashes []string) {
	if 1 > len(hashes) {
		return
	}

	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{removeAssetHashes: hashes, inQueueTime: time.Now(), action: "delete_assets"}
	appendOperation(newOp)
}

func UpdateBlockContentQueue(block *Block) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{block: block, inQueueTime: time.Now(), action: "update_block_content"}
	for i, op := range operationQueue {
		if "update_block_content" == op.action && op.block.ID == block.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func DeleteRefsTreeQueue(tree *parse.Tree) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{upsertTree: tree, inQueueTime: time.Now(), action: "delete_refs"}
	for i, op := range operationQueue {
		if "delete_refs" == op.action && op.upsertTree.ID == tree.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func UpdateRefsTreeQueue(tree *parse.Tree) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{upsertTree: tree, inQueueTime: time.Now(), action: "update_refs"}
	for i, op := range operationQueue {
		if "update_refs" == op.action && op.upsertTree.ID == tree.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func DeleteBoxRefsQueue(boxID string) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{box: boxID, inQueueTime: time.Now(), action: "delete_box_refs"}
	for i, op := range operationQueue {
		if "delete_box_refs" == op.action && op.box == boxID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func DeleteBoxQueue(boxID string) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{box: boxID, inQueueTime: time.Now(), action: "delete_box"}
	for i, op := range operationQueue {
		if "delete_box" == op.action && op.box == boxID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func IndexTreeQueue(tree *parse.Tree) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	snap := snapshotTree(tree)
	newOp := &dbQueueOperation{indexTree: tree, indexTreeBytes: snap, inQueueTime: time.Now(), action: "index"}
	for i, op := range operationQueue {
		if "index" == op.action && op.indexTree.ID == tree.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func UpsertTreeQueue(tree *parse.Tree) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	snap := snapshotTree(tree)
	newOp := &dbQueueOperation{upsertTree: tree, upsertTreeBytes: snap, inQueueTime: time.Now(), action: "upsert"}
	for i, op := range operationQueue {
		if "upsert" == op.action && op.upsertTree.ID == tree.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func RenameTreeQueue(tree *parse.Tree) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	snap := snapshotTree(tree)
	newOp := &dbQueueOperation{
		renameTree:      tree,
		renameTreeBytes: snap,
		inQueueTime:     time.Now(),
		action:          "rename",
	}
	for i, op := range operationQueue {
		if "rename" == op.action && op.renameTree.ID == tree.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func RenameSubTreeQueue(tree *parse.Tree) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	snap := snapshotTree(tree)
	newOp := &dbQueueOperation{
		renameTree:      tree,
		renameTreeBytes: snap,
		inQueueTime:     time.Now(),
		action:          "rename_sub_tree",
	}
	for i, op := range operationQueue {
		if "rename_sub_tree" == op.action && op.renameTree.ID == tree.ID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func RemoveTreeQueue(rootID string) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{removeTreeID: rootID, inQueueTime: time.Now(), action: "delete_id"}
	for i, op := range operationQueue {
		if "delete_id" == op.action && op.removeTreeID == rootID {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func BatchRemoveTreeQueue(rootIDs []string) {
	if 1 > len(rootIDs) {
		return
	}

	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{removeTreeIDs: rootIDs, inQueueTime: time.Now(), action: "delete_ids"}
	appendOperation(newOp)
}

func RemoveTreePathQueue(treeBox, treePathPrefix string) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	newOp := &dbQueueOperation{removeTreeBox: treeBox, removeTreePath: treePathPrefix, inQueueTime: time.Now(), action: "delete"}
	for i, op := range operationQueue {
		if "delete" == op.action && (op.removeTreeBox == treeBox && op.removeTreePath == treePathPrefix) {
			operationQueue[i] = newOp
			return
		}
	}
	appendOperation(newOp)
}

func getOperations() (ops []*dbQueueOperation) {
	dbQueueLock.Lock()
	defer dbQueueLock.Unlock()

	ops = operationQueue
	operationQueue = nil
	return
}

func appendOperation(op *dbQueueOperation) {
	operationQueue = append(operationQueue, op)
	eventbus.Publish(eventbus.EvtSQLIndexChanged)
}
