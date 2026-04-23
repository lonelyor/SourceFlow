"use strict";

const fs = require("fs");
const fsPromises = fs.promises;
const path = require("path");
const { constants: fsConstants } = fs;
const DEFAULT_TARGET_WORKSPACE_NAME = "sourceflow-Notes";

const TEMP_ARTIFACT_PATTERNS = [
  /^siyuan\.db(?:-.*)?$/i,
  /^siyuan\.log$/i,
  /^sourceflow\.db(?:-.*)?$/i,
  /^sourceflow\.log$/i,
  /^history\.db(?:-.*)?$/i,
  /^asset_content\.db(?:-.*)?$/i,
  /^blocktree\.db(?:-.*)?$/i,
];
const MIGRATION_CONF_BACKUP_FILE = "conf.sourceflow-migrated-original.json";

async function pathExists(targetPath) {
  try {
    await fsPromises.access(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

function isPermissionError(error) {
  return ["EPERM", "EACCES", "EROFS"].includes(error?.code);
}

function isFilesystemRoot(targetPath) {
  const resolvedPath = path.resolve(targetPath);
  return resolvedPath === path.parse(resolvedPath).root;
}

async function statIfExists(targetPath) {
  try {
    return await fsPromises.stat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function resolveExistingPath(targetPath) {
  const resolved = await fsPromises.realpath(targetPath);
  return path.resolve(resolved);
}

function resolveAnyPath(targetPath) {
  return path.resolve(targetPath);
}

function getDefaultTargetWorkspace(sourceWorkspace) {
  return path.join(path.dirname(sourceWorkspace), DEFAULT_TARGET_WORKSPACE_NAME);
}

function resolveTargetWorkspacePath(sourceWorkspace, targetWorkspaceInput) {
  const rawTarget = `${targetWorkspaceInput || ""}`.trim();
  if (!rawTarget) {
    return getDefaultTargetWorkspace(sourceWorkspace);
  }
  if (path.isAbsolute(rawTarget)) {
    return path.resolve(rawTarget);
  }
  return path.resolve(path.dirname(sourceWorkspace), rawTarget);
}

async function isValidWorkspace(workspacePath) {
  return await isDirectory(path.join(workspacePath, "data")) && await isDirectory(path.join(workspacePath, "conf"));
}

async function isDirectory(targetPath) {
  try {
    return (await fsPromises.stat(targetPath)).isDirectory();
  } catch (error) {
    return false;
  }
}

async function assertReadablePath(targetPath, description) {
  try {
    await fsPromises.access(targetPath, fsConstants.R_OK);
  } catch (error) {
    throw new Error(`${description} is not readable: ${targetPath}`);
  }
}

async function assertTargetParentChain(targetPath) {
  let currentPath = path.resolve(path.dirname(targetPath));
  while (true) {
    const stats = await statIfExists(currentPath);
    if (stats) {
      if (!stats.isDirectory()) {
        throw new Error(`The target workspace parent path is not a directory: ${currentPath}`);
      }
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }
}

async function findNearestExistingDir(targetPath) {
  let currentPath = path.resolve(targetPath);
  while (true) {
    if (await isDirectory(currentPath)) {
      return currentPath;
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return currentPath;
    }
    currentPath = parentPath;
  }
}

async function assertWritableTargetParent(targetPath) {
  await assertTargetParentChain(targetPath);
  const targetParent = path.dirname(path.resolve(targetPath));
  const probeRoot = await findNearestExistingDir(targetParent);
  try {
    await fsPromises.access(probeRoot, fsConstants.W_OK);
  } catch (error) {
    throw new Error(`The target parent path is not writable: ${probeRoot}`);
  }

  const probePath = path.join(probeRoot, `.sourceflow-migration-write-test-${process.pid}-${Date.now()}`);
  try {
    await fsPromises.mkdir(probePath, { recursive: false });
    await fsPromises.rm(probePath, { recursive: true, force: true });
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(`The target parent path does not allow creating folders: ${probeRoot}`);
    }
    throw error;
  }
}

async function safeMkdir(targetPath, options = {}, errorPrefix = "Failed to create directory") {
  const resolvedPath = path.resolve(targetPath);
  if (isFilesystemRoot(resolvedPath)) {
    return;
  }
  const stats = await statIfExists(resolvedPath);
  if (stats?.isDirectory()) {
    return;
  }
  if (stats) {
    throw new Error(`${errorPrefix}: path already exists and is not a directory: ${resolvedPath}`);
  }
  try {
    await fsPromises.mkdir(resolvedPath, options);
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error(`${errorPrefix}: ${resolvedPath}`);
    }
    throw error;
  }
}

async function assertCreatableTargetWorkspace(targetPath) {
  const resolvedTarget = path.resolve(targetPath);
  if (isFilesystemRoot(resolvedTarget)) {
    throw new Error(`The target workspace cannot be a filesystem root path: ${resolvedTarget}`);
  }
  await assertTargetParentChain(resolvedTarget);
}

async function countDocFiles(rootDir, extension) {
  const normalizedExt = `${extension || ""}`.toLowerCase();
  let count = 0;
  const stack = [rootDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(normalizedExt)) {
        count += 1;
      }
    }
  }
  return count;
}

async function collectLegacyHiddenDirs(dataDir) {
  if (!(await isDirectory(dataDir))) {
    return [];
  }

  const result = [];
  const stack = [dataDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.name === ".siyuan") {
        result.push(fullPath);
        continue;
      }
      stack.push(fullPath);
    }
  }

  return result.sort((left, right) => right.length - left.length);
}

