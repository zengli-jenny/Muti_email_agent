"""Skill Registry — Progressive Disclosure (L1 / L2 / L3).

Design:
  L1  Always-visible skill table injected into every solver prompt.
      Contains: id, name, trigger conditions, one-line summary.
      Token cost: ~50 tokens per skill × 15 skills ≈ 750 tokens total.

  L2  Core rules + reply-style guidelines loaded when solver calls
      load_skill(skill_id).  Corresponds to the "总纲" section of each
      standard-process file.  Injected into solver context on demand.

  L3  Full step-by-step SOP, scripts, edge-case tables.  Loaded when
      solver calls load_skill(skill_id, level=3).  Only the sections
      the solver explicitly requests are returned.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Data model
# ─────────────────────────────────────────────────────────────────────────────

class SkillEntry:
    """One entry in the registry."""

    def __init__(self, data: dict, policy_dir: Path) -> None:
        self.id: str = data["id"]
        self.name: str = data["name"]
        self.file: str = data["file"]
        self.trigger: str = data["trigger"]
        self.l1_summary: str = data["l1_summary"]
        self.l2_section: str = data.get("l2_section", "总纲")
        self.l3_sections: list[str] = data.get("l3_sections", [])
        self._policy_dir = policy_dir
        self._full_text: str | None = None

    # ── lazy load ──

    def _load_text(self) -> str:
        if self._full_text is None:
            path = self._policy_dir / self.file
            if path.exists():
                self._full_text = path.read_text(encoding="utf-8")
            else:
                logger.warning("Skill file not found: %s", path)
                self._full_text = ""
        return self._full_text

    # ── public accessors ──

    def get_l2(self) -> str:
        """Return the L2 section (总纲 / core rules)."""
        text = self._load_text()
        return _extract_section(text, self.l2_section) or _extract_first_section(text)

    def get_l3(self, section: str | None = None) -> str:
        """Return L3 content.

        If *section* is given, return only that section.
        Otherwise return everything after the L2 section.
        """
        text = self._load_text()
        if section:
            return _extract_section(text, section)
        # Return full text minus the L2 section header block
        l2_content = self.get_l2()
        if l2_content and l2_content in text:
            idx = text.find(l2_content)
            return text[idx + len(l2_content):].strip()
        return text

    def get_full(self) -> str:
        return self._load_text()


# ─────────────────────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────────────────────

class SkillRegistry:
    """Loads skill_registry.json and provides L1/L2/L3 access."""

    def __init__(self, registry_file: Path, policy_dir: Path) -> None:
        self._registry_file = registry_file
        self._policy_dir = policy_dir
        self._skills: dict[str, SkillEntry] = {}
        self._load()

    def _load(self) -> None:
        if not self._registry_file.exists():
            logger.warning("skill_registry.json not found: %s", self._registry_file)
            return
        data = json.loads(self._registry_file.read_text(encoding="utf-8"))
        for entry in data.get("skills", []):
            skill = SkillEntry(entry, self._policy_dir)
            self._skills[skill.id] = skill
        logger.info("SkillRegistry loaded %d skills", len(self._skills))

    def reload(self) -> None:
        """Hot-reload registry from disk (used after UI edits)."""
        self._skills.clear()
        self._load()

    # ── L1 table ──

    def build_l1_table(self) -> str:
        """Build the L1 skill table string for injection into solver prompt."""
        lines = [
            "| ID | 技能名称 | 触发条件 | 说明 |",
            "|---|---|---|---|",
        ]
        for s in self._skills.values():
            lines.append(f"| {s.id} | {s.name} | {s.trigger} | {s.l1_summary} |")
        return "\n".join(lines)

    # ── L2 / L3 load ──

    def load_skill(self, skill_id: str, level: int = 2) -> dict:
        """Load skill content at the requested level.

        Returns a dict with keys: id, name, content, level, available_l3_sections.
        """
        skill = self._skills.get(skill_id)
        if not skill:
            return {"error": f"Skill '{skill_id}' not found in registry"}

        if level == 2:
            content = skill.get_l2()
        elif level == 3:
            content = skill.get_full()
        else:
            content = skill.get_l2()

        return {
            "id": skill.id,
            "name": skill.name,
            "level": level,
            "content": content,
            "available_l3_sections": skill.l3_sections,
        }

    def load_skill_section(self, skill_id: str, section: str) -> dict:
        """Load a specific L3 section of a skill."""
        skill = self._skills.get(skill_id)
        if not skill:
            return {"error": f"Skill '{skill_id}' not found"}
        content = skill.get_l3(section)
        return {
            "id": skill.id,
            "name": skill.name,
            "section": section,
            "content": content,
        }

    # ── CRUD (for UI) ──

    def list_skills(self) -> list[dict]:
        return [
            {
                "id": s.id,
                "name": s.name,
                "file": s.file,
                "trigger": s.trigger,
                "l1_summary": s.l1_summary,
                "l2_section": s.l2_section,
                "l3_sections": s.l3_sections,
            }
            for s in self._skills.values()
        ]

    def get_skill_detail(self, skill_id: str) -> dict | None:
        skill = self._skills.get(skill_id)
        if not skill:
            return None
        return {
            "id": skill.id,
            "name": skill.name,
            "file": skill.file,
            "trigger": skill.trigger,
            "l1_summary": skill.l1_summary,
            "l2_section": skill.l2_section,
            "l3_sections": skill.l3_sections,
            "l2_content": skill.get_l2(),
            "full_content": skill.get_full(),
        }

    def update_registry_entry(self, skill_id: str, updates: dict) -> bool:
        """Persist updates to skill_registry.json."""
        if not self._registry_file.exists():
            return False
        data = json.loads(self._registry_file.read_text(encoding="utf-8"))
        for entry in data.get("skills", []):
            if entry["id"] == skill_id:
                for k, v in updates.items():
                    if k in ("name", "trigger", "l1_summary", "l2_section", "l3_sections"):
                        entry[k] = v
                break
        self._registry_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        self.reload()
        return True

    def update_skill_file(self, skill_id: str, content: str) -> bool:
        """Write updated markdown content back to the policy file."""
        skill = self._skills.get(skill_id)
        if not skill:
            return False
        path = self._policy_dir / skill.file
        path.write_text(content, encoding="utf-8")
        skill._full_text = None  # invalidate cache
        return True


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _extract_section(text: str, section_name: str) -> str:
    """Extract content under a markdown heading that matches section_name."""
    # Match # / ## / ### headings
    pattern = re.compile(
        r"(?:^|\n)(#{1,3})\s*" + re.escape(section_name) + r"\s*\n(.*?)(?=\n#{1,3}\s|\Z)",
        re.DOTALL,
    )
    m = pattern.search(text)
    if m:
        return m.group(0).strip()
    # Fallback: plain text search for the section name
    idx = text.find(section_name)
    if idx == -1:
        return ""
    # Return from that point to the next heading
    rest = text[idx:]
    next_heading = re.search(r"\n#{1,3}\s", rest[len(section_name):])
    if next_heading:
        return rest[: len(section_name) + next_heading.start()].strip()
    return rest.strip()


def _extract_first_section(text: str) -> str:
    """Return content up to the second top-level heading."""
    lines = text.splitlines()
    heading_count = 0
    result = []
    for line in lines:
        if re.match(r"^#{1,2}\s", line):
            heading_count += 1
            if heading_count > 1:
                break
        result.append(line)
    return "\n".join(result).strip()
