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
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"golang.org/x/sync/singleflight"
)

var (
	RhyCacheDuration = int64(3600 * 6)

	cachedRhyResult    = map[string]any{}
	rhyResultCacheTime int64
	rhyResultLock      = sync.Mutex{}
	rhyResultFlight    singleflight.Group

	rhyBazaarHash     string
	rhyBazaarHashLock sync.RWMutex
)

func isBenignRhyNetworkError(err error) bool {
	if nil == err {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	lowerCase := strings.ToLower(err.Error())
	for _, pattern := range []string{
		"no such host",
		"temporary failure in name resolution",
		"server misbehaving",
		"network is unreachable",
		"connection refused",
		"connection reset",
		"connection aborted",
		"tls handshake timeout",
		"i/o timeout",
		"timeout",
	} {
		if strings.Contains(lowerCase, pattern) {
			return true
		}
	}
	return false
}

func RefreshRhyResultJob() {
	_, err := GetRhyResult(context.TODO(), true)
	if nil != err {
		// 系统唤醒后可能还没有网络连接，这里等待后再重试
		go func() {
			time.Sleep(7 * time.Second)
			GetRhyResult(context.TODO(), true)
		}()
	}
}

func GetRhyResult(ctx context.Context, force bool) (map[string]any, error) {
	if ContainerDocker == Container {
		RhyCacheDuration = int64(3600 * 24)
	}

	if RhyCacheDuration >= time.Now().Unix()-rhyResultCacheTime && !force && 0 < len(cachedRhyResult) {
		return cachedRhyResult, nil
	}

	// 并发调用只执行一次实际请求
	v, err, _ := rhyResultFlight.Do("rhyResult", func() (any, error) {
		return getRhyResult0(ctx)
	})
	if err != nil {
		return nil, err
	}
	ret := v.(map[string]any)
	syncRhyBazaarHashFromResult(ret)
	return ret, nil
}

func getRhyResult0(ctx context.Context) (map[string]any, error) {
	rhyResultLock.Lock()
	defer rhyResultLock.Unlock()

	request := httpclient.NewCloudRequest30s()
	versionInfoURL := GetBazaarVersionInfoURL()
	if strings.Contains(versionInfoURL, "?") {
		versionInfoURL += "&ver=" + Ver
	} else {
		versionInfoURL += "?ver=" + Ver
	}
	resp, err := request.SetContext(ctx).SetSuccessResult(&cachedRhyResult).Get(versionInfoURL)
	if err != nil {
		if isBenignRhyNetworkError(err) {
			logging.LogInfof("version info unavailable, continue without online metadata: %s", err)
		} else {
			logging.LogErrorf("get version info failed: %s", err)
		}
		return nil, err
	}
	if 200 != resp.StatusCode {
		logging.LogErrorf("get rhy result failed: %d", resp.StatusCode)
		return nil, fmt.Errorf("get rhy result failed: %d", resp.StatusCode)
	}
	rhyResultCacheTime = time.Now().Unix()
	return cachedRhyResult, nil
}

func syncRhyBazaarHashFromResult(m map[string]any) {
	rhyBazaarHashLock.Lock()
	defer rhyBazaarHashLock.Unlock()
	if nil == m {
		rhyBazaarHash = ""
		return
	}
	v, ok := m["bazaar"]
	if !ok || nil == v {
		rhyBazaarHash = ""
		return
	}
	s, ok := v.(string)
	if !ok || "" == s {
		rhyBazaarHash = ""
		return
	}
	rhyBazaarHash = s
}

func GetRhyBazaarHash(ctx context.Context) string {
	rhyBazaarHashLock.RLock()
	h := rhyBazaarHash
	rhyBazaarHashLock.RUnlock()
	if "" != h {
		return h
	}
	_, _ = GetRhyResult(ctx, false)
	rhyBazaarHashLock.RLock()
	h = rhyBazaarHash
	rhyBazaarHashLock.RUnlock()
	if "" != h {
		return h
	}
	return GetBazaarHashOverride()
}
