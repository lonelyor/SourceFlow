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
	"github.com/lonelyor/sourceflow/third_party/go/eventbus"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"golang.org/x/mod/semver"
)

var ErrPandocNotFound = errors.New("not found executable pandoc")

var (
	pandocInitLock    sync.Mutex
	pandocInitialized bool
	pandocUpdateOnce  sync.Once
)

func ConvertPandoc(dir string, args ...string) (path string, err error) {
	EnsurePandocInitialized()
	if "" == PandocBinPath || ContainerStd != Container {
		err = ErrPandocNotFound
		return
	}

	pandoc := exec.Command(PandocBinPath, args...)
	gulu.CmdAttr(pandoc)
	path = filepath.Join("temp", "convert", "pandoc", dir)
	absPath := filepath.Join(WorkspaceDir, path)
	if err = os.MkdirAll(absPath, 0755); err != nil {
		logging.LogErrorf("mkdir [%s] failed: [%s]", absPath, err)
		return
	}
	pandoc.Dir = absPath
	output, err := pandoc.CombinedOutput()
	if err != nil {
		err = errors.Join(err, errors.New(string(output)))
		logging.LogErrorf("pandoc convert output failed: %s", err)
		return
	}
	path = "/" + filepath.ToSlash(path)
	return
}

func Pandoc(from, to, o, content string) (err error) {
	if "" == from || "" == to || "md" == to {
		if err = gulu.File.WriteFileSafer(o, []byte(content), 0644); err != nil {
			logging.LogErrorf("write export markdown file [%s] failed: %s", o, err)
		}
		return
	}

	EnsurePandocInitialized()
	if "" == PandocBinPath || ContainerStd != Container {
		err = ErrPandocNotFound
		return
	}

	dir := filepath.Join(WorkspaceDir, "temp", "convert", "pandoc", gulu.Rand.String(7))
	if err = os.MkdirAll(dir, 0755); err != nil {
		logging.LogErrorf("mkdir [%s] failed: [%s]", dir, err)
		return
	}
	tmpPath := filepath.Join(dir, gulu.Rand.String(7))
	if err = os.WriteFile(tmpPath, []byte(content), 0644); err != nil {
		logging.LogErrorf("write file failed: [%s]", err)
		return
	}

	args := []string{
		tmpPath,
		"--from", from,
		"--to", to,
		"--resource-path", filepath.Dir(o),
		"-s",
		"-o", o,
	}

	pandoc := exec.Command(PandocBinPath, args...)
	gulu.CmdAttr(pandoc)
	output, err := pandoc.CombinedOutput()
	if err != nil {
		logging.LogErrorf("pandoc convert output [%s], error [%s]", string(output), err)
		return
	}
	return
}

var (
	PandocBinPath         string // Pandoc 可执行文件路径
	PandocBinManaged      bool   // 是否为 SourceFlow 自动管理的内置 Pandoc
	PandocTemplatePath    string // Pandoc Docx 模板文件路径
	PandocColorFilterPath string // Pandoc 颜色过滤器路径
)

func InitPandoc() {
	if ContainerStd != Container {
		return
	}

	pandocInitLock.Lock()
	defer pandocInitLock.Unlock()
	if pandocInitialized && "" != PandocBinPath && IsValidPandocBin(PandocBinPath) {
		return
	}

	initPandoc()
	pandocInitialized = true
}

func EnsurePandocInitialized() {
	if ContainerStd != Container {
		return
	}
	if pandocInitialized && "" != PandocBinPath && IsValidPandocBin(PandocBinPath) {
		return
	}
	InitPandoc()
}

func initPandoc() {
	defer eventbus.Publish(EvtConfPandocInitialized)

	PandocBinPath = ""
	PandocBinManaged = false
	initPandocResourcePaths()

	if initBuiltInPandoc() {
		go AutoUpdateBuiltInPandoc()
		return
	}
	if initCustomPandoc() {
		return
	}
	logging.LogErrorf("pandoc unavailable: built-in pandoc is not usable and no valid custom pandoc path is configured")
}

