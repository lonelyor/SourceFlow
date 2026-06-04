const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const entryPath = path.join(__dirname, "..", "src", "assistant", "secrets.ts");
const source = fs.readFileSync(entryPath, "utf8");
const compiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
    fileName: entryPath,
});

const moduleObj = {exports: {}};
vm.runInNewContext(compiled.outputText, {
    module: moduleObj,
    exports: moduleObj.exports,
}, {filename: entryPath});

const secrets = moduleObj.exports;
const assertPayload = (actual, expected) => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), expected);
};

assert.strictEqual(secrets.getAssistantSecretInputValue(true), secrets.ASSISTANT_SECRET_MASK);
assert.strictEqual(secrets.getAssistantSecretInputValue(false), "");

assertPayload(
    secrets.getAssistantSecretPayload(true, secrets.ASSISTANT_SECRET_MASK),
    {apiKey: "", apiKeyAction: "keep"},
);
assertPayload(
    secrets.getAssistantSecretPayload(true, "new-key"),
    {apiKey: "new-key", apiKeyAction: "replace"},
);
assertPayload(
    secrets.getAssistantSecretPayload(true, ""),
    {apiKey: "", apiKeyAction: "clear"},
);
assertPayload(
    secrets.getAssistantSecretPayload(false, ""),
    {apiKey: "", apiKeyAction: "clear"},
);

const maskedInput = {
    value: secrets.ASSISTANT_SECRET_MASK,
    dataset: {secretMasked: "true"},
};
assertPayload(
    secrets.getAssistantSecretPayloadFromInput(true, maskedInput),
    {apiKey: "", apiKeyAction: "keep"},
);
assert.strictEqual(secrets.clearAssistantSecretMaskBeforeEdit(maskedInput), true);
assert.strictEqual(maskedInput.value, "");
assert.strictEqual(maskedInput.dataset.secretDirty, "true");
assertPayload(
    secrets.getAssistantSecretPayloadFromInput(true, maskedInput),
    {apiKey: "", apiKeyAction: "clear"},
);

const prefixedInput = {
    value: `${secrets.ASSISTANT_SECRET_MASK}new-key`,
    dataset: {secretMasked: "true"},
};
assert.strictEqual(secrets.normalizeAssistantSecretInputAfterEdit(prefixedInput), "new-key");
assert.strictEqual(prefixedInput.dataset.secretDirty, "true");
assertPayload(
    secrets.getAssistantSecretPayloadFromInput(true, prefixedInput),
    {apiKey: "new-key", apiKeyAction: "replace"},
);

console.log("[assistant-secrets] ok");
