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
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Xuanwo/go-locale"
	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/task"
	"github.com/lonelyor/sourceflow/kernel/treenode"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/dejavu/cloud"
	"github.com/lonelyor/sourceflow/third_party/go/eventbus"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"golang.org/x/mod/semver"
	"golang.org/x/text/language"
)

var Conf *AppConf

// AppConf 维护应用元数据，保存在 ~/.sourceflow/conf.json。
type AppConf struct {
	LogLevel       string           `json:"logLevel"`       // 日志级别：off, trace, debug, info, warn, error, fatal
	Appearance     *conf.Appearance `json:"appearance"`     // 外观
	Langs          []*conf.Lang     `json:"langs"`          // 界面语言列表
	Lang           string           `json:"lang"`           // 选择的界面语言，同 Appearance.Lang
	FileTree       *conf.FileTree   `json:"fileTree"`       // 文档面板
	Tag            *conf.Tag        `json:"tag"`            // 标签面板
	Editor         *conf.Editor     `json:"editor"`         // 编辑器配置
	Export         *conf.Export     `json:"export"`         // 导出配置
	Graph          *conf.Graph      `json:"graph"`          // 关系图配置
	UILayout       *conf.UILayout   `json:"uiLayout"`       // 界面布局。不要直接使用，使用 GetUILayout() 和 SetUILayout() 方法
	ReadOnly       bool             `json:"readonly"`       // 是否是以只读模式运行
	ServerAddrs    []string         `json:"serverAddrs"`    // 本地服务器地址列表
	AccessAuthCode string           `json:"accessAuthCode"` // 访问授权码
	System         *conf.System     `json:"system"`         // 系统配置
	Keymap         *conf.Keymap     `json:"keymap"`         // 快捷键配置
	Sync           *conf.Sync       `json:"sync"`           // 同步配置
	Search         *conf.Search     `json:"search"`         // 搜索配置
	Flashcard      *conf.Flashcard  `json:"flashcard"`      // 闪卡配置
	Bazaar         *conf.Bazaar     `json:"bazaar"`         // 集市配置
	Stat           *conf.Stat       `json:"stat"`           // 统计
	Api            *conf.API        `json:"api"`            // API
	Repo           *conf.Repo       `json:"repo"`           // 数据仓库
	Publish        *conf.Publish    `json:"publish"`        // 发布服务
	OpenHelp       bool             `json:"openHelp"`       // 启动后是否需要打开用户指南
	ShowChangelog  bool             `json:"showChangelog"`  // 是否显示版本更新日志
	Snippet        *conf.Snpt       `json:"snippet"`        // 代码片段
	DataIndexState int              `json:"dataIndexState"` // 数据索引状态，0：已索引，1：未索引
	CookieKey      string           `json:"cookieKey"`      // 用于加密 Cookie 的密钥

	m *sync.RWMutex // 配置数据锁
}

func NewAppConf() *AppConf {
	return &AppConf{
		LogLevel: "debug",
		m:        &sync.RWMutex{},
	}
}

func (conf *AppConf) GetUILayout() *conf.UILayout {
	conf.m.Lock()
	defer conf.m.Unlock()
	return conf.UILayout
}

func (conf *AppConf) SetUILayout(uiLayout *conf.UILayout) {
	conf.m.Lock()
	defer conf.m.Unlock()
	conf.UILayout = uiLayout
}

