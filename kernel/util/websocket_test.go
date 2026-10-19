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

package util

import (
	"testing"

	"github.com/lonelyor/sourceflow/third_party/go/eventbus"
)

// TestContextPushMsgNilContext 验证后台静默路径（nil context）不会触发 panic。
//
// 回归场景：同步感知探针以 nil context 调用 dejavu 的 GetCloudLatest，
// dejavu 发布 EvtCloudBeforeDownloadRef 事件后 ContextPushMsg 对
// context[eventbus.CtxPushMsg] 做强类型断言导致内核进程崩溃（退出码 2）。
func TestContextPushMsgNilContext(t *testing.T) {
	defer func() {
		if e := recover(); nil != e {
			t.Fatalf("ContextPushMsg(nil, ...) panicked: %v", e)
		}
	}()
	ContextPushMsg(nil, "test message")
}

// TestContextPushMsgEmptyContext 验证缺少 pushMsg 键的空 context 同样安全。
func TestContextPushMsgEmptyContext(t *testing.T) {
	defer func() {
		if e := recover(); nil != e {
			t.Fatalf("ContextPushMsg(empty, ...) panicked: %v", e)
		}
	}()
	ContextPushMsg(map[string]interface{}{}, "test message")
}

// TestContextPushMsgToNone 验证显式静默 context 行为不变。
func TestContextPushMsgToNone(t *testing.T) {
	defer func() {
		if e := recover(); nil != e {
			t.Fatalf("ContextPushMsg(ToNone, ...) panicked: %v", e)
		}
	}()
	ContextPushMsg(map[string]interface{}{eventbus.CtxPushMsg: eventbus.CtxPushMsgToNone}, "test message")
}