async function collectSourceFlowHiddenDirs(dataDir) {
  if (!(await isDirectory(dataDir))) {
    return [];
  }

  const result = [];
  const stack = [dataDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.name === ".sourceflow") {
        result.push(fullPath);
        continue;
      }
      stack.push(fullPath);
    }
  }

  return result;
}

async function getWorkspaceSizeBytes(workspacePath) {
  let total = 0n;
  const stack = [workspacePath];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stats = await fsPromises.stat(fullPath);
      total += BigInt(stats.size);
    }
  }
  return total;
}

async function assertSufficientFreeSpace(targetPath, requiredBytes) {
  const rootPath = path.parse(path.resolve(targetPath)).root;
  if (!rootPath) {
    return;
  }

  const stat = await fsPromises.statfs(rootPath);
  const freeBytes = BigInt(stat.bavail ?? stat.bfree ?? 0) * BigInt(stat.bsize ?? 4096);
  const safetyMargin = 256n * 1024n * 1024n;
  if (freeBytes < requiredBytes + safetyMargin) {
    throw new Error(`Not enough free space for safe migration. Required at least ${requiredBytes + safetyMargin} bytes on drive ${rootPath}, available ${freeBytes} bytes.`);
  }
}

async function copyDirectoryTree(sourceDir, targetDir) {
  try {
    await fsPromises.cp(sourceDir, targetDir, {
      recursive: true,
      preserveTimestamps: false,
      force: true,
      errorOnExist: false,
    });
  } catch (error) {
    if (!isPermissionError(error)) {
      throw error;
    }
    throw new Error(`Failed to copy workspace contents due to insufficient file permissions: ${sourceDir}`);
  }
}

async function movePath(sourcePath, targetPath) {
  try {
    await fsPromises.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (!["EXDEV", "EPERM", "EACCES"].includes(error.code)) {
      throw error;
    }
  }

  const stats = await fsPromises.stat(sourcePath);
  if (stats.isDirectory()) {
    await copyDirectoryTree(sourcePath, targetPath);
    await fsPromises.rm(sourcePath, { recursive: true, force: true });
    return;
  }

  await safeMkdir(path.dirname(targetPath), { recursive: true }, "Failed to create target parent directory");
  await fsPromises.copyFile(sourcePath, targetPath);
  await fsPromises.rm(sourcePath, { force: true });
}

async function mergeDirectory(sourceDir, targetDir) {
  await safeMkdir(targetDir, { recursive: true }, "Failed to create migrated hidden workspace directory");
  const entries = await fsPromises.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await mergeDirectory(sourcePath, targetPath);
      continue;
    }

    await fsPromises.rm(targetPath, { recursive: true, force: true });
    await movePath(sourcePath, targetPath);
  }
  await fsPromises.rm(sourceDir, { recursive: true, force: true });
}

