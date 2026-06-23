const fs = require("fs");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");

const findings = [];

const addFinding = (filePath, message, pattern = "") => {
    const text = fs.readFileSync(filePath, "utf8");
    const index = pattern ? text.indexOf(pattern) : 0;
    const before = text.slice(0, Math.max(0, index));
    const line = before.split(/\r?\n/).length;
    findings.push({
        filePath,
        line,
        message,
    });
};

const toRepoPath = (filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/");

const transactionPath = path.join(appRoot, "src", "protyle", "wysiwyg", "transaction.ts");
const transactionText = fs.readFileSync(transactionPath, "utf8");
const transactionLines = transactionText.split(/\r?\n/).length;

if (transactionLines > 12) {
    addFinding(transactionPath, "transaction.ts must stay a thin compatibility barrel");
}

const requiredBarrelFragments = [
    'export {onTransaction} from "./transaction/operations";',
    'export {turnsIntoOneTransaction, turnsIntoTransaction, turnsOneInto} from "./transaction/transforms";',
    'export {transaction, updateBatchTransaction, updateTransaction} from "./transaction/runtime";',
];

for (const fragment of requiredBarrelFragments) {
    if (!transactionText.includes(fragment)) {
        addFinding(transactionPath, `transaction.ts is missing required re-export (${fragment})`, fragment);
    }
}

const bannedBarrelFragments = [
    "const removeTopElement =",
    "const promiseTransaction =",
    "export const onTransaction =",
    "export const turnsIntoOneTransaction =",
    "let transactionsTimeout: number;",
];

for (const fragment of bannedBarrelFragments) {
    if (transactionText.includes(fragment)) {
        addFinding(transactionPath, `transaction.ts must not inline extracted logic (${fragment})`, fragment);
    }
}

const requiredModules = [
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const updateEmbed ="],
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const deleteBlock ="],
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const updateBlock ="],
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const removeUnfoldRepeatBlock ="],
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const transaction ="],
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const updateTransaction ="],
    ["src/protyle/wysiwyg/transaction/runtime.ts", "export const updateBatchTransaction ="],
    ["src/protyle/wysiwyg/transaction/operations.ts", "import {deleteBlock, removeTopElement, removeUnfoldRepeatBlock, updateBlock, updateEmbed} from \"./runtime\";"],
    ["src/protyle/wysiwyg/transaction/operations.ts", "export const onTransaction ="],
    ["src/protyle/wysiwyg/transaction/transforms.ts", "import {transaction, updateTransaction} from \"./runtime\";"],
    ["src/protyle/wysiwyg/transaction/transforms.ts", "export const turnsIntoOneTransaction ="],
    ["src/protyle/wysiwyg/transaction/transforms.ts", "export const turnsIntoTransaction ="],
    ["src/protyle/wysiwyg/transaction/transforms.ts", "export const turnsOneInto ="],
];

for (const [relativePath, fragment] of requiredModules) {
    const filePath = path.join(appRoot, relativePath);
    if (!fs.existsSync(filePath)) {
        findings.push({
            filePath,
            line: 1,
            message: `${relativePath} is required for transaction modularity`,
        });
        continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    if (!text.includes(fragment)) {
        addFinding(filePath, `${relativePath} is missing the expected fragment`, fragment);
    }
}

if (findings.length === 0) {
    console.log("[transaction-modularity] ok");
    process.exit(0);
}

console.error(`[transaction-modularity] found ${findings.length} issue(s):`);
for (const finding of findings) {
    console.error(`${toRepoPath(finding.filePath)}:${finding.line} ${finding.message}`);
}
process.exit(1);
