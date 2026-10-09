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
	"testing"
	"time"
)

// TestLockSyncWithTimeoutAcquiresAndTimesOut 验证带超时的同步锁：
// 锁被持有时，后续获取应在超时后返回 false，而非无限阻塞。
func TestLockSyncWithTimeoutAcquiresAndTimesOut(t *testing.T) {
	if !lockSyncWithTimeout(2 * time.Second) {
		t.Fatal("first lockSyncWithTimeout returned false, want true")
	}
	defer unlockSync()

	done := make(chan bool, 1)
	go func() {
		// 锁已被持有，应快速超时返回 false。
		done <- lockSyncWithTimeout(300 * time.Millisecond)
	}()

	select {
	case got := <-done:
		if got {
			t.Fatal("second lockSyncWithTimeout returned true while lock held, want false")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("lockSyncWithTimeout blocked longer than expected; timeout not honored")
	}
}

// TestLockSyncWithTimeoutReacquiresAfterRelease 验证释放后可再次获取。
func TestLockSyncWithTimeoutReacquiresAfterRelease(t *testing.T) {
	if !lockSyncWithTimeout(2 * time.Second) {
		t.Fatal("lockSyncWithTimeout returned false, want true")
	}
	unlockSync()

	if !lockSyncWithTimeout(2 * time.Second) {
		t.Fatal("lockSyncWithTimeout returned false after release, want true")
	}
	unlockSync()
}
