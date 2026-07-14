const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");
const kernelRoot = path.join(appRoot, "..", "kernel");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
const readKernel = (...parts) => fs.readFileSync(path.join(kernelRoot, ...parts), "utf8");

const packageJSON = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
const deleteFile = readSrc("editor", "deleteFile.ts");
const navigation = readSrc("menus", "navigation.ts");
const files = readSrc("layout", "dock", "Files.ts");
const apiFiletree = readKernel("api", "filetree.go");
const modelFile = readKernel("model", "file.go");

assert.strictEqual(
    packageJSON.scripts["test:file-tree-batch-delete"],
    "node ./scripts/testFileTreeBatchDelete.js",
    "package.json must expose the file tree batch delete regression"
);

// --- deleteFiles 批量分支：notebook 与 doc 必须分离处理 ---

// 批量分支必须同时收集 notebookIds 与 docs，而非仅按 data-path !== "/" 过滤
assert(
    deleteFile.includes("const notebookIds: string[] = [];"),
    "deleteFiles batch branch must collect notebookIds separately from docs"
);

// doc 删除必须保留 notebook 上下文，避免不同笔记本中的相同 path 被错误合并或解析
assert(
    deleteFile.includes("const docs: Array<{notebook: string, path: string}> = [];") &&
    deleteFile.includes("const docKeys = new Set<string>();") &&
    deleteFile.includes("docs.push({notebook: notebookId, path: dataPath});"),
    "deleteFiles batch branch must collect notebook-aware doc refs"
);

// notebook 项必须通过 navigation-root 标识，并从父 <ul> 的 data-url 取 notebook id
assert(
    deleteFile.includes('item.getAttribute("data-type") === "navigation-root"') &&
    deleteFile.includes('hasTopClosestByTag(item, "UL")') &&
    deleteFile.includes('itemTopULElement.getAttribute("data-url")'),
    "notebook items must be identified by navigation-root and resolved via parent <ul> data-url"
);

// 帮助笔记本必须被排除
assert(
    deleteFile.includes("Object.values(Constants.HELP_PATH).includes(notebookId)"),
    "help notebooks must be excluded from batch notebook deletion"
);

// 确认数量必须为 doc + notebook 之和
assert(
    deleteFile.includes("const totalCount = docs.length + notebookIds.length;") &&
    deleteFile.includes('confirmRemoveAll.replace("${count}", totalCount)'),
    "batch delete confirmation count must combine docs and notebooks"
);

// 空计数仍应提示无法批量删除（保护性早退）
assert(
    deleteFile.includes("if (totalCount === 0)") &&
    deleteFile.includes("notBatchRemove"),
    "batch delete must guard the no-op empty-selection case"
);

// notebook 删除必须调用 removeNotebook（而非被静默丢弃）
assert(
    deleteFile.includes('fetchPost("/api/notebook/removeNotebook"') &&
    deleteFile.includes("notebookIds.forEach(notebookId =>"),
    "batch delete must call /api/notebook/removeNotebook for each notebook id"
);

// doc 删除仅在 docs 非空时调用，避免空数组请求
const removeDocsIdx = deleteFile.indexOf('fetchPost("/api/filetree/removeDocs"');
const removeDocsGuardIdx = deleteFile.indexOf("if (docs.length > 0)");
assert(removeDocsIdx > -1, "batch delete must still call removeDocs for docs");
assert(
    removeDocsGuardIdx > -1 && removeDocsGuardIdx < removeDocsIdx,
    "removeDocs call must be guarded by docs.length > 0"
);

// 新请求体必须传 docs，同时保留 paths 兼容旧消费者
assert(
    deleteFile.includes("docs,") &&
    deleteFile.includes("paths: docs.map(doc => doc.path),"),
    "removeDocs payload must send notebook-aware docs and compatibility paths"
);

// 回归保护：旧的“仅按 data-path 过滤 notebook”逻辑不应复活。
// 批量分支中不应存在将 data-path === "/" 视为唯一 notebook 判据的 push
assert(
    !/dataPath\s*!==\s*"\/"\s*\)\s*\{\s*paths\.push/.test(deleteFile),
    "batch branch must not regress to dropping notebooks solely via data-path === '/' filter"
);

// --- 后端 removeDocs：优先使用 notebook-aware docs，旧 paths 保持兼容 ---

assert(
    apiFiletree.includes('arg["docs"].([]interface{})') &&
    apiFiletree.includes("var docs []model.RemoveDocRef") &&
    apiFiletree.includes("model.RemoveDocsByRefs(docs)") &&
    apiFiletree.includes('arg["paths"].([]interface{})') &&
    apiFiletree.includes("if err := model.RemoveDocs(paths); err != nil"),
    "removeDocs API must prefer docs while preserving paths fallback"
);

assert(
    modelFile.includes("type RemoveDocRef struct") &&
    modelFile.includes("Notebook string") &&
    modelFile.includes("Path     string") &&
    modelFile.includes("func RemoveDocsByRefs(docs []RemoveDocRef)") &&
    modelFile.includes("box := Conf.Box(doc.Notebook)") &&
    modelFile.includes("removeDoc(box, doc.Path, luteEngine)") &&
    modelFile.includes("func removeDocRefsFromPathsWithResolver(") &&
    modelFile.includes("ambiguous doc path") &&
    modelFile.includes("func filterSelfChildDocRefs(docs []RemoveDocRef)"),
    "model batch delete must delete docs with explicit notebook context and reject ambiguous legacy paths"
);

// --- initMultiMenu：纯 notebook 多选不应返回空菜单 ---

// 旧的“无 navigation-file 即返回空菜单”拦截必须已被移除
assert(
    !navigation.includes("if (!fileItemElement)"),
    "initMultiMenu must no longer short-circuit to an empty menu for notebook-only selections"
);

// 删除项必须无条件 append（不再受 blockIDs / navigation-file 约束）
const deleteAppendIdx = navigation.indexOf('id: "delete",');
assert(deleteAppendIdx > -1, "initMultiMenu must append a delete item");

// move 菜单必须在 getTopPaths 非空时才显示（纯 notebook 时不应出现无意义的移动项）
assert(
    navigation.includes("const movePaths = getTopPaths(") &&
    navigation.includes("if (movePaths.length > 0)") &&
    navigation.includes("movePathToMenu(movePaths)"),
    "initMultiMenu must gate the move menu behind a non-empty getTopPaths result"
);

// --- Files.ts：Shift 范围选择必须排除 notebook 根节点 ---

assert(
    files.includes('querySelectorAll(\'li.b3-list-item:not([data-type="navigation-root"])\')'),
    "Shift range selection must exclude notebook root nodes from the document selection range"
);

console.log("File tree batch delete regression checks passed");
