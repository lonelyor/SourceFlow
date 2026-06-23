const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const parserPath = path.join(__dirname, "..", "src", "util", "structuredData.ts");
const parserSource = fs.readFileSync(parserPath, "utf8");
const compiled = ts.transpileModule(parserSource, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
});

const moduleObj = {exports: {}};

vm.runInNewContext(compiled.outputText, {
    module: moduleObj,
    exports: moduleObj.exports,
    require,
    console,
});

const {parseStructuredData, parseStructuredDataObject} = moduleObj.exports;

const normalize = (value) => JSON.parse(JSON.stringify(value));

assert.deepStrictEqual(normalize(parseStructuredData("{a: 1, b: ['x', true, null],}")), {
    a: 1,
    b: ["x", true, null],
});

assert.deepStrictEqual(normalize(parseStructuredData("{/* keep */foo: 'bar', // nested\nbaz: {answer: 42,},}")), {
    foo: "bar",
    baz: {
        answer: 42,
    },
});

assert.deepStrictEqual(normalize(parseStructuredData("[1, {tab: 'violin'}, false]")), [
    1,
    {tab: "violin"},
    false,
]);

assert.deepStrictEqual(normalize(parseStructuredDataObject("{\"\\\\foo\": \"{x^2}\"}", "KaTeX macros")), {
    "\\foo": "{x^2}",
});

assert.throws(() => {
    parseStructuredData("{formatter: function () { return 1; }}");
}, /Unsupported token|Unexpected token/);

assert.throws(() => {
    parseStructuredData("{value: alert(1)}");
}, /Expected \",\"|Unsupported token|Unexpected token/);

assert.throws(() => {
    parseStructuredDataObject("[]", "ECharts option");
}, /ECharts option must be an object/);

console.log("[structured-data] ok");
