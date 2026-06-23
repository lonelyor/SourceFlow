"use strict";

const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");

const APP_DIR = path.resolve(__dirname, "..");
const WANTED_LANGUAGES = ["en_US", "zh_CN"];
const MAX_VALIDATION_ISSUES = 50;

const COMMON_RUNTIME_ITEMS = [
  { from: "changelogs", to: "changelogs", filter: allowAll },
  { from: "stage", to: "stage", filter: allowAll },
  { from: "guide", to: "guide", filter: excludeBaseNames([".DS_Store", ".git", ".gitignore", ".idea"]) },
  { from: "appearance/boot", to: "appearance/boot", filter: excludeBaseNames([".DS_Store"]) },
  { from: "appearance/icons", to: "appearance/icons", filter: excludeBaseNames([".DS_Store"]) },
  { from: "appearance/langs", to: "appearance/langs", filter: excludeBaseNames([".DS_Store"]) },
  { from: "appearance/emojis", to: "appearance/emojis", filter: excludeBaseNames([".DS_Store"]) },
  { from: "appearance/themes/midnight", to: "appearance/themes/midnight", filter: excludeBaseNames([".DS_Store", "custom.css"]) },
  { from: "appearance/themes/daylight", to: "appearance/themes/daylight", filter: excludeBaseNames([".DS_Store", "custom.css"]) },
  { from: "appearance/fonts", to: "appearance/fonts", filter: excludeBaseNames([".DS_Store"]) },
  { from: "pandoc/pandoc-resources", to: "pandoc-resources", filter: excludeBaseNames([".DS_Store"]) },
];

const PLATFORM_RUNTIME_ITEMS = {
  win32: {
    x64: [
      { from: "kernel", to: "kernel", filter: allowAll },
      { from: "pandoc/pandoc-windows-amd64.zip", to: "pandoc.zip", filter: allowAll },
    ],
  },
  linux: {
    x64: [
      { from: "kernel-linux", to: "kernel", filter: allowAll },
      { from: "pandoc/pandoc-linux-amd64.zip", to: "pandoc.zip", filter: allowAll },
    ],
    arm64: [
      { from: "kernel-linux-arm64", to: "kernel", filter: allowAll },
      { from: "pandoc/pandoc-linux-arm64.zip", to: "pandoc.zip", filter: allowAll },
    ],
  },
  darwin: {
    x64: [
      { from: "kernel-darwin", to: "kernel", filter: allowAll },
      { from: "pandoc/pandoc-darwin-amd64.zip", to: "pandoc.zip", filter: allowAll },
    ],
    arm64: [
      { from: "kernel-darwin-arm64", to: "kernel", filter: allowAll },
      { from: "pandoc/pandoc-darwin-arm64.zip", to: "pandoc.zip", filter: allowAll },
    ],
  },
};

module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const resourcesDir = resolveResourcesDir(appOutDir, electronPlatformName, packager && packager.appInfo && packager.appInfo.productFilename);
  const portableBuild = process.env.SOURCEFLOW_PORTABLE_BUILD === "1";
  const targetArch = normalizeArch(process.env.SOURCEFLOW_TARGET_ARCH);

  await removeLanguagePacks(appOutDir, packager, electronPlatformName);
  if (portableBuild && !targetArch) {
    throw new Error("Portable build target arch is missing. Expected SOURCEFLOW_TARGET_ARCH to be set.");
  }

  const shouldRepairRuntime = portableBuild || !(await hasCriticalRuntimeSkeleton(resourcesDir, electronPlatformName, targetArch));
  if (!shouldRepairRuntime) {
    return;
  }

  await syncRuntimeItems(resourcesDir, COMMON_RUNTIME_ITEMS);

  if (targetArch) {
    const platformItems = getPlatformRuntimeItems(electronPlatformName, targetArch);
    await syncRuntimeItems(resourcesDir, platformItems);
    await validateRuntimeItems(resourcesDir, platformItems);
  }

  await validateRuntimeItems(resourcesDir, COMMON_RUNTIME_ITEMS);
  await validateCriticalRuntime(resourcesDir, electronPlatformName, targetArch);
};

