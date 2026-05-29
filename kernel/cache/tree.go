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

package cache

import (
	"github.com/dgraph-io/ristretto"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

type treeCacheEntry struct {
	raw []byte
}

type parsedTreeCacheEntry struct {
	tree *parse.Tree
}

var (
	treeCache, _ = ristretto.NewCache(&ristretto.Config{
		NumCounters: 10240,
		MaxCost:     1024 * 1024 * 200,
		BufferItems: 64,
	})

	parsedTreeCache, _ = ristretto.NewCache(&ristretto.Config{
		NumCounters: 10240,
		MaxCost:     1024 * 1024 * 200,
		BufferItems: 64,
	})
)

func GetTreeData(rootID string) (raw []byte, ok bool) {
	v, _ := treeCache.Get(rootID)
	if nil == v {
		return nil, false
	}
	e := v.(*treeCacheEntry)
	return e.raw, true
}

func SetTreeData(rootID string, raw []byte) {
	if raw == nil {
		return
	}
	entry := &treeCacheEntry{raw: raw}
	treeCache.Set(rootID, entry, int64(len(raw)))
}

func RemoveTreeData(rootID string) {
	treeCache.Del(rootID)
	parsedTreeCache.Del(rootID)
}

func ClearTreeCache() {
	treeCache.Clear()
	parsedTreeCache.Clear()
}

func GetParsedTree(rootID string) *parse.Tree {
	v, _ := parsedTreeCache.Get(rootID)
	if nil == v {
		return nil
	}
	e := v.(*parsedTreeCacheEntry)
	return e.tree
}

func SetParsedTree(rootID string, tree *parse.Tree) {
	if tree == nil {
		return
	}
	estimatedCost := int64(1024 * 100)
	parsedTreeCache.Set(rootID, &parsedTreeCacheEntry{tree: tree}, estimatedCost)
}

func RemoveParsedTree(rootID string) {
	parsedTreeCache.Del(rootID)
}
