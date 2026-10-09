const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");

const readApp = (...parts) => fs.readFileSync(path.join(appRoot, ...parts), "utf8");

const templateLibrary = readApp("src", "config", "templateLibrary.ts");
const configSearch = readApp("src", "config", "search.ts");
const packageJson = JSON.parse(readApp("package.json"));
const zhCN = JSON.parse(readApp("appearance", "langs", "zh_CN.json"));
const enUS = JSON.parse(readApp("appearance", "langs", "en_US.json"));

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

// openEditor 函数体区域，用于断言保存路径内部的调用顺序
const openEditorBody = templateLibrary.slice(
    templateLibrary.indexOf("const openEditor ="),
    templateLibrary.indexOf("export const templateLibrary =")
);

test("transfer test is registered in package.json and typecheck.js", () => {
    assert.strictEqual(packageJson.scripts["test:template-library-transfer"],
        "node ./scripts/testTemplateLibraryTransfer.js",
        "package.json should register test:template-library-transfer");
    assert(fs.existsSync(__filename), "the registered test script should exist");
    const typecheck = readApp("scripts", "typecheck.js");
    assert(typecheck.includes("testTemplateLibraryTransfer.js"),
        "typecheck.js should run testTemplateLibraryTransfer.js");
});

test("export action is wired on every template card and both grids", () => {
    assert(templateLibrary.includes('data-action="export"'),
        "card actions should contain an export button");
    const customGridHandler = templateLibrary.slice(
        templateLibrary.indexOf("customGrid.addEventListener"),
        templateLibrary.indexOf("builtinGrid.addEventListener"));
    assert(customGridHandler.includes('action === "export"') &&
        customGridHandler.indexOf('action === "export"') < customGridHandler.indexOf('action === "edit"'),
        "custom grid should handle export action");
    const builtinGridHandler = templateLibrary.slice(templateLibrary.indexOf("builtinGrid.addEventListener"));
    assert(builtinGridHandler.includes('action === "export"') &&
        builtinGridHandler.indexOf('action === "export"') < builtinGridHandler.indexOf('action === "edit"'),
        "builtin grid should handle export action");
    assert((templateLibrary.match(/downloadTemplate\(item\)/g) || []).length >= 2,
        "export action should call downloadTemplate from both grid handlers");
});

