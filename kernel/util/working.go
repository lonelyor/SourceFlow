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
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	figure "github.com/common-nighthawk/go-figure"
	"github.com/gofrs/flock"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/go-humanize"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

// var Mode = "dev"
var Mode = "prod"

const (
	Ver       = "0.1.4"
	IsInsider = false
)

var (
	RunInContainer                 = false // 是否运行在容器中
	SourceFlowAccessAuthCodeBypass = false // 是否跳过空访问授权码检查
)

func getEnvAny(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); "" != value {
			return value
		}
	}
	return ""
}

func initEnvVars() {
	RunInContainer = isRunningInDockerContainer()
	var err error
	if SourceFlowAccessAuthCodeBypass, err = strconv.ParseBool(GetEnv(AccessAuthCodeBypassEnv)); err != nil {
		SourceFlowAccessAuthCodeBypass = false
	}
}

var (
	bootProgress = atomic.Int32{} // 启动进度，从 0 到 100
	bootDetails  string           // 启动细节描述
	HttpServer   *http.Server     // HTTP 伺服器实例
	HttpServing  = false          // 是否 HTTP 伺服已经可用
)

// If a commandline parameter is empty, fallback to the env var.
//
// "empty" means the parameter is not set or set to an empty string.
// It returns a pointer to string, to be a drop-in replacement for
// the commandline parameter itself.
func coalesceToEnvVar(fromCLI *string, envVarNames ...string) *string {
	if fromCLI == nil || "" == *fromCLI {
		ret := getEnvAny(envVarNames...)
		return &ret
	}
	return fromCLI
}

func Boot() {
	initEnvVars()
	IncBootProgress(3, "Booting kernel...")
	initMime()
	initHttpClient()

	workspacePath := flag.String("workspace", "", "dir path of the workspace, default to ~/SourceFlow/")
	wdPath := flag.String("wd", WorkingDir, "working directory of SourceFlow")
	port := flag.String("port", "0", "port of the HTTP server")
	readOnly := flag.String("readonly", "false", "read-only mode")
	accessAuthCode := flag.String("accessAuthCode", "", "access auth code")
	ssl := flag.Bool("ssl", false, "for https and wss")
	lang := flag.String("lang", "", "en_US/zh_CN")
	mode := flag.String("mode", "prod", "dev/prod")
	flag.Parse()

	// Fallback to env vars if commandline args are not set
	// valid only for CLI args that default to "", as the
	// others have explicit (sane) defaults
	workspacePath = coalesceToEnvVar(workspacePath, WorkspacePathEnv)
	accessAuthCode = coalesceToEnvVar(accessAuthCode, AccessAuthCodeEnv)
	lang = coalesceToEnvVar(lang, LangEnv)

	if "" != *wdPath {
		WorkingDir = *wdPath
	}
	if "" != *lang {
		Lang = *lang
	}
	Mode = *mode
	ServerPort = *port
	ReadOnly, _ = strconv.ParseBool(*readOnly)
	AccessAuthCode = *accessAuthCode
	AccessAuthCode = strings.TrimSpace(AccessAuthCode)
	AccessAuthCode = RemoveInvalid(AccessAuthCode)
	Container = ContainerStd
	if RunInContainer {
		Container = ContainerDocker
		if "" == AccessAuthCode { // Still empty?
			interruptBoot := true

			// Set the env `SOURCEFLOW_ACCESS_AUTH_CODE_BYPASS=true` to skip checking empty access auth code https://github.com/lonelyor/SourceFlow/issues/9709
			if SourceFlowAccessAuthCodeBypass {
				interruptBoot = false
				fmt.Println("bypass access auth code check since the env [SOURCEFLOW_ACCESS_AUTH_CODE_BYPASS] is set to [true]")
			}

			if interruptBoot {
				// The access authorization code command line parameter must be set when deploying via Docker https://github.com/lonelyor/SourceFlow/issues/9328
				fmt.Printf("the access authorization code command line parameter (--accessAuthCode) must be set when deploying via Docker\n")
				fmt.Printf("or you can set the SOURCEFLOW_ACCESS_AUTH_CODE env var")
				os.Exit(logging.ExitCodeSecurityRisk)
			}
		}
	}
	if ContainerStd != Container {
		ServerPort = FixedPort
	}

	msStoreFilePath := filepath.Join(WorkingDir, "ms-store")
	ISMicrosoftStore = gulu.File.IsExist(msStoreFilePath)

	UserAgent = UserAgent + " " + Container + "/" + runtime.GOOS
	httpclient.SetUserAgent(UserAgent)

	initWorkspaceDir(*workspacePath)

	SSL = *ssl
	LogPath = filepath.Join(TempDir, "sourceflow.log")
	logging.SetLogPath(LogPath)

	// 工作空间仅允许被一个内核进程伺服
	tryLockWorkspace()

	AppearancePath = filepath.Join(ConfDir, "appearance")
	if "dev" == Mode {
		ThemesPath = filepath.Join(WorkingDir, "appearance", "themes")
		IconsPath = filepath.Join(WorkingDir, "appearance", "icons")
	} else {
		ThemesPath = filepath.Join(AppearancePath, "themes")
		IconsPath = filepath.Join(AppearancePath, "icons")
	}

	initPathDir()

	bootBanner := figure.NewColorFigure("SourceFlow", "isometric3", "green", true)
	logging.LogInfof("%s", "\n" + bootBanner.String())
	logBootInfo()
}

