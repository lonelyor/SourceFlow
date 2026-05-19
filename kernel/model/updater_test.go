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

import "testing"

func TestParseSHA256SUMS(t *testing.T) {
	checksums := parseSHA256SUMS(`
# release checksums
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  sourceflow-0.1.2-win.exe
bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb *sourceflow-0.1.2-mac.dmg
invalid sourceflow-0.1.2-linux.AppImage
`)

	if checksums["sourceflow-0.1.2-win.exe"] != "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" {
		t.Fatalf("windows checksum was not parsed: %#v", checksums)
	}
	if checksums["sourceflow-0.1.2-mac.dmg"] != "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" {
		t.Fatalf("mac checksum was not parsed: %#v", checksums)
	}
	if _, ok := checksums["sourceflow-0.1.2-linux.AppImage"]; ok {
		t.Fatalf("invalid checksum should be ignored: %#v", checksums)
	}
}

func TestIsVersionUpToDate(t *testing.T) {
	if !isVersionUpToDate("0.1.1") {
		t.Fatalf("current version should be up to date")
	}
	if isVersionUpToDate("99.0.0") {
		t.Fatalf("newer release should not be up to date")
	}
}
