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

package api

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	stdpath "path"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	bazaarpkg "github.com/lonelyor/sourceflow/kernel/bazaar"
	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/server/proxy"
	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

const (
	editorCursorImageMaxBytes             = 1024 * 1024
	editorCursorSavedImageMaxCount        = 48
	defaultEditorCursorImageWidthPercent  = 118
	defaultEditorCursorImageHeightPercent = 118
	defaultEditorCursorImageOffset        = 0
	editorNoteBackgroundImageMaxBytes     = 8 * 1024 * 1024
	appearanceStartupPageImageMaxBytes    = 8 * 1024 * 1024
	appearanceMascotImageMaxBytes         = 8 * 1024 * 1024
	defaultEditorCursorBlinkEffect        = "fade"
	defaultEditorNoteBackgroundOpacity    = 28
	defaultEditorNoteBackgroundBlur       = 0
	defaultAppearanceCodeBlockSkin        = "default"
	defaultAppearanceMascotPosition       = "right"
	defaultAppearanceMascotEffect         = "float"
	defaultAppearanceMascotOpacity        = 100
	defaultAppearanceMascotScale          = 100
)

type downloadEditorCursorImageRequest struct {
	URL string `json:"url"`
}

type downloadEditorCursorImageResult struct {
	Name    string `json:"name"`
	DataURL string `json:"dataURL"`
}

func setEditorReadOnly(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	readOnly := arg["readonly"].(bool)

	oldReadOnly := model.Conf.Editor.ReadOnly
	model.Conf.Editor.ReadOnly = readOnly
	model.Conf.Save()

	if oldReadOnly != model.Conf.Editor.ReadOnly {
		util.BroadcastByType("protyle", "readonly", 0, "", model.Conf.Editor.ReadOnly)
		util.BroadcastByType("main", "readonly", 0, "", model.Conf.Editor.ReadOnly)
	}
}

func setConfSnippet(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	snippet := &conf.Snpt{}
	if err = gulu.JSON.UnmarshalJSON(param, snippet); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.Conf.Snippet = snippet
	model.Conf.Save()

	ret.Data = snippet
	model.PushReloadSnippet(snippet)
}

func addVirtualBlockRefExclude(c *gin.Context) {
	// Add internal kernel API `/api/setting/addVirtualBlockRefExclude` https://github.com/lonelyor/SourceFlow/issues/9909

	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	keywordsArg := arg["keywords"]
	var keywords []string
	for _, k := range keywordsArg.([]interface{}) {
		keywords = append(keywords, k.(string))
	}

	model.AddVirtualBlockRefExclude(keywords)
	util.BroadcastByType("main", "setConf", 0, "", model.Conf)
}

func addVirtualBlockRefInclude(c *gin.Context) {
	// Add internal kernel API `/api/setting/addVirtualBlockRefInclude` https://github.com/lonelyor/SourceFlow/issues/9909

	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	keywordsArg := arg["keywords"]
	var keywords []string
	for _, k := range keywordsArg.([]interface{}) {
		keywords = append(keywords, k.(string))
	}

	model.AddVirtualBlockRefInclude(keywords)
	util.BroadcastByType("main", "setConf", 0, "", model.Conf)
}

func refreshVirtualBlockRef(c *gin.Context) {
	// Add internal kernel API `/api/setting/refreshVirtualBlockRef` https://github.com/lonelyor/SourceFlow/issues/9829

	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	model.ResetVirtualBlockRefCache()
	util.BroadcastByType("main", "setConf", 0, "", model.Conf)
}

func setBazaar(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	bazaar := &conf.Bazaar{}
	if err = gulu.JSON.UnmarshalJSON(param, bazaar); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	bazaar.Normalize()

	model.Conf.Bazaar = bazaar
	util.ApplyBazaarSettings(
		bazaar.BazaarHash,
		bazaar.BazaarVersionInfoURL,
		bazaar.BazaarStageBaseURL,
		bazaar.BazaarPackageBaseURL,
		bazaar.BazaarStatBaseURL,
		bazaar.BazaarReadmeCDNURL,
	)
	bazaarpkg.ResetCache()
	model.Conf.Save()

	ret.Data = bazaar
}

