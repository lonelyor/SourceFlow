"use strict";

const { spawnSync } = require("child_process");
const path = require("path");

const appDir = path.resolve(__dirname, "..");
const nodeExecutable = process.execPath;
const electronBuilderCli = require.resolve("electron-builder/cli.js", { paths: [appDir] });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: appDir,
    stdio: "inherit",
    env: process.env,
    shell: false,
    ...options,
  });

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
}

if (!process.env.ELECTRON_MIRROR) {
  process.env.ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/";
}

const portableEnv = {
  ...process.env,
  SOURCEFLOW_PORTABLE_BUILD: "1",
  SOURCEFLOW_TARGET_PLATFORM: "win32",
  SOURCEFLOW_TARGET_ARCH: "x64",
};

run(nodeExecutable, [path.join(__dirname, "preparePortableBuild.js")]);
run(nodeExecutable, [electronBuilderCli, "--config", "electron-builder-portable.yml", "--publish=never"], {
  env: {
    ...portableEnv,
    NODE_OPTIONS: [portableEnv.NODE_OPTIONS, "--no-deprecation"].filter(Boolean).join(" "),
  },
});
run(nodeExecutable, [path.join(__dirname, "renamePortableDir.js")]);
