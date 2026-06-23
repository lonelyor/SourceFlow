// Lute - 一款结构化的 Markdown 引擎，支持 Go 和 JavaScript
// Copyright (c) 2019-present, b3log.org
//
// Lute is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//         http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

package test

import (
	"testing"

	"github.com/lonelyor/sourceflow/third_party/go/lute"
)

var emojiTests = []parseTest{

	{"22", ":sourceflow_note:", "<p><img alt=\"sourceflow_note\" class=\"emoji\" src=\"https://cdn.jsdelivr.net/npm/vditor/dist/images/emoji/sourceflow.png\" title=\"sourceflow_note\" /></p>\n"},

	// 链接文本节点内 Emoji 的解析 https://github.com/lonelyor/sourceflow/third_party/go/lute/issues/76
	{"21", "[foo *:star:*](bar)", "<p><a href=\"bar\">foo <em>⭐️</em></a></p>\n"},
	{"20", "[foo :octocat:](bar)", "<p><a href=\"bar\">foo <img alt=\"octocat\" class=\"emoji\" src=\"https://cdn.jsdelivr.net/npm/vditor/dist/images/emoji/octocat.png\" title=\"octocat\" /></a></p>\n"},
	{"19", "[foo :star:](bar)", "<p><a href=\"bar\">foo ⭐️</a></p>\n"},

	{"18", "8️⃣\n", "<p>8️⃣</p>\n"},
	{"17", "6️⃣\n", "<p>6️⃣</p>\n"},
	{"16", "❤️\n", "<p>❤️</p>\n"},
	{"15", "1 :+1::1::+1:1\n", "<p>1 👍:1:👍1</p>\n"},
	{"14", "1 :1: 1\n", "<p>1 :1: 1</p>\n"},
	{"13", ":1:\n", "<p>:1:</p>\n"}, // 冒号解析错误 https://github.com/b3log/lute/issues/12
	{"12", ":smile::smile:\n", "<p>😄😄</p>\n"},
	{"11", "::\n", "<p>::</p>\n"},
	{"10", "smile: :heart :smile:\n", "<p>smile: :heart 😄</p>\n"},
	{"9", ":smile: :heart :smile:\n", "<p>😄 :heart 😄</p>\n"},
	{"8", ":heart\n", "<p>:heart</p>\n"},
	{"7", ":heart 不是表情\n", "<p>:heart 不是表情</p>\n"},
	{"6", ":heart:开头表情\n", "<p>❤️开头表情</p>\n"},
	{"5", "结尾表情:heart:\n", "<p>结尾表情❤️</p>\n"},
	{"4", "没有表情\n", "<p>没有表情</p>\n"},
	{"3", "0 :sourceflow: 1 :heart: 2\n", "<p>0 <img alt=\"sourceflow\" class=\"emoji\" src=\"https://cdn.jsdelivr.net/npm/vditor/dist/images/emoji/sourceflow.png\" title=\"sourceflow\" /> 1 ❤️ 2</p>\n"},
	{"2", ":smile: :heart:\n", "<p>😄 ❤️</p>\n"},
	{"1", ":sourceflow:\n", "<p><img alt=\"sourceflow\" class=\"emoji\" src=\"https://cdn.jsdelivr.net/npm/vditor/dist/images/emoji/sourceflow.png\" title=\"sourceflow\" /></p>\n"},
	{"0", "爱心:heart:一个\n", "<p>爱心❤️一个</p>\n"},
}

func TestEmoji(t *testing.T) {
	luteEngine := lute.New() // 默认已经开启 Emoji 处理

	for _, test := range emojiTests {
		html := luteEngine.MarkdownStr(test.name, test.from)
		if test.to != html {
			t.Fatalf("test case [%s] failed\nexpected\n\t%q\ngot\n\t%q\noriginal markdown text\n\t%q", test.name, test.to, html, test.from)
		}
	}
}

func TestCleanEmoji(t *testing.T) {
	luteEngine := lute.New()

	result := luteEngine.RemoveEmoji("❤️ foo")
	if "foo" != result {
		t.Fatalf("remove emoji failed")
	}

	result = luteEngine.RemoveEmoji("bar ❤️ foo")
	if "bar  foo" != result {
		t.Fatalf("remove emoji failed")
	}

	result = luteEngine.RemoveEmoji("❤️ foo ❤️bar")
	if "foo bar" != result {
		t.Fatalf("remove emoji failed")
	}
}