func setAI(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ai := &conf.AI{}
	if err = gulu.JSON.UnmarshalJSON(param, ai); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if 5 > ai.OpenAI.APITimeout {
		ai.OpenAI.APITimeout = 5
	}
	if 600 < ai.OpenAI.APITimeout {
		ai.OpenAI.APITimeout = 600
	}

	if 0 > ai.OpenAI.APIMaxTokens {
		ai.OpenAI.APIMaxTokens = 0
	}

	if 0 >= ai.OpenAI.APITemperature || 2 < ai.OpenAI.APITemperature {
		ai.OpenAI.APITemperature = 1.0
	}

	if 1 > ai.OpenAI.APIMaxContexts || 64 < ai.OpenAI.APIMaxContexts {
		ai.OpenAI.APIMaxContexts = 7
	}

	model.Conf.AI = ai
	model.Conf.Save()

	ret.Data = ai
}

func setFlashcard(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	flashcard := &conf.Flashcard{}
	if err = gulu.JSON.UnmarshalJSON(param, flashcard); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if 0 > flashcard.NewCardLimit {
		flashcard.NewCardLimit = 20
	}

	if 0 > flashcard.ReviewCardLimit {
		flashcard.ReviewCardLimit = 200
	}

	model.Conf.Flashcard = flashcard
	model.Conf.Save()

	ret.Data = flashcard
}

func setEditor(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	oldGenerateHistoryInterval := model.Conf.Editor.GenerateHistoryInterval

	editor := conf.NewEditor()
	if err = gulu.JSON.UnmarshalJSON(param, editor); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if "" == editor.PlantUMLServePath {
		editor.PlantUMLServePath = "https://www.plantuml.com/plantuml/svg/~1"
	}

	if "" == editor.KaTexMacros {
		editor.KaTexMacros = "{}"
	}
	switch editor.CursorPreset {
	case "bar", "underline", "underline-breathe", "image":
	default:
		editor.CursorPreset = "bar"
	}
	editor.CursorColor = normalizeEditorCursorColor(editor.CursorColor)
	editor.CursorImage = normalizeEditorCursorImage(editor.CursorImage)
	editor.CursorImageName = normalizeEditorCursorImageName(editor.CursorImageName, editor.CursorImage)
	if "" == editor.CursorImage {
		editor.CursorImageName = ""
		editor.CursorImageTint = false
	}
	if !isEditorCursorSVGImage(editor.CursorImage) {
		editor.CursorImageTint = false
	}
	editor.CursorImageWidthPercent = normalizeEditorCursorImagePercent(editor.CursorImageWidthPercent, defaultEditorCursorImageWidthPercent)
	editor.CursorImageHeightPercent = normalizeEditorCursorImagePercent(editor.CursorImageHeightPercent, defaultEditorCursorImageHeightPercent)
	editor.CursorImageOffsetX = normalizeEditorCursorImageOffset(editor.CursorImageOffsetX)
	editor.CursorImageOffsetY = normalizeEditorCursorImageOffset(editor.CursorImageOffsetY)
	editor.CursorSavedImages = normalizeEditorCursorSavedImages(editor.CursorSavedImages)
	editor.CursorBlinkEffect = normalizeEditorCursorBlinkEffect(editor.CursorBlinkEffect)
	editor.HiddenBlockColor = normalizeOptionalEditorColor(editor.HiddenBlockColor)
	editor.NoteBackgroundImage = normalizeEditorNoteBackgroundImage(editor.NoteBackgroundImage)
	editor.NoteBackgroundOpacity = normalizeEditorNoteBackgroundOpacity(editor.NoteBackgroundOpacity)
	editor.NoteBackgroundBlur = normalizeEditorNoteBackgroundBlur(editor.NoteBackgroundBlur)
	editor.AssetUploadProvider = normalizeEditorAssetUploadProvider(editor.AssetUploadProvider)
	editor.PicGoServerURL = normalizeEditorPicGoServerURL(editor.PicGoServerURL)
	editor.HTMLPasteMode = normalizeEditorHTMLPasteMode(editor.HTMLPasteMode)

	if 1 > editor.HistoryRetentionDays {
		editor.HistoryRetentionDays = 90
	}
	if 3650 < editor.HistoryRetentionDays {
		editor.HistoryRetentionDays = 3650
	}

	if nil == editor.FloatWindowDelay {
		v := 620
		editor.FloatWindowDelay = &v
	} else {
		*editor.FloatWindowDelay = max(0, min(2000, *editor.FloatWindowDelay))
	}

	oldVirtualBlockRef := model.Conf.Editor.VirtualBlockRef
	oldVirtualBlockRefInclude := model.Conf.Editor.VirtualBlockRefInclude
	oldVirtualBlockRefExclude := model.Conf.Editor.VirtualBlockRefExclude
	oldReadOnly := model.Conf.Editor.ReadOnly

	model.Conf.Editor = editor
	model.Conf.Save()

	if oldGenerateHistoryInterval != model.Conf.Editor.GenerateHistoryInterval {
		model.GenerateFileHistory()
		model.ChangeHistoryTick(editor.GenerateHistoryInterval)
	}

	if oldVirtualBlockRef != model.Conf.Editor.VirtualBlockRef ||
		oldVirtualBlockRefInclude != model.Conf.Editor.VirtualBlockRefInclude ||
		oldVirtualBlockRefExclude != model.Conf.Editor.VirtualBlockRefExclude {
		model.ResetVirtualBlockRefCache()
	}

	if oldReadOnly != model.Conf.Editor.ReadOnly {
		util.BroadcastByType("protyle", "readonly", 0, "", model.Conf.Editor.ReadOnly)
		util.BroadcastByType("main", "readonly", 0, "", model.Conf.Editor.ReadOnly)
	}

	util.MarkdownSettings = model.Conf.Editor.Markdown

	ret.Data = model.Conf.Editor
}

