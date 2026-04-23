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
	"path/filepath"
	"strings"

	"github.com/lonelyor/sourceflow/kernel/cache"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

type Asset struct {
	ID      string
	BlockID string
	RootID  string
	Box     string
	DocPath string
	Path    string
	Name    string
	Title   string
	Hash    string
}

func docTagSpans(n *ast.Node) (ret []*Span) {
	if tagsVal := n.IALAttr("tags"); "" != tagsVal {
		tags := strings.Split(tagsVal, ",")
		for _, tag := range tags {
			escaped := util.EscapeHTML(tag)
			markdown := "#" + escaped + "#"
			span := &Span{
				ID:       ast.NewNodeID(),
				BlockID:  n.ID,
				RootID:   n.ID,
				Box:      n.Box,
				Path:     n.Path,
				Content:  tag,
				Markdown: markdown,
				Type:     "tag",
				IAL:      "",
			}
			ret = append(ret, span)
		}
	}
	return
}

func docTitleImgAsset(root *ast.Node, boxLocalPath, docDirLocalPath string) *Asset {
	if p := treenode.GetDocTitleImgPath(root); "" != p {
		if !util.IsAssetLinkDest([]byte(p), false) {
			return nil
		}

		hash := assetHashByLocalPath(p, boxLocalPath, docDirLocalPath)
		name, _ := util.LastID(p)
		asset := &Asset{
			ID:      ast.NewNodeID(),
			BlockID: root.ID,
			RootID:  root.ID,
			Box:     root.Box,
			DocPath: root.Path,
			Path:    p,
			Name:    name,
			Title:   "title-img",
			Hash:    hash,
		}
		return asset
	}
	return nil
}

func deleteAssetsByHashes(tx *sql.Tx, hashes []string) (err error) {
	sqlStmt := "DELETE FROM assets WHERE hash IN ('" + strings.Join(hashes, "','") + "') OR hash = ''"
	err = execStmtTx(tx, sqlStmt)
	return
}

func QueryAssetByHash(hash string) (ret *Asset) {
	sqlStmt := "SELECT * FROM assets WHERE hash = ?"
	row := queryRow(sqlStmt, hash)
	var asset Asset
	if err := row.Scan(&asset.ID, &asset.BlockID, &asset.RootID, &asset.Box, &asset.DocPath, &asset.Path, &asset.Name, &asset.Title, &asset.Hash); err != nil {
		if !errors.Is(err, sql.ErrNoRows) {
			logging.LogErrorf("query scan field failed: %s", err)
		}
		return
	}
	ret = &asset
	return
}

func assetHashByLocalPath(linkDest, boxLocalPath, docDirLocalPath string) (ret string) {
	if lp := assetLocalPath(linkDest, boxLocalPath, docDirLocalPath); "" != lp {
		if !gulu.File.IsDir(lp) {
			if assetHash := cache.GetAssetHashByPath(linkDest); nil != assetHash {
				ret = assetHash.Hash
			} else {
				ret, _ = util.GetEtag(lp)
				if "" != ret {
					cache.SetAssetHash(ret, linkDest)
				}
			}
		}
	}
	return
}

func assetLocalPath(linkDest, boxLocalPath, docDirLocalPath string) (ret string) {
	ret = filepath.Join(docDirLocalPath, linkDest)
	if filelock.IsExist(ret) {
		return
	}

	ret = filepath.Join(boxLocalPath, linkDest)
	if filelock.IsExist(ret) {
		return
	}

	ret = filepath.Join(util.DataDir, linkDest)
	if filelock.IsExist(ret) {
		return
	}
	return ""
}

func QueryRootAssetCount(rootIDs []string) (ret map[string]int) {
	ret = map[string]int{}
	if 1 > len(rootIDs) {
		return
	}

	placeholders := make([]string, 0, len(rootIDs))
	args := make([]interface{}, 0, len(rootIDs))
	for _, id := range rootIDs {
		if "" == strings.TrimSpace(id) {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, id)
	}
	if 1 > len(placeholders) {
		return
	}

	rows, err := query("SELECT root_id, COUNT(*) AS asset_cnt FROM assets WHERE root_id IN ("+strings.Join(placeholders, ",")+") GROUP BY root_id", args...)
	if err != nil {
		logging.LogErrorf("sql query failed: %s", err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var cnt int
		if err = rows.Scan(&id, &cnt); err != nil {
			logging.LogErrorf("query scan field failed: %s", err)
			return
		}
		ret[id] = cnt
	}
	return
}