func InitConf() {
	initLang()

	Conf = NewAppConf()
	confPath := filepath.Join(util.ConfDir, "conf.json")
	if gulu.File.IsExist(confPath) {
		if data, err := os.ReadFile(confPath); err != nil {
			logging.LogErrorf("load conf [%s] failed: %s", confPath, err)
		} else {
			if err = gulu.JSON.UnmarshalJSON(data, Conf); err != nil {
				logging.LogErrorf("parse conf [%s] failed: %s", confPath, err)
			} else {
				logging.LogInfof("loaded conf [%s]", confPath)
			}
		}
	}

	if "" != util.Lang {
		initialized := false
		if util.ContainerAndroid == util.Container || util.ContainerIOS == util.Container || util.ContainerHarmony == util.Container {
			// 移动端以上次设置的外观语言为准
			if "" != Conf.Lang && util.Lang != Conf.Lang {
				util.Lang = Conf.Lang
				logging.LogInfof("use the last specified language [%s]", util.Lang)
				initialized = true
			}
		}

		if !initialized {
			Conf.Lang = util.Lang
			logging.LogInfof("initialized the specified language [%s]", util.Lang)
		}
	} else {
		if "" == Conf.Lang {
			// 未指定外观语言时使用系统语言

			if userLang, err := locale.Detect(); err == nil {
				var supportLangs []language.Tag
				for lang := range util.Langs {
					if tag, err := language.Parse(lang); err == nil {
						supportLangs = append(supportLangs, tag)
					} else {
						logging.LogErrorf("load language [%s] failed: %s", lang, err)
					}
				}
				matcher := language.NewMatcher(supportLangs)
				lang, _, _ := matcher.Match(userLang)
				base, _ := lang.Base()
				region, _ := lang.Region()
				util.Lang = base.String() + "_" + region.String()
				Conf.Lang = util.Lang
				logging.LogInfof("initialized language [%s] based on device locale", Conf.Lang)
			} else {
				logging.LogDebugf("check device locale failed [%s], using default language [en_US]", err)
				util.Lang = "en_US"
				Conf.Lang = util.Lang
			}
		}
		util.Lang = Conf.Lang
	}

	Conf.Langs = loadLangs()
	if nil == Conf.Appearance {
		Conf.Appearance = conf.NewAppearance()
	}
	var langOK bool
	for _, l := range Conf.Langs {
		if Conf.Lang == l.Name {
			langOK = true
			break
		}
	}
	if !langOK {
		if strings.HasPrefix(Conf.Lang, "zh") {
			Conf.Lang = "zh_CN"
		} else {
			Conf.Lang = "en_US"
		}
		util.Lang = Conf.Lang
	}
	Conf.Appearance.Lang = Conf.Lang
	if nil == Conf.UILayout {
		Conf.UILayout = &conf.UILayout{}
	}
	if nil == Conf.Keymap {
		Conf.Keymap = &conf.Keymap{}
	}
	if "" == Conf.Appearance.CodeBlockThemeDark {
		Conf.Appearance.CodeBlockThemeDark = "dracula"
	}
	if "" == Conf.Appearance.CodeBlockThemeLight {
		Conf.Appearance.CodeBlockThemeLight = "github"
	}
	if nil == Conf.Appearance.StatusBar {
		Conf.Appearance.StatusBar = &util.StatusBar{}
	}
	if nil == Conf.Appearance.FileTreeTotalCount {
		fileTreeTotalCount := true
		Conf.Appearance.FileTreeTotalCount = &fileTreeTotalCount
	}
	Conf.Appearance.FileTreeFontSize = conf.NormalizeFileTreeFontSize(Conf.Appearance.FileTreeFontSize)
	util.StatusBarCfg = Conf.Appearance.StatusBar
	if nil == Conf.FileTree {
		Conf.FileTree = conf.NewFileTree()
	}
	if 1 > Conf.FileTree.MaxListCount {
		Conf.FileTree.MaxListCount = 512
	}
	if 1 > Conf.FileTree.MaxOpenTabCount {
		Conf.FileTree.MaxOpenTabCount = 8
	}
	if 32 < Conf.FileTree.MaxOpenTabCount {
		Conf.FileTree.MaxOpenTabCount = 32
	}
	Conf.FileTree.DocCreateSavePath = util.TrimSpaceInPath(Conf.FileTree.DocCreateSavePath)
	Conf.FileTree.RefCreateSavePath = util.TrimSpaceInPath(Conf.FileTree.RefCreateSavePath)
	util.UseSingleLineSave = Conf.FileTree.UseSingleLineSave
	if 2 > Conf.FileTree.LargeFileWarningSize {
		Conf.FileTree.LargeFileWarningSize = 8
	}
	util.LargeFileWarningSize = Conf.FileTree.LargeFileWarningSize
	if nil == Conf.FileTree.CreateDocAtTop { // v3.4.0 之前的版本没有该字段，设置默认值为 true，即在顶部创建新文档，不改变用户习惯
		Conf.FileTree.CreateDocAtTop = func() *bool { b := true; return &b }()
	}

	if conf.MinFileTreeRecentDocsListCount > Conf.FileTree.RecentDocsMaxListCount {
		Conf.FileTree.RecentDocsMaxListCount = conf.MinFileTreeRecentDocsListCount
	}
	if conf.MaxFileTreeRecentDocsListCount < Conf.FileTree.RecentDocsMaxListCount {
		Conf.FileTree.RecentDocsMaxListCount = conf.MaxFileTreeRecentDocsListCount
	}

	if nil == Conf.Tag {
		Conf.Tag = conf.NewTag()
	}

	defaultEditor := conf.NewEditor()
	if nil == Conf.Editor {
		Conf.Editor = defaultEditor
	}

	// 新增字段的默认值，使用指针类型来区分字段不存在（nil）和用户设置为 0（非 nil）
	if nil == Conf.Editor.BacklinkSort {
		Conf.Editor.BacklinkSort = defaultEditor.BacklinkSort
	}
	if nil == Conf.Editor.BackmentionSort {
		Conf.Editor.BackmentionSort = defaultEditor.BackmentionSort
	}
	if 1 > len(Conf.Editor.Emoji) {
		Conf.Editor.Emoji = []string{}
	}
	for i, emoji := range Conf.Editor.Emoji {
		if strings.Contains(emoji, ".") {
			// XSS through emoji name https://github.com/lonelyor/SourceFlow/issues/15034
			emoji = util.FilterUploadEmojiFileName(emoji)
			Conf.Editor.Emoji[i] = emoji
		}
	}
	if 9 > Conf.Editor.FontSize || 72 < Conf.Editor.FontSize {
		Conf.Editor.FontSize = 16
	}
	if "" == Conf.Editor.PlantUMLServePath {
		Conf.Editor.PlantUMLServePath = "https://www.plantuml.com/plantuml/svg/~1"
	}
	if 1 > Conf.Editor.BlockRefDynamicAnchorTextMaxLen {
		Conf.Editor.BlockRefDynamicAnchorTextMaxLen = 64
	}
	if 5120 < Conf.Editor.BlockRefDynamicAnchorTextMaxLen {
		Conf.Editor.BlockRefDynamicAnchorTextMaxLen = 5120
	}
	if 1440 < Conf.Editor.GenerateHistoryInterval {
		Conf.Editor.GenerateHistoryInterval = 1440
	}
	if 1 > Conf.Editor.HistoryRetentionDays {
		Conf.Editor.HistoryRetentionDays = 90
	}
	if 3650 < Conf.Editor.HistoryRetentionDays {
		Conf.Editor.HistoryRetentionDays = 3650
	}
	if nil == Conf.Editor.FloatWindowDelay {
		v := 620
		Conf.Editor.FloatWindowDelay = &v
	} else {
		*Conf.Editor.FloatWindowDelay = max(0, min(2000, *Conf.Editor.FloatWindowDelay))
	}
	if conf.MinDynamicLoadBlocks > Conf.Editor.DynamicLoadBlocks {
		Conf.Editor.DynamicLoadBlocks = conf.MinDynamicLoadBlocks
	}
	if 1 > len(Conf.Editor.SpellcheckLanguages) {
		Conf.Editor.SpellcheckLanguages = []string{"en-US"}
	}
	if 0 > Conf.Editor.BacklinkExpandCount {
		Conf.Editor.BacklinkExpandCount = 0
	}
	if -1 > Conf.Editor.BackmentionExpandCount {
		Conf.Editor.BackmentionExpandCount = -1
	}
	if nil == Conf.Editor.Markdown {
		Conf.Editor.Markdown = &util.Markdown{}
	}
	util.MarkdownSettings = Conf.Editor.Markdown

	if nil == Conf.Export {
		Conf.Export = conf.NewExport()
	}
	if 0 == Conf.Export.BlockRefMode || 1 == Conf.Export.BlockRefMode || 5 == Conf.Export.BlockRefMode {
		// 废弃导出选项引用块转换为原始块和引述块 https://github.com/lonelyor/SourceFlow/issues/3155
		// 锚点哈希模式和脚注模式合并 https://github.com/lonelyor/SourceFlow/issues/13331
		Conf.Export.BlockRefMode = 4 // 改为脚注+锚点哈希
	}
	if "" == Conf.Export.PandocBin {
		Conf.Export.PandocBin = util.PandocBinPath
	}

	if nil == Conf.Graph || nil == Conf.Graph.Local || nil == Conf.Graph.Global {
		Conf.Graph = conf.NewGraph()
	}

	if nil == Conf.System {
		Conf.System = conf.NewSystem()
		if util.ContainerIOS != util.Container {
			Conf.OpenHelp = true
		}
	} else {
		cmp := semver.Compare("v"+util.Ver, "v"+Conf.System.KernelVersion)
		if 0 < cmp {
			logging.LogInfof("upgraded from version [%s] to [%s]", Conf.System.KernelVersion, util.Ver)
			Conf.ShowChangelog = true
		} else if 0 > cmp {
			logging.LogInfof("downgraded from version [%s] to [%s]", Conf.System.KernelVersion, util.Ver)
		}

		Conf.System.KernelVersion = util.Ver
		Conf.System.IsInsider = util.IsInsider
	}
	if nil == Conf.System.NetworkProxy {
		Conf.System.NetworkProxy = &conf.NetworkProxy{}
	}
	if "" == Conf.System.ID {
		Conf.System.ID = util.GetDeviceID()
	}
	if "" == Conf.System.Name {
		Conf.System.Name = util.GetDeviceName()
	}
	if util.ContainerStd == util.Container {
		Conf.System.ID = util.GetDeviceID()
		Conf.System.Name = util.GetDeviceName()
	}
	Conf.System.DisabledFeatures = util.DisabledFeatures
	if 1 > len(Conf.System.DisabledFeatures) {
		Conf.System.DisabledFeatures = []string{}
	}

	Conf.System.AppDir = util.WorkingDir
	Conf.System.ConfDir = util.ConfDir
	Conf.System.HomeDir = util.HomeDir
	Conf.System.WorkspaceDir = util.WorkspaceDir
	Conf.System.DataDir = util.DataDir
	Conf.System.Container = util.Container
	Conf.System.IsMicrosoftStore = util.ISMicrosoftStore
	Conf.System.IsPortable = "" != util.GetPortableRootDir()
	if Conf.System.IsPortable {
		Conf.System.DownloadInstallPkg = false
	}
	if util.ISMicrosoftStore {
		logging.LogInfof("using Microsoft Store edition")
	}
	Conf.System.OS = runtime.GOOS
	Conf.System.OSPlatform = util.GetOSPlatform()

	docxTemplate := util.RemoveInvalid(Conf.Export.DocxTemplate)
	if "" != docxTemplate {
		params := util.RemoveInvalid(Conf.Export.PandocParams)
		if gulu.File.IsExist(docxTemplate) && !strings.Contains(params, "--reference-doc") && !Conf.System.IsMicrosoftStore {
			if !strings.HasPrefix(docxTemplate, "\"") {
				docxTemplate = "\"" + docxTemplate + "\""
			}
			params += " --reference-doc " + docxTemplate
			Conf.Export.PandocParams = strings.TrimSpace(params)
		}
		Conf.Export.DocxTemplate = ""
		Conf.Save()
	}

	if nil == Conf.Snippet {
		Conf.Snippet = conf.NewSnpt()
	}

	if nil == Conf.Sync {
		Conf.Sync = conf.NewSync()
	}
	if conf.ProviderS3 != Conf.Sync.Provider && conf.ProviderWebDAV != Conf.Sync.Provider && conf.ProviderLocal != Conf.Sync.Provider {
		Conf.Sync.Provider = conf.ProviderLocal
		Conf.Sync.Enabled = false
		logging.LogInfof("switched unsupported sync provider to Local File System and disabled sync")
	}
	if 0 == Conf.Sync.Mode {
		Conf.Sync.Mode = 1
	}
	Conf.Sync.Mode = 1
	if 30 > Conf.Sync.Interval {
		Conf.Sync.Interval = 30
	}
	if 60*60*12 < Conf.Sync.Interval {
		Conf.Sync.Interval = 60 * 60 * 12
	}
	if nil == Conf.Sync.S3 {
		Conf.Sync.S3 = &conf.S3{PathStyle: true, SkipTlsVerify: true}
	}
	Conf.Sync.S3.Endpoint = util.NormalizeEndpoint(Conf.Sync.S3.Endpoint)
	Conf.Sync.S3.Timeout = util.NormalizeTimeout(Conf.Sync.S3.Timeout)
	Conf.Sync.S3.ConcurrentReqs = util.NormalizeConcurrentReqs(Conf.Sync.S3.ConcurrentReqs, conf.ProviderS3)
	if nil == Conf.Sync.WebDAV {
		Conf.Sync.WebDAV = &conf.WebDAV{SkipTlsVerify: true}
	}
	Conf.Sync.WebDAV.Endpoint = util.NormalizeEndpoint(Conf.Sync.WebDAV.Endpoint)
	Conf.Sync.WebDAV.Timeout = util.NormalizeTimeout(Conf.Sync.WebDAV.Timeout)
	Conf.Sync.WebDAV.ConcurrentReqs = util.NormalizeConcurrentReqs(Conf.Sync.WebDAV.ConcurrentReqs, conf.ProviderWebDAV)
	if nil == Conf.Sync.Local {
		Conf.Sync.Local = &conf.Local{}
	}
	Conf.Sync.Local.Endpoint = util.ResolvePortablePath(util.NormalizeLocalPath(Conf.Sync.Local.Endpoint))
	Conf.Sync.Local.Timeout = util.NormalizeTimeout(Conf.Sync.Local.Timeout)
	Conf.Sync.Local.ConcurrentReqs = util.NormalizeConcurrentReqs(Conf.Sync.Local.ConcurrentReqs, conf.ProviderLocal)

	if util.ContainerDocker == util.Container {
		Conf.Sync.Perception = false
	}

	if nil == Conf.Api {
		Conf.Api = conf.NewAPI()
	}

	if nil == Conf.Bazaar {
		Conf.Bazaar = conf.NewBazaar()
	}
	Conf.Bazaar.Normalize()
	util.ApplyBazaarSettings(
		Conf.Bazaar.BazaarHash,
		Conf.Bazaar.BazaarVersionInfoURL,
		Conf.Bazaar.BazaarStageBaseURL,
		Conf.Bazaar.BazaarPackageBaseURL,
		Conf.Bazaar.BazaarStatBaseURL,
		Conf.Bazaar.BazaarReadmeCDNURL,
	)

	if nil == Conf.Publish {
		Conf.Publish = conf.NewPublish()
	}
	if Conf.OpenHelp && Conf.Publish.Enable {
		Conf.OpenHelp = false
	}

	if nil == Conf.Repo {
		Conf.Repo = conf.NewRepo()
	}
	if timingEnv := util.GetEnv(util.SyncIndexTimingEnv); "" != timingEnv {
		val, err := strconv.Atoi(timingEnv)
		if err == nil {
			Conf.Repo.SyncIndexTiming = int64(val)
		}
	}
	if 12000 > Conf.Repo.SyncIndexTiming {
		Conf.Repo.SyncIndexTiming = 12 * 1000
	}
	if 1 > Conf.Repo.IndexRetentionDays {
		Conf.Repo.IndexRetentionDays = 180
	}
	if 1 > Conf.Repo.RetentionIndexesDaily {
		Conf.Repo.RetentionIndexesDaily = 2
	}
	if 1 > Conf.Repo.RemoteRetentionRecentHours {
		Conf.Repo.RemoteRetentionRecentHours = 24
	}
	if 168 < Conf.Repo.RemoteRetentionRecentHours {
		Conf.Repo.RemoteRetentionRecentHours = 168
	}
	if 1 > Conf.Repo.RemoteRetentionRecentDays {
		Conf.Repo.RemoteRetentionRecentDays = 7
	}
	if 90 < Conf.Repo.RemoteRetentionRecentDays {
		Conf.Repo.RemoteRetentionRecentDays = 90
	}
	if 0 < len(Conf.Repo.Key) {
		logging.LogInfof("repo key [%x]", sha1.Sum(Conf.Repo.Key))
	}

	if nil == Conf.Search {
		Conf.Search = conf.NewSearch()
	}
	if 1 > Conf.Search.Limit {
		Conf.Search.Limit = 64
	}
	if 32 > Conf.Search.Limit {
		Conf.Search.Limit = 32
	}
	if 1 > Conf.Search.BacklinkMentionKeywordsLimit {
		Conf.Search.BacklinkMentionKeywordsLimit = 512
	}

	if nil == Conf.Stat {
		Conf.Stat = conf.NewStat()
	}

	if nil == Conf.Flashcard {
		Conf.Flashcard = conf.NewFlashcard()
	}
	if 0 > Conf.Flashcard.NewCardLimit {
		Conf.Flashcard.NewCardLimit = 20
	}
	if 0 > Conf.Flashcard.ReviewCardLimit {
		Conf.Flashcard.ReviewCardLimit = 200
	}
	if 0 >= Conf.Flashcard.RequestRetention || 1 <= Conf.Flashcard.RequestRetention {
		Conf.Flashcard.RequestRetention = conf.NewFlashcard().RequestRetention
	}
	if 0 >= Conf.Flashcard.MaximumInterval || 36500 <= Conf.Flashcard.MaximumInterval {
		Conf.Flashcard.MaximumInterval = conf.NewFlashcard().MaximumInterval
	}
	if "" == Conf.Flashcard.Weights {
		Conf.Flashcard.Weights = conf.NewFlashcard().Weights
	}
	if 19 != len(strings.Split(Conf.Flashcard.Weights, ",")) {
		defaultWeights := conf.DefaultFSRSWeights()
		msg := "fsrs store weights length must be [19]"
		logging.LogWarnf("%s , given [%s], reset to default weights [%s]", msg, Conf.Flashcard.Weights, defaultWeights)
		Conf.Flashcard.Weights = defaultWeights
		go func() {
			util.WaitForUILoaded()
			task.AppendAsyncTaskWithDelay(task.PushMsg, 2*time.Second, util.PushErrMsg, msg, 15000)
		}()
	}
	isInvalidFlashcardWeights := false
	for _, w := range strings.Split(Conf.Flashcard.Weights, ",") {
		if _, err := strconv.ParseFloat(strings.TrimSpace(w), 64); err != nil {
			isInvalidFlashcardWeights = true
			break
		}
	}
	if isInvalidFlashcardWeights {
		defaultWeights := conf.DefaultFSRSWeights()
		msg := "fsrs store weights contain invalid number"
		logging.LogWarnf("%s, given [%s], reset to default weights [%s]", msg, Conf.Flashcard.Weights, defaultWeights)
		Conf.Flashcard.Weights = defaultWeights
		go func() {
			util.WaitForUILoaded()
			task.AppendAsyncTaskWithDelay(task.PushMsg, 2*time.Second, util.PushErrMsg, msg, 15000)
		}()
	}

	Conf.ReadOnly = util.ReadOnly

	if "" != util.AccessAuthCode {
		Conf.AccessAuthCode = util.AccessAuthCode
	}
	Conf.AccessAuthCode = strings.TrimSpace(Conf.AccessAuthCode)
	Conf.AccessAuthCode = util.RemoveInvalid(Conf.AccessAuthCode)

	if 1 == Conf.DataIndexState {
		// 上次未正常完成数据索引
		go func() {
			util.WaitForUILoaded()
			if util.ContainerIOS == util.Container || util.ContainerAndroid == util.Container || util.ContainerHarmony == util.Container {
				task.AppendAsyncTaskWithDelay(task.PushMsg, 2*time.Second, util.PushMsg, Conf.language(245), 15000)
			} else {
				task.AppendAsyncTaskWithDelay(task.PushMsg, 2*time.Second, util.PushMsg, Conf.language(244), 15000)
			}
		}()
	}

	Conf.DataIndexState = 0

	if cookieKey := readCookieKey(); "" != cookieKey {
		Conf.CookieKey = cookieKey
	} else {
		if "" == Conf.CookieKey {
			Conf.CookieKey = gulu.Rand.String(16)
		}
		writeCookieKey(Conf.CookieKey)
	}

	Conf.Save()
	logging.SetLogLevel(Conf.LogLevel)

	util.SetNetworkProxy(Conf.System.NetworkProxy.String())

	go util.InitTesseract()
}

