#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Mapping, Sequence
from urllib import error as urllib_error
from urllib import parse as urllib_parse
from urllib import request as urllib_request


PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_BAZAAR_ROOT = PROJECT_ROOT / "marketplace" / "sourceflow-bazaar"
DEFAULT_PLUGIN_SOURCE_ROOT = PROJECT_ROOT / "plugins"
DEFAULT_BAZAAR_REPOSITORY_URL = "https://github.com/lonelyor/SourceFlow-plugins.git"
EXPORT_ROOT = PROJECT_ROOT / ".opensource-release"
DEFAULT_TOKEN_FILE = PROJECT_ROOT / ".release.local.env"
LEGACY_TOKEN_FILE = PROJECT_ROOT / "scripts" / "public-release.local.env"
PACKAGE_TYPES = ("plugins", "themes", "icons", "templates", "widgets")
VALID_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-_]{1,63}$")
VALID_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+([\-+][0-9A-Za-z.\-]+)?$")
GITHUB_REPO_RE = re.compile(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+?)(?:\.git)?/?$", re.I)
VALID_PERMISSIONS = {
    "storage",
    "ui.topbar",
    "ui.statusbar",
    "ui.command",
    "ui.dock",
    "ui.setting",
    "ui.tab",
    "ui.dialog",
    "ui.float",
    "ui.notification",
    "workspace.read",
    "workspace.write",
    "network.http",
    "host.control",
}
VALID_FRONTENDS = {"desktop", "desktop-window", "mobile", "browser", "all"}
VALID_BACKENDS = {"windows", "linux", "darwin", "android", "ios", "docker", "all"}
EXCLUDED_NAMES = {".git", "node_modules", "dist", "__pycache__"}
EXCLUDED_FILE_NAMES = {".DS_Store", "Thumbs.db"}
EXCLUDED_SUFFIXES = {".pyc", ".pyo"}
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
}


@dataclass(frozen=True)
class GitHubAuth:
    token: str
    source: str
    token_file: Path


@dataclass(frozen=True)
class PluginInfo:
    plugin_dir: Path
    manifest_path: Path
    manifest: dict[str, object]

    @property
    def name(self) -> str:
        return str(self.manifest["name"])

    @property
    def version(self) -> str:
        return str(self.manifest["version"])


def print_step(message: str) -> None:
    print(f"\n==> {message}", flush=True)


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
        output = ""
        if capture_output:
            output = f"\n{(result.stdout or '')}{(result.stderr or '')}".rstrip()
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}{output}")
    return result


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        raise RuntimeError(f"Required command not found: {name}")


def remove_tree_force(path: Path, retries: int = 8, delay_seconds: float = 0.25) -> None:
    if not path.exists():
        return

    def handle_remove_error(function, target, _exc_info):
        try:
            os.chmod(target, 0o700)
            function(target)
        except Exception:
            raise

    for attempt in range(retries):
        try:
            shutil.rmtree(path, onerror=handle_remove_error)
            return
        except FileNotFoundError:
            return
        except PermissionError:
            if attempt == retries - 1:
                raise
            time.sleep(delay_seconds)
        except OSError:
            if attempt == retries - 1:
                raise
            time.sleep(delay_seconds)


def read_key_value_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            raise RuntimeError(f"Invalid token file line {line_number}: {raw_line}")
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'")):
            value = value[1:-1]
        values[key.strip()] = value
    return values


def resolve_github_auth(explicit_token: str, token_file: str) -> GitHubAuth:
    resolved_file = Path(token_file).resolve() if token_file else DEFAULT_TOKEN_FILE.resolve()
    file_values = read_key_value_file(resolved_file)
    if not token_file and not file_values and LEGACY_TOKEN_FILE.exists():
        resolved_file = LEGACY_TOKEN_FILE.resolve()
        file_values = read_key_value_file(resolved_file)

    for key in ("GH_TOKEN", "GITHUB_TOKEN", "SOURCEFLOW_GITHUB_TOKEN"):
        if explicit_token:
            return GitHubAuth(explicit_token, "parameter", resolved_file)
        if file_values.get(key):
            return GitHubAuth(file_values[key], f"file:{resolved_file} ({key})", resolved_file)
        if os.environ.get(key):
            return GitHubAuth(os.environ[key], f"process env {key}", resolved_file)
    return GitHubAuth("", "", resolved_file)


def require_token(auth: GitHubAuth, purpose: str) -> str:
    if auth.token:
        return auth.token
    raise RuntimeError(
        f"GitHub token is required to {purpose}. "
        "Set --github-token, GH_TOKEN, GITHUB_TOKEN, or SOURCEFLOW_GITHUB_TOKEN."
    )


def github_api_request(method: str, path: str, token: str, body: object | None = None) -> object:
    url = f"https://api.github.com{path}"
    payload = None
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SourceFlow-bazaar-script",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib_request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib_request.urlopen(req, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except urllib_error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        message = raw.strip() or exc.reason
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict) and parsed.get("message"):
                message = str(parsed["message"])
        except json.JSONDecodeError:
            pass
        raise RuntimeError(f"GitHub API {method} {url} failed ({exc.code}): {message}") from exc
    if not raw:
        return {}
    return json.loads(raw)


def parse_github_repo_slug(url: str) -> str:
    match = GITHUB_REPO_RE.search(url or "")
    if not match:
        return ""
    return f"{match.group('owner')}/{match.group('repo')}"