func normalizeEditorAssetUploadProvider(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case conf.EditorAssetUploadProviderPicGo:
		return conf.EditorAssetUploadProviderPicGo
	default:
		return conf.EditorAssetUploadProviderLocal
	}
}

func normalizeEditorHTMLPasteMode(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case conf.EditorHTMLPasteModeHTML:
		return conf.EditorHTMLPasteModeHTML
	case conf.EditorHTMLPasteModeImage:
		return conf.EditorHTMLPasteModeImage
	default:
		return conf.EditorHTMLPasteModeSmart
	}
}

func normalizeEditorPicGoServerURL(value string) string {
	normalized := strings.TrimSpace(value)
	if "" == normalized {
		return conf.DefaultEditorPicGoServerURL
	}
	if !strings.Contains(normalized, "://") {
		normalized = "http://" + normalized
	}

	parsedURL, err := url.Parse(normalized)
	if nil != err || "" == parsedURL.Host {
		return conf.DefaultEditorPicGoServerURL
	}
	if "" == parsedURL.Scheme {
		parsedURL.Scheme = "http"
	}
	if "" == parsedURL.Path || "/" == parsedURL.Path {
		parsedURL.Path = "/upload"
	}
	parsedURL.Fragment = ""
	return parsedURL.String()
}

func downloadEditorCursorImage(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &downloadEditorCursorImageRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	data, err := downloadEditorCursorImage0(req.URL, &http.Client{Timeout: 20 * time.Second})
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = data
}

func normalizeEditorCursorColor(value string) string {
	normalized := strings.TrimSpace(value)
	lowerCase := strings.ToLower(normalized)
	switch lowerCase {
	case "#ffffff", "#ff9f1a", "#ff6b6b", "#ffd166", "#b8ff1f", "#42d392", "#ff8fb8", "#225cff", "#4fc3ff", "#00c2ff", "#a46bff":
		return lowerCase
	}
	if isEditorCursorHexColor(normalized) {
		if !strings.HasPrefix(normalized, "#") {
			normalized = "#" + normalized
		}
		return strings.ToLower(normalized)
	}
	if isEditorCursorRGBColor(normalized) {
		return normalized
	}
	return "#ff9f1a"
}

func normalizeOptionalEditorColor(value string) string {
	if "" == strings.TrimSpace(value) {
		return ""
	}
	return normalizeEditorCursorColor(value)
}

func isEditorCursorHexColor(value string) bool {
	normalized := strings.TrimPrefix(strings.TrimSpace(value), "#")
	switch len(normalized) {
	case 3, 6, 8:
	default:
		return false
	}
	for _, ch := range normalized {
		if !strings.ContainsRune("0123456789abcdefABCDEF", ch) {
			return false
		}
	}
	return true
}

func isEditorCursorRGBColor(value string) bool {
	normalized := strings.TrimSpace(value)
	lowerCase := strings.ToLower(normalized)
	if !strings.HasPrefix(lowerCase, "rgb(") && !strings.HasPrefix(lowerCase, "rgba(") {
		return false
	}
	openParen := strings.IndexRune(normalized, '(')
	closeParen := strings.LastIndex(normalized, ")")
	if 0 > openParen || closeParen <= openParen {
		return false
	}
	fn := lowerCase[:openParen]
	parts := strings.Split(normalized[openParen+1:closeParen], ",")
	if "rgb" == fn && 3 != len(parts) {
		return false
	}
	if "rgba" == fn && 4 != len(parts) {
		return false
	}
	for _, part := range parts[:3] {
		if !isValidEditorCursorChannel(part) {
			return false
		}
	}
	return "rgba" != fn || isValidEditorCursorAlpha(parts[3])
}

