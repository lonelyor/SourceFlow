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
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/PuerkitoBio/goquery"
	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

var collectedMarkdownDocIALPattern = regexp.MustCompile(`(?ms)\n{2}\{\:\s+[^}]*type="doc"[^}]*\}\s*$`)

func extensionCopy(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(200, ret)

	form, err := c.MultipartForm()
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
	ret.Data = map[string]interface{}{
		"md":       converted.Markdown,
		"withMath": converted.WithMath,
	}
	ret.Msg = model.Conf.Language(72)
}

func extensionClipURL(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := util.JsonArg(c, ret)
	if !ok {
		return
	}

	notebook := arg["notebook"].(string)
	if util.InvalidIDPattern(notebook, ret) {
		return
	}

	sourceURL, allowHTTPFallback, err := normalizeCollectURL(arg["url"].(string))
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	tags := ""
	if tagsArg := arg["tags"]; nil != tagsArg {
		tags = tagsArg.(string)
	}

	title := ""
	if titleArg := arg["title"]; nil != titleArg {
		title = strings.TrimSpace(titleArg.(string))
	}

	hPath := ""
	if pathArg := arg["path"]; nil != pathArg {
		hPath = pathArg.(string)
	}

	pathPrefix := ""
	if pathPrefixArg := arg["pathPrefix"]; nil != pathPrefixArg {
		pathPrefix = pathPrefixArg.(string)
	}

	md, withMath, parsedTitle, sourceURL, err := clipURLToMarkdown(sourceURL, allowHTTPFallback)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	if "" == title {
		title = parsedTitle
	}
	ret.Data, err = saveCollectedWebPage(notebook, hPath, pathPrefix, title, sourceURL, md, tags, withMath, arg)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

func clipURLToMarkdown(rawURL string, allowHTTPFallback bool) (md string, withMath bool, title, finalURL string, err error) {
	md, withMath, title, err = clipURLToMarkdownOnce(rawURL)
	if nil == err {
		return md, withMath, title, rawURL, nil
	}

	if !allowHTTPFallback {
		return "", false, "", "", err
	}

	parsedURL, parseErr := url.Parse(rawURL)
	if nil != parseErr || "https" != parsedURL.Scheme {
		return "", false, "", "", err
	}

	httpURL := *parsedURL
	httpURL.Scheme = "http"
	md, withMath, title, fallbackErr := clipURLToMarkdownOnce(httpURL.String())
	if nil == fallbackErr {
		return md, withMath, title, httpURL.String(), nil
	}

	return "", false, "", "", fmt.Errorf("failed to fetch the webpage over HTTPS or HTTP")
}

func clipURLToMarkdownOnce(rawURL string) (md string, withMath bool, title string, err error) {
	resp, err := httpclient.NewCloudRequest30s().Get(rawURL)
	if nil != err {
		return "", false, "", fmt.Errorf("failed to fetch the webpage: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", false, "", fmt.Errorf("failed to fetch the webpage (%s)", resp.Status)
	}

	bodyData, err := io.ReadAll(resp.Body)
	if nil != err {
		return "", false, "", fmt.Errorf("failed to read the webpage: %w", err)
	}
	htmlStr := string(bodyData)

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(htmlStr))
	if nil != err {
		return "", false, "", fmt.Errorf("failed to parse the webpage: %w", err)
	}

	title = strings.TrimSpace(doc.Find("title").First().Text())
	doc.Find("script, style, noscript, template").Remove()

	baseURL, parseErr := url.Parse(rawURL)
	if nil == parseErr {
		absolutizeClippedDoc(doc, baseURL)
	}

	content := doc.Find("article").First()
	if 0 == content.Length() {
		content = doc.Find("main").First()
	}
	if 0 == content.Length() {
		content = doc.Find("body").First()
		if 0 < content.Length() {
			content.Find("header, footer, nav, aside").Remove()
		}
	}
	if 0 == content.Length() {
		content = doc.Selection
	}

	contentHTML, err := content.Html()
	if nil != err {
		return "", false, "", fmt.Errorf("failed to extract page content: %w", err)
	}

	luteEngine := util.NewLute()
	luteEngine.SetHTMLTag2TextMark(true)
	tree, withMath := model.HTML2Tree(contentHTML, luteEngine)
	parse.TextMarks2Inlines(tree)
	parse.NestedInlines2FlattedSpansHybrid(tree, false)
	md, _ = lute.FormatNodeSync(tree.Root, luteEngine.ParseOptions, luteEngine.RenderOptions)
	md = normalizeCollectedMarkdownBody(title, md)
	if "" == strings.TrimSpace(md) {
		return "", false, title, fmt.Errorf("no readable content found on the webpage")
	}
	return md, withMath, title, nil
}

func absolutizeClippedDoc(doc *goquery.Document, baseURL *url.URL) {
	doc.Find("[src], [href], [poster]").Each(func(i int, s *goquery.Selection) {
		for _, attr := range []string{"src", "href", "poster"} {
			if val, ok := s.Attr(attr); ok && "" != val {
				if absolute, absOK := absolutizeClipURL(baseURL, val); absOK {
					s.SetAttr(attr, absolute)
				}
			}
		}

		if srcset, ok := s.Attr("srcset"); ok && "" != srcset {
			items := strings.Split(srcset, ",")
			for i, item := range items {
				item = strings.TrimSpace(item)
				if "" == item {
					continue
				}
				parts := strings.Fields(item)
				if 0 == len(parts) {
					continue
				}
				if absolute, absOK := absolutizeClipURL(baseURL, parts[0]); absOK {
					parts[0] = absolute
					items[i] = strings.Join(parts, " ")
				}
			}
			s.SetAttr("srcset", strings.Join(items, ", "))
		}
	})
}

func absolutizeClipURL(baseURL *url.URL, raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if "" == raw || strings.HasPrefix(raw, "data:") || strings.HasPrefix(raw, "javascript:") || strings.HasPrefix(raw, "blob:") {
		return "", false
	}
	parsed, err := url.Parse(raw)
	if nil != err {
		return "", false
	}
	return baseURL.ResolveReference(parsed).String(), true
}

func buildClippedMarkdown(title, sourceURL, markdown string) string {
	markdown = normalizeCollectedMarkdownBody(title, markdown)
	var b strings.Builder
	if "" != title {
		b.WriteString("# ")
		b.WriteString(title)
		b.WriteString("\n\n")
	}
	b.WriteString("> 来源：")
	b.WriteString(sourceURL)
	b.WriteString("\n\n")
	b.WriteString(strings.TrimSpace(markdown))
	return b.String()
}

func normalizeCollectedMarkdownBody(title, markdown string) string {
	replacer := strings.NewReplacer(
		"\r\n", "\n",
		"\r", "\n",
		"\u00a0", " ",
		"\u200b", "",
		"\u200c", "",
		"\u200d", "",
		"\ufeff", "",
	)
	markdown = strings.TrimSpace(replacer.Replace(markdown))
	if "" == markdown {
		return ""
	}

	luteEngine := util.NewLute()
	tree := parse.Parse("", []byte(markdown), luteEngine.ParseOptions)
	if nil == tree || nil == tree.Root {
		return markdown
	}

	removeDuplicateLeadingHeading(tree.Root, title)
	if hasHeadingLevel(tree.Root, 1) {
		demoteMarkdownHeadings(tree.Root)
	}
	parse.TextMarks2Inlines(tree)
	parse.NestedInlines2FlattedSpansHybrid(tree, false)

	markdown, _ = lute.FormatNodeSync(tree.Root, luteEngine.ParseOptions, luteEngine.RenderOptions)
	markdown = collectedMarkdownDocIALPattern.ReplaceAllString(markdown, "")
	return strings.TrimSpace(markdown)
}

func removeDuplicateLeadingHeading(root *ast.Node, title string) {
	normalizedTitle := normalizeCollectedMarkdownComparableText(title)
	if "" == normalizedTitle {
		return
	}

	for node := root.FirstChild; nil != node; node = node.Next {
		if ast.NodeKramdownBlockIAL == node.Type {
			continue
		}
		if ast.NodeHeading != node.Type {
			return
		}
		if normalizedTitle != normalizeCollectedMarkdownComparableText(node.Text()) {
			return
		}

		next := node.Next
		node.Unlink()
		if nil != next && ast.NodeKramdownBlockIAL == next.Type {
			next.Unlink()
		}
		return
	}
}

func hasHeadingLevel(root *ast.Node, level int) bool {
	found := false
	ast.Walk(root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if entering && ast.NodeHeading == n.Type && level == int(n.HeadingLevel) {
			found = true
			return ast.WalkStop
		}
		return ast.WalkContinue
	})
	return found
}

