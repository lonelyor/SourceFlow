const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");

const readSrc = (...parts) => fs.readFileSync(path.join(srcRoot, ...parts), "utf8");

const onGet = readSrc("protyle", "util", "onGet.ts");
const paste = readSrc("protyle", "util", "paste.ts");

assert(!/ALLOWED_TAGS:\s*false/.test(onGet), "onGet must not run a tag-stripping DOMPurify config");
assert(!/ALLOWED_ATTR:\s*false/.test(onGet), "onGet must not run an attr-stripping DOMPurify config");
assert(!/DOMPurify\.sanitize/.test(onGet), "onGet must not sanitize note BlockDOM content");
assert(
    !/parseFromString\(options\.content/.test(onGet),
    "onGet must not parse and rewrite the full note BlockDOM before insertion"
);
assert(
    !/options\.content\s*=\s*doc\.body\.innerHTML/.test(onGet),
    "onGet must not replace note BlockDOM with a rewritten parsed document body"
);
assert(
    onGet.includes("protyle.wysiwyg.element.innerHTML = options.content;"),
    "onGet must insert preserved BlockDOM without re-sanitizing the full note"
);

assert(!/ALLOWED_TAGS:\s*false/.test(paste), "paste must not run a tag-stripping DOMPurify config");
assert(!/ALLOWED_ATTR:\s*false/.test(paste), "paste must not run an attr-stripping DOMPurify config");
assert(!/DOMPurify\.sanitize\(sourceflowHTML/.test(paste), "paste must not sanitize internal SourceFlow BlockDOM");
assert(
    paste.includes("tempElement.innerHTML = sourceflowHTML;"),
    "internal SourceFlow paste must preserve source BlockDOM exactly"
);

console.log("Protyle BlockDOM preservation regression checks passed");
