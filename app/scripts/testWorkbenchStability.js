const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");

const read = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), "utf8");

const activityBar = read("src", "layout", "activityBar.ts");
const dialogController = read("src", "workbench", "dialogController.ts");
const dialogQuery = read("src", "workbench", "dialogQuery.ts");
const dialogScreen = read("src", "workbench", "dialogScreen.ts");
const fetchUtil = read("src", "util", "fetch.ts");
const zhCN = JSON.parse(read("appearance", "langs", "zh_CN.json"));
const enUS = JSON.parse(read("appearance", "langs", "en_US.json"));

const walk = (dir, files = []) => {
    for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            walk(fullPath, files);
        } else if (item.name.endsWith(".ts")) {
            files.push(fullPath);
        }
    }
    return files;
};

assert(
    /ACTIVITY_BAR_RAIL_PIN_KEYS[\s\S]*"action:workbench"/.test(activityBar),
    "workbench should be pinned to the side activity rail",
);

assert(
    /action:\s*"workbench"[\s\S]*sortKey:\s*"action:workbench"[\s\S]*defaultGroup:\s*"rail"/.test(activityBar),
    "workbench action should default to the rail instead of More",
);

assert(
    activityBar.includes("`dock:${ASSISTANT_AI_DOCK_TYPE}`"),
    "AI dock should remain pinned to the side activity rail",
);

assert(
    dialogController.includes("renderWorkbenchLoadingHTML") &&
        dialogController.includes("bodyElement.innerHTML = renderWorkbenchLoadingHTML();"),
    "workbench dialog should render a loading state before async queries",
);

assert(
    dialogController.includes("renderWorkbenchErrorHTML") &&
        dialogController.includes('[data-action="retry-workbench"]'),
    "workbench dialog should render a retryable error state",
);

assert(
    dialogController.includes('console.error("[workbench] render failed", error)') &&
        dialogController.includes("showMessage(`${workbenchText(\"工作台加载失败\""),
    "workbench render failures should be logged and surfaced to the user",
);

assert(
    dialogQuery.includes('throw new Error(response.msg || "queryWorkbenchItems failed")'),
    "workbench item query failures should not be treated as an empty result",
);

assert(
    dialogQuery.includes('throw new Error(response.msg || "fullTextSearchBlock failed")'),
    "related block search should preserve the backend error before workbench-level degradation",
);

assert(
    dialogQuery.includes("blockError") &&
        dialogQuery.includes("resolveWorkbenchBlocks(state, blockScopeItems, parsed, blockLimit)") &&
        dialogQuery.includes("catch (error)"),
    "related block search failures should be isolated from the primary workbench results",
);

assert(
    dialogQuery.includes("export const normalizeWorkbenchItems = (items: unknown): IWorkbenchItem[]") &&
        dialogQuery.includes("tags: Array.isArray(workbenchItem.tags)") &&
        dialogQuery.includes("const items = normalizeWorkbenchItems(response.data?.allItems);") &&
        dialogQuery.includes("const visibleItems = normalizeWorkbenchItems(response.data?.items);"),
    "workbench API items should normalize nullable tag arrays before rendering",
);

assert(
    dialogScreen.includes("workbenchRelatedResultsFailed") &&
        dialogScreen.includes("blockErrorHTML"),
    "related block search failures should render a local warning",
);

assert(
    dialogScreen.includes("renderWorkbenchSearchBar") &&
        dialogScreen.includes("renderWorkbenchQuickFilters") &&
        dialogScreen.includes("renderWorkbenchAdvancedFilters") &&
        dialogScreen.includes("renderWorkbenchMoreActions"),
    "workbench should keep the first screen focused with progressive filter/action sections",
);

assert(
    dialogScreen.includes('id="workbenchResultLayer"') &&
        dialogScreen.includes('id="workbenchDashboard"') &&
        dialogScreen.includes('id="workbenchViewTemplate"') &&
        dialogScreen.includes('data-action="download-csv"') &&
        dialogScreen.includes('data-action="assistant-summary"') &&
        dialogScreen.includes('data-action="bind-current-view"') &&
        dialogScreen.includes('data-action="insert-results"'),
    "workbench progressive action sections should preserve existing control targets",
);

assert(
    fetchUtil.includes("returned non-JSON response") &&
        fetchUtil.includes("returned invalid JSON"),
    "sync fetch failures should produce readable errors for workbench diagnostics",
);

const languageRefs = new Set();
const languageRefPattern = /window\.sourceflow\.languages\.([A-Za-z0-9_]+)/g;
for (const file of walk(path.join(appRoot, "src", "workbench"))) {
    const text = fs.readFileSync(file, "utf8");
    let match;
    while ((match = languageRefPattern.exec(text))) {
        languageRefs.add(match[1]);
    }
}

const missingZhCN = [...languageRefs].filter((key) => !(key in zhCN)).sort();
const missingEnUS = [...languageRefs].filter((key) => !(key in enUS)).sort();
assert.deepStrictEqual(missingZhCN, [], "workbench zh_CN language refs should all exist");
assert.deepStrictEqual(missingEnUS, [], "workbench en_US language refs should all exist");

console.log("[workbench-stability] ok");
