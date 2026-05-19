#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import os
import platform as host_platform
import re
import shlex
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence


PROJECT_ROOT = Path(__file__).resolve().parent
APP_DIR = PROJECT_ROOT / "app"
APP_PACKAGE_PATH = APP_DIR / "package.json"
KERNEL_DIR = PROJECT_ROOT / "kernel"
APP_DEPENDENCY_STAMP_PATH = APP_DIR / "node_modules" / ".sourceflow-deps.json"
WEB_CLIPPER_RELATIVE_DIR = Path("browser-extension") / "sourceflow-web-clipper"
WEB_CLIPPER_ARCHIVE_STEM = "sourceflow-page-saver"
WEB_CLIPPER_EXCLUDED_PARTS = {"dist", "__pycache__"}
WEB_CLIPPER_EXCLUDED_NAMES = {".DS_Store", "Thumbs.db"}
WEB_CLIPPER_EXCLUDED_SUFFIXES = {".pyc"}
IS_WINDOWS = os.name == "nt"
SOURCEFLOW_CONFIG_DIR_ENV = "SOURCEFLOW_CONFIG_DIR"
DEFAULT_GO_PROXY = "https://goproxy.cn|https://goproxy.io|https://proxy.golang.org|direct"
GO_TRANSIENT_ERROR_MARKERS = (
    "i/o timeout",
    "tls handshake timeout",
    "connection reset",
    "connection refused",
    "connection timed out",
    "temporary failure",
    "temporarily unavailable",
    "proxyconnect",
    "no such host",
    "network is unreachable",
    "remote error",
    "unexpected eof",
)
PNPM = "pnpm.cmd" if IS_WINDOWS else "pnpm"
HOMEBREW_INSTALL_SCRIPT_URL = "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"
WINDOWS_FALLBACK_COMMAND_DIRS = tuple(
    path
    for path in (
        r"C:\Program Files\nodejs",
        r"C:\Program Files\Go\bin",
        r"C:\Program Files\Git\cmd",
        r"C:\Program Files\Git\bin",
        r"C:\Program Files\LLVM\bin",
        r"C:\msys64\ucrt64\bin",
        r"C:\msys64\mingw64\bin",
        r"C:\msys64\clang64\bin",
        os.path.join(os.environ.get("APPDATA", ""), "npm"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "pnpm"),
    )
    if path
)
WINDOWS_COMMAND_FALLBACK_PATHS: dict[str, tuple[str, ...]] = {
    "node": (
        r"C:\Program Files\nodejs\node.exe",
    ),
    "pnpm": (
        r"C:\Program Files\nodejs\pnpm",
        os.path.join(os.environ.get("APPDATA", ""), "npm", "pnpm"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "pnpm", "pnpm"),
    ),
    "pnpm.cmd": (
        r"C:\Program Files\nodejs\pnpm.cmd",
        os.path.join(os.environ.get("APPDATA", ""), "npm", "pnpm.cmd"),
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "pnpm", "pnpm.cmd"),
    ),
    "go": (
        r"C:\Program Files\Go\bin\go.exe",
    ),
    "clang": (
        r"C:\Program Files\LLVM\bin\clang.exe",
        r"C:\msys64\clang64\bin\clang.exe",
        r"C:\msys64\ucrt64\bin\clang.exe",
        r"C:\msys64\mingw64\bin\clang.exe",
    ),
    "gcc": (
        r"C:\msys64\ucrt64\bin\gcc.exe",
        r"C:\msys64\mingw64\bin\gcc.exe",
    ),
    "aarch64-w64-mingw32-gcc": (
        r"C:\msys64\clang64\bin\aarch64-w64-mingw32-gcc.exe",
        r"C:\msys64\ucrt64\bin\aarch64-w64-mingw32-gcc.exe",
    ),
    "x86_64-w64-mingw32-gcc": (
        r"C:\msys64\ucrt64\bin\x86_64-w64-mingw32-gcc.exe",
        r"C:\msys64\mingw64\bin\x86_64-w64-mingw32-gcc.exe",
    ),
}
UNIX_FALLBACK_COMMAND_DIRS = (
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/opt/local/bin",
    "/usr/local/go/bin",
    str(Path.home() / "Library" / "pnpm"),
    str(Path.home() / ".local" / "bin"),
    str(Path.home() / "go" / "bin"),
)
LINUX_FALLBACK_COMMAND_DIRS = (
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/local/go/bin",
    str(Path.home() / ".local" / "bin"),
    str(Path.home() / ".local" / "share" / "pnpm"),
    str(Path.home() / ".pnpm"),
    "/snap/bin",
)
UNIX_COMMAND_FALLBACK_PATHS: dict[str, tuple[str, ...]] = {
    "brew": (
        "/opt/homebrew/bin/brew",
        "/usr/local/bin/brew",
    ),
    "clang": (
        "/usr/bin/clang",
    ),
    "curl": (
        "/usr/bin/curl",
    ),
    "git": (
        "/usr/bin/git",
    ),
    "node": (
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/opt/local/bin/node",
    ),
    "pnpm": (
        "/opt/homebrew/bin/pnpm",
        "/usr/local/bin/pnpm",
        str(Path.home() / "Library" / "pnpm" / "pnpm"),
    ),
    "go": (
        "/opt/homebrew/bin/go",
        "/usr/local/go/bin/go",
        "/usr/local/bin/go",
    ),
    "softwareupdate": (
        "/usr/sbin/softwareupdate",
    ),
    "sudo": (
        "/usr/bin/sudo",
    ),
    "xcode-select": (
        "/usr/bin/xcode-select",
    ),
    "xcrun": (
        "/usr/bin/xcrun",
    ),
}
LINUX_COMMAND_FALLBACK_PATHS: dict[str, tuple[str, ...]] = {
    "apt-get": (
        "/usr/bin/apt-get",
        "/bin/apt-get",
    ),
    "apk": (
        "/sbin/apk",
        "/usr/sbin/apk",
        "/bin/apk",
        "/usr/bin/apk",
    ),
    "brew": (
        "/home/linuxbrew/.linuxbrew/bin/brew",
        "/usr/local/bin/brew",
    ),
    "dnf": (
        "/usr/bin/dnf",
        "/bin/dnf",
    ),
    "go": (
        "/usr/local/go/bin/go",
        "/usr/bin/go",
        "/bin/go",
        "/snap/bin/go",
    ),
    "node": (
        "/usr/bin/node",
        "/usr/local/bin/node",
        "/bin/node",
        "/snap/bin/node",
    ),
    "pacman": (
        "/usr/bin/pacman",
        "/bin/pacman",
    ),
    "pnpm": (
        "/usr/local/bin/pnpm",
        "/usr/bin/pnpm",
        str(Path.home() / ".local" / "share" / "pnpm" / "pnpm"),
        str(Path.home() / ".local" / "bin" / "pnpm"),
    ),
    "sudo": (
        "/usr/bin/sudo",
        "/bin/sudo",
    ),
    "yum": (
        "/usr/bin/yum",
        "/bin/yum",
    ),
    "zypper": (
        "/usr/bin/zypper",
        "/bin/zypper",
    ),
}
INSTALL_FAILURE_DETAILS: dict[str, str] = {}


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except ValueError:
                pass


configure_utf8_stdio()


@dataclass(frozen=True)
class BuildTarget:
    platform_key: str
    arch: str
    display_name: str
    installer_config: str
    installer_output_dir: Path
    portable_supported: bool
    portable_output_dir: Path | None
    electron_platform: str
    goos: str
    goarch: str
    portable_kernel_dir: Path | None
    portable_kernel_binary: str
    portable_config: str
    portable_output_name: str


@dataclass(frozen=True)
class CommandTask:
    label: str
    args: tuple[str | os.PathLike[str], ...]
    cwd: Path | None = None
    env: Mapping[str, str] | None = None


TARGETS: dict[tuple[str, str], BuildTarget] = {
    ("win", "x64"): BuildTarget(
        platform_key="win",
        arch="x64",
        display_name="Windows x64",
        installer_config="electron-builder.yml",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build" / "sourceflow-portable",
        electron_platform="win32",
        goos="windows",
        goarch="amd64",
        portable_kernel_dir=APP_DIR / "kernel",
        portable_kernel_binary="SourceFlow-Kernel.exe",
        portable_config="electron-builder-portable.yml",
        portable_output_name="",
    ),
    ("win", "arm64"): BuildTarget(
        platform_key="win",
        arch="arm64",
        display_name="Windows arm64",
        installer_config="electron-builder-arm64.yml",
        installer_output_dir=APP_DIR / "build",
        portable_supported=False,
        portable_output_dir=None,
        electron_platform="win32",
        goos="windows",
        goarch="arm64",
        portable_kernel_dir=APP_DIR / "kernel-arm64",
        portable_kernel_binary="SourceFlow-Kernel.exe",
        portable_config="",
        portable_output_name="",
    ),
    ("linux", "x64"): BuildTarget(
        platform_key="linux",
        arch="x64",
        display_name="Linux x64",
        installer_config="electron-builder-linux.yml",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-linux-portable",
        electron_platform="linux",
        goos="linux",
        goarch="amd64",
        portable_kernel_dir=APP_DIR / "kernel-linux",
        portable_kernel_binary="SourceFlow-Kernel",
        portable_config="electron-builder-linux-portable.yml",
        portable_output_name="build-linux-portable",
    ),
    ("linux", "arm64"): BuildTarget(
        platform_key="linux",
        arch="arm64",
        display_name="Linux arm64",
        installer_config="electron-builder-linux-arm64.yml",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-linux-arm64-portable",
        electron_platform="linux",
        goos="linux",
        goarch="arm64",
        portable_kernel_dir=APP_DIR / "kernel-linux-arm64",
        portable_kernel_binary="SourceFlow-Kernel",
        portable_config="electron-builder-linux-arm64-portable.yml",
        portable_output_name="build-linux-arm64-portable",
    ),
    ("mac", "x64"): BuildTarget(
        platform_key="mac",
        arch="x64",
        display_name="macOS x64",
        installer_config="electron-builder-darwin.yml",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-darwin-portable",
        electron_platform="darwin",
        goos="darwin",
        goarch="amd64",
        portable_kernel_dir=APP_DIR / "kernel-darwin",
        portable_kernel_binary="SourceFlow-Kernel",
        portable_config="electron-builder-darwin-portable.yml",
        portable_output_name="build-darwin-portable",
    ),
    ("mac", "arm64"): BuildTarget(
        platform_key="mac",
        arch="arm64",
        display_name="macOS arm64",
        installer_config="electron-builder-darwin-arm64.yml",
        installer_output_dir=APP_DIR / "build",
        portable_supported=True,
        portable_output_dir=APP_DIR / "build-darwin-arm64-portable",
        electron_platform="darwin",
        goos="darwin",
        goarch="arm64",
        portable_kernel_dir=APP_DIR / "kernel-darwin-arm64",
        portable_kernel_binary="SourceFlow-Kernel",
        portable_config="electron-builder-darwin-arm64-portable.yml",
        portable_output_name="build-darwin-arm64-portable",
    ),
}


def print_step(message: str) -> None:
    print(f"\n==> {message}", flush=True)


def remember_install_failure(name: str, reason: str) -> None:
    INSTALL_FAILURE_DETAILS[name] = reason.strip()


def clear_install_failure(name: str) -> None:
    INSTALL_FAILURE_DETAILS.pop(name, None)


def related_install_failure(name: str) -> str | None:
    detail = INSTALL_FAILURE_DETAILS.get(name)
    if detail:
        return detail
    if is_macos() and name in {"node", "pnpm", "go"}:
        return INSTALL_FAILURE_DETAILS.get("brew")
    return None


def is_executable_file(path: Path) -> bool:
    return path.is_file() and os.access(path, os.X_OK)


def prepend_path_entry(directory: str | os.PathLike[str]) -> None:
    directory_text = os.fspath(directory)
    if not directory_text:
        return
    current = os.environ.get("PATH", "")
    entries = [entry for entry in current.split(os.pathsep) if entry]
    if directory_text in entries:
        return
    os.environ["PATH"] = directory_text if not current else f"{directory_text}{os.pathsep}{current}"


def is_macos() -> bool:
    return sys.platform == "darwin"


def is_linux() -> bool:
    return sys.platform.startswith("linux")


def refresh_windows_fallback_path_entries() -> None:
    if not IS_WINDOWS:
        return
    for directory in WINDOWS_FALLBACK_COMMAND_DIRS:
        if Path(directory).exists():
            prepend_path_entry(directory)


def refresh_unix_fallback_path_entries() -> None:
    if is_macos():
        for directory in UNIX_FALLBACK_COMMAND_DIRS:
            if Path(directory).exists():
                prepend_path_entry(directory)
        return
    if is_linux():
        for directory in LINUX_FALLBACK_COMMAND_DIRS:
            if Path(directory).exists():
                prepend_path_entry(directory)