var bootDetailsLock = sync.Mutex{}

func setBootDetails(details string) {
	bootDetailsLock.Lock()
	bootDetails = "v" + Ver + " " + details
	bootDetailsLock.Unlock()
}

func SetBootDetails(details string) {
	if 100 <= bootProgress.Load() {
		return
	}
	setBootDetails(details)
}

func IncBootProgress(progress int32, details string) {
	if 100 <= bootProgress.Load() {
		return
	}
	bootProgress.Add(progress)
	setBootDetails(details)
}

func IsBooted() bool {
	return 100 <= bootProgress.Load()
}

func GetBootProgressDetails() (progress int32, details string) {
	progress = bootProgress.Load()
	bootDetailsLock.Lock()
	details = bootDetails
	bootDetailsLock.Unlock()
	return
}

func GetBootProgress() int32 {
	return bootProgress.Load()
}

func SetBooted() {
	setBootDetails("Finishing boot...")
	bootProgress.Store(100)
	logging.LogInfof("kernel booted")
}

var (
	HomeDir, _    = gulu.OS.Home()
	WorkingDir, _ = os.Getwd()

	WorkspaceDir       string            // 工作空间目录路径
	WorkspaceName      string            // 工作空间名称
	WorkspaceLock      *flock.Flock      // 工作空间锁
	ConfDir            string            // 配置目录路径
	DataDir            string            // 数据目录路径
	RepoDir            string            // 仓库目录路径
	HistoryDir         string            // 数据历史目录路径
	TempDir            string            // 临时目录路径
	LogPath            string            // 配置目录下的日志文件 sourceflow.log 路径
	DBName             = "sourceflow.db" // SQLite 数据库文件名
	DBPath             string            // SQLite 数据库文件路径
	HistoryDBPath      string            // SQLite 历史数据库文件路径
	AssetContentDBPath string            // SQLite 资源文件内容数据库文件路径
	BlockTreeDBPath    string            // 区块树数据库文件路径
	AppearancePath     string            // 配置目录下的外观目录 appearance/ 路径
	ThemesPath         string            // 配置目录下的外观目录下的 themes/ 路径
	IconsPath          string            // 配置目录下的外观目录下的 icons/ 路径
	SnippetsPath       string            // 数据目录下的 snippets/ 路径
	ShortcutsPath      string            // 用户配置目录下的快捷方式目录路径

	UIProcessIDs = sync.Map{} // UI 进程 ID
)

func GetPortableRootDir() string {
	portableDir := GetEnv(PortableDirEnv)
	if "" == portableDir {
		return ""
	}
	return filepath.Clean(portableDir)
}

func IsPortableMode() bool {
	return "" != GetPortableRootDir()
}

func isPathUnderPortableRoot(workspacePath string) bool {
	portableDir := GetPortableRootDir()
	if "" == portableDir {
		return true
	}

	workspacePath = strings.TrimSpace(workspacePath)
	if "" == workspacePath {
		return false
	}
	if !filepath.IsAbs(workspacePath) {
		workspacePath = resolveWorkspacePath(workspacePath)
	}
	workspacePath = filepath.Clean(workspacePath)
	portableDir = filepath.Clean(portableDir)
	return workspacePath == portableDir || IsSubPath(portableDir, workspacePath)
}