async function migrateHiddenDataDirs(dataDir) {
  const legacyDirs = await collectLegacyHiddenDirs(dataDir);
  const migrated = [];
  for (const dir of legacyDirs) {
    const targetDir = path.join(path.dirname(dir), ".sourceflow");
    await mergeDirectory(dir, targetDir);
    migrated.push(`${dir} -> ${targetDir}`);
  }
  return migrated;
}

async function renameLegacyDocFilesToSf(dataDir) {
  if (!(await isDirectory(dataDir))) {
    return [];
  }

  const renamed = [];
  const stack = [dataDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".sy")) {
        continue;
      }

      const targetPath = path.join(currentDir, `${entry.name.slice(0, -3)}.sf`);
      if (await pathExists(targetPath)) {
        throw new Error(`Refusing to overwrite an existing .sf document during migration: ${targetPath}`);
      }
      await movePath(fullPath, targetPath);
      renamed.push(`${fullPath} -> ${targetPath}`);
    }
  }

  return renamed;
}

async function removeWorkspaceTempArtifacts(tempDir) {
  const removed = [];
  if (!(await isDirectory(tempDir))) {
    return removed;
  }

  const entries = await fsPromises.readdir(tempDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!TEMP_ARTIFACT_PATTERNS.some((pattern) => pattern.test(entry.name))) {
      continue;
    }
    const fullPath = path.join(tempDir, entry.name);
    await fsPromises.rm(fullPath, { recursive: true, force: true });
    removed.push(fullPath);
  }

  return removed;
}

async function validateMigrationResult(sourcePath, targetPath, expectedLegacyDirCount) {
  if (!(await isValidWorkspace(targetPath))) {
    throw new Error(`Migration failed because the target workspace structure is incomplete: ${targetPath}`);
  }

  const remainingLegacyDirs = await collectLegacyHiddenDirs(path.join(targetPath, "data"));
  if (remainingLegacyDirs.length > 0) {
    throw new Error("Migration failed because the target workspace still contains legacy hidden workspace directories.");
  }

  const sourceDocCount = await countDocFiles(path.join(sourcePath, "data"), ".sy");
  const targetDocCount = await countDocFiles(path.join(targetPath, "data"), ".sf");
  if (sourceDocCount !== targetDocCount) {
    throw new Error(`Migration failed because the .sf document count does not match. Source legacy docs: ${sourceDocCount}. Target docs: ${targetDocCount}.`);
  }

  const sourceFlowDirs = await collectSourceFlowHiddenDirs(path.join(targetPath, "data"));
  if (expectedLegacyDirCount > 0 && sourceFlowDirs.length < expectedLegacyDirCount) {
    throw new Error("Migration failed because not all hidden workspace directories were migrated to .sourceflow.");
  }
}

async function writeMigrationReport(targetPath, sourcePath, migratedDirs, renamedDocFiles, removedTempArtifacts, sanitizedActions = []) {
  const lines = [
    "SourceFlow Workspace Migration Report",
    `GeneratedAt: ${new Date().toISOString()}`,
    `SourceWorkspace: ${sourcePath}`,
    `TargetWorkspace: ${targetPath}`,
    "SourceWorkspaceModified: no",
    `MigratedHiddenDirs: ${migratedDirs.length}`,
    ...migratedDirs.map((item) => `  ${item}`),
    `RenamedDocFiles: ${renamedDocFiles.length}`,
    ...renamedDocFiles.map((item) => `  ${item}`),
    `RemovedTargetTempArtifacts: ${removedTempArtifacts.length}`,
    ...removedTempArtifacts.map((item) => `  ${item}`),
    `SanitizedActions: ${sanitizedActions.length}`,
    ...sanitizedActions.map((item) => `  ${item}`),
  ];

  await fsPromises.writeFile(path.join(targetPath, "SourceFlow-Migration-Report.txt"), `${lines.join("\n")}\n`, "utf8");
}

function isPlainObject(value) {
  return !!value && "object" === typeof value && !Array.isArray(value);
}

function normalizeBoolean(value, fallback) {
  return "boolean" === typeof value ? value : fallback;
}

