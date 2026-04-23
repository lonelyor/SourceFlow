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
import subprocess
import sys
import time
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
KERNEL_WORKING_PATH = PROJECT_ROOT / "kernel" / "util" / "working.go"
APPX_MANIFEST_PATHS = (
    APP_DIR / "appx" / "AppxManifest.xml",
    APP_DIR / "appx" / "AppxManifest-arm64.xml",
)
BUILD_SCRIPT_PATH = PROJECT_ROOT / "编译.py"
EXPORT_ROOT = PROJECT_ROOT / ".opensource-release"
DEFAULT_GITHUB_TOKEN_FILE = PROJECT_ROOT / "scripts" / "public-release.local.env"
WEB_CLIPPER_RELATIVE_DIR = Path("browser-extension") / "sourceflow-web-clipper"
WEB_CLIPPER_MANIFEST_NAME = "manifest.json"
WEB_CLIPPER_ARCHIVE_STEM = "sourceflow-page-saver"
WEB_CLIPPER_EXCLUDED_PARTS = {"dist", "__pycache__"}
WEB_CLIPPER_EXCLUDED_NAMES = {".DS_Store", "Thumbs.db"}
WEB_CLIPPER_EXCLUDED_SUFFIXES = {".pyc"}
IS_WINDOWS = os.name == "nt"
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
RELEASE_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024
RELEASE_UPLOAD_TIMEOUT_SECONDS = 180
RELEASE_UPLOAD_MAX_ATTEMPTS = 8
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
    "app/package.json",
    "kernel",
    "package.json",
    "README.md",
    "LICENSE",
)
HARD_EXCLUDED_RELATIVE_PATHS = {
    ".git",
    ".opensource-release",
    "发布.py",
    "编译.py",
}
PUBLIC_EXPORT_EXCLUDED_RELATIVE_PATHS = {
    ".github",
    "node_modules",
    "plans",
    "scripts",
    "build.log",
}


@dataclass(frozen=True)
class GitHubAuthConfig:
    token: str
    source: str
    token_file: Path
    environment: dict[str, str]


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
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}")
    return result


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