def ensure_github_repository_exists(token: str, repo_slug: str, visibility: str) -> None:
    try:
        github_api_request("GET", f"/repos/{repo_slug}", token)
        print(f"GitHub repository exists: {repo_slug}")
        return
    except RuntimeError as exc:
        if "(404)" not in str(exc):
            raise
    owner, repo_name = repo_slug.split("/", 1)
    viewer = github_api_request("GET", "/user", token)
    if not isinstance(viewer, dict) or not viewer.get("login"):
        raise RuntimeError("Unable to resolve authenticated GitHub user.")
    viewer_login = str(viewer["login"])
    if owner.lower() == viewer_login.lower():
        if visibility == "internal":
            raise RuntimeError("GitHub user repositories do not support internal visibility.")
        github_api_request("POST", "/user/repos", token, {"name": repo_name, "private": visibility != "public"})
    else:
        github_api_request("POST", f"/orgs/{owner}/repos", token, {"name": repo_name, "visibility": visibility})
    print(f"GitHub repository created: {repo_slug}")


def ensure_github_push_permission(token: str, repo_slug: str) -> None:
    result = github_api_request("GET", f"/repos/{repo_slug}", token)
    if not isinstance(result, dict):
        raise RuntimeError(f"Unable to inspect GitHub repository permissions: {repo_slug}")
    permissions = result.get("permissions")
    if isinstance(permissions, dict) and permissions.get("push"):
        return
    viewer_permission = str(result.get("viewer_permission") or result.get("role_name") or "").lower()
    if viewer_permission in {"admin", "maintain", "write"}:
        return
    raise RuntimeError(
        f"GitHub token does not have push permission for {repo_slug}. "
        "Use a token with repository contents write access, then rerun 插件商城.py."
    )


def normalize_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    seen: set[str] = set()
    result: list[str] = []
    for item in value:
        text = str(item).strip()
        if text and text not in seen:
            seen.add(text)
            result.append(text)
    return result


def get_locale_value(value: object) -> str:
    if isinstance(value, str):
        return value.strip()
    if not isinstance(value, dict):
        return ""
    for key in ("default", "zh_CN", "en_US"):
        if str(value.get(key, "")).strip():
            return str(value[key]).strip()
    for item in value.values():
        if str(item).strip():
            return str(item).strip()
    return ""