function normalizeInteger(value, fallback) {
  const normalized = Number.parseInt(`${value ?? ""}`, 10);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function collapseSpaces(value) {
  return `${value || ""}`.replace(/\s{2,}/g, " ").trim();
}

function isPathInsideBase(basePath, candidatePath) {
  if (!basePath || !candidatePath) {
    return false;
  }
  const resolvedBase = path.resolve(basePath);
  const resolvedCandidate = path.resolve(candidatePath);
  return resolvedCandidate === resolvedBase || resolvedCandidate.startsWith(`${resolvedBase}${path.sep}`);
}

async function stripMissingPandocPathArg(params, flagName) {
  let nextParams = `${params || ""}`;
  const escapedFlag = flagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|\\s)${escapedFlag}\\s+(?:"([^"]+)"|'([^']+)'|(\\S+))`, "gi");
  const matches = Array.from(nextParams.matchAll(pattern));
  for (const match of matches.reverse()) {
    const candidatePath = `${match[2] || match[3] || match[4] || ""}`.trim();
    if (!candidatePath || !path.isAbsolute(candidatePath)) {
      continue;
    }
    if (await pathExists(candidatePath)) {
      continue;
    }
    nextParams = `${nextParams.slice(0, match.index)} ${nextParams.slice(match.index + match[0].length)}`;
  }
  return collapseSpaces(nextParams);
}

