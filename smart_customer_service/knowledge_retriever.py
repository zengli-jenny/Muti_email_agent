"""Local knowledge retriever — BM25 + TF-IDF over 1546 FAQ entries."""

from __future__ import annotations

import json
import math
import re
import logging
from collections import Counter
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9\u4e00-\u9fff]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


class KnowledgeRetriever:
    """BM25 + TF-IDF cosine retrieval over the full knowledge base."""

    def __init__(self, knowledge_file: Path) -> None:
        raw = json.loads(knowledge_file.read_text(encoding="utf-8"))
        self.docs: list[dict[str, Any]] = raw if isinstance(raw, list) else []
        logger.info("KnowledgeRetriever loaded %d entries", len(self.docs))

        # Pre-compute tokens and IDF
        self._doc_tokens: list[list[str]] = []
        self._doc_tf: list[Counter] = []
        self._df: Counter = Counter()
        self._avg_dl: float = 0.0

        total_len = 0
        for doc in self.docs:
            text = " ".join([
                doc.get("keyword", ""),
                doc.get("question", ""),
                doc.get("answer", ""),
            ])
            tokens = _tokenize(text)
            self._doc_tokens.append(tokens)
            tf = Counter(tokens)
            self._doc_tf.append(tf)
            self._df.update(tf.keys())
            total_len += len(tokens)

        n = len(self.docs)
        self._avg_dl = total_len / n if n > 0 else 1.0
        self._n = n

    def search(
        self,
        query: str,
        brand: str = "",
        product_model: str | None = None,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Return top-k results combining BM25 + TF-IDF cosine scores."""
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        query_tf = Counter(query_tokens)
        scores: list[tuple[int, float]] = []

        for i, doc in enumerate(self.docs):
            # Brand filter (loose — allow empty brand to match all)
            if brand:
                doc_brand = (doc.get("brand") or "").lower()
                if doc_brand and doc_brand != brand.lower() and doc_brand != "global":
                    continue

            # Product model filter
            if product_model:
                applicable = (doc.get("applicable_value") or "").upper()
                if applicable and product_model.upper() not in applicable:
                    continue

            bm25 = self._bm25_score(query_tokens, i)
            cosine = self._tfidf_cosine(query_tf, i)
            combined = bm25 + cosine * 5.0  # weight cosine higher
            if combined > 0:
                scores.append((i, combined))

        scores.sort(key=lambda x: x[1], reverse=True)
        results = []
        for idx, score in scores[:top_k]:
            doc = self.docs[idx]
            results.append({
                "id": doc.get("keyword", doc.get("id", "")),
                "question": doc.get("question", ""),
                "answer": doc.get("answer", ""),
                "score": round(score, 4),
                "applicable_value": doc.get("applicable_value", ""),
            })
        return results

    def search_as_text(
        self,
        query: str,
        brand: str = "",
        product_model: str | None = None,
        top_k: int = 5,
    ) -> str:
        """Return search results formatted as text for LLM prompt injection."""
        results = self.search(query, brand, product_model, top_k)
        if not results:
            return "未找到相关知识库条目。"
        parts = []
        for i, r in enumerate(results, 1):
            parts.append(
                f"[知识{i}] Q: {r['question']}\n"
                f"A: {r['answer']}\n"
                f"适用产品: {r['applicable_value']}"
            )
        return "\n\n".join(parts)

    # ── BM25 scoring ──

    def _bm25_score(self, query_tokens: list[str], doc_idx: int, k1: float = 1.5, b: float = 0.75) -> float:
        tf = self._doc_tf[doc_idx]
        dl = len(self._doc_tokens[doc_idx])
        score = 0.0
        for token in query_tokens:
            if token not in tf:
                continue
            df = self._df.get(token, 0)
            idf = math.log((self._n - df + 0.5) / (df + 0.5) + 1.0)
            term_freq = tf[token]
            numerator = term_freq * (k1 + 1)
            denominator = term_freq + k1 * (1 - b + b * dl / self._avg_dl)
            score += idf * numerator / denominator
        return score

    # ── TF-IDF cosine similarity ──

    def _tfidf_cosine(self, query_tf: Counter, doc_idx: int) -> float:
        doc_tf = self._doc_tf[doc_idx]
        terms = set(query_tf.keys()) | set(doc_tf.keys())
        dot = 0.0
        q_norm = 0.0
        d_norm = 0.0
        for t in terms:
            df = self._df.get(t, 1)
            idf = math.log(self._n / df + 1.0)
            q_w = query_tf.get(t, 0) * idf
            d_w = doc_tf.get(t, 0) * idf
            dot += q_w * d_w
            q_norm += q_w * q_w
            d_norm += d_w * d_w
        denom = math.sqrt(q_norm) * math.sqrt(d_norm)
        return dot / denom if denom > 0 else 0.0
