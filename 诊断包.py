#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Iterable, Mapping


PROJECT_ROOT = Path(__file__).resolve().parent
IS_WINDOWS = os.name == "nt"
SECRET_FILE_NAMES = {
    ".release.local.env",
    "public-release.local.env",
}
SECRET_SUFFIXES = {
    ".key",
    ".pem",
    ".p12",
    ".pfx",
    ".jks",
    ".keystore",
}
SECRET_PATTERNS = (
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
    re.compile(r"(?i)(token|secret|password|api[_-]?key|access[_-]?key)\s*[:=]\s*['\"]?[^'\"\s,;}]+"),
)


def redact_text(text: str) -> str:
    redacted = text
    for pattern in SECRET_PATTERNS:
        redacted = pattern.sub(lambda match: f"{match.group(0).split(':', 1)[0] if ':' in match.group(0) else 'secret'}: <redacted>", redacted)
    return redacted


def safe_read_text(path: Path, max_bytes: int = 1024 * 1024) -> str:
    with path.open("rb") as file:
        data = file.read(max_bytes)
    suffix = ""
    if path.stat().st_size > max_bytes:
        suffix = "\n<truncated>\n"
    return redact_text(data.decode("utf-8", errors="replace") + suffix)


def should_skip_file(path: Path) -> bool:
    name = path.name.lower()
    if name in SECRET_FILE_NAMES:
        return True
    if path.suffix.lower() in SECRET_SUFFIXES:
        return True
    return False


def write_text(archive: zipfile.ZipFile, relative_path: str, text: str) -> None:
    archive.writestr(relative_path, redact_text(text))


def add_text_file(archive: zipfile.ZipFile, source: Path, relative_path: str, max_bytes: int = 1024 * 1024) -> None:
    if not source.is_file() or should_skip_file(source):
        return
    try:
        write_text(archive, relative_path, safe_read_text(source, max_bytes=max_bytes))
    except OSError as exc:
        write_text(archive, f"{relative_path}.error.txt", str(exc))


def run_capture(args: list[str], cwd: Path) -> str:
    try:
        result = subprocess.run(args, cwd=cwd, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=20)
    except Exception as exc:
        return f"{args!r} failed: {exc}"
    output = (result.stdout or "") + (result.stderr or "")
    return redact_text(output.strip())


def user_conf_dir() -> Path:
    if IS_WINDOWS:
        return Path.home() / ".config" / "sourceflow"
    return Path.home() / ".config" / "sourceflow"


def read_workspace_config(conf_dir: Path) -> dict[str, object]:
    path = conf_dir / "workspace.json"
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if isinstance(data, dict):
        return data
    if isinstance(data, list):
        return {"workspace": data[-1] if data else "", "workspaces": data}
    return {}


def resolve_workspace(explicit: str) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser().resolve()
        return path if path.exists() else path
    conf = read_workspace_config(user_conf_dir())
    workspace = conf.get("workspace")
    if isinstance(workspace, str) and workspace.strip():
        return Path(workspace).expanduser().resolve()
    workspaces = conf.get("workspaces")
    if isinstance(workspaces, list):
        for item in workspaces:
            if isinstance(item, str) and item.strip():
                return Path(item).expanduser().resolve()
    return None


def file_stat(path: Path) -> dict[str, object]:
    try:
        stat = path.stat()
        return {
            "path": str(path),
            "exists": True,
            "is_file": path.is_file(),
            "is_dir": path.is_dir(),
            "size": stat.st_size,
            "modified": int(stat.st_mtime),
        }
    except OSError as exc:
        return {"path": str(path), "exists": False, "error": str(exc)}


def count_files(root: Path, excluded_dirs: Iterable[str]) -> dict[str, int]:
    excluded = {name.lower() for name in excluded_dirs}
    file_count = 0
    dir_count = 0
    total_bytes = 0
    if not root.is_dir():
        return {"files": 0, "dirs": 0, "bytes": 0}
    for current, dirs, files in os.walk(root):
        dirs[:] = [name for name in dirs if name.lower() not in excluded]
        dir_count += len(dirs)
        file_count += len(files)
        for name in files:
            try:
                total_bytes += (Path(current) / name).stat().st_size
            except OSError:
                pass
    return {"files": file_count, "dirs": dir_count, "bytes": total_bytes}


