const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

class FakeElement {
    constructor(tag = "div") {
        this.tag = tag;
        this.children = [];
        this.parentElement = null;
        this.attrs = {};
        this.className = "";
        this.textContent = "";
        this.isConnected = true;
        this.parts = {};
    }

    setAttribute(name, value) {
        this.attrs[name] = value;
    }

    getAttribute(name) {
        return this.attrs[name] ?? null;
    }

    set innerHTML(value) {
        this._innerHTML = value;
        const body = new FakeElement("div");
        body.className = "assistant-ghost-draft__body";
        const hint = new FakeElement("span");
        hint.className = "assistant-ghost-draft__hint";
        this.parts[".assistant-ghost-draft__body"] = body;
        this.parts[".assistant-ghost-draft__hint"] = hint;
        this.appendChild(body);
        this.appendChild(hint);
    }

    appendChild(child) {
        child.parentElement = this;
        child.isConnected = this.isConnected;
        this.children.push(child);
        return child;
    }

    insertAdjacentElement(_position, child) {
        if (this.parentElement) {
            this.parentElement.appendChild(child);
            return child;
        }
        this.appendChild(child);
        return child;
    }

    querySelector(selector) {
        if (this.parts[selector]) {
            return this.parts[selector];
        }
        const idMatch = selector.match(/^\[data-node-id="([^"]+)"\]$/);
        if (idMatch && this.attrs["data-node-id"] === idMatch[1]) {
            return this;
        }
        for (const child of this.children) {
            const match = child.querySelector(selector);
            if (match) {
                return match;
            }
        }
        return null;
    }

    remove() {
        this.isConnected = false;
        if (!this.parentElement) {
            return;
        }
        this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
        this.parentElement = null;
    }
}

const compileModule = (entryPath, requireMap = {}, globals = {}) => {
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
            return compileModule(withExt, requireMap, globals);
        }
        return require(request);
    };
    vm.runInNewContext(compiled.outputText, {
        module: moduleObj,
        exports: moduleObj.exports,
        require: localRequire,
        console,
        ...globals,
    }, {filename: entryPath});
    return moduleObj.exports;
};

const listeners = [];
const fakeWindow = {
    addEventListener(type, handler) {
        listeners.push({type, handler});
    },
    removeEventListener(type, handler) {
        const index = listeners.findIndex((item) => item.type === type && item.handler === handler);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    },
};
const fakeDocument = {
    createElement: () => new FakeElement(),
};

const appRoot = path.join(__dirname, "..");
const ghostModule = compileModule(path.join(appRoot, "src", "assistant", "ghost", "draft.ts"), {
    "../constants": {
        assistantText: (zh, en) => zh || en,
    },
    "../common/dom": {
        escapeHTML: (value) => `${value || ""}`,
    },
}, {
    window: fakeWindow,
    document: fakeDocument,
});

assert.strictEqual(ghostModule.shouldUseAssistantGhostDraft({action: "insert-below"}), true);
assert.strictEqual(ghostModule.shouldUseAssistantGhostDraft({action: "chat"}), false);

const editor = new FakeElement("div");
const block = new FakeElement("div");
block.setAttribute("data-node-id", "block-1");
editor.appendChild(block);
const draft = ghostModule.createAssistantGhostDraft({
    id: "note-continue-writing",
    action: "insert-below",
}, {
    protyle: {
        wysiwyg: {
            element: editor,
        },
    },
    note: {
        rootID: "root-1",
        currentBlockID: "block-1",
    },
});
assert(draft, "ghost draft should be created");
draft.update("第一段\n第二段");
const ghostElement = editor.children.find((item) => item.attrs["data-assistant-ghost-draft"] === "note-continue-writing");
assert(ghostElement, "ghost element should be inserted near block");
assert.strictEqual(ghostElement.querySelector(".assistant-ghost-draft__body").textContent, "第一段\n第二段");

listeners.find((item) => item.type === "keydown").handler({key: "Escape"});
assert.strictEqual(draft.isCanceled(), true);

const executeSource = fs.readFileSync(path.join(appRoot, "src", "assistant", "skills", "execute.ts"), "utf8");
assert(!executeSource.includes('execCommand("insertText"'), "assistant selection apply path should not use execCommand insertText");

console.log("[assistant-ghost-draft] ok");
