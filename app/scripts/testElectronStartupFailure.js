const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
    normalizeStartupExitCode,
    shouldSuppressGenericPortFailure,
    shouldRetryKernelPort,
} = require("../electron/kernelStartupFailure.js");

assert.strictEqual(normalizeStartupExitCode(0), null);
assert.strictEqual(normalizeStartupExitCode("0"), null);
assert.strictEqual(normalizeStartupExitCode(25), 25);
assert.strictEqual(normalizeStartupExitCode("25"), 25);
assert.strictEqual(normalizeStartupExitCode(null), -1);
assert.strictEqual(normalizeStartupExitCode(null, "SIGTERM"), -1);
assert.strictEqual(shouldSuppressGenericPortFailure(null), false);
assert.strictEqual(shouldSuppressGenericPortFailure(25), true);
assert.strictEqual(shouldSuppressGenericPortFailure(-1), true);
assert.strictEqual(shouldRetryKernelPort(21, false, 0, 5), true);
assert.strictEqual(shouldRetryKernelPort(21, false, 4, 5), true);
assert.strictEqual(shouldRetryKernelPort(21, false, 5, 5), false);
assert.strictEqual(shouldRetryKernelPort(21, true, 0, 5), false);
assert.strictEqual(shouldRetryKernelPort(25, false, 0, 5), false);

const mainPath = path.resolve(__dirname, "../electron/main.js");
const mainText = fs.readFileSync(mainPath, "utf8");
assert.match(mainText, /kernelStartupExitCode/);
assert.match(mainText, /shouldSuppressGenericPortFailure\(kernelStartupExitCode\)/);
assert.match(mainText, /shouldRetryKernelPort\(kernelStartupExitCode/);
assert.match(mainText, /retry kernel startup with another port/);
assert.match(mainText, /suppress generic port error/);

console.log("Electron startup failure regression passed.");
