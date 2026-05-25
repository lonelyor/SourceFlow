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

package conf

import "github.com/lonelyor/sourceflow/kernel/util"

const (
	DefaultStartupPageImage = "/appearance/boot/startup-logo.png"
	DefaultFileTreeDensity  = "default"
)

type Appearance struct {
	Mode                int                `json:"mode"`                // 模式：0：明亮，1：暗黑
	ModeOS              bool               `json:"modeOS"`              // 模式是否跟随系统
	DarkThemes          []*AppearanceTheme `json:"darkThemes"`          // 暗黑模式外观主题列表
	LightThemes         []*AppearanceTheme `json:"lightThemes"`         // 明亮模式外观主题列表
	ThemeDark           string             `json:"themeDark"`           // 选择的暗黑模式外观主题
	ThemeLight          string             `json:"themeLight"`          // 选择的明亮模式外观主题
	ThemeVer            string             `json:"themeVer"`            // 选择的主题版本
	Icons               []string           `json:"icons"`               // 图标列表
	Icon                string             `json:"icon"`                // 选择的图标
	IconVer             string             `json:"iconVer"`             // 选择的图标版本
	CodeBlockThemeLight string             `json:"codeBlockThemeLight"` // 明亮模式下代码块主题
	CodeBlockThemeDark  string             `json:"codeBlockThemeDark"`  // 暗黑模式下代码块主题
	CodeBlockSkinLight  string             `json:"codeBlockSkinLight"`  // 明亮模式下代码块皮肤
	CodeBlockSkinDark   string             `json:"codeBlockSkinDark"`   // 暗黑模式下代码块皮肤
	Lang                string             `json:"lang"`                // 选择的界面语言，同 AppConf.Lang
	ThemeJS             bool               `json:"themeJS"`             // 是否启用了主题 JavaScript
	CloseButtonBehavior int                `json:"closeButtonBehavior"` // 关闭按钮行为，0：退出，1：最小化到托盘
	HideStatusBar       bool               `json:"hideStatusBar"`       // 是否隐藏底部状态栏
	StartupPageImage    string             `json:"startupPageImage"`    // 启动页背景图（data URL 或远程地址）
	StartupPageOpacity  int                `json:"startupPageOpacity"`  // 启动页背景图透明度，单位：%
	StartupPageBlur     int                `json:"startupPageBlur"`     // 启动页背景图模糊度，单位：px
	MascotEnabled       bool               `json:"mascotEnabled"`       // 是否启用看板娘
	MascotImage         string             `json:"mascotImage"`         // 看板娘图片（data URL 或远程地址）
	MascotPosition      string             `json:"mascotPosition"`      // 看板娘位置：left/right
	MascotEffect        string             `json:"mascotEffect"`        // 看板娘特效：float/sway/pulse/none
	MascotOpacity       int                `json:"mascotOpacity"`       // 看板娘透明度，单位：%
	MascotScale         int                `json:"mascotScale"`         // 看板娘缩放，单位：%
	FileTreeGuides      bool               `json:"fileTreeGuides"`      // 是否显示文档树层级引导线
	FileTreeDensity     string             `json:"fileTreeDensity"`     // 文档树行距密度：compact/default/loose
	FileTreeDocCount    bool               `json:"fileTreeDocCount"`    // 是否显示文档树子文档数量
	FileTreeTotalCount  *bool              `json:"fileTreeTotalCount"`  // 是否显示文档树全部笔记总数
	StatusBar           *util.StatusBar    `json:"statusBar"`           // 底部状态栏配置
}

func NewAppearance() *Appearance {
	return &Appearance{
		Mode:                0,
		ModeOS:              true,
		ThemeDark:           "midnight",
		ThemeLight:          "daylight",
		Icon:                "material",
		CodeBlockThemeLight: "github",
		CodeBlockThemeDark:  "base16/dracula",
		CodeBlockSkinLight:  "default",
		CodeBlockSkinDark:   "default",
		Lang:                "en_US",
		CloseButtonBehavior: 0,
		HideStatusBar:       false,
		StartupPageImage:    DefaultStartupPageImage,
		StartupPageOpacity:  100,
		StartupPageBlur:     0,
		MascotEnabled:       false,
		MascotImage:         "",
		MascotPosition:      "right",
		MascotEffect:        "float",
		MascotOpacity:       100,
		MascotScale:         100,
		FileTreeGuides:      false,
		FileTreeDensity:     DefaultFileTreeDensity,
		FileTreeDocCount:    false,
		FileTreeTotalCount:  func() *bool { v := true; return &v }(),
		StatusBar:           &util.StatusBar{},
	}
}

type AppearanceTheme struct {
	Name  string `json:"name"`  // daylight
	Label string `json:"label"` // i18n display name
}
