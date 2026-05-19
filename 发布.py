#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import functools
import hashlib
import http.client
import json
import mimetypes
import os
import platform as host_platform
import random
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from fnmatch import fnmatch
from pathlib import Path, PurePosixPath
from typing import Iterable, Mapping, Sequence
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request


PROJECT_ROOT = Path(__file__).resolve().parent
APP_DIR = PROJECT_ROOT / "app"
APP_PACKAGE_PATH = APP_DIR / "package.json"
APP_CHANGELOG_ROOT = APP_DIR / "changelogs"
KERNEL_WORKING_PATH = PROJECT_ROOT / "kernel" / "util" / "working.go"
APPX_MANIFEST_PATHS = (
    APP_DIR / "appx" / "AppxManifest.xml",
    APP_DIR / "appx" / "AppxManifest-arm64.xml",
)
EXPORT_ROOT = PROJECT_ROOT / ".opensource-release"
DEFAULT_GITHUB_TOKEN_FILE = PROJECT_ROOT / ".release.local.env"
LEGACY_GITHUB_TOKEN_FILE = PROJECT_ROOT / "scripts" / "public-release.local.env"
WEB_CLIPPER_RELATIVE_DIR = Path("browser-extension") / "sourceflow-web-clipper"
WEB_CLIPPER_MANIFEST_NAME = "manifest.json"
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
REPO_URL_RE = re.compile(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+?)(?:\.git)?/?$")
GITHUB_API_BASE = "https://api.github.com"
GITHUB_API_ACCEPT = "application/vnd.github+json"
GITHUB_API_VERSION = "2022-11-28"
GITHUB_USER_AGENT = "SourceFlow-release-script"
SEMVER_RE = re.compile(r"^v?(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)$")
_GITHUB_GIT_CREDENTIAL_FALLBACK_ANNOUNCED = False
_GITHUB_PREFER_BASIC_AUTH = False
_INTERRUPT_COUNT = 0
_POST_RUN_WARNINGS: list[str] = []


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except ValueError:
                pass


configure_utf8_stdio()


def read_int_env(name: str, default: int, *, min_value: int, max_value: int) -> int:
    raw_value = os.environ.get(name, "").strip()
    if not raw_value:
        return default
    try:
        value = int(raw_value)
    except ValueError:
        return default
    return max(min_value, min(max_value, value))


RELEASE_UPLOAD_CHUNK_SIZE = read_int_env("SOURCEFLOW_RELEASE_UPLOAD_CHUNK_MB", 4, min_value=1, max_value=32) * 1024 * 1024
RELEASE_UPLOAD_TIMEOUT_SECONDS = read_int_env("SOURCEFLOW_RELEASE_UPLOAD_TIMEOUT_SECONDS", 600, min_value=60, max_value=3600)
RELEASE_UPLOAD_MAX_RETRIES = read_int_env("SOURCEFLOW_RELEASE_UPLOAD_RETRIES", 3, min_value=0, max_value=3)
RELEASE_UPLOAD_MAX_ATTEMPTS = RELEASE_UPLOAD_MAX_RETRIES + 1
GITHUB_API_TIMEOUT_SECONDS = read_int_env("SOURCEFLOW_GITHUB_API_TIMEOUT_SECONDS", 60, min_value=15, max_value=300)
GITHUB_API_MAX_RETRIES = read_int_env("SOURCEFLOW_GITHUB_API_RETRIES", 3, min_value=0, max_value=5)
GITHUB_API_MAX_ATTEMPTS = GITHUB_API_MAX_RETRIES + 1
SECRET_PATTERNS = (
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"AIza[0-9A-Za-z\-_]{35}"),
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}"),
)
SECRET_SCAN_SKIP_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
    ".gz",
    ".7z",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".mp4",
}
REQUIRED_EXPORT_PATHS = (
    "app",
    "app/appearance/icons/index.html",
    "app/appearance/icons/ant/icon.js",
    "app/appearance/icons/material/icon.js",
    "app/package.json",
    "kernel",
    "third_party",
    "README.md",
    "README_EN.md",
    "LICENSE",
    "NOTICE.md",
    ".gitignore",
    ".gitattributes",
)
HARD_EXCLUDED_RELATIVE_PATHS = {
    ".git",
    ".opensource-release",
    "发布.py",
    "编译.py",
}
PUBLIC_EXPORT_INCLUDED_ROOT_PATHS = {
    ".gitattributes",
    ".gitignore",
    "LICENSE",
    "NOTICE.md",
    "PLUGIN_BAZAAR.md",
    "README.md",
    "README_EN.md",
    "app",
    "browser-extension",
    "kernel",
    "screenshots",
    "third_party",
}
PUBLIC_EXPORT_EXCLUDED_RELATIVE_PATHS = {
    ".github",
    ".dockerignore",
    "Dockerfile",
    "PORTABLE_BUILD.md",
    "examples",
    "marketplace",
    "node_modules",
    "package.json",
    "plans",
    "pnpm-lock.yaml",
    "scripts",
    "build.log",
}
SCREENSHOT_REFERENCE_RE = re.compile(r"\]\((screenshots/[A-Za-z0-9_.\-/]+)\)")
RELEASE_NOTES_REVIEW_LIMIT = 12000


@dataclass(frozen=True)
class GitHubAuthConfig:
    token: str
    source: str
    token_file: Path
    environment: dict[str, str]


@dataclass(frozen=True)
class ReleaseTagSyncPlan:
    release_exists: bool
    remote_tag_target: str
    should_replace_orphan_tag: bool
    description: str


@dataclass(frozen=True)
class ReleaseAssetSyncEntry:
    name: str
    action: str
    local_size: int
    remote_state: str
    remote_size: int | None


class GitHubApiError(RuntimeError):
    def __init__(self, method: str, url: str, status_code: int, message: str) -> None:
        super().__init__(f"GitHub API {method} {url} failed ({status_code}): {message}")
        self.method = method
        self.url = url
        self.status_code = status_code
        self.message = message


@dataclass(frozen=True)
class ReleaseTarget:
    platform_key: str
    arch: str
    display_name: str
    portable_supported: bool
    portable_validation_supported: bool
    installer_output_dir: Path
    installer_patterns: tuple[str, ...]
    portable_output_dir: Path | None
    portable_patterns: tuple[str, ...]


@dataclass(frozen=True)
class ExportCandidate:
    relative_path: str
    full_path: Path
    is_dir: bool

    @property
    def name(self) -> str:
        return PurePosixPath(self.relative_path).name