def resolve_release_target() -> tuple[ReleaseTarget, str, str]:
    host_name = resolve_host_platform()
    host_arch = resolve_host_arch()
    target = TARGETS.get((host_name, host_arch))
    if not target:
        raise RuntimeError(f"Unsupported release target: {host_name}/{host_arch}")
    return target, host_name, host_arch


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python 发布.py",
        description=(
            "Publish a host-native SourceFlow desktop release.\n"
            "The script auto-detects the current machine's OS and architecture,\n"
            "optionally exports a public repository copy, invokes 编译.py to build\n"
            "native artifacts, stages release assets, and can push a GitHub release."
        ),
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python 发布.py --preview\n"
            "  python 发布.py --skip-release --skip-push\n"
            "  python 发布.py --skip-portable\n"
            "  python 发布.py --version-bump patch --draft --prerelease"
        ),
    )
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
            "auto: reuse current version if its tag does not exist, otherwise bump patch until a free tag is found.\n"
            "patch/minor/major: bump from app/package.json before the release.\n"
            "none: keep the current version unchanged."
        ),
    )
    parser.add_argument("--release-tag", default="", help="Tag to create or upload to. Defaults to v<version>.")
    parser.add_argument("--release-title", default="", help="GitHub release title. Defaults to SourceFlow <tag>.")
    parser.add_argument("--notes-file", default="", help="Optional release notes Markdown file.")
    parser.add_argument("--release-asset-dir", default="", help="Directory used to collect staged release artifacts.")
    parser.add_argument("--github-token", default="", help="Explicit GitHub token. Overrides token files and environment variables.")
    parser.add_argument("--github-token-file", default="", help="Optional env-style file containing GH_TOKEN/GITHUB_TOKEN/SOURCEFLOW_GITHUB_TOKEN.")
    parser.add_argument("--create-repository", action="store_true", help="Create the target GitHub repository with the GitHub API if it does not already exist.")
    parser.add_argument("--visibility", choices=("public", "private", "internal"), default="public", help="Visibility to use when --create-repository creates the repo.")
    parser.add_argument("--skip-export", action="store_true", help="Use the current working tree directly instead of exporting a public copy first.")
    parser.add_argument("--skip-push", action="store_true", help="Skip pushing the branch to GitHub.")
    parser.add_argument("--skip-build", action="store_true", help="Skip local builds. Existing release assets will be reused.")
    parser.add_argument("--skip-validate", action="store_true", help="Skip all release validation steps.")
    parser.add_argument("--skip-validate-portable", action="store_true", help="Skip portable validation even when the current target supports it.")
    parser.add_argument("--skip-validate-docker", action="store_true", help="Skip Docker validation.")
    parser.add_argument("--skip-installer", action="store_true", help="Do not build or stage installer artifacts.")
    parser.add_argument("--skip-portable", action="store_true", help="Do not build or stage portable artifacts.")
    parser.add_argument("--skip-release", action="store_true", help="Skip GitHub release creation and asset upload.")
    parser.add_argument("--draft", action="store_true", help="Create the GitHub release as a draft.")
    parser.add_argument("--prerelease", action="store_true", help="Mark the GitHub release as a prerelease.")
    parser.add_argument("--dynamic", action="store_true", help="Pass --dynamic through to 编译.py for Linux portable preparation.")
    parser.add_argument("--signed", action="store_true", help="Pass --signed through to 编译.py for macOS portable packaging.")
    parser.add_argument("--cc", default="", help="Pass --cc through to 编译.py when a custom C compiler is required.")
    parser.add_argument("--preview", action="store_true", help="Print the resolved release plan without building or publishing.")
    return parser


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
    skip_release: bool,
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
    while get_remote_tag_target_for_url(repository_url, f"v{candidate}"):
        candidate = bump_semver(candidate, "patch")
    if candidate == current_version:
        return candidate, "auto (current version available)"
    return candidate, "auto (next free patch version)"


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


