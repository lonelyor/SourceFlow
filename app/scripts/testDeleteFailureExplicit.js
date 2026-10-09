// 删除链路失败必须显式上报：禁止静默吞错。
// 覆盖 kernel 单篇删除 / 批量删除 / API 错误透传 / 前端 getDocInfo 守卫。
const fs = require("fs");
const path = require("path");

const assert = require("assert");

const appRoot = path.join(__dirname, "..");
const repoRoot = path.join(appRoot, "..");
const srcRoot = path.join(appRoot, "src");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
const readKernel = (...parts) => fs.readFileSync(path.join(repoRoot, "kernel", ...parts), "utf8");

const packageJSON = JSON.parse(fs.readFileSync(path.join(appRoot, "package.json"), "utf8"));
const apiFiletree = readKernel("api", "filetree.go");
const apiAssistantInbox = readKernel("api", "assistant_inbox.go");
const modelFile = readKernel("model", "file.go");
const modelAssistantHistory = readKernel("model", "assistant_operation_history.go");
const deleteFile = readSrc("editor", "deleteFile.ts");
const langZh = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "zh_CN.json"), "utf8"));
const langEn = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", "en_US.json"), "utf8"));

assert.strictEqual(
    packageJSON.scripts["test:delete-failure-explicit"],
    "node ./scripts/testDeleteFailureExplicit.js",
    "package.json must wire test:delete-failure-explicit"
);

// --- model 层：删除函数必须返回错误 ---

assert(
    modelFile.includes("func RemoveDoc(boxID, p string) (err error)") &&
    modelFile.includes('return fmt.Errorf("notebook [%s] not found", boxID)'),
    "RemoveDoc must return an explicit error when the notebook is missing"
);

assert(
    modelFile.includes("func removeDoc(box *Box, p string, luteEngine *lute.Lute) (ret *parse.Tree, err error)") &&
    modelFile.includes('fmt.Errorf("load doc tree [notebook=%s, path=%s] failed"') &&
    modelFile.includes('fmt.Errorf("get history dir failed: %s"') &&
    modelFile.includes('fmt.Errorf("backup doc [notebook=%s, path=%s] to history failed: %s"') &&
    modelFile.includes('fmt.Errorf("backup children dir [notebook=%s, path=%s] to history failed: %s"') &&
    modelFile.includes('fmt.Errorf("remove children dir [notebook=%s, path=%s] failed: %s"') &&
    modelFile.includes('fmt.Errorf("remove doc [notebook=%s, path=%s] failed: %s"'),
    "removeDoc must return an explicit error at every failure point"
);

assert(
    modelFile.includes("func RemoveDocsByRefs(docs []RemoveDocRef) error") &&
    modelFile.includes("errs = append(errs, fmt.Sprintf(\"notebook [%s] not found\", doc.Notebook))") &&
    modelFile.includes("errs = append(errs, err.Error())") &&
    modelFile.includes("strings.Join(errs"),
    "batch delete must collect and report every failed doc instead of silently skipping"
);

// --- API 层：model 错误必须透传给前端 ---

assert(
    apiFiletree.includes("if err := model.RemoveDoc(notebook, p); err != nil {") &&
    apiFiletree.includes("if err := model.RemoveDoc(tree.Box, tree.Path); err != nil {") &&
    apiFiletree.includes("if err := model.RemoveDocsByRefs(docs); err != nil {"),
    "removeDoc/removeDocByID/removeDocs APIs must surface model errors in ret.Msg"
);

// --- 其他内部调用点也不得忽略错误 ---

assert(
    apiAssistantInbox.includes("if err := model.RemoveDoc(tree.Box, tree.Path); err != nil {"),
    "assistant inbox cleanup must propagate RemoveDoc errors"
);
assert(
    modelAssistantHistory.includes("if err = RemoveDoc(tree.Box, tree.Path); nil != err {"),
    "assistant operation history revert must propagate RemoveDoc errors"
);

// --- 前端：getDocInfo 无数据必须显式提示，不能抛 TypeError 静默失败 ---

assert(
    deleteFile.includes("if (!response.data) {") &&
    deleteFile.includes("showMessage(window.sourceflow.languages.delGetInfoFailed);"),
    "deleteFile must guard missing getDocInfo data and surface a visible error"
);

assert(
    "string" === typeof langZh.delGetInfoFailed && "string" === typeof langEn.delGetInfoFailed,
    "delGetInfoFailed must exist in both zh_CN and en_US language files"
);

console.log("testDeleteFailureExplicit: all assertions passed");
