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
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/imroc/req/v3"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"golang.org/x/mod/semver"
)

const githubLatestReleaseAPI = "https://api.github.com/repos/lonelyor/SourceFlow/releases/latest"

type softwareUpdateInfo struct {
	Version   string
	URL       string
	Assets    map[string]string
	Checksums map[string]string
}

type githubReleaseInfo struct {
	TagName    string `json:"tag_name"`
	HTMLURL    string `json:"html_url"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func execNewVerInstallPkg(newVerInstallPkgPath string) {
	logging.LogInfof("installing the new version [%s]", newVerInstallPkgPath)
	var cmd *exec.Cmd
	if gulu.OS.IsWindows() {
		cmd = exec.Command(newVerInstallPkgPath)
	} else if gulu.OS.IsDarwin() {
		exec.Command("chmod", "+x", newVerInstallPkgPath).CombinedOutput()
		cmd = exec.Command("open", newVerInstallPkgPath)
	} else {
		logging.LogErrorf("unsupported platform for auto-installing package")
		return
	}
	gulu.CmdAttr(cmd)
	cmdErr := cmd.Run()
	if nil != cmdErr {
		logging.LogErrorf("exec install new version failed: %s", cmdErr)
		return
	}
}

func getNewVerInstallPkgPath() string {
	if skipNewVerInstallPkg() {
		return ""
	}

	downloadPkgURLs, checksum, err := getUpdatePkg()
	if err != nil {
		return ""
	}

	pkg := path.Base(downloadPkgURLs[0])
	pkgPath := filepath.Join(util.TempDir, "install", pkg)
	localChecksum, _ := sha256Hash(pkgPath)
	if checksum != localChecksum {
		return ""
	}
	return pkgPath
}

var checkDownloadInstallPkgLock = sync.Mutex{}

var (
	checkSoftwareUpdateLock       = sync.Mutex{}
	lastSoftwareUpdateCheck       int64
	lastSoftwareUpdatePromptedVer string
)

func CheckSoftwareUpdateJob() {
	defer logging.Recover()

	if util.ContainerStd != util.Container || util.ISMicrosoftStore {
		return
	}
	if time.Now().Unix()-lastSoftwareUpdateCheck < int64(2*time.Hour/time.Second) {
		return
	}
	if !checkSoftwareUpdateLock.TryLock() {
		return
	}
	defer checkSoftwareUpdateLock.Unlock()
	lastSoftwareUpdateCheck = time.Now().Unix()

	updateInfo, err := getSoftwareUpdateInfo(context.TODO())
	if nil != err {
		if isSoftwareUpdateNetworkError(err) {
			logging.LogInfof("check software update skipped: %s", err)
		} else {
			logging.LogWarnf("check software update failed: %s", err)
		}
		return
	}
	if nil == updateInfo || isVersionUpToDate(updateInfo.Version) {
		return
	}

	if !skipNewVerInstallPkg() {
		pushSoftwareUpdatePrompt(updateInfo)
		checkDownloadInstallPkg()
		return
	}

	pushSoftwareUpdatePrompt(updateInfo)
}

func pushSoftwareUpdatePrompt(updateInfo *softwareUpdateInfo) {
	if nil == updateInfo || "" == updateInfo.Version || lastSoftwareUpdatePromptedVer == updateInfo.Version {
		return
	}
	lastSoftwareUpdatePromptedVer = updateInfo.Version

	releaseURL := strings.TrimSpace(updateInfo.URL)
	if "" == releaseURL {
		releaseURL = "https://github.com/lonelyor/SourceFlow/releases/latest"
	}
	link := fmt.Sprintf("<a target='_blank' href='%s'>v%s</a>", releaseURL, updateInfo.Version)
	util.PushUpdateMsg("software-update-"+updateInfo.Version, fmt.Sprintf(Conf.Language(9), link), 30*1000)
}

func checkDownloadInstallPkg() {
	defer logging.Recover()

	if skipNewVerInstallPkg() {
		return
	}

	if !checkDownloadInstallPkgLock.TryLock() {
		return
	}
	defer checkDownloadInstallPkgLock.Unlock()

	downloadPkgURLs, checksum, err := getUpdatePkg()
	if err != nil {
		return
	}

	existingPkgPath := getNewVerInstallPkgPath()
	if "" != existingPkgPath {
		// 存在经过 sha256Hash 检查的安装包
		util.PushUpdateMsg("update-pkg-ready", Conf.Language(62), 15*1000)
		return
	}

	util.PushUpdateMsg("update-pkg-downloading", Conf.Language(103), 1000*7)
	success := false
	for _, downloadPkgURL := range downloadPkgURLs {
		err = downloadInstallPkg(downloadPkgURL, checksum)
		if err == nil {
			success = true
			break
		}
	}
	if success {
		util.PushUpdateMsg("update-pkg-ready", Conf.Language(62), 15*1000)
	} else {
		util.PushUpdateMsg("update-pkg-downloading", Conf.Language(104), 7000)
		if updateInfo, infoErr := getSoftwareUpdateInfo(context.TODO()); nil == infoErr {
			pushSoftwareUpdatePrompt(updateInfo)
		}
	}
}

func getUpdatePkg() (downloadPkgURLs []string, checksum string, err error) {
	defer logging.Recover()
	updateInfo, err := getSoftwareUpdateInfo(context.TODO())
	if err != nil {
		return
	}

	ver := updateInfo.Version
	if isVersionUpToDate(ver) {
		err = fmt.Errorf("version is up to date")
		return
	}

	pkg := updatePackageName(ver)
	if "" == pkg {
		err = fmt.Errorf("unsupported platform")
		return
	}
	if updateInfo.Assets != nil {
		if assetURL := updateInfo.Assets[pkg]; "" != assetURL {
			downloadPkgURLs = append(downloadPkgURLs, assetURL)
		}
	}
	if 1 > len(downloadPkgURLs) {
		githubURL := "https://github.com/lonelyor/SourceFlow/releases/download/v" + ver + "/" + pkg
		downloadPkgURLs = append(downloadPkgURLs, githubURL)
	}

	if updateInfo.Checksums != nil {
		checksum = updateInfo.Checksums[pkg]
	}
	if "" == checksum {
		err = fmt.Errorf("checksum is empty")
		return
	}
	return
}

func updatePackageName(ver string) string {
	var suffix string
	if gulu.OS.IsWindows() {
		if "arm64" == runtime.GOARCH {
			suffix = "win-arm64.exe"
		} else {
			suffix = "win.exe"
		}
	} else if gulu.OS.IsDarwin() {
		if "arm64" == runtime.GOARCH {
			suffix = "mac-arm64.dmg"
		} else {
			suffix = "mac.dmg"
		}
	}
	if "" == suffix {
		return ""
	}
	return "sourceflow-" + ver + "-" + suffix
}

func getSoftwareUpdateInfo(ctx context.Context) (*softwareUpdateInfo, error) {
	updateInfo, err := getGitHubReleaseUpdateInfo(ctx)
	if nil == err && nil != updateInfo {
		return updateInfo, nil
	}
	if nil != err {
		logging.LogInfof("get github release update info failed, fallback to version info: %s", err)
	}
	return getRhySoftwareUpdateInfo(ctx)
}

func getGitHubReleaseUpdateInfo(ctx context.Context) (*softwareUpdateInfo, error) {
	release := &githubReleaseInfo{}
	client := req.C().SetTLSHandshakeTimeout(7 * time.Second).SetTimeout(30 * time.Second).DisableInsecureSkipVerify()
	resp, err := client.R().
		SetContext(ctx).
		SetHeader("Accept", "application/vnd.github+json").
		SetHeader("User-Agent", util.UserAgent).
		SetSuccessResult(release).
		Get(githubLatestReleaseAPI)
	if nil != err {
		return nil, err
	}
	if 200 != resp.StatusCode {
		return nil, fmt.Errorf("github release check failed: %d", resp.StatusCode)
	}
	if release.Draft || release.Prerelease {
		return nil, errors.New("latest github release is draft or prerelease")
	}

	version := strings.TrimPrefix(strings.TrimSpace(release.TagName), "v")
	if "" == version {
		return nil, errors.New("github release tag is empty")
	}
	updateInfo := &softwareUpdateInfo{
		Version:   version,
		URL:       release.HTMLURL,
		Assets:    map[string]string{},
		Checksums: map[string]string{},
	}

	var checksumURL string
	for _, asset := range release.Assets {
		name := strings.TrimSpace(asset.Name)
		assetURL := strings.TrimSpace(asset.BrowserDownloadURL)
		if "" == name || "" == assetURL {
			continue
		}
		updateInfo.Assets[name] = assetURL
		if "SHA256SUMS.txt" == name {
			checksumURL = assetURL
		}
	}
	if "" != checksumURL {
		checksums, checksumErr := downloadReleaseChecksums(ctx, checksumURL)
		if nil == checksumErr {
			updateInfo.Checksums = checksums
		} else {
			logging.LogWarnf("download github release checksums failed: %s", checksumErr)
		}
	}
	return updateInfo, nil
}

func getRhySoftwareUpdateInfo(ctx context.Context) (*softwareUpdateInfo, error) {
	result, err := util.GetRhyResult(ctx, false)
	if err != nil {
		return nil, err
	}

	ver, _ := result["ver"].(string)
	ver = strings.TrimSpace(ver)
	if "" == ver {
		return nil, errors.New("version info has no version")
	}

	updateInfo := &softwareUpdateInfo{
		Version:   ver,
		URL:       "https://github.com/lonelyor/SourceFlow/releases/tag/v" + ver,
		Assets:    map[string]string{},
		Checksums: map[string]string{},
	}
	pkg := updatePackageName(ver)
	if "" != pkg {
		updateInfo.Assets[pkg] = "https://github.com/lonelyor/SourceFlow/releases/download/v" + ver + "/" + pkg
	}

	if checksums, ok := result["checksums"].(map[string]interface{}); ok {
		for name, rawChecksum := range checksums {
			checksum, _ := rawChecksum.(string)
			if "" != strings.TrimSpace(name) && "" != strings.TrimSpace(checksum) {
				updateInfo.Checksums[strings.TrimSpace(name)] = strings.TrimSpace(checksum)
			}
		}
	}
	return updateInfo, nil
}

func downloadReleaseChecksums(ctx context.Context, checksumURL string) (map[string]string, error) {
	buf := bytes.NewBuffer(nil)
	client := req.C().SetTLSHandshakeTimeout(7 * time.Second).SetTimeout(2 * time.Minute).DisableInsecureSkipVerify()
	resp, err := client.R().
		SetContext(ctx).
		SetHeader("User-Agent", util.UserAgent).
		SetOutput(buf).
		Get(checksumURL)
	if nil != err {
		return nil, err
	}
	if 200 != resp.StatusCode {
		return nil, fmt.Errorf("download checksums failed: %d", resp.StatusCode)
	}
	return parseSHA256SUMS(buf.String()), nil
}

func parseSHA256SUMS(content string) map[string]string {
	ret := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if "" == line || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		checksum := strings.ToLower(strings.TrimSpace(fields[0]))
		filename := strings.TrimLeft(strings.TrimSpace(fields[len(fields)-1]), "*")
		filename = path.Base(filename)
		if 64 == len(checksum) && "" != filename {
			ret[filename] = checksum
		}
	}
	return ret
}

func IsBenignSoftwareUpdateError(err error) bool {
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

func isSoftwareUpdateNetworkError(err error) bool {
	return IsBenignSoftwareUpdateError(err)
}

func downloadInstallPkg(pkgURL, checksum string) (err error) {
	if "" == pkgURL || "" == checksum {
		return
	}

	pkg := path.Base(pkgURL)
	savePath := filepath.Join(util.TempDir, "install", pkg)
	if gulu.File.IsExist(savePath) {
		localChecksum, _ := sha256Hash(savePath)
		if localChecksum == checksum {
			return
		}
	}

	err = os.MkdirAll(filepath.Join(util.TempDir, "install"), 0755)
	if err != nil {
		logging.LogErrorf("create temp install dir failed: %s", err)
		return
	}

	logging.LogInfof("downloading install package [%s]", pkgURL)
	client := req.C().SetTLSHandshakeTimeout(7 * time.Second).SetTimeout(10 * time.Minute).DisableInsecureSkipVerify()
	callback := func(info req.DownloadInfo) {
		progress := fmt.Sprintf("%.2f%%", float64(info.DownloadedSize)/float64(info.Response.ContentLength)*100.0)
		// logging.LogDebugf("downloading install package [%s %s]", pkgURL, progress)
		util.PushStatusBar(fmt.Sprintf(Conf.Language(133), progress))
	}
	_, err = client.R().SetOutputFile(savePath).SetDownloadCallbackWithInterval(callback, 1*time.Second).Get(pkgURL)
	if err != nil {
		logging.LogErrorf("download install package [%s] failed: %s", pkgURL, err)
		return
	}

	localChecksum, _ := sha256Hash(savePath)
	if checksum != localChecksum {
		logging.LogErrorf("verify checksum failed, download install package [%s] checksum [%s] not equal to downloaded [%s] checksum [%s]", pkgURL, checksum, savePath, localChecksum)
		return
	}
	logging.LogInfof("downloaded install package [%s] to [%s]", pkgURL, savePath)
	util.PushStatusBar(Conf.Language(62))
	return
}

func sha256Hash(filename string) (ret string, err error) {
	file, err := os.Open(filename)
	if err != nil {
		return
	}
	defer file.Close()

	hash := sha256.New()
	reader := bufio.NewReader(file)
	buf := make([]byte, 1024*1024*4)
	for {
		switch n, readErr := reader.Read(buf); readErr {
		case nil:
			hash.Write(buf[:n])
		case io.EOF:
			return fmt.Sprintf("%x", hash.Sum(nil)), nil
		default:
			return "", err
		}
	}
}

func isVersionUpToDate(releaseVer string) bool {
	return semver.Compare("v"+releaseVer, "v"+util.Ver) <= 0
}

// skipInstallPkgPlatformCached 缓存平台相关判断，-1 未初始化，0 表示不跳过，1 表示跳过
var skipInstallPkgPlatformCached = -1

func skipNewVerInstallPkg() bool {
	if skipInstallPkgPlatformCached == -1 {
		skipInstallPkgPlatformCached = 0
		if !gulu.OS.IsWindows() && !gulu.OS.IsDarwin() {
			skipInstallPkgPlatformCached = 1
		} else if util.ISMicrosoftStore || util.ContainerStd != util.Container {
			skipInstallPkgPlatformCached = 1
		} else if util.IsPortableMode() {
			skipInstallPkgPlatformCached = 1
		} else if gulu.OS.IsWindows() {
			plat := strings.ToLower(Conf.System.OSPlatform)
			// Windows 7, 8 and Server 2012 are no longer supported https://github.com/lonelyor/SourceFlow/issues/7347
			if strings.Contains(plat, " 7 ") || strings.Contains(plat, " 8 ") || strings.Contains(plat, "2012") {
				skipInstallPkgPlatformCached = 1
			}
		}
	}

	if skipInstallPkgPlatformCached == 1 || !Conf.System.DownloadInstallPkg {
		return true
	}
	return false
}