func initPandocResourcePaths() {
	templatePath := filepath.Join(WorkingDir, "pandoc-resources", "pandoc-template.docx")
	if !gulu.File.IsExist(templatePath) {
		templatePath = filepath.Join(WorkingDir, "pandoc", "pandoc-resources", "pandoc-template.docx")
	}
	if gulu.File.IsExist(templatePath) {
		PandocTemplatePath = templatePath
	} else {
		PandocTemplatePath = ""
		logging.LogWarnf("pandoc template file not found")
	}

	colorFilterPath := filepath.Join(WorkingDir, "pandoc-resources", "pandoc_color_filter.lua")
	if !gulu.File.IsExist(colorFilterPath) {
		colorFilterPath = filepath.Join(WorkingDir, "pandoc", "pandoc-resources", "pandoc_color_filter.lua")
	}
	if gulu.File.IsExist(colorFilterPath) {
		PandocColorFilterPath = colorFilterPath
	} else {
		PandocColorFilterPath = ""
		logging.LogWarnf("pandoc color filter file not found")
	}
}

func initBuiltInPandoc() bool {
	if binPath, pandocVer := bestInstalledBuiltInPandoc(); "" != pandocVer {
		PandocBinPath = binPath
		PandocBinManaged = true
		logging.LogInfof("built-in pandoc [ver=%s, bin=%s]", pandocVer, PandocBinPath)
		return true
	}

	pandocZip := builtInPandocZipPath()
	if !gulu.File.IsExist(pandocZip) {
		logging.LogErrorf("pandoc zip [%s] not found", pandocZip)
		return false
	}

	for _, installDir := range builtInPandocInstallDirCandidates() {
		if err := installBuiltInPandoc(pandocZip, installDir); err != nil {
			logging.LogWarnf("install built-in pandoc to [%s] failed: %s", installDir, err)
			continue
		}

		binPath := builtInPandocBinPath(installDir)
		if pandocVer := getPandocVer(binPath); "" != pandocVer {
			PandocBinPath = binPath
			PandocBinManaged = true
			logging.LogInfof("initialized built-in pandoc [ver=%s, bin=%s]", pandocVer, PandocBinPath)
			return true
		}
		logging.LogWarnf("installed built-in pandoc [%s] is not executable", binPath)
	}
	return false
}

func bestInstalledBuiltInPandoc() (binPath, pandocVer string) {
	for _, candidate := range installedBuiltInPandocBinPathCandidates() {
		candidateVer := getPandocVer(candidate)
		if "" == candidateVer {
			continue
		}
		if "" == pandocVer || comparePandocVersion(candidateVer, pandocVer) > 0 {
			binPath = candidate
			pandocVer = candidateVer
		}
	}
	return
}

func installedBuiltInPandocBinPathCandidates() []string {
	var ret []string
	for _, installDir := range builtInPandocInstallDirCandidates() {
		ret = appendCleanPath(ret, builtInPandocBinPath(installDir))
	}

	platformDirName := pandocPlatformDirName()
	for _, runtimeRoot := range builtInPandocRuntimeRoots() {
		pandocRoot := filepath.Join(runtimeRoot, "pandoc")
		entries, err := os.ReadDir(pandocRoot)
		if nil != err {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			ret = appendCleanPath(ret, builtInPandocBinPath(filepath.Join(pandocRoot, entry.Name(), platformDirName)))
		}
	}
	return ret
}

func installBuiltInPandoc(pandocZip, installDir string) error {
	if "" == pandocZip || "" == installDir {
		return errors.New("pandoc zip and install dir are required")
	}

	parentDir := filepath.Dir(installDir)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return err
	}

	stagingDir := installDir + ".installing"
	if err := os.RemoveAll(stagingDir); err != nil {
		return err
	}
	defer os.RemoveAll(stagingDir)

	if err := gulu.Zip.Unzip(pandocZip, stagingDir); err != nil {
		return err
	}

	stagingBinPath := builtInPandocBinPath(stagingDir)
	if gulu.OS.IsDarwin() || gulu.OS.IsLinux() {
		exec.Command("chmod", "+x", stagingBinPath).CombinedOutput()
	}
	if "" == getPandocVer(stagingBinPath) {
		return errors.New("installed pandoc is not executable")
	}

	if err := os.RemoveAll(installDir); err != nil {
		return err
	}
	return os.Rename(stagingDir, installDir)
}

