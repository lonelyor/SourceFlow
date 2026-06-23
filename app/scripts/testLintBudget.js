const {spawnSync} = require("child_process");
const path = require("path");

const appRoot = path.join(__dirname, "..");
const lintWarningBudget = 3904;

const eslintRoot = path.dirname(require.resolve("eslint/package.json", {paths: [appRoot]}));
const eslintCli = path.join(eslintRoot, "bin", "eslint.js");
const result = spawnSync(process.execPath, [eslintCli, ".", "--cache", "--format", "json"], {
    cwd: appRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
});

if (result.error) {
    throw result.error;
}

let reports;
try {
    reports = JSON.parse(result.stdout || "[]");
} catch (error) {
    console.error(result.stdout);
    console.error(result.stderr);
    throw new Error(`failed to parse eslint JSON output: ${error.message}`);
}

const totals = reports.reduce((sum, item) => ({
    errors: sum.errors + (item.errorCount || 0),
    warnings: sum.warnings + (item.warningCount || 0),
}), {errors: 0, warnings: 0});

if (result.status !== 0 || totals.errors > 0) {
    console.error(result.stderr || "");
    throw new Error(`eslint errors must be 0, got ${totals.errors}`);
}

if (totals.warnings > lintWarningBudget) {
    throw new Error(`eslint warnings exceeded budget: ${totals.warnings} > ${lintWarningBudget}`);
}

console.log(`[lint-budget] ok (${totals.errors} errors, ${totals.warnings}/${lintWarningBudget} warnings)`);