func readCookieKey() (cookieKey string) {
	cookieKeyPath := filepath.Join(util.GetUserConfDir(), "cookie.key")
	if !gulu.File.IsExist(cookieKeyPath) {
		return
	}

	data, err := os.ReadFile(cookieKeyPath)
	if err != nil {
		logging.LogErrorf("read cookie key file [%s] failed: %s", cookieKeyPath, err)
		return
	}

	cookieKey = string(bytes.TrimSpace(data))
	return
}

func writeCookieKey(cookieKey string) {
	cookieKeyPath := filepath.Join(util.GetUserConfDir(), "cookie.key")
	if gulu.File.IsExist(cookieKeyPath) {
		return
	}

	if err := os.WriteFile(cookieKeyPath, []byte(cookieKey), 0644); err != nil {
		logging.LogErrorf("save cookie key file [%s] failed: %s", cookieKeyPath, err)
	}
}

func initLang() {
	p := filepath.Join(util.WorkingDir, "appearance", "langs")
	dir, err := os.Open(p)
	if err != nil {
		logging.LogErrorf("open language configuration folder [%s] failed: %s", p, err)
		util.ReportFileSysFatalError(err)
		return
	}
	defer dir.Close()

	langNames, err := dir.Readdirnames(-1)
	if err != nil {
		logging.LogErrorf("list language configuration folder [%s] failed: %s", p, err)
		util.ReportFileSysFatalError(err)
		return
	}

	for _, langName := range langNames {
		jsonPath := filepath.Join(p, langName)
		data, err := os.ReadFile(jsonPath)
		if err != nil {
			logging.LogErrorf("read language configuration [%s] failed: %s", jsonPath, err)
			continue
		}
		langMap := map[string]interface{}{}
		if err := gulu.JSON.UnmarshalJSON(data, &langMap); err != nil {
			logging.LogErrorf("parse language configuration failed [%s] failed: %s", jsonPath, err)
			continue
		}

		kernelMap := map[int]string{}
		label := langMap["_label"].(string)
		kernelLangs := langMap["_kernel"].(map[string]interface{})
		for k, v := range kernelLangs {
			num, convErr := strconv.Atoi(k)
			if nil != convErr {
				logging.LogErrorf("parse language configuration [%s] item [%d] failed: %s", p, num, convErr)
				continue
			}
			kernelMap[num] = v.(string)
		}
		kernelMap[-1] = label
		name := langName[:strings.LastIndex(langName, ".")]
		util.Langs[name] = kernelMap

		util.TimeLangs[name] = langMap["_time"].(map[string]interface{})
		util.TaskActionLangs[name] = langMap["_taskAction"].(map[string]interface{})
		util.TrayMenuLangs[name] = langMap["_trayMenu"].(map[string]interface{})
		util.AttrViewLangs[name] = langMap["_attrView"].(map[string]interface{})
	}
}

