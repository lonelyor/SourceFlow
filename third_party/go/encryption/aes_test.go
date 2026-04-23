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
	"bytes"
	"testing"
)

func TestAes(t *testing.T) {
	const (
		password = "123"
		salt     = "456"
	)

	key, err := KDF(password, salt)
	if nil != err {
		t.Error(err)
		return
	}
	encrypt, err := AesEncrypt([]byte("Hello!"), key)
	if nil != err {
		t.Error(err)
		return
	}
	t.Logf("encrypt len [%d]", len(encrypt))

	decrypt, err := AesDecrypt(encrypt, key)
	if nil != err {
		t.Error(err)
		return
	}
	t.Log(string(decrypt))

	key2, err := KDF(password, salt)
	if nil != err {
		t.Error(err)
		return
	}

	if 0 != bytes.Compare(key, key2) {
		t.Error("key not equal")
		return
	}

	decrypt2, err := AesDecrypt(encrypt, key2)
	if nil != err {
		t.Error(err)
		return
	}
	if 0 != bytes.Compare(decrypt, decrypt2) {
		t.Error("decrypt not equal")
		return
	}
}
