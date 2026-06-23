// Encryption - AES-GCM 端到端加密
// Copyright (c) 2021-present, b3log.org
//
// Encryption is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//         http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

package encryption

import (
	"encoding/hex"
	"testing"
)

func TestKDF(t *testing.T) {
	kdf, err := KDF("password123", "salt123")
	if nil != err {
		t.Error(err)
		return
	}
	if "714047d3f647c8a0f27aa435052d6971981cc8cc7687df28af329df55c98da80" != hex.EncodeToString(kdf) {
		t.Error("invalid key")
		return
	}
}
