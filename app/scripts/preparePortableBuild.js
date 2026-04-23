"use strict";

const fs = require("fs");
const path = require("path");

const pnpmNodeModulesRoot = path.resolve(__dirname, "..", "node_modules", ".pnpm", "node_modules");

if (!fs.existsSync(pnpmNodeModulesRoot)) {
  console.log(`pnpm hoisted node_modules directory not found, skip cleanup: ${pnpmNodeModulesRoot}`);
  process.exit(0);
}

const removed = [];

function removeBrokenLink(fullPath) {
  try {
    fs.rmdirSync(fullPath);
  } catch (err) {
    if (["ENOTDIR", "EINVAL"].includes(err.code)) {
      fs.unlinkSync(fullPath);
      return;
    }
    throw err;
  }
}

function scanBrokenLinks(dir, depth = 0) {
  for (const name of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, name);
    let stats;
    try {
      stats = fs.lstatSync(fullPath);
    } catch (err) {
      continue;
    }

    if (stats.isSymbolicLink()) {
      if (!fs.existsSync(fullPath)) {
        removeBrokenLink(fullPath);
        removed.push(path.relative(pnpmNodeModulesRoot, fullPath));
      }
      continue;
    }

    if (stats.isDirectory() && depth < 1) {
      scanBrokenLinks(fullPath, depth + 1);
    }
  }
}

scanBrokenLinks(pnpmNodeModulesRoot);

if (removed.length === 0) {
  console.log("No broken pnpm hoisted package links found.");
  process.exit(0);
}

console.log(`Removed ${removed.length} broken pnpm hoisted package link(s): ${removed.join(", ")}`);