async function removeLanguagePacks(appOutDir, packager, platform) {
  const keepPrefixes = new Set(WANTED_LANGUAGES.map((lang) => lang.slice(0, 2)));

  let resourcePath;
  let fileExtension;
  let isDirectory = false;

  if (platform === "darwin") {
    const appName = packager && packager.appInfo ? packager.appInfo.productFilename : "SourceFlow";
    resourcePath = path.join(
      appOutDir,
      `${appName}.app`,
      "Contents",
      "Frameworks",
      "Electron Framework.framework",
      "Versions",
      "A",
      "Resources"
    );
    if (!fs.existsSync(resourcePath) && appOutDir.endsWith(".app")) {
      resourcePath = path.join(
        appOutDir,
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
        "Versions",
        "A",
        "Resources"
      );
    }
    fileExtension = ".lproj";
    isDirectory = true;
  } else if (platform === "win32" || platform === "linux") {
    resourcePath = path.join(appOutDir, "locales");
    fileExtension = ".pak";
  } else {
    return;
  }

  if (!(await exists(resourcePath))) {
    return;
  }

  try {
    const entries = await fsPromises.readdir(resourcePath);
    const targetEntries = entries.filter((entry) => entry.endsWith(fileExtension));

    if (targetEntries.length === 0) {
      return;
    }

    let deletedCount = 0;
    let deletedSize = 0;
    await Promise.all(entries.map(async (entry) => {
      if (!entry.endsWith(fileExtension)) {
        return;
      }

      const languageName = entry.slice(0, -fileExtension.length);
      if (keepPrefixes.has(languageName.slice(0, 2))) {
        return;
      }

      const entryPath = path.join(resourcePath, entry);
      const stats = await fsPromises.stat(entryPath);
      const size = isDirectory ? await getDirectorySize(entryPath) : stats.size;

      await fsPromises.rm(entryPath, { force: true, recursive: isDirectory });
      deletedCount += 1;
      deletedSize += size;
    }));

    if (deletedCount > 0) {
      console.log(`Removed ${deletedCount}/${targetEntries.length} language packs, saved ${formatBytes(deletedSize)}`);
    }
  } catch (error) {
    console.error("Failed to remove language packs:", error.message);
  }
}

async function syncRuntimeItems(resourcesDir, items) {
  for (const item of items) {
    const sourcePath = path.join(APP_DIR, item.from);
    const targetPath = path.join(resourcesDir, item.to);
    await ensureSourceExists(sourcePath);
    await copyPath(sourcePath, targetPath, item.filter);
  }
}

async function validateRuntimeItems(resourcesDir, items) {
  const issues = [];

  for (const item of items) {
    const sourcePath = path.join(APP_DIR, item.from);
    const targetPath = path.join(resourcesDir, item.to);
    await comparePath(sourcePath, targetPath, item.filter, "", issues);
    if (issues.length >= MAX_VALIDATION_ISSUES) {
      break;
    }
  }

  if (issues.length > 0) {
    throw new Error(`Portable runtime resource validation failed:\n${issues.join("\n")}`);
  }
}

async function validateCriticalRuntime(resourcesDir, platform, targetArch) {
  const requiredPaths = [
    "stage/build/app/index.html",
    "appearance/langs/en_US.json",
    "appearance/langs/zh_CN.json",
    "pandoc-resources/pandoc-template.docx",
    "pandoc-resources/pandoc_color_filter.lua",
  ];

  if (targetArch) {
    requiredPaths.push("pandoc.zip");
    requiredPaths.push(path.join("kernel", getKernelBinaryName(platform)));
  }

  const missingPaths = [];
  for (const relativePath of requiredPaths) {
    if (!(await exists(path.join(resourcesDir, relativePath)))) {
      missingPaths.push(relativePath);
    }
  }

  if (missingPaths.length > 0) {
    throw new Error(`Portable runtime is incomplete, missing: ${missingPaths.join(", ")}`);
  }

  if (targetArch && platform !== "win32") {
    const kernelPath = path.join(resourcesDir, "kernel", getKernelBinaryName(platform));
    const kernelStats = await fsPromises.stat(kernelPath);
    if ((kernelStats.mode & 0o111) === 0) {
      throw new Error(`Portable runtime kernel is not executable: ${path.relative(resourcesDir, kernelPath)}`);
    }
  }
}

async function hasCriticalRuntimeSkeleton(resourcesDir, platform, targetArch) {
  try {
    await validateCriticalRuntime(resourcesDir, platform, targetArch);
    return true;
  } catch (error) {
    return false;
  }
}

