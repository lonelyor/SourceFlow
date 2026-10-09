const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "..", "src", "assistant", "inline", "selectionBar.ts");
const source = fs.readFileSync(sourcePath, "utf8");

const test = (name, fn) => {
    const fail = (error) => {
        console.error(`[assistant-selection-bar-input] failed - ${name}`);
        console.error(error);
        process.exitCode = 1;
    };
    try {
        const result = fn();
        if (result && typeof result.then === "function") {
            result.then(() => console.log(`[assistant-selection-bar-input] ok - ${name}`)).catch(fail);
            return;
        }
        console.log(`[assistant-selection-bar-input] ok - ${name}`);
    } catch (error) {
        fail(error);
    }
};

test("selection bar keeps the inline input row markup", () => {
    assert(source.includes('data-role="assistant-selection-inline-input"'), "input row must exist in the bar markup");
    assert(source.includes("assistant-selection-bar--input-mode"), "input mode class must be applied");
});

test("more action no longer opens the inline dialog from the bar", () => {
    assert(!source.includes("openAssistantInlineCommandPanel"), "bar must not open the dialog directly (I6)");
    assert(source.includes("enterSelectionBarInputMode(bar)"), "more must switch the bar into input mode");
});

test("destroy keeps the pinned mousedown teardown", () => {
    assert(source.includes('document.removeEventListener("mousedown", onDocumentMouseDown)'), "teardown literal pinned by testUiRegressionFixes");
});

class FakeElement {
    constructor(tag) {
        this.tag = tag;
        this.classSet = new Set();
        this.attributes = {};
        this.listeners = {};
        this.style = {};
        this.parentElement = null;
        this.inputEl = null;
        this.focusCount = 0;
        this.value = "";
    }

    get classList() {
        const set = this.classSet;
        return {
            add: (...names) => names.forEach((item) => set.add(item)),
            remove: (...names) => names.forEach((item) => set.delete(item)),
            contains: (name) => set.has(name),
        };
    }

    setAttribute(name, value) {
        this.attributes[name] = value;
    }

    getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }

    addEventListener(type, handler) {
        (this.listeners[type] = this.listeners[type] || []).push(handler);
    }

    dispatch(type, event) {
        (this.listeners[type] || []).slice().forEach((handler) => handler(event));
    }

    querySelector(selector) {
        if (typeof selector === "string" && selector.includes("assistant-selection-inline-input")) {
            return this.inputEl;
        }
        return null;
    }

    contains(node) {
        return node === this || node === this.inputEl;
    }

    appendChild() {
    }

    remove() {
    }

    getBoundingClientRect() {
        return {left: 10, top: 10, width: 120, height: 32, right: 130, bottom: 42};
    }

    focus() {
        this.focusCount += 1;
    }
}

const createHarness = () => {
    const pendingTimers = new Map();
    let timerSeq = 0;
    const inlineCalls = [];
    const removedListeners = [];

    const wysiwyg = new FakeElement("div");
    wysiwyg.classSet.add("protyle-wysiwyg");
    const startContainer = new FakeElement("p");
    startContainer.parentElement = wysiwyg;

    const range = {
        collapsed: false,
        startContainer,
        cloneRange() {
            return this;
        },
        getBoundingClientRect() {
            return {left: 10, top: 10, width: 50, height: 20, right: 60, bottom: 30};
        },
        toString() {
            return "demo text";
        },
    };

    const sandboxWindow = {
        setTimeout: (handler) => {
            timerSeq += 1;
            pendingTimers.set(timerSeq, handler);
            return timerSeq;
        },
        clearTimeout: (id) => {
            pendingTimers.delete(id);
        },
        getSelection: () => (range ? {rangeCount: 1, getRangeAt: () => range} : {rangeCount: 0}),
    };

    const protyleElement = new FakeElement("div");
    protyleElement.contains = () => true;
    const protyle = {app: {}, element: protyleElement};

    const documentStub = {
        createdBar: null,
        listeners: {},
        createElement: (tag) => {
            const element = new FakeElement(tag);
            if (tag === "div" && !documentStub.createdBar) {
                const input = new FakeElement("input");
                input.classSet.add("assistant-selection-bar__input");
                element.inputEl = input;
                documentStub.createdBar = element;
            }
            return element;
        },
        body: {
            appendChild: () => {
            },
        },
        addEventListener(type, handler) {
            this.listeners[type] = handler;
        },
        removeEventListener(type, handler) {
            removedListeners.push([type, handler]);
        },
    };

    const inlineModule = {
        runAssistantInlineInstruction: (options, instruction) => {
            inlineCalls.push({options, instruction});
            return Promise.resolve(true);
        },
    };

    const requireStub = (request) => {
        if (request === "../constants") {
            return {assistantText: (zh) => zh};
        }
        if (request === "../common/dom") {
            return {escapeAttr: (value) => value, escapeHTML: (value) => value};
        }
        if (request === "../runtime") {
            return {
                runAssistantFeature: (feature, loader, callback) => {
                    const loaded = loader();
                    if (loaded && typeof loaded.then === "function") {
                        return loaded.then(callback);
                    }
                    return callback(loaded);
                },
            };
        }
        if (request === "../../layout/getAll") {
            return {getAllEditor: () => [{protyle}]};
        }
        if (request === "./commands") {
            return inlineModule;
        }
        if (request === "../skills/execute") {
            return {runAssistantSkill: () => Promise.resolve(undefined)};
        }
        if (request === "./translateBubble") {
            return {openAssistantTranslateBubble: () => undefined};
        }
        throw new Error(`unexpected require: ${request}`);
    };

    const compiled = ts.transpileModule(source, {
        compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019},
    });
    const moduleExports = {};
    const sandbox = {
        require: requireStub,
        module: {exports: moduleExports},
        exports: moduleExports,
        window: sandboxWindow,
        document: documentStub,
        getSelection: () => (range ? {rangeCount: 1, getRangeAt: () => range} : {rangeCount: 0}),
        HTMLElement: function () {
        },
    };
    vm.runInNewContext(compiled.outputText, sandbox, {filename: "selectionBar.js"});
    const exports = moduleExports;

    const runPendingTimers = () => {
        const handlers = [...pendingTimers.values()];
        pendingTimers.clear();
        handlers.forEach((handler) => handler());
    };

    return {exports, documentStub, inlineCalls, removedListeners, runPendingTimers, pendingTimers};
};

