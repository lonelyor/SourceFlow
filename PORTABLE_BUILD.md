# Portable Build Scripts

This repository now keeps only two user-facing build entrypoints:

- `发布.py`
- `编译.py`

`编译.py` runs on Windows, Linux, and macOS, auto-detects the current host OS and CPU architecture, and builds the matching native desktop artifacts for that host.

The scripts are intended to be safe to publish on GitHub:

- No machine-specific absolute paths are required.
- No signing keys, tokens, or certificates are embedded.
- Portable packaging is host-native only to reduce cross-build instability.
- Portable builds fail closed when required runtime resources are missing.

## Included Files

- `scripts/portable-build.js`
- `app/scripts/afterPack.js`
- `编译.py`
- `发布.py`

## What The Scripts Fix

The portable package must include runtime resources such as:

- `resources/stage`
- `resources/appearance`
- `resources/guide`
- `resources/changelogs`
- `resources/pandoc-resources`
- `resources/pandoc.zip`
- `resources/kernel`

If these resources are missing, the desktop renderer can fail with `ChunkLoadError`, which breaks features such as the AI assistant and terminal.

The hardened `afterPack` step now:

- syncs required runtime resources into the packaged app
- validates the copied files before the package is accepted
- checks the portable kernel binary exists
- checks non-Windows kernel binaries keep executable permissions

## Prerequisites

Common:

- `node`
- `pnpm`
- `go`

Linux:

- `gcc` or `clang`
- `musl-gcc` is recommended for a more portable static build
- for arm64, `aarch64-linux-musl-gcc` is preferred when available

macOS:

- `clang`
- signing materials are optional
- if signing files are missing, the script falls back to an unsigned portable config

Windows:

- optional: `goversioninfo`

## Recommended Commands

Build the native artifacts for the current machine:

```bash
python ./编译.py
```

Show detailed options:

```bash
python ./编译.py --help
```

Preview the host-native release flow:

```bash
python ./发布.py --preview
```

## Common Options

- `--skip-install`
- `--skip-ui`
- `--skip-kernel`
- `--skip-pack`
- `--open-output`
- `--cc <path>`

Linux only:

- `--dynamic`

macOS only:

- `--signed`

## Stability Rules

- Build on the target OS.
- Build on the target CPU architecture.
- Do not rely on cross-platform or cross-arch packaging.
- Do not publish portable artifacts that fail the runtime validation step.

## GitHub Publishing Notes

Before publishing, make sure these generated files are ignored:

- `node_modules/`
- `app/node_modules/`
- `app/build/`
- `app/build-linux-portable/`
- `app/build-linux-arm64-portable/`
- `app/build-darwin-portable/`
- `app/build-darwin-arm64-portable/`
- `app/stage/build/`
- `app/.portable-unsigned-*.yml`

Use preview first to confirm the public export tree and release assets.