func initCustomPandoc() bool {
	customPandocBinPath := configuredPandocBinPath()
	if "" == customPandocBinPath {
		return false
	}
	if isLegacyTempPandocBinPath(customPandocBinPath) {
		logging.LogWarnf("ignore legacy temporary pandoc path [%s]", customPandocBinPath)
		return false
	}
	if !IsValidPandocBin(customPandocBinPath) {
		logging.LogWarnf("custom pandoc [%s] is not valid", customPandocBinPath)
		return false
	}

	PandocBinPath = customPandocBinPath
	PandocBinManaged = false
	logging.LogInfof("custom pandoc [bin=%s]", PandocBinPath)
	return true
}

func builtInPandocZipPath() string {
	pandocZip := filepath.Join(WorkingDir, "pandoc.zip")
	if gulu.File.IsExist(pandocZip) {
		return pandocZip
	}

	zipName := platformPandocZipName()
	if "" == zipName {
		return pandocZip
	}
	return filepath.Join(WorkingDir, "pandoc", zipName)
}

func platformPandocZipName() string {
	if gulu.OS.IsWindows() {
		if "amd64" == runtime.GOARCH {
			return "pandoc-windows-amd64.zip"
		}
	} else if gulu.OS.IsDarwin() {
		if "amd64" == runtime.GOARCH {
			return "pandoc-darwin-amd64.zip"
		} else if "arm64" == runtime.GOARCH {
			return "pandoc-darwin-arm64.zip"
		}
	} else if gulu.OS.IsLinux() {
		if "amd64" == runtime.GOARCH {
			return "pandoc-linux-amd64.zip"
		} else if "arm64" == runtime.GOARCH {
			return "pandoc-linux-arm64.zip"
		}
	}
	return ""
}

func builtInPandocInstallDirCandidates() []string {
	subDir := filepath.Join("pandoc", "v"+Ver, pandocPlatformDirName())
	return builtInPandocInstallDirCandidatesBySubDir(subDir)
}

func builtInPandocInstallDirCandidatesBySubDir(subDir string) []string {
	var ret []string
	for _, runtimeRoot := range builtInPandocRuntimeRoots() {
		ret = appendCleanPath(ret, filepath.Join(runtimeRoot, subDir))
	}
	return ret
}

func builtInPandocVersionInstallDirCandidates(version string) []string {
	version = normalizePandocVersion(version)
	if "" == version {
		return nil
	}
	subDir := filepath.Join("pandoc", "v"+version, pandocPlatformDirName())
	return builtInPandocInstallDirCandidatesBySubDir(subDir)
}

func builtInPandocRuntimeRoots() []string {
	var ret []string
	if portableRoot := GetPortableRootDir(); "" != portableRoot {
		ret = appendCleanPath(ret, filepath.Join(portableRoot, "pandoc-runtime"))
	}
	ret = appendCleanPath(ret, filepath.Join(WorkingDir, "pandoc-runtime"))
	ret = appendCleanPath(ret, filepath.Join(GetUserConfDir(), "pandoc-runtime"))
	return ret
}

func pandocPlatformDirName() string {
	return runtime.GOOS + "-" + runtime.GOARCH
}

func appendCleanPath(paths []string, path string) []string {
	path = strings.TrimSpace(path)
	if "" == path {
		return paths
	}
	path = filepath.Clean(path)
	for _, p := range paths {
		if p == path {
			return paths
		}
	}
	return append(paths, path)
}