function getPlatformRuntimeItems(platform, targetArch) {
  const platformItems = PLATFORM_RUNTIME_ITEMS[platform];
  if (!platformItems) {
    throw new Error(`Unsupported portable runtime platform: ${platform}`);
  }

  const items = platformItems[targetArch];
  if (!items) {
    throw new Error(`Unsupported portable runtime target: ${platform}/${targetArch}`);
  }

  return items;
}

function resolveResourcesDir(appOutDir, platform, productFilename) {
  if (platform === "darwin") {
    const candidates = [];
    if (appOutDir.endsWith(".app")) {
      candidates.push(path.join(appOutDir, "Contents", "Resources"));
    }
    if (productFilename) {
      candidates.push(path.join(appOutDir, `${productFilename}.app`, "Contents", "Resources"));
    }
    candidates.push(path.join(appOutDir, "Contents", "Resources"));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return candidates[0];
  }

  return path.join(appOutDir, "resources");
}

function getKernelBinaryName(platform) {
  return platform === "win32" ? "SourceFlow-Kernel.exe" : "SourceFlow-Kernel";
}

function normalizeArch(value) {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (!normalized) {
    return "";
  }
  if (normalized === "x64" || normalized === "amd64") {
    return "x64";
  }
  if (normalized === "arm64" || normalized === "aarch64") {
    return "arm64";
  }
  return "";
}

async function copyPath(sourcePath, targetPath, filter, relativePath = "") {
  const stats = await fsPromises.stat(sourcePath);
  if (stats.isDirectory()) {
    await fsPromises.mkdir(targetPath, { recursive: true });
    await fsPromises.chmod(targetPath, stats.mode);
    const entries = await fsPromises.readdir(sourcePath, { withFileTypes: true });

    for (const entry of entries) {
      const childRelativePath = joinRelative(relativePath, entry.name);
      if (!filter(childRelativePath, entry)) {
        continue;
      }

      await copyPath(path.join(sourcePath, entry.name), path.join(targetPath, entry.name), filter, childRelativePath);
    }
    return;
  }

  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
  await fsPromises.copyFile(sourcePath, targetPath);
  await fsPromises.chmod(targetPath, stats.mode);
}

async function comparePath(sourcePath, targetPath, filter, relativePath, issues) {
  if (issues.length >= MAX_VALIDATION_ISSUES) {
    return;
  }

  const sourceStats = await fsPromises.stat(sourcePath);

  if (sourceStats.isDirectory()) {
    if (!(await exists(targetPath))) {
      issues.push(`missing directory: ${relativePath || "."}`);
      return;
    }

    const targetStats = await fsPromises.stat(targetPath);
    if (!targetStats.isDirectory()) {
      issues.push(`expected directory: ${relativePath || "."}`);
      return;
    }

    const entries = await fsPromises.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      const childRelativePath = joinRelative(relativePath, entry.name);
      if (!filter(childRelativePath, entry)) {
        continue;
      }

      await comparePath(path.join(sourcePath, entry.name), path.join(targetPath, entry.name), filter, childRelativePath, issues);
      if (issues.length >= MAX_VALIDATION_ISSUES) {
        return;
      }
    }
    return;
  }

  if (!(await exists(targetPath))) {
    issues.push(`missing file: ${relativePath}`);
    return;
  }

  const targetStats = await fsPromises.stat(targetPath);
  if (!targetStats.isFile()) {
    issues.push(`expected file: ${relativePath}`);
    return;
  }

  if (sourceStats.size !== targetStats.size) {
    issues.push(`size mismatch: ${relativePath} (${sourceStats.size} != ${targetStats.size})`);
  }
}

async function ensureSourceExists(targetPath) {
  if (!(await exists(targetPath))) {
    throw new Error(`Portable runtime source is missing: ${targetPath}`);
  }
}

async function getDirectorySize(dirPath) {
  let totalSize = 0;
  const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += await getDirectorySize(entryPath);
      continue;
    }

    const stats = await fsPromises.stat(entryPath);
    totalSize += stats.size;
  }

  return totalSize;
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, unitIndex);
  return `${size % 1 === 0 ? size.toString() : size.toFixed(1)} ${units[unitIndex]}`;
}

function allowAll() {
  return true;
}

function excludeBaseNames(baseNames) {
  const excluded = new Set(baseNames);
  return (relativePath) => !excluded.has(path.posix.basename(relativePath));
}

function joinRelative(parent, name) {
  return parent ? `${parent}/${name}` : name;
}

async function exists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}
