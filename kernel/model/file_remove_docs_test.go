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
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/util"
)

// withRemoveDocTestEnv isolates notebook listing on a temp data dir so RemoveDoc
// error paths can be exercised without a booted workspace.
func withRemoveDocTestEnv(t *testing.T) {
	t.Helper()
	oldDataDir := util.DataDir
	util.DataDir = t.TempDir()
	oldConf := Conf
	Conf = &AppConf{FileTree: &conf.FileTree{}}
	t.Cleanup(func() {
		util.DataDir = oldDataDir
		Conf = oldConf
	})
}

func TestRemoveDocMissingNotebookReturnsExplicitError(t *testing.T) {
	withRemoveDocTestEnv(t)

	err := RemoveDoc("20260101000000-missing", "/20260101000001-missing.sf")
	if nil == err {
		t.Fatal("RemoveDoc must return an explicit error for a missing notebook instead of silently succeeding")
	}
	if !strings.Contains(err.Error(), "20260101000000-missing") {
		t.Fatalf("error must name the missing notebook: %v", err)
	}
}

func TestRemoveDocUnreadableTreeReturnsExplicitError(t *testing.T) {
	withRemoveDocTestEnv(t)

	box := &Box{ID: "20260101000000-boxa", Name: "box"}
	tree, err := removeDoc(box, "/20260101000001-missing.sf", util.NewLute())
	if nil == err {
		t.Fatal("removeDoc must return an explicit error when the doc tree cannot be loaded")
	}
	if nil != tree {
		t.Fatalf("removeDoc must not return a tree on failure: %#v", tree)
	}
	if !strings.Contains(err.Error(), "load doc tree") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestRemoveDocsByRefsReportsEveryFailedDoc(t *testing.T) {
	withRemoveDocTestEnv(t)

	err := RemoveDocsByRefs([]RemoveDocRef{
		{Notebook: "20260101000000-boxa", Path: "/20260101000001-a.sf"},
		{Notebook: "20260101000002-boxb", Path: "/20260101000003-b.sf"},
	})
	if nil == err {
		t.Fatal("RemoveDocsByRefs must report failures instead of silently dropping them")
	}
	if !strings.Contains(err.Error(), "20260101000000-boxa") || !strings.Contains(err.Error(), "20260101000002-boxb") {
		t.Fatalf("error must list every failed doc: %v", err)
	}
}

func TestRemoveDocRefsFromPathsRejectsAmbiguousLegacyPath(t *testing.T) {
	sharedPath := "/20260714000000-shared.sf"

	got, err := removeDocRefsFromPathsWithResolver([]string{sharedPath}, func(string) []string {
		return []string{"box-b", "box-a"}
	})
	if err == nil {
		t.Fatalf("expected ambiguous legacy path error, got refs: %#v", got)
	}
	if len(got) > 0 {
		t.Fatalf("ambiguous legacy path must not resolve refs: %#v", got)
	}
}

func TestRemoveDocRefsFromPathsKeepsOnlyUniqueLegacyMatches(t *testing.T) {
	parentPath := "/20260714000000-parent.sf"
	childPath := "/20260714000000-parent/20260714000000-child.sf"
	otherPath := "/20260714000000-other.sf"

	got, err := removeDocRefsFromPathsWithResolver([]string{
		parentPath,
		childPath,
		otherPath,
		"/",
		"",
	}, func(p string) []string {
		switch p {
		case parentPath, childPath:
			return []string{"box-a"}
		case otherPath:
			return []string{"box-b"}
		default:
			return nil
		}
	})
	if err != nil {
		t.Fatalf("expected unique legacy paths to resolve, got error: %v", err)
	}

	expected := map[RemoveDocRef]bool{
		{Notebook: "box-a", Path: parentPath}: true,
		{Notebook: "box-b", Path: otherPath}:  true,
	}
	assertRemoveDocRefs(t, got, expected)
}

func TestFilterSelfChildDocRefsKeepsNotebookContext(t *testing.T) {
	parentPath := "/20260714000000-parent.sf"
	childPath := "/20260714000000-parent/20260714000000-child.sf"
	sharedPath := "/20260714000000-shared.sf"

	got := filterSelfChildDocRefs([]RemoveDocRef{
		{Notebook: "box-a", Path: parentPath},
		{Notebook: "box-a", Path: childPath},
		{Notebook: "box-a", Path: sharedPath},
		{Notebook: "box-a", Path: sharedPath},
		{Notebook: "box-b", Path: sharedPath},
	})

	expected := map[RemoveDocRef]bool{
		{Notebook: "box-a", Path: parentPath}: true,
		{Notebook: "box-a", Path: sharedPath}: true,
		{Notebook: "box-b", Path: sharedPath}: true,
	}
	assertRemoveDocRefs(t, got, expected)
}

func assertRemoveDocRefs(t *testing.T, got []RemoveDocRef, expected map[RemoveDocRef]bool) {
	t.Helper()
	if len(got) != len(expected) {
		t.Fatalf("expected %d refs, got %d: %#v", len(expected), len(got), got)
	}
	for _, doc := range got {
		if !expected[doc] {
			t.Fatalf("unexpected doc ref: %#v in %#v", doc, got)
		}
		delete(expected, doc)
	}
	if len(expected) > 0 {
		t.Fatalf("missing doc refs: %#v in %#v", expected, got)
	}
}