func builtInPandocBinPath(installDir string) string {
	if gulu.OS.IsWindows() {
		return filepath.Join(installDir, "bin", "pandoc.exe")
	}
	return filepath.Join(installDir, "bin", "pandoc")
}

func configuredPandocBinPath() string {
	confPath := filepath.Join(ConfDir, "conf.json")
	if !gulu.File.IsExist(confPath) {
		return ""
	}

	data, err := os.ReadFile(confPath)
	if nil != err {
		return ""
	}
	conf := map[string]interface{}{}
	if err = gulu.JSON.UnmarshalJSON(data, &conf); nil != err {
		return ""
	}
	export, ok := conf["export"].(map[string]interface{})
	if !ok {
		return ""
	}
	customPandocBinPath, _ := export["pandocBin"].(string)
	return strings.TrimSpace(RemoveInvalid(customPandocBinPath))
}

func isLegacyTempPandocBinPath(binPath string) bool {
	if "" == TempDir || "" == binPath {
		return false
	}
	legacyTempPandocDir := filepath.Join(TempDir, "pandoc")
	binPath = filepath.Clean(binPath)
	return binPath == legacyTempPandocDir || IsSubPath(legacyTempPandocDir, binPath)
}

type pandocUpdateManifest struct {
	Version string
	URLs    []string
	SHA256  string
}

func AutoUpdateBuiltInPandoc() {
	pandocUpdateOnce.Do(func() {
		defer logging.Recover()
		checkBuiltInPandocUpdate(context.TODO())
	})
}

func checkBuiltInPandocUpdate(ctx context.Context) {
	if ContainerStd != Container || !PandocBinManaged || "" == PandocBinPath {
		return
	}

	manifest, err := getBuiltInPandocUpdateManifest(ctx)
	if nil != err {
		if isBenignRhyNetworkError(err) {
			logging.LogInfof("check pandoc update skipped: %s", err)
		} else {
			logging.LogWarnf("check pandoc update failed: %s", err)
		}
		return
	}
	if nil == manifest {
		return
	}

	currentVer := getPandocVer(PandocBinPath)
	if !isPandocUpdateNewer(manifest.Version, currentVer) {
		return
	}

	zipPath, err := downloadPandocUpdateZip(manifest)
	if nil != err {
		logging.LogWarnf("download pandoc update [ver=%s] failed: %s", manifest.Version, err)
		return
	}

	pandocInitLock.Lock()
	defer pandocInitLock.Unlock()
	for _, installDir := range builtInPandocVersionInstallDirCandidates(manifest.Version) {
		if err = installBuiltInPandoc(zipPath, installDir); nil != err {
			logging.LogWarnf("install pandoc update [ver=%s, dir=%s] failed: %s", manifest.Version, installDir, err)
			continue
		}

		binPath := builtInPandocBinPath(installDir)
		installedVer := getPandocVer(binPath)
		if !samePandocVersion(installedVer, manifest.Version) {
			logging.LogWarnf("installed pandoc update version mismatch [want=%s, got=%s, bin=%s]", manifest.Version, installedVer, binPath)
			continue
		}

		PandocBinPath = binPath
		PandocBinManaged = true
		pandocInitialized = true
		logging.LogInfof("updated built-in pandoc [ver=%s, bin=%s]", installedVer, PandocBinPath)
		eventbus.Publish(EvtConfPandocInitialized)
		return
	}
}

func getBuiltInPandocUpdateManifest(ctx context.Context) (*pandocUpdateManifest, error) {
	result, err := GetRhyResult(ctx, false)
	if nil != err {
		return nil, err
	}
	raw, ok := result["pandoc"]
	if !ok || nil == raw {
		return nil, nil
	}

	manifest := parsePandocUpdateManifestValue(raw, pandocPlatformDirName())
	if nil == manifest || "" == manifest.Version || 1 > len(manifest.URLs) || "" == manifest.SHA256 {
		return nil, nil
	}
	return manifest, nil
}

