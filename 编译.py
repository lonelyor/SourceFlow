#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform as host_platform
import shutil
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parent
APP_DIR = PROJECT_ROOT / "app"
APP_PACKAGE_PATH = APP_DIR / "package.json"
KERNEL_DIR = PROJECT_ROOT / "kernel"
PORTABLE_BUILD_SCRIPT = PROJECT_ROOT / "scripts" / "portable-build.js"
WEB_CLIPPER_RELATIVE_DIR = Path("browser-extension") / "sourceflow-web-clipper"
WEB_CLIPPER_ARCHIVE_STEM = "sourceflow-page-saver"
WEB_CLIPPER_EXCLUDED_PARTS = {"dist", "__pycache__"}
WEB_CLIPPER_EXCLUDED_NAMES = {".DS_Store", "Thumbs.db"}
WEB_CLIPPER_EXCLUDED_SUFFIXES = {".pyc"}
IS_WINDOWS = os.name == "nt"
PNPM = "pnpm.cmd" if IS_WINDOWS else "pnpm"


@dataclass(frozen=True)
class BuildTarget:
    platform_key: str
    arch: str
    display_name: str
    installer_script: str
    installer_output_dir: Path
    portable_supported: bool
    portable_output_dir: Path | None
    requires_manual_windows_arm64_prepare: bool = False


TARGETS: dict[tuple[str, str], BuildTarget] = {
    ("win", "x64"): BuildTarget(
        platform_key="win",
        arch="x64",
        display_name="Windows x64",
        installer_script="dist",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build" / "sourceflow-portable",
    ),
    ("win", "arm64"): BuildTarget(
        platform_key="win",
        arch="arm64",
        display_name="Windows arm64",
        installer_script="dist-arm64",
        installer_output_dir=APP_DIR / "build",
        portable_supported=False,
        portable_output_dir=None,
        requires_manual_windows_arm64_prepare=True,
    ),
    ("linux", "x64"): BuildTarget(
        platform_key="linux",
        arch="x64",
        display_name="Linux x64",
        installer_script="dist-linux",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-linux-portable",
    ),
    ("linux", "arm64"): BuildTarget(
        platform_key="linux",
        arch="arm64",
        display_name="Linux arm64",
        installer_script="dist-linux-arm64",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-linux-arm64-portable",
    ),
    ("mac", "x64"): BuildTarget(
        platform_key="mac",
        arch="x64",
        display_name="macOS x64",
        installer_script="dist-darwin",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-darwin-portable",
    ),
    ("mac", "arm64"): BuildTarget(
        platform_key="mac",
        arch="arm64",
        display_name="macOS arm64",
        installer_script="dist-darwin-arm64",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-darwin-arm64-portable",
    ),
}


def print_step(message: str) -> None:
    print(f"\n==> {message}", flush=True)


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Required command not found: {name}")


