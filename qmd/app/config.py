"""
Configuration management for QMD.
Reads collection definitions from per-instance YAML config files.
"""

import os
from typing import Optional

import yaml

# Base config directory
DEFAULT_CONFIG_DIR = os.path.expanduser("~/.config/qmd")


def get_config_dir() -> str:
    return os.environ.get("QMD_CONFIG_DIR", DEFAULT_CONFIG_DIR)


def get_config_path(instance_id: str) -> str:
    """Get config file path for a specific instance."""
    base = get_config_dir()
    return os.path.join(base, instance_id, "index.yml")


class ConfigManager:
    """Manages YAML-based collection configuration for a single instance."""

    def __init__(self, path: str):
        self.path = path
        self.config: dict = {"collections": {}}
        self.load()

    def load(self):
        if not os.path.exists(self.path):
            return
        try:
            with open(self.path, "r") as f:
                data = yaml.safe_load(f)
                if data:
                    self.config = data
                    if "collections" not in self.config:
                        self.config["collections"] = {}
        except Exception:
            pass

    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w") as f:
            yaml.safe_dump(self.config, f, default_flow_style=False, sort_keys=False)

    def get_collections(self) -> list[dict]:
        cols = []
        for name, data in self.config.get("collections", {}).items():
            col = {"name": name}
            col.update(data)
            cols.append(col)
        return cols

    def add_collection(self, name: str, path: str, pattern: str = "**/*.md"):
        if "collections" not in self.config:
            self.config["collections"] = {}
        self.config["collections"][name] = {"path": path, "pattern": pattern}
        self.save()

    def remove_collection(self, name: str) -> bool:
        if name in self.config.get("collections", {}):
            del self.config["collections"][name]
            self.save()
            return True
        return False

    def add_context(self, collection: str, path: str, text: str) -> bool:
        cols = self.config.get("collections", {})
        if collection not in cols:
            return False
        if "context" not in cols[collection]:
            cols[collection]["context"] = {}
        cols[collection]["context"][path] = text
        self.save()
        return True

    def remove_context(self, collection: str, path: str) -> bool:
        cols = self.config.get("collections", {})
        if collection not in cols:
            return False
        ctx = cols[collection].get("context", {})
        if path in ctx:
            del ctx[path]
            self.save()
            return True
        return False


def load_config(instance_id: str) -> ConfigManager:
    """Load configuration for a specific instance."""
    return ConfigManager(get_config_path(instance_id))