def ensure_release_tag(repo_dir: Path, release_tag: str, release_title: str) -> None:
    head_commit = get_git_output(["git", "rev-parse", "HEAD"], cwd=repo_dir)
    remote_tag_target = get_remote_tag_target(repo_dir, release_tag)
    if remote_tag_target:
        if remote_tag_target != head_commit:
            raise RuntimeError(
                f"Remote tag {release_tag} already exists but points to {remote_tag_target}, not current commit {head_commit}."
            )
        print(f"Release tag already exists on origin and matches HEAD: {release_tag}")
        return

    local_tag_target = get_local_tag_target(repo_dir, release_tag)
    if local_tag_target and local_tag_target != head_commit:
        raise RuntimeError(
            f"Local tag {release_tag} already exists but points to {local_tag_target}, not current commit {head_commit}."
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
        with urllib_request.urlopen(request) as response:
            body = response.read()
    except urllib_error.HTTPError as exc:
        if resolved_token and resolved_basic_auth is None and allow_git_credential_fallback and exc.code in {401, 403}:
            fallback_basic_auth = get_github_basic_auth()
            if fallback_basic_auth is not None:
                note_github_git_credential_fallback()
                return github_api_request(
                    method,
                    path_or_url,
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


def read_release_notes(notes_file: Path | None) -> str:
    if not notes_file or not notes_file.exists():
        return ""
    return notes_file.read_text(encoding="utf-8").strip()


def delete_existing_release_asset(token: str, repo_slug: str, asset_id: int) -> None:
    github_api_request(
        "DELETE",
        f"/repos/{repo_slug}/releases/assets/{asset_id}",
        token,
        parse_json=False,
    )


def is_transient_release_upload_error(error: Exception) -> bool:
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
        "winerror 10054",
        "remote host closed",
    )
    return any(marker in message for marker in transient_markers)


def upload_release_asset(token: str, repo_slug: str, release_id: int, upload_url: str, artifact_path: Path) -> None:
    upload_target = upload_url.split("{", 1)[0]
    upload_target = f"{upload_target}?{urllib_parse.urlencode({'name': artifact_path.name})}"
    content_type = mimetypes.guess_type(artifact_path.name)[0] or "application/octet-stream"
    for attempt in range(1, RELEASE_UPLOAD_MAX_ATTEMPTS + 1):
        try:
            upload_release_asset_streaming(upload_target, token, artifact_path, content_type)
            return
        except GitHubApiError as exc:
            if exc.status_code == 422 and "already_exists" in exc.message.lower():
                delete_existing_named_release_asset(token, repo_slug, release_id, artifact_path.name)
                if attempt < RELEASE_UPLOAD_MAX_ATTEMPTS:
                    continue
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
            if attempt == RELEASE_UPLOAD_MAX_ATTEMPTS or not is_transient_release_upload_error(exc):
                raise
            delete_existing_named_release_asset(token, repo_slug, release_id, artifact_path.name)
            wait_seconds = min(30, attempt * 3) + random.uniform(0, 1.0)
            print(
                f"Release asset upload retry {attempt}/{RELEASE_UPLOAD_MAX_ATTEMPTS - 1} for {artifact_path.name} after transient failure: {exc}",
                flush=True,
            )
            time.sleep(wait_seconds)


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


def delete_release_assets_not_in_set(token: str, repo_slug: str, release_id: int, expected_asset_names: set[str]) -> None:
    for asset_name, asset in get_release_asset_map(token, repo_slug, release_id).items():
        if asset_name in expected_asset_names:
            continue
        asset_id = asset.get("id")
        if isinstance(asset_id, int):
            delete_existing_release_asset(token, repo_slug, asset_id)


def delete_existing_named_release_asset(token: str, repo_slug: str, release_id: int, asset_name: str) -> None:
    asset = get_release_asset_map(token, repo_slug, release_id).get(asset_name)
    asset_id = asset.get("id") if isinstance(asset, dict) else None
    if isinstance(asset_id, int):
        delete_existing_release_asset(token, repo_slug, asset_id)


def sync_release_assets(token: str, repo_slug: str, release: dict[str, object], artifact_paths: list[Path]) -> None:
    upload_url = str(release.get("upload_url", "")).strip()
    if not upload_url:
        raise RuntimeError("GitHub release upload URL is missing.")
    release_id = release.get("id")
    if not isinstance(release_id, int):
        raise RuntimeError("GitHub release id is missing.")

    desired_asset_names = {artifact_path.name for artifact_path in artifact_paths}
    delete_release_assets_not_in_set(token, repo_slug, release_id, desired_asset_names)
    existing_assets = get_release_asset_map(token, repo_slug, release_id)

    for artifact_path in artifact_paths:
        existing_asset = existing_assets.get(artifact_path.name)
        if existing_asset:
            existing_size = existing_asset.get("size")
            existing_state = str(existing_asset.get("state", "")).strip().lower()
            if existing_state == "uploaded" and isinstance(existing_size, int) and existing_size == artifact_path.stat().st_size:
                print(f"Release asset already uploaded and matches local file, skipping: {artifact_path.name}", flush=True)
                continue

            existing_asset_id = existing_asset.get("id")
            if isinstance(existing_asset_id, int):
                delete_existing_release_asset(token, repo_slug, existing_asset_id)

        upload_release_asset(token, repo_slug, release_id, upload_url, artifact_path)


def resolve_default_notes_file(version: str) -> Path | None:
    candidates = [
        PROJECT_ROOT / f"app/changelogs/v{version}/v{version}.md",
        PROJECT_ROOT / f"app/changelogs/v{version}/v{version}_zh_CN.md",
    ]
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
    return any(
        normalized == excluded or normalized.startswith(f"{excluded}/")
        for excluded in PUBLIC_EXPORT_EXCLUDED_RELATIVE_PATHS
    )


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
                print(f"Warning: deferred cleanup left behind: {cleanup_target}", file=sys.stderr)
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
        run(["git", "fetch", "--depth=1", "origin", branch], cwd=export_dir)
        run(["git", "checkout", "-B", branch, "FETCH_HEAD"], cwd=export_dir)
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


def inject_transient_build_support(target_root: Path) -> None:
    copytree_replace(PROJECT_ROOT / "scripts", target_root / "scripts")
    shutil.copy2(BUILD_SCRIPT_PATH, target_root / "编译.py")


def clear_transient_build_support(target_root: Path) -> None:
    remove_path_with_retry(target_root / "scripts")
    remove_path_with_retry(target_root / "编译.py")


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


def package_web_clipper_release_asset(build_repo: Path, version: str) -> Path:
    web_clipper_dir = build_repo / WEB_CLIPPER_RELATIVE_DIR
    manifest_path = web_clipper_dir / WEB_CLIPPER_MANIFEST_NAME
    manifest_version = load_version_field(
        manifest_path,
        f"{WEB_CLIPPER_RELATIVE_DIR.as_posix()}/{WEB_CLIPPER_MANIFEST_NAME}",
    )
    if manifest_version != version:
        raise RuntimeError(
            "Browser extension version does not match the release version: "
            f"{manifest_version} != {version}"
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
    zip_path = output_dir / f"{WEB_CLIPPER_ARCHIVE_STEM}-{version}.zip"
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


def resolve_artifact_paths(build_repo: Path, target: ReleaseTarget, version: str, include_installer: bool, include_portable: bool) -> list[Path]:
    artifacts: list[Path] = []
    if include_installer:
        artifacts.extend(collect_matching_files(build_repo / target.installer_output_dir.relative_to(PROJECT_ROOT), target.installer_patterns))

    if include_portable and target.portable_supported:
        if target.platform_key == "win":
            portable_zip = compress_windows_portable_directory(build_repo / target.installer_output_dir.relative_to(PROJECT_ROOT), version)
            artifacts.append(portable_zip)
        elif target.portable_output_dir:
            artifacts.extend(collect_matching_files(build_repo / target.portable_output_dir.relative_to(PROJECT_ROOT), target.portable_patterns))
    artifacts.append(package_web_clipper_release_asset(build_repo, version))
    return artifacts


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
) -> int:
    print_step("Release preview")
    print(f"Repository: {repo_slug}")
    print(f"Branch: {args.branch}")
    print(f"Version: {version}")
    print(f"Version source: {version_source}")
    print(f"Tag: {release_tag}")
    print(f"Title: {release_title}")
    print(f"Host platform: {host_name}")
    print(f"Host architecture: {host_arch}")
    print(f"Release target: {target.display_name}")
    print(f"Publish repo: {publish_repo}")
    print(f"Use export copy: {format_bool(did_export)}")
    print(f"Release asset dir: {release_asset_dir}")
    print(f"Build installer: {format_bool(not args.skip_installer)}")
    print(f"Build portable: {format_bool(not effective_skip_portable)}")
    print("Include browser extension zip: yes")
    print(f"Portable validation available: {format_bool(target.portable_validation_supported)}")
    print(f"Validate portable: {format_bool((not args.skip_validate) and (not args.skip_validate_portable) and (not effective_skip_portable) and target.portable_validation_supported)}")
    print(f"Validate Docker: {format_bool((not args.skip_validate) and (not args.skip_validate_docker))}")
    print(f"Create GitHub release: {format_bool(not args.skip_release)}")
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
    parser = build_parser()
    args = parser.parse_args(argv)

    target, host_name, host_arch = resolve_release_target()
    effective_skip_portable = args.skip_portable or not target.portable_supported
    should_validate_portable = (not args.skip_validate) and (not args.skip_validate_portable) and (not effective_skip_portable) and target.portable_validation_supported
    should_validate_docker = (not args.skip_validate) and (not args.skip_validate_docker)

    github_auth = resolve_github_auth_config(args.github_token, args.github_token_file)

    repository_url = args.repository_url or get_git_remote_url(PROJECT_ROOT)
    if not repository_url:
        raise RuntimeError("Repository URL is required when no origin remote is configured.")
    repo_slug = get_github_repo_slug(repository_url)
    if not repo_slug:
        raise RuntimeError(f"Only GitHub repository URLs are supported: {repository_url}")

    current_version = load_app_version()
    version, version_source = resolve_release_version(
        current_version,
        explicit_version=args.version,
        release_tag=args.release_tag,
        version_bump=args.version_bump,
        skip_release=args.skip_release,
        repository_url=repository_url,
    )
    release_tag = args.release_tag or f"v{version}"
    release_title = args.release_title or f"SourceFlow {release_tag}"
    commit_message = args.commit_message or f"Release {release_tag}"

    did_export = not args.skip_export
    publish_repo = Path(args.export_dir).resolve() if args.export_dir else (EXPORT_ROOT / "SourceFlow").resolve()
    if not did_export:
        publish_repo = PROJECT_ROOT

    notes_file = Path(args.notes_file).resolve() if args.notes_file else resolve_default_notes_file(version)
    release_asset_dir = get_release_asset_directory(args.release_asset_dir)

    if args.preview:
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
        )

    require_command("git")
    require_command("node")
    require_command(PNPM)
    require_command("go")

    if not args.skip_release and args.skip_push:
        raise RuntimeError("skip-release cannot be combined with skip-push. A GitHub release needs the code and tag pushed first.")

    if not args.skip_release:
        require_github_token(github_auth.token, "publish a GitHub release")

    if args.create_repository:
        print_step("Ensure GitHub repository exists")
        ensure_github_repository_exists(github_auth.token, repo_slug, args.visibility)

    injected_build_support = False

    try:
        if version != current_version:
            print_step("Update release version")
            update_release_version_files(version)
            print(f"Resolved version: {current_version} -> {version} ({version_source})")

        if did_export:
            print_step("Export public repository copy")
            export_public_repository(repository_url, args.branch, commit_message, publish_repo, no_push=True)

        if did_export and ((not args.skip_build) or should_validate_portable or should_validate_docker):
            print_step("Inject transient build support")
            inject_transient_build_support(publish_repo)
            injected_build_support = True

        if not args.skip_build:
            print_step("Build release artifacts")
            build_command = [sys.executable, str((publish_repo if did_export else PROJECT_ROOT) / "编译.py")]
            if args.skip_installer:
                build_command.append("--skip-installer")
            if effective_skip_portable:
                build_command.append("--skip-portable")
            if args.dynamic:
                build_command.append("--dynamic")
            if args.signed:
                build_command.append("--signed")
            if args.cc:
                build_command.extend(["--cc", args.cc])
            run(build_command, cwd=publish_repo if did_export else PROJECT_ROOT)

        if should_validate_portable:
            print_step("Validate portable package")
            run(["node", "./scripts/validate-portable-release.js", "--skip-build"], cwd=publish_repo if did_export else PROJECT_ROOT)

        if should_validate_docker:
            print_step("Validate Docker release")
            run(["node", "./scripts/validate-docker-release.js"], cwd=publish_repo if did_export else PROJECT_ROOT)

        if not args.skip_build:
            print_step("Stage release assets")
            clear_release_asset_directory(release_asset_dir)
            build_artifact_paths = resolve_artifact_paths(
                publish_repo if did_export else PROJECT_ROOT,
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
        if artifact_paths:
            artifact_paths.append(write_sha256_sums(release_asset_dir, artifact_paths))

        if not args.skip_push:
            print_step("Push source code to GitHub")
            run(["git", "push", "-u", "origin", args.branch], cwd=publish_repo)

        if not args.skip_release:
            print_step("Create and push release tag")
            ensure_release_tag(publish_repo, release_tag, release_title)

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
        if artifact_paths:
            print("Artifacts:")
            for artifact in artifact_paths:
                print(f"- {artifact}")
        return 0
    finally:
        if injected_build_support:
            print_step("Remove transient build support")
            clear_transient_build_support(publish_repo)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, handle_interrupt)
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted by user, stopping release gracefully.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:  # pragma: no cover - top-level CLI behavior
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
