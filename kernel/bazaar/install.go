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

package bazaar

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/imroc/req/v3"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"golang.org/x/sync/singleflight"
)

var downloadPackageFlight singleflight.Group

// downloadBazaarFile 下载集市文件
func downloadBazaarFile(repoURLHash string, pushProgress bool) (data []byte, err error) {
	repoURLHashTrimmed := strings.TrimPrefix(repoURLHash, "https://github.com/")
	v, err, _ := downloadPackageFlight.Do(repoURLHash, func() (interface{}, error) {
		// repoURLHash: https://github.com/88250/Comfortably-Numb@6286912c381ef3f83e455d06ba4d369c498238dc 或带路径 /README.md
		repoURL := repoURLHash[:strings.LastIndex(repoURLHash, "@")]
		var lastStatus string
		for _, u := range util.GetBazaarPackageURLs(repoURLHashTrimmed) {
			buf := &bytes.Buffer{}
			resp, reqErr := httpclient.NewCloudFileRequest2m().SetOutput(buf).SetDownloadCallback(func(info req.DownloadInfo) {
				if pushProgress && info.Response != nil && 0 < info.Response.ContentLength {
					progress := float32(info.DownloadedSize) / float32(info.Response.ContentLength)
					util.PushDownloadProgress(repoURL, progress)
				}
			}).Get(u)
			if reqErr != nil {
				logging.LogWarnf("get bazaar package [%s] failed: %s", u, reqErr)
				continue
			}
			if 200 != resp.StatusCode {
				logging.LogWarnf("get bazaar package [%s] failed: %d", u, resp.StatusCode)
				lastStatus = resp.Status
				continue
			}
			return buf.Bytes(), nil
		}
		if "" != lastStatus {
			return nil, errors.New("get bazaar package failed: " + lastStatus)
		}
		return nil, errors.New("get bazaar package failed, please check your network")
	})
	if err != nil {
		return nil, err
	}
	return v.([]byte), nil
}

func calcArchiveSHA256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func verifyArchiveIntegrity(data []byte, expected string) error {
	expected = strings.TrimSpace(strings.ToLower(expected))
	if "" == expected {
		return nil
	}
	actual := calcArchiveSHA256Hex(data)
	if actual != expected {
		return fmt.Errorf("archive SHA-256 mismatch: expected %s, got %s", expected, actual)
	}
	return nil
}

// incPackageDownloads 增加集市包下载次数
func incPackageDownloads(repoURL, systemID string) {
	if util.IsPortableMode() {
		return
	}
	if "" == systemID {
		return
	}
	repo := strings.TrimPrefix(repoURL, "https://github.com/")
	u := util.GetCloudServer() + "/apis/sourceflow/bazaar/addBazaarPackageDownloadCount"
	httpclient.NewCloudRequest30s().SetBody(
		map[string]interface{}{
			"systemID": systemID,
			"repo":     repo,
		}).Post(u)
}

// InstallPackage 安装集市包
func InstallPackage(repoURL, repoHash, installPath, systemID, pkgType, packageName string) error {
	repoURLHash := repoURL + "@" + repoHash
	data, err := downloadBazaarFile(repoURLHash, true)
	if err != nil {
		return err
	}

	repoURLHashTrimmed := strings.TrimPrefix(repoURLHash, "https://github.com/")
	repo := getStageRepoByURL(context.Background(), pkgType, repoURLHashTrimmed)
	archiveIntegrity := ""
	if nil != repo && nil != repo.Package {
		archiveIntegrity = repo.Package.ArchiveSHA256
	}
	if err = verifyArchiveIntegrity(data, archiveIntegrity); err != nil {
		logging.LogErrorf("verify bazaar package [%s] integrity failed: %s", repoURLHashTrimmed, err)
		return errors.New("verify bazaar package failed, please refresh the marketplace list and try again")
	}
	if err = installPackage(data, installPath); err != nil {
		return err
	}

	// 记录安装时间
	now := time.Now()
	setPackageInstallTime(pkgType, packageName, now)
	if "" == archiveIntegrity {
		archiveIntegrity = calcArchiveSHA256Hex(data)
	}
	SetPackageInstallRecord(pkgType, packageName, now, "github-bazaar", repoURL, archiveIntegrity)

	// 文件夹的修改时间设置为当前安装时间
	if err = os.Chtimes(installPath, now, now); err != nil {
		logging.LogWarnf("set package [%s] folder mtime failed: %s", packageName, err)
	}

	go incPackageDownloads(repoURL, systemID)
	return nil
}

func installPackage(data []byte, installPath string) (err error) {
	tmpPackage := filepath.Join(util.TempDir, "bazaar", "package")
	if err = os.MkdirAll(tmpPackage, 0755); err != nil {
		return
	}
	name := gulu.Rand.String(7)
	tmp := filepath.Join(tmpPackage, name+".zip")
	if err = os.WriteFile(tmp, data, 0644); err != nil {
		return
	}

	unzipPath := filepath.Join(tmpPackage, name)
	if err = gulu.Zip.Unzip(tmp, unzipPath); err != nil {
		logging.LogErrorf("write file [%s] failed: %s", installPath, err)
		return
	}

	dirs, err := os.ReadDir(unzipPath)
	if err != nil {
		return
	}

	srcPath := unzipPath
	if 1 == len(dirs) && dirs[0].IsDir() {
		srcPath = filepath.Join(unzipPath, dirs[0].Name())
	}

	if err = filelock.Copy(srcPath, installPath); err != nil {
		return
	}
	return
}

// UninstallPackage 卸载集市包
func UninstallPackage(installPath string) (err error) {
	if err = os.RemoveAll(installPath); err != nil {
		logging.LogErrorf("remove [%s] failed: %s", installPath, err)
		return fmt.Errorf("remove community package [%s] failed", filepath.Base(installPath))
	}
	return
}