def run(
    args: Sequence[str | os.PathLike[str]],
    *,
    cwd: str | os.PathLike[str] | None = None,
    env: Mapping[str, str] | None = None,
    capture_output: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    command = [os.fspath(arg) for arg in args]
    merged_env = os.environ.copy()
    if env:
        merged_env.update({key: str(value) for key, value in env.items()})

    result = subprocess.run(
        command,
        cwd=os.fspath(cwd) if cwd else None,
        env=merged_env,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=capture_output,
        check=False,
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}")
    return result


def open_directory(target_dir: Path) -> None:
    if IS_WINDOWS:
        run(["explorer.exe", str(target_dir)], check=False)
        return
    if sys.platform == "darwin":
        run(["open", str(target_dir)], check=False)
        return
    opener = shutil.which("xdg-open")
    if opener:
        run([opener, str(target_dir)], check=False)


def ensure_path_exists(path: Path, message: str) -> None:
    if not path.exists():
        raise RuntimeError(message)


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def load_version_field(path: Path, label: str) -> str:
    if not path.is_file():
        raise RuntimeError(f"Required JSON file not found: {label}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected a JSON object in {label}")
    version = str(data.get("version", "")).strip()
    if not version:
        raise RuntimeError(f"Unable to resolve version from {label}")
    return version


def should_include_web_clipper_file(relative_path: Path) -> bool:
    if any(part in WEB_CLIPPER_EXCLUDED_PARTS for part in relative_path.parts):
        return False
    if relative_path.name in WEB_CLIPPER_EXCLUDED_NAMES:
        return False
    if relative_path.suffix in WEB_CLIPPER_EXCLUDED_SUFFIXES:
        return False
    return True


def write_web_clipper_archive(zip_path: Path, source_dir: Path, source_files: list[Path]) -> None:
    remove_path(zip_path)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in source_files:
            relative_path = file_path.relative_to(source_dir).as_posix()
            archive.write(file_path, f"{WEB_CLIPPER_ARCHIVE_STEM}/{relative_path}")


def package_web_clipper_assets() -> tuple[Path, Path]:
    app_version = load_version_field(APP_PACKAGE_PATH, "app/package.json")
    web_clipper_dir = PROJECT_ROOT / WEB_CLIPPER_RELATIVE_DIR
    manifest_path = web_clipper_dir / "manifest.json"
    manifest_version = load_version_field(
        manifest_path,
        f"{WEB_CLIPPER_RELATIVE_DIR.as_posix()}/manifest.json",
    )
    if manifest_version != app_version:
        raise RuntimeError(
            "Browser extension version does not match app/package.json: "
            f"{manifest_version} != {app_version}"
        )

    source_files = [
        path
        for path in sorted(web_clipper_dir.rglob("*"))
        if path.is_file() and should_include_web_clipper_file(path.relative_to(web_clipper_dir))
    ]
    if not source_files:
        raise RuntimeError(f"No browser extension files found under {web_clipper_dir}")

    dist_dir = web_clipper_dir / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    stable_zip_path = dist_dir / f"{WEB_CLIPPER_ARCHIVE_STEM}.zip"
    versioned_zip_path = dist_dir / f"{WEB_CLIPPER_ARCHIVE_STEM}-{app_version}.zip"
    write_web_clipper_archive(stable_zip_path, web_clipper_dir, source_files)
    write_web_clipper_archive(versioned_zip_path, web_clipper_dir, source_files)
    return stable_zip_path, versioned_zip_path


def normalize_platform(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"win", "windows", "win32"}:
        return "win"
    if normalized == "linux":
        return "linux"
    if normalized in {"mac", "macos", "darwin"}:
        return "mac"
    raise RuntimeError(f"Unsupported platform: {value}")


def normalize_arch(value: str) -> str:
    normalized = value.strip().lower()
    if normalized in {"x64", "amd64", "x86_64"}:
        return "x64"
    if normalized in {"arm64", "aarch64"}:
        return "arm64"
    raise RuntimeError(f"Unsupported architecture: {value}")


def resolve_host_platform() -> str:
    if sys.platform.startswith("win"):
        return "win"
    if sys.platform == "darwin":
        return "mac"
    if sys.platform.startswith("linux"):
        return "linux"
    raise RuntimeError(f"Unsupported host platform: {sys.platform}")


def resolve_host_arch() -> str:
    return normalize_arch(host_platform.machine())


def resolve_target(platform_text: str, arch_text: str) -> tuple[BuildTarget, str, str]:
    host_name = resolve_host_platform()
    host_arch = resolve_host_arch()
    target_platform = normalize_platform(platform_text) if platform_text else host_name
    target_arch = normalize_arch(arch_text) if arch_text else host_arch

    if target_platform != host_name:
        raise RuntimeError(
            f"Host-native builds only. Current host is {host_name}, requested {target_platform}."
        )
    if target_arch != host_arch:
        raise RuntimeError(
            f"Host-native builds only. Current host arch is {host_arch}, requested {target_arch}."
        )

    target = TARGETS.get((target_platform, target_arch))
    if not target:
        raise RuntimeError(f"Unsupported build target: {target_platform}/{target_arch}")
    return target, host_name, host_arch


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python 编译.py",
        description=(
            "Build native SourceFlow desktop artifacts for the current machine.\n"
            "The script auto-detects the host OS and CPU architecture, prepares the\n"
            "frontend and Go kernel, then builds the installer and, when supported,\n"
            "the portable package for that same host target.\n"
            "Portable builds also bundle the browser capture extension zip."
        ),
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python 编译.py\n"
            "  python 编译.py --skip-portable\n"
            "  python 编译.py --skip-install --skip-ui --skip-kernel --skip-installer\n"
            "  python 编译.py --open-output\n"
            "\n"
            "Notes:\n"
            "  - Host-native only. Build on the target OS and target CPU architecture.\n"
            "  - Windows arm64 currently builds the installer only; portable packaging is skipped automatically."
        ),
    )
    parser.add_argument("--platform", choices=("win", "linux", "mac"), default="", help="Optional explicit target platform. Defaults to the host platform.")
    parser.add_argument("--arch", choices=("x64", "arm64"), default="", help="Optional explicit target architecture. Defaults to the host architecture.")
    parser.add_argument("--skip-install", action="store_true", help="Skip dependency installation before building.")
    parser.add_argument("--skip-ui", action="store_true", help="Skip the frontend build and reuse existing app/stage/build output.")
    parser.add_argument("--skip-kernel", action="store_true", help="Skip the Go kernel build and reuse an existing kernel binary.")
    parser.add_argument("--skip-installer", action="store_true", help="Do not build the native installer package.")
    parser.add_argument("--skip-portable", action="store_true", help="Do not build the portable package.")
    parser.add_argument("--open-output", action="store_true", help="Open the main output directory after the build completes.")
    parser.add_argument("--dynamic", action="store_true", help="Linux only. Prefer dynamic linking instead of musl static linking for the portable preparation path.")
    parser.add_argument("--signed", action="store_true", help="macOS only. Force the signed portable config instead of the unsigned fallback.")
    parser.add_argument("--cc", default="", help="Override the C compiler used for the kernel build when a platform-specific compiler is required.")
    return parser