def load_plugin(plugin_path: str | os.PathLike[str]) -> PluginInfo:
    resolved = Path(plugin_path).resolve()
    if not resolved.exists():
        raise RuntimeError(f"Plugin path does not exist: {resolved}")
    plugin_dir = resolved if resolved.is_dir() else resolved.parent
    manifest_path = plugin_dir / "plugin.json" if resolved.is_dir() else resolved
    if not manifest_path.is_file():
        raise RuntimeError(f"plugin.json not found: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise RuntimeError(f"plugin.json must be a JSON object: {manifest_path}")

    normalized = dict(manifest)
    normalized["manifestVersion"] = int(normalized.get("manifestVersion") or 1)
    normalized["name"] = str(normalized.get("name", "")).strip()
    normalized["version"] = str(normalized.get("version", "")).strip()
    normalized["minAppVersion"] = str(normalized.get("minAppVersion", "")).strip()
    normalized["entry"] = str(normalized.get("entry") or "index.js").strip()
    normalized["style"] = str(normalized.get("style") or "index.css").strip()
    normalized["permissions"] = normalize_list(normalized.get("permissions"))
    normalized["frontends"] = normalize_list(normalized.get("frontends")) or ["desktop"]
    normalized["backends"] = normalize_list(normalized.get("backends")) or ["all"]
    normalized["allowedRequireModules"] = normalize_list(normalized.get("allowedRequireModules"))

    errors: list[str] = []
    if normalized["manifestVersion"] != 1:
        errors.append(f"unsupported manifestVersion: {normalized['manifestVersion']}")
    if not VALID_NAME_RE.fullmatch(str(normalized["name"])):
        errors.append("name must match ^[a-z0-9][a-z0-9-_]{1,63}$")
    if not get_locale_value(normalized.get("displayName")):
        errors.append("displayName is required")
    if not get_locale_value(normalized.get("description")):
        errors.append("description is required")
    if not VALID_VERSION_RE.fullmatch(str(normalized["version"])):
        errors.append("version must be semantic version like 1.0.0")
    if not VALID_VERSION_RE.fullmatch(str(normalized["minAppVersion"])):
        errors.append("minAppVersion must be semantic version like 1.0.0")
    if not normalized["permissions"]:
        errors.append("permissions must not be empty")
    for permission in normalized["permissions"]:
        if permission not in VALID_PERMISSIONS:
            errors.append(f"unsupported permission: {permission}")
    for frontend in normalized["frontends"]:
        if frontend not in VALID_FRONTENDS:
            errors.append(f"unsupported frontend: {frontend}")
    for backend in normalized["backends"]:
        if backend not in VALID_BACKENDS:
            errors.append(f"unsupported backend: {backend}")
    for module_name in normalized["allowedRequireModules"]:
        if ".." in module_name or "/" in module_name or "\\" in module_name:
            errors.append(f"invalid allowedRequireModules entry: {module_name}")
    entry_path = plugin_dir / str(normalized["entry"])
    if not entry_path.is_file():
        errors.append(f"entry file not found: {normalized['entry']}")
    style_path = plugin_dir / str(normalized["style"])
    if normalized["style"] and not style_path.is_file():
        errors.append(f"style file not found: {normalized['style']}")
    if errors:
        raise RuntimeError("Plugin validation failed:\n- " + "\n- ".join(errors))
    return PluginInfo(plugin_dir=plugin_dir, manifest_path=manifest_path, manifest=normalized)


def should_package_file(path: Path, plugin_dir: Path) -> bool:
    rel_parts = path.relative_to(plugin_dir).parts
    if any(part in EXCLUDED_NAMES for part in rel_parts):
        return False
    if path.name in EXCLUDED_FILE_NAMES:
        return False
    if path.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    return path.is_file()


def is_secret_scan_candidate(file_path: Path, root_path: Path) -> bool:
    try:
        relative_parts = file_path.relative_to(root_path).parts
    except ValueError:
        return False
    if any(part in {".git", "node_modules", "dist", "__pycache__"} for part in relative_parts):
        return False
    if file_path.suffix.lower() in SECRET_SCAN_SKIP_EXTENSIONS:
        return False
    if file_path.name.endswith(".min.js") or file_path.name.endswith(".min.mjs"):
        return False
    try:
        return file_path.stat().st_size < 2 * 1024 * 1024
    except OSError:
        return False


def find_high_risk_secrets(root_path: Path) -> list[tuple[Path, str]]:
    findings: list[tuple[Path, str]] = []
    if not root_path.exists():
        return findings
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


def assert_no_high_risk_secrets(root_path: Path, label: str) -> None:
    findings = find_high_risk_secrets(root_path)
    if not findings:
        return
    print(f"High-risk secret patterns were found in {label}:")
    for file_path, pattern in findings:
        print(f"- {file_path} -> {pattern}")
    raise RuntimeError(f"Refusing to continue because {label} contains high-risk secret patterns.")


def package_plugin(plugin: PluginInfo) -> Path:
    output_dir = plugin.plugin_dir / "dist"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{plugin.name}-{plugin.version}.zip"
    if output_path.exists():
        output_path.unlink()
    files = sorted(path for path in plugin.plugin_dir.rglob("*") if should_package_file(path, plugin.plugin_dir))
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            relative = path.relative_to(plugin.plugin_dir)
            archive_name = PurePosixPath(plugin.name, *relative.parts).as_posix()
            archive.write(path, archive_name)
    return output_path


def file_hash(path: Path, algorithm: str) -> str:
    digest = hashlib.new(algorithm)
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def directory_size(path: Path) -> int:
    total = 0
    for item in path.rglob("*"):
        if item.is_dir():
            continue
        if should_package_file(item, path):
            total += item.stat().st_size
    return total


def resolve_optional_file(base_dir: Path, explicit: str, candidates: Sequence[str]) -> Path | None:
    if explicit:
        path = Path(explicit).resolve()
        if not path.is_file():
            raise RuntimeError(f"Referenced file does not exist: {path}")
        return path
    for candidate in candidates:
        path = base_dir / candidate
        if path.is_file():
            return path.resolve()
    return None


def resolve_plugin_repo_info(plugin: PluginInfo, owner: str, repo: str, repo_url: str) -> tuple[str, str, str]:
    explicit_slug = parse_github_repo_slug(repo_url)
    manifest_slug = parse_github_repo_slug(str(plugin.manifest.get("url", "")))
    if explicit_slug:
        explicit_owner, explicit_repo = explicit_slug.split("/", 1)
        owner = owner or explicit_owner
        repo = repo or explicit_repo
    elif manifest_slug:
        manifest_owner, _manifest_repo = manifest_slug.split("/", 1)
        owner = owner or manifest_owner
    repo = repo or plugin.name
    if not owner or not repo:
        raise RuntimeError("Unable to resolve plugin GitHub owner/repo. Pass --owner and --repo, or --plugin-repository-url.")
    return owner, repo, f"https://github.com/{owner}/{repo}"


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def publish_plugin_to_local_bazaar(
    plugin: PluginInfo,
    bazaar_root: Path,
    *,
    owner: str,
    repo: str,
    plugin_repo_url: str,
    readme: str,
    icon: str,
    preview_image: str,
    submission_name: str,
    updated: str,
) -> dict[str, object]:
    assert_no_high_risk_secrets(plugin.plugin_dir, f"plugin source {plugin.plugin_dir}")
    plugin_owner, plugin_repo, resolved_repo_url = resolve_plugin_repo_info(plugin, owner, repo, plugin_repo_url)
    readme_path = resolve_optional_file(plugin.plugin_dir, readme, ("README.md", "readme.md"))
    icon_path = resolve_optional_file(plugin.plugin_dir, icon, ("icon.png", "icon.jpg", "icon.jpeg", "icon.webp"))
    preview_path = resolve_optional_file(plugin.plugin_dir, preview_image, ("preview.png", "preview.jpg", "preview.jpeg", "preview.webp"))

    archive_path = package_plugin(plugin)
    archive_sha1 = file_hash(archive_path, "sha1")
    archive_sha256 = file_hash(archive_path, "sha256")
    repo_url_hash = f"{plugin_owner}/{plugin_repo}@{archive_sha1}"
    package_dir = bazaar_root / "packages" / "package" / repo_url_hash
    archive_target = bazaar_root / "packages" / "package" / f"{repo_url_hash}.zip"
    submission_target = bazaar_root / "submissions" / "plugins" / f"{submission_name or plugin.name + '-plugin'}.json"

    previous: dict[str, object] = {}
    if submission_target.is_file():
        previous = json.loads(submission_target.read_text(encoding="utf-8"))
        previous_url = str(previous.get("url", ""))
        if previous_url.startswith(f"{plugin_owner}/{plugin_repo}@") and previous_url != repo_url_hash:
            shutil.rmtree(bazaar_root / "packages" / "package" / previous_url, ignore_errors=True)
            previous_archive = bazaar_root / "packages" / "package" / f"{previous_url}.zip"
            if previous_archive.exists():
                previous_archive.unlink()

    package_dir.mkdir(parents=True, exist_ok=True)
    archive_target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(archive_path, archive_target)

    def copy_asset(source: Path | None) -> str:
        if not source:
            return ""
        target = package_dir / source.name
        shutil.copy2(source, target)
        return source.name

    readme_file = copy_asset(readme_path)
    icon_file = copy_asset(icon_path)
    preview_file = copy_asset(preview_path)
    manifest = plugin.manifest
    previous_package = previous.get("package") if isinstance(previous.get("package"), dict) else {}
    previous_updated = ""
    if (
        previous.get("url") == repo_url_hash
        and isinstance(previous_package, dict)
        and previous_package.get("archiveSHA256") == archive_sha256
    ):
        previous_updated = str(previous.get("updated") or "")
    submission = {
        "url": repo_url_hash,
        "updated": updated or previous_updated or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "stars": 0,
        "openIssues": 0,
        "size": archive_target.stat().st_size,
        "installSize": directory_size(plugin.plugin_dir),
        "package": {
            "author": str(manifest.get("author") or "By lonelyor"),
            "url": resolved_repo_url,
            "version": plugin.version,
            "minAppVersion": manifest["minAppVersion"],
            "archiveSHA256": archive_sha256,
            "permissions": manifest["permissions"],
            "disabledInPublish": bool(manifest.get("disabledInPublish", False)),
            "backends": manifest["backends"],
            "frontends": manifest["frontends"],
            "displayName": manifest["displayName"],
            "description": manifest["description"],
            "readme": {"default": readme_file} if readme_file else None,
            "funding": {"github": plugin_owner},
            "keywords": sorted(set(["sourceflow", "plugin", plugin.name] + normalize_list(manifest.get("keywords")))),
            "name": plugin.name,
            "iconURL": icon_file or None,
            "previewURL": preview_file or None,
        },
    }
    package_data = submission["package"]
    if isinstance(package_data, dict):
        for key in list(package_data):
            if package_data[key] is None:
                del package_data[key]
    write_json(submission_target, submission)
    return {
        "plugin": plugin.name,
        "version": plugin.version,
        "submission": str(submission_target),
        "archive": str(archive_target),
        "archiveSHA256": archive_sha256,
        "repoURLHash": repo_url_hash,
    }


def validate_stage_repo(pkg_type: str, stage_repo: object, file_path: Path) -> None:
    if not isinstance(stage_repo, dict):
        raise RuntimeError(f"Invalid submission object in {file_path}")
    if not re.fullmatch(r"[^/]+/[^@]+@[0-9a-f]{7,}", str(stage_repo.get("url", "")), re.I):
        raise RuntimeError(f'Field "url" must look like owner/repo@hash in {file_path}')
    package = stage_repo.get("package")
    if not isinstance(package, dict):
        raise RuntimeError(f"Missing package metadata in {file_path}")
    if not str(package.get("name", "")).strip():
        raise RuntimeError(f"Missing package.name in {file_path}")
    if not VALID_VERSION_RE.fullmatch(str(package.get("version", ""))):
        raise RuntimeError(f"Invalid package.version in {file_path}")
    if not VALID_VERSION_RE.fullmatch(str(package.get("minAppVersion", ""))):
        raise RuntimeError(f"Invalid package.minAppVersion in {file_path}")
    archive_sha256 = str(package.get("archiveSHA256", ""))
    if not re.fullmatch(r"[0-9a-f]{64}", archive_sha256, re.I):
        raise RuntimeError(f"Invalid package.archiveSHA256 in {file_path}")
    if pkg_type == "plugins":
        if not isinstance(package.get("frontends"), list) or not package["frontends"]:
            raise RuntimeError(f"Plugin package.frontends must be a non-empty array in {file_path}")
        if not isinstance(package.get("backends"), list) or not package["backends"]:
            raise RuntimeError(f"Plugin package.backends must be a non-empty array in {file_path}")
        if not isinstance(package.get("permissions"), list) or not package["permissions"]:
            raise RuntimeError(f"Plugin package.permissions must be a non-empty array in {file_path}")
    archive = file_path.parents[2] / "packages" / "package" / f"{stage_repo['url']}.zip"
    if not archive.is_file():
        raise RuntimeError(f"Missing package archive: {archive}")
    actual_sha256 = file_hash(archive, "sha256")
    if actual_sha256.lower() != archive_sha256.lower():
        raise RuntimeError(f"Package archive SHA-256 mismatch: {archive}")


def load_stage_repos(bazaar_root: Path, pkg_type: str) -> list[dict[str, object]]:
    submissions_dir = bazaar_root / "submissions" / pkg_type
    if not submissions_dir.is_dir():
        return []
    repos: list[dict[str, object]] = []
    seen_names: set[str] = set()
    seen_urls: set[str] = set()
    for file_path in sorted(submissions_dir.glob("*.json")):
        stage_repo = json.loads(file_path.read_text(encoding="utf-8"))
        validate_stage_repo(pkg_type, stage_repo, file_path)
        package = stage_repo["package"]
        name = str(package["name"])
        url = str(stage_repo["url"])
        if name in seen_names:
            raise RuntimeError(f"Duplicate package name: {name}")
        if url in seen_urls:
            raise RuntimeError(f"Duplicate package url: {url}")
        seen_names.add(name)
        seen_urls.add(url)
        repos.append(stage_repo)
    repos.sort(key=lambda item: str(item.get("url", "")))
    return repos


def stable_json(value: object) -> str:
    if isinstance(value, dict):
        return "{" + ",".join(f"{json.dumps(key, ensure_ascii=False)}:{stable_json(value[key])}" for key in sorted(value)) + "}"
    if isinstance(value, list):
        return "[" + ",".join(stable_json(item) for item in value) + "]"
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def copytree_if_exists(source: Path, target: Path) -> None:
    if source.exists():
        shutil.copytree(source, target, dirs_exist_ok=True)


def sync_plugin_source(plugin: PluginInfo, plugin_source_root: Path) -> Path:
    target_dir = plugin_source_root / plugin.name
    if plugin.plugin_dir.resolve() == target_dir.resolve():
        return target_dir
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.parent.mkdir(parents=True, exist_ok=True)

    shutil.copytree(
        plugin.plugin_dir,
        target_dir,
        ignore=lambda _dir, names: {
            name
            for name in names
            if name in EXCLUDED_NAMES or name in EXCLUDED_FILE_NAMES or Path(name).suffix.lower() in EXCLUDED_SUFFIXES
        },
    )
    return target_dir


def generate_bazaar_dist(bazaar_root: Path, output_dir: Path) -> str:
    previous_bazaar_hash = ""
    previous_generated_at = ""
    previous_version_path = output_dir / "version.json"
    if previous_version_path.is_file():
        try:
            previous_version = json.loads(previous_version_path.read_text(encoding="utf-8"))
            previous_bazaar_hash = str(previous_version.get("bazaar") or "")
            previous_generated_at = str(previous_version.get("generatedAt") or "")
        except Exception:
            previous_bazaar_hash = ""
            previous_generated_at = ""
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stage_indexes: dict[str, dict[str, object]] = {}
    for pkg_type in PACKAGE_TYPES:
        stage_indexes[pkg_type] = {"repos": load_stage_repos(bazaar_root, pkg_type)}
    bazaar_hash = hashlib.sha1(
        "\n".join(stable_json(stage_indexes[pkg_type]) for pkg_type in PACKAGE_TYPES).encode("utf-8")
    ).hexdigest()
    for pkg_type in PACKAGE_TYPES:
        write_json(output_dir / f"bazaar@{bazaar_hash}" / "stage" / f"{pkg_type}.json", stage_indexes[pkg_type])
    stats_file = bazaar_root / "stats" / "index.json"
    stats = json.loads(stats_file.read_text(encoding="utf-8")) if stats_file.is_file() else {}
    write_json(output_dir / "stat" / "bazaar" / "index.json", stats)
    write_json(
        output_dir / "version.json",
        {
            "bazaar": bazaar_hash,
            "generatedAt": previous_generated_at if previous_bazaar_hash == bazaar_hash and previous_generated_at else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "layout": {
                "stage": f"/bazaar@{bazaar_hash}/stage/*.json",
                "packageArchive": "/package/<owner>/<repo>@<hash>.zip",
                "packageAsset": "/package/<owner>/<repo>@<hash>/<asset>",
                "stats": "/stat/bazaar/index.json",
            },
        },
    )
    copytree_if_exists(bazaar_root / "packages", output_dir / "package")
    return bazaar_hash


def copy_directory_contents(source_dir: Path, target_dir: Path) -> None:
    if not source_dir.exists():
        return
    for child in source_dir.iterdir():
        target = target_dir / child.name
        if child.is_dir():
            shutil.copytree(child, target, dirs_exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(child, target)


def write_standalone_bazaar_files(
    source_root: Path,
    target_root: Path,
    plugin_source_root: Path | None,
    *,
    include_workflow: bool,
    include_static_root: bool,
) -> None:
    target_root.mkdir(parents=True, exist_ok=True)
    for filename in ("README.md", "PLUGIN_DEVELOPMENT.md"):
        source_doc = source_root / filename
        if source_doc.is_file():
            shutil.copy2(source_doc, target_root / filename)
    for dirname in ("submissions", "packages", "stats"):
        source = source_root / dirname
        if source.exists():
            shutil.copytree(source, target_root / dirname, dirs_exist_ok=True)
    if plugin_source_root and plugin_source_root.exists():
        shutil.copytree(plugin_source_root, target_root / "plugins", dirs_exist_ok=True)
    if include_static_root:
        copy_directory_contents(source_root / "dist", target_root)
    scripts_dir = target_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    for script_name in ("validate-bazaar.js", "generate-bazaar.js"):
        source_script = PROJECT_ROOT / "scripts" / script_name
        if source_script.is_file():
            shutil.copy2(source_script, scripts_dir / script_name)
    write_json(
        target_root / "package.json",
        {
            "name": "sourceflow-plugins",
            "private": True,
            "version": "1.0.0",
            "scripts": {
                "validate": "node ./scripts/validate-bazaar.js --root .",
                "generate": "node ./scripts/generate-bazaar.js --root . --output ./dist",
            },
        },
    )
    (target_root / ".gitignore").write_text("dist/\n", encoding="utf-8")
    if not include_workflow:
        return
    workflow = target_root / ".github" / "workflows" / "sourceflow-plugins.yml"
    workflow.parent.mkdir(parents=True, exist_ok=True)
    workflow.write_text(
        """name: SourceFlow Plugins

on:
  push:
    branches: ["main"]
    paths:
      - "submissions/**"
      - "packages/**"
      - "plugins/**"
      - "stats/**"
      - "scripts/generate-bazaar.js"
      - "scripts/validate-bazaar.js"
      - ".github/workflows/sourceflow-plugins.yml"
      - "README.md"
      - "PLUGIN_DEVELOPMENT.md"
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-bazaar:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Validate submissions
        run: node ./scripts/validate-bazaar.js --root .

      - name: Generate static bazaar
        run: node ./scripts/generate-bazaar.js --root . --output ./dist

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy-bazaar:
    needs: build-bazaar
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
""",
        encoding="utf-8",
    )


def path_is_within(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def git_auth_env(token: str) -> dict[str, str]:
    if not token:
        return {}
    encoded = base64.b64encode(f"x-access-token:{token}".encode("utf-8")).decode("ascii")
    entries = [
        ("http.https://github.com/.extraheader", f"AUTHORIZATION: basic {encoded}"),
        ("credential.helper", ""),
    ]
    env = {"GIT_CONFIG_COUNT": str(len(entries))}
    for index, (key, value) in enumerate(entries):
        env[f"GIT_CONFIG_KEY_{index}"] = key
        env[f"GIT_CONFIG_VALUE_{index}"] = value
    return env


def git(args: Sequence[str], cwd: Path | None = None, token: str = "", capture_output: bool = False, check: bool = True) -> subprocess.CompletedProcess[str]:
    return run(["git", *args], cwd=cwd, env=git_auth_env(token), capture_output=capture_output, check=check)


def clear_directory_except_git(path: Path) -> None:
    for child in path.iterdir():
        if child.name == ".git":
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()


def ensure_git_identity(repo_dir: Path) -> None:
    name = git(["config", "--get", "user.name"], cwd=repo_dir, capture_output=True, check=False).stdout.strip()
    email = git(["config", "--get", "user.email"], cwd=repo_dir, capture_output=True, check=False).stdout.strip()
    if not name:
        git(["config", "user.name", "SourceFlow Bazaar Bot"], cwd=repo_dir)
    if not email:
        git(["config", "user.email", "sourceflow-plugins@example.invalid"], cwd=repo_dir)


def publish_bazaar_to_github(
    source_root: Path,
    plugin_source_root: Path | None,
    repository_url: str,
    branch: str,
    export_dir: Path,
    token: str,
    commit_message: str,
    force_export_dir: bool,
    include_workflow: bool,
) -> dict[str, str]:
    require_command("git")
    if export_dir.exists():
        if not force_export_dir and not path_is_within(export_dir, EXPORT_ROOT):
            raise RuntimeError(f"Refusing to replace export dir outside {EXPORT_ROOT}: {export_dir}")
        remove_tree_force(export_dir)
    export_dir.parent.mkdir(parents=True, exist_ok=True)
    git(["clone", repository_url, str(export_dir)], token=token)
    git(["checkout", "-B", branch], cwd=export_dir)
    clear_directory_except_git(export_dir)
    write_standalone_bazaar_files(
        source_root,
        export_dir,
        plugin_source_root,
        include_workflow=include_workflow,
        include_static_root=True,
    )
    assert_no_high_risk_secrets(export_dir, f"export repository {export_dir}")
    ensure_git_identity(export_dir)
    git(["add", "."], cwd=export_dir)
    status = git(["status", "--porcelain"], cwd=export_dir, capture_output=True).stdout.strip()
    if status:
        git(["commit", "-m", commit_message], cwd=export_dir)
        git(["push", "-u", "origin", branch], cwd=export_dir, token=token)
        pushed = "yes"
    else:
        print("Bazaar repository has no changes to push.")
        pushed = "no changes"
    return {"exportDir": str(export_dir), "pushed": pushed}


def purge_jsdelivr_cache(repo_slug: str, branch: str, bazaar_hash: str, repo_url_hash: str) -> None:
    if not repo_slug or not branch:
        return
    paths = [
        "version.json",
        "stat/bazaar/index.json",
        f"package/package/{repo_url_hash}.zip",
    ]
    paths.extend(f"bazaar@{bazaar_hash}/stage/{pkg_type}.json" for pkg_type in PACKAGE_TYPES)
    for rel_path in paths:
        purge_path = f"/gh/{repo_slug}@{branch}/{rel_path.lstrip('/')}"
        purge_url = "https://purge.jsdelivr.net" + urllib_parse.quote(purge_path, safe="/@._-")
        try:
            with urllib_request.urlopen(purge_url, timeout=20) as response:
                if response.status >= 400:
                    print(f"Warning: jsDelivr purge failed for {rel_path}: HTTP {response.status}", file=sys.stderr)
        except (urllib_error.URLError, TimeoutError) as exc:
            print(f"Warning: jsDelivr purge failed for {rel_path}: {exc}", file=sys.stderr)


def run_plugin_runtime_smoke(plugin_dir: Path) -> None:
    smoke_script = PROJECT_ROOT / "scripts" / "smoke-plugin-runtime.js"
    if not smoke_script.is_file():
        raise RuntimeError(f"Plugin runtime smoke script not found: {smoke_script}")
    require_command("node")
    run(["node", str(smoke_script), str(plugin_dir)], cwd=PROJECT_ROOT)


def discover_local_plugin_paths(plugin_source_root: Path) -> list[Path]:
    if not plugin_source_root.is_dir():
        raise RuntimeError(f"Plugin source root does not exist: {plugin_source_root}")
    plugin_paths = sorted(
        child.resolve()
        for child in plugin_source_root.iterdir()
        if child.is_dir() and (child / "plugin.json").is_file()
    )
    if not plugin_paths:
        raise RuntimeError(
            f"No plugin_dir was provided and no plugin.json was found under {plugin_source_root}. "
            "Pass a plugin directory explicitly, for example: python 插件商城.py plugins/sourceflow-paper-polish"
        )
    return plugin_paths


def resolve_plugin_paths(plugin_dir: str, plugin_source_root: Path) -> list[Path]:
    if plugin_dir.strip():
        return [Path(plugin_dir).resolve()]
    return discover_local_plugin_paths(plugin_source_root)


def reject_ambiguous_multi_plugin_options(args: argparse.Namespace, plugins: Sequence[PluginInfo]) -> None:
    if len(plugins) <= 1:
        return
    ambiguous_options = []
    for attribute, flag in (
        ("repo", "--repo"),
        ("plugin_repository_url", "--plugin-repository-url"),
        ("readme", "--readme"),
        ("icon", "--icon"),
        ("preview_image", "--preview-image"),
        ("submission_name", "--submission-name"),
    ):
        if str(getattr(args, attribute, "")).strip():
            ambiguous_options.append(flag)
    if ambiguous_options:
        raise RuntimeError(
            "No-argument mode publishes every plugin under --plugin-source-root, so plugin-specific options are ambiguous: "
            + ", ".join(ambiguous_options)
            + ". Pass a single plugin_dir when using those options."
        )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python 插件商城.py",
        description="Package a local SourceFlow plugin, update the static Bazaar, and optionally push it to GitHub Pages.",
        formatter_class=argparse.RawTextHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python 插件商城.py\n"
            "  python 插件商城.py plugins/sourceflow-hello --owner lonelyor --repo sourceflow-hello --skip-push\n"
            "  python 插件商城.py plugins/sourceflow-hello --owner lonelyor --repo sourceflow-hello\n"
            "  python 插件商城.py plugins/sourceflow-hello --dry-run\n"
        ),
    )
    parser.add_argument("plugin_dir", nargs="?", default="", help="Local plugin directory or plugin.json path. When omitted, publishes every plugin under --plugin-source-root.")
    parser.add_argument("--bazaar-root", default=str(DEFAULT_BAZAAR_ROOT), help="Local Bazaar source root.")
    parser.add_argument("--plugin-source-root", default=str(DEFAULT_PLUGIN_SOURCE_ROOT), help="Local folder that stores all maintained plugin source directories.")
    parser.add_argument("--skip-sync-plugin-source", action="store_true", help="Do not copy the current plugin into --plugin-source-root.")
    parser.add_argument("--owner", default="", help="GitHub owner for the plugin package.")
    parser.add_argument("--repo", default="", help="GitHub repo name for the plugin package. Defaults to the plugin name.")
    parser.add_argument("--plugin-repository-url", default="", help="Public GitHub URL for the plugin source.")
    parser.add_argument("--bazaar-repository-url", default=DEFAULT_BAZAAR_REPOSITORY_URL, help="GitHub repository URL for the standalone plugin Bazaar repo.")
    parser.add_argument("--branch", default="main", help="Bazaar repository branch.")
    parser.add_argument("--github-token", default="", help="GitHub token. Overrides token file and environment variables.")
    parser.add_argument("--github-token-file", default="", help="Env-style file containing GH_TOKEN/GITHUB_TOKEN/SOURCEFLOW_GITHUB_TOKEN.")
    parser.add_argument("--create-repository", action="store_true", help="Create the Bazaar GitHub repository if it does not exist.")
    parser.add_argument("--visibility", choices=("public", "private", "internal"), default="public", help="Visibility used with --create-repository.")
    parser.add_argument("--readme", default="", help="README file copied into the Bazaar package asset directory.")
    parser.add_argument("--icon", default="", help="Icon image copied into the Bazaar package asset directory.")
    parser.add_argument("--preview-image", default="", help="Preview image copied into the Bazaar package asset directory.")
    parser.add_argument("--submission-name", default="", help="Submission JSON file stem. Defaults to <plugin-name>-plugin.")
    parser.add_argument("--updated", default="", help="Explicit ISO timestamp for the Bazaar submission.")
    parser.add_argument("--export-dir", default="", help="Working clone used for GitHub push. Defaults under .opensource-release.")
    parser.add_argument("--force-export-dir", action="store_true", help="Allow replacing an explicit export dir outside .opensource-release.")
    parser.add_argument("--commit-message", default="", help="Bazaar repo commit message.")
    parser.add_argument("--skip-workflow", action="store_true", help="Do not export the GitHub Pages workflow. Useful when the token lacks GitHub workflow scope.")
    parser.add_argument("--skip-runtime-test", action="store_true", help="Skip plugin runtime smoke test.")
    parser.add_argument("--skip-push", action="store_true", help="Update local Bazaar only; do not push to GitHub.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print the plan without writing Bazaar files.")
    parser.add_argument("--keep-export-dir", action="store_true", help="Keep the GitHub working clone after pushing.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    bazaar_root = Path(args.bazaar_root).resolve()
    plugin_source_root = Path(args.plugin_source_root).resolve()
    auth = resolve_github_auth(args.github_token, args.github_token_file)
    plugins = [load_plugin(path) for path in resolve_plugin_paths(args.plugin_dir, plugin_source_root)]
    reject_ambiguous_multi_plugin_options(args, plugins)
    plugin_repo_infos = [
        (plugin, *resolve_plugin_repo_info(plugin, args.owner, args.repo, args.plugin_repository_url))
        for plugin in plugins
    ]
    repo_slug = parse_github_repo_slug(args.bazaar_repository_url)
    if not repo_slug:
        raise RuntimeError(f"Only GitHub Bazaar repository URLs are supported: {args.bazaar_repository_url}")
    pages_url = f"https://{repo_slug.split('/', 1)[0]}.github.io/{repo_slug.split('/', 1)[1]}/"

    if args.dry_run:
        print_step("Plugin Bazaar publish preview")
        for plugin, plugin_owner, plugin_repo, plugin_repo_url in plugin_repo_infos:
            print(f"Plugin: {plugin.name} {plugin.version}")
            print(f"Plugin manifest: {plugin.manifest_path}")
            print(f"Plugin repository: {plugin_repo_url}")
            print(f"Plugin package id: {plugin_owner}/{plugin_repo}")
        print(f"Plugin source root: {plugin_source_root}")
        print(f"Bazaar root: {bazaar_root}")
        print(f"Bazaar repository: {args.bazaar_repository_url}")
        print(f"Bazaar branch: {args.branch}")
        print(f"Push to GitHub: {'no' if args.skip_push else 'yes'}")
        print(f"Runtime smoke test: {'no' if args.skip_runtime_test else 'yes'}")
        print(f"GitHub token source: {auth.source or 'not set'}")
        print(f"GitHub Pages URL: {pages_url}")
        return 0

    print_step("Validate plugin")
    for plugin, _plugin_owner, _plugin_repo, _plugin_repo_url in plugin_repo_infos:
        print(f"Plugin: {plugin.name} {plugin.version}")
        print(f"Manifest: {plugin.manifest_path}")

    push_token = ""
    if not args.skip_push:
        push_token = require_token(auth, "push the Bazaar repository")
        if args.create_repository:
            print_step("Ensure Bazaar GitHub repository exists")
            ensure_github_repository_exists(push_token, repo_slug, args.visibility)
        print_step("Verify GitHub push permission")
        ensure_github_push_permission(push_token, repo_slug)

    if not args.skip_runtime_test:
        print_step("Run plugin runtime smoke test")
        for plugin, _plugin_owner, _plugin_repo, _plugin_repo_url in plugin_repo_infos:
            print(f"Smoke: {plugin.name}", flush=True)
            run_plugin_runtime_smoke(plugin.plugin_dir)

    print_step("Package plugin and update local Bazaar")
    results: list[dict[str, object]] = []
    for plugin, plugin_owner, plugin_repo, plugin_repo_url in plugin_repo_infos:
        if not args.skip_sync_plugin_source:
            synced_plugin_dir = sync_plugin_source(plugin, plugin_source_root)
            print(f"Synced plugin source: {synced_plugin_dir}")
        result = publish_plugin_to_local_bazaar(
            plugin,
            bazaar_root,
            owner=plugin_owner,
            repo=plugin_repo,
            plugin_repo_url=plugin_repo_url,
            readme=args.readme,
            icon=args.icon,
            preview_image=args.preview_image,
            submission_name=args.submission_name,
            updated=args.updated,
        )
        results.append(result)
        print(json.dumps(result, ensure_ascii=False, indent=2))

    print_step("Validate and generate Bazaar")
    dist_dir = bazaar_root / "dist"
    bazaar_hash = generate_bazaar_dist(bazaar_root, dist_dir)
    print(f"Bazaar hash: {bazaar_hash}")
    print(f"Generated: {dist_dir}")

    push_result: dict[str, str] = {"pushed": "skipped"}
    if not args.skip_push:
        print_step("Push Bazaar repository to GitHub")
        export_dir = Path(args.export_dir).resolve() if args.export_dir else (EXPORT_ROOT / "sourceflow-plugins-publish").resolve()
        if args.commit_message:
            commit_message = args.commit_message
        elif len(plugin_repo_infos) == 1:
            plugin = plugin_repo_infos[0][0]
            commit_message = f"Publish {plugin.name} {plugin.version}"
        else:
            commit_message = "Publish SourceFlow plugins"
        push_result = publish_bazaar_to_github(
            bazaar_root,
            plugin_source_root if not args.skip_sync_plugin_source else None,
            args.bazaar_repository_url,
            args.branch,
            export_dir,
            push_token,
            commit_message,
            args.force_export_dir,
            not args.skip_workflow,
        )
        if not args.keep_export_dir and Path(push_result["exportDir"]).exists() and path_is_within(Path(push_result["exportDir"]), EXPORT_ROOT):
            remove_tree_force(Path(push_result["exportDir"]))
        if push_result.get("pushed") == "yes":
            print_step("Purge jsDelivr CDN cache")
            for result in results:
                purge_jsdelivr_cache(repo_slug, args.branch, bazaar_hash, str(result["repoURLHash"]))

    print_step("Done")
    for plugin, _plugin_owner, _plugin_repo, _plugin_repo_url in plugin_repo_infos:
        print(f"Plugin: {plugin.name} {plugin.version}")
    print(f"Bazaar repository: {repo_slug}")
    print(f"GitHub Pages URL: {pages_url}")
    print(f"Push: {push_result.get('pushed')}")
    cdn_base_url = f"https://cdn.jsdelivr.net/gh/{repo_slug}@{args.branch}".rstrip("/")
    print("SourceFlow Bazaar source settings (recommended CDN):")
    print(f"- Version Info URL: {cdn_base_url}/version.json")
    print(f"- Stage Base URL: {cdn_base_url}")
    print(f"- Package Base URL: {cdn_base_url}")
    print(f"- Stat Base URL: {cdn_base_url}/stat")
    print("- README CDN Base URL: https://cdn.jsdelivr.net/gh")
    print("GitHub Pages fallback:")
    print(f"- Version Info URL: {pages_url}version.json")
    print(f"- Stage Base URL: {pages_url.rstrip('/')}")
    print(f"- Package Base URL: {pages_url.rstrip('/')}")
    print(f"- Stat Base URL: {pages_url.rstrip('/')}/stat")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("插件商城发布失败: 用户中断。", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"插件商城发布失败: {exc}", file=sys.stderr)
        raise SystemExit(1)