func isValidEditorCursorChannel(value string) bool {
	normalized := strings.TrimSpace(value)
	if "" == normalized {
		return false
	}
	if strings.HasSuffix(normalized, "%") {
		percent, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(normalized, "%")), 64)
		return nil == err && 0 <= percent && 100 >= percent
	}
	channel, err := strconv.ParseFloat(normalized, 64)
	return nil == err && 0 <= channel && 255 >= channel
}

func isValidEditorCursorAlpha(value string) bool {
	normalized := strings.TrimSpace(value)
	if "" == normalized {
		return false
	}
	if strings.HasSuffix(normalized, "%") {
		percent, err := strconv.ParseFloat(strings.TrimSpace(strings.TrimSuffix(normalized, "%")), 64)
		return nil == err && 0 <= percent && 100 >= percent
	}
	alpha, err := strconv.ParseFloat(normalized, 64)
	return nil == err && 0 <= alpha && 1 >= alpha
}

func normalizeEditorCursorImage(value string) string {
	normalized := strings.TrimSpace(value)
	lowerCase := strings.ToLower(normalized)
	if strings.HasPrefix(lowerCase, "data:image/") {
		if isSupportedEditorCursorDataURL(normalized) && !isOversizedEditorCursorDataURL(normalized) {
			return normalized
		}
		return ""
	}
	if strings.HasPrefix(lowerCase, "http://") || strings.HasPrefix(lowerCase, "https://") || strings.HasPrefix(lowerCase, "file://") {
		return normalized
	}
	return ""
}

func isSupportedEditorCursorDataURL(value string) bool {
	lowerCase := strings.ToLower(strings.TrimSpace(value))
	switch {
	case strings.HasPrefix(lowerCase, "data:image/svg+xml"):
		return true
	case strings.HasPrefix(lowerCase, "data:image/png"):
		return true
	case strings.HasPrefix(lowerCase, "data:image/jpeg"):
		return true
	case strings.HasPrefix(lowerCase, "data:image/jpg"):
		return true
	case strings.HasPrefix(lowerCase, "data:image/gif"):
		return true
	case strings.HasPrefix(lowerCase, "data:image/webp"):
		return true
	default:
		return false
	}
}

func isOversizedEditorCursorDataURL(value string) bool {
	return isOversizedEditorImageDataURL(value, editorCursorImageMaxBytes)
}

func isOversizedEditorImageDataURL(value string, maxBytes int) bool {
	normalized := strings.TrimSpace(value)
	comma := strings.IndexByte(normalized, ',')
	if 0 > comma {
		return true
	}
	header := strings.ToLower(normalized[:comma])
	payload := strings.TrimSpace(normalized[comma+1:])
	if strings.Contains(header, ";base64") {
		return base64.StdEncoding.DecodedLen(len(payload)) > maxBytes
	}
	return len(payload) > maxBytes
}

func normalizeEditorCursorImageName(value, source string) string {
	sanitized := strings.Map(func(r rune) rune {
		switch r {
		case '\\', '/', ':', '*', '?', '"', '<', '>', '|':
			return '-'
		}
		if 32 > r {
			return -1
		}
		return r
	}, strings.TrimSpace(value))
	sanitized = strings.TrimSpace(sanitized)
	if "" == sanitized && "" != strings.TrimSpace(source) {
		sanitized = "cursor-image"
	}
	if 120 < len([]rune(sanitized)) {
		sanitized = string([]rune(sanitized)[:120])
	}
	return sanitized
}

func isEditorCursorSVGImage(value string) bool {
	normalized := strings.ToLower(normalizeEditorCursorImage(value))
	if "" == normalized {
		return false
	}
	if strings.HasPrefix(normalized, "data:image/svg+xml") {
		return true
	}
	withoutQuery := strings.SplitN(normalized, "?", 2)[0]
	withoutHash := strings.SplitN(withoutQuery, "#", 2)[0]
	return strings.HasSuffix(withoutHash, ".svg")
}

func normalizeEditorCursorImagePercent(value, fallback int) int {
	if 40 > value || 300 < value {
		return fallback
	}
	return value
}

func normalizeEditorCursorImageOffset(value int) int {
	if -96 > value {
		return -96
	}
	if 96 < value {
		return 96
	}
	return value
}

