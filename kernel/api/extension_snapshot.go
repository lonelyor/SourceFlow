package api

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/gabriel-vasile/mimetype"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
	"github.com/lonelyor/sourceflow/third_party/go/httpclient"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
	"github.com/lonelyor/sourceflow/third_party/go/lute"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
	"github.com/lonelyor/sourceflow/third_party/go/lute/parse"
)

type snapshotMarkdownResult struct {
	Markdown string
	WithMath bool
}

func convertSnapshotFormToMarkdown(form *multipart.Form) (*snapshotMarkdownResult, error) {
	dom := firstFormValue(form, "dom")
	if "" == dom {
		return nil, fmt.Errorf(collectPageEmptyMsg)
	}

	assets := filepath.Join(util.DataDir, "assets")
	if notebook := firstFormValue(form, "notebook"); "" != notebook {
		assets = filepath.Join(util.DataDir, notebook, "assets")
		if !gulu.File.IsDir(assets) {
			assets = filepath.Join(util.DataDir, "assets")
		}
	}
	if err := os.MkdirAll(assets, 0755); nil != err {
		logging.LogErrorf("create assets folder [%s] failed: %s", assets, err)
		return nil, err
	}

	clippingSym := false
	symArticleHref := ""
	hasHref := "" != firstFormValue(form, "href")
	isPartClip := "part" == firstFormValue(form, "clipType")
	if hasHref && !isPartClip {
		symArticleHref = firstFormValue(form, "href")

		var baseURL, originalPrefix string
		if strings.HasPrefix(symArticleHref, util.LegacyCommunityArticlePrefix()) {
			baseURL = util.LegacyCommunityArticleRawPrefix()
			originalPrefix = util.LegacyCommunityArticlePrefix()
		} else if strings.HasPrefix(symArticleHref, util.LegacyCloudArticlePrefix()) {
			baseURL = util.LegacyCloudArticleRawPrefix()
			originalPrefix = util.LegacyCloudArticlePrefix()
		}

		if "" != baseURL {
			articleID := strings.TrimPrefix(symArticleHref, originalPrefix)
			if idx := strings.IndexAny(articleID, "/?#"); -1 != idx {
				articleID = articleID[:idx]
			}

			symArticleHref = baseURL + articleID
			clippingSym = true
		}
	}

	uploaded := map[string]string{}
	for originalName, file := range form.File {
		oName, err := url.PathUnescape(originalName)
		unescaped := oName

		if clippingSym && strings.Contains(oName, "img-loading.svg") {
			continue
		}

		if nil != err {
			if strings.Contains(originalName, "%u") {
				originalName = strings.ReplaceAll(originalName, "%u", "\\u")
				originalName, err = strconv.Unquote("\"" + originalName + "\"")
				if nil != err {
					continue
				}
				oName, err = url.PathUnescape(originalName)
				if nil != err {
					continue
				}
			} else {
				continue
			}
		}
		if strings.Contains(oName, "%") {
			unescaped, _ = url.PathUnescape(oName)
			if "" != unescaped {
				oName = unescaped
			}
		}

		u, _ := url.Parse(oName)
		if nil == u || "" == u.Path {
			continue
		}
		fileName := path.Base(u.Path)

		f, err := file[0].Open()
		if nil != err {
			return nil, err
		}
		data, err := io.ReadAll(f)
		f.Close()
		if nil != err {
			return nil, err
		}

		fileName = util.FilterUploadFileName(fileName)
		ext := util.Ext(fileName)
		if !util.IsCommonExt(ext) || strings.Contains(ext, "!") {
			if mtype := mimetype.Detect(data); nil != mtype {
				ext = mtype.Extension()
				fileName += ext
			}
		}
		if "" == ext && bytes.HasPrefix(data, []byte("<svg ")) && bytes.HasSuffix(data, []byte("</svg>")) {
			fileName += ".svg"
		}

		fileName = util.AssetName(fileName, ast.NewNodeID())
		writePath := filepath.Join(assets, fileName)
		if err = filelock.WriteFile(writePath, data); nil != err {
			return nil, err
		}
		uploaded[unescaped] = "assets/" + fileName
	}

	luteEngine := util.NewLute()
	luteEngine.SetHTMLTag2TextMark(true)
	md := ""
	withMath := false

	if clippingSym {
		resp, err := httpclient.NewCloudRequest30s().Get(symArticleHref)
		if nil != err {
			logging.LogWarnf("get [%s] failed: %s", symArticleHref, err)
		} else {
			defer resp.Body.Close()
			bodyData, readErr := io.ReadAll(resp.Body)
			if nil != readErr {
				return nil, fmt.Errorf("read response body failed: %s", readErr)
			}

			md = string(bodyData)
			luteEngine.SetIndentCodeBlock(true)
			tree := parse.Parse("", []byte(md), luteEngine.ParseOptions)
			ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
				if ast.NodeInlineMath == n.Type {
					withMath = true
					return ast.WalkStop
				}
				if ast.NodeCodeBlock == n.Type && !n.IsFencedCodeBlock {
					n.IsFencedCodeBlock = true
					n.CodeBlockFenceChar = '`'
					n.PrependChild(&ast.Node{Type: ast.NodeCodeBlockFenceInfoMarker})
					n.PrependChild(&ast.Node{Type: ast.NodeCodeBlockFenceOpenMarker, Tokens: []byte("```"), CodeBlockFenceLen: 3})
					n.LastChild.InsertAfter(&ast.Node{Type: ast.NodeCodeBlockFenceCloseMarker, Tokens: []byte("```"), CodeBlockFenceLen: 3})
					if code := n.ChildByType(ast.NodeCodeBlockCode); nil != code {
						code.Tokens = bytes.TrimPrefix(code.Tokens, []byte("    "))
						code.Tokens = bytes.ReplaceAll(code.Tokens, []byte("\n    "), []byte("\n"))
						code.Tokens = bytes.TrimPrefix(code.Tokens, []byte("\t"))
						code.Tokens = bytes.ReplaceAll(code.Tokens, []byte("\n\t"), []byte("\n"))
					}
				}
				return ast.WalkContinue
			})
			md, _ = lute.FormatNodeSync(tree.Root, luteEngine.ParseOptions, luteEngine.RenderOptions)
		}
	}

	var tree *parse.Tree
	if "" == md {
		regx, _ := regexp.Compile(`(?i)<iframe[^>]*>([\s\S]*?)<\/iframe>`)
		dom = regx.ReplaceAllStringFunc(dom, func(s string) string {
			s = strings.ReplaceAll(s, "\n", "")
			s = strings.ReplaceAll(s, "\r", "")
			return s
		})
		tree, withMath = model.HTML2Tree(dom, luteEngine)
	} else {
		tree = parse.Parse("", []byte(md), luteEngine.ParseOptions)
	}

	ast.Walk(tree.Root, func(n *ast.Node, entering bool) ast.WalkStatus {
		if !entering {
			return ast.WalkContinue
		}

		if ast.NodeText == n.Type {
			if ast.NodeParagraph == n.Parent.Type && n.Parent.FirstChild == n {
				n.Tokens = bytes.TrimLeft(n.Tokens, " \t\n")
			}
			return ast.WalkContinue
		}

		if ast.NodeImage != n.Type {
			return ast.WalkContinue
		}

		dest := n.ChildByType(ast.NodeLinkDest)
		if nil == dest {
			return ast.WalkContinue
		}
		assetPath := uploaded[string(dest.Tokens)]
		if "" == assetPath {
			assetPath = uploaded[string(dest.Tokens)+"?imageView2/2/interlace/1/format/webp"]
		}
		if "" != assetPath {
			dest.Tokens = []byte(assetPath)
		}

		if linkText := n.ChildByType(ast.NodeLinkText); nil != linkText {
			if inlineTree := parse.Inline("", linkText.Tokens, luteEngine.ParseOptions); nil != inlineTree && nil != inlineTree.Root && nil != inlineTree.Root.FirstChild {
				if fc := inlineTree.Root.FirstChild.FirstChild; nil != fc && ast.NodeText != fc.Type {
					linkText.Tokens = []byte(fc.Text())
				}
			}
		}
		if title := n.ChildByType(ast.NodeLinkTitle); nil != title {
			if inlineTree := parse.Inline("", title.Tokens, luteEngine.ParseOptions); nil != inlineTree && nil != inlineTree.Root && nil != inlineTree.Root.FirstChild {
				if fc := inlineTree.Root.FirstChild.FirstChild; nil != fc && ast.NodeText != fc.Type {
					title.Tokens = []byte(fc.Text())
				}
			}
		}
		return ast.WalkContinue
	})

	parse.TextMarks2Inlines(tree)
	parse.NestedInlines2FlattedSpansHybrid(tree, false)

	md, _ = lute.FormatNodeSync(tree.Root, luteEngine.ParseOptions, luteEngine.RenderOptions)
	md = normalizeCollectedMarkdownBody(firstFormValue(form, "title"), md)
	return &snapshotMarkdownResult{Markdown: md, WithMath: withMath}, nil
}

func firstFormValue(form *multipart.Form, key string) string {
	if nil == form || nil == form.Value {
		return ""
	}
	values := form.Value[key]
	if 1 > len(values) {
		return ""
	}
	return strings.TrimSpace(values[0])
}