func parsePandocUpdateManifestValue(raw any, platformKey string) *pandocUpdateManifest {
	m, ok := raw.(map[string]interface{})
	if !ok {
		return nil
	}
	if platformRaw, exists := m[platformKey]; exists {
		return parsePandocUpdateManifestValue(platformRaw, platformKey)
	}

	manifest := &pandocUpdateManifest{
		Version: stringFromAny(m["version"]),
		SHA256:  strings.ToLower(stringFromAny(m["sha256"])),
	}
	manifest.URLs = append(manifest.URLs, stringListFromAny(m["urls"])...)
	if url := stringFromAny(m["url"]); "" != url {
		manifest.URLs = appendUniqueString(manifest.URLs, url)
	}
	return manifest
}

func stringFromAny(value any) string {
	s, _ := value.(string)
	return strings.TrimSpace(s)
}

func stringListFromAny(value any) []string {
	var ret []string
	switch v := value.(type) {
	case []interface{}:
		for _, item := range v {
			if s := stringFromAny(item); "" != s {
				ret = appendUniqueString(ret, s)
			}
		}
	case []string:
		for _, item := range v {
			if s := strings.TrimSpace(item); "" != s {
				ret = appendUniqueString(ret, s)
			}
		}
	}
	return ret
}

func appendUniqueString(values []string, value string) []string {
	value = strings.TrimSpace(value)
	if "" == value {
		return values
	}
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}

func downloadPandocUpdateZip(manifest *pandocUpdateManifest) (zipPath string, err error) {
	if nil == manifest || "" == manifest.SHA256 || 1 > len(manifest.URLs) {
		return "", errors.New("pandoc update manifest is incomplete")
	}

	downloadDir := filepath.Join(GetUserConfDir(), "pandoc-runtime", "downloads")
	if err = os.MkdirAll(downloadDir, 0755); nil != err {
		return
	}
	savePath := filepath.Join(downloadDir, manifest.SHA256+".zip")
	if sameFileSHA256(savePath, manifest.SHA256) {
		return savePath, nil
	}

	var lastErr error
	for _, url := range manifest.URLs {
		tmpPath := savePath + ".downloading"
		_ = os.Remove(tmpPath)
		logging.LogInfof("downloading pandoc update [ver=%s, url=%s]", manifest.Version, url)
		client := req.C().SetTLSHandshakeTimeout(7 * time.Second).SetTimeout(10 * time.Minute).DisableInsecureSkipVerify()
		_, lastErr = client.R().SetOutputFile(tmpPath).Get(url)
		if nil != lastErr {
			logging.LogWarnf("download pandoc update [%s] failed: %s", url, lastErr)
			continue
		}
		if !sameFileSHA256(tmpPath, manifest.SHA256) {
			localSHA, _ := fileSHA256(tmpPath)
			lastErr = fmt.Errorf("checksum mismatch for %s: want %s got %s", path.Base(url), manifest.SHA256, localSHA)
			logging.LogWarnf("verify pandoc update failed: %s", lastErr)
			continue
		}
		_ = os.Remove(savePath)
		if err = os.Rename(tmpPath, savePath); nil != err {
			lastErr = err
			continue
		}
		return savePath, nil
	}
	if nil == lastErr {
		lastErr = errors.New("no pandoc update url available")
	}
	return "", lastErr
}

func sameFileSHA256(filename, expected string) bool {
	actual, err := fileSHA256(filename)
	return nil == err && strings.EqualFold(actual, strings.TrimSpace(expected))
}

func fileSHA256(filename string) (ret string, err error) {
	file, err := os.Open(filename)
	if nil != err {
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
			return "", readErr
		}
	}
}

func isPandocUpdateNewer(remoteVer, currentVer string) bool {
	return comparePandocVersion(remoteVer, currentVer) > 0
}

func samePandocVersion(a, b string) bool {
	return 0 == comparePandocVersion(a, b)
}