func IsPortableWorkspacePath(workspacePath string) bool {
	workspacePath = strings.TrimSpace(workspacePath)
	return "" != resolveWorkspacePath(workspacePath)
}

func IsPortablePath(path string) bool {
	return isPathUnderPortableRoot(path)
}

func GetUserConfDir() string {
	confDir := GetEnv(ConfigDirEnv)
	if portableDir := GetPortableRootDir(); "" != portableDir {
		if "" == confDir {
			confDir = "userdata"
		}
		confDir = filepath.FromSlash(confDir)
		if filepath.IsAbs(confDir) {
			rel, err := filepath.Rel(portableDir, confDir)
			if err != nil || filepath.IsAbs(rel) {
				confDir = "userdata"
			} else {
				confDir = rel
			}
		}
		return filepath.Join(portableDir, filepath.Clean(confDir))
	}
	if "" != confDir {
		return filepath.Clean(confDir)
	}
	return filepath.Join(HomeDir, ".config", "sourceflow")
}

func GetPortableWorkspaceConfPath() string {
	return filepath.Join(GetUserConfDir(), "portable", "workspace.json")
}

func GetWorkspaceConfPath() string {
	if IsPortableMode() {
		return GetPortableWorkspaceConfPath()
	}
	return filepath.Join(GetUserConfDir(), "workspace.json")
}

func GetDefaultWorkspaceDir() string {
	workspaceDir := GetEnv(DefaultWorkspaceEnv)
	if portableDir := GetPortableRootDir(); "" != portableDir {
		if "" == workspaceDir {
			workspaceDir = "workspace"
		}
		workspaceDir = filepath.FromSlash(workspaceDir)
		if filepath.IsAbs(workspaceDir) {
			rel, err := filepath.Rel(portableDir, workspaceDir)
			if err != nil || filepath.IsAbs(rel) {
				workspaceDir = "workspace"
			} else {
				workspaceDir = rel
			}
		}
		return filepath.Join(portableDir, filepath.Clean(workspaceDir))
	}
	if "" != workspaceDir {
		return filepath.Clean(workspaceDir)
	}

	defaultWorkspaceDir := filepath.Join(HomeDir, "SourceFlow")
	if gulu.OS.IsWindows() {
		// 改进 Windows 端默认工作空间路径 https://github.com/lonelyor/SourceFlow/issues/5622
		if userProfile := os.Getenv("USERPROFILE"); "" != userProfile {
			defaultWorkspaceDir = filepath.Join(userProfile, "SourceFlow")
		}
	}
	return defaultWorkspaceDir
}

func resolveWorkspacePath(workspacePath string) string {
	workspacePath = strings.TrimRight(strings.TrimSpace(workspacePath), " \t\n")
	if "" == workspacePath {
		return ""
	}
	if filepath.IsAbs(workspacePath) {
		return filepath.Clean(workspacePath)
	}
	workspacePath = filepath.FromSlash(workspacePath)
	if portableDir := GetPortableRootDir(); "" != portableDir {
		return filepath.Join(portableDir, filepath.Clean(workspacePath))
	}
	return filepath.Clean(workspacePath)
}

func ResolvePortablePath(path string) string {
	return resolveWorkspacePath(path)
}

func serializeWorkspacePath(workspacePath string) string {
	workspacePath = strings.TrimRight(strings.TrimSpace(workspacePath), " \t\n")
	if "" == workspacePath {
		return ""
	}
	portableDir := GetPortableRootDir()
	if "" == portableDir {
		return filepath.Clean(workspacePath)
	}
	workspacePath = resolveWorkspacePath(filepath.FromSlash(filepath.Clean(workspacePath)))
	if !isPathUnderPortableRoot(workspacePath) {
		return filepath.Clean(workspacePath)
	}

	rel, err := filepath.Rel(portableDir, workspacePath)
	if err != nil || filepath.IsAbs(rel) {
		return filepath.Clean(workspacePath)
	}
	return filepath.ToSlash(rel)
}

func SerializePortablePath(path string) string {
	path = strings.TrimRight(strings.TrimSpace(path), " \t\n")
	if "" == path {
		return ""
	}
	if !IsPortableMode() {
		return filepath.Clean(path)
	}
	path = resolveWorkspacePath(filepath.FromSlash(filepath.Clean(path)))
	if !isPathUnderPortableRoot(path) {
		return ""
	}
	rel, err := filepath.Rel(GetPortableRootDir(), path)
	if err != nil || filepath.IsAbs(rel) {
		return ""
	}
	return filepath.ToSlash(rel)
}