func loadLangs() (ret []*conf.Lang) {
	for name, langMap := range util.Langs {
		lang := &conf.Lang{Label: langMap[-1], Name: name}
		ret = append(ret, lang)
	}
	sort.Slice(ret, func(i, j int) bool {
		return ret[i].Name < ret[j].Name
	})
	return
}

var exitLock = sync.Mutex{}

// Close 退出内核进程.
//
// force：是否不执行同步过程而直接退出
//
// setCurrentWorkspace：是否将当前工作空间放到工作空间列表的最后一个
//
// execInstallPkg：是否执行新版本安装包
//
//	0：默认按照设置项 System.DownloadInstallPkg 检查并推送提示
//	1：不执行新版本安装
//	2：执行新版本安装
//
// 返回值 exitCode：
//
//	0：正常退出
//	1：同步执行失败
//	2：提示新安装包
//
// 当 force 为 true（强制退出）并且 execInstallPkg 为 0（默认检查更新）并且同步失败并且新版本安装版已经准备就绪时，执行新版本安装 https://github.com/lonelyor/SourceFlow/issues/10288
func Close(force, setCurrentWorkspace bool, execInstallPkg int) (exitCode int) {
	exitLock.Lock()
	defer exitLock.Unlock()

	logging.LogInfof("exiting kernel [force=%v, setCurrentWorkspace=%v, execInstallPkg=%d]", force, setCurrentWorkspace, execInstallPkg)
	util.PushMsg(Conf.Language(95), 10000*60)
	FlushTxQueue()

	if !force {
		if Conf.Sync.Enabled && 3 != Conf.Sync.Mode {
			syncData(true, false, "exit")
			if 0 != ExitSyncSucc {
				if conf.ProviderLocal == Conf.Sync.Provider {
					logging.LogWarnf("ignore Local File System backup failure on exit: %s", Conf.Sync.Stat)
					ExitSyncSucc = 0
				} else {
					exitCode = 1
					return
				}
			}
		}
	}

	// Close the user guide when exiting https://github.com/lonelyor/SourceFlow/issues/10322
	closeUserGuide()

	// Improve indexing completeness when exiting https://github.com/lonelyor/SourceFlow/issues/12039
	sql.FlushQueue()

	util.IsExiting.Store(true)
	waitSecondForExecInstallPkg := false
	newVerInstallPkgPath := getNewVerInstallPkgPath()
	if !skipNewVerInstallPkg() && "" != newVerInstallPkgPath {
		if 2 == execInstallPkg || (force && 0 == execInstallPkg) { // 执行新版本安装
			waitSecondForExecInstallPkg = true
			if gulu.OS.IsWindows() {
				util.PushMsg(Conf.Language(130), 1000*30)
			}
			go execNewVerInstallPkg(newVerInstallPkgPath)
		} else if 0 == execInstallPkg { // 新版本安装包已经准备就绪
			exitCode = 2
			logging.LogInfof("the new version install pkg is ready [%s], waiting for the user's next instruction", newVerInstallPkgPath)
			return
		}
	}

	Conf.Close()
	sql.CloseDatabase()
	util.SaveAssetsTexts()
	clearWorkspaceTemp()
	clearCorruptedNotebooks()
	clearPortJSON()

	if setCurrentWorkspace {
		// 将当前工作空间放到工作空间列表的最后一个
		// Open the last workspace by default https://github.com/lonelyor/SourceFlow/issues/10570
		workspacePaths, err := util.ReadWorkspacePaths()
		if err != nil {
			logging.LogErrorf("read workspace paths failed: %s", err)
		} else {
			workspacePaths = gulu.Str.RemoveElem(workspacePaths, util.WorkspaceDir)
			workspacePaths = append(workspacePaths, util.WorkspaceDir)
			util.WriteWorkspacePaths(workspacePaths)
		}
	}

	util.BroadcastByType("main", "exit", 0, "", nil)
	util.UnlockWorkspace()

	time.Sleep(500 * time.Millisecond)
	if waitSecondForExecInstallPkg {
		// 桌面端退出拉起更新安装时有时需要重启两次 https://github.com/lonelyor/SourceFlow/issues/6544
		// 这里多等待一段时间，等待安装程序启动
		if gulu.OS.IsWindows() {
			time.Sleep(30 * time.Second)
		}
	}

	closeSyncWebSocket()

	go func() {
		time.Sleep(500 * time.Millisecond)
		logging.LogInfof("exited kernel")
		if nil != util.WebSocketServer {
			util.WebSocketServer.Close()
		}
		if nil != util.HttpServer {
			util.HttpServer.Close()
		}
		util.HttpServing = false

		if util.ContainerAndroid == util.Container || util.ContainerIOS == util.Container || util.ContainerHarmony == util.Container {
			return
		}

		os.Exit(logging.ExitCodeOk)
	}()
	return
}

