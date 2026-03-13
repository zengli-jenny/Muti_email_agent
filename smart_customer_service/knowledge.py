from __future__ import annotations

import json
import re
from pathlib import Path

from smart_customer_service.models import RetrievedItem


TOKEN_PATTERN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> set[str]:
    return set(TOKEN_PATTERN.findall(text.lower()))


class KnowledgeStore:
    def __init__(self, knowledge_file: Path, graph_file: Path) -> None:
        self.documents = json.loads(knowledge_file.read_text(encoding="utf-8"))
        self.graph = json.loads(graph_file.read_text(encoding="utf-8"))

    def hybrid_search(self, brand: str, query: str, top_k: int = 5) -> list[RetrievedItem]:
        merged: dict[str, RetrievedItem] = {}
        for item in self._exact_search(brand, query, top_k) + self._semantic_search(brand, query, top_k) + self._graph_search(brand, query, top_k):
            current = merged.get(item.item_id)
            if current is None or item.score > current.score:
                merged[item.item_id] = item
        return sorted(merged.values(), key=lambda item: item.score, reverse=True)[:top_k]

    def _exact_search(self, brand: str, query: str, top_k: int) -> list[RetrievedItem]:
        query_lower = query.lower()
        query_tokens = tokenize(query)
        results: list[RetrievedItem] = []

        for doc in self.documents:
            if doc["brand"] not in {brand.lower(), "global"}:
                continue
            keyword_hits = sum(2.0 for keyword in doc.get("keywords", []) if keyword.lower() in query_lower)
            token_hits = len(query_tokens & tokenize(doc["title"] + " " + doc["content"]))
            score = keyword_hits + token_hits
            if score <= 0:
                continue
            results.append(
                RetrievedItem(
                    item_id=doc["id"],
                    source="bm25",
                    title=doc["title"],
                    content=doc["content"],
                    score=score,
                    metadata={"doc_type": doc["doc_type"]},
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:top_k]

    def _semantic_search(self, brand: str, query: str, top_k: int) -> list[RetrievedItem]:
        query_tokens = tokenize(query)
        results: list[RetrievedItem] = []

        for doc in self.documents:
            if doc["brand"] not in {brand.lower(), "global"}:
                continue
            doc_tokens = tokenize(doc["title"] + " " + doc["content"])
            union = len(query_tokens | doc_tokens)
            if union == 0:
                continue
            score = (len(query_tokens & doc_tokens) / union) + 0.2
            if score <= 0.2:
                continue
            results.append(
                RetrievedItem(
                    item_id=doc["id"],
                    source="vector",
                    title=doc["title"],
                    content=doc["content"],
                    score=score,
                    metadata={"doc_type": doc["doc_type"]},
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:top_k]

    def _graph_search(self, brand: str, query: str, top_k: int) -> list[RetrievedItem]:
        query_lower = query.lower()
        node_lookup = {node["id"]: node for node in self.graph["nodes"]}
        relation_keywords = {
            "compatible_with": {"compatible", "nib", "accessory", "replace", "replacement"},
            "matches_feature": {"watercolor", "feature", "style", "recommend"},
            "replaces": {"replace", "alternative", "instead", "exchange"},
        }
        results: list[RetrievedItem] = []

        for edge in self.graph["edges"]:
            if edge["brand"] != brand.lower():
                continue
            relation = edge["relation"].lower()
            source = node_lookup[edge["source"]]
            target = node_lookup[edge["target"]]
            score = 0.0
            if source["name"].lower() in query_lower or target["name"].lower() in query_lower:
                score += 2.0
            if any(keyword in query_lower for keyword in relation_keywords.get(relation, set())):
                score += 2.0
            if score <= 0:
                continue
            results.append(
                RetrievedItem(
                    item_id=edge["id"],
                    source="graph",
                    title=f"{source['name']} -> {target['name']}",
                    content=edge["description"],
                    score=score,
                    metadata={"relation": edge["relation"]},
                )
            )

        return sorted(results, key=lambda item: item.score, reverse=True)[:top_k]