func normalizeEditorCursorSavedImages(value []conf.EditorCursorSavedImage) []conf.EditorCursorSavedImage {
	ret := make([]conf.EditorCursorSavedImage, 0, len(value))
	seenSources := map[string]struct{}{}
	for i, item := range value {
		if editorCursorSavedImageMaxCount <= len(ret) {
			break
		}
		source := normalizeEditorCursorImage(item.Source)
		if "" == source || !strings.HasPrefix(strings.ToLower(source), "data:image/") {
			continue
		}
		if _, exists := seenSources[source]; exists {
			continue
		}
		seenSources[source] = struct{}{}
		id := strings.TrimSpace(item.ID)
		if "" == id {
			id = fmt.Sprintf("cursor-%d-%d", time.Now().UnixMilli(), i+1)
		}
		name := normalizeEditorCursorImageName(item.Name, source)
		createdAt := item.CreatedAt
		if 0 >= createdAt {
			createdAt = time.Now().UnixMilli()
		}
		ret = append(ret, conf.EditorCursorSavedImage{
			ID:        id,
			Name:      name,
			Source:    source,
			CreatedAt: createdAt,
		})
	}
	return ret
}

func normalizeEditorCursorBlinkEffect(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "fade", "pulse", "glow":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return defaultEditorCursorBlinkEffect
	}
}

func normalizeEditorNoteBackgroundImage(value string) string {
	normalized := strings.TrimSpace(value)
	lowerCase := strings.ToLower(normalized)
	if strings.HasPrefix(lowerCase, "data:image/") {
		if isSupportedEditorCursorDataURL(normalized) && !isOversizedEditorImageDataURL(normalized, editorNoteBackgroundImageMaxBytes) {
			return normalized
		}
		return ""
	}
	if strings.HasPrefix(lowerCase, "http://") || strings.HasPrefix(lowerCase, "https://") || strings.HasPrefix(lowerCase, "file://") {
		return normalized
	}
	return ""
}

func normalizeEditorNoteBackgroundOpacity(value int) int {
	if 0 > value {
		return 0
	}
	if 100 < value {
		return 100
	}
	return value
}

func normalizeEditorNoteBackgroundBlur(value int) int {
	if 0 > value {
		return 0
	}
	if 32 < value {
		return 32
	}
	return value
}

func normalizeAppearanceStartupPageImage(value string) string {
	normalized := strings.TrimSpace(value)
	if "" == normalized {
		return ""
	}
	lowerCase := strings.ToLower(normalized)
	if strings.HasPrefix(lowerCase, "data:image/") {
		if isSupportedEditorCursorDataURL(normalized) && !isOversizedEditorImageDataURL(normalized, appearanceStartupPageImageMaxBytes) {
			return normalized
		}
		return ""
	}
	if strings.HasPrefix(lowerCase, "http://") || strings.HasPrefix(lowerCase, "https://") || strings.HasPrefix(lowerCase, "file://") || strings.HasPrefix(normalized, "/") {
		return normalized
	}
	return ""
}

func normalizeAppearanceStartupPageOpacity(value int) int {
	if 0 > value {
		return 0
	}
	if 100 < value {
		return 100
	}
	return value
}

func normalizeAppearanceStartupPageBlur(value int) int {
	if 0 > value {
		return 0
	}
	if 32 < value {
		return 32
	}
	return value
}

func normalizeAppearanceMascotImage(value string) string {
	normalized := strings.TrimSpace(value)
	lowerCase := strings.ToLower(normalized)
	if strings.HasPrefix(lowerCase, "data:image/") {
		if isSupportedEditorCursorDataURL(normalized) && !isOversizedEditorImageDataURL(normalized, appearanceMascotImageMaxBytes) {
			return normalized
		}
		return ""
	}
	if strings.HasPrefix(lowerCase, "http://") || strings.HasPrefix(lowerCase, "https://") || strings.HasPrefix(lowerCase, "file://") {
		return normalized
	}
	return ""
}

func normalizeAppearanceMascotPosition(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "left":
		return "left"
	default:
		return defaultAppearanceMascotPosition
	}
}

func normalizeAppearanceMascotEffect(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "none", "sway", "pulse":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return defaultAppearanceMascotEffect
	}
}

func normalizeAppearanceMascotOpacity(value int) int {
	if 0 > value {
		return 0
	}
	if 100 < value {
		return 100
	}
	return value
}

func normalizeAppearanceMascotScale(value int) int {
	if 40 > value {
		return 40
	}
	if 180 < value {
		return 180
	}
	return value
}

func normalizeAppearanceCodeBlockSkin(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "mac", "iterm2", "minimal":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return defaultAppearanceCodeBlockSkin
	}
}

func normalizeAppearanceFileTreeDensity(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "compact", conf.DefaultFileTreeDensity, "loose":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return conf.DefaultFileTreeDensity
	}
}

