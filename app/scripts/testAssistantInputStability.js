const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

class FakeNode {
}

class FakeInputElement extends FakeNode {
    constructor(role, extra = {}) {
        super();
        this.role = role;
        this.value = "";
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.selectionDirection = "none";
        this.scrollTop = 0;
        this.disabled = false;
        this.focused = false;
        Object.assign(this, extra);
    }

    getAttribute(name) {
        return name === "data-role" ? this.role : null;
    }

    focus() {
        this.focused = true;
    }

    setSelectionRange(start, end, direction = "none") {
        this.selectionStart = start;
        this.selectionEnd = end;
        this.selectionDirection = direction;
    }
}

class FakeTextAreaElement extends FakeInputElement {
}

class FakeContainer extends FakeNode {
    constructor() {
        super();
        this.inside = new Set();
        this.queryAllResults = new Map();
    }

    contains(element) {
        return element === this || this.inside.has(element);
    }

    querySelectorAll(selector) {
        return this.queryAllResults.get(selector) || [];
    }
}

const compileModule = (entryPath, globals = {}) => {
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
        require,
        console,
        HTMLInputElement: FakeInputElement,
        HTMLTextAreaElement: FakeTextAreaElement,
        Node: FakeNode,
        ...globals,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");
const activeDocument = {activeElement: null};
const helper = compileModule(path.join(srcRoot, "assistant", "common", "inputStability.ts"), {
    document: activeDocument,
    window: {
        requestAnimationFrame: (callback) => {
            callback();
            return 1;
        },
    },
});

const container = new FakeContainer();
const activeInput = new FakeTextAreaElement("message", {
    value: "abcdef",
    selectionStart: 2,
    selectionEnd: 4,
    selectionDirection: "backward",
    scrollTop: 7,
});
container.inside.add(activeInput);
activeDocument.activeElement = activeInput;

const snapshot = helper.captureInputFocus(container, ["message", "note-search"]);
assert.strictEqual(snapshot.role, "message");
assert.strictEqual(snapshot.selectionStart, 2);
assert.strictEqual(snapshot.selectionEnd, 4);
assert.strictEqual(snapshot.selectionDirection, "backward");
assert.strictEqual(snapshot.scrollTop, 7);

const restoredInput = new FakeTextAreaElement("message", {value: "abc"});
container.queryAllResults.set("input[data-role], textarea[data-role]", [restoredInput]);
helper.restoreInputFocus(container, snapshot);
assert.strictEqual(restoredInput.focused, true);
assert.strictEqual(restoredInput.selectionStart, 2);
assert.strictEqual(restoredInput.selectionEnd, 3);
assert.strictEqual(restoredInput.selectionDirection, "backward");
assert.strictEqual(restoredInput.scrollTop, 7);

activeDocument.activeElement = new FakeInputElement("unrelated", {value: "x"});
container.inside.add(activeDocument.activeElement);
assert.strictEqual(helper.captureInputFocus(container, ["message"]), null);

const insideTarget = new FakeInputElement("message");
container.inside.add(insideTarget);
activeDocument.activeElement = null;
assert.strictEqual(helper.isEventInsideContainer(container, {target: insideTarget}), true);
assert.strictEqual(helper.isEventInsideContainer(container, {target: new FakeInputElement("message")}), false);
activeDocument.activeElement = insideTarget;
assert.strictEqual(helper.isEventInsideContainer(container), true);

const read = (relativePath) => fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
const renderSource = read("assistant/ai/AIDockRender.ts");
assert(renderSource.includes('from "../common/inputStability"'), "AI Dock render must use shared input stability helpers");
assert(!renderSource.includes("const captureTextInputFocus"), "AI Dock render must not keep a local focus snapshot helper");
assert(renderSource.includes("AI_DOCK_RESTORABLE_INPUT_ROLES"), "AI Dock must explicitly list restorable input roles");
assert(renderSource.includes("captureInputFocus(ctx.element"), "AI Dock render must capture input focus before full render");
assert(renderSource.includes("restoreInputFocus(ctx.element"), "AI Dock render must restore input focus after full render");

const controllerSource = read("assistant/ai/AIDockController.ts");
assert(controllerSource.includes("isEventInsideContainer(this.element, event)"), "AI Dock context follow must ignore Dock-local events");
assert(!controllerSource.includes("private isDockEventTarget"), "AI Dock must use the shared event boundary helper");

const studioSource = read("assistant/studio/sourceFlow.ts");
assert(studioSource.includes('from "../common/inputStability"'), "Source Studio must use shared input stability helpers");
assert(studioSource.includes("STUDIO_RESTORABLE_INPUT_ROLES"), "Source Studio must explicitly list restorable input roles");
assert(studioSource.includes("captureInputFocus(body"), "Source Studio must capture search input focus before render");
assert(studioSource.includes("restoreInputFocus(body"), "Source Studio must restore search input focus after render");
assert(!studioSource.includes("const restoreSearch ="), "Source Studio must not keep a local focus restore implementation");

console.log("[assistant-input-stability] ok");