func demoteMarkdownHeadings(root *ast.Node) {
	ast.Walk(root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if entering && ast.NodeHeading == n.Type && 6 > n.HeadingLevel {
			n.HeadingLevel++
		}
		return ast.WalkContinue
	})
}

func normalizeCollectedMarkdownComparableText(value string) string {
	replacer := strings.NewReplacer(
		"\u00a0", " ",
		"\u200b", "",
		"\u200c", "",
		"\u200d", "",
		"\ufeff", "",
		"\r", " ",
		"\n", " ",
	)
	value = strings.ToLower(replacer.Replace(value))
	value = strings.TrimSpace(value)
	value = strings.TrimLeft(value, "#")
	value = strings.Join(strings.Fields(value), " ")
	return strings.Trim(value, " -_|:：·•—")
}

func normalizeClipDocPath(hPath string) string {
	baseName := path.Base(hPath)
	dir := path.Dir(hPath)
	r, _ := regexp.Compile("\r\n|\r|\n|\u2028|\u2029|\t|/")
	baseName = r.ReplaceAllString(baseName, "")
	if 512 < utf8.RuneCountInString(baseName) {
		baseName = gulu.Str.SubStr(baseName, 512)
	}
	hPath = path.Join(dir, baseName)
	if !strings.HasPrefix(hPath, "/") {
		hPath = "/" + hPath
	}
	return hPath
}

func normalizeClipTitle(title string) string {
	title = strings.TrimSpace(title)
	title = strings.ReplaceAll(title, "\r", " ")
	title = strings.ReplaceAll(title, "\n", " ")
	title = strings.ReplaceAll(title, "\t", " ")
	title = strings.ReplaceAll(title, "/", " ")
	title = strings.Join(strings.Fields(title), " ")
	if 512 < utf8.RuneCountInString(title) {
		title = gulu.Str.SubStr(title, 512)
	}
	return title
}