func initWorkspaceDir(workspaceArg string) {
	userHomeConfDir := GetUserConfDir()
	workspaceConf := GetWorkspaceConfPath()
	logging.SetLogPath(filepath.Join(userHomeConfDir, "kernel.log"))

	if err := os.MkdirAll(userHomeConfDir, 0755); err != nil && !os.IsExist(err) {
		logging.LogErrorf("create user home conf folder [%s] failed: %s", userHomeConfDir, err)
		os.Exit(logging.ExitCodeInitWorkspaceErr)
	}

	defaultWorkspaceDir := GetDefaultWorkspaceDir()

	var workspacePaths []string
	if !gulu.File.IsExist(workspaceConf) {
		WorkspaceDir = defaultWorkspaceDir
	} else {
		workspacePaths, _ = ReadWorkspacePaths()
		if 0 < len(workspacePaths) {
			WorkspaceDir = workspacePaths[len(workspacePaths)-1]
		} else {
			WorkspaceDir = defaultWorkspaceDir
		}
	}

	if "" != workspaceArg {
		WorkspaceDir = resolveWorkspacePath(workspaceArg)
	}

	if !gulu.File.IsDir(WorkspaceDir) {
		logging.LogWarnf("use the default workspace [%s] since the specified workspace [%s] is not a dir", defaultWorkspaceDir, WorkspaceDir)
		if err := os.MkdirAll(defaultWorkspaceDir, 0755); err != nil && !os.IsExist(err) {
			logging.LogErrorf("create default workspace folder [%s] failed: %s", defaultWorkspaceDir, err)
			os.Exit(logging.ExitCodeInitWorkspaceErr)
		}
		WorkspaceDir = defaultWorkspaceDir
	}
	workspacePaths = append(workspacePaths, WorkspaceDir)

	if err := WriteWorkspacePaths(workspacePaths); err != nil {
		logging.LogErrorf("write workspace conf [%s] failed: %s", workspaceConf, err)
		os.Exit(logging.ExitCodeInitWorkspaceErr)
	}

	WorkspaceName = filepath.Base(WorkspaceDir)
	ConfDir = filepath.Join(WorkspaceDir, "conf")
	DataDir = filepath.Join(WorkspaceDir, "data")
	RepoDir = filepath.Join(WorkspaceDir, "repo")
	HistoryDir = filepath.Join(WorkspaceDir, "history")
	TempDir = filepath.Join(WorkspaceDir, "temp")
	osTmpDir := filepath.Join(TempDir, "os")
	if err := ensureWorkspaceDirectory(TempDir, "temp"); err != nil {
		logging.LogErrorf("create temp folder [%s] failed: %s", TempDir, err)
		os.Exit(logging.ExitCodeInitWorkspaceErr)
	}
	os.RemoveAll(osTmpDir)
	if err := os.MkdirAll(osTmpDir, 0755); err != nil {
		logging.LogErrorf("create os tmp dir [%s] failed: %s", osTmpDir, err)
		os.Exit(logging.ExitCodeInitWorkspaceErr)
	}
	os.RemoveAll(filepath.Join(TempDir, "repo"))
	os.Setenv("TMPDIR", osTmpDir)
	os.Setenv("TEMP", osTmpDir)
	os.Setenv("TMP", osTmpDir)
	DBPath = filepath.Join(TempDir, DBName)
	HistoryDBPath = filepath.Join(TempDir, "history.db")
	AssetContentDBPath = filepath.Join(TempDir, "asset_content.db")
	BlockTreeDBPath = filepath.Join(TempDir, "blocktree.db")
	SnippetsPath = filepath.Join(DataDir, "snippets")
	ShortcutsPath = filepath.Join(userHomeConfDir, "shortcuts")
}

type workspaceState struct {
	Workspace  string   `json:"workspace"`
	Workspaces []string `json:"workspaces"`
}

func normalizeWorkspacePathForCompare(workspacePath string) string {
	workspacePath = filepath.Clean(resolveWorkspacePath(workspacePath))
	if "windows" == runtime.GOOS {
		workspacePath = strings.ToLower(workspacePath)
	}
	return workspacePath
}