test("export downloads markdown via Blob object URL with a sanitized file name", () => {
    const downloadBody = templateLibrary.slice(
        templateLibrary.indexOf("const downloadTemplate ="),
        templateLibrary.indexOf("const genCardHTML ="));
    assert(downloadBody.includes("new Blob("), "downloadTemplate should build a Blob");
    assert(downloadBody.includes("URL.createObjectURL"), "downloadTemplate should create an object URL");
    assert(downloadBody.includes("URL.revokeObjectURL"), "downloadTemplate should release the object URL");
    assert(downloadBody.includes("anchor.download"), "downloadTemplate should set the anchor download name");
    assert(/sanitizeTemplateName\(getTemplateName\(item\.path\)\)\}\.md`/.test(downloadBody),
        "download file name should be the sanitized template name with .md suffix");
    // 与后端 kernel/util/file.go FilterFileName 对齐：非法文件名字符需被清理
    assert(/\/\[\\\\\/:\*\?"'<>\|\]\/g/.test(templateLibrary),
        "sanitizeTemplateName should strip file-name-illegal characters");
});

test("import action opens the existing editor prefilled from selected files", () => {
    assert(templateLibrary.includes('id="templateImportBtn"'), "toolbar should have an import button");
    assert(/id="templateImportInput"[^>]*accept="\.md,\.txt"/.test(templateLibrary),
        "hidden file input should accept .md and .txt");
    assert(/id="templateImportInput"[^>]*multiple/.test(templateLibrary),
        "hidden file input should allow multiple files");
    assert(templateLibrary.includes('querySelector("#templateImportInput") as HTMLInputElement).click()'),
        "import button should trigger the hidden file input");
    assert(templateLibrary.includes("new FileReader()"), "import should read files with FileReader");
    assert(templateLibrary.includes("readAsText"), "import should read file content as text");
    assert(templateLibrary.includes('file.name.replace(/\\.(md|txt)$/i, "")'),
        "import should prefill the name from the file name without extension");
    assert(templateLibrary.includes("presetName") && templateLibrary.includes("presetContent"),
        "import should prefill the existing editor dialog");
    assert(templateLibrary.includes('fetchPost("/api/search/saveTemplate"'),
        "import save should go through the existing saveTemplate API");
    assert(templateLibrary.includes('input.value = "";'),
        "import input should reset so the same file can be re-selected");
});

test("import processes multiple files sequentially through the editor queue", () => {
    assert(templateLibrary.includes("importQueue"), "import should queue selected files");
    assert(templateLibrary.includes("onClose: processImportQueue"),
        "closing the editor should advance the import queue");
    assert(templateLibrary.includes("if (!importing) {"),
        "the queue should only run one editor at a time");
});

test("import never silently overwrites a same-name template", () => {
    // 后端 saveTemplate 会直接覆盖同名文件（kernel/model/template.go SaveTemplate），
    // 因此保存前必须先做客户端重名拦截
    assert(openEditorBody.includes("options?.preventDuplicate"),
        "editor save should support the preventDuplicate option");
    assert(templateLibrary.includes("const findDuplicateTemplate ="),
        "a duplicate lookup helper should exist");

    const duplicateIndex = openEditorBody.indexOf("findDuplicateTemplate(templates");
    const removeIndex = openEditorBody.indexOf('fetchPost("/api/search/removeTemplate"');
    const saveIndex = openEditorBody.indexOf('fetchPost("/api/search/saveTemplate"');
    assert(duplicateIndex > -1, "save path should check duplicates");
    assert(removeIndex > -1 && saveIndex > -1, "save path should call backend APIs");
    assert(duplicateIndex < removeIndex && duplicateIndex < saveIndex,
        "duplicate check must run before removeTemplate/saveTemplate so a blocked save cannot overwrite");

    const duplicateBranch = openEditorBody.slice(
        openEditorBody.indexOf("if (duplicate) {"),
        openEditorBody.indexOf("if (isEdit) {"));
    assert(duplicateBranch.includes("showMessage(") && duplicateBranch.includes("return;"),
        "duplicate name should show a readable message and block the save");

    const importQueueBody = templateLibrary.slice(
        templateLibrary.indexOf("const importQueue"),
        templateLibrary.indexOf("customGrid.addEventListener"));
    assert(importQueueBody.includes("openEditor(container, templates, undefined, {"),
        "each queued file should open the editor");
    assert(importQueueBody.includes("preventDuplicate: true"),
        "imported templates must be saved with the duplicate guard enabled");
    assert(openEditorBody.includes('options?.grid || parentElement.querySelector(".template-library__grid--custom")'),
        "editor save should re-render the custom grid, not the first grid on the page");
});

test("i18n keys are complete in both languages", () => {
    for (const key of ["template", "import", "export", "edit", "remove", "builtIn", "custom",
        "templateNameDuplicate", "templateImportFailed"]) {
        assert(typeof zhCN[key] === "string" && zhCN[key].length > 0, `zh_CN.json should define ${key}`);
        assert(typeof enUS[key] === "string" && enUS[key].length > 0, `en_US.json should define ${key}`);
    }
    assert(zhCN.templateNameDuplicate.includes("${x}") && enUS.templateNameDuplicate.includes("${x}"),
        "templateNameDuplicate should carry the ${x} placeholder");
    assert(templateLibrary.includes("languages.templateNameDuplicate"),
        "duplicate warning should use the i18n key");
    assert(!templateLibrary.includes("languages.builtin ||"),
        "the missing 'builtin' key should not be referenced");
});

test("config search indexes the template library tab with import/export terms", () => {
    const group = configSearch.indexOf('getLang(["template", "import", "export", "builtIn", "custom"])');
    assert(group > -1, "template library search group should exist");
    // tab 顺序：AI 之后是模板库，再之后才是资源；缺组会导致后续 tab 搜索索引整体偏移
    const aiGroup = configSearch.indexOf('["AI"].concat(getLang([');
    const assetsGroup = configSearch.indexOf('getLang(["assets"');
    assert(aiGroup > -1 && group > aiGroup && group < assetsGroup,
        "template library group should sit between the AI and assets groups to match tab order");
});

console.log(`\ntemplate library transfer: ${testsPassed} passed, ${testsFailed} failed`);
if (testsFailed > 0) {
    process.exit(1);
}
