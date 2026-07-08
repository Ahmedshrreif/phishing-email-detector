from __future__ import annotations

import json
from pathlib import Path

from app.core.config import get_settings


def artifact_root() -> Path:
    root = Path(get_settings().model_storage_path)
    root.mkdir(parents=True, exist_ok=True)
    return root


def active_pointer_path() -> Path:
    return artifact_root() / "active_model.json"


def model_path_for_version(version: str) -> Path:
    return artifact_root() / version / "model.joblib"


def metrics_path_for_version(version: str) -> Path:
    return artifact_root() / version / "metrics.json"


def set_active_model(version: str) -> None:
    pointer = active_pointer_path()
    pointer.write_text(json.dumps({"version": version}, indent=2), encoding="utf-8")


def get_active_version() -> str | None:
    pointer = active_pointer_path()
    if pointer.exists():
        data = json.loads(pointer.read_text(encoding="utf-8"))
        return data.get("version")
    configured_version = get_settings().active_model_version.strip()
    if configured_version:
        return configured_version
    versions = sorted([path.name for path in artifact_root().iterdir() if path.is_dir()])
    return versions[-1] if versions else None


def get_active_model_path() -> Path | None:
    version = get_active_version()
    if not version:
        return None
    path = model_path_for_version(version)
    return path if path.exists() else None