func workspacePathsEqual(a, b string) bool {
	return normalizeWorkspacePathForCompare(a) == normalizeWorkspacePathForCompare(b)
}

func appendUniqueWorkspacePath(paths []string, workspacePath string) []string {
	workspacePath = strings.TrimSpace(workspacePath)
	if "" == workspacePath {
		return paths
	}
	for _, existing := range paths {
		if workspacePathsEqual(existing, workspacePath) {
			return paths
		}
	}
	return append(paths, workspacePath)
}

func decodeWorkspaceConfPaths(data []byte) (ret []string, err error) {
	text := strings.TrimSpace(string(data))
	if "" == text {
		return []string{}, nil
	}

	var raw any
	if err = json.Unmarshal([]byte(text), &raw); err != nil {
		return nil, err
	}
	switch parsed := raw.(type) {
	case []any:
		for _, item := range parsed {
			if workspacePath, ok := item.(string); ok {
				ret = appendUniqueWorkspacePath(ret, workspacePath)
			}
		}
	case map[string]any:
		current, _ := parsed["workspace"].(string)
		var objectWorkspaces []string
		if rawWorkspaces, ok := parsed["workspaces"].([]any); ok {
			for _, item := range rawWorkspaces {
				if workspacePath, ok := item.(string); ok {
					objectWorkspaces = append(objectWorkspaces, workspacePath)
				}
			}
		}
		if "" == strings.TrimSpace(current) && 0 < len(objectWorkspaces) {
			current = objectWorkspaces[0]
		}
		for _, workspacePath := range objectWorkspaces {
			if "" != strings.TrimSpace(current) && workspacePathsEqual(workspacePath, current) {
				continue
			}
			ret = appendUniqueWorkspacePath(ret, workspacePath)
		}
		ret = appendUniqueWorkspacePath(ret, current)
	default:
		return nil, fmt.Errorf("unsupported workspace conf shape")
	}
	return
}

func ReadWorkspacePaths() (ret []string, err error) {
	ret = []string{}
	workspaceConf := GetWorkspaceConfPath()
	data, err := os.ReadFile(workspaceConf)
	if err != nil {
		msg := fmt.Sprintf("read workspace conf [%s] failed: %s", workspaceConf, err)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
		return
	}

	if ret, err = decodeWorkspaceConfPaths(data); err != nil {
		msg := fmt.Sprintf("unmarshal workspace conf [%s] failed: %s", workspaceConf, err)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
		return
	}

	var tmp []string
	workspaceBaseDir := filepath.Dir(HomeDir)
	for _, d := range ret {
		if ContainerIOS == Container && strings.Contains(d, "/Documents/") {
			// iOS 端沙箱路径会变化，需要转换为相对路径再拼接当前沙箱中的工作空间基路径
			d = d[strings.Index(d, "/Documents/")+len("/Documents/"):]
			d = filepath.Join(workspaceBaseDir, d)
		}

		d = resolveWorkspacePath(d)
		if gulu.File.IsDir(d) {
			tmp = appendUniqueWorkspacePath(tmp, d)
		} else {
			logging.LogWarnf("workspace path [%s] is not a dir", d)
		}
	}
	ret = tmp
	return
}

func WriteWorkspacePaths(workspacePaths []string) (err error) {
	var normalized []string
	for _, workspacePath := range workspacePaths {
		workspacePath = serializeWorkspacePath(workspacePath)
		if "" != workspacePath {
			normalized = appendUniqueWorkspacePath(normalized, workspacePath)
		}
	}
	workspacePaths = normalized
	workspaceConf := GetWorkspaceConfPath()
	if err = os.MkdirAll(filepath.Dir(workspaceConf), 0755); err != nil && !os.IsExist(err) {
		msg := fmt.Sprintf("create workspace conf dir [%s] failed: %s", filepath.Dir(workspaceConf), err)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
		return
	}
	state := workspaceState{Workspaces: []string{}}
	if 0 < len(workspacePaths) {
		state.Workspace = workspacePaths[len(workspacePaths)-1]
		for i := len(workspacePaths) - 1; i >= 0 && len(state.Workspaces) < 12; i-- {
			state.Workspaces = append(state.Workspaces, workspacePaths[i])
		}
	}
	data, err := json.MarshalIndent(state, "", "\t")
	if err != nil {
		msg := fmt.Sprintf("marshal workspace conf [%s] failed: %s", workspaceConf, err)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
		return
	}

	if err = filelock.WriteFile(workspaceConf, data); err != nil {
		msg := fmt.Sprintf("write workspace conf [%s] failed: %s", workspaceConf, err)
		logging.LogErrorf("%s", msg)
		err = errors.New(msg)
		return
	}
	return
}