const moreClickEvent = () => ({
    preventDefault: () => {
    },
    stopPropagation: () => {
    },
    target: {
        getAttribute: (name) => (name === "data-action" ? "more" : null),
    },
});

const showBar = (harness) => {
    harness.exports.initAssistantSelectionBar();
    harness.documentStub.listeners.selectionchange();
    harness.runPendingTimers();
    assert(harness.documentStub.createdBar, "bar must be created after selection");
    return harness.documentStub.createdBar;
};

test("selecting text shows the bar and more switches it into input mode", () => {
    const harness = createHarness();
    const bar = showBar(harness);
    assert(bar.classSet.has("assistant-selection-bar--visible"), "bar must be visible after selection");

    bar.dispatch("click", moreClickEvent());
    harness.runPendingTimers();
    assert(bar.classSet.has("assistant-selection-bar--input-mode"), "more must enter input mode");
    assert(bar.inputEl.focusCount > 0, "input must be focused");
    assert.strictEqual(harness.inlineCalls.length, 0, "no instruction runs on entering input mode");
});

test("enter runs the inline instruction with the captured selection and hides the bar", async () => {
    const harness = createHarness();
    const bar = showBar(harness);
    bar.dispatch("click", moreClickEvent());
    bar.inputEl.value = "更简洁";
    const noop = () => {
    };
    bar.dispatch("keydown", {target: bar.inputEl, key: "Enter", isComposing: false, preventDefault: noop, stopPropagation: noop});
    await Promise.resolve();
    await Promise.resolve();
    assert.strictEqual(harness.inlineCalls.length, 1, "instruction must run once");
    assert.strictEqual(harness.inlineCalls[0].instruction, "更简洁");
    assert.strictEqual(harness.inlineCalls[0].options.fallbackSelectionText, "demo text");
    assert(harness.inlineCalls[0].options.protyle, "protyle must be forwarded");
    assert(!bar.classSet.has("assistant-selection-bar--visible"), "bar must hide after running");
    assert(!bar.classSet.has("assistant-selection-bar--input-mode"), "input mode must exit after running");
    assert.strictEqual(bar.inputEl.value, "", "input must be cleared after running");
});

test("escape exits input mode and keeps the bar visible", () => {
    const harness = createHarness();
    const bar = showBar(harness);
    bar.dispatch("click", moreClickEvent());
    bar.inputEl.value = "更正式";
    const noop = () => {
    };
    bar.dispatch("keydown", {target: bar.inputEl, key: "Escape", isComposing: false, preventDefault: noop, stopPropagation: noop});
    assert(!bar.classSet.has("assistant-selection-bar--input-mode"), "escape must exit input mode");
    assert(bar.classSet.has("assistant-selection-bar--visible"), "bar must stay visible after escape");
    assert.strictEqual(bar.inputEl.value, "", "escape must clear the draft");
    assert.strictEqual(harness.inlineCalls.length, 0, "escape must not run the instruction");
});

test("selection changes and auto-hide are suppressed while typing in the bar input", () => {
    const harness = createHarness();
    const bar = showBar(harness);
    bar.dispatch("click", moreClickEvent());
    harness.documentStub.listeners.selectionchange();
    harness.runPendingTimers();
    assert(bar.classSet.has("assistant-selection-bar--visible"), "bar must not hide while in input mode");
    assert(bar.classSet.has("assistant-selection-bar--input-mode"), "input mode must survive selection changes");
});

test("destroy tears down document listeners", () => {
    const harness = createHarness();
    harness.exports.initAssistantSelectionBar();
    harness.exports.destroyAssistantSelectionBar();
    assert(harness.removedListeners.some(([type]) => type === "mousedown"), "mousedown listener must be removed");
    assert(harness.removedListeners.some(([type]) => type === "selectionchange"), "selectionchange listener must be removed");
});