async function sanitizeMigratedWorkspaceConfig(workspacePath, sourcePath) {
  const confPath = path.join(workspacePath, "conf", "conf.json");
  if (!(await pathExists(confPath))) {
    return [];
  }

  const raw = await fsPromises.readFile(confPath, "utf8");
  let conf;
  try {
    conf = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse migrated workspace config: ${confPath}`);
  }

  await fsPromises.writeFile(path.join(workspacePath, "conf", MIGRATION_CONF_BACKUP_FILE), raw, "utf8");
  const actions = [`Backed up the original migrated config to conf/${MIGRATION_CONF_BACKUP_FILE}`];

  const sync = isPlainObject(conf.sync) ? conf.sync : {};
  const nextSync = {
    ...sync,
    cloudName: "main",
    enabled: false,
    perception: false,
    mode: 1,
    interval: Math.max(30, normalizeInteger(sync.interval, 30)),
    synced: 0,
    stat: "",
    generateConflictDoc: normalizeBoolean(sync.generateConflictDoc, true),
    provider: 4,
    s3: {
      ...(isPlainObject(sync.s3) ? sync.s3 : {}),
      endpoint: "",
      accessKey: "",
      secretKey: "",
      bucket: "",
      region: "",
      pathStyle: normalizeBoolean(sync?.s3?.pathStyle, true),
      skipTlsVerify: normalizeBoolean(sync?.s3?.skipTlsVerify, true),
      timeout: Math.max(1, normalizeInteger(sync?.s3?.timeout, 30)),
      concurrentReqs: Math.max(1, normalizeInteger(sync?.s3?.concurrentReqs, 4)),
    },
    webdav: {
      ...(isPlainObject(sync.webdav) ? sync.webdav : {}),
      endpoint: "",
      username: "",
      password: "",
      skipTlsVerify: normalizeBoolean(sync?.webdav?.skipTlsVerify, true),
      timeout: Math.max(1, normalizeInteger(sync?.webdav?.timeout, 30)),
      concurrentReqs: Math.max(1, normalizeInteger(sync?.webdav?.concurrentReqs, 4)),
    },
    local: {
      ...(isPlainObject(sync.local) ? sync.local : {}),
      endpoint: "",
      timeout: Math.max(1, normalizeInteger(sync?.local?.timeout, 30)),
      concurrentReqs: Math.max(1, normalizeInteger(sync?.local?.concurrentReqs, 4)),
    },
  };
  conf.sync = nextSync;
  actions.push("Disabled migrated sync settings and cleared legacy sync endpoints and credentials for safety");

  const exportConf = isPlainObject(conf.export) ? { ...conf.export } : null;
  if (exportConf) {
    let exportChanged = false;
    const pandocBin = `${exportConf.pandocBin || ""}`.trim();
    if (pandocBin && path.isAbsolute(pandocBin) && (!(await pathExists(pandocBin)) || isPathInsideBase(sourcePath, pandocBin))) {
      exportConf.pandocBin = "";
      exportChanged = true;
    }

    const docxTemplate = `${exportConf.docxTemplate || ""}`.trim();
    if (docxTemplate && path.isAbsolute(docxTemplate) && (!(await pathExists(docxTemplate)) || isPathInsideBase(sourcePath, docxTemplate))) {
      exportConf.docxTemplate = "";
      exportChanged = true;
    }

    const originalPandocParams = `${exportConf.pandocParams || ""}`;
    let sanitizedPandocParams = await stripMissingPandocPathArg(originalPandocParams, "--reference-doc");
    sanitizedPandocParams = await stripMissingPandocPathArg(sanitizedPandocParams, "--lua-filter");
    if (sanitizedPandocParams !== originalPandocParams) {
      exportConf.pandocParams = sanitizedPandocParams;
      exportChanged = true;
    }

    if (exportChanged) {
      conf.export = exportConf;
      actions.push("Cleared migrated export paths that no longer exist on this device");
    }
  }

  await fsPromises.writeFile(confPath, `${JSON.stringify(conf, null, 2)}\n`, "utf8");
  return actions;
}

async function migrateWorkspace(options) {
  const sourceWorkspaceInput = `${options?.sourceWorkspace || ""}`.trim();
  if (!sourceWorkspaceInput) {
    throw new Error("Source workspace is required.");
  }

  const sourcePath = await resolveExistingPath(sourceWorkspaceInput);
  if (!(await isValidWorkspace(sourcePath))) {
    throw new Error(`The selected source path is not a valid legacy workspace: ${sourcePath}`);
  }
  await assertReadablePath(sourcePath, "The source workspace");
  await assertReadablePath(path.join(sourcePath, "data"), "The source workspace data directory");
  await assertReadablePath(path.join(sourcePath, "conf"), "The source workspace config directory");

  const sourceLockFile = path.join(sourcePath, ".lock");
  if (await pathExists(sourceLockFile)) {
    throw new Error(`The source workspace is locked or in use. Close the legacy app and SourceFlow completely before migrating: ${sourcePath}`);
  }

  const targetPath = resolveTargetWorkspacePath(sourcePath, options?.targetWorkspace);
  await assertCreatableTargetWorkspace(targetPath);

  if (path.resolve(targetPath) === path.resolve(sourcePath)) {
    throw new Error("The target workspace must be different from the source workspace.");
  }
  if (await pathExists(targetPath)) {
    throw new Error(`The target workspace already exists. Migration will not overwrite an existing directory: ${targetPath}`);
  }

  await assertWritableTargetParent(targetPath);
  await safeMkdir(path.dirname(targetPath), { recursive: true }, "Failed to create target workspace parent directory");

  const workspaceSizeBytes = await getWorkspaceSizeBytes(sourcePath);
  await assertSufficientFreeSpace(targetPath, workspaceSizeBytes);

  const expectedLegacyDirCount = (await collectLegacyHiddenDirs(path.join(sourcePath, "data"))).length;
  const stagingPath = `${targetPath}.migrating-${Date.now()}`;

  let migratedDirs = [];
  let renamedDocFiles = [];
  let removedTempArtifacts = [];
  let sanitizedActions = [];

  try {
    await copyDirectoryTree(sourcePath, stagingPath);
    migratedDirs = await migrateHiddenDataDirs(path.join(stagingPath, "data"));
    renamedDocFiles = await renameLegacyDocFilesToSf(path.join(stagingPath, "data"));
    removedTempArtifacts = await removeWorkspaceTempArtifacts(path.join(stagingPath, "temp"));
    await fsPromises.rm(path.join(stagingPath, ".lock"), { force: true });
    sanitizedActions = await sanitizeMigratedWorkspaceConfig(stagingPath, sourcePath);
    await validateMigrationResult(sourcePath, stagingPath, expectedLegacyDirCount);
    await movePath(stagingPath, targetPath);
    await writeMigrationReport(targetPath, sourcePath, migratedDirs, renamedDocFiles, removedTempArtifacts, sanitizedActions);
  } catch (error) {
    await fsPromises.rm(stagingPath, { recursive: true, force: true });
    throw error;
  }

  return {
    sourcePath,
    targetPath,
    migratedHiddenDirCount: migratedDirs.length,
    renamedDocFileCount: renamedDocFiles.length,
    removedTargetTempCount: removedTempArtifacts.length,
    sanitizedActionCount: sanitizedActions.length,
  };
}

module.exports = {
  DEFAULT_TARGET_WORKSPACE_NAME,
  getDefaultTargetWorkspace,
  resolveTargetWorkspacePath,
  migrateWorkspace,
};