var customEmojis = sync.Map{}

func AddCustomEmoji(emojiName, imgSrc string) {
	customEmojis.Store(emojiName, imgSrc)
}

func ClearCustomEmojis() {
	customEmojis.Clear()
}

func NewLute() (ret *lute.Lute) {
	ret = util.NewLute()
	ret.SetCodeSyntaxHighlightLineNum(Conf.Editor.CodeSyntaxHighlightLineNum)
	ret.SetChineseParagraphBeginningSpace(Conf.Export.ParagraphBeginningSpace)
	ret.SetProtyleMarkNetImg(Conf.Editor.DisplayNetImgMark)
	ret.SetSpellcheck(Conf.Editor.Spellcheck)

	customEmojiMap := map[string]string{}
	customEmojis.Range(func(key, value interface{}) bool {
		customEmojiMap[key.(string)] = value.(string)
		return true
	})
	ret.PutEmojis(customEmojiMap)
	return
}

func enableLuteInlineSyntax(luteEngine *lute.Lute) {
	luteEngine.SetInlineAsterisk(true)
	luteEngine.SetInlineUnderscore(true)
	luteEngine.SetSup(true)
	luteEngine.SetSub(true)
	luteEngine.SetTag(true)
	luteEngine.SetInlineMath(true)
	luteEngine.SetGFMStrikethrough(true)
}

func (conf *AppConf) Save() {
	if util.ReadOnly {
		return
	}

	Conf.m.Lock()
	defer Conf.m.Unlock()

	newData, _ := gulu.JSON.MarshalIndentJSON(conf.cloneForSave(), "", "  ")
	confPath := filepath.Join(util.ConfDir, "conf.json")
	oldData, err := filelock.ReadFile(confPath)
	if err != nil {
		conf.save0(newData)
		return
	}

	if bytes.Equal(newData, oldData) {
		return
	}

	conf.save0(newData)
}

func (conf *AppConf) cloneForSave() *AppConf {
	clone := *Conf
	if nil != Conf.Sync {
		syncConf := *Conf.Sync
		clone.Sync = &syncConf
		if nil != Conf.Sync.Local {
			local := *Conf.Sync.Local
			local.Endpoint = serializePortableLocalEndpoint(local.Endpoint)
			clone.Sync.Local = &local
		}
	}
	return &clone
}

func (conf *AppConf) save0(data []byte) {
	confPath := filepath.Join(util.ConfDir, "conf.json")

	// 瞬时磁盘错误（备份/同步软件锁文件、iCloud 干扰等）不应直接终止内核进程，这里带退避重试
	backoffs := []time.Duration{50 * time.Millisecond, 200 * time.Millisecond, 800 * time.Millisecond}
	var err error
	for retry := 0; ; retry++ {
		err = filelock.WriteFile(confPath, data)
		if nil == err {
			writeSyncBackupProfile()
			return
		}
		if retry < len(backoffs) {
			logging.LogWarnf("write conf [%s] failed (attempt %d/%d): %s, retrying after %v", confPath, retry+1, len(backoffs)+1, err, backoffs[retry])
			time.Sleep(backoffs[retry])
			continue
		}
		break
	}

	logging.LogErrorf("write conf [%s] failed after %d attempts: %s", confPath, len(backoffs)+1, err)
	util.PushErrMsg("写入配置文件失败，请检查磁盘状态 Failed to write conf.json, please check the disk", 7000)
}

type syncBackupProfile struct {
	Type            string       `json:"type"`
	Version         int          `json:"version"`
	Updated         string       `json:"updated"`
	ContainsSecrets bool         `json:"containsSecrets"`
	Provider        int          `json:"provider"`
	ProviderName    string       `json:"providerName"`
	CloudName       string       `json:"cloudName"`
	RepoKey         string       `json:"repoKey"`
	S3              *conf.S3     `json:"s3,omitempty"`
	WebDAV          *conf.WebDAV `json:"webdav,omitempty"`
	Local           *conf.Local  `json:"local,omitempty"`
}

type SyncBackupProfileInfo struct {
	Key          string       `json:"key"`
	Provider     int          `json:"provider"`
	ProviderName string       `json:"providerName"`
	CloudName    string       `json:"cloudName"`
	Enabled      bool         `json:"enabled"`
	S3           *conf.S3     `json:"s3,omitempty"`
	WebDAV       *conf.WebDAV `json:"webdav,omitempty"`
	Local        *conf.Local  `json:"local,omitempty"`
}

