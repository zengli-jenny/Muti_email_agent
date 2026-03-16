"""Loads and indexes the 15 standard process .md files from 标准流程/ directory."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class PolicyLoader:
    """Loads all policy markdown files into memory at startup."""

    def __init__(self, policy_dir: Path) -> None:
        self.policy_dir = policy_dir
        self._policies: dict[str, str] = {}
        self._load_all()

    def _load_all(self) -> None:
        if not self.policy_dir.exists():
            logger.warning("Policy directory not found: %s", self.policy_dir)
            return
        for md_file in sorted(self.policy_dir.glob("*.md")):
            content = md_file.read_text(encoding="utf-8")
            self._policies[md_file.name] = content
            logger.debug("Loaded policy: %s (%d chars)", md_file.name, len(content))
        logger.info("PolicyLoader loaded %d policy files", len(self._policies))

    def get_policy(self, filename: str) -> str:
        """Return the full text of a policy file, or empty string if not found."""
        return self._policies.get(filename, "")

    def list_policies(self) -> list[str]:
        """Return all available policy filenames."""
        return list(self._policies.keys())

    def get_all(self) -> dict[str, str]:
        """Return all policies as {filename: content}."""
        return dict(self._policies)