def with_ci_env() -> dict[str, str]:
    env = os.environ.copy()
    env["CI"] = "true"
    return env


def maybe_run_goversioninfo() -> None:
    if shutil.which("goversioninfo") is None:
        return
    run(
        [
            "goversioninfo",
            "-platform-specific=true",
            "-icon=resource/icon.ico",
            "-manifest=resource/goversioninfo.exe.manifest",
        ],
        cwd=KERNEL_DIR,
    )


def pick_windows_arm64_cc(explicit_cc: str) -> str:
    candidates: list[str] = []
    if explicit_cc:
        candidates.append(explicit_cc)
    if os.environ.get("SOURCEFLOW_WINDOWS_ARM64_CC"):
        candidates.append(os.environ["SOURCEFLOW_WINDOWS_ARM64_CC"])
    for candidate in ("aarch64-w64-mingw32-gcc", "clang"):
        resolved = shutil.which(candidate)
        if resolved:
            candidates.append(resolved)

    for candidate in candidates:
        if shutil.which(candidate) or Path(candidate).exists():
            return candidate

    raise RuntimeError(
        "Windows arm64 kernel builds require a usable C compiler. "
        "Pass --cc or set SOURCEFLOW_WINDOWS_ARM64_CC to aarch64-w64-mingw32-gcc."
    )


def prepare_with_portable_builder(target: BuildTarget, args: argparse.Namespace) -> None:
    command = [
        "node",
        str(PORTABLE_BUILD_SCRIPT),
        "--platform",
        target.platform_key,
        "--arch",
        target.arch,
        "--skip-pack",
    ]
    if args.skip_install:
        command.append("--skip-install")
    if args.skip_ui:
        command.append("--skip-ui")
    if args.skip_kernel:
        command.append("--skip-kernel")
    if args.dynamic:
        command.append("--dynamic")
    if args.signed:
        command.append("--signed")
    if args.cc:
        command.extend(["--cc", args.cc])
    run(command, cwd=PROJECT_ROOT)