const syncBackupProfileCloudPath = "_meta/backup-profile.json"

func writeSyncBackupProfile() {
	profilePath := filepath.Join(util.GetUserConfDir(), "backup-profile.json")
	profile := newSyncBackupProfile()
	if nil == profile {
		if err := os.Remove(profilePath); nil != err && !os.IsNotExist(err) {
			logging.LogWarnf("remove sync backup profile [%s] failed: %s", profilePath, err)
		}
		if err := removeSyncBackupProfileFromCloud(); nil != err {
			logging.LogWarnf("remove sync backup profile from cloud failed: %s", err)
		}
		return
	}

	if err := os.MkdirAll(filepath.Dir(profilePath), 0755); nil != err {
		logging.LogWarnf("create sync backup profile dir [%s] failed: %s", filepath.Dir(profilePath), err)
		return
	}

	data, err := gulu.JSON.MarshalIndentJSON(profile, "", "  ")
	if nil != err {
		logging.LogWarnf("marshal sync backup profile failed: %s", err)
		return
	}
	if err = filelock.WriteFile(profilePath, data); nil != err {
		logging.LogWarnf("write sync backup profile [%s] failed: %s", profilePath, err)
		return
	}
	if err = syncBackupProfileToCloud(data); nil != err {
		logging.LogWarnf("sync backup profile to cloud failed: %s", err)
	}
}

func newSyncBackupProfile() *syncBackupProfile {
	if nil == Conf || nil == Conf.Sync || nil == Conf.Repo || 1 > len(Conf.Repo.Key) {
		return nil
	}

	profile := &syncBackupProfile{
		Type:            "sourceflow-sync-backup-profile",
		Version:         1,
		Updated:         time.Now().Format(time.RFC3339),
		ContainsSecrets: true,
		Provider:        Conf.Sync.Provider,
		ProviderName:    conf.ProviderToStr(Conf.Sync.Provider),
		CloudName:       Conf.Sync.CloudName,
		RepoKey:         base64.StdEncoding.EncodeToString(Conf.Repo.Key),
	}
	if "" == profile.CloudName {
		profile.CloudName = "main"
	}

	switch Conf.Sync.Provider {
	case conf.ProviderS3:
		if nil == Conf.Sync.S3 || "" == Conf.Sync.S3.Endpoint || "" == Conf.Sync.S3.AccessKey || "" == Conf.Sync.S3.SecretKey || "" == Conf.Sync.S3.Bucket {
			return nil
		}
		s3 := *Conf.Sync.S3
		profile.S3 = &s3
	case conf.ProviderWebDAV:
		if nil == Conf.Sync.WebDAV || "" == Conf.Sync.WebDAV.Endpoint {
			return nil
		}
		webdav := *Conf.Sync.WebDAV
		profile.WebDAV = &webdav
	case conf.ProviderLocal:
		if nil == Conf.Sync.Local || "" == Conf.Sync.Local.Endpoint {
			return nil
		}
		local := *Conf.Sync.Local
		local.Endpoint = serializePortableLocalEndpoint(local.Endpoint)
		profile.Local = &local
	default:
		return nil
	}
	return profile
}

func syncBackupProfileToCloud(data []byte) (err error) {
	cloudRepo, err := newSyncBackupProfileCloudRepo()
	if nil != err {
		return
	}

	_, err = cloudRepo.UploadBytes(syncBackupProfileCloudPath, data, true)
	return
}

func removeSyncBackupProfileFromCloud() (err error) {
	if nil == Conf || nil == Conf.Sync {
		return
	}

	cloudRepo, err := newSyncBackupProfileCloudRepo()
	if nil != err {
		return
	}

	err = cloudRepo.RemoveObject(syncBackupProfileCloudPath)
	if cloud.ErrCloudObjectNotFound == err {
		err = nil
	}
	return
}

func newSyncBackupProfileCloudRepo() (cloudRepo cloud.Cloud, err error) {
	cloudName := strings.TrimSpace(Conf.Sync.CloudName)
	if "" == cloudName || !cloud.IsValidCloudDirName(cloudName) {
		cloudName = "main"
	}

	cloudConf := &cloud.Conf{
		Dir:           cloudName,
		UserID:        "0",
		AvailableSize: 1024 * 1024 * 1024 * 1024 * 2,
		Server:        util.GetCloudServer(),
	}

	switch Conf.Sync.Provider {
	case conf.ProviderS3:
		if nil == Conf.Sync.S3 {
			err = fmt.Errorf("missing S3 sync config")
			return
		}
		cloudConf.S3 = &cloud.ConfS3{
			Endpoint:       Conf.Sync.S3.Endpoint,
			AccessKey:      Conf.Sync.S3.AccessKey,
			SecretKey:      Conf.Sync.S3.SecretKey,
			Bucket:         Conf.Sync.S3.Bucket,
			Region:         Conf.Sync.S3.Region,
			PathStyle:      Conf.Sync.S3.PathStyle,
			SkipTlsVerify:  Conf.Sync.S3.SkipTlsVerify,
			Timeout:        Conf.Sync.S3.Timeout,
			ConcurrentReqs: Conf.Sync.S3.ConcurrentReqs,
		}
	case conf.ProviderWebDAV:
		if nil == Conf.Sync.WebDAV {
			err = fmt.Errorf("missing WebDAV sync config")
			return
		}
		cloudConf.WebDAV = &cloud.ConfWebDAV{
			Endpoint:       Conf.Sync.WebDAV.Endpoint,
			Username:       Conf.Sync.WebDAV.Username,
			Password:       Conf.Sync.WebDAV.Password,
			SkipTlsVerify:  Conf.Sync.WebDAV.SkipTlsVerify,
			Timeout:        Conf.Sync.WebDAV.Timeout,
			ConcurrentReqs: Conf.Sync.WebDAV.ConcurrentReqs,
		}
	case conf.ProviderLocal:
		if nil == Conf.Sync.Local {
			err = fmt.Errorf("missing Local File System sync config")
			return
		}
		cloudConf.Local = &cloud.ConfLocal{
			Endpoint:       Conf.Sync.Local.Endpoint,
			Timeout:        Conf.Sync.Local.Timeout,
			ConcurrentReqs: Conf.Sync.Local.ConcurrentReqs,
		}
	default:
		err = fmt.Errorf("unsupported sync provider [%d]", Conf.Sync.Provider)
		return
	}

	cloudRepo, err = newCloudRepo(cloudConf)
	return
}