def resolve_command_from_shell(name: str) -> str | None:
    if IS_WINDOWS:
        return None

    shell_candidates = []
    for candidate in (
        os.environ.get("SHELL", ""),
        "/bin/zsh",
        "/bin/bash",
        "/bin/sh",
    ):
        if candidate and candidate not in shell_candidates and Path(candidate).exists():
            shell_candidates.append(candidate)

    quoted_name = shlex.quote(name)
    for shell_path in shell_candidates:
        for shell_mode in ("-ilc", "-lc"):
            result = subprocess.run(
                [shell_path, shell_mode, f"command -v {quoted_name}"],
                text=True,
                encoding="utf-8",
                errors="replace",
                capture_output=True,
                check=False,
            )
            if result.returncode != 0:
                continue
            for raw_line in reversed(result.stdout.splitlines()):
                line = raw_line.strip()
                if not line:
                    continue
                for token in reversed(line.split()):
                    candidate = Path(token.strip("()'\""))
                    if is_executable_file(candidate):
                        return str(candidate)
    return None


def resolve_command_path(name: str) -> str | None:
    if IS_WINDOWS:
        refresh_windows_fallback_path_entries()
    else:
        refresh_unix_fallback_path_entries()

    resolved = shutil.which(name)
    if resolved:
        return resolved

    if not IS_WINDOWS:
        resolved = resolve_command_from_shell(name)
        if resolved:
            return resolved

    if IS_WINDOWS:
        command_fallback_paths = WINDOWS_COMMAND_FALLBACK_PATHS
        fallback_dirs = WINDOWS_FALLBACK_COMMAND_DIRS
    elif is_linux():
        command_fallback_paths = LINUX_COMMAND_FALLBACK_PATHS
        fallback_dirs = LINUX_FALLBACK_COMMAND_DIRS
    else:
        command_fallback_paths = UNIX_COMMAND_FALLBACK_PATHS
        fallback_dirs = UNIX_FALLBACK_COMMAND_DIRS

    for explicit_path in command_fallback_paths.get(name, ()):
        candidate = Path(explicit_path)
        if is_executable_file(candidate):
            return str(candidate)

    for directory in fallback_dirs:
        candidate = Path(directory) / name
        if is_executable_file(candidate):
            return str(candidate)
    return None


