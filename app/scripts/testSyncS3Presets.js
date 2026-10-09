const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const appRoot = path.join(__dirname, "..");
const projectRoot = path.join(appRoot, "..");
const srcRoot = path.join(appRoot, "src");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

console.log("=== testSyncS3Presets ===");

// ---- Frontend source structure ----
const reposSource = readSrc("config", "repos.ts");
assert.ok(reposSource.includes('id="s3PresetProvider"'), "repos.ts should render the S3 preset select");
assert.ok(reposSource.includes('id="s3TestConnection"'), "repos.ts should render the test connection button");
assert.ok(reposSource.includes('id="s3PresetHint"'), "repos.ts should render the preset hint container");
assert.ok(reposSource.includes("/api/sync/testSyncProviderS3"), "repos.ts should call the S3 test connection API");
for (const presetId of ["cloudflare-r2", "aliyun-oss", "tencent-cos", "custom"]) {
    assert.ok(reposSource.includes(`"${presetId}"`), `repos.ts should define preset ${presetId}`);
}
for (const keyword of ["r2.cloudflarestorage.com", "aliyuncs.com", "myqcloud.com"]) {
    assert.ok(reposSource.includes(keyword), `repos.ts should detect provider keyword ${keyword}`);
}
console.log("[frontend-source] preset select, test button, API call, and provider keywords ok");

// ---- Functional test: compile repos.ts and render the S3 panel ----
const compileModule = (source, globals = {}) => {
    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
    });
    const moduleObj = {exports: {}};
    const mockRequire = (id) => {
        if (id.includes("util/escape")) {
            return {
                escapeHtml: (value) => String(value ?? ""),
                escapeAttr: (value) => String(value ?? ""),
            };
        }
        if (id.includes("util/functions")) {
            return {isBrowser: () => false, isMobile: () => false};
        }
        if (id.includes("util/pathName")) {
            return {
                originalPath: () => ({dirname: () => "", resolve: () => "", isAbsolute: () => false}),
                useShell: () => undefined,
            };
        }
        if (id.includes("util/fetch")) {
            return {fetchPost: () => undefined};
        }
        if (id.includes("constants")) {
            return {Constants: {SOURCEFLOW_GET: "sourceflow-get", LOCAL_FILEPOSITION: "local-fileposition"}};
        }
        if (id.includes("dialog")) {
            return {showMessage: () => undefined, confirmDialog: () => undefined, Dialog: class {}};
        }
        return new Proxy({}, {get: () => () => undefined});
    };
    const sandbox = {
        module: moduleObj,
        exports: moduleObj.exports,
        require: mockRequire,
        console,
        setTimeout,
        clearTimeout,
        ...globals,
    };
    vm.runInNewContext(compiled.outputText, sandbox, {filename: "repos.ts"});
    return moduleObj.exports;
};

const createMockWindow = (endpoint) => {
    const languages = new Proxy({}, {get: (target, key) => String(key)});
    return {
        sourceflow: {
            config: {
                lang: "zh_CN",
                repo: {key: "test-key", remoteRetentionRecentHours: 24, remoteRetentionRecentDays: 7},
                system: {container: "std", isPortable: false, workspaceDir: "/workspace"},
                sync: {
                    provider: 2,
                    enabled: false,
                    perception: false,
                    generateConflictDoc: true,
                    interval: 30,
                    cloudName: "main",
                    s3: {
                        endpoint: endpoint,
                        accessKey: "",
                        secretKey: "",
                        bucket: "",
                        region: "",
                        pathStyle: false,
                        skipTlsVerify: false,
                        timeout: 30,
                        concurrentReqs: 4,
                    },
                    webdav: {
                        endpoint: "",
                        username: "",
                        password: "",
                        skipTlsVerify: false,
                        timeout: 30,
                        concurrentReqs: 4,
                    },
                    local: {endpoint: "", timeout: 30, concurrentReqs: 4},
                },
            },
            languages: languages,
            storage: {},
        },
    };
};

const renderS3Panel = (endpoint) => {
    const compiled = compileModule(reposSource, {window: createMockWindow(endpoint)});
    return compiled.repos.genHTML();
};

