from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class SkillProfile:
    brand: str
    tone: str
    greeting: str
    closing: str
    approval_threshold_usd: float = 50.0
    rules: list[str] = field(default_factory=list)
    reply_style: list[str] = field(default_factory=list)
    raw_markdown: str = ""


class SkillLoader:
    def __init__(self, skills_dir: Path) -> None:
        self.skills_dir = skills_dir

    def load(self, brand: str) -> SkillProfile:
        skill_path = self.skills_dir / f"{brand.lower()}.md"
        if not skill_path.exists():
            return SkillProfile(
                brand=brand.lower(),
                tone="clear and professional",
                greeting="Hello,",
                closing="Best regards,",
                raw_markdown="",
            )

        return self._parse_markdown(skill_path.read_text(encoding="utf-8"), brand.lower())

    def _parse_markdown(self, text: str, brand: str) -> SkillProfile:
        metadata: dict[str, str] = {}
        sections: dict[str, list[str]] = {}
        current_section: str | None = None

        for raw_line in text.splitlines():
            line = raw_line.strip()
            if not line:
                continue

            if line.startswith("## "):
                current_section = line[3:].strip().lower()
                sections[current_section] = []
                continue

            if current_section is None and ":" in line:
                key, value = line.split(":", 1)
                metadata[key.strip().lower()] = value.strip()
                continue

            if current_section is not None:
                sections[current_section].append(line[2:].strip() if line.startswith("- ") else line)

        return SkillProfile(
            brand=metadata.get("brand", brand),
            tone=metadata.get("tone", "clear and professional"),
            greeting=metadata.get("greeting", "Hello,"),
            closing=metadata.get("closing", "Best regards,"),
            approval_threshold_usd=float(metadata.get("approvalthresholdusd", "50")),
            rules=sections.get("rules", []),
            reply_style=sections.get("replystyle", []),
            raw_markdown=text,
        )