def try_run_command(args: Sequence[str]) -> bool:
    result = subprocess.run(
        list(args),
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def run_interactive_command(args: Sequence[str], *, env: Mapping[str, str] | None = None) -> bool:
    merged_env = os.environ.copy()
    if env:
        merged_env.update({key: str(value) for key, value in env.items()})
    result = subprocess.run(
        list(args),
        env=merged_env,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return result.returncode == 0


def run_streaming_command(
    args: Sequence[str],
    *,
    env: Mapping[str, str] | None = None,
    cwd: str | os.PathLike[str] | None = None,
) -> tuple[bool, str]:
    merged_env = os.environ.copy()
    if env:
        merged_env.update({key: str(value) for key, value in env.items()})

    process = subprocess.Popen(
        list(args),
        cwd=os.fspath(cwd) if cwd else None,
        env=merged_env,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    recent_lines: list[str] = []
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="", flush=True)
        recent_lines.append(line.rstrip())
        if len(recent_lines) > 40:
            recent_lines.pop(0)
    process.wait()
    return process.returncode == 0, "\n".join(line for line in recent_lines if line)


def summarize_recent_output(output: str) -> str:
    lines = [line.strip() for line in output.splitlines() if line.strip()]
    if not lines:
        return ""
    return " | ".join(lines[-6:])


def install_windows_package(display_name: str, package_ids: Sequence[str]) -> bool:
    winget_path = shutil.which("winget")
    if not winget_path:
        return False

    print_step(f"Auto-install missing tool: {display_name}")
    for package_id in package_ids:
        result = subprocess.run(
            [
                winget_path,
                "install",
                "--id",
                package_id,
                "-e",
                "--accept-package-agreements",
                "--accept-source-agreements",
                "--silent",
            ],
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            refresh_windows_fallback_path_entries()
            return True
    return False


def with_optional_sudo(args: Sequence[str]) -> list[str]:
    if IS_WINDOWS:
        return list(args)
    try:
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            return list(args)
    except OSError:
        pass

    sudo_path = resolve_command_path("sudo")
    if sudo_path:
        return [sudo_path, *list(args)]
    return list(args)


def warm_up_sudo_credentials(failure_key: str) -> bool:
    if IS_WINDOWS:
        return True
    try:
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            return True
    except OSError:
        pass

    sudo_path = resolve_command_path("sudo")
    if not sudo_path:
        remember_install_failure(
            failure_key,
            "Automatic installation requires administrator permission, but `sudo` is unavailable on this machine.",
        )
        return False

    print_step("Request administrator permission")
    ok, output = run_streaming_command([sudo_path, "-v"])
    if ok:
        return True
    extra = summarize_recent_output(output)
    remember_install_failure(
        failure_key,
        "Administrator permission was not granted for automatic installation. "
        f"{f'Last output: {extra}. ' if extra else ''}"
        "Enter a valid administrator password when prompted, then rerun the script.",
    )
    return False


def macos_command_line_tools_ready() -> bool:
    if not is_macos():
        return False
    xcode_select_path = resolve_command_path("xcode-select")
    if not xcode_select_path:
        remember_install_failure(
            "brew",
            "Xcode Command Line Tools are required on macOS, but xcode-select is unavailable.",
        )
        return False

    result = subprocess.run(
        [xcode_select_path, "-p"],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        developer_dir = result.stdout.strip()
        if developer_dir and Path(developer_dir).exists():
            clear_install_failure("brew")
            return True
        clear_install_failure("brew")
        return False

    remember_install_failure(
        "brew",
        "Xcode Command Line Tools are not ready on this macOS machine.",
    )
    return False


def prompt_macos_command_line_tools_gui_install() -> bool:
    if not is_macos():
        return False
    xcode_select_path = resolve_command_path("xcode-select")
    if not xcode_select_path:
        return False

    print_step("Auto-install missing tool: Xcode Command Line Tools")
    install_result = subprocess.run(
        [xcode_select_path, "--install"],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    combined_output = "\n".join(
        part.strip() for part in (install_result.stdout, install_result.stderr) if part and part.strip()
    )
    combined_lower = combined_output.lower()
    if "already installed" in combined_lower or "command line tools are already installed" in combined_lower:
        remember_install_failure(
            "brew",
            "Xcode Command Line Tools appear to be installed, but the active developer path is not ready. "
            "Run `sudo xcode-select --reset` or open Xcode once, then rerun the script.",
        )
        return False

    remember_install_failure(
        "brew",
        "Xcode Command Line Tools installation was started in macOS. Finish the installation, reopen the terminal, and rerun the script.",
    )
    return False


def latest_macos_clt_label() -> str | None:
    softwareupdate_path = resolve_command_path("softwareupdate")
    if not softwareupdate_path:
        return None

    result = subprocess.run(
        [softwareupdate_path, "--list"],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return None

    labels: list[str] = []
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip()
        if not line or "Command Line Tools" not in line:
            continue
        candidate = line
        if candidate.startswith("*"):
            candidate = candidate.lstrip("*").strip()
        if candidate.lower().startswith("label:"):
            candidate = candidate.split(":", 1)[1].strip()
        if candidate:
            labels.append(candidate)
    if not labels:
        return None
    return labels[-1]


def try_install_macos_command_line_tools_headless() -> bool:
    if not is_macos():
        return False

    softwareupdate_path = resolve_command_path("softwareupdate")
    xcode_select_path = resolve_command_path("xcode-select")
    if not softwareupdate_path or not xcode_select_path:
        return False

    label = latest_macos_clt_label()
    if not label:
        return False
    if not warm_up_sudo_credentials("brew"):
        return False

    print_step("Auto-install missing tool: Xcode Command Line Tools")
    install_ok, install_output = run_streaming_command(
        with_optional_sudo([softwareupdate_path, "--install", label])
    )
    if not install_ok:
        extra = summarize_recent_output(install_output)
        remember_install_failure(
            "brew",
            "Automatic installation of Xcode Command Line Tools failed. "
            f"{f'Last output: {extra}. ' if extra else ''}"
            "Open System Settings to complete software updates, then rerun the script.",
        )
        return False

    tools_path = Path("/Library/Developer/CommandLineTools")
    if tools_path.exists():
        run_streaming_command(with_optional_sudo([xcode_select_path, "--switch", str(tools_path)]))

    result = subprocess.run(
        [xcode_select_path, "-p"],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode == 0:
        clear_install_failure("brew")
        return True
    return False


def apply_brew_shellenv(brew_path: str | os.PathLike[str]) -> None:
    brew_text = os.fspath(brew_path)
    prepend_path_entry(Path(brew_text).parent)
    result = subprocess.run(
        [brew_text, "shellenv"],
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return
    for raw_line in result.stdout.splitlines():
        line = raw_line.strip().rstrip(";")
        if not line.startswith("export "):
            continue
        body = line[len("export ") :]
        if "=" not in body:
            continue
        key, value = body.split("=", 1)
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ[key] = value


def try_install_homebrew_on_macos() -> bool:
    if not is_macos():
        return False

    brew_path = resolve_command_path("brew")
    if brew_path:
        apply_brew_shellenv(brew_path)
        clear_install_failure("brew")
        return True

    installer_path = Path("/bin/bash")
    if not is_executable_file(installer_path):
        remember_install_failure("brew", "Unable to find /bin/bash, so Homebrew cannot be installed automatically.")
        return False

    if not macos_command_line_tools_ready():
        return False
    if not warm_up_sudo_credentials("brew"):
        return False

    print_step("Auto-install missing tool: Homebrew")
    temp_script_path: Path | None = None
    try:
        with urllib.request.urlopen(HOMEBREW_INSTALL_SCRIPT_URL, timeout=60) as response:
            install_script = response.read().decode("utf-8")
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix="-brew-install.sh", delete=False) as handle:
            handle.write(install_script)
            temp_script_path = Path(handle.name)
    except Exception as exc:
        remember_install_failure(
            "brew",
            f"Unable to download the Homebrew install script automatically: {exc}",
        )
        return False

    install_env = {
        "HOMEBREW_NO_ANALYTICS": "1",
    }
    try:
        install_ok, install_output = run_streaming_command([str(installer_path), str(temp_script_path)], env=install_env)
        if not install_ok:
            extra = summarize_recent_output(install_output)
            remember_install_failure(
                "brew",
                "Homebrew automatic installation failed. "
                f"{f'Last output: {extra}. ' if extra else ''}"
                "Check administrator permission, network access, and Xcode Command Line Tools, then rerun the script.",
            )
            return False
    finally:
        if temp_script_path:
            temp_script_path.unlink(missing_ok=True)

    brew_path = resolve_command_path("brew")
    if not brew_path:
        for candidate in ("/opt/homebrew/bin/brew", "/usr/local/bin/brew"):
            if is_executable_file(Path(candidate)):
                brew_path = candidate
                break
    if not brew_path:
        remember_install_failure(
            "brew",
            "Homebrew installation finished, but the `brew` command is still unavailable. "
            "Run `eval \"$(/opt/homebrew/bin/brew shellenv)\"` if Homebrew was installed to /opt/homebrew, then rerun the script.",
        )
        return False
    apply_brew_shellenv(brew_path)
    clear_install_failure("brew")
    return True


def install_macos_brew_package(command_name: str, display_name: str, packages: Sequence[str]) -> bool:
    brew_path = resolve_command_path("brew")
    if not brew_path and not try_install_homebrew_on_macos():
        return False
    brew_path = resolve_command_path("brew")
    if not brew_path:
        remember_install_failure(command_name, "Homebrew is unavailable, so the required package could not be installed.")
        return False
    apply_brew_shellenv(brew_path)

    print_step(f"Auto-install missing tool: {display_name}")
    install_ok, install_output = run_streaming_command(
        [brew_path, "install", *packages],
        env={
            "HOMEBREW_NO_ANALYTICS": "1",
            "HOMEBREW_NO_AUTO_UPDATE": "1",
        },
    )
    if not install_ok:
        extra = summarize_recent_output(install_output)
        remember_install_failure(
            command_name,
            f"`brew install {' '.join(packages)}` failed. "
            f"{f'Last output: {extra}. ' if extra else ''}"
            "Check network access, Homebrew health, or package build requirements, then rerun the script.",
        )
        return False
    apply_brew_shellenv(brew_path)
    resolved = resolve_command_path(command_name)
    if not resolved:
        remember_install_failure(
            command_name,
            f"{display_name} was installed through Homebrew, but `{command_name}` is still unavailable in the current shell. "
            "Open a new terminal window or run `eval \"$(brew shellenv)\"`, then rerun the script.",
        )
        return False
    clear_install_failure(command_name)
    return True


def detect_linux_package_manager() -> tuple[str, str] | None:
    for name in ("apt-get", "dnf", "yum", "pacman", "zypper", "apk", "brew"):
        resolved = resolve_command_path(name)
        if resolved:
            return name, resolved
    return None


def install_linux_package_group(display_name: str, packages_by_manager: Mapping[str, Sequence[str]]) -> bool:
    detected = detect_linux_package_manager()
    if not detected:
        return False

    manager_name, manager_path = detected
    packages = tuple(packages_by_manager.get(manager_name, ()))
    if not packages:
        return False

    print_step(f"Auto-install missing tool: {display_name}")
    if manager_name == "apt-get":
        return run_interactive_command(with_optional_sudo([manager_path, "update"])) and run_interactive_command(
            with_optional_sudo([manager_path, "install", "-y", *packages])
        )
    if manager_name == "dnf":
        return run_interactive_command(with_optional_sudo([manager_path, "install", "-y", *packages]))
    if manager_name == "yum":
        return run_interactive_command(with_optional_sudo([manager_path, "install", "-y", *packages]))
    if manager_name == "pacman":
        return run_interactive_command(with_optional_sudo([manager_path, "-Sy", "--noconfirm", *packages]))
    if manager_name == "zypper":
        return run_interactive_command(with_optional_sudo([manager_path, "--non-interactive", "install", *packages]))
    if manager_name == "apk":
        return run_interactive_command(with_optional_sudo([manager_path, "add", *packages]))
    if manager_name == "brew":
        return run_interactive_command([manager_path, "install", *packages])
    return False


def try_auto_install_windows_command(name: str) -> bool:
    if not IS_WINDOWS:
        return False

    normalized = name.lower()
    if normalized in {"node", "node.exe"}:
        return install_windows_package("Node.js LTS", ("OpenJS.NodeJS.LTS", "OpenJS.NodeJS"))
    if normalized in {"go", "go.exe"}:
        return install_windows_package("Go", ("GoLang.Go",))
    if normalized in {"clang", "clang.exe"}:
        return install_windows_package("LLVM/Clang", ("LLVM.LLVM",))
    if normalized in {"pnpm", "pnpm.cmd"}:
        if not resolve_command_path("node") and not try_auto_install_windows_command("node"):
            return False
        refresh_windows_fallback_path_entries()
        print_step("Auto-install missing tool: pnpm")
        corepack_command = resolve_command_path("corepack") or resolve_command_path("corepack.cmd")
        if corepack_command:
            try_run_command([corepack_command, "enable"])
            try_run_command([corepack_command, "prepare", "pnpm@latest", "--activate"])
            refresh_windows_fallback_path_entries()
            if resolve_command_path(name):
                return True
        npm_command = resolve_command_path("npm") or resolve_command_path("npm.cmd")
        if npm_command and try_run_command([npm_command, "install", "-g", "pnpm"]):
            refresh_windows_fallback_path_entries()
            if resolve_command_path(name):
                return True
        return False
    return False


def try_auto_install_macos_command(name: str) -> bool:
    if not is_macos():
        return False

    normalized = name.lower()
    if normalized == "brew":
        return try_install_homebrew_on_macos()
    if normalized in {"clang", "xcrun", "xcode-select"}:
        if macos_command_line_tools_ready() and resolve_command_path(normalized):
            clear_install_failure(normalized)
            return True
        return False
    if normalized == "git":
        if macos_command_line_tools_ready() and resolve_command_path("git"):
            clear_install_failure("git")
            return True
        return install_macos_brew_package("git", "Git", ("git",))
    if normalized == "node":
        return install_macos_brew_package("node", "Node.js", ("node",))
    if normalized == "go":
        return install_macos_brew_package("go", "Go", ("go",))
    if normalized == "pnpm":
        if not resolve_command_path("node") and not try_auto_install_macos_command("node"):
            remember_install_failure("pnpm", "pnpm requires Node.js, but Node.js is still unavailable on this macOS machine.")
            return False
        print_step("Auto-install missing tool: pnpm")
        corepack_command = resolve_command_path("corepack")
        if corepack_command:
            try_run_command([corepack_command, "enable"])
            try_run_command([corepack_command, "prepare", "pnpm@latest", "--activate"])
            if resolve_command_path(name):
                clear_install_failure("pnpm")
                return True
        return install_macos_brew_package("pnpm", "pnpm", ("pnpm",))
    return False


def try_auto_install_linux_command(name: str) -> bool:
    if not is_linux():
        return False

    normalized = name.lower()
    if normalized == "node":
        return install_linux_package_group(
            "Node.js",
            {
                "apt-get": ("nodejs", "npm"),
                "dnf": ("nodejs", "npm"),
                "yum": ("nodejs", "npm"),
                "pacman": ("nodejs", "npm"),
                "zypper": ("nodejs", "npm"),
                "apk": ("nodejs", "npm"),
                "brew": ("node",),
            },
        )
    if normalized == "go":
        return install_linux_package_group(
            "Go",
            {
                "apt-get": ("golang-go",),
                "dnf": ("golang",),
                "yum": ("golang",),
                "pacman": ("go",),
                "zypper": ("go",),
                "apk": ("go",),
                "brew": ("go",),
            },
        )
    if normalized == "pnpm":
        if not resolve_command_path("node") and not try_auto_install_linux_command("node"):
            return False
        print_step("Auto-install missing tool: pnpm")
        corepack_command = resolve_command_path("corepack")
        if corepack_command:
            try_run_command([corepack_command, "enable"])
            try_run_command([corepack_command, "prepare", "pnpm@latest", "--activate"])
            if resolve_command_path(name):
                return True
        npm_command = resolve_command_path("npm")
        if npm_command and run_interactive_command(with_optional_sudo([npm_command, "install", "-g", "pnpm"])):
            if resolve_command_path(name):
                return True
        return install_linux_package_group(
            "pnpm",
            {
                "pacman": ("pnpm",),
                "brew": ("pnpm",),
            },
        )
    return False


def try_install_linux_compiler(target: BuildTarget) -> bool:
    host_arch = resolve_host_arch()
    same_arch = target.arch == host_arch
    if target.arch == "arm64" and not same_arch:
        return install_linux_package_group(
            "Linux arm64 C compiler",
            {
                "apt-get": ("gcc-aarch64-linux-gnu", "g++-aarch64-linux-gnu"),
                "dnf": ("gcc-aarch64-linux-gnu",),
                "yum": ("gcc-aarch64-linux-gnu",),
                "zypper": ("cross-aarch64-gcc",),
                "apk": ("gcc", "musl-dev"),
            },
        )
    if target.arch == "x64" and not same_arch:
        return install_linux_package_group(
            "Linux x64 C compiler",
            {
                "apt-get": ("gcc-x86-64-linux-gnu", "g++-x86-64-linux-gnu"),
                "dnf": ("gcc", "gcc-c++"),
                "yum": ("gcc", "gcc-c++"),
                "zypper": ("gcc", "gcc-c++"),
                "apk": ("gcc", "musl-dev"),
            },
        )
    return install_linux_package_group(
        "Linux C compiler",
        {
            "apt-get": ("build-essential", "musl-tools"),
            "dnf": ("gcc", "gcc-c++", "make"),
            "yum": ("gcc", "gcc-c++", "make"),
            "pacman": ("base-devel", "musl"),
            "zypper": ("gcc", "gcc-c++", "make"),
            "apk": ("build-base", "musl-dev"),
            "brew": ("gcc",),
        },
    )


def build_missing_command_message(name: str) -> str:
    base = f"Required command not found: {name}"
    detail = related_install_failure(name)
    if IS_WINDOWS:
        if name in {"node", "pnpm", "pnpm.cmd", "go"}:
            return (
                f"{base}. Automatic installation was attempted on Windows but the tool is still unavailable. "
                f"{detail + ' ' if detail else ''}Check winget availability, network access, or install the tool manually and rerun the script."
            )
        return base
    if is_macos():
        if name in {"clang", "xcrun", "xcode-select"}:
            return (
                f"{base}. Automatic install was attempted on macOS. "
                f"{detail + ' ' if detail else ''}Xcode Command Line Tools are required for desktop compilation. "
                "If the command is still missing, complete the Xcode Command Line Tools installation and rerun the script."
            )
        if name == "node":
            return (
                f"{base}. Automatic install was attempted on macOS. "
                f"{detail + ' ' if detail else ''}If the command is still missing, install Homebrew or Node manually, then rerun the script."
            )
        if name == "pnpm":
            return (
                f"{base}. Automatic install was attempted on macOS. "
                f"{detail + ' ' if detail else ''}If the command is still missing, enable corepack, install Homebrew, or install pnpm manually, then rerun the script."
            )
        if name == "go":
            return (
                f"{base}. Automatic install was attempted on macOS. "
                f"{detail + ' ' if detail else ''}If the command is still missing, install Homebrew or Go manually, then rerun the script."
            )
    if is_linux():
        if name in {"node", "pnpm", "go"}:
            return (
                f"{base}. Automatic installation was attempted on Linux but the tool is still unavailable. "
                f"{detail + ' ' if detail else ''}Check sudo permission, package manager availability, network access, or install the tool manually and rerun the script."
            )
    return base


def require_command(name: str) -> None:
    resolved = resolve_command_path(name)
    if not resolved:
        if (
            try_auto_install_windows_command(name)
            or try_auto_install_macos_command(name)
            or try_auto_install_linux_command(name)
        ):
            resolved = resolve_command_path(name)
    if not resolved:
        raise RuntimeError(build_missing_command_message(name))
    clear_install_failure(name)
    prepend_path_entry(Path(resolved).parent)


def ensure_macos_build_prerequisites() -> None:
    if not is_macos():
        return
    if not macos_command_line_tools_ready():
        if not try_install_macos_command_line_tools_headless():
            prompt_macos_command_line_tools_gui_install()
            raise RuntimeError(build_missing_command_message("clang"))
    require_command("xcrun")
    require_command("clang")


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
        details: list[str] = []
        for label, text in (("stdout", result.stdout), ("stderr", result.stderr)):
            text = (text or "").strip()
            if not text:
                continue
            lines = text.splitlines()
            if len(lines) > 60:
                lines = ["... output truncated ...", *lines[-60:]]
            details.append(f"{label}:\n" + "\n".join(lines))
        suffix = "\n" + "\n".join(details) if details else ""
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}{suffix}")
    return result


def resolve_go_proxy() -> str:
    explicit_proxy = os.environ.get("SOURCEFLOW_GOPROXY", "").strip()
    if explicit_proxy:
        return explicit_proxy
    inherited_proxy = os.environ.get("GOPROXY", "").strip()
    if inherited_proxy and inherited_proxy not in {"https://proxy.golang.org", "https://proxy.golang.org,direct"}:
        return inherited_proxy
    return DEFAULT_GO_PROXY


def go_command_env(extra: Mapping[str, str] | None = None) -> dict[str, str]:
    env = {
        "GO111MODULE": "on",
        "GOPROXY": resolve_go_proxy(),
    }
    if extra:
        env.update({key: str(value) for key, value in extra.items()})
    return env


def is_transient_go_error(output: str) -> bool:
    lowered = output.lower()
    return any(marker in lowered for marker in GO_TRANSIENT_ERROR_MARKERS)


def print_completed_process_output(result: subprocess.CompletedProcess[str]) -> None:
    if result.stdout:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n", flush=True)
    if result.stderr:
        print(result.stderr, end="" if result.stderr.endswith("\n") else "\n", flush=True)


def format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes, remaining_seconds = divmod(seconds, 60)
    return f"{int(minutes)}m {remaining_seconds:.0f}s"


def build_command_failure_message(command: Sequence[str | os.PathLike[str]], result: subprocess.CompletedProcess[str]) -> str:
    details: list[str] = []
    for label, text in (("stdout", result.stdout), ("stderr", result.stderr)):
        text = (text or "").strip()
        if not text:
            continue
        lines = text.splitlines()
        if len(lines) > 60:
            lines = ["... output truncated ...", *lines[-60:]]
        details.append(f"{label}:\n" + "\n".join(lines))
    suffix = "\n" + "\n".join(details) if details else ""
    return f"Command failed ({result.returncode}): {' '.join(os.fspath(arg) for arg in command)}{suffix}"


def run_parallel_commands(tasks: Sequence[CommandTask], max_workers: int) -> None:
    if not tasks:
        return
    worker_count = max(1, min(max_workers, len(tasks)))
    if worker_count == 1 or len(tasks) == 1:
        for task in tasks:
            task_start = time.monotonic()
            print(f"Started {task.label}", flush=True)
            run(task.args, cwd=task.cwd, env=task.env)
            print(f"Finished {task.label} in {format_duration(time.monotonic() - task_start)}", flush=True)
        return

    print(f"Running {len(tasks)} build task(s) with {worker_count} parallel job(s).", flush=True)
    started_at = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = {
            executor.submit(run, task.args, cwd=task.cwd, env=task.env, capture_output=True, check=False): (task, time.monotonic())
            for task in tasks
        }
        failures: list[tuple[CommandTask, subprocess.CompletedProcess[str]]] = []
        for future in concurrent.futures.as_completed(futures):
            task, task_started_at = futures[future]
            result = future.result()
            print(f"Finished {task.label} in {format_duration(time.monotonic() - task_started_at)}", flush=True)
            print_completed_process_output(result)
            if result.returncode != 0:
                failures.append((task, result))
        print(f"Parallel build tasks finished in {format_duration(time.monotonic() - started_at)}", flush=True)

    if failures:
        task, result = failures[0]
        raise RuntimeError(f"{task.label} failed.\n{build_command_failure_message(task.args, result)}")


def summarize_command_failure_output(output: str, max_lines: int = 120) -> str:
    lines = [line.rstrip() for line in output.splitlines() if line.rstrip()]
    if not lines:
        return ""
    signal_patterns = (
        re.compile(r"^--- FAIL:"),
        re.compile(r"^FAIL\b"),
        re.compile(r"^\s+\S+_test\.go:\d+:"),
        re.compile(r"\b(build failed|setup failed|panic:|fatal error:|undefined:|cannot find|no such file|permission denied)\b", re.IGNORECASE),
    )
    selected: list[str] = []
    for index, line in enumerate(lines):
        if any(pattern.search(line) for pattern in signal_patterns):
            start = max(0, index - 4)
            end = min(len(lines), index + 8)
            selected.extend(lines[start:end])
    if not selected:
        selected = lines[-max_lines:]
    deduped: list[str] = []
    seen: set[str] = set()
    for line in selected:
        if line in seen:
            continue
        seen.add(line)
        deduped.append(line)
    if len(deduped) > max_lines:
        deduped = ["... output truncated ...", *deduped[-max_lines:]]
    return "\n".join(deduped)


def run_go_command(
    args: Sequence[str | os.PathLike[str]],
    *,
    cwd: str | os.PathLike[str] | None = None,
    env: Mapping[str, str] | None = None,
    attempts: int = 4,
) -> subprocess.CompletedProcess[str]:
    merged_go_env = go_command_env(env)
    last_result: subprocess.CompletedProcess[str] | None = None
    for attempt in range(1, attempts + 1):
        result = run(args, cwd=cwd, env=merged_go_env, capture_output=True, check=False)
        if result.returncode == 0:
            print_completed_process_output(result)
            return result
        last_result = result
        output = "\n".join(part for part in (result.stdout, result.stderr) if part)
        if attempt >= attempts or not is_transient_go_error(output):
            print_completed_process_output(result)
            summary = summarize_command_failure_output(output)
            suffix = f"\nGo failure summary:\n{summary}" if summary else ""
            raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(os.fspath(arg) for arg in args)}{suffix}")
        wait_seconds = min(20, attempt * 3)
        print_completed_process_output(result)
        print(
            f"Go command retry {attempt}/{attempts - 1} after transient module/network failure; "
            f"GOPROXY={merged_go_env.get('GOPROXY')}",
            flush=True,
        )
        time.sleep(wait_seconds)
    assert last_result is not None
    print_completed_process_output(last_result)
    output = "\n".join(part for part in (last_result.stdout, last_result.stderr) if part)
    summary = summarize_command_failure_output(output)
    suffix = f"\nGo failure summary:\n{summary}" if summary else ""
    raise RuntimeError(f"Command failed ({last_result.returncode}): {' '.join(os.fspath(arg) for arg in args)}{suffix}")


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


def remove_path_with_retry(path: Path, retries: int = 20, delay_seconds: float = 0.25) -> None:
    for attempt in range(retries):
        try:
            remove_path(path)
            return
        except FileNotFoundError:
            return
        except OSError:
            if attempt == retries - 1:
                raise
            time.sleep(delay_seconds)


def rename_path_with_retry(source: Path, target: Path, retries: int = 20, delay_seconds: float = 0.25) -> None:
    last_error: OSError | None = None
    for attempt in range(retries):
        try:
            source.rename(target)
            return
        except OSError as exc:
            last_error = exc
            if attempt == retries - 1:
                break
            time.sleep(delay_seconds)
    if last_error:
        raise last_error


def clean_broken_pnpm_links() -> None:
    pnpm_root = APP_DIR / "node_modules" / ".pnpm" / "node_modules"
    if not pnpm_root.exists():
        print(f"pnpm hoisted node_modules directory not found, skip cleanup: {pnpm_root}", flush=True)
        return

    removed: list[str] = []
    scan_roots = [pnpm_root]
    scan_roots.extend(path for path in pnpm_root.iterdir() if path.is_dir() and not path.is_symlink())
    for directory in scan_roots:
        for child in directory.iterdir():
            if not child.is_symlink() or child.exists():
                continue
            child.unlink()
            removed.append(child.relative_to(pnpm_root).as_posix())

    if removed:
        print(f"Removed {len(removed)} broken pnpm hoisted package link(s): {', '.join(removed)}", flush=True)
    else:
        print("No broken pnpm hoisted package links found.", flush=True)


def resolve_node_module(module_request: str, label: str) -> Path:
    result = run(
        [
            "node",
            "-e",
            "process.stdout.write(require.resolve(process.argv[1], { paths: [process.cwd()] }))",
            module_request,
        ],
        cwd=APP_DIR,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"{label} is not installed under app/node_modules. "
            "Remove --skip-install or run pnpm install in app first."
        )
    cli_path = Path(result.stdout.strip())
    if not cli_path.exists():
        raise RuntimeError(f"{label} was resolved but does not exist: {cli_path}")
    return cli_path


def resolve_electron_builder_cli() -> Path:
    return resolve_node_module("electron-builder/cli.js", "electron-builder")


def resolve_webpack_cli() -> Path:
    return resolve_node_module("webpack/bin/webpack.js", "webpack")


def write_unsigned_mac_config(source_path: Path, target_path: Path) -> None:
    if not source_path.is_file():
        raise RuntimeError(f"macOS portable config is missing: {source_path}")
    filtered_lines = [
        line
        for line in source_path.read_text(encoding="utf-8").splitlines()
        if not re.match(r"^\s{2}(identity|provisioningProfile|hardenedRuntime|entitlements|entitlementsInherit):", line)
    ]
    target_path.write_text(os.linesep.join(filtered_lines) + os.linesep, encoding="utf-8")


def should_use_unsigned_mac_config(args: argparse.Namespace) -> bool:
    if args.signed:
        return False
    profile_path = PROJECT_ROOT.parent / "SourceFlow.provisionprofile"
    entitlements_path = PROJECT_ROOT.parent / "entitlements.mas.plist"
    return not profile_path.exists() or not entitlements_path.exists()


def mac_installer_config_name(target: BuildTarget) -> str:
    if target.arch == "arm64":
        return "electron-builder-darwin-arm64.yml"
    return "electron-builder-darwin.yml"


def electron_builder_env(extra: Mapping[str, str] | None = None) -> dict[str, str]:
    env = {
        "ELECTRON_MIRROR": os.environ.get("ELECTRON_MIRROR", "https://npmmirror.com/mirrors/electron/"),
        "NODE_OPTIONS": " ".join(part for part in (os.environ.get("NODE_OPTIONS", ""), "--no-deprecation") if part),
    }
    if extra:
        env.update({key: str(value) for key, value in extra.items()})
    return env


def electron_builder_platform_args(target: BuildTarget) -> list[str]:
    if target.platform_key == "win":
        return ["--win"]
    if target.platform_key == "linux":
        return ["--linux"]
    if target.platform_key == "mac":
        return ["--mac"]
    raise RuntimeError(f"Unsupported electron-builder platform: {target.platform_key}")


def electron_builder_arch_args(target: BuildTarget) -> list[str]:
    if target.arch == "x64":
        return ["--x64"]
    if target.arch == "arm64":
        return ["--arm64"]
    raise RuntimeError(f"Unsupported electron-builder architecture: {target.arch}")


def pick_windows_compiler(target: BuildTarget, args: argparse.Namespace) -> str:
    candidates: list[str] = []
    if args.cc:
        candidates.append(args.cc)

    arch_specific_env = "SOURCEFLOW_WINDOWS_ARM64_CC" if target.arch == "arm64" else "SOURCEFLOW_WINDOWS_X64_CC"
    if os.environ.get(arch_specific_env):
        candidates.append(os.environ[arch_specific_env])
    if os.environ.get("SOURCEFLOW_WINDOWS_CC"):
        candidates.append(os.environ["SOURCEFLOW_WINDOWS_CC"])

    if target.arch == "arm64":
        candidates.extend(("aarch64-w64-mingw32-gcc", "clang"))
    else:
        candidates.extend(("x86_64-w64-mingw32-gcc", "gcc", "clang"))

    for candidate in candidates:
        if Path(candidate).exists() or resolve_command_path(candidate):
            return candidate

    if try_auto_install_windows_command("clang"):
        clang = resolve_command_path("clang")
        if clang:
            return clang

    raise RuntimeError(
        f"{target.display_name} kernel builds require a usable C compiler. "
        "Install LLVM/Clang, MSYS2 MinGW, pass --cc, or set SOURCEFLOW_WINDOWS_CC."
    )


def pick_linux_compiler(target: BuildTarget, args: argparse.Namespace) -> str:
    if args.cc:
        require_command(args.cc)
        return args.cc

    host_arch = resolve_host_arch()
    same_arch = target.arch == host_arch
    candidates: list[str] = []
    if not args.dynamic:
        if target.arch == "arm64":
            candidates.append("aarch64-linux-musl-gcc")
        else:
            candidates.append("x86_64-linux-musl-gcc")
        candidates.append("musl-gcc")
    if target.arch == "arm64":
        candidates.append("aarch64-linux-gnu-gcc")
    elif target.arch == "x64":
        candidates.append("x86_64-linux-gnu-gcc")
    if same_arch:
        candidates.extend(("gcc", "clang"))

    for candidate in candidates:
        if resolve_command_path(candidate):
            return candidate
    if try_install_linux_compiler(target):
        for candidate in candidates:
            if resolve_command_path(candidate):
                return candidate
    raise RuntimeError("No usable C compiler found. Install a musl compiler or gcc/clang, or pass --cc.")


def install_app_dependencies(target: BuildTarget) -> None:
    print_step("Install app dependencies")
    install_args = [PNPM, "install"]
    if target.platform_key != "win" or is_wsl():
        install_args.append("--force")
    try:
        run(install_args, cwd=APP_DIR, env=with_ci_env())
    except RuntimeError as exc:
        if target.platform_key != "win" or "EACCES" not in str(exc).upper():
            raise
        print("pnpm install hit an inaccessible app/node_modules entry. Rebuilding app/node_modules and retrying once.", flush=True)
        remove_path(APP_DIR / "node_modules")
        if "--force" not in install_args:
            install_args.append("--force")
        run(install_args, cwd=APP_DIR, env=with_ci_env())
    write_app_dependency_stamp()


def app_dependency_inputs() -> tuple[Path, ...]:
    return tuple(
        path
        for path in (
            APP_PACKAGE_PATH,
            APP_DIR / "pnpm-lock.yaml",
        )
        if path.is_file()
    )


def app_dependency_fingerprint() -> str:
    digest = hashlib.sha256()
    for path in app_dependency_inputs():
        digest.update(path.name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def write_app_dependency_stamp() -> None:
    APP_DEPENDENCY_STAMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    APP_DEPENDENCY_STAMP_PATH.write_text(
        json.dumps({"fingerprint": app_dependency_fingerprint()}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def app_dependencies_look_current() -> bool:
    modules_yaml = APP_DIR / "node_modules" / ".modules.yaml"
    if not modules_yaml.is_file():
        return False

    inputs = app_dependency_inputs()
    if not inputs:
        return False

    if APP_DEPENDENCY_STAMP_PATH.is_file():
        try:
            stamp = json.loads(APP_DEPENDENCY_STAMP_PATH.read_text(encoding="utf-8"))
            if stamp.get("fingerprint") == app_dependency_fingerprint():
                return True
        except (OSError, json.JSONDecodeError):
            pass

    installed_at = modules_yaml.stat().st_mtime
    return installed_at >= max(path.stat().st_mtime for path in inputs)


def ensure_app_dependencies(target: BuildTarget, args: argparse.Namespace) -> None:
    if args.skip_install:
        print_step("Install app dependencies skipped")
        print("Dependency installation was skipped by --skip-install or --fast.", flush=True)
        return
    if not args.install and app_dependencies_look_current():
        print_step("Install app dependencies")
        print("app/node_modules is current; pnpm install skipped.", flush=True)
        return
    install_app_dependencies(target)


def is_wsl() -> bool:
    if not is_linux():
        return False
    if os.environ.get("WSL_DISTRO_NAME") or os.environ.get("WSL_INTEROP"):
        return True
    version_path = Path("/proc/version")
    if not version_path.is_file():
        return False
    return "microsoft" in version_path.read_text(encoding="utf-8", errors="ignore").lower()


FRONTEND_TARGET_ORDER = ("app", "mobile", "desktop", "export")
FRONTEND_BUILD_CONFIGS: dict[str, tuple[str, ...]] = {
    "app": (),
    "mobile": ("--config", "webpack.mobile.js"),
    "desktop": ("--config", "webpack.desktop.js"),
    "export": ("--config", "webpack.export.js"),
}
FRONTEND_REQUIRED_OUTPUTS: dict[str, tuple[Path, ...]] = {
    "app": (APP_DIR / "stage" / "build" / "app" / "index.html",),
    "mobile": (APP_DIR / "stage" / "build" / "mobile" / "index.html",),
    "desktop": (APP_DIR / "stage" / "build" / "desktop" / "index.html",),
    "export": (APP_DIR / "stage" / "build" / "export" / "protyle-method.js",),
}


def resolve_parallel_jobs(args: argparse.Namespace) -> int:
    requested_jobs = int(getattr(args, "jobs", 0) or 0)
    if requested_jobs < 0:
        raise RuntimeError("--jobs must be 0 or a positive integer.")
    if requested_jobs > 0:
        return requested_jobs
    return max(1, min(4, os.cpu_count() or 2))


def parse_frontend_targets(raw_targets: str) -> list[str]:
    raw_targets = (raw_targets or "all").strip().lower()
    if raw_targets == "all":
        return list(FRONTEND_TARGET_ORDER)

    targets: list[str] = []
    for raw_target in raw_targets.split(","):
        target = raw_target.strip().lower()
        if not target:
            continue
        if target not in FRONTEND_BUILD_CONFIGS:
            raise RuntimeError(
                f"Unsupported --ui-targets value: {target}. "
                f"Allowed values: all, {', '.join(FRONTEND_TARGET_ORDER)}."
            )
        if target not in targets:
            targets.append(target)
    if not targets:
        raise RuntimeError("--ui-targets cannot be empty. Use all or a comma-separated target list.")
    return targets


def ensure_frontend_outputs(targets: Sequence[str]) -> None:
    for target in targets:
        for output_path in FRONTEND_REQUIRED_OUTPUTS[target]:
            ensure_path_exists(
                output_path,
                f"Frontend {target} build output is missing at {output_path}. "
                "Remove --skip-ui or build that UI target first.",
            )


def build_frontend(args: argparse.Namespace, max_jobs: int | None = None) -> None:
    targets = parse_frontend_targets(args.ui_targets)
    if args.skip_ui:
        ensure_frontend_outputs(targets)
        return
    print_step(f"Build frontend: {', '.join(targets)}")
    if args.skip_install and is_wsl():
        print("WSL detected. If esbuild reports a platform mismatch, rerun without --skip-install.", flush=True)
    webpack_cli = resolve_webpack_cli()
    build_tasks = (
        CommandTask(
            label=f"frontend bundle: {target}",
            args=("node", str(webpack_cli), "--mode", "production", *FRONTEND_BUILD_CONFIGS[target]),
            cwd=APP_DIR,
        )
        for target in targets
    )
    run_parallel_commands(tuple(build_tasks), max_jobs or resolve_parallel_jobs(args))


def build_target_kernel(target: BuildTarget, args: argparse.Namespace) -> None:
    if not target.portable_kernel_dir:
        raise RuntimeError(f"Kernel output directory is not configured for {target.display_name}")

    kernel_binary = target.portable_kernel_dir / target.portable_kernel_binary
    if args.skip_kernel:
        ensure_path_exists(
            kernel_binary,
            f"Kernel binary is missing at {kernel_binary}. Remove --skip-kernel or build it first.",
        )
        return

    print_step("Build kernel")
    remove_path(target.portable_kernel_dir)
    target.portable_kernel_dir.mkdir(parents=True, exist_ok=True)

    env = go_command_env({
        "CGO_ENABLED": "1",
        "GOOS": target.goos,
        "GOARCH": target.goarch,
    })

    if target.platform_key == "win":
        maybe_run_goversioninfo()
        env["CC"] = pick_windows_compiler(target, args)
        run_go_command(
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
        elevator_source = APP_DIR / "elevator" / f"elevator-{'arm64' if target.arch == 'arm64' else 'amd64'}.exe"
        elevator_target = target.portable_kernel_dir / "elevator.exe"
        ensure_path_exists(elevator_source, f"Portable build requires {elevator_source}")
        shutil.copy2(elevator_source, elevator_target)
        return

    if target.platform_key == "linux":
        compiler = pick_linux_compiler(target, args)
        env["CC"] = compiler
        command = [
            "go",
            "build",
            "-trimpath",
            "-tags",
            "fts5",
            "-o",
            str(kernel_binary),
        ]
        if not args.dynamic and "musl" in compiler.lower():
            command.extend(["-buildmode=pie", "-ldflags", "-s -w -extldflags -static-pie"])
        else:
            command.extend(["-ldflags", "-s -w"])
        command.append(".")
        run_go_command(command, cwd=KERNEL_DIR, env=env)
        return

    compiler = args.cc or "clang"
    require_command(compiler)
    env["CC"] = compiler
    run_go_command(
        [
            "go",
            "build",
            "-tags",
            "fts5",
            "-o",
            str(kernel_binary),
            "-ldflags",
            "-s -w",
            ".",
        ],
        cwd=KERNEL_DIR,
        env=env,
    )


def make_windows_portable_dir() -> None:
    build_dir = APP_DIR / "build"
    source_dir = build_dir / "win-unpacked"
    target_dir = build_dir / "sourceflow-portable"
    if not source_dir.exists():
        if target_dir.exists():
            print(f"Portable directory already available: {target_dir}", flush=True)
            return
        raise RuntimeError(f"Portable source directory not found: {source_dir}")

    remove_path_with_retry(target_dir)
    try:
        rename_path_with_retry(source_dir, target_dir)
    except OSError as exc:
        temp_target_dir = build_dir / f"{target_dir.name}.tmp-{os.getpid()}"
        print(f"Portable directory rename was blocked by the OS, retrying through copy fallback: {exc}", flush=True)
        remove_path_with_retry(temp_target_dir)
        shutil.copytree(source_dir, temp_target_dir)
        remove_path_with_retry(target_dir)
        rename_path_with_retry(temp_target_dir, target_dir)
        try:
            remove_path_with_retry(source_dir)
        except OSError as cleanup_error:
            print(f"Portable copy fallback succeeded; delayed cleanup for {source_dir}: {cleanup_error}", flush=True)
    (target_dir / ".sf-portable").write_text("portable\n", encoding="utf-8")
    print(f"Portable directory ready: {target_dir}", flush=True)


def prepare_build_inputs(target: BuildTarget, args: argparse.Namespace) -> None:
    total_jobs = resolve_parallel_jobs(args)
    can_prepare_in_parallel = total_jobs > 1 and not args.skip_ui and not args.skip_kernel
    if not can_prepare_in_parallel:
        build_frontend(args, total_jobs)
        build_target_kernel(target, args)
        return

    print_step("Prepare frontend and kernel in parallel")
    frontend_jobs = max(1, total_jobs - 1)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        futures = (
            executor.submit(build_frontend, args, frontend_jobs),
            executor.submit(build_target_kernel, target, args),
        )
        for future in concurrent.futures.as_completed(futures):
            future.result()


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
    web_clipper_dir = PROJECT_ROOT / WEB_CLIPPER_RELATIVE_DIR
    manifest_path = web_clipper_dir / "manifest.json"
    manifest_version = load_version_field(
        manifest_path,
        f"{WEB_CLIPPER_RELATIVE_DIR.as_posix()}/manifest.json",
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
    versioned_zip_path = dist_dir / f"{WEB_CLIPPER_ARCHIVE_STEM}-{manifest_version}.zip"
    write_web_clipper_archive(stable_zip_path, web_clipper_dir, source_files)
    write_web_clipper_archive(versioned_zip_path, web_clipper_dir, source_files)
    return stable_zip_path, versioned_zip_path


def load_json_object(path: Path, label: str) -> dict[str, object]:
    if not path.is_file():
        raise RuntimeError(f"Required JSON file not found: {label}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected a JSON object in {label}")
    return data


def normalize_audit_path(path: Path) -> str:
    return path.as_posix().lstrip("./")


def run_sourceflow_architecture_audit() -> None:
    scan_roots = (
        PROJECT_ROOT / "app",
        PROJECT_ROOT / "kernel",
        PROJECT_ROOT / "scripts",
        PROJECT_ROOT / "package.json",
        PROJECT_ROOT / "SourceFlow工作区迁移说明.md",
        PROJECT_ROOT / "迁移旧工作区到SourceFlow.py",
    )
    skipped_dirs = {".git", "build", "node_modules", "stage", "third_party"}
    allowed_files = {
        "app/electron/workspaceMigration.js",
        "迁移旧工作区到SourceFlow.py",
        "app/src/asset/pdf/pdf_page_view.js",
        "app/src/asset/pdf/pdf_thumbnail_view.js",
        "scripts/audit-brand-cleanup.js",
    }
    text_extensions = {
        ".go",
        ".js",
        ".json",
        ".md",
        ".py",
        ".ps1",
        ".scss",
        ".sh",
        ".ts",
        ".tsx",
        ".yml",
        ".yaml",
    }
    forbidden_patterns = (
        ("legacy brand", re.compile(r"\bSiyuan\b|思源|SIYUAN_", re.IGNORECASE)),
        ("legacy hidden workspace", re.compile(r"\.siyuan|siyuan\.db|siyuan\.log", re.IGNORECASE)),
        ("legacy document suffix", re.compile(r"\.sy\b", re.IGNORECASE)),
        ("legacy frontend prefix", re.compile(r"sy__")),
        ("legacy internal naming", re.compile(r"\bSiyuanMenu\b|\bsyFiles\b|\bsyPaths\b|\bsyPath\b|\bsyConflict\b|\blistSyFiles\b")),
    )
    findings: list[str] = []

    def should_skip(path: Path) -> bool:
        try:
            relative_parts = path.relative_to(PROJECT_ROOT).parts
        except ValueError:
            relative_parts = path.parts
        return any(part in skipped_dirs for part in relative_parts)

    def visit(path: Path) -> None:
        if not path.exists() or should_skip(path):
            return
        if path.is_dir():
            for child in sorted(path.iterdir(), key=lambda item: item.name.lower()):
                visit(child)
            return
        if path.suffix.lower() not in text_extensions:
            return
        rel = normalize_audit_path(path.relative_to(PROJECT_ROOT))
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError as exc:
            findings.append(f"{rel}: read failed: {exc}")
            return
        for line_number, line in enumerate(lines, start=1):
            for name, pattern in forbidden_patterns:
                if not pattern.search(line):
                    continue
                if rel in allowed_files:
                    break
                findings.append(f"{rel}:{line_number}: {name}: {line.strip()}")
                break

    for root in scan_roots:
        visit(root)

    if findings:
        detail = "\n".join(findings[:80])
        remaining = len(findings) - 80
        if remaining > 0:
            detail += f"\n... {remaining} more finding(s)"
        raise RuntimeError(f"SourceFlow architecture audit failed:\n{detail}")


def hash_file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def zip_directory_for_smoke(source_dir: Path, output_zip: Path) -> None:
    excluded_dirs = {"dist", "node_modules", "__pycache__"}
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source_dir.rglob("*")):
            if path.is_dir():
                continue
            rel = path.relative_to(source_dir)
            if any(part in excluded_dirs for part in rel.parts):
                continue
            if path.name in {".DS_Store", "Thumbs.db"} or path.suffix == ".pyc":
                continue
            archive.write(path, rel.as_posix())


def find_plugin_manifest_paths() -> list[Path]:
    manifest_paths: list[Path] = []
    for root in (PROJECT_ROOT / "plugins", PROJECT_ROOT / "examples" / "plugins"):
        if not root.is_dir():
            continue
        for manifest_path in sorted(root.rglob("plugin.json")):
            if "dist" in manifest_path.parts or "node_modules" in manifest_path.parts:
                continue
            manifest_paths.append(manifest_path)
    return manifest_paths


def validate_plugin_manifest_for_smoke(manifest_path: Path, temp_dir: Path) -> None:
    plugin_dir = manifest_path.parent
    rel = normalize_audit_path(manifest_path.relative_to(PROJECT_ROOT))
    manifest = load_json_object(manifest_path, rel)
    name = str(manifest.get("name", "")).strip()
    version = str(manifest.get("version", "")).strip()
    entry = str(manifest.get("entry", "")).strip()
    permissions = manifest.get("permissions", [])
    allowed_require_modules = manifest.get("allowedRequireModules", [])

    if manifest.get("manifestVersion") != 1:
        raise RuntimeError(f"{rel}: manifestVersion must be 1")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", name):
        raise RuntimeError(f"{rel}: plugin name must use lowercase kebab-case")
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", version):
        raise RuntimeError(f"{rel}: plugin version must be semver")
    if not entry:
        raise RuntimeError(f"{rel}: entry is required")
    if not (plugin_dir / entry).is_file():
        raise RuntimeError(f"{rel}: entry file does not exist: {entry}")
    if not isinstance(permissions, list) or any(not isinstance(item, str) or not item.strip() for item in permissions):
        raise RuntimeError(f"{rel}: permissions must be a string array")
    if len(permissions) != len(set(permissions)):
        raise RuntimeError(f"{rel}: permissions contains duplicates")
    if not isinstance(allowed_require_modules, list) or any(not isinstance(item, str) for item in allowed_require_modules):
        raise RuntimeError(f"{rel}: allowedRequireModules must be a string array")

    code = "\n".join(path.read_text(encoding="utf-8", errors="replace") for path in plugin_dir.glob("*.js"))
    permission_set = set(permissions)
    allowed_require_set = set(allowed_require_modules)
    if re.search(r"\bfetch\s*\(|\bXMLHttpRequest\b", code) and "network.http" not in permission_set:
        raise RuntimeError(f"{rel}: network API usage must declare network.http")
    if re.search(r"\bnew\s+Worker\s*\(", code) and "runtime.worker" not in permission_set:
        raise RuntimeError(f"{rel}: Worker usage must declare runtime.worker")
    for required_module in re.findall(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)", code):
        if required_module == "sourceflow":
            continue
        if required_module not in allowed_require_set:
            raise RuntimeError(f"{rel}: require({required_module!r}) is not declared in allowedRequireModules")

    archive_path = temp_dir / f"{name}-{version}.zip"
    zip_directory_for_smoke(plugin_dir, archive_path)
    if not archive_path.is_file() or archive_path.stat().st_size == 0:
        raise RuntimeError(f"{rel}: plugin package smoke produced an empty archive")


def validate_bazaar_submissions_for_smoke() -> None:
    submissions_dir = PROJECT_ROOT / "marketplace" / "sourceflow-bazaar" / "submissions" / "plugins"
    if not submissions_dir.is_dir():
        return
    for submission_path in sorted(submissions_dir.glob("*.json")):
        rel = normalize_audit_path(submission_path.relative_to(PROJECT_ROOT))
        submission = load_json_object(submission_path, rel)
        package_info = submission.get("package")
        if not isinstance(package_info, dict):
            raise RuntimeError(f"{rel}: package object is required")
        name = str(package_info.get("name", "")).strip()
        version = str(package_info.get("version", "")).strip()
        archive_sha256 = str(package_info.get("archiveSHA256", "")).strip()
        url = str(submission.get("url", "")).strip()
        if not name or not version or not archive_sha256 or not url:
            raise RuntimeError(f"{rel}: url, package.name, package.version, and archiveSHA256 are required")
        if "@" not in url or "/" not in url:
            raise RuntimeError(f"{rel}: url must be owner/repo@content-hash")
        owner_repo, content_hash = url.split("@", 1)
        owner, repo = owner_repo.split("/", 1)
        archive_path = PROJECT_ROOT / "marketplace" / "sourceflow-bazaar" / "packages" / "package" / owner / f"{repo}@{content_hash}.zip"
        if archive_path.is_file():
            actual_sha256 = hash_file_sha256(archive_path)
            if actual_sha256 != archive_sha256:
                raise RuntimeError(f"{rel}: archiveSHA256 mismatch for {normalize_audit_path(archive_path.relative_to(PROJECT_ROOT))}")


def run_plugin_isolation_smoke() -> None:
    manifest_paths = find_plugin_manifest_paths()
    if not manifest_paths:
        print("Plugin isolation smoke skipped: no local plugin manifests found under plugins/ or examples/plugins/.", flush=True)
        return
    with tempfile.TemporaryDirectory(prefix="sourceflow-plugin-smoke-") as temp:
        temp_dir = Path(temp)
        for manifest_path in manifest_paths:
            validate_plugin_manifest_for_smoke(manifest_path, temp_dir)
    validate_bazaar_submissions_for_smoke()


def run_product_quality_docs_audit() -> None:
    required_files = (
        PROJECT_ROOT / "docs" / "TESTING.md",
        PROJECT_ROOT / "docs" / "OPERATIONS.md",
        PROJECT_ROOT / "docs" / "RELEASE_ROLLBACK.md",
        PROJECT_ROOT / "docs" / "PRODUCT_QUALITY.md",
        PROJECT_ROOT / "docs" / "PLUGIN_PERMISSIONS.md",
        PROJECT_ROOT / "LICENSE",
        PROJECT_ROOT / "NOTICE.md",
        PROJECT_ROOT / "诊断包.py",
    )
    missing = [normalize_audit_path(path.relative_to(PROJECT_ROOT)) for path in required_files if not path.is_file()]
    if missing:
        print(f"Product quality docs audit skipped missing optional files: {', '.join(missing)}", flush=True)

    required_markers = {
        PROJECT_ROOT / "docs" / "TESTING.md": ("主流程 E2E", "异常退出", "发布阻断规则"),
        PROJECT_ROOT / "docs" / "OPERATIONS.md": ("诊断包", "问题追踪", "发布回滚"),
        PROJECT_ROOT / "docs" / "PRODUCT_QUALITY.md": ("质量目标", "门禁要求", "兼容性要求", "工程边界"),
        PROJECT_ROOT / "docs" / "PLUGIN_PERMISSIONS.md": ("权限原则", "熔断要求", "商城包要求"),
    }
    for path, markers in required_markers.items():
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        missing_markers = [marker for marker in markers if marker not in text]
        if missing_markers:
            rel = normalize_audit_path(path.relative_to(PROJECT_ROOT))
            raise RuntimeError(f"{rel} is missing required section markers: {', '.join(missing_markers)}")


def run_kernel_validation_isolation_audit() -> None:
    findings: list[str] = []
    for script_path in (PROJECT_ROOT / "编译.py", PROJECT_ROOT / "发布.py"):
        rel = normalize_audit_path(script_path.relative_to(PROJECT_ROOT))
        if not script_path.is_file():
            print(f"Kernel validation isolation audit skipped optional script: {rel}", flush=True)
            continue
        text = script_path.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"def validate_kernel_boot\([\s\S]*?(?=\n\ndef |\n\nclass |\Z)", text)
        if not match:
            findings.append(f"{rel}: validate_kernel_boot is missing")
            continue
        body = match.group(0)
        if SOURCEFLOW_CONFIG_DIR_ENV not in body or "sourceflow-kernel-conf-smoke-" not in body:
            findings.append(f"{rel}: kernel smoke validation must use an isolated {SOURCEFLOW_CONFIG_DIR_ENV}")
        if body.count("env=kernel_env") < 2:
            findings.append(f"{rel}: every kernel subprocess in validate_kernel_boot must receive kernel_env")
    if findings:
        raise RuntimeError("Kernel validation isolation audit failed:\n" + "\n".join(findings))


def run_build_quality_gate(parallel_jobs: int) -> None:
    print_step("Script syntax")
    syntax_paths = [
        path
        for path in (
            Path(__file__).resolve(),
            PROJECT_ROOT / "发布.py",
            PROJECT_ROOT / "插件商城.py",
            PROJECT_ROOT / "诊断包.py",
        )
        if path.is_file()
    ]
    run([sys.executable, "-m", "py_compile", *map(str, syntax_paths)], cwd=PROJECT_ROOT)

    print_step("SourceFlow architecture audit")
    run_sourceflow_architecture_audit()
    print("SourceFlow architecture audit passed.", flush=True)

    print_step("Product quality docs audit")
    run_product_quality_docs_audit()
    print("Product quality docs audit passed.", flush=True)

    print_step("Kernel validation isolation audit")
    run_kernel_validation_isolation_audit()
    print("Kernel validation isolation audit passed.", flush=True)

    print_step("Kernel regression tests")
    require_command("go")
    run_go_command(["go", "mod", "download"], cwd=KERNEL_DIR)
    run_go_command(["go", "test", "-p", str(max(1, parallel_jobs)), "-vet=off", "./..."], cwd=KERNEL_DIR)

    print_step("Plugin isolation smoke")
    run_plugin_isolation_smoke()
    print("Plugin isolation smoke passed.", flush=True)

    print_step("Electron startup regression smoke")
    startup_regression = PROJECT_ROOT / "app" / "scripts" / "testElectronStartupFailure.js"
    if startup_regression.is_file():
        require_command("node")
        run(["node", str(startup_regression)], cwd=PROJECT_ROOT)
    else:
        print(f"Electron startup regression smoke skipped: {normalize_audit_path(startup_regression.relative_to(PROJECT_ROOT))} is missing.", flush=True)

    print_step("Frontend typecheck")
    require_command(PNPM)
    run([PNPM, "--dir", "app", "run", "typecheck"], cwd=PROJECT_ROOT)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def fetch_json_url(url: str, timeout: float = 5.0) -> object:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json_url(base_url: str, endpoint: str, payload: Mapping[str, object], timeout: float = 30.0, retries: int = 3) -> object:
    last_error: Exception | None = None
    for attempt in range(retries):
        request = urllib.request.Request(
            url=f"{base_url}{endpoint}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except OSError as exc:
            last_error = exc
            if attempt + 1 >= retries:
                break
            time.sleep(0.5 + attempt * 0.5)
    assert last_error is not None
    raise last_error


def post_multipart_url(
    base_url: str,
    endpoint: str,
    fields: Mapping[str, str],
    files: Sequence[tuple[str, str, bytes, str]],
    timeout: float = 30.0,
    retries: int = 3,
) -> object:
    boundary = f"----SourceFlowBuildSmoke{uuid.uuid4().hex}"
    body = bytearray()

    def append(value: str | bytes) -> None:
        if isinstance(value, str):
            body.extend(value.encode("utf-8"))
        else:
            body.extend(value)

    for name, value in fields.items():
        append(f"--{boundary}\r\n")
        append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n')
        append(value)
        append("\r\n")
    for field_name, file_name, content, content_type in files:
        append(f"--{boundary}\r\n")
        append(f'Content-Disposition: form-data; name="{field_name}"; filename="{file_name}"\r\n')
        append(f"Content-Type: {content_type}\r\n\r\n")
        append(content)
        append("\r\n")
    append(f"--{boundary}--\r\n")

    last_error: Exception | None = None
    for attempt in range(retries):
        request = urllib.request.Request(
            url=f"{base_url}{endpoint}",
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except OSError as exc:
            last_error = exc
            if attempt + 1 >= retries:
                break
            time.sleep(0.5 + attempt * 0.5)
    assert last_error is not None
    raise last_error


def require_api_ok(response: object, label: str) -> object:
    if not isinstance(response, dict) or response.get("code") != 0:
        raise RuntimeError(f"{label} failed: {response!r}")
    return response.get("data")


def extract_notebook_id(data: object) -> str:
    if isinstance(data, dict):
        notebook = data.get("notebook")
        if isinstance(notebook, dict) and isinstance(notebook.get("id"), str):
            return notebook["id"]
        if isinstance(data.get("id"), str):
            return data["id"]
    raise RuntimeError(f"createNotebook returned an unsupported payload: {data!r}")


def search_marker_once(base_url: str, marker: str) -> tuple[bool, str]:
    response = post_json_url(
        base_url,
        "/api/search/fullTextSearchBlock",
        {"query": marker, "page": 1, "pageSize": 10, "method": 0},
        timeout=10,
    )
    data = require_api_ok(response, f"Search marker {marker}")
    if not isinstance(data, dict):
        return False, "search response data is not an object"
    blocks = data.get("blocks")
    if isinstance(blocks, list):
        for block in blocks:
            if isinstance(block, dict) and any(marker in str(block.get(key, "")) for key in ("content", "markdown", "fcontent")):
                return True, ""
    matched = data.get("matchedBlockCount", 0)
    try:
        if int(matched) > 0:
            return True, ""
    except (TypeError, ValueError):
        pass
    return False, f"matchedBlockCount={matched}, blocks={blocks!r}"


def wait_for_search_marker(base_url: str, marker: str, timeout_seconds: int = 45) -> None:
    deadline = time.time() + timeout_seconds
    last_detail = ""
    while time.time() < deadline:
        try:
            found, detail = search_marker_once(base_url, marker)
            if found:
                return
            last_detail = detail
        except Exception as exc:
            last_detail = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f"Search did not find marker {marker!r} within {timeout_seconds}s. Last result: {last_detail}")


def run_kernel_main_note_flow_smoke(base_url: str) -> dict[str, str]:
    marker = f"SF_E2E_{uuid.uuid4().hex}"
    import_marker = f"SF_IMPORT_{uuid.uuid4().hex}"
    import_dir = Path(tempfile.mkdtemp(prefix="sourceflow-import-e2e-"))
    sync_dir = Path(tempfile.mkdtemp(prefix="sourceflow-sync-e2e-"))
    try:
        imported_md = import_dir / "imported.md"
        imported_md.write_text(f"# Imported\n\n{import_marker}\n", encoding="utf-8")

        notebook_data = require_api_ok(
            post_json_url(base_url, "/api/notebook/createNotebook", {"name": f"E2E {marker[:12]}"}),
            "Create notebook",
        )
        notebook_id = extract_notebook_id(notebook_data)
        doc_id = require_api_ok(
            post_json_url(
                base_url,
                "/api/filetree/createDocWithMd",
                {
                    "notebook": notebook_id,
                    "path": "/Main Flow Smoke",
                    "markdown": f"# Main Flow Smoke\n\ninitial {marker}\n",
                },
            ),
            "Create markdown document",
        )
        if not isinstance(doc_id, str) or not doc_id:
            raise RuntimeError(f"createDocWithMd returned an invalid document id: {doc_id!r}")

        upload_data = require_api_ok(
            post_multipart_url(
                base_url,
                "/api/asset/upload",
                {"id": doc_id},
                [("file[]", "sourceflow-e2e-attachment.txt", f"attachment {marker}\n".encode("utf-8"), "text/plain")],
            ),
            "Upload attachment",
        )
        succ_map = upload_data.get("succMap") if isinstance(upload_data, dict) else None
        if not isinstance(succ_map, dict) or not succ_map:
            raise RuntimeError(f"Attachment upload did not return succMap: {upload_data!r}")
        asset_path = str(next(iter(succ_map.values())))

        require_api_ok(
            post_json_url(
                base_url,
                "/api/block/updateBlock",
                {
                    "id": doc_id,
                    "dataType": "markdown",
                    "data": f"# Main Flow Smoke\n\nedited {marker}\n\n[attachment]({asset_path})\n",
                },
            ),
            "Edit document",
        )
        require_api_ok(post_json_url(base_url, "/api/sqlite/flushTransaction", {}), "Flush SQLite transaction")
        wait_for_search_marker(base_url, marker)

        assets_data = require_api_ok(post_json_url(base_url, "/api/asset/getDocAssets", {"id": doc_id}), "Read document assets")
        if asset_path and asset_path not in str(assets_data):
            raise RuntimeError(f"Document assets did not include uploaded asset {asset_path!r}: {assets_data!r}")

        export_data = require_api_ok(
            post_json_url(base_url, "/api/export/exportMdContent", {"id": doc_id, "addTitle": True, "yfm": False}),
            "Export markdown content",
        )
        if marker not in str(export_data):
            raise RuntimeError("Exported markdown content does not contain the edited marker")

        require_api_ok(
            post_json_url(
                base_url,
                "/api/import/importStdMd",
                {"notebook": notebook_id, "localPath": str(imported_md), "toPath": "/"},
                timeout=60,
            ),
            "Import markdown file",
        )
        require_api_ok(post_json_url(base_url, "/api/sqlite/flushTransaction", {}), "Flush import transaction")
        wait_for_search_marker(base_url, import_marker)

        require_api_ok(
            post_json_url(base_url, "/api/repo/initRepoKeyFromPassphrase", {"pass": "sourceflow-local-e2e"}),
            "Initialize repository key",
        )
        require_api_ok(post_json_url(base_url, "/api/repo/createSnapshot", {"memo": f"main-note-e2e {marker}"}, timeout=90), "Create repository snapshot")
        snapshots_data = require_api_ok(post_json_url(base_url, "/api/repo/getRepoSnapshots", {"page": 1}), "List repository snapshots")
        if not isinstance(snapshots_data, dict) or int(snapshots_data.get("totalCount", 0)) < 1:
            raise RuntimeError(f"Repository snapshot list is empty: {snapshots_data!r}")

        require_api_ok(
            post_json_url(
                base_url,
                "/api/sync/setSyncProviderLocal",
                {"local": {"endpoint": str(sync_dir), "timeout": 30, "concurrentReqs": 2}},
            ),
            "Configure local sync provider",
        )
        require_api_ok(post_json_url(base_url, "/api/sync/setSyncProvider", {"provider": 4}), "Select local sync provider")
        require_api_ok(post_json_url(base_url, "/api/sync/setSyncGenerateConflictDoc", {"enabled": True}), "Enable conflict documents")
        require_api_ok(post_json_url(base_url, "/api/sync/setSyncMode", {"mode": 3}), "Set manual sync mode")
        require_api_ok(post_json_url(base_url, "/api/sync/setSyncEnable", {"enabled": True}), "Enable sync")
        require_api_ok(post_json_url(base_url, "/api/sync/performSync", {"upload": True}, timeout=90), "Perform local sync upload")
        sync_data = require_api_ok(post_json_url(base_url, "/api/sync/getSyncDiagnostics", {}), "Read sync diagnostics")
        if not isinstance(sync_data, dict) or not sync_data.get("enabled") or sync_data.get("provider") != 4:
            raise RuntimeError(f"Sync diagnostics are not healthy: {sync_data!r}")
        recent = sync_data.get("recent")
        if not isinstance(recent, list) or not any(isinstance(item, dict) and item.get("status") == "success" for item in recent):
            raise RuntimeError(f"Local sync upload did not report success: {sync_data!r}")
        if not any(sync_dir.rglob("*")):
            raise RuntimeError(f"Local sync endpoint remained empty: {sync_dir}")

        require_api_ok(post_json_url(base_url, "/api/plugins/loadPlugins", {"frontend": "desktop"}), "Load plugins")
        return {"marker": marker, "import_marker": import_marker}
    finally:
        remove_path_with_retry(import_dir, retries=10, delay_seconds=0.1)
        remove_path_with_retry(sync_dir, retries=10, delay_seconds=0.1)


def verify_kernel_main_note_flow_persistence(base_url: str, smoke_state: Mapping[str, str]) -> None:
    marker = smoke_state.get("marker", "")
    import_marker = smoke_state.get("import_marker", "")
    if not marker or not import_marker:
        raise RuntimeError(f"Invalid E2E persistence state: {smoke_state!r}")
    wait_for_search_marker(base_url, marker)
    wait_for_search_marker(base_url, import_marker)
    deadline = time.time() + 30
    last_error = ""
    while time.time() < deadline:
        try:
            require_api_ok(post_json_url(base_url, "/api/sync/getSyncDiagnostics", {}), "Read sync diagnostics after restart")
            return
        except Exception as exc:
            last_error = str(exc)
            time.sleep(0.5)
    raise RuntimeError(f"Read sync diagnostics after restart failed after retries: {last_error}")


def kill_process_tree(pid: int) -> None:
    if pid <= 0:
        return
    if IS_WINDOWS:
        run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False)
        return
    try:
        os.kill(pid, 15)
    except OSError:
        pass


def validate_required_paths(root: Path, relative_paths: Sequence[str], label: str) -> None:
    missing = [relative_path for relative_path in relative_paths if not (root / relative_path).exists()]
    if missing:
        raise RuntimeError(f"{label} is incomplete, missing: {', '.join(missing)}")


def validate_kernel_boot(kernel_path: Path, resources_dir: Path, workspace_dir: Path, expected_version: str, timeout_seconds: int = 120) -> None:
    if not kernel_path.is_file():
        raise RuntimeError(f"Kernel executable not found: {kernel_path}")
    workspace_dir.mkdir(parents=True, exist_ok=True)
    config_dir = Path(tempfile.mkdtemp(prefix="sourceflow-kernel-conf-smoke-"))
    kernel_env = os.environ.copy()
    kernel_env[SOURCEFLOW_CONFIG_DIR_ENV] = str(config_dir)
    port = find_free_port()
    process: subprocess.Popen[str] | None = None
    try:
        process = subprocess.Popen(
            [
                str(kernel_path),
                "--port",
                str(port),
                "--wd",
                str(resources_dir),
                "--workspace",
                str(workspace_dir),
                "--lang",
                "zh_CN",
            ],
            cwd=resources_dir,
            env=kernel_env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            if process is None:
                raise RuntimeError("Kernel process was not started")
            exit_code = process.poll()
            if exit_code is not None:
                raise RuntimeError(f"Kernel exited before ready. exitCode={exit_code}")
            try:
                base_url = f"http://127.0.0.1:{port}"
                version_response = fetch_json_url(f"{base_url}/api/system/version")
                progress_response = fetch_json_url(f"{base_url}/api/system/bootProgress")
            except Exception:
                time.sleep(0.5)
                continue
            if (
                isinstance(version_response, dict)
                and isinstance(progress_response, dict)
                and version_response.get("code") == 0
                and progress_response.get("code") == 0
                and str(version_response.get("data")) == expected_version
                and float(progress_response.get("data", {}).get("progress", 0)) >= 100
            ):
                smoke_state = run_kernel_main_note_flow_smoke(base_url)
                kill_process_tree(process.pid)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                process = None

                restart_port = find_free_port()
                process = subprocess.Popen(
                    [
                        str(kernel_path),
                        "--port",
                        str(restart_port),
                        "--wd",
                        str(resources_dir),
                        "--workspace",
                        str(workspace_dir),
                        "--lang",
                        "zh_CN",
                    ],
                    cwd=resources_dir,
                    env=kernel_env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
                restart_deadline = time.time() + timeout_seconds
                restart_base_url = f"http://127.0.0.1:{restart_port}"
                while time.time() < restart_deadline:
                    restart_exit_code = process.poll()
                    if restart_exit_code is not None:
                        raise RuntimeError(f"Kernel exited before restart persistence check. exitCode={restart_exit_code}")
                    try:
                        restart_progress = fetch_json_url(f"{restart_base_url}/api/system/bootProgress")
                        if isinstance(restart_progress, dict) and restart_progress.get("code") == 0 and float(restart_progress.get("data", {}).get("progress", 0)) >= 100:
                            verify_kernel_main_note_flow_persistence(restart_base_url, smoke_state)
                            return
                    except Exception:
                        pass
                    time.sleep(0.5)
                raise RuntimeError(f"Kernel restart persistence validation timed out after {timeout_seconds}s: {kernel_path}")
            time.sleep(0.5)
        raise RuntimeError(f"Kernel boot validation timed out after {timeout_seconds}s: {kernel_path}")
    finally:
        if process is not None and process.poll() is None:
            kill_process_tree(process.pid)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        remove_path_with_retry(workspace_dir)
        remove_path_with_retry(config_dir)


def resolve_7zip_command() -> str:
    candidates: list[Path | str] = []
    for command in ("7z", "7za", "7zr"):
        resolved = shutil.which(command)
        if resolved:
            candidates.append(resolved)
    if IS_WINDOWS:
        candidates.extend(
            [
                Path(os.environ.get("ProgramFiles", "")) / "7-Zip" / "7z.exe",
                APP_DIR / "node_modules" / ".pnpm" / "7zip-bin@5.2.0" / "node_modules" / "7zip-bin" / "win" / "x64" / "7za.exe",
                APP_DIR / "node_modules" / ".pnpm" / "7zip-bin@5.2.0" / "node_modules" / "7zip-bin" / "win" / "arm64" / "7za.exe",
            ]
        )
    elif sys.platform == "darwin":
        candidates.append(APP_DIR / "node_modules" / ".pnpm" / "7zip-bin@5.2.0" / "node_modules" / "7zip-bin" / "mac" / resolve_host_arch() / "7za")
    else:
        candidates.append(APP_DIR / "node_modules" / ".pnpm" / "7zip-bin@5.2.0" / "node_modules" / "7zip-bin" / "linux" / resolve_host_arch() / "7za")
    for candidate in candidates:
        candidate_path = Path(candidate)
        if candidate_path.is_file():
            return str(candidate_path)
        if isinstance(candidate, str) and shutil.which(candidate):
            return candidate
    raise RuntimeError("7-Zip command not found; installer validation needs 7z/7za or app/node_modules 7zip-bin.")


def validate_windows_portable_output(version: str) -> None:
    portable_root = APP_DIR / "build" / "sourceflow-portable"
    validate_required_paths(
        portable_root,
        (
            ".sf-portable",
            "SourceFlow.exe",
            "resources/app.asar",
            "resources/kernel/SourceFlow-Kernel.exe",
            "resources/stage/build/app/index.html",
            "resources/pandoc.zip",
            "resources/pandoc-resources/pandoc-template.docx",
            "resources/pandoc-resources/pandoc_color_filter.lua",
            "sourceflow-page-saver.zip",
        ),
        f"Portable build at {portable_root}",
    )
    validate_kernel_boot(
        portable_root / "resources" / "kernel" / "SourceFlow-Kernel.exe",
        portable_root / "resources",
        Path(tempfile.mkdtemp(prefix="sourceflow-portable-kernel-smoke-")),
        version,
    )
    print(f"Portable validation passed: {portable_root}", flush=True)


def validate_windows_installer_output(version: str) -> None:
    installer_path = APP_DIR / "build" / f"sourceflow-{version}-win.exe"
    if not installer_path.is_file():
        raise RuntimeError(f"Windows installer not found: {installer_path}")
    seven_zip = resolve_7zip_command()
    extract_root = Path(tempfile.mkdtemp(prefix="sourceflow-installer-extract-"))
    try:
        run([seven_zip, "x", str(installer_path), f"-o{extract_root}", "-y"], cwd=PROJECT_ROOT)
        embedded_archives = sorted((extract_root / "$PLUGINSDIR").glob("app-*.7z"))
        if not embedded_archives:
            raise RuntimeError(f"No embedded app archive found in installer: {installer_path}")
        extracted_app_dir = extract_root / "app"
        run([seven_zip, "x", str(embedded_archives[0]), f"-o{extracted_app_dir}", "-y"], cwd=PROJECT_ROOT)
        validate_required_paths(
            extracted_app_dir,
            (
                "SourceFlow.exe",
                "resources/app.asar",
                "resources/kernel/SourceFlow-Kernel.exe",
                "resources/stage/build/app/index.html",
                "resources/pandoc.zip",
                "resources/pandoc-resources/pandoc-template.docx",
                "resources/pandoc-resources/pandoc_color_filter.lua",
            ),
            f"Extracted installer app at {extracted_app_dir}",
        )
        validate_kernel_boot(
            extracted_app_dir / "resources" / "kernel" / "SourceFlow-Kernel.exe",
            extracted_app_dir / "resources",
            Path(tempfile.mkdtemp(prefix="sourceflow-installer-kernel-smoke-")),
            version,
        )
    finally:
        remove_path_with_retry(extract_root)
    print(f"Installer validation passed: {installer_path}", flush=True)


def validate_build_outputs(target: BuildTarget, *, include_installer: bool, include_portable: bool) -> None:
    version = load_version_field(APP_PACKAGE_PATH, "app/package.json")
    if target.platform_key == "win" and target.arch == "x64":
        if include_installer:
            print_step("Validate installer output")
            validate_windows_installer_output(version)
        if include_portable:
            print_step("Validate portable output")
            validate_windows_portable_output(version)
        return

    if include_installer:
        if not target.installer_output_dir.exists() or not any(target.installer_output_dir.iterdir()):
            raise RuntimeError(f"Installer output is missing or empty: {target.installer_output_dir}")
    if include_portable and target.portable_output_dir:
        if not target.portable_output_dir.exists() or not any(target.portable_output_dir.iterdir()):
            raise RuntimeError(f"Portable output is missing or empty: {target.portable_output_dir}")


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

    target = TARGETS.get((target_platform, target_arch))
    if not target:
        raise RuntimeError(f"Unsupported build target: {target_platform}/{target_arch}")
    if target_platform != host_name:
        raise RuntimeError(
            "Cross-OS desktop packaging is not enabled in this script. "
            f"Current host is {host_name}/{host_arch}, requested {target_platform}/{target_arch}. "
            "Run 编译.py on the target operating system, or choose --platform matching the current host."
        )
    return target, host_name, host_arch


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python 编译.py",
        description=(
            "Build native SourceFlow desktop artifacts for the current machine.\n"
            "The script auto-detects the host OS and CPU architecture, or accepts\n"
            "an explicit same-OS --platform/--arch target, prepares the frontend\n"
            "and Go kernel, then builds the installer and, when supported, the\n"
            "portable package.\n"
            "Before building, the script checks the required desktop toolchain.\n"
            "Missing Node.js, pnpm, Go, and macOS Command Line Tools are installed\n"
            "automatically when the host platform supports unattended setup.\n"
            "Portable builds also bundle the browser capture extension zip."
        ),
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python 编译.py\n"
            "  python 编译.py --platform mac --arch arm64\n"
            "  python 编译.py --platform win --arch arm64 --skip-portable\n"
            "  python 编译.py --skip-portable\n"
            "  python 编译.py --fast --skip-portable\n"
            "  python 编译.py --ui-targets app,export --skip-portable\n"
            "  python 编译.py --stability-gate-only\n"
            "  python 编译.py --skip-install --skip-ui --skip-kernel --skip-installer\n"
            "  python 编译.py --open-output\n"
            "\n"
            "Notes:\n"
            "  - Build on the target OS. Same-OS x64/arm64 targets are supported when the local toolchain can build them.\n"
            "  - Windows arm64 currently builds the installer only; portable packaging is skipped automatically.\n"
            "  - Desktop targets only. Android and iOS build environments are not managed by this script."
        ),
    )
    parser.add_argument("--platform", choices=("win", "linux", "mac"), default="", help="Optional explicit target platform. Defaults to the host platform.")
    parser.add_argument("--arch", choices=("x64", "arm64"), default="", help="Optional explicit target architecture. Defaults to the host architecture.")
    parser.add_argument("--fast", action="store_true", help="Unsafe local iteration build: skip dependency installation, full quality gate, and output validation.")
    parser.add_argument("--jobs", type=int, default=0, help="Parallel build jobs. Defaults to an auto value based on CPU count; use 1 for serial builds.")
    parser.add_argument("--install", action="store_true", help="Force dependency installation before building even when app/node_modules looks current.")
    parser.add_argument("--skip-install", action="store_true", help="Skip dependency installation before building.")
    parser.add_argument("--skip-quality-gate", action="store_true", help="Skip the pre-build quality gate. Use only for local iteration.")
    parser.add_argument("--skip-ui", action="store_true", help="Skip the frontend build and reuse existing app/stage/build output.")
    parser.add_argument("--ui-targets", default="all", help="Frontend targets to build or validate: all, or comma-separated app,mobile,desktop,export.")
    parser.add_argument("--skip-kernel", action="store_true", help="Skip the Go kernel build and reuse an existing kernel binary.")
    parser.add_argument("--skip-installer", action="store_true", help="Do not build the native installer package.")
    parser.add_argument("--skip-portable", action="store_true", help="Do not build the portable package.")
    parser.add_argument("--rebuild-portable", action="store_true", help="Do not reuse the installer unpacked app when building the Windows portable package.")
    parser.add_argument("--skip-validate", action="store_true", help="Skip post-build artifact validation.")
    parser.add_argument("--stability-gate-only", action="store_true", help="Run the self-contained SourceFlow stability gate and exit without building.")
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


def prepare_target(target: BuildTarget, args: argparse.Namespace) -> None:
    prepare_build_inputs(target, args)


def build_installer(target: BuildTarget, args: argparse.Namespace) -> None:
    print_step(f"Build installer: {target.display_name}")
    config_name = target.installer_config
    temp_config_path: Path | None = None
    env = electron_builder_env()
    try:
        if target.platform_key == "mac" and should_use_unsigned_mac_config(args):
            source_config = APP_DIR / mac_installer_config_name(target)
            temp_config_path = APP_DIR / f".portable-unsigned-installer-{os.getpid()}.yml"
            write_unsigned_mac_config(source_config, temp_config_path)
            config_name = temp_config_path.name
            env["CSC_IDENTITY_AUTO_DISCOVERY"] = "false"

        command = [
            "node",
            str(resolve_electron_builder_cli()),
            *electron_builder_platform_args(target),
            *electron_builder_arch_args(target),
            "--config",
            config_name,
            "--publish=never",
        ]
        run(command, cwd=APP_DIR, env=env)
    finally:
        if temp_config_path:
            remove_path(temp_config_path)


def try_reuse_windows_unpacked_for_portable(target: BuildTarget, stable_zip_path: Path, *, installer_built: bool) -> bool:
    if target.platform_key != "win" or not installer_built:
        return False

    source_dir = APP_DIR / "build" / "win-unpacked"
    if not source_dir.exists():
        print("Windows installer did not leave win-unpacked behind; portable build will use electron-builder.", flush=True)
        return False

    print_step("Reuse installer unpacked app for portable package")
    shutil.copy2(stable_zip_path, source_dir / stable_zip_path.name)
    make_windows_portable_dir()
    return True


def build_portable(target: BuildTarget, args: argparse.Namespace, *, installer_built: bool = False) -> None:
    print_step("Package browser capture extension")
    stable_zip_path, versioned_zip_path = package_web_clipper_assets()
    print(f"Portable extension archive: {stable_zip_path}", flush=True)
    print(f"Versioned extension archive: {versioned_zip_path}", flush=True)

    if not args.rebuild_portable and try_reuse_windows_unpacked_for_portable(target, stable_zip_path, installer_built=installer_built):
        return

    print_step(f"Build portable package: {target.display_name}")
    if not target.portable_kernel_dir or not target.portable_output_dir:
        raise RuntimeError(f"Portable packaging is not configured for {target.display_name}")

    ensure_path_exists(
        target.portable_kernel_dir / target.portable_kernel_binary,
        f"Kernel binary is missing at {target.portable_kernel_dir / target.portable_kernel_binary}",
    )
    ensure_path_exists(
        APP_DIR / "stage" / "build" / "app" / "index.html",
        "Frontend build output is missing. Run the frontend build first.",
    )

    if target.platform_key != "win":
        remove_path(target.portable_output_dir)

    clean_broken_pnpm_links()

    env = electron_builder_env({
        "SOURCEFLOW_PORTABLE_BUILD": "1",
        "SOURCEFLOW_TARGET_PLATFORM": target.electron_platform,
        "SOURCEFLOW_TARGET_ARCH": target.arch,
    })
    config_name = target.portable_config
    temp_config_path: Path | None = None

    try:
        if target.platform_key == "mac" and should_use_unsigned_mac_config(args):
            temp_config_path = APP_DIR / f".portable-unsigned-{os.getpid()}.yml"
            write_unsigned_mac_config(APP_DIR / target.portable_config, temp_config_path)
            config_name = temp_config_path.name
            env["CSC_IDENTITY_AUTO_DISCOVERY"] = "false"

        command = [
            "node",
            str(resolve_electron_builder_cli()),
            *electron_builder_platform_args(target),
            *electron_builder_arch_args(target),
        ]
        command.extend(["--config", config_name, "--publish=never"])
        if target.portable_output_name:
            command.append(f"-c.directories.output={target.portable_output_name}")

        run(command, cwd=APP_DIR, env=env)
        if target.platform_key == "win":
            make_windows_portable_dir()
    finally:
        if temp_config_path:
            remove_path(temp_config_path)


def main_output_dir(target: BuildTarget, build_portable_artifact: bool) -> Path:
    if build_portable_artifact and target.portable_output_dir:
        return target.portable_output_dir
    return target.installer_output_dir


def ensure_build_prerequisites(target: BuildTarget) -> None:
    if target.platform_key == "mac":
        ensure_macos_build_prerequisites()
    require_command("node")
    require_command(PNPM)
    require_command("go")


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.stability_gate_only and (args.fast or args.skip_quality_gate):
        raise RuntimeError("--stability-gate-only must run the quality gate; remove --fast or --skip-quality-gate.")

    if args.fast:
        args.skip_install = True
        args.skip_quality_gate = True
        args.skip_validate = True

    selected_ui_targets = parse_frontend_targets(args.ui_targets)
    parallel_jobs = resolve_parallel_jobs(args)

    target, host_name, host_arch = resolve_target(args.platform, args.arch)
    build_portable_artifact = (not args.skip_portable) and target.portable_supported
    if args.skip_installer and not build_portable_artifact:
        raise RuntimeError("Nothing to build for this target. Remove --skip-installer or choose a portable-supported target.")

    ensure_build_prerequisites(target)

    print_step("Resolved target")
    print(f"Host platform: {host_name}", flush=True)
    print(f"Host architecture: {host_arch}", flush=True)
    print(f"Target: {target.display_name}", flush=True)
    print(f"Build installer: {not args.skip_installer}", flush=True)
    print(f"Build portable: {build_portable_artifact}", flush=True)
    print(f"Bundle browser extension zip in portable: {build_portable_artifact}", flush=True)
    print(f"Build mode: {'unsafe fast iteration' if args.fast else 'safe high-performance'}", flush=True)
    print(f"Parallel jobs: {parallel_jobs}", flush=True)
    print(f"Install dependencies: {'force' if args.install and not args.skip_install else not args.skip_install}", flush=True)
    print(f"Run quality gate: {not args.skip_quality_gate}", flush=True)
    print(f"Frontend targets: {', '.join(selected_ui_targets) if not args.skip_ui else 'reuse existing ' + ', '.join(selected_ui_targets)}", flush=True)
    print(f"Validate outputs: {not args.skip_validate}", flush=True)
    if not args.skip_portable and not target.portable_supported:
        print("Portable build: skipped automatically because this target has no portable packaging flow.", flush=True)

    ensure_app_dependencies(target, args)

    if args.skip_quality_gate:
        print_step("Quality gate skipped")
        print("Pre-build quality gate was skipped by --fast or --skip-quality-gate.", flush=True)
    else:
        run_build_quality_gate(parallel_jobs)

    if args.stability_gate_only:
        print_step("Done")
        print("Stability gate passed. Build was not started because --stability-gate-only was set.", flush=True)
        return 0

    prepare_target(target, args)

    if not args.skip_installer:
        build_installer(target, args)

    if build_portable_artifact:
        build_portable(target, args, installer_built=not args.skip_installer)

    if args.skip_validate:
        print_step("Output validation skipped")
        print("Post-build artifact validation was skipped by --fast or --skip-validate.", flush=True)
    else:
        validate_build_outputs(target, include_installer=not args.skip_installer, include_portable=build_portable_artifact)

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
        print(f"编译失败,原因: {exc}", file=sys.stderr)
        raise SystemExit(1)