const r2Panel = renderS3Panel("https://accountid.r2.cloudflarestorage.com/");
assert.ok(r2Panel.includes('id="s3PresetProvider"'), "rendered panel should contain preset select");
assert.ok(r2Panel.includes('value="cloudflare-r2" selected'), "R2 endpoint should select the cloudflare-r2 preset");
assert.ok(r2Panel.includes('id="s3TestConnection"'), "rendered panel should contain test connection button");
assert.ok(r2Panel.includes('id="s3PresetHint"'), "rendered panel should contain preset hint");
assert.ok(r2Panel.includes("auto"), "R2 hint should mention the auto region");
console.log("[render] R2 endpoint detected and panel rendered ok");

const ossPanel = renderS3Panel("https://oss-cn-hangzhou.aliyuncs.com/");
assert.ok(ossPanel.includes('value="aliyun-oss" selected'), "OSS endpoint should select the aliyun-oss preset");
console.log("[render] Aliyun OSS endpoint detected ok");

const cosPanel = renderS3Panel("https://cos.ap-guangzhou.myqcloud.com/");
assert.ok(cosPanel.includes('value="tencent-cos" selected'), "COS endpoint should select the tencent-cos preset");
console.log("[render] Tencent COS endpoint detected ok");

const customPanel = renderS3Panel("");
assert.ok(customPanel.includes('value="custom" selected'), "empty endpoint should select the custom preset");
console.log("[render] custom preset fallback ok");

// ---- i18n keys ----
const requiredLangKeys = [
    "syncS3PresetProvider",
    "syncS3PresetProviderTip",
    "syncS3TestConnection",
    "syncS3TestConnectionTip",
    "syncS3TestConnectionTesting",
    "syncS3TestConnectionSuccess",
    "syncS3TestConnectionFailed",
    "syncS3TestConnectionMissing",
];
for (const langName of ["zh_CN", "en_US"]) {
    const lang = JSON.parse(fs.readFileSync(path.join(appRoot, "appearance", "langs", `${langName}.json`), "utf8"));
    for (const key of requiredLangKeys) {
        assert.ok(typeof lang[key] === "string" && lang[key].length > 0, `${langName}.json should define ${key}`);
    }
    console.log(`[i18n] ${langName} keys ok`);
}

// ---- Go backend ----
const routerSource = fs.readFileSync(path.join(projectRoot, "kernel", "api", "router.go"), "utf8");
assert.ok(routerSource.includes('"/api/sync/testSyncProviderS3"'), "router.go should register the test route");
assert.ok(/testSyncProviderS3\)/.test(routerSource), "router.go should bind the testSyncProviderS3 handler");

const apiSyncSource = fs.readFileSync(path.join(projectRoot, "kernel", "api", "sync.go"), "utf8");
assert.ok(apiSyncSource.includes("func testSyncProviderS3("), "api/sync.go should define the handler");
assert.ok(apiSyncSource.includes("model.TestSyncProviderS3("), "handler should call model.TestSyncProviderS3");

const modelSyncSource = fs.readFileSync(path.join(projectRoot, "kernel", "model", "sync.go"), "utf8");
assert.ok(modelSyncSource.includes("func TestSyncProviderS3("), "model/sync.go should define TestSyncProviderS3");
assert.ok(modelSyncSource.includes("func validateS3ConnectionTestConfig("), "model/sync.go should validate the test config");
assert.ok(modelSyncSource.includes("UploadBytes(testPath"), "test should upload a temporary object");
assert.ok(modelSyncSource.includes("DownloadObject(testPath)"), "test should download the temporary object");
assert.ok(modelSyncSource.includes("RemoveObject(testPath)"), "test should remove the temporary object");
console.log("[go-backend] route, handler, and model test flow ok");

// ---- Documentation ----
const docPath = path.join(projectRoot, "SYNC_S3_PROVIDERS.md");
assert.ok(fs.existsSync(docPath), "SYNC_S3_PROVIDERS.md should exist");
const doc = fs.readFileSync(docPath, "utf8");
for (const section of ["Cloudflare R2", "阿里云 OSS", "腾讯云 COS", "安全说明", "常见问题"]) {
    assert.ok(doc.includes(section), `SYNC_S3_PROVIDERS.md should document ${section}`);
}
console.log("[docs] provider guide sections ok");

console.log("\n=== ALL TESTS PASSED ===");
