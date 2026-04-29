const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const createHostWindow = () => ({
    sourceflow: {
        config: {
            lang: "en_US",
        },
        storage: {},
    },
});

const compileModule = (entryPath, requireMap = {}, hostWindow = createHostWindow()) => {
    const source = fs.readFileSync(entryPath, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: entryPath,
    });
    const moduleObj = {exports: {}};
    const dirname = path.dirname(entryPath);
    const localRequire = (request) => {
        if (request in requireMap) {
            return requireMap[request];
        }
        if (request.startsWith(".")) {
            const target = path.resolve(dirname, request);
            const withExt = fs.existsSync(target) ? target : `${target}.ts`;
            return compileModule(withExt, requireMap, hostWindow);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        window: hostWindow,
        global: hostWindow,
        globalThis: hostWindow,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const homepageRoot = path.join(appRoot, "src", "homepage");
const constantsPath = path.join(homepageRoot, "constants.ts");
const statePath = path.join(homepageRoot, "state.ts");
const templateConfigPath = path.join(homepageRoot, "templateConfig.ts");
const defaultTemplatePath = path.join(homepageRoot, "templates", "defaultTemplate.ts");
const standalonePath = path.join(homepageRoot, "templates", "standalone.ts");

const hostWindow = createHostWindow();
const constantsModule = compileModule(constantsPath, {}, hostWindow);
const stateModule = compileModule(statePath, {
    "../constants": {
        Constants: {
            LOCAL_HOMEPAGE: "local-homepage",
        },
    },
    "../protyle/util/compatibility": {
        setStorageVal() {
            return undefined;
        },
    },
    "./constants": constantsModule,
}, hostWindow);
const templateConfigModule = compileModule(templateConfigPath, {
    "../util/structuredData": compileModule(path.join(appRoot, "src", "util", "structuredData.ts"), {}, hostWindow),
}, hostWindow);
const defaultTemplateModule = compileModule(defaultTemplatePath, {
    "../constants": constantsModule,
    "../templateConfig": templateConfigModule,
    "../state": stateModule,
}, hostWindow);
const standaloneModule = compileModule(standalonePath, {}, hostWindow);

const {DEFAULT_TEMPLATE_PATH} = constantsModule;
const {normalizeTemplatePath, normalizeHomepageState} = stateModule;
const {parseHomepageTemplateConfig} = templateConfigModule;
const {getDefaultTemplateBundle, isUpgradeableDefaultHomepageTemplate} = defaultTemplateModule;
const {extractStandaloneHomepageHTML} = standaloneModule;

assert.strictEqual(normalizeTemplatePath(""), DEFAULT_TEMPLATE_PATH);
assert.strictEqual(normalizeTemplatePath("data/storage/homepage/custom/"), "/data/storage/homepage/custom");
assert.strictEqual(normalizeHomepageState({sourceType: "note", noteId: ""}).sourceType, "template");
assert.strictEqual(normalizeHomepageState({sourceType: "note", noteId: "doc-1"}).sourceType, "note");

const parsedConfig = parseHomepageTemplateConfig(`
{
    // comment
    templateVersion: 3,
    title: 'Hello',
    trailing: true,
}
`);
assert.strictEqual(parsedConfig.templateVersion, 3);
assert.strictEqual(parsedConfig.title, "Hello");
assert.strictEqual(parsedConfig.trailing, true);

const standaloneBundle = extractStandaloneHomepageHTML(`
<!doctype html>
<html>
<head>
    <style>.demo { color: red; }</style>
</head>
<body>
    <main>Hello</main>
    <script>window.demo = true;</script>
</body>
</html>
`);
assert.strictEqual(standaloneBundle.html, "<main>Hello</main>");
assert.ok(standaloneBundle.css.includes(".demo"));
assert.ok(standaloneBundle.script.includes("window.demo = true;"));

const defaultBundle = getDefaultTemplateBundle();
assert.ok(defaultBundle.html.includes("sourceflow-default-homepage"));
assert.ok(defaultBundle.css.includes(".sourceflow-home__surface"));

assert.strictEqual(isUpgradeableDefaultHomepageTemplate(DEFAULT_TEMPLATE_PATH, {
    ...defaultBundle,
    config: JSON.stringify({templateVersion: 1}),
}), true);
assert.strictEqual(isUpgradeableDefaultHomepageTemplate("/data/storage/homepage/custom", {
    ...defaultBundle,
    config: JSON.stringify({templateVersion: 1}),
}), false);
assert.strictEqual(isUpgradeableDefaultHomepageTemplate(DEFAULT_TEMPLATE_PATH, {
    html: "<div>custom</div>",
    css: ".custom{}",
    script: "",
    config: JSON.stringify({templateVersion: 1}),
}), false);

console.log("[homepage-modules] ok");