func ImportSyncBackupProfile(data []byte) (ret *SyncBackupProfileInfo, err error) {
	profile := &syncBackupProfile{}
	if err = gulu.JSON.UnmarshalJSON(data, profile); nil != err {
		return
	}
	if "sourceflow-sync-backup-profile" != profile.Type || 1 != profile.Version {
		err = fmt.Errorf("invalid sync backup profile")
		return
	}

	switch profile.Provider {
	case conf.ProviderS3:
		if nil == profile.S3 {
			err = fmt.Errorf("missing S3 config in sync backup profile")
			return
		}
	case conf.ProviderWebDAV:
		if nil == profile.WebDAV {
			err = fmt.Errorf("missing WebDAV config in sync backup profile")
			return
		}
	case conf.ProviderLocal:
		if nil == profile.Local {
			err = fmt.Errorf("missing Local File System config in sync backup profile")
			return
		}
	default:
		err = fmt.Errorf("unsupported sync provider [%d] in sync backup profile", profile.Provider)
		return
	}

	key, err := ImportRepoKey(profile.RepoKey)
	if nil != err {
		return
	}

	switch profile.Provider {
	case conf.ProviderS3:
		if err = SetSyncProviderS3(profile.S3); nil != err {
			return
		}
	case conf.ProviderWebDAV:
		if err = SetSyncProviderWebDAV(profile.WebDAV); nil != err {
			return
		}
	case conf.ProviderLocal:
		if err = prepareSyncProviderLocal(profile.Local, false); nil != err {
			return
		}
		Conf.Sync.Local = profile.Local
		Conf.Save()
	}
	if err = SetSyncProvider(profile.Provider); nil != err {
		return
	}

	cloudName := strings.TrimSpace(profile.CloudName)
	if "" == cloudName {
		cloudName = "main"
	}
	if !cloud.IsValidCloudDirName(cloudName) {
		err = fmt.Errorf("%s", Conf.Language(37))
		return
	}
	SetCloudSyncDir(cloudName)

	Conf.Sync.Enabled = false
	Conf.Sync.Stat = ""
	Conf.Save()

	ret = &SyncBackupProfileInfo{
		Key:          key,
		Provider:     Conf.Sync.Provider,
		ProviderName: conf.ProviderToStr(Conf.Sync.Provider),
		CloudName:    Conf.Sync.CloudName,
		Enabled:      Conf.Sync.Enabled,
	}
	switch Conf.Sync.Provider {
	case conf.ProviderS3:
		ret.S3 = Conf.Sync.S3
	case conf.ProviderWebDAV:
		ret.WebDAV = Conf.Sync.WebDAV
	case conf.ProviderLocal:
		ret.Local = Conf.Sync.Local
	}
	return
}

func (conf *AppConf) Close() {
	conf.Save()
}

func (conf *AppConf) Box(boxID string) *Box {
	for _, box := range conf.GetOpenedBoxes() {
		if box.ID == boxID {
			return box
		}
	}
	return nil
}

func (conf *AppConf) GetBox(boxID string) *Box {
	for _, box := range conf.GetBoxes() {
		if box.ID == boxID {
			return box
		}
	}
	return nil
}

func (conf *AppConf) BoxNames(boxIDs []string) (ret map[string]string) {
	ret = map[string]string{}

	boxes := conf.GetOpenedBoxes()
	for _, boxID := range boxIDs {
		for _, box := range boxes {
			if box.ID == boxID {
				ret[boxID] = box.Name
				break
			}
		}
	}
	return
}

func (conf *AppConf) GetBoxes() (ret []*Box) {
	ret = []*Box{}
	notebooks, err := ListNotebooks()
	if err != nil {
		return
	}

	for _, notebook := range notebooks {
		id := notebook.ID
		name := notebook.Name
		closed := notebook.Closed
		box := &Box{ID: id, Name: name, Closed: closed}
		ret = append(ret, box)
	}
	return
}

func (conf *AppConf) GetOpenedBoxes() (ret []*Box) {
	ret = []*Box{}
	notebooks, err := ListNotebooks()
	if err != nil {
		return
	}

	for _, notebook := range notebooks {
		if !notebook.Closed {
			ret = append(ret, notebook)
		}
	}
	return
}

func (conf *AppConf) GetClosedBoxes() (ret []*Box) {
	ret = []*Box{}
	notebooks, err := ListNotebooks()
	if err != nil {
		return
	}

	for _, notebook := range notebooks {
		if notebook.Closed {
			ret = append(ret, notebook)
		}
	}
	return
}

func (conf *AppConf) Language(num int) (ret string) {
	ret = conf.language(num)
	return
}

func (conf *AppConf) language(num int) (ret string) {
	ret = util.Langs[conf.Lang][num]
	if "" != ret {
		return
	}
	ret = util.Langs["en_US"][num]
	return
}

func InitBoxes() {
	blockCount := treenode.CountBlocks()
	initialized := 0 < blockCount
	for _, box := range Conf.GetOpenedBoxes() {
		box.UpdateHistoryGenerated() // 初始化历史生成时间为当前时间

		if !initialized {
			indexBox(box.ID)
		}
	}

	logging.LogInfof("tree/block count [%d/%d]", treenode.CountTrees(), blockCount)
}

func IsSubscriber() bool {
	return false
}

func IsPaidUser() bool {
	return false
}

const (
	MaskedAccessAuthCode = "*******"
)

// GetMaskedConf 获取脱敏后的 Conf
func GetMaskedConf() (ret *AppConf, err error) {
	// 序列化时持锁，避免与 loadThemes/LoadIcons 等写操作并发导致 slice 在编码过程中被改写而 panic https://github.com/lonelyor/SourceFlow/issues/16978
	Conf.m.Lock()
	data, err := gulu.JSON.MarshalJSON(Conf)
	Conf.m.Unlock()
	if err != nil {
		logging.LogErrorf("marshal conf failed: %s", err)
		return
	}
	ret = &AppConf{}
	if err = gulu.JSON.UnmarshalJSON(data, ret); err != nil {
		logging.LogErrorf("unmarshal conf failed: %s", err)
		return
	}

	if "" != ret.AccessAuthCode {
		ret.AccessAuthCode = MaskedAccessAuthCode
	}
	return
}

// HideConfSecret 隐藏设置中的秘密信息
// REF: https://github.com/lonelyor/SourceFlow/issues/11364
func HideConfSecret(c *AppConf) {
	c.Api = &conf.API{}
	c.Flashcard = &conf.Flashcard{}
	c.ServerAddrs = []string{}
	c.Publish = &conf.Publish{}
	c.Repo = &conf.Repo{}
	c.Sync = &conf.Sync{}
	c.System.AppDir = ""
	c.System.ConfDir = ""
	c.System.DataDir = ""
	c.System.HomeDir = ""
	c.System.Name = ""
	c.System.NetworkProxy = &conf.NetworkProxy{}
}

func clearPortJSON() {
	pid := fmt.Sprintf("%d", os.Getpid())
	portJSON := filepath.Join(util.GetUserConfDir(), "port.json")
	pidPorts := map[string]string{}
	var data []byte
	var err error

	if gulu.File.IsExist(portJSON) {
		data, err = os.ReadFile(portJSON)
		if err != nil {
			logging.LogWarnf("read port.json failed: %s", err)
		} else {
			if err = gulu.JSON.UnmarshalJSON(data, &pidPorts); err != nil {
				logging.LogWarnf("unmarshal port.json failed: %s", err)
			}
		}
	}

	delete(pidPorts, pid)
	if data, err = gulu.JSON.MarshalIndentJSON(pidPorts, "", "  "); err != nil {
		logging.LogWarnf("marshal port.json failed: %s", err)
	} else {
		if err = os.WriteFile(portJSON, data, 0644); err != nil {
			logging.LogWarnf("write port.json failed: %s", err)
		}
	}
}