func ensureWorkspaceDirectory(dir, label string) error {
	info, err := os.Stat(dir)
	if nil == err {
		if info.IsDir() {
			return nil
		}
		quarantinePath := fmt.Sprintf("%s.invalid-%d", dir, time.Now().UnixNano())
		if renameErr := os.Rename(dir, quarantinePath); nil != renameErr {
			return fmt.Errorf("%s path exists but is not a directory and could not be moved: %w", label, renameErr)
		}
		logging.LogWarnf("moved non-directory %s path [%s] to [%s]", label, dir, quarantinePath)
	} else if !os.IsNotExist(err) {
		return err
	}
	return os.MkdirAll(dir, 0755)
}

var (
	ServerURL  *url.URL // 内核服务 URL
	ServerPort = "0"    // HTTP/WebSocket 端口，0 为使用随机端口

	ReadOnly       bool
	AccessAuthCode string
	Lang           = ""

	Container        string // docker, android, ios, harmony, std
	ISMicrosoftStore bool   // 桌面端是否是微软商店版
)

const (
	ContainerStd     = "std"     // 桌面端
	ContainerDocker  = "docker"  // Docker 容器端
	ContainerAndroid = "android" // Android 端
	ContainerIOS     = "ios"     // iOS 端
	ContainerHarmony = "harmony" // 鸿蒙端

	LocalHost = "127.0.0.1" // 伺服地址
	FixedPort = "6806"      // 固定端口
)

func initPathDir() {
	if err := ensureWorkspaceDirectory(ConfDir, "conf"); err != nil {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create conf folder [%s] failed: %s", ConfDir, err)
	}
	if err := ensureWorkspaceDirectory(DataDir, "data"); err != nil {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data folder [%s] failed: %s", DataDir, err)
	}
	if err := ensureWorkspaceDirectory(TempDir, "temp"); err != nil {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create temp folder [%s] failed: %s", TempDir, err)
	}

	assets := filepath.Join(DataDir, "assets")
	if err := os.MkdirAll(assets, 0755); err != nil && !os.IsExist(err) {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data assets folder [%s] failed: %s", assets, err)
	}

	templates := filepath.Join(DataDir, "templates")
	if err := os.MkdirAll(templates, 0755); err != nil && !os.IsExist(err) {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data templates folder [%s] failed: %s", templates, err)
	}

	widgets := filepath.Join(DataDir, "widgets")
	if err := os.MkdirAll(widgets, 0755); err != nil && !os.IsExist(err) {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data widgets folder [%s] failed: %s", widgets, err)
	}

	plugins := filepath.Join(DataDir, "plugins")
	if err := os.MkdirAll(plugins, 0755); err != nil && !os.IsExist(err) {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data plugins folder [%s] failed: %s", widgets, err)
	}

	emojis := filepath.Join(DataDir, "emojis")
	if err := os.MkdirAll(emojis, 0755); err != nil && !os.IsExist(err) {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data emojis folder [%s] failed: %s", widgets, err)
	}

	// Support directly access `data/public/*` contents via URL link https://github.com/lonelyor/SourceFlow/issues/8593
	public := filepath.Join(DataDir, "public")
	if err := os.MkdirAll(public, 0755); err != nil && !os.IsExist(err) {
		logging.LogFatalf(logging.ExitCodeInitWorkspaceErr, "create data public folder [%s] failed: %s", widgets, err)
	}
}

