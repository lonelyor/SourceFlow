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
	"strings"
)

var (
	bazaarHashOverride       string
	bazaarStageBaseURL       = defaultBazaarStageBaseURL
	bazaarPackageBaseURL     = defaultBazaarPackageBaseURL
	bazaarStatBaseURL        = defaultBazaarStatBaseURL
	bazaarReadmeCDNBaseURL   = defaultBazaarReadmeCDNBaseURL
	bazaarVersionInfoBaseURL string
)

func IsChinaCloud() bool {
	return true
}

func GetCloudServer() string {
	return cloudServer
}

const (
	defaultCloudServer = "https://sync.sourceflow.app"
)

func init() {
	if override := GetEnv("SOURCEFLOW_CLOUD_SERVER"); "" != override {
		cloudServer = strings.TrimRight(override, "/")
	} else {
		cloudServer = defaultCloudServer
	}
}

var (
	cloudServer string
)

const (
	defaultBazaarRootBaseURL      = "https://lonelyor.github.io/SourceFlow-plugins"
	defaultBazaarVersionInfoURL   = defaultBazaarRootBaseURL + "/version.json"
	defaultBazaarStageBaseURL     = defaultBazaarRootBaseURL
	defaultBazaarPackageBaseURL   = defaultBazaarRootBaseURL
	defaultBazaarStatBaseURL      = defaultBazaarRootBaseURL + "/stat"
	defaultBazaarReadmeCDNBaseURL = "https://cdn.jsdelivr.net/gh"
)

func ApplyBazaarSettings(bazaarHash, versionInfoURL, stageBaseURL, packageBaseURL, statBaseURL, readmeCDNBaseURL string) {
	bazaarHashOverride = strings.TrimSpace(bazaarHash)
	bazaarVersionInfoBaseURL = normalizeBazaarBaseURL(versionInfoURL)
	bazaarStageBaseURL = firstNonEmpty(normalizeBazaarBaseURL(stageBaseURL), defaultBazaarStageBaseURL)
	bazaarPackageBaseURL = firstNonEmpty(normalizeBazaarBaseURL(packageBaseURL), defaultBazaarPackageBaseURL)
	bazaarStatBaseURL = firstNonEmpty(normalizeBazaarBaseURL(statBaseURL), defaultBazaarStatBaseURL)
	bazaarReadmeCDNBaseURL = firstNonEmpty(normalizeBazaarBaseURL(readmeCDNBaseURL), defaultBazaarReadmeCDNBaseURL)

	rhyResultLock.Lock()
	cachedRhyResult = map[string]any{}
	rhyResultCacheTime = 0
	rhyResultLock.Unlock()

	rhyBazaarHashLock.Lock()
	rhyBazaarHash = ""
	rhyBazaarHashLock.Unlock()
}

func GetBazaarHashOverride() string {
	return bazaarHashOverride
}

func GetBazaarVersionInfoURL() string {
	if "" != bazaarVersionInfoBaseURL {
		return bazaarVersionInfoBaseURL
	}
	return defaultBazaarVersionInfoURL
}

func GetBazaarOnlineCheckURL() string {
	if "" != bazaarVersionInfoBaseURL {
		return bazaarVersionInfoBaseURL
	}
	if looksLikeStaticBazaarBaseURL(bazaarStageBaseURL) {
		return joinURL(bazaarStageBaseURL, "version.json")
	}
	return joinURL(bazaarStageBaseURL, "204")
}

func GetBazaarStageIndexURL(bazaarHash, pkgType string) string {
	return joinURL(bazaarStageBaseURL, "bazaar@"+bazaarHash, "stage", pkgType+".json")
}

func GetBazaarStatsURL() string {
	return joinURL(bazaarStatBaseURL, "bazaar", "index.json")
}

func GetBazaarPackageURL(repoURLHashTrimmed string) string {
	repoURLHashTrimmed = strings.TrimLeft(strings.TrimSpace(repoURLHashTrimmed), "/")
	if shouldUseStaticBazaarPackageArchiveURL(bazaarPackageBaseURL, repoURLHashTrimmed) {
		return joinURL(bazaarPackageBaseURL, "package", repoURLHashTrimmed) + ".zip"
	}
	return joinURL(bazaarPackageBaseURL, "package", repoURLHashTrimmed)
}

func GetBazaarPackageAssetURL(repoURLHash, assetName string) string {
	return joinURL(bazaarPackageBaseURL, "package", repoURLHash, assetName)
}

func GetBazaarReadmeBaseURL(repoURL string) string {
	return joinURL(bazaarReadmeCDNBaseURL, strings.TrimPrefix(repoURL, "https://github.com/"))
}

func normalizeBazaarBaseURL(base string) string {
	return strings.TrimRight(strings.TrimSpace(base), "/")
}

func joinURL(base string, elems ...string) string {
	ret := strings.TrimRight(base, "/")
	for _, elem := range elems {
		elem = strings.TrimSpace(elem)
		if "" == elem {
			continue
		}
		if "" == ret {
			ret = strings.TrimLeft(elem, "/")
			continue
		}
		ret += "/" + strings.TrimLeft(elem, "/")
	}
	return ret
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if "" != value {
			return value
		}
	}
	return ""
}

func shouldUseStaticBazaarPackageArchiveURL(baseURL, repoURLHashTrimmed string) bool {
	if !looksLikeStaticBazaarBaseURL(baseURL) {
		return false
	}
	atIndex := strings.LastIndex(repoURLHashTrimmed, "@")
	if 0 > atIndex {
		return false
	}
	// README/icon/preview 等资源路径仍然走目录结构，不追加 .zip。
	return !strings.Contains(repoURLHashTrimmed[atIndex+1:], "/")
}

func looksLikeStaticBazaarBaseURL(baseURL string) bool {
	lowerCase := strings.ToLower(strings.TrimSpace(baseURL))
	return strings.Contains(lowerCase, "github.io") ||
		strings.Contains(lowerCase, "raw.githubusercontent.com") ||
		strings.Contains(lowerCase, "cdn.jsdelivr.net")
}