func clearCorruptedNotebooks() {
	// 数据同步时展开文档树操作可能导致数据丢失 https://github.com/lonelyor/SourceFlow/issues/7129

	dirs, err := os.ReadDir(util.DataDir)
	if err != nil {
		logging.LogErrorf("read dir [%s] failed: %s", util.DataDir, err)
		return
	}
	for _, dir := range dirs {
		if util.IsReservedFilename(dir.Name()) {
			continue
		}

		if !dir.IsDir() {
			continue
		}

		if !ast.IsNodeIDPattern(dir.Name()) {
			continue
		}

		boxDirPath := filepath.Join(util.DataDir, dir.Name())
		boxConfPath := util.HiddenDataPath(boxDirPath, "conf.json")
		if !filelock.IsExist(boxConfPath) {
			logging.LogWarnf("found a corrupted box [%s]", boxDirPath)
			continue
		}
	}
}

func clearWorkspaceTemp() {
	os.RemoveAll(filepath.Join(util.TempDir, "bazaar"))
	os.RemoveAll(filepath.Join(util.TempDir, "export"))
	os.RemoveAll(filepath.Join(util.TempDir, "import"))
	os.RemoveAll(filepath.Join(util.TempDir, "convert"))
	os.RemoveAll(filepath.Join(util.TempDir, "repo"))
	os.RemoveAll(filepath.Join(util.TempDir, "os"))
	os.RemoveAll(filepath.Join(util.TempDir, "base64"))

	// 退出时自动删除超过 7 天的安装包 https://github.com/lonelyor/SourceFlow/issues/6128
	install := filepath.Join(util.TempDir, "install")
	if gulu.File.IsDir(install) {
		monthAgo := time.Now().Add(-time.Hour * 24 * 7)
		entries, err := os.ReadDir(install)
		if err != nil {
			logging.LogErrorf("read dir [%s] failed: %s", install, err)
		} else {
			for _, entry := range entries {
				info, _ := entry.Info()
				if nil != info && !info.IsDir() && info.ModTime().Before(monthAgo) {
					if err = os.RemoveAll(filepath.Join(install, entry.Name())); err != nil {
						logging.LogErrorf("remove old install pkg [%s] failed: %s", filepath.Join(install, entry.Name()), err)
					}
				}
			}
		}
	}

	tmps, err := filepath.Glob(filepath.Join(util.TempDir, "*.tmp"))
	if err != nil {
		logging.LogErrorf("glob temp files failed: %s", err)
	}
	for _, tmp := range tmps {
		if err = os.RemoveAll(tmp); err != nil {
			logging.LogErrorf("remove temp file [%s] failed: %s", tmp, err)
		} else {
			logging.LogInfof("removed temp file [%s]", tmp)
		}
	}

	tmps, err = filepath.Glob(util.HiddenDataPath(util.DataDir, "*.tmp"))
	if err != nil {
		logging.LogErrorf("glob temp files failed: %s", err)
	}
	for _, tmp := range tmps {
		if err = os.RemoveAll(tmp); err != nil {
			logging.LogErrorf("remove temp file [%s] failed: %s", tmp, err)
		} else {
			logging.LogInfof("removed temp file [%s]", tmp)
		}
	}

	// 老版本遗留文件清理
	os.RemoveAll(util.HiddenDataPath(filepath.Join(util.DataDir, "assets"), "assets.json"))
	os.RemoveAll(util.HiddenDataPath(util.DataDir, "history"))
	os.RemoveAll(filepath.Join(util.WorkspaceDir, "backup"))
	os.RemoveAll(filepath.Join(util.WorkspaceDir, "sync"))
	os.RemoveAll(filepath.Join(util.TempDir, "blocktree.msgpack")) // v2.7.2 前旧版的块树数据
	os.RemoveAll(filepath.Join(util.DataDir, "%"))                 // v3.0.6 生成的错误历史文件夹
	os.RemoveAll(filepath.Join(util.TempDir, "blocktree"))         // v3.1.0 前旧版的块树数据

	logging.LogInfof("cleared workspace temp")
}

func closeUserGuide() {
	defer logging.Recover()

	dirs, err := os.ReadDir(util.DataDir)
	if err != nil {
		logging.LogErrorf("read dir [%s] failed: %s", util.DataDir, err)
		return
	}

	for _, dir := range dirs {
		if !IsUserGuide(dir.Name()) {
			continue
		}

		boxID := dir.Name()
		boxDirPath := filepath.Join(util.DataDir, boxID)
		boxConf := conf.NewBoxConf()
		boxConfPath := util.HiddenDataPath(boxDirPath, "conf.json")
		if !filelock.IsExist(boxConfPath) {
			logging.LogWarnf("found a corrupted user guide box [%s]", boxDirPath)
			if removeErr := filelock.Remove(boxDirPath); nil != removeErr {
				logging.LogErrorf("remove corrupted user guide box [%s] failed: %s", boxDirPath, removeErr)
			} else {
				logging.LogInfof("removed corrupted user guide box [%s]", boxDirPath)
			}
			continue
		}

		data, readErr := filelock.ReadFile(boxConfPath)
		if nil != readErr {
			logging.LogErrorf("read box conf [%s] failed: %s", boxConfPath, readErr)
			if removeErr := filelock.Remove(boxDirPath); nil != removeErr {
				logging.LogErrorf("remove corrupted user guide box [%s] failed: %s", boxDirPath, removeErr)
			} else {
				logging.LogInfof("removed corrupted user guide box [%s]", boxDirPath)
			}
			continue
		}
		if readErr = gulu.JSON.UnmarshalJSON(data, boxConf); nil != readErr {
			logging.LogErrorf("parse box conf [%s] failed: %s", boxConfPath, readErr)
			if removeErr := filelock.Remove(boxDirPath); nil != removeErr {
				logging.LogErrorf("remove corrupted user guide box [%s] failed: %s", boxDirPath, removeErr)
			} else {
				logging.LogInfof("removed corrupted user guide box [%s]", boxDirPath)
			}
			continue
		}

		if boxConf.Closed {
			continue
		}

		msgId := util.PushMsg(Conf.language(233), 30000)

		unindex(boxID)

		sql.FlushQueue()

		if removeErr := RemoveBox(boxID); nil == removeErr {
			evt := util.NewCmdResult("removeBox", 0, util.PushModeBroadcast)
			evt.Data = map[string]interface{}{
				"box": boxID,
			}
			util.PushEvent(evt)
		} else {
			logging.LogErrorf("close user guide box [%s] failed: %s", boxID, removeErr)
			util.PushClearMsg(msgId)
			continue
		}

		util.PushClearMsg(msgId)
		logging.LogInfof("closed user guide box [%s]", boxID)
	}
}

func init() {
	subscribeConfEvents()
}

func subscribeConfEvents() {
	eventbus.Subscribe(util.EvtConfPandocInitialized, func() {
		if nil == Conf || nil == Conf.Export || nil == Conf.System {
			return
		}
		logging.LogInfof("pandoc initialized, set pandoc bin to [%s]", util.PandocBinPath)
		Conf.Export.PandocBin = util.PandocBinPath

		params := util.RemoveInvalid(Conf.Export.PandocParams)
		if !Conf.System.IsMicrosoftStore {
			if normalizedParams, changed := normalizePandocReferenceDocParams(params); changed {
				params = normalizedParams
			}
		}
		Conf.Export.PandocParams = strings.TrimSpace(params)

		logging.LogInfof("pandoc params set to [%s]", Conf.Export.PandocParams)
		logging.LogInfof("pandoc resources [%s, %s]", util.PandocTemplatePath, util.PandocColorFilterPath)
		Conf.Save()
		util.BroadcastByType("main", "setConf", 0, "", Conf)
	})
}
