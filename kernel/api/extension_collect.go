package api

import (
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

const (
	collectPayloadInvalidMsg = "Invalid capture payload"
	collectPageEmptyMsg      = "Page content is empty. Refresh the page and try again."
	collectURLEmptyMsg       = "URL cannot be empty"
	collectURLInvalidMsg     = "Enter a valid domain or http/https URL"
)

func extensionCollectSnapshot(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	form, err := c.MultipartForm()
	if nil != err {
		ret.Code = -1
		ret.Msg = collectPayloadInvalidMsg
		return
	}

	notebook := firstFormValue(form, "notebook")
	if util.InvalidIDPattern(notebook, ret) {
		return
	}

	sourceURL, _, err := normalizeCollectURL(firstFormValue(form, "href"))
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	converted, err := convertSnapshotFormToMarkdown(form)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	title := firstFormValue(form, "title")
	hPath := firstFormValue(form, "path")
	pathPrefix := firstFormValue(form, "pathPrefix")
	tags := firstFormValue(form, "tags")
	ret.Data, err = saveCollectedWebPage(notebook, hPath, pathPrefix, title, sourceURL, converted.Markdown, tags, converted.WithMath, map[string]interface{}{})
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

func saveCollectedWebPage(notebook, hPath, pathPrefix, title, sourceURL, markdown, tags string, withMath bool, arg map[string]interface{}) (map[string]interface{}, error) {
	title = normalizeClipTitle(strings.TrimSpace(title))
	if "" == title {
		if parsedURL, err := url.Parse(sourceURL); nil == err {
			title = normalizeClipTitle(parsedURL.Hostname())
		}
	}
	if "" == title {
		title = "网页导入"
	}

	hPath = resolveCollectedWebPath(hPath, pathPrefix, title)

	finalMD := buildClippedMarkdown(title, sourceURL, markdown)
	id, err := model.CreateWithMarkdown(tags, notebook, hPath, finalMD, "", ast.NewNodeID(), withMath, sourceURL)
	if nil != err {
		return nil, err
	}

	if err = model.SetBlockAttrs(id, buildCollectedWebAttrs(title, sourceURL)); nil != err {
		logging.LogWarnf("set collected web attrs failed: %s", err)
	}

	model.FlushTxQueue()
	if err = model.NetAssets2LocalAssets(id, false, sourceURL); nil != err {
		logging.LogWarnf("localize collected web assets failed: %s", err)
	}
	model.FlushTxQueue()

	box := model.Conf.Box(notebook)
	if nil != box {
		if block, getErr := model.GetBlock(id, nil); nil == getErr && nil != block {
			pushCreate(box, block.Path, arg)
		}
	}

	return map[string]interface{}{
		"id":        id,
		"path":      hPath,
		"title":     title,
		"sourceURL": sourceURL,
	}, nil
}

func buildCollectedWebAttrs(title, sourceURL string) map[string]string {
	return map[string]string{
		model.WorkbenchAttrType:       "url",
		model.WorkbenchAttrStatus:     "open",
		model.WorkbenchAttrInbox:      "true",
		model.WorkbenchAttrSourceURL:  sourceURL,
		model.WorkbenchAttrCapturedAt: time.Now().Format(time.RFC3339),
		model.WorkbenchAttrTitle:      title,
	}
}

func resolveCollectedWebPath(hPath, pathPrefix, title string) string {
	if "" != strings.TrimSpace(hPath) {
		return normalizeClipDocPath(hPath)
	}

	prefix := strings.TrimSpace(pathPrefix)
	if "" == prefix {
		prefix = "/收件箱/网页导入"
	}
	return normalizeClipDocPath(path.Join(prefix, title))
}

func normalizeCollectURL(rawURL string) (normalizedURL string, allowHTTPFallback bool, err error) {
	rawURL = util.RemoveInvalid(strings.TrimSpace(rawURL))
	if "" == rawURL {
		return "", false, fmt.Errorf(collectURLEmptyMsg)
	}

	lowerURL := strings.ToLower(rawURL)
	if strings.HasPrefix(lowerURL, "http://") || strings.HasPrefix(lowerURL, "https://") {
		parsedURL, parseErr := url.Parse(rawURL)
		if nil != parseErr || !parsedURL.IsAbs() || ("http" != parsedURL.Scheme && "https" != parsedURL.Scheme) || "" == parsedURL.Hostname() {
			return "", false, fmt.Errorf(collectURLInvalidMsg)
		}
		return parsedURL.String(), false, nil
	}

	if !strings.HasPrefix(lowerURL, "http://") && !strings.HasPrefix(lowerURL, "https://") {
		prefix := rawURL
		if idx := strings.IndexAny(prefix, "/?#"); -1 != idx {
			prefix = prefix[:idx]
		}
		if colon := strings.Index(prefix, ":"); -1 != colon {
			portCandidate := prefix[colon+1:]
			isHostPort := "" != portCandidate
			for _, r := range portCandidate {
				if r < '0' || '9' < r {
					isHostPort = false
					break
				}
			}
			if !isHostPort {
				return "", false, fmt.Errorf(collectURLInvalidMsg)
			}
		}
		rawURL = "https://" + strings.TrimLeft(rawURL, "/")
	}

	parsedURL, err := url.Parse(rawURL)
	if nil != err || !parsedURL.IsAbs() || ("http" != parsedURL.Scheme && "https" != parsedURL.Scheme) || "" == parsedURL.Hostname() {
		return "", false, fmt.Errorf(collectURLInvalidMsg)
	}
	return parsedURL.String(), true, nil
}