func comparePandocVersion(a, b string) int {
	a = normalizePandocVersion(a)
	b = normalizePandocVersion(b)
	if "" == a && "" == b {
		return 0
	}
	if "" == a {
		return -1
	}
	if "" == b {
		return 1
	}
	semverA := "v" + a
	semverB := "v" + b
	if semver.IsValid(semverA) && semver.IsValid(semverB) {
		return semver.Compare(semverA, semverB)
	}
	return strings.Compare(a, b)
}

func normalizePandocVersion(version string) string {
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "pandoc")
	version = strings.TrimSpace(version)
	version = strings.TrimPrefix(version, "v")
	if i := strings.IndexAny(version, " \t\r\n"); 0 <= i {
		version = version[:i]
	}
	return strings.TrimSpace(version)
}

func getPandocVer(binPath string) (ret string) {
	if "" == binPath {
		return
	}

	cmd := exec.Command(binPath, "--version")
	gulu.CmdAttr(cmd)
	data, err := cmd.CombinedOutput()
	if err == nil && strings.HasPrefix(string(data), "pandoc") {
		parts := bytes.Split(data, []byte("\n"))
		if 0 < len(parts) {
			ret = strings.TrimPrefix(string(parts[0]), "pandoc")
			ret = strings.ReplaceAll(ret, ".exe", "")
			ret = strings.TrimSpace(ret)
		}
		return
	}
	return
}

func IsValidPandocBin(binPath string) bool {
	if "" == binPath {
		return false
	}

	// 解析符号链接
	if real, err := filepath.EvalSymlinks(binPath); err == nil {
		binPath = real
	}

	// 文件信息检查
	fi, err := os.Stat(binPath)
	if err != nil || fi.IsDir() || !fi.Mode().IsRegular() {
		return false
	}

	// 读取文件头判断是否为二进制并排除脚本（#!）
	f, err := os.Open(binPath)
	if err != nil {
		return false
	}
	defer f.Close()

	header := make([]byte, 16)
	n, _ := f.Read(header)
	header = header[:n]

	// 拒绝以 shebang 开头的脚本
	if bytes.HasPrefix(header, []byte("#!")) {
		return false
	}

	isBin := false
	// 常见二进制魔数：ELF, PE("MZ"), Mach-O (32/64, big/little), FAT
	if len(header) >= 4 {
		switch {
		case bytes.Equal(header[:4], []byte{0x7f, 'E', 'L', 'F'}):
			isBin = true // ELF
		// Mach-O / Mach-O swapped (32-bit)
		case bytes.Equal(header[:4], []byte{0xfe, 0xed, 0xfa, 0xce}), bytes.Equal(header[:4], []byte{0xce, 0xfa, 0xed, 0xfe}):
			isBin = true
		// Mach-O 64-bit / swapped
		case bytes.Equal(header[:4], []byte{0xfe, 0xed, 0xfa, 0xcf}), bytes.Equal(header[:4], []byte{0xcf, 0xfa, 0xed, 0xfe}):
			isBin = true
		// FAT / FAT swapped
		case bytes.Equal(header[:4], []byte{0xca, 0xfe, 0xba, 0xbe}), bytes.Equal(header[:4], []byte{0xbe, 0xba, 0xfe, 0xca}):
			isBin = true
		}
	}
	// PE only needs first 2 bytes "MZ"
	if !isBin && len(header) >= 2 && bytes.Equal(header[:2], []byte{'M', 'Z'}) {
		isBin = true
	}

	// Windows 上允许 .exe 文件（作为补充判断）
	if !isBin && gulu.OS.IsWindows() {
		ext := strings.ToLower(filepath.Ext(binPath))
		if ext == ".exe" {
			isBin = true
		}
	}

	if !isBin {
		logging.LogWarnf("file [%s] is not a valid binary executable", binPath)
		return false
	}

	cmd := exec.Command(binPath, "--version")
	gulu.CmdAttr(cmd)
	data, err := cmd.CombinedOutput()
	if err == nil && strings.HasPrefix(string(data), "pandoc") {
		return true
	}
	return false
}