func downloadEditorCursorImage0(rawURL string, client *http.Client) (ret *downloadEditorCursorImageResult, err error) {
	rawURL = strings.TrimSpace(rawURL)
	if "" == rawURL {
		return nil, fmt.Errorf("remote cursor URL is required")
	}

	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if "http" != strings.ToLower(parsedURL.Scheme) && "https" != strings.ToLower(parsedURL.Scheme) {
		return nil, fmt.Errorf("only http/https remote cursor URLs are supported")
	}
	if nil == client {
		client = &http.Client{Timeout: 20 * time.Second}
	}

	req, err := http.NewRequest(http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "SourceFlow Cursor Downloader/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if 200 > resp.StatusCode || 300 <= resp.StatusCode {
		return nil, fmt.Errorf("remote cursor request failed with status %d", resp.StatusCode)
	}
	if editorCursorImageMaxBytes < resp.ContentLength && 0 < resp.ContentLength {
		return nil, fmt.Errorf("remote cursor image is too large (max 1 MB)")
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, editorCursorImageMaxBytes+1))
	if err != nil {
		return nil, err
	}
	if editorCursorImageMaxBytes < len(body) {
		return nil, fmt.Errorf("remote cursor image is too large (max 1 MB)")
	}
	if 1 > len(body) {
		return nil, fmt.Errorf("remote cursor image is empty")
	}

	mediaType := resolveEditorCursorImageMediaType(resp.Header.Get("Content-Type"), body, parsedURL.Path)
	if "" == mediaType {
		return nil, fmt.Errorf("unsupported remote cursor image format")
	}

	return &downloadEditorCursorImageResult{
		Name:    buildEditorCursorDownloadName(parsedURL, mediaType),
		DataURL: "data:" + mediaType + ";base64," + base64.StdEncoding.EncodeToString(body),
	}, nil
}

func resolveEditorCursorImageMediaType(contentType string, body []byte, requestPath string) string {
	if "" != strings.TrimSpace(contentType) {
		if mediaType, _, err := mime.ParseMediaType(contentType); nil == err {
			if normalized := normalizeEditorCursorMediaType(mediaType); "" != normalized {
				return normalized
			}
		}
	}

	sniffLen := len(body)
	if 512 < sniffLen {
		sniffLen = 512
	}
	if looksLikeSVG(body[:sniffLen]) || strings.HasSuffix(strings.ToLower(strings.SplitN(requestPath, "?", 2)[0]), ".svg") {
		return "image/svg+xml"
	}

	detected := http.DetectContentType(body[:sniffLen])
	mediaType, _, err := mime.ParseMediaType(detected)
	if nil != err {
		return ""
	}
	return normalizeEditorCursorMediaType(mediaType)
}

func normalizeEditorCursorMediaType(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "image/svg+xml", "image/svg":
		return "image/svg+xml"
	case "image/png", "image/x-png":
		return "image/png"
	case "image/jpeg", "image/jpg", "image/pjpeg":
		return "image/jpeg"
	case "image/gif":
		return "image/gif"
	case "image/webp":
		return "image/webp"
	default:
		return ""
	}
}

func looksLikeSVG(body []byte) bool {
	trimmed := bytes.TrimSpace(body)
	return bytes.Contains(bytes.ToLower(trimmed), []byte("<svg"))
}

func buildEditorCursorDownloadName(parsedURL *url.URL, mediaType string) string {
	baseName := ""
	if nil != parsedURL {
		baseName = strings.TrimSpace(stdpath.Base(parsedURL.Path))
	}
	if "." == baseName || "/" == baseName {
		baseName = ""
	}
	baseName = normalizeEditorCursorImageName(baseName, "")
	ext := editorCursorMediaTypeExtension(mediaType)
	if "" == baseName {
		baseName = fmt.Sprintf("cursor-%d%s", time.Now().UnixMilli(), ext)
	} else if "" != ext && !strings.HasSuffix(strings.ToLower(baseName), ext) {
		baseName += ext
	}
	return normalizeEditorCursorImageName(baseName, "")
}

func editorCursorMediaTypeExtension(mediaType string) string {
	switch normalizeEditorCursorMediaType(mediaType) {
	case "image/svg+xml":
		return ".svg"
	case "image/png":
		return ".png"
	case "image/jpeg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	default:
		return ""
	}
}

