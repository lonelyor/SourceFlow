const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const appRoot = path.join(__dirname, "..");
const projectRoot = path.join(appRoot, "..");
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), "utf8");

console.log("=== testSyncWebDAVProviders ===");

const reposSource = read("app", "src", "config", "repos.ts");
const webdavSource = read("app", "src", "config", "syncWebdav.ts");
const frontendSource = reposSource + webdavSource;
for (const marker of [
    'id="webdavPresetProvider"',
    'id="synologyQuickConnect"',
    'value="synology"',
    'value="generic"',
    'id="webdavTestConnection"',
    '"/api/sync/testSyncProviderWebDAV"',
    'url.protocol === "http:" ? "5005" : "5006"',
    'renderMultiDeviceSyncGuide()',
]) {
    assert.ok(frontendSource.includes(marker), `WebDAV frontend should contain ${marker}`);
}
assert.ok(reposSource.includes("群晖 NAS / 通用 WebDAV（推荐）"), "Synology/WebDAV should be the recommended first provider");
assert.ok(reposSource.indexOf('value="3"') < reposSource.indexOf('value="2"'), "WebDAV should appear before S3 in the provider selector");

const compiled = ts.transpileModule(webdavSource, {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
});
const moduleObj = {exports: {}};
vm.runInNewContext(compiled.outputText, {
    module: moduleObj,
    exports: moduleObj.exports,
    URL,
    require: () => ({escapeHtml: (value) => String(value ?? "")}),
    window: {sourceflow: {languages: new Proxy({}, {get: (_target, key) => String(key)})}},
}, {filename: "syncWebdav.ts"});
const {normalizeWebDAVEndpoint} = moduleObj.exports;
assert.strictEqual(normalizeWebDAVEndpoint("nas.local/sourceflow", "synology"), "https://nas.local:5006/sourceflow");
assert.strictEqual(normalizeWebDAVEndpoint("http://nas.local/sourceflow", "synology"), "http://nas.local:5005/sourceflow");
assert.strictEqual(normalizeWebDAVEndpoint("dav.example.com/root", "generic"), "https://dav.example.com/root");
assert.strictEqual(normalizeWebDAVEndpoint("https://dav.example.com/root", "generic"), "https://dav.example.com/root");

const requiredLanguageKeys = [
    "syncWebDAVPresetProvider",
    "syncWebDAVPresetSynology",
    "syncWebDAVPresetGeneric",
    "syncSynologyQuickConnect",
    "syncSynologyQuickConnectTip",
    "syncWebDAVTestConnection",
    "syncWebDAVTestConnectionSuccess",
    "syncMultiDeviceTitle",
    "syncMultiDeviceTip",
    "syncMultiDeviceConflictTip",
];
for (const language of ["zh_CN", "en_US"]) {
    const messages = JSON.parse(read("app", "appearance", "langs", `${language}.json`));
    for (const key of requiredLanguageKeys) {
        assert.ok(typeof messages[key] === "string" && messages[key].length > 0, `${language} should define ${key}`);
    }
}

const routerSource = read("kernel", "api", "router.go");
const apiSource = read("kernel", "api", "sync.go");
const modelSource = read("kernel", "model", "sync_webdav.go");
const syncConfSource = read("kernel", "conf", "sync.go");
const appConfSource = read("kernel", "model", "conf.go");
assert.ok(routerSource.includes('"/api/sync/testSyncProviderWebDAV"'), "router should register the WebDAV test endpoint");
assert.ok(apiSource.includes("model.TestSyncProviderWebDAV(webdav)"), "API should call the WebDAV connection test");
for (const operation of ["UploadBytes(testPath", "DownloadObject(testPath)", "RemoveObject(testPath)"]) {
    assert.ok(modelSource.includes(operation), `WebDAV connection test should perform ${operation}`);
}
assert.ok(syncConfSource.includes("SecretConfigured bool"), "provider responses should expose only secret presence");
assert.ok(appConfSource.includes('s3.SecretKey = ""'), "persisted S3 config must redact Secret Key");
assert.ok(appConfSource.includes('webdav.Password = ""'), "persisted WebDAV config must redact password");
assert.ok(appConfSource.includes("ContainsSecrets: false"), "recovery profiles must declare that they contain no plaintext secrets");
assert.ok(appConfSource.includes("RepoKeyEnvelope: Conf.Repo.KeyEnvelope"), "recovery profiles should contain only the encrypted key envelope");

const readme = read("README.md");
const guide = read("SYNC_WEBDAV_PROVIDERS.md");
assert.ok(readme.includes("群晖 NAS / 通用 WebDAV"), "README should document the recommended WebDAV path");
for (const section of ["群晖 NAS", "通用 WebDAV", "多端同步", "冲突"]) {
    assert.ok(guide.includes(section), `WebDAV guide should document ${section}`);
}

console.log("=== ALL TESTS PASSED ===");
