const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");

const read = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), "utf8");

const activityBar = read("src", "layout", "activityBar.ts");
const dialogController = read("src", "workbench", "dialogController.ts");
const dialogQuery = read("src", "workbench", "dialogQuery.ts");

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
    "related block search failures should not be treated as an empty result",
);

console.log("[workbench-stability] ok");