def prepare_windows_arm64(args: argparse.Namespace) -> None:
    if not args.skip_install:
        print_step("Install app dependencies")
        run([PNPM, "install", "--frozen-lockfile"], cwd=APP_DIR, env=with_ci_env())

    if not args.skip_ui:
        print_step("Build frontend")
        run([PNPM, "run", "build"], cwd=APP_DIR)
    else:
        ensure_path_exists(
            APP_DIR / "stage" / "build" / "app" / "index.html",
            "Frontend build output is missing. Remove --skip-ui or build the app first.",
        )

    kernel_dir = APP_DIR / "kernel-arm64"
    kernel_binary = kernel_dir / "SourceFlow-Kernel.exe"
    elevator_source = APP_DIR / "elevator" / "elevator-arm64.exe"
    elevator_target = kernel_dir / "elevator.exe"

    if not args.skip_kernel:
        print_step("Build Windows arm64 kernel")
        remove_path(kernel_dir)
        kernel_dir.mkdir(parents=True, exist_ok=True)
        maybe_run_goversioninfo()
        env = {
            "GO111MODULE": "on",
            "CGO_ENABLED": "1",
            "GOOS": "windows",
            "GOARCH": "arm64",
            "GOPROXY": os.environ.get("GOPROXY", "https://goproxy.cn,direct"),
            "CC": pick_windows_arm64_cc(args.cc),
        }
        run(
            [
                "go",
                "build",
                "-trimpath",
                "-tags",
                "fts5",
                "-o",
                str(kernel_binary),
                "-ldflags",
                "-s -w -H=windowsgui",
                ".",
            ],
            cwd=KERNEL_DIR,
            env=env,
        )
        ensure_path_exists(elevator_source, f"Missing Windows arm64 elevator binary: {elevator_source}")
        shutil.copy2(elevator_source, elevator_target)
    else:
        ensure_path_exists(
            kernel_binary,
            "Windows arm64 kernel is missing. Remove --skip-kernel or build it first.",
        )
        ensure_path_exists(
            elevator_target,
            "Windows arm64 elevator helper is missing. Remove --skip-kernel or build it first.",
        )


def build_installer(target: BuildTarget) -> None:
    print_step(f"Build installer: {target.display_name}")
    run([PNPM, "run", target.installer_script], cwd=APP_DIR)


def build_portable(target: BuildTarget, args: argparse.Namespace) -> None:
    print_step("Package browser capture extension")
    stable_zip_path, versioned_zip_path = package_web_clipper_assets()
    print(f"Portable extension archive: {stable_zip_path}", flush=True)
    print(f"Versioned extension archive: {versioned_zip_path}", flush=True)

    print_step(f"Build portable package: {target.display_name}")
    command = [
        "node",
        str(PORTABLE_BUILD_SCRIPT),
        "--platform",
        target.platform_key,
        "--arch",
        target.arch,
        "--skip-install",
        "--skip-ui",
        "--skip-kernel",
    ]
    if args.dynamic:
        command.append("--dynamic")
    if args.signed:
        command.append("--signed")
    if args.cc:
        command.extend(["--cc", args.cc])
    run(command, cwd=PROJECT_ROOT)


def main_output_dir(target: BuildTarget, build_portable_artifact: bool) -> Path:
    if build_portable_artifact and target.portable_output_dir:
        return target.portable_output_dir
    return target.installer_output_dir


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.skip_installer and args.skip_portable:
        raise RuntimeError("Nothing to build. Remove --skip-installer or --skip-portable.")

    target, host_name, host_arch = resolve_target(args.platform, args.arch)
    build_portable_artifact = (not args.skip_portable) and target.portable_supported

    require_command("node")
    require_command(PNPM)
    require_command("go")

    print_step("Resolved target")
    print(f"Host platform: {host_name}", flush=True)
    print(f"Host architecture: {host_arch}", flush=True)
    print(f"Target: {target.display_name}", flush=True)
    print(f"Build installer: {not args.skip_installer}", flush=True)
    print(f"Build portable: {build_portable_artifact}", flush=True)
    print(f"Bundle browser extension zip in portable: {build_portable_artifact}", flush=True)
    if not args.skip_portable and not target.portable_supported:
        print("Portable build: skipped automatically because this target has no portable packaging flow.", flush=True)

    if target.requires_manual_windows_arm64_prepare:
        prepare_windows_arm64(args)
    else:
        prepare_with_portable_builder(target, args)

    if not args.skip_installer:
        build_installer(target)

    if build_portable_artifact:
        build_portable(target, args)

    output_dir = main_output_dir(target, build_portable_artifact)
    print_step("Done")
    print(f"Installer output: {target.installer_output_dir}", flush=True)
    if target.portable_output_dir:
        print(f"Portable output: {target.portable_output_dir}", flush=True)

    if args.open_output and output_dir.exists():
        open_directory(output_dir)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # pragma: no cover - top-level CLI behavior
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