def workspace_summary(workspace: Path | None) -> Mapping[str, object]:
    if workspace is None:
        return {"workspace": None, "exists": False}
    temp_dir = workspace / "temp"
    data_dir = workspace / "data"
    conf_dir = workspace / "conf"
    db_files = [
        temp_dir / "siyuan.db",
        temp_dir / "history.db",
        temp_dir / "asset_content.db",
        temp_dir / "blocktree.db",
    ]
    return {
        "workspace": str(workspace),
        "exists": workspace.exists(),
        "lock": file_stat(workspace / ".lock"),
        "conf": count_files(conf_dir, excluded_dirs=()),
        "data": count_files(data_dir, excluded_dirs=("assets", "plugins")),
        "assets": count_files(data_dir / "assets", excluded_dirs=()),
        "plugins": count_files(data_dir / "plugins", excluded_dirs=("node_modules", "dist")),
        "temp": count_files(temp_dir, excluded_dirs=("repo", "os")),
        "databases": [file_stat(path) for path in db_files],
    }


def collect_known_logs(archive: zipfile.ZipFile, workspace: Path | None) -> None:
    conf_dir = user_conf_dir()
    for name in ("kernel.log", "sourceflow.log"):
        add_text_file(archive, conf_dir / name, f"logs/user-conf/{name}", max_bytes=2 * 1024 * 1024)
    add_text_file(archive, conf_dir / "workspace.json", "config/workspace.json", max_bytes=256 * 1024)

    if workspace is not None:
        for log_path in (
            workspace / "temp" / "sourceflow.log",
            workspace / "temp" / "kernel.log",
        ):
            add_text_file(archive, log_path, f"logs/workspace/{log_path.name}", max_bytes=2 * 1024 * 1024)

    if IS_WINDOWS:
        crash_dir = Path(os.environ.get("LOCALAPPDATA", "")) / "CrashDumps"
        if crash_dir.is_dir():
            lines: list[str] = []
            for path in sorted(crash_dir.glob("SourceFlow*.dmp"))[-20:]:
                lines.append(json.dumps(file_stat(path), ensure_ascii=False))
            if lines:
                write_text(archive, "crash-dumps/metadata.jsonl", "\n".join(lines))


def build_diagnostics(output: Path, workspace: Path | None) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        system_info = {
            "createdAt": int(time.time()),
            "platform": platform.platform(),
            "python": sys.version,
            "cwd": str(PROJECT_ROOT),
            "workspace": str(workspace) if workspace else None,
            "networkUpload": False,
            "noteContentIncluded": False,
        }
        write_text(archive, "system.json", json.dumps(system_info, ensure_ascii=False, indent=2))
        write_text(archive, "workspace-summary.json", json.dumps(workspace_summary(workspace), ensure_ascii=False, indent=2))
        write_text(archive, "git/status.txt", run_capture(["git", "status", "--short"], PROJECT_ROOT))
        write_text(archive, "git/revision.txt", run_capture(["git", "rev-parse", "--short", "HEAD"], PROJECT_ROOT))

        env = {
            key: ("<redacted>" if re.search(r"(?i)(token|secret|password|key)", key) else value)
            for key, value in os.environ.items()
            if key.startswith(("SOURCEFLOW_", "GITHUB_", "GH_"))
        }
        write_text(archive, "env-sanitized.json", json.dumps(env, ensure_ascii=False, indent=2, sort_keys=True))
        collect_known_logs(archive, workspace)
        write_text(
            archive,
            "README.txt",
            "SourceFlow diagnostics package. It is generated locally, does not upload data, "
            "and excludes note bodies by default. Review before sharing.\n",
        )
    return output


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python 诊断包.py",
        description="Create a local SourceFlow diagnostics zip without uploading secrets or note content.",
    )
    parser.add_argument("--workspace", default="", help="Workspace path. Defaults to the current SourceFlow workspace.json entry.")
    parser.add_argument("--output", default="", help="Output zip path. Defaults to .tmp/diagnostics/sourceflow-diagnostics-<time>.zip.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    workspace = resolve_workspace(args.workspace)
    if args.output:
        output = Path(args.output).expanduser().resolve()
    else:
        output = PROJECT_ROOT / ".tmp" / "diagnostics" / f"sourceflow-diagnostics-{time.strftime('%Y%m%d-%H%M%S')}.zip"
    result = build_diagnostics(output, workspace)
    print(f"Diagnostics package created: {result}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
