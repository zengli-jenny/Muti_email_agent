from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class MemoryStore:
    def __init__(self, memory_file: Path) -> None:
        self.memory_file = memory_file
        if not self.memory_file.exists():
            self.memory_file.write_text("{}", encoding="utf-8")

    def get(self, customer_email: str) -> dict:
        data = self._read()
        return data.get(customer_email, {"facts": [], "history": []})

    def update(self, customer_email: str, facts: list[str], summary: str) -> None:
        data = self._read()
        record = data.setdefault(customer_email, {"facts": [], "history": []})

        existing = set(record["facts"])
        for fact in facts:
            if fact not in existing:
                record["facts"].append(fact)
                existing.add(fact)

        record["history"].append(summary)
        record["history"] = record["history"][-3:]
        self.memory_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def _read(self) -> dict:
        try:
            return json.loads(self.memory_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to read memory file, returning empty: %s", exc)
            return {}
