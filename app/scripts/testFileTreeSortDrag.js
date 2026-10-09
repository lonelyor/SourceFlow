const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (...parts) => fs.readFileSync(path.join(__dirname, "..", "src", ...parts), "utf8");

const test = (name, fn) => {
    try {
        fn();
        console.log(`[file-tree-sort-drag] ok - ${name}`);
    } catch (error) {
        console.error(`[file-tree-sort-drag] failed - ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

const filesSource = read("layout", "dock", "Files.ts");
const dragSource = read("layout", "dock", "fileTreeDrag.ts");
const navigationSource = read("menus", "navigation.ts");

test("custom sort mode routes plain drag into the sort branch", () => {
    assert(dragSource.includes("export const isFileTreeCustomSortActive"), "custom sort predicate must be shared");
    assert(dragSource.includes('notebookSort === "6"'), "sortmode 6 is custom sorting");
    assert(dragSource.includes('notebookSort === "15"'), "sortmode 15 follows the global file tree preference");
    assert(filesSource.includes("isFileTreeCustomSortActive(sortNotebookElement) && !event.altKey"),
        "plain drag in custom sort mode must enter the sort branch (Alt keeps move semantics)");
    assert(filesSource.includes("resolveFileTreeSortPosition(event, liElement)"), "drop half must resolve before/after");
});

test("same-parent check gates the sort drop", () => {
    assert(dragSource.includes("export const isFileTreeSameSiblingList"), "sibling check must live in the drag helper");
    assert(dragSource.includes("sourceItem.parentElement === targetItem.parentElement"), "same parent list is required");
    assert(dragSource.includes('targetItem.hasAttribute("data-path")'), "target must carry a data-path");
    assert(filesSource.includes("!isFileTreeSameSiblingList(sourceItem, liElement)"), "dragover must block cross-parent plain drag");
    assert(filesSource.includes("isFileTreeSameSiblingList(sourceItem, newElement)"), "drop must re-verify the sibling relation");
});

test("cross-parent plain drag is blocked with a one-line Alt hint", () => {
    assert(filesSource.includes('event.dataTransfer.dropEffect = "none";'), "blocked targets must refuse the drop");
    assert(filesSource.includes("showTooltip(getFileTreeSortBlockedHint(), liElement)"), "hint must be an inline tooltip, not a toast or dialog");
    assert(dragSource.includes("fileTreeSortMoveNeedsAlt"), "blocked hint must come from the languages map");
    assert(dragSource.includes('"Hold Alt to move"'), "blocked hint must have an English fallback");
    assert(filesSource.includes("hideTooltip();"), "tooltip must be cleared on dragleave/drop");
});

test("sort drop reuses dragover top/bottom with a sort modifier class", () => {
    assert(dragSource.includes('"dragover__sort"'), "sort state must be marked by a modifier class");
    assert(filesSource.includes('liElement.classList.add("dragover__sort")'), "dragover must apply the sort modifier");
    assert(filesSource.includes('newElement.classList.contains("dragover__sort")'), "drop must detect the sort landing");
    assert(filesSource.includes('liElement.classList.add(position === "before" ? "dragover__top" : "dragover__bottom")'),
        "sort landing must reuse dragover__top/__bottom visuals");
    assert(dragSource.includes("fileTreeSortBefore") && dragSource.includes("fileTreeSortAfter"),
        "before/after labels must come from the languages map");
    assert(filesSource.includes("setFileTreeDropLabel(liElement, getFileTreeSortDropLabel(position))"),
        "sort landing must carry a drop label");
});

test("changeSort wrapper completes before/after in one call", () => {
    assert(navigationSource.includes("export const changeFileTreeSortByDrop"), "wrapper must be exported for Files.ts");
    assert(navigationSource.includes('fetchPost("/api/filetree/changeSort", {'), "wrapper must call changeSort");
    assert(navigationSource.includes("paths.splice(fromIndex, 1)"), "source must leave its old slot first");
    assert(navigationSource.includes("paths.splice(toIndex, 0, sourcePath)"), "then be inserted before/after the target");
    assert(navigationSource.includes("if (toIndex === fromIndex) {"), "unchanged order must skip the API call");
    assert(navigationSource.includes("position === \"after\"") , "after landing shifts one slot down");
    const wrapperStart = navigationSource.indexOf("export const changeFileTreeSortByDrop");
    const wrapperEnd = navigationSource.indexOf("const initMultiMenu", wrapperStart);
    const wrapperBody = navigationSource.slice(wrapperStart, wrapperEnd);
    assert(!wrapperBody.includes("moveDocs"), "sort wrapper must not fall back to moving docs");
    assert((wrapperBody.match(/fetchPost\("\/api\/filetree\/changeSort"/g) || []).length === 1, "exactly one changeSort call site");
    assert(wrapperBody.includes("targetItem.before(sourceItem)"), "callback must move the DOM node optimistically");
    assert(wrapperBody.includes("sourceItem.after(nextULElement)"), "nested child list must stay attached to its li");
});

test("drop dispatches sort and move exclusively", () => {
    const dropStart = filesSource.indexOf('this.element.addEventListener("drop"');
    const dropBody = filesSource.slice(dropStart, filesSource.indexOf("this.init();", dropStart));
    assert(dropBody.indexOf('newElement.classList.contains("dragover__sort")') < dropBody.indexOf('const fromPaths: string[] = []'),
        "sort branch must intercept before the move logic");
    assert(dropBody.includes("changeFileTreeSortByDrop(sourceItem, newElement, position, toURL)"), "sort drop must call the wrapper");
    assert(dropBody.includes('fetchPost("/api/filetree/moveDocs"'), "move drop must keep moveDocs");
    assert(dropBody.includes('clearFileTreeDropClasses(this.element);\n                return;\n            }\n            const fromPaths'),
        "sort branch must return without running the move path");
});

test("non-custom modes keep the existing move behavior", () => {
    assert(filesSource.includes("resolveFileTreeMoveDropElement(this.element, event)"), "move landing resolution unchanged");
    assert(filesSource.includes("setFileTreeDropLabel(liElement, getFileTreeMoveDropLabel(liElement))"), "move drop label unchanged");
    assert(filesSource.includes("queueDragExpand(liElement)"), "drag-to-expand on folders unchanged");
    assert(!filesSource.includes('notebookSort === "6"'), "inline sortmode predicate must be replaced by the shared helper");
    assert(filesSource.includes('data-sortmode="${item.sortMode}"'), "notebook sortmode attribute generation unchanged");
    assert(filesSource.includes("!event.altKey"), "Alt keeps the full move semantics in every mode");
});