func initMime() {
	// 在某版本的 Windows 10 操作系统上界面样式异常问题
	// https://github.com/lonelyor/SourceFlow/issues/247
	// https://github.com/lonelyor/SourceFlow/issues/3813
	mime.AddExtensionType(".css", "text/css")
	mime.AddExtensionType(".js", "text/javascript")
	mime.AddExtensionType(".mjs", "text/javascript")
	mime.AddExtensionType(".html", "text/html")
	mime.AddExtensionType(".json", "application/json")
	mime.AddExtensionType(".woff2", "font/woff2")

	// 某些系统上下载资源文件后打开是 zip https://github.com/lonelyor/SourceFlow/issues/6347
	mime.AddExtensionType(".doc", "application/msword")
	mime.AddExtensionType(".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	mime.AddExtensionType(".xls", "application/vnd.ms-excel")
	mime.AddExtensionType(".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	mime.AddExtensionType(".dwg", "image/x-dwg")
	mime.AddExtensionType(".dxf", "image/x-dxf")
	mime.AddExtensionType(".dwf", "drawing/x-dwf")
	mime.AddExtensionType(".pdf", "application/pdf")

	// 某些系统上无法显示 SVG 图片 SVG images cannot be displayed on some systems https://github.com/lonelyor/SourceFlow/issues/9413
	mime.AddExtensionType(".svg", "image/svg+xml")

	// 文档数据文件
	mime.AddExtensionType(".sf", "application/json")

	mime.AddExtensionType(".md", "text/markdown")
	mime.AddExtensionType(".markdown", "text/markdown")

	// 添加常用的图片格式
	mime.AddExtensionType(".png", "image/png")
	mime.AddExtensionType(".jpg", "image/jpeg")
	mime.AddExtensionType(".jpeg", "image/jpeg")
	mime.AddExtensionType(".gif", "image/gif")
	mime.AddExtensionType(".bmp", "image/bmp")
	mime.AddExtensionType(".tiff", "image/tiff")
	mime.AddExtensionType(".tif", "image/tiff")
	mime.AddExtensionType(".webp", "image/webp")
	mime.AddExtensionType(".ico", "image/x-icon")
}

func GetDataAssetsAbsPath() (ret string) {
	ret = filepath.Join(DataDir, "assets")
	if IsSymlinkPath(ret) {
		// 跟随符号链接 https://github.com/lonelyor/SourceFlow/issues/5480
		var err error
		ret, err = filepath.EvalSymlinks(ret)
		if err != nil {
			logging.LogErrorf("read assets link failed: %s", err)
		}
	}
	return
}

func tryLockWorkspace() {
	WorkspaceLock = flock.New(filepath.Join(WorkspaceDir, ".lock"))
	ok, err := WorkspaceLock.TryLock()
	if ok {
		return
	}
	if err != nil {
		logging.LogErrorf("lock workspace [%s] failed: %s", WorkspaceDir, err)
	} else {
		logging.LogErrorf("lock workspace [%s] failed", WorkspaceDir)
	}
	os.Exit(logging.ExitCodeWorkspaceLocked)
}

func IsWorkspaceLocked(workspacePath string) bool {
	if !gulu.File.IsDir(workspacePath) {
		return false
	}

	lockFilePath := filepath.Join(workspacePath, ".lock")
	if !gulu.File.IsExist(lockFilePath) {
		return false
	}

	f := flock.New(lockFilePath)
	defer f.Unlock()
	ok, _ := f.TryLock()
	if ok {
		return false
	}
	return true
}

func UnlockWorkspace() {
	if nil == WorkspaceLock {
		return
	}

	if err := WorkspaceLock.Unlock(); err != nil {
		logging.LogErrorf("unlock workspace [%s] failed: %s", WorkspaceDir, err)
		return
	}

	if err := os.Remove(filepath.Join(WorkspaceDir, ".lock")); err != nil {
		logging.LogErrorf("remove workspace lock failed: %s", err)
		return
	}
}

func LogDatabaseSize(dbPath string) {
	dbFile, err := os.Stat(dbPath)
	if nil != err {
		return
	}

	dbSize := humanize.BytesCustomCeil(uint64(dbFile.Size()), 2)
	logging.LogInfof("database [%s] size [%s]", dbPath, dbSize)
}

func RemoveDatabaseFile(dbPath string) {
	if gulu.File.IsExist(dbPath) {
		err := os.RemoveAll(dbPath)
		if err != nil {
			logging.LogErrorf("remove database file [%s] failed: %s", dbPath, err)
			return
		}
	}

	if gulu.File.IsExist(dbPath + "-shm") {
		err := os.RemoveAll(dbPath + "-shm")
		if err != nil {
			logging.LogErrorf("remove database file [%s] failed: %s", dbPath+"-shm", err)
			return
		}
	}

	if gulu.File.IsExist(dbPath + "-wal") {
		err := os.RemoveAll(dbPath + "-wal")
		if err != nil {
			logging.LogErrorf("remove database file [%s] failed: %s", dbPath+"-wal", err)
			return
		}
	}
}