func setExport(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	export := &conf.Export{}
	if err = gulu.JSON.UnmarshalJSON(param, export); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		ret.Data = map[string]interface{}{"closeTimeout": 5000}
		return
	}

	pandocBinChanged := nil != model.Conf.Export && export.PandocBin != model.Conf.Export.PandocBin
	if "" != export.PandocBin {
		if !util.IsValidPandocBin(export.PandocBin) {
			util.PushErrMsg(fmt.Sprintf(model.Conf.Language(117), export.PandocBin), 5000)
			export.PandocBin = util.PandocBinPath
		}
	}

	model.Conf.Export = export
	model.Conf.Save()
	if pandocBinChanged || !util.IsValidPandocBin(util.PandocBinPath) {
		util.PandocBinPath = ""
		util.PandocBinManaged = false
		util.InitPandoc()
	}

	ret.Data = model.Conf.Export
}

func setFiletree(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	fileTree := conf.NewFileTree()
	if err = gulu.JSON.UnmarshalJSON(param, fileTree); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	fileTree.RefCreateSavePath = util.TrimSpaceInPath(fileTree.RefCreateSavePath)
	if "" != fileTree.RefCreateSavePath {
		if !strings.HasSuffix(fileTree.RefCreateSavePath, "/") {
			fileTree.RefCreateSavePath += "/"
		}
	}

	fileTree.DocCreateSavePath = util.TrimSpaceInPath(fileTree.DocCreateSavePath)

	if 1 > fileTree.MaxOpenTabCount {
		fileTree.MaxOpenTabCount = 8
	}
	if 32 < fileTree.MaxOpenTabCount {
		fileTree.MaxOpenTabCount = 32
	}

	if conf.MinFileTreeRecentDocsListCount > fileTree.RecentDocsMaxListCount {
		fileTree.RecentDocsMaxListCount = conf.MinFileTreeRecentDocsListCount
	}
	if conf.MaxFileTreeRecentDocsListCount < fileTree.RecentDocsMaxListCount {
		fileTree.RecentDocsMaxListCount = conf.MaxFileTreeRecentDocsListCount
	}

	model.Conf.FileTree = fileTree
	model.Conf.Save()

	util.UseSingleLineSave = model.Conf.FileTree.UseSingleLineSave
	util.LargeFileWarningSize = model.Conf.FileTree.LargeFileWarningSize

	ret.Data = model.Conf.FileTree
}

func setSearch(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	s := &conf.Search{}
	if err = gulu.JSON.UnmarshalJSON(param, s); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if 32 > s.Limit {
		s.Limit = 32
	}

	oldCaseSensitive := model.Conf.Search.CaseSensitive
	oldIndexAssetPath := model.Conf.Search.IndexAssetPath

	oldVirtualRefName := model.Conf.Search.VirtualRefName
	oldVirtualRefAlias := model.Conf.Search.VirtualRefAlias
	oldVirtualRefAnchor := model.Conf.Search.VirtualRefAnchor
	oldVirtualRefDoc := model.Conf.Search.VirtualRefDoc

	model.Conf.Search = s
	model.Conf.Save()

	sql.SetCaseSensitive(s.CaseSensitive)
	sql.SetIndexAssetPath(s.IndexAssetPath)

	if needFullReindex := s.CaseSensitive != oldCaseSensitive || s.IndexAssetPath != oldIndexAssetPath; needFullReindex {
		model.FullReindex(false)
	}

	if oldVirtualRefName != s.VirtualRefName ||
		oldVirtualRefAlias != s.VirtualRefAlias ||
		oldVirtualRefAnchor != s.VirtualRefAnchor ||
		oldVirtualRefDoc != s.VirtualRefDoc {
		model.ResetVirtualBlockRefCache()
	}
	ret.Data = s
}

func setKeymap(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg["data"])
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	keymap := &conf.Keymap{}
	if err = gulu.JSON.UnmarshalJSON(param, keymap); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.Conf.Keymap = keymap
	model.Conf.Save()
}

