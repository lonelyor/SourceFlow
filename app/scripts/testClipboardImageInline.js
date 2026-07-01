const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

const packageJSON = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
const image = readSrc("util", "image.ts");
const menusUtil = readSrc("menus", "util.ts");
const selectionScope = readSrc("protyle", "util", "selectionScope.ts");
const copy = readSrc("protyle", "wysiwyg", "commonEvents", "copy.ts");
const cut = readSrc("protyle", "wysiwyg", "editorEvents", "cut.ts");

assert.strictEqual(
    packageJSON.scripts["test:clipboard-image-inline"],
    "node ./scripts/testClipboardImageInline.js",
    "package.json must expose the clipboard image inline regression"
);

// --- util/image.ts：可复用的 canvas 编码核心 ---

[
    "export const loadImageToCanvas",
    "export const imageLinkToDataURL",
].forEach((exportName) => {
    assert(image.includes(exportName), `image.ts must export ${exportName}`);
});

// imageLinkToDataURL 必须基于 loadImageToCanvas（复用而非重复实现）
assert(
    image.includes("const canvas = await loadImageToCanvas(link);") &&
    image.includes('canvas.toDataURL("image/png")'),
    "imageLinkToDataURL must reuse loadImageToCanvas and encode via toDataURL"
);

// loadImageToCanvas 必须有 onerror 分支（防止加载失败时 Promise 悬挂）
assert(
    image.includes("tempElement.onerror") && image.includes("reject("),
    "loadImageToCanvas must reject on load error"
);

// --- menus/util.ts：copyPNGByLink 必须复用 loadImageToCanvas ---

assert(
    menusUtil.includes("import {loadImageToCanvas} from \"../util/image\";") &&
    menusUtil.includes("loadImageToCanvas(link).then(canvas =>"),
    "copyPNGByLink must reuse loadImageToCanvas instead of duplicating canvas logic"
);
// 回归保护：旧的内联 canvas+onload 实现不应在 copyPNGByLink 中复活
assert(
    !/copyPNGByLink[\s\S]*?createElement\("canvas"\)[\s\S]*?tempElement\.onload/.test(menusUtil),
    "copyPNGByLink must not re-duplicate the canvas onload drawImage implementation"
);

// --- selectionScope.ts：本地图片内联检测与转换 ---

[
    "export const hasLocalClipboardImages",
    "export const inlineLocalImages",
].forEach((exportName) => {
    assert(selectionScope.includes(exportName), `selectionScope.ts must export ${exportName}`);
});

// isInlineableImageSrc 必须排除 data:/blob:/协议 URL/协议相对 URL（仅内联本地相对路径）
const isInlineableSrc = selectionScope.match(/const isInlineableImageSrc[\s\S]*?\};/);
assert(isInlineableSrc, "selectionScope.ts must define isInlineableImageSrc");
const srcFilter = isInlineableSrc[0];
[
    "data:",
    "blob:",
    "\\/\\/",   // // protocol-relative
].forEach((token) => {
    assert(srcFilter.includes(token), `isInlineableImageSrc must exclude ${token}`);
});

// inlineLocalImages 必须同时替换 src 与 data-src
assert(
    selectionScope.includes('img.setAttribute("src", dataURL)') &&
    selectionScope.includes('img.setAttribute("data-src", dataURL)'),
    "inlineLocalImages must replace both src and data-src with the inlined data URL"
);

// inlineLocalImages 必须有容错（加载失败/跨域污染时保留原 src）
assert(
    selectionScope.includes("} catch (e) {"),
    "inlineLocalImages must tolerate image load failures"
);

// --- copy.ts / cut.ts：写入分支必须接入内联路径 ---

[copy, cut].forEach((source, index) => {
    const name = index === 0 ? "copy" : "cut";
    assert(
        source.includes("hasLocalClipboardImages") &&
        source.includes("inlineLocalImages"),
        `${name} must import and use the image inline helpers`
    );
    // 检测到本地图片时必须触发 navigator.clipboard.write（因为 setData 在 await 后失效）
    assert(
        source.includes("const needInlineImages = hasLocalClipboardImages(textHTML);") &&
        source.includes("needClipboardWrite || needInlineImages"),
        `${name} must trigger clipboard.write when local images are present`
    );
    // 写入的 text/html 必须是内联后的 finalHTML
    assert(
        source.includes('const finalHTML = needInlineImages ? await inlineLocalImages(textHTML) : textHTML;') &&
        source.includes('"text/html"]: finalHTML'),
        `${name} must write the inlined finalHTML to the clipboard`
    );
});

// --- 内部粘贴不变性：sourceflow 注释必须保留 ---

// 注释（含相对路径 sourceflow）必须在内联前就已 append 到 textHTML
[copy, cut].forEach((source, index) => {
    const name = index === 0 ? "copy" : "cut";
    const commentIdx = source.indexOf("appendSourceFlowClipboardHTMLComment");
    const detectIdx = source.indexOf("hasLocalClipboardImages(textHTML)");
    assert(commentIdx > -1, `${name} must still append the SourceFlow clipboard comment`);
    assert(
        commentIdx < detectIdx,
        `${name} must append the SourceFlow comment before image inlining, so internal paste can reconstruct relative paths`
    );
});

// inlineLocalImages 仅操作 <img> 元素，不触碰 HTML 注释（注释携带内部 sourceflow 数据）
assert(
    selectionScope.includes('template.content.querySelectorAll("img")'),
    "inlineLocalImages must operate only on <img> elements, preserving SourceFlow comment data"
);

// 回归保护：text/plain 必须始终被写入（文字复制照旧，不丢文字）
[copy, cut].forEach((source, index) => {
    const name = index === 0 ? "copy" : "cut";
    assert(
        source.includes('["text/plain"]: textPlain'),
        `${name} must always write text/plain alongside text/html in the multi-format clipboard`
    );
});

console.log("Clipboard image inline regression checks passed");
