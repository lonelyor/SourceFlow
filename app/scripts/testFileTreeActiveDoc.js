const assert = require("assert");
const fs = require("fs");
const path = require("path");

const srcRoot = path.join(__dirname, "..", "src");
const editorUtilSource = fs.readFileSync(path.join(srcRoot, "editor", "util.ts"), "utf8");
const filesSource = fs.readFileSync(path.join(srcRoot, "layout", "dock", "Files.ts"), "utf8");
const mainScssSource = fs.readFileSync(path.join(srcRoot, "assets", "scss", "main", "_main.scss"), "utf8");
const appearanceSource = fs.readFileSync(path.join(srcRoot, "appearance", "fileTreeAppearance.ts"), "utf8");

let testsPassed = 0;
let testsFailed = 0;

const test = (name, fn) => {
    try {
        fn();
        testsPassed++;
    } catch (e) {
        testsFailed++;
        console.error(`FAIL: ${name}`);
        console.error(`  ${e.message}`);
    }
};

const getFunctionBlock = (source, fnName) => {
    const patterns = [
        new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${fnName}\\s*=\\s*\\([^)]*\\)\\s*=>\\s*\\{`),
        new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${fnName}\\s*\\([^)]*\\)\\s*\\{`),
        new RegExp(`(?:public|private|protected)\\s+(?:async\\s+)?${fnName}\\s*\\([^)]*\\)\\s*\\{`),
        new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${fnName}\\s*=\\s*\\(\\s*\\{[^}]*\\}\\s*:\\s*\\{[^}]*\\}\\s*\\)\\s*=>\\s*\\{`),
    ];
    for (const re of patterns) {
        const match = source.match(re);
        if (match) {
            const start = source.indexOf(match[0]) + match[0].length - 1;
            let depth = 0;
            for (let i = start; i < source.length; i++) {
                if (source[i] === "{") depth++;
                if (source[i] === "}") depth--;
                if (depth === 0) return source.slice(start, i + 1);
            }
        }
    }
    return null;
};

const getBlockByLastPattern = (source, fnName) => {
    const re = new RegExp(`(?:export\\s+)?const\\s+${fnName}\\s*=\\s*\\(\\s*[^)]*\\s*\\)\\s*=>\\s*\\{`);
    let lastMatch = null;
    let lastIdx = 0;
    while (true) {
        const m = source.substring(lastIdx).match(re);
        if (!m) break;
        const offset = source.indexOf(m[0], lastIdx);
        lastMatch = {index: offset, match: m[0]};
        lastIdx = offset + 1;
    }
    if (!lastMatch) return null;
    const start = lastMatch.index + lastMatch.match.length - 1;
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}") depth--;
        if (depth === 0) return source.slice(start, i + 1);
    }
    return null;
};

test("updatePanelByEditor: does not gate tracking behind alwaysSelectOpenedFile", () => {
    const block = getBlockByLastPattern(editorUtilSource, "updatePanelByEditor");
    assert(block, "updatePanelByEditor not found");
    assert(!block.includes("alwaysSelectOpenedFile &&"),
        "alwaysSelectOpenedFile should no longer be a gate condition in updatePanelByEditor");
});

test("updatePanelByEditor: calls selectItem for auto-tracking", () => {
    const block = getBlockByLastPattern(editorUtilSource, "updatePanelByEditor");
    assert(block, "updatePanelByEditor not found");
    assert(block.includes("fileModel.selectItem("),
        "updatePanelByEditor should call fileModel.selectItem for active doc tracking");
});

test("updatePanelByEditor: applies file-tree__item--current highlight class", () => {
    const block = getBlockByLastPattern(editorUtilSource, "updatePanelByEditor");
    assert(block, "updatePanelByEditor not found");
    assert(block.includes("file-tree__item--current"),
        "updatePanelByEditor should reference file-tree__item--current class");
});

test("updatePanelByEditor: clears previous highlight before setting new one", () => {
    const block = getBlockByLastPattern(editorUtilSource, "updatePanelByEditor");
    assert(block, "updatePanelByEditor not found");
    assert(block.includes('classList.remove("file-tree__item--current")'),
        "updatePanelByEditor should remove previous file-tree__item--current before adding new");
});

test("Files.ts: setCurrent adds file-tree__item--current class", () => {
    const block = getFunctionBlock(filesSource, "setCurrent");
    assert(block, "setCurrent not found");
    assert(block.includes('classList.add("file-tree__item--current")'),
        "Files.setCurrent should add file-tree__item--current class");
});

test("Files.ts: setCurrent clears previous file-tree__item--current", () => {
    const block = getFunctionBlock(filesSource, "setCurrent");
    assert(block, "setCurrent not found");
    assert(block.includes('querySelectorAll("li.file-tree__item--current")') &&
           block.includes('classList.remove("file-tree__item--current")'),
        "Files.setCurrent should clear previous file-tree__item--current items");
});

test("Files.ts: setCurrent scrolls to target element", () => {
    const block = getFunctionBlock(filesSource, "setCurrent");
    assert(block, "setCurrent not found");
    assert(block.includes("isScroll") && block.includes("scrollTop"),
        "Files.setCurrent should scroll the tree to show the target");
});

test("SCSS: file-tree__item--current has visual highlight styles", () => {
    assert(mainScssSource.includes("file-tree__item--current"),
        "SCSS should define styles for file-tree__item--current");
});

test("SCSS: highlight uses CSS custom properties for color theming", () => {
    const re = /&\[data-type[^\]]*\]\.file-tree__item--current\s*,\s*&\[data-type[^\]]*\]\.file-tree__item--current\s*\{([^}]*)\}/;
    const match = mainScssSource.match(re);
    assert(match, "SCSS file-tree__item--current rule not found");
    assert(match[1].includes("--sf-file-tree-active"),
        "file-tree__item--current should use --sf-file-tree-active CSS custom properties");
});

test("fileTreeAppearance: applyFileTreeHighlightColor sets custom properties", () => {
    assert(appearanceSource.includes("--sf-file-tree-active-bg"),
        "applyFileTreeHighlightColor should set --sf-file-tree-active-bg");
    assert(appearanceSource.includes("--sf-file-tree-active-border"),
        "applyFileTreeHighlightColor should set --sf-file-tree-active-border");
});

test("fileTreeAppearance: applyFileTreeHighlightColor clears style when empty", () => {
    const block = getFunctionBlock(appearanceSource, "applyFileTreeHighlightColor");
    assert(block, "applyFileTreeHighlightColor not found");
    assert(block.includes("styleEl.remove") || block.includes(".remove("),
        "applyFileTreeHighlightColor should remove the style element when color is empty");
});

test("No stale highlightActiveDocInFileTree standalone function", () => {
    const match = editorUtilSource.match(/^(export\s+)?const\s+highlightActiveDocInFileTree\s*=/m);
    assert(!match,
        "highlightActiveDocInFileTree should not exist as standalone function (logic moved inline)");
});

if (testsFailed > 0) {
    console.error(`\n${testsFailed} test(s) FAILED, ${testsPassed} passed`);
    process.exit(1);
}

console.log(`\n${testsPassed} tests passed`);