func setAppearance(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	appearance := &conf.Appearance{}
	if err = gulu.JSON.UnmarshalJSON(param, appearance); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	if nil == appearance.StatusBar {
		appearance.StatusBar = &util.StatusBar{}
	}
	if nil == appearance.FileTreeTotalCount {
		fileTreeTotalCount := true
		appearance.FileTreeTotalCount = &fileTreeTotalCount
	}
	appearance.CodeBlockSkinLight = normalizeAppearanceCodeBlockSkin(appearance.CodeBlockSkinLight)
	appearance.CodeBlockSkinDark = normalizeAppearanceCodeBlockSkin(appearance.CodeBlockSkinDark)
	appearance.StartupPageImage = normalizeAppearanceStartupPageImage(appearance.StartupPageImage)
	appearance.StartupPageOpacity = normalizeAppearanceStartupPageOpacity(appearance.StartupPageOpacity)
	appearance.StartupPageBlur = normalizeAppearanceStartupPageBlur(appearance.StartupPageBlur)
	if "" == appearance.StartupPageImage && 0 == appearance.StartupPageOpacity {
		appearance.StartupPageOpacity = 100
	}
	appearance.MascotImage = normalizeAppearanceMascotImage(appearance.MascotImage)
	appearance.MascotPosition = normalizeAppearanceMascotPosition(appearance.MascotPosition)
	appearance.MascotEffect = normalizeAppearanceMascotEffect(appearance.MascotEffect)
	appearance.MascotOpacity = normalizeAppearanceMascotOpacity(appearance.MascotOpacity)
	appearance.MascotScale = normalizeAppearanceMascotScale(appearance.MascotScale)
	appearance.FileTreeDensity = normalizeAppearanceFileTreeDensity(appearance.FileTreeDensity)
	if "" == appearance.MascotImage {
		appearance.MascotEnabled = false
	}

	model.Conf.Appearance = appearance
	util.StatusBarCfg = model.Conf.Appearance.StatusBar
	model.Conf.Lang = appearance.Lang
	util.Lang = model.Conf.Lang
	model.Conf.Save()
	model.InitAppearance()

	ret.Data = model.Conf.Appearance
	util.BroadcastByType("main", "setAppearance", 0, "", model.Conf.Appearance)
}

func setIcon(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var icon string
	if !util.ParseJsonArgs(arg, ret,
		util.BindJsonArg("icon", true, &icon),
	) {
		return
	}

	icon = strings.TrimSpace(icon)
	if icon == "" {
		ret.Code = -1
		ret.Msg = "[icon] must not be empty"
		return
	}

	if err := model.SetIcon(icon); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.InitAppearance()
	util.BroadcastByType("main", "setAppearance", 0, "", model.Conf.Appearance)
}

func setTheme(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	var theme, appearanceMode string
	var modesRaw []any
	if !util.ParseJsonArgs(arg, ret,
		util.BindJsonArg("theme", false, &theme),
		util.BindJsonArg("modes", false, &modesRaw),
		util.BindJsonArg("appearanceMode", false, &appearanceMode),
	) {
		return
	}

	theme, appearanceMode = strings.TrimSpace(theme), strings.TrimSpace(appearanceMode)
	modes := make([]int, 0, 2)
	if theme != "" {
		for _, m := range modesRaw {
			mf, ok := m.(float64)
			if !ok {
				break
			}
			mi := int(mf)
			if mi != 0 && mi != 1 {
				break
			}
			modes = append(modes, mi)
		}
		if len(modes) == 0 {
			ret.Code = -1
			ret.Msg = "[modes] is required ([0] for light, [1] for dark, [0,1] for both)"
			return
		}
	}
	// 没有 theme 时静默忽略 modes

	if err := model.SetTheme(theme, modes, appearanceMode); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.InitAppearance()
	util.BroadcastByType("main", "setAppearance", 0, "", model.Conf.Appearance)
}

func setPublish(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	param, err := gulu.JSON.MarshalJSON(arg)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	publish := &conf.Publish{}
	if err = gulu.JSON.UnmarshalJSON(param, publish); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	model.Conf.Publish = publish
	if publish.Auth != nil {
		for _, acc := range publish.Auth.Accounts {
			acc.HashPasswordIfPlain()
		}
	}
	model.Conf.Save()

	port, err := proxy.InitPublishService()
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = map[string]any{
		"port":    port,
		"publish": model.Conf.Publish,
	}

	util.BroadcastByType("main", "setPublish", 0, "", model.Conf.Publish)
}

func getPublish(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	if port, err := proxy.InitPublishService(); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
	} else {
		publishData, _ := gulu.JSON.MarshalJSON(model.Conf.Publish)
		publishCloned := &conf.Publish{}
		if err := gulu.JSON.UnmarshalJSON(publishData, publishCloned); err == nil {
			if publishCloned.Auth != nil {
				for _, acc := range publishCloned.Auth.Accounts {
					acc.Password = ""
				}
			}
		}
		ret.Data = map[string]any{
			"port":    port,
			"publish": publishCloned,
		}
	}
}

func setEmoji(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	argEmoji := arg["emoji"].([]interface{})
	var emoji []string
	for _, ae := range argEmoji {
		e := ae.(string)
		if strings.Contains(e, ".") {
			// XSS through emoji name https://github.com/lonelyor/SourceFlow/issues/15034
			e = util.FilterUploadEmojiFileName(e)
		}
		emoji = append(emoji, e)
	}

	model.Conf.Editor.Emoji = emoji
}