TARGETS: dict[tuple[str, str], ReleaseTarget] = {
    ("win", "x64"): ReleaseTarget(
        platform_key="win",
        arch="x64",
        display_name="Windows x64",
        portable_supported=True,
        portable_validation_supported=True,
        installer_output_dir=APP_DIR / "build",
        installer_patterns=("sourceflow-*.exe",),
        portable_output_dir=APP_DIR / "build" / "sourceflow-portable",
        portable_patterns=("sourceflow-portable",),
    ),
    ("win", "arm64"): ReleaseTarget(
        platform_key="win",
        arch="arm64",
        display_name="Windows arm64",
        portable_supported=False,
        portable_validation_supported=False,
        installer_output_dir=APP_DIR / "build",
        installer_patterns=("sourceflow-*.exe",),
        portable_output_dir=None,
        portable_patterns=(),
    ),
    ("linux", "x64"): ReleaseTarget(
        platform_key="linux",
        arch="x64",
        display_name="Linux x64",
        portable_supported=True,
        portable_validation_supported=False,
        installer_output_dir=APP_DIR / "build",
        installer_patterns=("sourceflow-*.AppImage", "sourceflow-*.deb", "sourceflow-*.tar.gz"),
        portable_output_dir=APP_DIR / "build-linux-portable",
        portable_patterns=("sourceflow-*.tar.gz",),
    ),
    ("linux", "arm64"): ReleaseTarget(
        platform_key="linux",
        arch="arm64",
        display_name="Linux arm64",
        portable_supported=True,
        portable_validation_supported=False,
        installer_output_dir=APP_DIR / "build",
        installer_patterns=("sourceflow-*.AppImage", "sourceflow-*.deb", "sourceflow-*.tar.gz"),
        portable_output_dir=APP_DIR / "build-linux-arm64-portable",
        portable_patterns=("sourceflow-*.tar.gz",),
    ),
    ("mac", "x64"): ReleaseTarget(
        platform_key="mac",
        arch="x64",
        display_name="macOS x64",
        portable_supported=True,
        portable_validation_supported=False,
        installer_output_dir=APP_DIR / "build",
        installer_patterns=("sourceflow-*.dmg", "sourceflow-*.zip"),
        portable_output_dir=APP_DIR / "build-darwin-portable",
        portable_patterns=("sourceflow-*.zip",),
    ),
    ("mac", "arm64"): ReleaseTarget(
        platform_key="mac",
        arch="arm64",
        display_name="macOS arm64",
        portable_supported=True,
        portable_validation_supported=False,
        installer_output_dir=APP_DIR / "build",
        installer_patterns=("sourceflow-*.dmg", "sourceflow-*.zip"),
        portable_output_dir=APP_DIR / "build-darwin-arm64-portable",
        portable_patterns=("sourceflow-*.zip",),
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
    input_text: str | None = None,
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
        input=input_text,
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


def remove_path(path: Path) -> None:
    if not path.exists():
        return
    if path.is_dir():
        shutil.rmtree(path)
    else:
        path.unlink()


def remove_path_with_retry(path: Path, retries: int = 5, delay_seconds: float = 0.5) -> None:
    for attempt in range(retries):
        try:
            remove_path(path)
            return
        except FileNotFoundError:
            return
        except PermissionError:
            if attempt == retries - 1:
                raise
            time.sleep(delay_seconds)


def copytree_replace(source_dir: Path, target_dir: Path) -> None:
    if target_dir.exists():
        remove_path_with_retry(target_dir)
    shutil.copytree(source_dir, target_dir)


def path_is_within(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def sha256_file(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def format_bool(value: bool) -> str:
    return "True" if value else "False"


def load_key_value_file(file_path: Path | None) -> dict[str, str]:
    values: dict[str, str] = {}
    if not file_path or not file_path.exists():
        return values

    for index, raw_line in enumerate(file_path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            raise RuntimeError(f"Invalid line in {file_path} at line {index}: {raw_line}")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and ((value[0] == '"' and value[-1] == '"') or (value[0] == "'" and value[-1] == "'")):
            value = value[1:-1]
        values[key] = value
    return values


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


def resolve_release_target(platform_text: str = "", arch_text: str = "") -> tuple[ReleaseTarget, str, str]:
    host_name = resolve_host_platform()
    host_arch = resolve_host_arch()
    target_platform = normalize_platform(platform_text) if platform_text else host_name
    target_arch = normalize_arch(arch_text) if arch_text else host_arch

    target = TARGETS.get((target_platform, target_arch))
    if not target:
        raise RuntimeError(f"Unsupported release target: {target_platform}/{target_arch}")
    if target_platform != host_name:
        raise RuntimeError(
            "Cross-OS publishing is not enabled. "
            f"Current host is {host_name}/{host_arch}, requested {target_platform}/{target_arch}. "
            "Run 发布.py on the target operating system, or choose --platform matching the current host."
        )
    return target, host_name, host_arch


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python 发布.py",
        description=(
            "Publish SourceFlow desktop release artifacts produced by 编译.py.\n"
            "The script auto-detects the current machine's OS and architecture,\n"
            "or accepts an explicit same-OS --platform/--arch target, exports a\n"
            "public repository copy, stages existing build artifacts, and can push\n"
            "a GitHub release. 编译.py owns build and local validation; 发布.py\n"
            "only consumes already-built artifacts."
        ),
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python 发布.py --preview\n"
            "  python 发布.py --version-bump none --skip-release --skip-push\n"
            "  python 发布.py --platform mac --arch arm64\n"
            "  python 发布.py --skip-release --skip-push\n"
            "  python 发布.py --version-bump patch --draft --prerelease"
        ),
    )
    parser.add_argument("--platform", choices=("win", "linux", "mac"), default="", help="Optional explicit release platform. Defaults to the host platform.")
    parser.add_argument("--arch", choices=("x64", "arm64"), default="", help="Optional explicit release architecture. Defaults to the host architecture.")
    parser.add_argument("--repository-url", default="https://github.com/lonelyor/SourceFlow.git", help="GitHub repository URL for the public release repo.")
    parser.add_argument("--branch", default="main", help="Branch to push before creating the release tag.")
    parser.add_argument("--commit-message", default="", help="Commit message used when exporting the public repo copy.")
    parser.add_argument("--export-dir", default="", help="Explicit export directory under .opensource-release.")
    parser.add_argument("--version", default="", help="Explicit release version. When omitted, --version-bump decides how the version is resolved.")
    parser.add_argument(
        "--version-bump",
        choices=("auto", "patch", "minor", "major", "none"),
        default="auto",
        help=(
            "Version strategy when --version is not provided.\n"
            "auto: by default stays on the current compiled artifact version unless --version-bump is explicit.\n"
            "patch/minor/major: bump from app/package.json before the release.\n"
            "none: keep the current version unchanged."
        ),
    )
    parser.add_argument(
        "--auto-version-source",
        choices=("release", "tag"),
        default="release",
        help=(
            "Source used by --version-bump auto.\n"
            "release: choose the next version by checking actual GitHub Releases.\n"
            "tag: choose the next version by checking remote Git tags."
        ),
    )
    parser.add_argument("--release-tag", default="", help="Tag to create or upload to. Defaults to v<version>.")
    parser.add_argument("--release-title", default="", help="GitHub release title. Defaults to SourceFlow <tag>.")
    parser.add_argument("--notes-file", default="", help="Optional release notes Markdown file.")
    parser.add_argument("--skip-release-notes", action="store_true", help="Do not auto-generate missing release notes. GitHub will generate notes when no notes file exists.")
    parser.add_argument("--release-notes-only", action="store_true", help="Generate or refresh the release notes for review, then exit without publishing.")
    parser.add_argument("--hide-release-notes-review", action="store_true", help="Do not print the release notes body after preparing it.")
    parser.add_argument("--release-asset-dir", default="", help="Directory used to collect staged release artifacts.")
    parser.add_argument("--github-token", default="", help="Explicit GitHub token. Overrides token files and environment variables.")
    parser.add_argument("--github-token-file", default="", help="Optional env-style file containing GH_TOKEN/GITHUB_TOKEN/SOURCEFLOW_GITHUB_TOKEN.")
    parser.add_argument("--create-repository", action="store_true", help="Create the target GitHub repository with the GitHub API if it does not already exist.")
    parser.add_argument("--visibility", choices=("public", "private", "internal"), default="public", help="Visibility to use when --create-repository creates the repo.")
    parser.add_argument("--skip-export", action="store_true", help="Use the current working tree directly instead of exporting a public copy first.")
    parser.add_argument("--skip-push", action="store_true", help="Skip pushing the branch to GitHub.")
    parser.add_argument("--build", action="store_true", help="Deprecated. 发布.py never builds; run 编译.py before publishing.")
    parser.add_argument("--skip-build", action="store_true", help="Compatibility option. 发布.py always uses existing build artifacts.")
    parser.add_argument("--reuse-release-assets", action="store_true", help="Do not restage artifacts from app/build*; reuse files already in --release-asset-dir.")
    parser.add_argument("--validate", action="store_true", help="Run local artifact smoke validation before publishing. Disabled by default; 编译.py/local testing owns validation.")
    parser.add_argument("--skip-validate", action="store_true", help="Skip release asset consistency checks and any explicit --validate smoke checks.")
    parser.add_argument("--skip-quality-gate", action="store_true", help="Compatibility option. Release publishing does not run a separate quality gate; 编译.py owns build checks.")
    parser.add_argument("--skip-frontend-quality-gate", action="store_true", help="Deprecated. Use 编译.py --stability-gate-only for quality checks.")
    parser.add_argument("--stability-gate-only", action="store_true", help="Deprecated. Use 编译.py --stability-gate-only; 发布.py only publishes existing artifacts.")
    parser.add_argument("--skip-validate-portable", action="store_true", help="Skip portable validation even when the current target supports it.")
    parser.add_argument("--validate-docker", action="store_true", help="Run Docker release validation. Disabled by default because local Docker permissions are environment-specific.")
    parser.add_argument("--skip-validate-docker", action="store_true", help="Compatibility option. Keeps Docker validation disabled.")
    parser.add_argument("--resume", action="store_true", help="Reuse the existing export directory and completed build outputs after an interrupted release.")
    parser.add_argument("--skip-installer", action="store_true", help="Do not stage or upload installer artifacts.")
    parser.add_argument("--skip-portable", action="store_true", help="Do not stage or upload portable artifacts.")
    parser.add_argument("--skip-release", action="store_true", help="Skip GitHub release creation and asset upload.")
    parser.add_argument(
        "--replace-orphan-release-tag",
        action="store_true",
        help=(
            "When publishing a version whose GitHub Release is missing but the same remote tag still points to another commit, "
            "delete and recreate that tag at the current release commit. Use only after intentionally deleting the old release."
        ),
    )
    parser.add_argument(
        "--tag-conflict",
        choices=("ask", "preserve", "move", "abort"),
        default="ask",
        help=(
            "How to handle an existing GitHub Release whose remote tag points to another commit. "
            "ask: prompt in an interactive terminal and preserve in non-interactive runs; "
            "preserve: keep the existing tag and update assets; "
            "move: move the tag to the current release commit; "
            "abort: stop before publishing."
        ),
    )
    parser.add_argument(
        "--no-sync-release-tags",
        action="store_true",
        help="Disable automatic repair of orphan release tags when a GitHub Release is missing but the same version tag remains.",
    )
    parser.add_argument("--draft", action="store_true", help="Create the GitHub release as a draft.")
    parser.add_argument("--prerelease", action="store_true", help="Mark the GitHub release as a prerelease.")
    parser.add_argument("--dynamic", action="store_true", help="Deprecated compile option. Use it with 编译.py, not 发布.py.")
    parser.add_argument("--signed", action="store_true", help="Deprecated compile option. Use it with 编译.py, not 发布.py.")
    parser.add_argument("--cc", default="", help="Deprecated compile option. Use it with 编译.py, not 发布.py.")
    parser.add_argument("--preview", action="store_true", help="Print the resolved release plan without building or publishing.")
    return parser


def argv_has_option(argv: Sequence[str], option_name: str) -> bool:
    return any(arg == option_name or arg.startswith(f"{option_name}=") for arg in argv)


def should_lock_version_to_existing_artifacts(args: argparse.Namespace, raw_argv: Sequence[str]) -> bool:
    if args.reuse_release_assets:
        return False
    if args.version or args.release_tag:
        return False
    if argv_has_option(raw_argv, "--version-bump") or argv_has_option(raw_argv, "--auto-version-source"):
        return False
    return True


def load_json_object(path: Path, label: str) -> dict[str, object]:
    if not path.is_file():
        raise RuntimeError(f"Required JSON file not found: {label}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected a JSON object in {label}")
    return data


def load_version_field(path: Path, label: str) -> str:
    document = load_json_object(path, label)
    version = str(document.get("version", "")).strip()
    if not version:
        raise RuntimeError(f"Unable to resolve version from {label}")
    return version


def load_app_version() -> str:
    return load_version_field(APP_PACKAGE_PATH, "app/package.json")


def parse_semver(version: str) -> tuple[int, int, int]:
    match = SEMVER_RE.fullmatch(version.strip())
    if not match:
        raise RuntimeError(f"Unsupported version format: {version}. Expected MAJOR.MINOR.PATCH.")
    return int(match.group("major")), int(match.group("minor")), int(match.group("patch"))


def format_semver(major: int, minor: int, patch: int) -> str:
    return f"{major}.{minor}.{patch}"


def bump_semver(version: str, bump_kind: str) -> str:
    major, minor, patch = parse_semver(version)
    if bump_kind == "patch":
        patch += 1
    elif bump_kind == "minor":
        minor += 1
        patch = 0
    elif bump_kind == "major":
        major += 1
        minor = 0
        patch = 0
    else:
        raise RuntimeError(f"Unsupported version bump kind: {bump_kind}")
    return format_semver(major, minor, patch)


def version_to_appx(version: str) -> str:
    major, minor, patch = parse_semver(version)
    return f"{major}.{minor}.{patch}.0"


def get_remote_tag_target_for_url(repository_url: str, tag_name: str) -> str:
    result = run(
        ["git", "ls-remote", "--tags", repository_url, f"refs/tags/{tag_name}", f"refs/tags/{tag_name}^{{}}"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return ""

    direct_target = ""
    peeled_target = ""
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        sha, ref_name = parts
        if ref_name == f"refs/tags/{tag_name}":
            direct_target = sha
        elif ref_name == f"refs/tags/{tag_name}^{{}}":
            peeled_target = sha
    return peeled_target or direct_target


def infer_version_from_release_tag(release_tag: str) -> str:
    if not release_tag:
        return ""
    candidate = release_tag[1:] if release_tag.startswith("v") else release_tag
    if not SEMVER_RE.fullmatch(candidate):
        return ""
    return candidate


def resolve_release_version(
    current_version: str,
    *,
    explicit_version: str,
    release_tag: str,
    version_bump: str,
    auto_version_source: str,
    skip_release: bool,
    github_token: str,
    repo_slug: str,
    repository_url: str,
) -> tuple[str, str]:
    if explicit_version:
        return explicit_version, "explicit --version"

    inferred_from_tag = infer_version_from_release_tag(release_tag)
    if inferred_from_tag:
        return inferred_from_tag, "derived from --release-tag"

    if skip_release or version_bump == "none":
        return current_version, "current app version"

    if version_bump in {"patch", "minor", "major"}:
        return bump_semver(current_version, version_bump), f"{version_bump} bump"

    candidate = current_version
    if auto_version_source == "release":
        while remote_github_release_exists(github_token, repo_slug, f"v{candidate}"):
            candidate = bump_semver(candidate, "patch")
    elif auto_version_source == "tag":
        while get_remote_tag_target_for_url(repository_url, f"v{candidate}"):
            candidate = bump_semver(candidate, "patch")
    else:
        raise RuntimeError(f"Unsupported auto version source: {auto_version_source}")
    if candidate == current_version:
        return candidate, f"auto ({auto_version_source}: current version available)"
    return candidate, f"auto ({auto_version_source}: next free patch version)"


def replace_in_file(path: Path, pattern: str, replacement: str, label: str) -> None:
    content = path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)
    if count != 1:
        raise RuntimeError(f"Unable to update version in {label}")
    path.write_text(updated, encoding="utf-8")


def update_release_version_files(version: str) -> None:
    document = load_json_object(APP_PACKAGE_PATH, "app/package.json")
    document["version"] = version
    APP_PACKAGE_PATH.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    replace_in_file(
        KERNEL_WORKING_PATH,
        r'^(\s*Ver\s*=\s*")([^"]+)(")',
        rf'\g<1>{version}\g<3>',
        "kernel/util/working.go",
    )

    appx_version = version_to_appx(version)
    for manifest_path in APPX_MANIFEST_PATHS:
        replace_in_file(
            manifest_path,
            r'(Version=")(\d+\.\d+\.\d+\.\d+)(")',
            rf'\g<1>{appx_version}\g<3>',
            manifest_path.as_posix(),
        )


def get_git_remote_url(working_directory: Path) -> str:
    result = run(["git", "remote", "get-url", "origin"], cwd=working_directory, capture_output=True, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def get_git_output(args: Sequence[str | os.PathLike[str]], cwd: Path, *, check: bool = True) -> str:
    result = run(args, cwd=cwd, capture_output=True, check=check)
    return result.stdout.strip()


def get_remote_tag_target(cwd: Path, tag_name: str) -> str:
    result = run(
        ["git", "ls-remote", "--tags", "origin", f"refs/tags/{tag_name}", f"refs/tags/{tag_name}^{{}}"],
        cwd=cwd,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return ""

    direct_target = ""
    peeled_target = ""
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        sha, ref_name = parts
        if ref_name == f"refs/tags/{tag_name}":
            direct_target = sha
        elif ref_name == f"refs/tags/{tag_name}^{{}}":
            peeled_target = sha
    return peeled_target or direct_target


def get_local_tag_target(cwd: Path, tag_name: str) -> str:
    result = run(["git", "rev-parse", "--verify", f"{tag_name}^{{}}"], cwd=cwd, capture_output=True, check=False)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def short_commit(commit: str) -> str:
    return commit[:12] if commit else "(none)"


def is_interactive_terminal() -> bool:
    return sys.stdin.isatty() and sys.stdout.isatty()


def prompt_existing_release_tag_conflict(release_tag: str, remote_tag_target: str, head_commit: str, mode: str) -> str:
    if mode == "preserve":
        return "preserve"
    if mode == "move":
        return "move"
    if mode == "abort":
        return "abort"
    if not is_interactive_terminal():
        return "preserve"

    print()
    print("检测到发布 tag 与当前提交不一致：", flush=True)
    print(f"- tag: {release_tag}", flush=True)
    print(f"- 远端 tag 指向: {short_commit(remote_tag_target)}", flush=True)
    print(f"- 当前发布提交: {short_commit(head_commit)}", flush=True)
    print("GitHub Release 已存在。通常重新上传资产时应保留现有 tag；如果你确定要让该版本指向当前提交，可以选择移动 tag。", flush=True)
    print("1. 保留现有 tag，继续更新 Release 资产（推荐）", flush=True)
    print("2. 移动 tag 到当前提交", flush=True)
    print("3. 取消发布", flush=True)
    while True:
        choice = input("请选择 [1/2/3，默认 1]: ").strip()
        if choice in {"", "1"}:
            return "preserve"
        if choice == "2":
            return "move"
        if choice == "3":
            return "abort"
        print("请输入 1、2 或 3。", flush=True)


def validate_release_tag_name(release_tag: str) -> None:
    if not re.fullmatch(r"v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?", release_tag):
        raise RuntimeError(f"Refusing to modify unsafe release tag name: {release_tag}")


def delete_release_tag(repo_dir: Path, release_tag: str) -> None:
    validate_release_tag_name(release_tag)
    run(["git", "tag", "-d", release_tag], cwd=repo_dir, check=False)
    run(["git", "push", "origin", f":refs/tags/{release_tag}"], cwd=repo_dir)


def ensure_release_tag(
    repo_dir: Path,
    release_tag: str,
    release_title: str,
    *,
    release_exists: bool = False,
    replace_orphan_release_tag: bool = False,
    tag_conflict_mode: str = "ask",
) -> None:
    head_commit = get_git_output(["git", "rev-parse", "HEAD"], cwd=repo_dir)
    remote_tag_target = get_remote_tag_target(repo_dir, release_tag)
    replace_existing_tag = replace_orphan_release_tag
    if remote_tag_target:
        if remote_tag_target != head_commit:
            if replace_orphan_release_tag:
                print(f"正在重建孤立发布 tag {release_tag}: {short_commit(remote_tag_target)} -> {short_commit(head_commit)}")
                delete_release_tag(repo_dir, release_tag)
                remote_tag_target = ""
                replace_existing_tag = True
            elif release_exists:
                action = prompt_existing_release_tag_conflict(release_tag, remote_tag_target, head_commit, tag_conflict_mode)
                if action == "preserve":
                    print(
                        f"GitHub Release 已存在，保留现有 tag {release_tag} "
                        f"({short_commit(remote_tag_target)})，继续更新 Release 资产。",
                        flush=True,
                    )
                    return
                if action == "move":
                    print(f"正在移动发布 tag {release_tag}: {short_commit(remote_tag_target)} -> {short_commit(head_commit)}")
                    delete_release_tag(repo_dir, release_tag)
                    remote_tag_target = ""
                    replace_existing_tag = True
                else:
                    raise RuntimeError(
                        f"已取消发布：远端 tag {release_tag} 指向 {short_commit(remote_tag_target)}，"
                        f"当前发布提交是 {short_commit(head_commit)}。"
                    )
            else:
                raise RuntimeError(
                    f"远端 tag {release_tag} 已存在，但指向 {short_commit(remote_tag_target)}，"
                    f"不是当前提交 {short_commit(head_commit)}。如果对应 GitHub Release 已被删除且这是孤立 tag，"
                    "请重新运行并添加 --replace-orphan-release-tag。"
                )
        if remote_tag_target:
            print(f"远端发布 tag 已存在且指向当前提交: {release_tag}")
            return

    local_tag_target = get_local_tag_target(repo_dir, release_tag)
    if local_tag_target and local_tag_target != head_commit:
        if replace_existing_tag or release_exists:
            print(f"正在重建本地发布 tag {release_tag}: {short_commit(local_tag_target)} -> {short_commit(head_commit)}")
            validate_release_tag_name(release_tag)
            run(["git", "tag", "-d", release_tag], cwd=repo_dir)
            local_tag_target = ""
        else:
            raise RuntimeError(
                f"本地 tag {release_tag} 已存在，但指向 {short_commit(local_tag_target)}，"
                f"不是当前提交 {short_commit(head_commit)}。请删除该本地 tag，或重新运行并添加 --replace-orphan-release-tag。"
            )

    if not local_tag_target:
        run(["git", "tag", "-a", release_tag, "-m", release_title], cwd=repo_dir)
    run(["git", "push", "origin", release_tag], cwd=repo_dir)


def get_github_repo_slug(url: str) -> str:
    match = REPO_URL_RE.search(url or "")
    if not match:
        return ""
    return f"{match.group('owner')}/{match.group('repo')}"


def resolve_github_auth_config(explicit_token: str, token_file_path: str) -> GitHubAuthConfig:
    resolved_token_file = Path(token_file_path).resolve() if token_file_path else DEFAULT_GITHUB_TOKEN_FILE.resolve()
    file_values = load_key_value_file(resolved_token_file)
    if not token_file_path and not file_values and LEGACY_GITHUB_TOKEN_FILE.exists():
        resolved_token_file = LEGACY_GITHUB_TOKEN_FILE.resolve()
        file_values = load_key_value_file(resolved_token_file)

    token = ""
    source = ""
    if explicit_token:
        token = explicit_token
        source = "parameter"
    elif file_values.get("GH_TOKEN"):
        token = file_values["GH_TOKEN"]
        source = f"file:{resolved_token_file} (GH_TOKEN)"
    elif file_values.get("GITHUB_TOKEN"):
        token = file_values["GITHUB_TOKEN"]
        source = f"file:{resolved_token_file} (GITHUB_TOKEN)"
    elif file_values.get("SOURCEFLOW_GITHUB_TOKEN"):
        token = file_values["SOURCEFLOW_GITHUB_TOKEN"]
        source = f"file:{resolved_token_file} (SOURCEFLOW_GITHUB_TOKEN)"
    elif os.environ.get("GH_TOKEN"):
        token = os.environ["GH_TOKEN"]
        source = "process env GH_TOKEN"
    elif os.environ.get("GITHUB_TOKEN"):
        token = os.environ["GITHUB_TOKEN"]
        source = "process env GITHUB_TOKEN"
    elif os.environ.get("SOURCEFLOW_GITHUB_TOKEN"):
        token = os.environ["SOURCEFLOW_GITHUB_TOKEN"]
        source = "process env SOURCEFLOW_GITHUB_TOKEN"

    environment: dict[str, str] = {}
    if token:
        environment["GH_TOKEN"] = token
        environment["GITHUB_TOKEN"] = token

    return GitHubAuthConfig(token=token, source=source, token_file=resolved_token_file, environment=environment)


def require_github_token(token: str, purpose: str) -> str:
    if token or get_github_basic_auth():
        return token
    raise RuntimeError(
        f"GitHub authentication is required to {purpose}. "
        "Set --github-token, GH_TOKEN, GITHUB_TOKEN, or SOURCEFLOW_GITHUB_TOKEN, "
        "or configure git credential manager for github.com."
    )


@functools.lru_cache(maxsize=1)
def get_github_basic_auth() -> tuple[str, str] | None:
    result = run(
        ["git", "credential", "fill"],
        input_text="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        return None

    username = ""
    password = ""
    for line in result.stdout.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key == "username":
            username = value.strip()
        elif key == "password":
            password = value.strip()

    if username and password:
        return username, password
    return None


def note_github_git_credential_fallback() -> None:
    global _GITHUB_GIT_CREDENTIAL_FALLBACK_ANNOUNCED, _GITHUB_PREFER_BASIC_AUTH
    if _GITHUB_GIT_CREDENTIAL_FALLBACK_ANNOUNCED:
        _GITHUB_PREFER_BASIC_AUTH = True
        return
    print("GitHub API bearer token was rejected; retrying with git credential manager auth.", flush=True)
    _GITHUB_GIT_CREDENTIAL_FALLBACK_ANNOUNCED = True
    _GITHUB_PREFER_BASIC_AUTH = True


def get_github_auth_source_label(github_auth: GitHubAuthConfig) -> str:
    if github_auth.source:
        return github_auth.source
    if get_github_basic_auth():
        return "git credential manager"
    return "not set"


def resolve_github_request_auth(
    token: str,
    basic_auth: tuple[str, str] | None,
    *,
    allow_git_credential_fallback: bool,
) -> tuple[str, tuple[str, str] | None]:
    resolved_basic_auth = basic_auth
    use_token = token
    if _GITHUB_PREFER_BASIC_AUTH and allow_git_credential_fallback:
        use_token = ""
    if not use_token and resolved_basic_auth is None and allow_git_credential_fallback:
        resolved_basic_auth = get_github_basic_auth()
    return use_token, resolved_basic_auth


def build_github_request_headers(
    token: str,
    basic_auth: tuple[str, str] | None,
    *,
    extra_headers: Mapping[str, str] | None = None,
) -> dict[str, str]:
    request_headers: dict[str, str] = {
        "Accept": GITHUB_API_ACCEPT,
        "User-Agent": GITHUB_USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
    }
    if token:
        request_headers["Authorization"] = f"Bearer {token}"
    elif basic_auth is not None:
        username, password = basic_auth
        encoded = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        request_headers["Authorization"] = f"Basic {encoded}"
    if extra_headers:
        request_headers.update(extra_headers)
    return request_headers


def is_transient_github_network_error(error: Exception) -> bool:
    if isinstance(error, GitHubApiError):
        return error.status_code in {408, 409, 425, 429, 500, 502, 503, 504}
    message = str(error).lower()
    transient_markers = (
        "timed out",
        "timeout",
        "connection reset",
        "connection aborted",
        "connection refused",
        "temporarily unavailable",
        "operation timed out",
        "unexpected eof",
        "ssl: unexpected_eof_while_reading",
        "eof occurred in violation of protocol",
        "ssleoferror",
        "winerror 10054",
        "winerror 10060",
        "winerror 10061",
        "winerror 10065",
        "remote host closed",
        "forcibly closed",
        "连接尝试失败",
        "主机没有反应",
        "没有正确答复",
        "远程主机强迫关闭",
        "连接超时",
    )
    return any(marker in message for marker in transient_markers)


def should_retry_github_api_method(method: str) -> bool:
    return method.upper() in {"GET", "DELETE", "PATCH", "PUT"}


def _github_api_request_once(
    method: str,
    url: str,
    token: str,
    *,
    basic_auth: tuple[str, str] | None = None,
    json_body: object | None = None,
    data: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    parse_json: bool = True,
    allow_git_credential_fallback: bool = True,
) -> object:
    resolved_token, resolved_basic_auth = resolve_github_request_auth(
        token,
        basic_auth,
        allow_git_credential_fallback=allow_git_credential_fallback,
    )
    request_headers = build_github_request_headers(resolved_token, resolved_basic_auth, extra_headers=headers)
    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        request_headers["Content-Type"] = "application/json; charset=utf-8"

    request = urllib_request.Request(url=url, data=data, headers=request_headers, method=method)
    try:
        with urllib_request.urlopen(request, timeout=GITHUB_API_TIMEOUT_SECONDS) as response:
            body = response.read()
    except urllib_error.HTTPError as exc:
        if resolved_token and resolved_basic_auth is None and allow_git_credential_fallback and exc.code in {401, 403}:
            fallback_basic_auth = get_github_basic_auth()
            if fallback_basic_auth is not None:
                note_github_git_credential_fallback()
                return _github_api_request_once(
                    method,
                    url,
                    token="",
                    basic_auth=fallback_basic_auth,
                    json_body=json_body,
                    data=data,
                    headers=headers,
                    parse_json=parse_json,
                    allow_git_credential_fallback=False,
                )
        raw_body = exc.read().decode("utf-8", errors="replace")
        message = raw_body.strip() or exc.reason
        try:
            payload = json.loads(raw_body)
            if isinstance(payload, dict):
                message = str(payload.get("message") or payload.get("error") or message)
                if payload.get("errors"):
                    message = f"{message} | {payload['errors']}"
        except json.JSONDecodeError:
            pass
        raise GitHubApiError(method, url, exc.code, message) from exc
    except urllib_error.URLError as exc:
        raise RuntimeError(f"GitHub API {method} {url} failed: {exc.reason}") from exc

    if not parse_json:
        return body
    if not body:
        return {}
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"GitHub API returned invalid JSON for {method} {url}") from exc


def github_api_request(
    method: str,
    path_or_url: str,
    token: str = "",
    *,
    basic_auth: tuple[str, str] | None = None,
    json_body: object | None = None,
    data: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    parse_json: bool = True,
    allow_git_credential_fallback: bool = True,
) -> object:
    url = path_or_url if path_or_url.startswith("http://") or path_or_url.startswith("https://") else f"{GITHUB_API_BASE}{path_or_url}"
    max_attempts = GITHUB_API_MAX_ATTEMPTS if should_retry_github_api_method(method) else 1
    for attempt in range(1, max_attempts + 1):
        try:
            return _github_api_request_once(
                method,
                url,
                token,
                basic_auth=basic_auth,
                json_body=json_body,
                data=data,
                headers=headers,
                parse_json=parse_json,
                allow_git_credential_fallback=allow_git_credential_fallback,
            )
        except GitHubApiError as exc:
            if method.upper() == "DELETE" and attempt > 1 and exc.status_code == 404:
                return b"" if not parse_json else {}
            if attempt == max_attempts or not is_transient_github_network_error(exc):
                raise
            wait_seconds = min(20, attempt * 2) + random.uniform(0, 0.5)
            print(
                f"GitHub API retry {attempt}/{max_attempts - 1} for {method.upper()} {url} after transient failure: {exc}",
                flush=True,
            )
            time.sleep(wait_seconds)
        except RuntimeError as exc:
            if attempt == max_attempts or not is_transient_github_network_error(exc):
                raise
            wait_seconds = min(20, attempt * 2) + random.uniform(0, 0.5)
            print(
                f"GitHub API retry {attempt}/{max_attempts - 1} for {method.upper()} {url} after transient failure: {exc}",
                flush=True,
            )
            time.sleep(wait_seconds)


def get_github_repository(token: str, repo_slug: str, *, allow_missing: bool = False) -> dict[str, object] | None:
    try:
        result = github_api_request("GET", f"/repos/{repo_slug}", token)
        return result if isinstance(result, dict) else {}
    except GitHubApiError as exc:
        if allow_missing and exc.status_code == 404:
            return None
        raise


def ensure_github_repository_exists(token: str, repo_slug: str, visibility: str) -> None:
    existing_repo = get_github_repository(token, repo_slug, allow_missing=True)
    if existing_repo:
        print(f"Repository already exists: {repo_slug}")
        return

    token = require_github_token(token, "create a GitHub repository")
    owner, repo_name = repo_slug.split("/", 1)
    viewer = github_api_request("GET", "/user", token)
    if not isinstance(viewer, dict):
        raise RuntimeError("Unable to resolve the authenticated GitHub user.")

    viewer_login = str(viewer.get("login", "")).strip()
    if not viewer_login:
        raise RuntimeError("Authenticated GitHub user login is empty.")

    if owner.lower() == viewer_login.lower():
        if visibility == "internal":
            raise RuntimeError("GitHub user repositories do not support internal visibility. Use public or private.")
        payload = {
            "name": repo_name,
            "private": visibility != "public",
        }
        created = github_api_request("POST", "/user/repos", token, json_body=payload)
    else:
        payload: dict[str, object] = {
            "name": repo_name,
            "visibility": visibility,
        }
        if visibility != "internal":
            payload["private"] = visibility == "private"
        created = github_api_request("POST", f"/orgs/{owner}/repos", token, json_body=payload)

    html_url = created.get("html_url") if isinstance(created, dict) else ""
    print(f"Repository created: {html_url or repo_slug}")


def get_github_release_by_tag(token: str, repo_slug: str, release_tag: str, *, allow_missing: bool = False) -> dict[str, object] | None:
    encoded_tag = urllib_parse.quote(release_tag, safe="")
    try:
        result = github_api_request("GET", f"/repos/{repo_slug}/releases/tags/{encoded_tag}", token)
        return result if isinstance(result, dict) else {}
    except GitHubApiError as exc:
        if allow_missing and exc.status_code == 404:
            return None
        raise


def remote_github_release_exists(token: str, repo_slug: str, release_tag: str) -> bool:
    return get_github_release_by_tag(token, repo_slug, release_tag, allow_missing=True) is not None


def resolve_release_tag_sync_plan(
    token: str,
    repo_slug: str,
    repository_url: str,
    release_tag: str,
    *,
    create_release: bool,
    auto_sync_release_tags: bool,
    force_replace_orphan_tag: bool,
) -> ReleaseTagSyncPlan:
    if not create_release:
        return ReleaseTagSyncPlan(
            release_exists=False,
            remote_tag_target="",
            should_replace_orphan_tag=False,
            description="已跳过（--skip-release）",
        )

    release_exists = remote_github_release_exists(token, repo_slug, release_tag)
    remote_tag_target = get_remote_tag_target_for_url(repository_url, release_tag)

    if release_exists:
        description = (
            "GitHub Release 已存在；如果 tag 与当前提交不同，将保留现有 tag 并继续更新 Release 资产。"
            if remote_tag_target else
            "GitHub Release 已存在，但远端 tag 不存在；发布时会补建 tag。"
        )
        return ReleaseTagSyncPlan(
            release_exists=True,
            remote_tag_target=remote_tag_target,
            should_replace_orphan_tag=False,
            description=description,
        )

    if not remote_tag_target:
        return ReleaseTagSyncPlan(
            release_exists=False,
            remote_tag_target="",
            should_replace_orphan_tag=False,
            description="GitHub Release 和远端 tag 都不存在；发布时会创建。",
        )

    if force_replace_orphan_tag:
        return ReleaseTagSyncPlan(
            release_exists=False,
            remote_tag_target=remote_tag_target,
            should_replace_orphan_tag=True,
            description="GitHub Release 不存在但远端 tag 仍存在；--replace-orphan-release-tag 将把 tag 重建到当前发布提交。",
        )

    if auto_sync_release_tags:
        return ReleaseTagSyncPlan(
            release_exists=False,
            remote_tag_target=remote_tag_target,
            should_replace_orphan_tag=True,
            description="GitHub Release 不存在但远端 tag 仍存在；自动同步会把 tag 重建到当前发布提交。",
        )

    return ReleaseTagSyncPlan(
        release_exists=False,
        remote_tag_target=remote_tag_target,
        should_replace_orphan_tag=False,
        description="GitHub Release 不存在但远端 tag 仍存在；自动同步已禁用。",
    )


def get_default_release_notes_paths(version: str) -> tuple[Path, Path]:
    changelog_dir = APP_CHANGELOG_ROOT / f"v{version}"
    return changelog_dir / f"v{version}_zh_CN.md", changelog_dir / f"v{version}.md"


def get_latest_previous_semver_tag(current_tag: str) -> str:
    result = run(["git", "tag", "--list", "v[0-9]*", "--sort=-v:refname"], cwd=PROJECT_ROOT, capture_output=True, check=False)
    if result.returncode != 0:
        return ""
    current_version = current_tag[1:] if current_tag.startswith("v") else current_tag
    try:
        current_tuple = parse_semver(current_version)
    except RuntimeError:
        current_tuple = None
    for raw_tag in result.stdout.splitlines():
        tag = raw_tag.strip()
        if not tag or tag == current_tag:
            continue
        version = tag[1:] if tag.startswith("v") else tag
        try:
            parsed = parse_semver(version)
        except RuntimeError:
            continue
        if current_tuple is None or parsed < current_tuple:
            return tag
    return ""


def get_release_commit_subjects(release_tag: str, limit: int = 80) -> tuple[str, list[str]]:
    previous_tag = get_latest_previous_semver_tag(release_tag)
    if previous_tag:
        range_spec = f"{previous_tag}..HEAD"
        args = ["git", "log", "--no-merges", "--pretty=format:%h %s", range_spec, f"-n{limit}"]
    else:
        range_spec = f"HEAD - last {limit} commits"
        args = ["git", "log", "--no-merges", "--pretty=format:%h %s", f"-n{limit}"]
    result = run(args, cwd=PROJECT_ROOT, capture_output=True, check=False)
    if result.returncode != 0:
        return range_spec, []
    subjects = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return range_spec, subjects


def classify_release_commit(subject: str) -> str:
    text = subject.lower()
    if any(marker in text for marker in ("fix", "修复", "bug", "crash", "panic", "安全", "漏洞", "security")):
        return "fix"
    if any(marker in text for marker in ("test", "smoke", "validate", "quality", "ci", "门禁", "测试")):
        return "quality"
    if any(marker in text for marker in ("build", "release", "publish", "package", "portable", "编译", "发布", "打包")):
        return "release"
    if any(marker in text for marker in ("plugin", "bazaar", "market", "插件", "集市", "商城")):
        return "plugin"
    if any(marker in text for marker in ("feat", "feature", "add", "新增", "支持")):
        return "feature"
    return "other"


def render_release_commit_section(subjects: Sequence[str], zh: bool) -> str:
    if not subjects:
        return "- 暂无可自动提取的提交摘要，请发布前补充。\n" if zh else "- No commit summary was automatically extracted. Review before release.\n"
    buckets = {
        "feature": "新增功能" if zh else "New Features",
        "plugin": "插件和集市" if zh else "Plugins and Bazaar",
        "release": "构建和发布" if zh else "Build and Release",
        "quality": "质量和测试" if zh else "Quality and Tests",
        "fix": "修复和稳定性" if zh else "Fixes and Stability",
        "other": "其他变更" if zh else "Other Changes",
    }
    grouped: dict[str, list[str]] = {key: [] for key in buckets}
    for subject in subjects:
        grouped[classify_release_commit(subject)].append(subject)

    lines: list[str] = []
    for key, title in buckets.items():
        items = grouped[key]
        if not items:
            continue
        lines.append(f"### {title}")
        lines.extend(f"- {item}" for item in items)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def build_generated_release_notes(version: str, release_tag: str, target: ReleaseTarget, *, zh: bool) -> str:
    range_spec, subjects = get_release_commit_subjects(release_tag)
    if zh:
        return f"""## 概述

SourceFlow {release_tag} 是当前版本发布说明。此文件由 `发布.py` 自动生成；发布前请审核、删减或补充措辞。

## 本次发布重点

- 笔记主流程保持本地优先，围绕创建、编辑、资源附件、同步和跨设备使用继续收敛稳定性。
- 发布链路会优先使用 `编译.py` 产物，并在 GitHub Release 中写入本说明和校验文件。
- 插件与集市能力保持可选：插件安装后默认不运行，启用前展示来源、权限和 SHA-256 摘要。
- 发布目标由运行 `发布.py --platform/--arch` 时决定，最终以 GitHub Release 资产列表为准。

## 自动提取的变更

来源：`git log {range_spec}`。这些条目需要人工审核，不适合直接照单全收时请编辑本文件。

{render_release_commit_section(subjects, zh=True)}
## 下载和校验

- 安装包、便携包和浏览器扩展压缩包会随 GitHub Release 一起上传。
- `SHA256SUMS.txt` 用于校验下载文件完整性。
- 如果某个平台或架构没有对应产物，请以 release asset 列表为准。

## 已知说明

- 插件、AI、集市、网页采集等附加能力应作为可选能力处理；发布前应确认这些功能失败时不影响记笔记和同步主流程。
- 如果修改了本说明，请重新运行 `python 发布.py --release-notes-only --version-bump none` 预览最终内容。
"""
    return f"""## Overview

SourceFlow {release_tag} release notes. This file was generated by `发布.py`; review and edit it before publishing.

## Highlights

- The core note workflow remains local-first, with continued focus on editing, assets, sync, and cross-device stability.
- The release flow uses artifacts produced by `编译.py` and writes this body plus checksums into the GitHub Release.
- Plugins and Bazaar stay optional: plugins are disabled after install until the user reviews source, permissions, and SHA-256.
- The release target is selected by `发布.py --platform/--arch`; the GitHub Release asset list is the source of truth.

## Automatically Extracted Changes

Source: `git log {range_spec}`. Review these entries before publishing.

{render_release_commit_section(subjects, zh=False)}
## Downloads and Verification

- Installers, portable packages, and the browser extension zip are uploaded as GitHub Release assets.
- `SHA256SUMS.txt` can be used to verify downloaded files.
- If a platform or architecture is missing, the release asset list is the source of truth.

## Notes

- Plugins, AI, Bazaar, and web clipping are optional features; release validation should confirm they do not break note taking or sync when they fail.
- After editing these notes, run `python 发布.py --release-notes-only --version-bump none` to preview the final body.
"""


def prepare_release_notes(
    version: str,
    release_tag: str,
    target: ReleaseTarget,
    *,
    explicit_notes_file: str,
    skip_generate: bool,
    write_files: bool,
) -> tuple[Path | None, list[Path], str]:
    if explicit_notes_file:
        notes_file = Path(explicit_notes_file).resolve()
        if not notes_file.is_file():
            raise RuntimeError(f"Release notes file does not exist: {notes_file}")
        return notes_file, [], read_release_notes(notes_file)

    zh_path, en_path = get_default_release_notes_paths(version)
    if zh_path.is_file():
        return zh_path.resolve(), [], read_release_notes(zh_path)
    if en_path.is_file():
        return en_path.resolve(), [], read_release_notes(en_path)
    if skip_generate:
        return None, [], ""

    zh_body = build_generated_release_notes(version, release_tag, target, zh=True)
    en_body = build_generated_release_notes(version, release_tag, target, zh=False)
    generated = [zh_path.resolve(), en_path.resolve()]
    if write_files:
        zh_path.parent.mkdir(parents=True, exist_ok=True)
        zh_path.write_text(zh_body, encoding="utf-8")
        en_path.write_text(en_body, encoding="utf-8")
    return zh_path.resolve(), generated, zh_body


def print_release_notes_review(notes_file: Path | None, generated_files: Sequence[Path], body: str, *, hidden: bool) -> None:
    if hidden:
        return
    if not notes_file and not body:
        print("Release notes: not set")
        return
    print_step("Release notes for review")
    if notes_file:
        print(f"Release notes file: {notes_file}")
    if generated_files:
        print("Generated files:")
        for path in generated_files:
            print(f"- {path}")
    if body:
        print()
        if len(body) > RELEASE_NOTES_REVIEW_LIMIT:
            print(body[:RELEASE_NOTES_REVIEW_LIMIT])
            print(f"\n... release notes truncated for console review ({len(body)} chars total)")
        else:
            print(body)


def read_release_notes(notes_file: Path | None) -> str:
    if not notes_file or not notes_file.exists():
        return ""
    return notes_file.read_text(encoding="utf-8").strip()


def delete_existing_release_asset(token: str, repo_slug: str, asset_id: int) -> None:
    try:
        github_api_request(
            "DELETE",
            f"/repos/{repo_slug}/releases/assets/{asset_id}",
            token,
            parse_json=False,
        )
    except GitHubApiError as exc:
        if exc.status_code == 404:
            return
        raise


def is_transient_release_upload_error(error: Exception) -> bool:
    return is_transient_github_network_error(error)


def upload_release_asset(token: str, repo_slug: str, release_id: int, upload_url: str, artifact_path: Path) -> str:
    upload_target = upload_url.split("{", 1)[0]
    upload_target = f"{upload_target}?{urllib_parse.urlencode({'name': artifact_path.name})}"
    content_type = mimetypes.guess_type(artifact_path.name)[0] or "application/octet-stream"
    for attempt in range(1, RELEASE_UPLOAD_MAX_ATTEMPTS + 1):
        try:
            upload_release_asset_streaming(upload_target, token, artifact_path, content_type)
            return "uploaded"
        except GitHubApiError as exc:
            if exc.status_code == 422 and "already_exists" in exc.message.lower():
                matching_asset = get_matching_uploaded_release_asset(token, repo_slug, release_id, artifact_path, attempts=2, delay_seconds=0.5)
                if matching_asset is not None:
                    return "reused-remote"
                delete_existing_named_release_asset(token, repo_slug, release_id, artifact_path.name)
                if attempt < RELEASE_UPLOAD_MAX_ATTEMPTS:
                    continue
            matching_asset = get_matching_uploaded_release_asset(token, repo_slug, release_id, artifact_path, attempts=2, delay_seconds=0.5)
            if matching_asset is not None:
                return "reused-remote"
            if attempt == RELEASE_UPLOAD_MAX_ATTEMPTS or not is_transient_release_upload_error(exc):
                raise
            delete_existing_named_release_asset(token, repo_slug, release_id, artifact_path.name)
            wait_seconds = min(30, attempt * 3) + random.uniform(0, 1.0)
            print(
                f"Release asset upload retry {attempt}/{RELEASE_UPLOAD_MAX_ATTEMPTS - 1} for {artifact_path.name} after transient failure: {exc}",
                flush=True,
            )
            time.sleep(wait_seconds)
        except Exception as exc:
            matching_asset = get_matching_uploaded_release_asset(token, repo_slug, release_id, artifact_path, attempts=2, delay_seconds=0.5)
            if matching_asset is not None:
                return "reused-remote"
            if attempt == RELEASE_UPLOAD_MAX_ATTEMPTS or not is_transient_release_upload_error(exc):
                raise
            delete_existing_named_release_asset(token, repo_slug, release_id, artifact_path.name)
            wait_seconds = min(30, attempt * 3) + random.uniform(0, 1.0)
            print(
                f"Release asset upload retry {attempt}/{RELEASE_UPLOAD_MAX_ATTEMPTS - 1} for {artifact_path.name} after transient failure: {exc}",
                flush=True,
            )
            time.sleep(wait_seconds)
    raise RuntimeError(f"GitHub release upload did not finish for {artifact_path.name}")


def upload_release_asset_streaming(
    upload_target: str,
    token: str,
    artifact_path: Path,
    content_type: str,
    *,
    basic_auth: tuple[str, str] | None = None,
    allow_git_credential_fallback: bool = True,
) -> dict[str, object]:
    resolved_token, resolved_basic_auth = resolve_github_request_auth(
        token,
        basic_auth,
        allow_git_credential_fallback=allow_git_credential_fallback,
    )
    request_headers = build_github_request_headers(
        resolved_token,
        resolved_basic_auth,
        extra_headers={
            "Content-Type": content_type,
            "Content-Length": str(artifact_path.stat().st_size),
            "Connection": "close",
        },
    )

    parsed_url = urllib_parse.urlparse(upload_target)
    request_path = parsed_url.path + (f"?{parsed_url.query}" if parsed_url.query else "")
    connection = http.client.HTTPSConnection(parsed_url.netloc, timeout=RELEASE_UPLOAD_TIMEOUT_SECONDS)
    try:
        connection.putrequest("POST", request_path)
        for key, value in request_headers.items():
            connection.putheader(key, value)
        connection.endheaders()

        with artifact_path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(RELEASE_UPLOAD_CHUNK_SIZE), b""):
                connection.send(chunk)

        response = connection.getresponse()
        body = response.read()
    except KeyboardInterrupt:
        raise
    except (OSError, http.client.HTTPException) as exc:
        raise RuntimeError(f"GitHub release upload failed for {artifact_path.name}: {exc}") from exc
    finally:
        connection.close()

    raw_body = body.decode("utf-8", errors="replace")
    if response.status in {401, 403} and resolved_token and resolved_basic_auth is None and allow_git_credential_fallback:
        fallback_basic_auth = get_github_basic_auth()
        if fallback_basic_auth is not None:
            note_github_git_credential_fallback()
            return upload_release_asset_streaming(
                upload_target,
                token="",
                artifact_path=artifact_path,
                content_type=content_type,
                basic_auth=fallback_basic_auth,
                allow_git_credential_fallback=False,
            )

    if response.status >= 400:
        message = raw_body.strip() or response.reason
        try:
            payload = json.loads(raw_body)
            if isinstance(payload, dict):
                message = str(payload.get("message") or payload.get("error") or message)
                if payload.get("errors"):
                    message = f"{message} | {payload['errors']}"
        except json.JSONDecodeError:
            pass
        raise GitHubApiError("POST", upload_target, response.status, message)

    if not raw_body:
        return {}
    try:
        payload = json.loads(raw_body)
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def list_release_assets(token: str, repo_slug: str, release_id: int) -> list[dict[str, object]]:
    result = github_api_request("GET", f"/repos/{repo_slug}/releases/{release_id}/assets", token)
    if not isinstance(result, list):
        return []
    return [item for item in result if isinstance(item, dict)]


def get_release_asset_map(token: str, repo_slug: str, release_id: int) -> dict[str, dict[str, object]]:
    assets: dict[str, dict[str, object]] = {}
    for asset in list_release_assets(token, repo_slug, release_id):
        asset_name = str(asset.get("name", "")).strip()
        if asset_name:
            assets[asset_name] = asset
    return assets


def describe_release_asset(asset_name: str, asset: Mapping[str, object] | None) -> str:
    if not isinstance(asset, Mapping):
        return asset_name
    state = str(asset.get("state", "")).strip() or "unknown"
    size = asset.get("size")
    size_text = str(size) if isinstance(size, int) else "unknown"
    return f"{asset_name} (state={state}, size={size_text})"


def format_release_asset_size(size: int | None) -> str:
    if size is None:
        return "-"
    value = float(size)
    units = ("B", "KB", "MB", "GB", "TB")
    unit_index = 0
    while value >= 1024 and unit_index < len(units) - 1:
        value /= 1024
        unit_index += 1
    if unit_index == 0:
        return f"{int(value)} {units[unit_index]}"
    return f"{value:.1f} {units[unit_index]}"


def print_release_asset_summary(entries: Sequence[ReleaseAssetSyncEntry]) -> None:
    if not entries:
        print("Release asset summary: no assets.", flush=True)
        return

    print("Release asset one-line summary:", flush=True)
    for entry in entries:
        print(
            "ASSET "
            f"{entry.name} | action={entry.action} | "
            f"local={format_release_asset_size(entry.local_size)} | "
            f"remote={format_release_asset_size(entry.remote_size)} | "
            f"state={entry.remote_state}",
            flush=True,
        )

    headers = ("Asset", "Action", "Local", "Remote", "State")
    rows = [
        (
            entry.name,
            entry.action,
            format_release_asset_size(entry.local_size),
            format_release_asset_size(entry.remote_size),
            entry.remote_state,
        )
        for entry in entries
    ]
    widths = [len(header) for header in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))

    def format_row(row: Sequence[str]) -> str:
        return " | ".join(cell.ljust(widths[index]) for index, cell in enumerate(row))

    separator = "-+-".join("-" * width for width in widths)
    print("Release asset table:", flush=True)
    print(format_row(headers), flush=True)
    print(separator, flush=True)
    for row in rows:
        print(format_row(row), flush=True)


def get_matching_uploaded_release_asset(
    token: str,
    repo_slug: str,
    release_id: int,
    artifact_path: Path,
    *,
    attempts: int = 3,
    delay_seconds: float = 1.0,
) -> dict[str, object] | None:
    expected_size = artifact_path.stat().st_size
    for attempt in range(1, attempts + 1):
        asset = get_release_asset_map(token, repo_slug, release_id).get(artifact_path.name)
        if isinstance(asset, dict):
            remote_state = str(asset.get("state", "")).strip().lower()
            remote_size = asset.get("size")
            if remote_state == "uploaded" and isinstance(remote_size, int) and remote_size == expected_size:
                return asset
        if attempt < attempts:
            time.sleep(delay_seconds)
    return None


def delete_release_assets_not_in_set(token: str, repo_slug: str, release_id: int, expected_asset_names: set[str]) -> None:
    stale_assets = [
        (asset_name, asset)
        for asset_name, asset in get_release_asset_map(token, repo_slug, release_id).items()
        if asset_name not in expected_asset_names
    ]
    if not stale_assets:
        print("Release asset cleanup: no stale remote assets.", flush=True)
        return
    print("Release asset cleanup: deleting stale remote assets.", flush=True)
    for asset_name, asset in stale_assets:
        print(f"- delete {describe_release_asset(asset_name, asset)}", flush=True)
        asset_id = asset.get("id")
        if isinstance(asset_id, int):
            delete_existing_release_asset(token, repo_slug, asset_id)


def delete_existing_named_release_asset(token: str, repo_slug: str, release_id: int, asset_name: str) -> None:
    asset = get_release_asset_map(token, repo_slug, release_id).get(asset_name)
    asset_id = asset.get("id") if isinstance(asset, dict) else None
    if isinstance(asset_id, int):
        delete_existing_release_asset(token, repo_slug, asset_id)


def verify_release_assets_synced(token: str, repo_slug: str, release_id: int, artifact_paths: Sequence[Path]) -> dict[str, dict[str, object]]:
    remote_assets = get_release_asset_map(token, repo_slug, release_id)
    expected = {artifact_path.name: artifact_path.stat().st_size for artifact_path in artifact_paths}
    missing: list[str] = []
    mismatched: list[str] = []
    stale = sorted(asset_name for asset_name in remote_assets if asset_name not in expected)

    for asset_name, expected_size in expected.items():
        remote_asset = remote_assets.get(asset_name)
        if not isinstance(remote_asset, dict):
            missing.append(asset_name)
            continue
        remote_state = str(remote_asset.get("state", "")).strip().lower()
        remote_size = remote_asset.get("size")
        if remote_state != "uploaded" or not isinstance(remote_size, int) or remote_size != expected_size:
            mismatched.append(
                f"{asset_name} (expected size={expected_size}, remote state={remote_state or 'unknown'}, remote size={remote_size})"
            )

    if missing or mismatched or stale:
        details: list[str] = []
        if missing:
            details.append("missing: " + ", ".join(sorted(missing)))
        if mismatched:
            details.append("mismatched: " + "; ".join(mismatched))
        if stale:
            details.append("stale: " + ", ".join(stale))
        raise RuntimeError("GitHub release asset verification failed: " + " | ".join(details))
    return remote_assets


def sync_release_assets(token: str, repo_slug: str, release: dict[str, object], artifact_paths: list[Path]) -> None:
    upload_url = str(release.get("upload_url", "")).strip()
    if not upload_url:
        raise RuntimeError("GitHub release upload URL is missing.")
    release_id = release.get("id")
    if not isinstance(release_id, int):
        raise RuntimeError("GitHub release id is missing.")

    desired_asset_names = {artifact_path.name for artifact_path in artifact_paths}
    print(f"Release asset sync: remote release id={release_id}, desired assets={len(desired_asset_names)}.", flush=True)
    delete_release_assets_not_in_set(token, repo_slug, release_id, desired_asset_names)
    existing_assets = get_release_asset_map(token, repo_slug, release_id)
    print(f"Release asset sync: remote assets after cleanup={len(existing_assets)}.", flush=True)
    skipped_count = 0
    replaced_count = 0
    uploaded_count = 0
    action_map: dict[str, str] = {}

    for artifact_path in artifact_paths:
        existing_asset = existing_assets.get(artifact_path.name)
        if existing_asset:
            existing_size = existing_asset.get("size")
            existing_state = str(existing_asset.get("state", "")).strip().lower()
            if existing_state == "uploaded" and isinstance(existing_size, int) and existing_size == artifact_path.stat().st_size:
                skipped_count += 1
                action_map[artifact_path.name] = "skip"
                continue

            action_prefix = "replace"
            existing_asset_id = existing_asset.get("id")
            if isinstance(existing_asset_id, int):
                delete_existing_release_asset(token, repo_slug, existing_asset_id)
                replaced_count += 1
        else:
            action_prefix = "upload"

        upload_outcome = upload_release_asset(token, repo_slug, release_id, upload_url, artifact_path)
        uploaded_count += 1
        action_map[artifact_path.name] = action_prefix if upload_outcome == "uploaded" else f"{action_prefix}+reuse"

    remote_assets = verify_release_assets_synced(token, repo_slug, release_id, artifact_paths)
    summary_entries = [
        ReleaseAssetSyncEntry(
            name=artifact_path.name,
            action=action_map.get(artifact_path.name, "unknown"),
            local_size=artifact_path.stat().st_size,
            remote_state=str(remote_assets.get(artifact_path.name, {}).get("state", "")).strip() or "missing",
            remote_size=remote_assets.get(artifact_path.name, {}).get("size") if isinstance(remote_assets.get(artifact_path.name), dict) else None,
        )
        for artifact_path in artifact_paths
    ]
    print_release_asset_summary(summary_entries)
    print(
        f"Release asset sync complete: uploaded={uploaded_count}, replaced={replaced_count}, skipped={skipped_count}, verified={len(artifact_paths)}.",
        flush=True,
    )


def resolve_default_notes_file(version: str) -> Path | None:
    zh_path, en_path = get_default_release_notes_paths(version)
    candidates = [zh_path, en_path]
    for path in candidates:
        if path.exists():
            return path
    return None


def normalize_repo_relative(path_text: str) -> str:
    return path_text.replace("\\", "/").strip().strip("/")


def is_hard_excluded(relative_path: str) -> bool:
    normalized = normalize_repo_relative(relative_path)
    return any(
        normalized == excluded or normalized.startswith(f"{excluded}/")
        for excluded in HARD_EXCLUDED_RELATIVE_PATHS
    )


def is_public_export_excluded(relative_path: str) -> bool:
    normalized = normalize_repo_relative(relative_path)
    top_level_name = normalized.split("/", 1)[0]
    if top_level_name not in PUBLIC_EXPORT_INCLUDED_ROOT_PATHS:
        return True
    return any(
        normalized == excluded or normalized.startswith(f"{excluded}/")
        for excluded in PUBLIC_EXPORT_EXCLUDED_RELATIVE_PATHS
    )


@functools.lru_cache(maxsize=1)
def get_public_export_referenced_screenshots() -> frozenset[str]:
    referenced: set[str] = set()
    for readme_name in ("README.md", "README_EN.md"):
        readme_path = PROJECT_ROOT / readme_name
        if not readme_path.is_file():
            continue
        content = readme_path.read_text(encoding="utf-8")
        for match in SCREENSHOT_REFERENCE_RE.findall(content):
            referenced.add(normalize_repo_relative(match))
    return frozenset(referenced)


def get_export_candidates() -> list[ExportCandidate]:
    result = run(
        ["git", "-c", "core.quotepath=false", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        cwd=PROJECT_ROOT,
        capture_output=True,
    )
    raw_paths = [normalize_repo_relative(item) for item in result.stdout.split("\0") if item]
    relative_files: list[str] = []
    for relative_path in sorted(set(raw_paths)):
        full_path = PROJECT_ROOT / Path(relative_path)
        if full_path.is_file():
            relative_files.append(relative_path)
    directory_paths: set[str] = set()
    file_candidates: list[ExportCandidate] = []

    for relative_path in relative_files:
        if is_hard_excluded(relative_path) or is_public_export_excluded(relative_path):
            continue
        if relative_path.startswith("screenshots/") and relative_path not in get_public_export_referenced_screenshots():
            continue

        full_path = PROJECT_ROOT / Path(relative_path)
        file_candidates.append(ExportCandidate(relative_path=relative_path, full_path=full_path, is_dir=False))

        parent = PurePosixPath(relative_path).parent
        while str(parent) != ".":
            parent_path = parent.as_posix()
            if not is_hard_excluded(parent_path) and not is_public_export_excluded(parent_path):
                directory_paths.add(parent_path)
            parent = parent.parent

    directory_candidates = [
        ExportCandidate(relative_path=relative_path, full_path=PROJECT_ROOT / Path(relative_path), is_dir=True)
        for relative_path in sorted(directory_paths)
    ]
    return [*directory_candidates, *file_candidates]


def get_preview_root_items(candidates: list[ExportCandidate]) -> list[ExportCandidate]:
    return sorted(
        [candidate for candidate in candidates if "/" not in candidate.relative_path],
        key=lambda candidate: (not candidate.is_dir, candidate.name),
    )


def show_export_preview(candidates: list[ExportCandidate]) -> None:
    print()
    print("Root items that will be uploaded to GitHub (tracked files, non-ignored extras, export exclusions applied):")
    for item in get_preview_root_items(candidates):
        prefix = "DIR " if item.is_dir else "FILE"
        print(f"{prefix:4} {item.name}")


def handle_interrupt(_signum: int, _frame: object) -> None:
    global _INTERRUPT_COUNT
    _INTERRUPT_COUNT += 1
    if _INTERRUPT_COUNT == 1:
        raise KeyboardInterrupt
    raise SystemExit(130)


def remove_directory_safe(target_path: Path) -> None:
    if not target_path.exists():
        return
    resolved_target = target_path.resolve()
    resolved_export_root = EXPORT_ROOT.resolve()
    if not path_is_within(resolved_target, resolved_export_root):
        raise RuntimeError(f"Refusing to delete path outside export root: {resolved_target}")

    cleanup_target = EXPORT_ROOT / f".cleanup-{uuid.uuid4().hex}"
    for attempt in range(5):
        try:
            resolved_target.rename(cleanup_target)
            break
        except FileNotFoundError:
            return
        except OSError:
            if attempt == 4:
                raise
            time.sleep(0.5)

    for attempt in range(5):
        try:
            shutil.rmtree(cleanup_target)
            return
        except FileNotFoundError:
            return
        except OSError:
            if attempt == 4:
                _POST_RUN_WARNINGS.append(f"临时导出目录未能完全清理: {cleanup_target}")
                return
            time.sleep(0.5)


def copy_open_source_tree(target_root: Path, candidates: list[ExportCandidate]) -> None:
    for directory in sorted((candidate for candidate in candidates if candidate.is_dir), key=lambda item: item.relative_path):
        (target_root / Path(directory.relative_path)).mkdir(parents=True, exist_ok=True)

    for file_candidate in sorted((candidate for candidate in candidates if not candidate.is_dir), key=lambda item: item.relative_path):
        target_path = target_root / Path(file_candidate.relative_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file_candidate.full_path, target_path)


def clear_export_worktree(target_root: Path) -> None:
    for child in target_root.iterdir():
        if child.name == ".git":
            continue
        remove_path_with_retry(child)


def missing_required_paths(target_root: Path) -> list[str]:
    return [relative_path for relative_path in REQUIRED_EXPORT_PATHS if not (target_root / Path(relative_path)).exists()]


def is_secret_scan_candidate(file_path: Path, root_path: Path) -> bool:
    relative_path = file_path.relative_to(root_path).as_posix()
    if relative_path.startswith("app/stage/protyle/js/"):
        return False
    if file_path.suffix.lower() in SECRET_SCAN_SKIP_EXTENSIONS:
        return False
    if file_path.name.endswith(".min.js") or file_path.name.endswith(".min.mjs"):
        return False
    return file_path.stat().st_size < 2 * 1024 * 1024


def find_high_risk_secrets(root_path: Path) -> list[tuple[Path, str]]:
    findings: list[tuple[Path, str]] = []
    for file_path in root_path.rglob("*"):
        if not file_path.is_file() or not is_secret_scan_candidate(file_path, root_path):
            continue
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for pattern in SECRET_PATTERNS:
            if pattern.search(content):
                findings.append((file_path, pattern.pattern))
                break
    return findings


def prepare_export_repo(branch: str, repository_url: str, export_dir: Path) -> None:
    print_step("Initialize git repository")
    run(["git", "init", f"--initial-branch={branch}"], cwd=export_dir)
    run(["git", "remote", "add", "origin", repository_url], cwd=export_dir)

    branch_check = run(
        ["git", "ls-remote", "--exit-code", "--heads", "origin", branch],
        cwd=export_dir,
        capture_output=True,
        check=False,
    )
    if branch_check.returncode == 0:
        run(["git", "fetch", "--depth=1", "origin", branch], cwd=export_dir, capture_output=True)
        run(["git", "checkout", "-B", branch, "FETCH_HEAD"], cwd=export_dir, capture_output=True)
        return

    if branch_check.returncode != 2:
        stderr = branch_check.stderr.strip()
        raise RuntimeError(f"Unable to inspect remote branch {branch}: {stderr or repository_url}")


def finalize_export_repo(branch: str, commit_message: str, export_dir: Path, no_push: bool) -> None:
    run(["git", "add", "-A"], cwd=export_dir)
    staged_changes = run(["git", "diff", "--cached", "--quiet"], cwd=export_dir, check=False)
    if staged_changes.returncode == 1:
        run(["git", "commit", "-m", commit_message], cwd=export_dir)
    elif staged_changes.returncode != 0:
        raise RuntimeError("Unable to determine whether the export repository has staged changes.")

    if no_push:
        print_step("Skip push")
        return

    print_step("Push to GitHub")
    run(["git", "push", "-u", "origin", branch], cwd=export_dir)


def export_public_repository(repository_url: str, branch: str, commit_message: str, export_dir: Path, no_push: bool) -> None:
    require_command("git")
    candidates = get_export_candidates()

    print_step("Prepare export directory")
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    remove_directory_safe(export_dir)
    export_dir.mkdir(parents=True, exist_ok=True)

    prepare_export_repo(branch, repository_url, export_dir)

    print_step("Copy repository to export directory")
    clear_export_worktree(export_dir)
    copy_open_source_tree(export_dir, candidates)

    print_step("Verify export essentials")
    missing_items = missing_required_paths(export_dir)
    if missing_items:
        for item in missing_items:
            print(f"MISSING {item}")
        raise RuntimeError("Export copy is missing build-critical files. Check export exclusion rules and tracked files.")

    print_step("Scan for high-risk secrets")
    secret_hits = find_high_risk_secrets(export_dir)
    if secret_hits:
        for file_path, pattern in secret_hits:
            print(f"SECRET {file_path} -> {pattern}")
        raise RuntimeError("High-risk secret patterns were found in the export copy. Please fix them before publishing.")

    finalize_export_repo(branch, commit_message, export_dir, no_push)


def compress_windows_portable_directory(build_dir: Path, version: str) -> Path:
    candidates = [path for path in build_dir.iterdir() if path.is_dir() and path.name.startswith("sourceflow-portable")]
    if not candidates:
        raise RuntimeError(f"Portable directory not found under {build_dir}")
    portable_dir = max(candidates, key=lambda item: (item.stat().st_mtime, item.name))
    zip_path = build_dir / f"sourceflow-{version}-win-portable.zip"
    remove_path(zip_path)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in portable_dir.rglob("*"):
            if path.is_file():
                archive.write(path, path.relative_to(portable_dir.parent).as_posix())
    return zip_path


def should_include_web_clipper_file(relative_path: Path) -> bool:
    if any(part in WEB_CLIPPER_EXCLUDED_PARTS for part in relative_path.parts):
        return False
    if relative_path.name in WEB_CLIPPER_EXCLUDED_NAMES:
        return False
    if relative_path.suffix in WEB_CLIPPER_EXCLUDED_SUFFIXES:
        return False
    return True


def package_web_clipper_release_asset(build_repo: Path) -> Path:
    web_clipper_dir = build_repo / WEB_CLIPPER_RELATIVE_DIR
    manifest_path = web_clipper_dir / WEB_CLIPPER_MANIFEST_NAME
    manifest_version = load_version_field(
        manifest_path,
        f"{WEB_CLIPPER_RELATIVE_DIR.as_posix()}/{WEB_CLIPPER_MANIFEST_NAME}",
    )

    source_files = [
        path
        for path in sorted(web_clipper_dir.rglob("*"))
        if path.is_file() and should_include_web_clipper_file(path.relative_to(web_clipper_dir))
    ]
    if not source_files:
        raise RuntimeError(f"No browser extension files found under {web_clipper_dir}")

    output_dir = web_clipper_dir / "dist"
    output_dir.mkdir(parents=True, exist_ok=True)
    zip_path = output_dir / f"{WEB_CLIPPER_ARCHIVE_STEM}-{manifest_version}.zip"
    remove_path(zip_path)

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in source_files:
            relative_path = file_path.relative_to(web_clipper_dir).as_posix()
            archive.write(file_path, f"{WEB_CLIPPER_ARCHIVE_STEM}/{relative_path}")
    return zip_path


def collect_matching_files(directory: Path, patterns: Iterable[str]) -> list[Path]:
    if not directory.exists():
        return []
    normalized_patterns = tuple(patterns)
    return sorted(
        [
            path
            for path in directory.iterdir()
            if path.is_file() and any(fnmatch(path.name, pattern) for pattern in normalized_patterns)
        ]
    )


def collect_versioned_matching_files(directory: Path, patterns: Iterable[str], version: str) -> list[Path]:
    return [path for path in collect_matching_files(directory, patterns) if version in path.name]


def resolve_artifact_paths(build_repo: Path, target: ReleaseTarget, version: str, include_installer: bool, include_portable: bool) -> list[Path]:
    artifacts: list[Path] = []
    if include_installer:
        artifacts.extend(collect_versioned_matching_files(build_repo / target.installer_output_dir.relative_to(PROJECT_ROOT), target.installer_patterns, version))

    if include_portable and target.portable_supported:
        if target.platform_key == "win":
            portable_zip = compress_windows_portable_directory(build_repo / target.installer_output_dir.relative_to(PROJECT_ROOT), version)
            artifacts.append(portable_zip)
        elif target.portable_output_dir:
            artifacts.extend(collect_versioned_matching_files(build_repo / target.portable_output_dir.relative_to(PROJECT_ROOT), target.portable_patterns, version))
    artifacts.append(package_web_clipper_release_asset(build_repo))
    return artifacts


def latest_windows_portable_root(build_repo: Path) -> Path:
    build_dir = build_repo / APP_DIR.relative_to(PROJECT_ROOT) / "build"
    if not build_dir.is_dir():
        raise RuntimeError(f"Portable build directory not found: {build_dir}")
    candidates = [
        path
        for path in build_dir.iterdir()
        if path.is_dir() and path.name.startswith("sourceflow-portable")
    ]
    if not candidates:
        raise RuntimeError(f"No portable output directory found under {build_dir}")
    return max(candidates, key=lambda item: (item.stat().st_mtime, item.name))


def validate_required_paths(root: Path, relative_paths: Sequence[str], label: str) -> None:
    missing = [relative_path for relative_path in relative_paths if not (root / relative_path).exists()]
    if missing:
        raise RuntimeError(f"{label} is incomplete, missing: {', '.join(missing)}")


def kill_process_tree(pid: int) -> None:
    if pid <= 0:
        return
    if IS_WINDOWS:
        run(["taskkill", "/PID", str(pid), "/T", "/F"], check=False)
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass


def validate_kernel_boot(kernel_path: Path, resources_dir: Path, workspace_dir: Path, expected_version: str, timeout_seconds: int = 120) -> None:
    validate_required_paths(
        resources_dir,
        (
            "app.asar",
            "stage/build/app/index.html",
            "kernel/SourceFlow-Kernel.exe" if IS_WINDOWS else "kernel/SourceFlow-Kernel",
        ),
        f"Kernel resources at {resources_dir}",
    )
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
        remove_path_with_retry(workspace_dir, retries=20, delay_seconds=0.25)
        remove_path_with_retry(config_dir, retries=20, delay_seconds=0.25)


def validate_portable_release(build_repo: Path, target: ReleaseTarget) -> None:
    if target.platform_key != "win" or target.arch != "x64":
        return
    portable_root = latest_windows_portable_root(build_repo)
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
        f"Portable release at {portable_root}",
    )
    validate_kernel_boot(
        portable_root / "resources" / "kernel" / "SourceFlow-Kernel.exe",
        portable_root / "resources",
        Path(tempfile.mkdtemp(prefix="sourceflow-portable-kernel-smoke-")),
        load_app_version(),
    )
    print(f"Portable release validation passed: {portable_root}", flush=True)


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
        candidates.extend(
            [
                APP_DIR / "node_modules" / ".pnpm" / "7zip-bin@5.2.0" / "node_modules" / "7zip-bin" / "mac" / resolve_host_arch() / "7za",
            ]
        )
    else:
        candidates.extend(
            [
                APP_DIR / "node_modules" / ".pnpm" / "7zip-bin@5.2.0" / "node_modules" / "7zip-bin" / "linux" / resolve_host_arch() / "7za",
            ]
        )
    for candidate in candidates:
        candidate_path = Path(candidate)
        if candidate_path.is_file():
            return str(candidate_path)
        if isinstance(candidate, str) and shutil.which(candidate):
            return candidate
    raise RuntimeError("7-Zip command not found; installer package validation needs 7z/7za or app/node_modules 7zip-bin.")


def validate_windows_installer_release(build_repo: Path, target: ReleaseTarget, version: str) -> None:
    if target.platform_key != "win" or target.arch != "x64":
        return
    installer_dir = build_repo / target.installer_output_dir.relative_to(PROJECT_ROOT)
    installer_path = installer_dir / f"sourceflow-{version}-win.exe"
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
        remove_path_with_retry(extract_root, retries=20, delay_seconds=0.25)
    print(f"Installer release validation passed: {installer_path}", flush=True)


def validate_staged_release_assets(
    artifact_paths: Sequence[Path],
    target: ReleaseTarget,
    version: str,
    *,
    include_installer: bool,
    include_portable: bool,
) -> None:
    if not artifact_paths:
        raise RuntimeError("No staged release artifacts found.")
    for artifact_path in artifact_paths:
        if not artifact_path.is_file():
            raise RuntimeError(f"Staged artifact is missing: {artifact_path}")
        if artifact_path.stat().st_size <= 0:
            raise RuntimeError(f"Staged artifact is empty: {artifact_path}")

    names = [path.name for path in artifact_paths]
    for name in names:
        if name.startswith("sourceflow-") and not name.startswith(f"{WEB_CLIPPER_ARCHIVE_STEM}-") and version not in name:
            raise RuntimeError(f"Staged app artifact does not match release version {version}: {name}")
    if include_installer and not any(any(fnmatch(name, pattern) for pattern in target.installer_patterns) for name in names):
        raise RuntimeError(f"No installer artifact matching {target.installer_patterns} was staged.")
    if include_portable and target.portable_supported:
        if target.platform_key == "win":
            expected_suffix = f"-{target.platform_key}-portable.zip"
            if not any(name.endswith(expected_suffix) or "-win-portable." in name for name in names):
                raise RuntimeError("No Windows portable zip artifact was staged.")
        elif not any(any(fnmatch(name, pattern) for pattern in target.portable_patterns) for name in names):
            raise RuntimeError(f"No portable artifact matching {target.portable_patterns} was staged.")
    if not any(name.startswith(f"{WEB_CLIPPER_ARCHIVE_STEM}-") and name.endswith(".zip") for name in names):
        raise RuntimeError("Browser extension release zip was not staged.")


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.bind(("127.0.0.1", 0))
        return int(server.getsockname()[1])


def docker_capture(args: Sequence[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return run(["docker", *args], cwd=cwd, capture_output=True, check=True)


def get_container_status(container_name: str, cwd: Path) -> str:
    result = docker_capture(["inspect", "--format", "{{.State.Status}}", container_name], cwd)
    return result.stdout.strip()


def get_container_logs(container_name: str, cwd: Path) -> str:
    try:
        result = docker_capture(["logs", container_name], cwd)
        return (result.stdout or "") + (result.stderr or "")
    except Exception as exc:
        return str(exc)


def fetch_json_url(url: str, timeout: float = 5.0) -> object:
    with urllib_request.urlopen(url, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def post_json_url(base_url: str, endpoint: str, payload: Mapping[str, object], timeout: float = 30.0, retries: int = 3) -> object:
    last_error: Exception | None = None
    for attempt in range(retries):
        request = urllib_request.Request(
            url=f"{base_url}{endpoint}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(request, timeout=timeout) as response:
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
    boundary = f"----SourceFlowReleaseSmoke{uuid.uuid4().hex}"
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
        request = urllib_request.Request(
            url=f"{base_url}{endpoint}",
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        try:
            with urllib_request.urlopen(request, timeout=timeout) as response:
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


def validate_docker_release(source_repo: Path, timeout_seconds: int = 240) -> None:
    require_command("docker")
    if not (source_repo / "Dockerfile").is_file():
        raise RuntimeError(f"Dockerfile not found under {source_repo}")

    image_tag = f"sourceflow-release-validation:{int(time.time())}-{os.getpid()}"
    container_name = f"sourceflow-docker-smoke-{os.getpid()}-{int(time.time())}"
    workspace_dir = Path(tempfile.mkdtemp(prefix="sourceflow-docker-smoke-"))
    host_port = find_free_port()
    container_started = False

    try:
        run(["docker", "build", "--tag", image_tag, "."], cwd=source_repo, env={"DOCKER_BUILDKIT": os.environ.get("DOCKER_BUILDKIT", "1")})
        run(
            [
                "docker",
                "run",
                "--detach",
                "--name",
                container_name,
                "--publish",
                f"127.0.0.1:{host_port}:6806",
                "--env",
                "SOURCEFLOW_ACCESS_AUTH_CODE=sourceflow-release-validation",
                "--mount",
                f"type=bind,source={workspace_dir},target=/sourceflow/workspace",
                image_tag,
                "--workspace=/sourceflow/workspace",
            ],
            cwd=source_repo,
            env={"DOCKER_BUILDKIT": os.environ.get("DOCKER_BUILDKIT", "1")},
        )
        container_started = True

        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            status = get_container_status(container_name, source_repo)
            if status != "running":
                logs = get_container_logs(container_name, source_repo)
                raise RuntimeError(f"Docker container exited before ready. status={status}\n{logs}")
            try:
                version_response = fetch_json_url(f"http://127.0.0.1:{host_port}/api/system/version")
                progress_response = fetch_json_url(f"http://127.0.0.1:{host_port}/api/system/bootProgress")
                if (
                    isinstance(version_response, dict)
                    and isinstance(progress_response, dict)
                    and version_response.get("code") == 0
                    and progress_response.get("code") == 0
                    and float(progress_response.get("data", {}).get("progress", 0)) >= 100
                ):
                    print(f"Docker release validation passed: image={image_tag}, port={host_port}", flush=True)
                    return
            except Exception:
                pass
            time.sleep(1)
        logs = get_container_logs(container_name, source_repo)
        raise RuntimeError(f"Docker release validation timed out after {timeout_seconds}s.\n{logs}")
    finally:
        if container_started:
            run(["docker", "rm", "--force", container_name], cwd=source_repo, check=False)
        run(["docker", "rmi", "--force", image_tag], cwd=source_repo, check=False)
        remove_path_with_retry(workspace_dir, retries=20, delay_seconds=0.25)


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
    entry_path = plugin_dir / entry
    if not entry_path.is_file():
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


def run_release_quality_gate(*, skip_frontend: bool) -> None:
    print_step("Script syntax")
    syntax_paths = [
        path
        for path in (
            Path(__file__).resolve(),
            PROJECT_ROOT / "编译.py",
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
    run_go_command(["go", "mod", "download"], cwd=PROJECT_ROOT / "kernel")
    run_go_command(["go", "test", "-p", "1", "-vet=off", "./..."], cwd=PROJECT_ROOT / "kernel")

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

    if not skip_frontend:
        print_step("Frontend typecheck")
        require_command(PNPM)
        run([PNPM, "--dir", "app", "run", "typecheck"], cwd=PROJECT_ROOT)


def get_release_asset_directory(explicit_release_asset_dir: str) -> Path:
    if explicit_release_asset_dir:
        return Path(explicit_release_asset_dir).resolve()
    return (PROJECT_ROOT / "app" / "build" / "release-assets").resolve()


def clear_release_asset_directory(path: Path) -> None:
    remove_path(path)
    path.mkdir(parents=True, exist_ok=True)


def sync_release_asset_files(target_dir: Path, build_artifacts: list[Path]) -> list[Path]:
    synced_paths: list[Path] = []
    target_dir.mkdir(parents=True, exist_ok=True)
    for artifact in build_artifacts:
        if not artifact.is_file():
            raise RuntimeError(f"Artifact file not found: {artifact}")
        target_path = target_dir / artifact.name
        shutil.copy2(artifact, target_path)
        synced_paths.append(target_path)
    return synced_paths


def get_release_asset_paths(asset_dir: Path) -> list[Path]:
    if not asset_dir.is_dir():
        return []
    return sorted(
        [
            path
            for path in asset_dir.iterdir()
            if path.is_file()
            and path.name != "SHA256SUMS.txt"
            and not path.name.endswith("-source.zip")
            and not path.name.endswith(".blockmap")
            and not fnmatch(path.name, "latest*.yml")
        ]
    )


def write_sha256_sums(output_dir: Path, artifact_paths: list[Path]) -> Path:
    hash_file = output_dir / "SHA256SUMS.txt"
    lines = [f"{sha256_file(path)} *{path.name}" for path in artifact_paths]
    hash_file.write_bytes(("\n".join(lines) + "\n").encode("utf-8"))
    return hash_file


def create_or_update_release(
    token: str,
    repo_slug: str,
    release_tag: str,
    release_title: str,
    target_commitish: str,
    draft: bool,
    prerelease: bool,
    notes_file: Path | None,
    artifact_paths: list[Path],
) -> None:
    token = require_github_token(token, "publish a GitHub release")
    release = get_github_release_by_tag(token, repo_slug, release_tag, allow_missing=True)
    notes_body = read_release_notes(notes_file)

    if release is None:
        payload: dict[str, object] = {
            "tag_name": release_tag,
            "target_commitish": target_commitish,
            "name": release_title,
            "draft": draft,
            "prerelease": prerelease,
        }
        if notes_body:
            payload["body"] = notes_body
        else:
            payload["generate_release_notes"] = True
        created = github_api_request("POST", f"/repos/{repo_slug}/releases", token, json_body=payload)
        if not isinstance(created, dict):
            raise RuntimeError("GitHub release creation returned an unexpected response.")
        release = created
    else:
        update_payload: dict[str, object] = {
            "name": release_title,
            "draft": draft,
            "prerelease": prerelease,
        }
        if notes_body:
            update_payload["body"] = notes_body
        updated = github_api_request(
            "PATCH",
            f"/repos/{repo_slug}/releases/{release['id']}",
            token,
            json_body=update_payload,
        )
        if not isinstance(updated, dict):
            raise RuntimeError("GitHub release update returned an unexpected response.")
        release = updated

    sync_release_assets(token, repo_slug, release, artifact_paths)


def preview_release(
    args: argparse.Namespace,
    target: ReleaseTarget,
    host_name: str,
    host_arch: str,
    repo_slug: str,
    version: str,
    release_tag: str,
    release_title: str,
    publish_repo: Path,
    did_export: bool,
    github_auth: GitHubAuthConfig,
    release_asset_dir: Path,
    notes_file: Path | None,
    effective_skip_portable: bool,
    version_source: str,
    release_tag_sync_plan: ReleaseTagSyncPlan,
) -> int:
    print_step("Release preview")
    print(f"Repository: {repo_slug}")
    print(f"Branch: {args.branch}")
    print(f"Version: {version}")
    print(f"Version source: {version_source}")
    print(f"Auto version source: {args.auto_version_source}")
    print(f"Tag: {release_tag}")
    print(f"Title: {release_title}")
    print(f"Host platform: {host_name}")
    print(f"Host architecture: {host_arch}")
    print(f"Release target: {target.display_name}")
    print(f"Publish repo: {publish_repo}")
    print(f"Use export copy: {format_bool(did_export)}")
    print(f"Release asset dir: {release_asset_dir}")
    print("Run build before staging: no (发布.py never builds; run 编译.py first)")
    print(f"Reuse existing release assets: {format_bool(args.reuse_release_assets)}")
    print(f"GitHub API timeout: {GITHUB_API_TIMEOUT_SECONDS}s")
    print(f"GitHub API retries: {GITHUB_API_MAX_RETRIES}")
    print(f"Upload timeout: {RELEASE_UPLOAD_TIMEOUT_SECONDS}s")
    print(f"Upload retries: {RELEASE_UPLOAD_MAX_RETRIES}")
    print(f"Include installer: {format_bool(not args.skip_installer)}")
    print(f"Include portable: {format_bool(not effective_skip_portable)}")
    print("Include browser extension zip: yes")
    print(f"Portable validation available: {format_bool(target.portable_validation_supported)}")
    print(f"Run local artifact smoke validation: {format_bool(args.validate and not args.skip_validate)}")
    print(f"Validate portable: {format_bool(args.validate and (not args.skip_validate) and (not args.skip_validate_portable) and (not effective_skip_portable) and target.portable_validation_supported)}")
    print(f"Run release asset consistency checks: {format_bool(not args.skip_validate)}")
    print(f"Validate Docker: {format_bool((not args.skip_validate) and args.validate_docker and (not args.skip_validate_docker))}")
    print("Run release quality gate: no (编译.py owns build quality checks)")
    print(f"Create GitHub release: {format_bool(not args.skip_release)}")
    print(f"Auto sync release tags: {format_bool(not args.no_sync_release_tags)}")
    print(f"Replace orphan release tag: {format_bool(release_tag_sync_plan.should_replace_orphan_tag)}")
    print(f"Tag conflict handling: {args.tag_conflict}")
    print(f"Release tag 同步: {release_tag_sync_plan.description}")
    if release_tag_sync_plan.remote_tag_target:
        print(f"Existing remote tag target: {release_tag_sync_plan.remote_tag_target}")
    print(f"GitHub token file: {github_auth.token_file}")
    print(f"GitHub auth source: {get_github_auth_source_label(github_auth)}")
    print(f"Notes file: {notes_file if notes_file else 'not set'}")
    if not args.skip_portable and not target.portable_supported:
        print("Portable build note: this target does not support portable packaging, so it will be skipped automatically.")

    if did_export:
        print_step("Export preview")
        show_export_preview(get_export_candidates())
    return 0


def main(argv: list[str] | None = None) -> int:
    _POST_RUN_WARNINGS.clear()
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    parser = build_parser()
    args = parser.parse_args(raw_argv)

    if args.build:
        raise RuntimeError("发布.py 不再执行编译。请先运行 python 编译.py 完成编译和本地测试，然后再运行 python 发布.py。")
    if args.dynamic or args.signed or args.cc:
        raise RuntimeError("--dynamic、--signed、--cc 属于编译选项。请在 python 编译.py 中使用，不要在发布流程中使用。")

    if args.stability_gate_only:
        raise RuntimeError("发布.py 不再运行质量门。请使用 python 编译.py --stability-gate-only，发布阶段只处理已有产物。")

    target, host_name, host_arch = resolve_release_target(args.platform, args.arch)
    effective_skip_portable = args.skip_portable or not target.portable_supported
    should_validate_portable = args.validate and (not args.skip_validate) and (not args.skip_validate_portable) and (not effective_skip_portable) and target.portable_validation_supported
    should_validate_docker = (not args.skip_validate) and args.validate_docker and (not args.skip_validate_docker)

    github_auth = resolve_github_auth_config(args.github_token, args.github_token_file)

    repository_url = args.repository_url or get_git_remote_url(PROJECT_ROOT)
    if not repository_url:
        raise RuntimeError("Repository URL is required when no origin remote is configured.")
    repo_slug = get_github_repo_slug(repository_url)
    if not repo_slug:
        raise RuntimeError(f"Only GitHub repository URLs are supported: {repository_url}")

    current_version = load_app_version()
    effective_version_bump = args.version_bump
    if should_lock_version_to_existing_artifacts(args, raw_argv):
        effective_version_bump = "none"
    version, version_source = resolve_release_version(
        current_version,
        explicit_version=args.version,
        release_tag=args.release_tag,
        version_bump=effective_version_bump,
        auto_version_source=args.auto_version_source,
        skip_release=args.skip_release,
        github_token=github_auth.token,
        repo_slug=repo_slug,
        repository_url=repository_url,
    )
    if effective_version_bump != args.version_bump:
        version_source = "current app version (existing build artifacts)"
    release_tag = args.release_tag or f"v{version}"
    release_title = args.release_title or f"SourceFlow {release_tag}"
    commit_message = args.commit_message or f"Release {release_tag}"
    release_tag_sync_plan = resolve_release_tag_sync_plan(
        github_auth.token,
        repo_slug,
        repository_url,
        release_tag,
        create_release=not args.skip_release,
        auto_sync_release_tags=not args.no_sync_release_tags,
        force_replace_orphan_tag=args.replace_orphan_release_tag,
    )

    if version != current_version and not args.reuse_release_assets and not args.release_notes_only and not args.preview:
        raise RuntimeError(
            f"Release version would change from {current_version} to {version}, but 发布.py is using existing build artifacts. "
            "Run 编译.py after updating the version, pass --version-bump none, or use --reuse-release-assets."
        )

    did_export = not args.skip_export
    publish_repo = Path(args.export_dir).resolve() if args.export_dir else (EXPORT_ROOT / "SourceFlow").resolve()
    if not did_export:
        publish_repo = PROJECT_ROOT

    notes_file, generated_note_files, release_notes_body = prepare_release_notes(
        version,
        release_tag,
        target,
        explicit_notes_file=args.notes_file,
        skip_generate=args.skip_release_notes,
        write_files=not args.preview,
    )
    release_asset_dir = get_release_asset_directory(args.release_asset_dir)

    if args.release_notes_only:
        if args.preview:
            raise RuntimeError("--release-notes-only cannot be combined with --preview.")
        print_release_notes_review(notes_file, generated_note_files, release_notes_body, hidden=args.hide_release_notes_review)
        print()
        print("Release notes prepared. Edit the file above before running 发布.py if any item should be changed.")
        return 0

    if args.preview:
        print_release_notes_review(notes_file, generated_note_files, release_notes_body, hidden=args.hide_release_notes_review)
        return preview_release(
            args,
            target,
            host_name,
            host_arch,
            repo_slug,
            version,
            release_tag,
            release_title,
            publish_repo,
            did_export,
            github_auth,
            release_asset_dir,
            notes_file,
            effective_skip_portable,
            version_source,
            release_tag_sync_plan,
        )

    require_command("git")

    if not args.skip_release and args.skip_push:
        raise RuntimeError("skip-release cannot be combined with skip-push. A GitHub release needs the code and tag pushed first.")

    if not args.skip_release:
        require_github_token(github_auth.token, "publish a GitHub release")

    if args.create_repository:
        print_step("Ensure GitHub repository exists")
        ensure_github_repository_exists(github_auth.token, repo_slug, args.visibility)

    success_message = ""

    try:
        if version != current_version:
            print_step("Update release version")
            update_release_version_files(version)
            print(f"Resolved version: {current_version} -> {version} ({version_source})")

        resume_export = args.resume and did_export and (publish_repo / ".git").is_dir()
        if did_export and resume_export:
            print_step("Resume public repository copy")
            print(f"Using existing export directory: {publish_repo}")
        elif did_export:
            print_step("Export public repository copy")
            export_public_repository(repository_url, args.branch, commit_message, publish_repo, no_push=True)

        artifact_source_repo = PROJECT_ROOT

        if should_validate_portable:
            print_step("Validate portable package")
            validate_portable_release(artifact_source_repo, target)

        if args.validate and not args.skip_validate and not args.skip_installer:
            print_step("Validate installer package")
            validate_windows_installer_release(artifact_source_repo, target, version)

        if should_validate_docker:
            print_step("Validate Docker release")
            validate_docker_release(PROJECT_ROOT)

        if not args.reuse_release_assets:
            print_step("Stage release assets")
            clear_release_asset_directory(release_asset_dir)
            build_artifact_paths = resolve_artifact_paths(
                artifact_source_repo,
                target,
                version,
                include_installer=not args.skip_installer,
                include_portable=not effective_skip_portable,
            )
            if not build_artifact_paths and not args.skip_release:
                raise RuntimeError("No release artifacts were found after the build completed.")
            sync_release_asset_files(release_asset_dir, build_artifact_paths)

        artifact_paths = get_release_asset_paths(release_asset_dir)
        if not artifact_paths and not args.skip_release:
            raise RuntimeError(f"No release artifacts found under {release_asset_dir}")
        if artifact_paths and not args.skip_validate:
            print_step("Validate staged release assets")
            validate_staged_release_assets(
                artifact_paths,
                target,
                version,
                include_installer=not args.skip_installer,
                include_portable=not effective_skip_portable,
            )
        if artifact_paths:
            artifact_paths.append(write_sha256_sums(release_asset_dir, artifact_paths))

        if not args.skip_push:
            print_step("Push source code to GitHub")
            run(["git", "push", "-u", "origin", args.branch], cwd=publish_repo)

        if not args.skip_release:
            print_step("Create and push release tag")
            print(f"Release tag 同步: {release_tag_sync_plan.description}")
            ensure_release_tag(
                publish_repo,
                release_tag,
                release_title,
                release_exists=release_tag_sync_plan.release_exists,
                replace_orphan_release_tag=release_tag_sync_plan.should_replace_orphan_tag,
                tag_conflict_mode=args.tag_conflict,
            )

            print_step("Publish GitHub release")
            create_or_update_release(
                github_auth.token,
                repo_slug,
                release_tag,
                release_title,
                args.branch,
                args.draft,
                args.prerelease,
                notes_file,
                artifact_paths,
            )

        print_step("Done")
        print(f"Repo slug: {repo_slug}")
        print(f"Release target: {target.display_name}")
        print(f"Publish repo: {publish_repo}")
        print_release_notes_review(notes_file, generated_note_files, release_notes_body, hidden=args.hide_release_notes_review)
        if artifact_paths:
            print("Artifacts:")
            for artifact in artifact_paths:
                print(f"- {artifact}")
        success_message = "发布完成,没有问题"
    finally:
        pass
    if success_message and _POST_RUN_WARNINGS:
        print()
        print("发布完成,但有问题:")
        for warning in _POST_RUN_WARNINGS:
            print(f"- {warning}")
    elif success_message:
        print()
        print(success_message)
    return 0


if __name__ == "__main__":
    signal.signal(signal.SIGINT, handle_interrupt)
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("发布失败,原因: 用户中断了发布流程。", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:  # pragma: no cover - top-level CLI behavior
        print(f"发布失败,原因: {exc}", file=sys.stderr)
        raise SystemExit(1)
