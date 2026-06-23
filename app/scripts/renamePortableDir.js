"use strict";

const fs = require("fs");
const path = require("path");

const buildDir = path.resolve(__dirname, "..", "build");
const sourceDir = path.join(buildDir, "win-unpacked");
const targetDir = path.join(buildDir, "sourceflow-portable");
const portableMarkerName = ".sf-portable";

function isLockError(err) {
  return err && ["EPERM", "EBUSY", "EACCES"].includes(err.code);
}

function makeFallbackTarget(dir) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  let candidate = path.join(buildDir, `sourceflow-portable-${stamp}`);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(buildDir, `sourceflow-portable-${stamp}-${index}`);
    index += 1;
  }
  return candidate;
}

function tryRemoveTarget(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    return null;
  } catch (err) {
    if (isLockError(err)) {
      return makeFallbackTarget(dir);
    }
    throw err;
  }
}

if (!fs.existsSync(sourceDir)) {
  if (fs.existsSync(targetDir)) {
    console.log(`Portable directory already available: ${targetDir}`);
    process.exit(0);
  }
  console.error(`Portable source directory not found: ${sourceDir}`);
  process.exit(1);
}

let finalTargetDir = targetDir;
if (fs.existsSync(targetDir)) {
  const fallbackTargetDir = tryRemoveTarget(targetDir);
  if (fallbackTargetDir) {
    finalTargetDir = fallbackTargetDir;
    console.warn(`Portable directory is in use, keeping existing output and writing new build to: ${finalTargetDir}`);
  }
}

try {
  fs.renameSync(sourceDir, finalTargetDir);
} catch (err) {
  if (finalTargetDir === targetDir && isLockError(err)) {
    finalTargetDir = makeFallbackTarget(targetDir);
    console.warn(`Default portable directory became unavailable, writing new build to: ${finalTargetDir}`);
    fs.renameSync(sourceDir, finalTargetDir);
  } else {
    throw err;
  }
}

fs.writeFileSync(path.join(finalTargetDir, portableMarkerName), "portable\n");

console.log(`Portable directory ready: ${finalTargetDir}`);
