"""Hybrid knowledge retriever — Chroma vector search + BM25, fused via RRF.

Replaces the old pure BM25+TF-IDF retriever. Uses OpenAI-compatible embedding
API (e.g. Dashscope text-embedding-v4) and ChromaDB for persistent vector index.
BM25 is kept as a complementary signal and fused with vector results via
Reciprocal Rank Fusion (RRF).
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import re
from collections import Counter
from pathlib import Path
from typing import Any

import httpx
import chromadb

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9\u4e00-\u9fff]+")
_COLLECTION_NAME = "knowledge_base"
_BATCH_SIZE = 64  # embedding API batch size


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _doc_text(doc: dict) -> str:
    return " ".join([doc.get("keyword", ""), doc.get("question", ""), doc.get("answer", "")])


class _OpenAIEmbeddingFunction(chromadb.EmbeddingFunction):
    """Calls an OpenAI-compatible /v1/embeddings endpoint."""

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        self._url = base_url.rstrip("/") + "/embeddings"
        self._api_key = api_key
        self._model = model
        self._client = httpx.Client(timeout=60.0)

    def __call__(self, input: list[str]) -> list[list[float]]:
        all_embeddings: list[list[float]] = []
        for i in range(0, len(input), _BATCH_SIZE):
            batch = input[i : i + _BATCH_SIZE]
            resp = self._client.post(
                self._url,
                json={"input": batch, "model": self._model},
                headers={"Authorization": f"Bearer {self._api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            data.sort(key=lambda x: x["index"])
            all_embeddings.extend([d["embedding"] for d in data])
        return all_embeddings


class KnowledgeRetriever:
    """Hybrid retriever: Chroma vector search + BM25, fused via RRF."""

    def __init__(
        self,
        knowledge_file: Path,
        *,
        embedding_base_url: str = "",
        embedding_api_key: str = "",
        embedding_model: str = "text-embedding-v4",
        chroma_persist_dir: Path | None = None,
    ) -> None:
        # Load raw docs
        try:
            raw = json.loads(knowledge_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load knowledge base from %s: %s", knowledge_file, exc)
            raw = []
        self.docs: list[dict[str, Any]] = raw if isinstance(raw, list) else []
        logger.info("KnowledgeRetriever loaded %d entries from JSON", len(self.docs))

        # ── BM25 index (kept for hybrid fusion) ──
        self._doc_tokens: list[list[str]] = []
        self._doc_tf: list[Counter] = []
        self._df: Counter = Counter()
        self._avg_dl: float = 0.0

        total_len = 0
        for doc in self.docs:
            tokens = _tokenize(_doc_text(doc))
            self._doc_tokens.append(tokens)
            tf = Counter(tokens)
            self._doc_tf.append(tf)
            self._df.update(tf.keys())
            total_len += len(tokens)

        n = len(self.docs)
        self._avg_dl = total_len / n if n > 0 else 1.0
        self._n = n

        # ── Chroma vector index ──
        self._use_vector = bool(embedding_base_url and embedding_api_key and self.docs)
        self._embed_fn: _OpenAIEmbeddingFunction | None = None
        self._collection: chromadb.Collection | None = None

        if self._use_vector:
            try:
                self._embed_fn = _OpenAIEmbeddingFunction(
                    embedding_base_url, embedding_api_key, embedding_model,
                )
                self._init_chroma(chroma_persist_dir, knowledge_file)
            except Exception:
                logger.exception("Failed to initialize Chroma vector index, falling back to BM25-only")
                self._use_vector = False

    def _init_chroma(self, persist_dir: Path | None, knowledge_file: Path) -> None:
        """Initialize or load the Chroma collection, rebuilding if data changed."""
        # Compute a fingerprint of the knowledge file to detect changes
        file_hash = hashlib.md5(knowledge_file.read_bytes()).hexdigest()[:12]
        expected_count = len(self.docs)

        if persist_dir and str(persist_dir) != ".":
            persist_dir.mkdir(parents=True, exist_ok=True)
            client = chromadb.PersistentClient(path=str(persist_dir))
        else:
            client = chromadb.Client()

        # Check if collection exists and is up-to-date
        needs_rebuild = True
        try:
            col = client.get_collection(_COLLECTION_NAME, embedding_function=self._embed_fn)
            meta = col.metadata or {}
            if meta.get("file_hash") == file_hash and col.count() == expected_count:
                needs_rebuild = False
                self._collection = col
                logger.info("Chroma collection loaded from cache (%d docs, hash=%s)", col.count(), file_hash)
        except Exception:
            pass

        if needs_rebuild:
            logger.info("Building Chroma index for %d docs (hash=%s)...", expected_count, file_hash)
            # Delete old collection if exists
            try:
                client.delete_collection(_COLLECTION_NAME)
            except Exception:
                pass

            col = client.create_collection(
                _COLLECTION_NAME,
                embedding_function=self._embed_fn,
                metadata={"file_hash": file_hash},
            )

            # Batch upsert
            for i in range(0, len(self.docs), _BATCH_SIZE):
                batch = self.docs[i : i + _BATCH_SIZE]
                ids = [str(i + j) for j in range(len(batch))]
                documents = [_doc_text(doc) for doc in batch]
                metadatas = [
                    {
                        "brand": (doc.get("brand") or "").lower(),
                        "applicable_value": (doc.get("applicable_value") or "").upper(),
                        "keyword": doc.get("keyword", ""),
                        "idx": i + j,
                    }
                    for j, doc in enumerate(batch)
                ]
                col.add(ids=ids, documents=documents, metadatas=metadatas)

            self._collection = col
            logger.info("Chroma index built successfully (%d docs)", col.count())

    # ── Public API (unchanged signatures) ──

    def search(
        self,
        query: str,
        brand: str = "",
        product_model: str | None = None,
        top_k: int = 5,
    ) -> list[dict[str, Any]]:
        """Return top-k results via hybrid RRF (vector + BM25)."""
        if not self.docs:
            return []

        # BM25 ranking
        bm25_ranking = self._bm25_search(query, brand, product_model, top_k=top_k * 3)

        # Vector ranking
        vector_ranking = self._vector_search(query, brand, product_model, top_k=top_k * 3)

        if not vector_ranking:
            # Fallback to BM25-only
            return self._format_results(bm25_ranking[:top_k])

        # RRF fusion (k=60 is standard)
        fused = self._rrf_fuse(bm25_ranking, vector_ranking, k=60)
        return self._format_results(fused[:top_k])

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

    # ── Vector search via Chroma ──

    def _vector_search(
        self, query: str, brand: str, product_model: str | None, top_k: int,
    ) -> list[tuple[int, float]]:
        if not self._use_vector or not self._collection:
            return []

        where_filters = []
        if brand:
            where_filters.append({"$or": [{"brand": brand.lower()}, {"brand": ""}, {"brand": "global"}]})
        if product_model:
            where_filters.append({"applicable_value": {"$contains": product_model.upper()}})

        where = None
        if len(where_filters) == 1:
            where = where_filters[0]
        elif len(where_filters) > 1:
            where = {"$and": where_filters}

        try:
            results = self._collection.query(
                query_texts=[query],
                n_results=min(top_k, self._collection.count()),
                where=where if where else None,
            )
        except Exception:
            logger.exception("Chroma query failed")
            return []

        ranking: list[tuple[int, float]] = []
        if results and results["ids"] and results["ids"][0]:
            ids = results["ids"][0]
            distances = results["distances"][0] if results.get("distances") else [0.0] * len(ids)
            metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(ids)
            for doc_id, dist, meta in zip(ids, distances, metadatas):
                idx = meta.get("idx", int(doc_id))
                # Chroma returns L2 distance by default; convert to similarity
                similarity = 1.0 / (1.0 + dist)
                ranking.append((idx, similarity))

        return ranking

    # ── BM25 search ──

    def _bm25_search(
        self, query: str, brand: str, product_model: str | None, top_k: int,
    ) -> list[tuple[int, float]]:
        query_tokens = _tokenize(query)
        if not query_tokens:
            return []

        query_tf = Counter(query_tokens)
        scores: list[tuple[int, float]] = []

        for i, doc in enumerate(self.docs):
            if brand:
                doc_brand = (doc.get("brand") or "").lower()
                if doc_brand and doc_brand != brand.lower() and doc_brand != "global":
                    continue
            if product_model:
                applicable = (doc.get("applicable_value") or "").upper()
                if applicable and product_model.upper() not in applicable:
                    continue

            bm25 = self._bm25_score(query_tokens, i)
            cosine = self._tfidf_cosine(query_tf, i)
            combined = bm25 + cosine * 5.0
            if combined > 0:
                scores.append((i, combined))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

    # ── RRF fusion ──

    @staticmethod
    def _rrf_fuse(
        ranking_a: list[tuple[int, float]],
        ranking_b: list[tuple[int, float]],
        k: int = 60,
    ) -> list[tuple[int, float]]:
        """Reciprocal Rank Fusion of two ranked lists."""
        scores: dict[int, float] = {}
        for rank, (idx, _) in enumerate(ranking_a):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
        for rank, (idx, _) in enumerate(ranking_b):
            scores[idx] = scores.get(idx, 0.0) + 1.0 / (k + rank + 1)
        fused = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        return fused

    # ── Format results ──

    def _format_results(self, ranking: list[tuple[int, float]]) -> list[dict[str, Any]]:
        results = []
        for idx, score in ranking:
            if idx < 0 or idx >= len(self.docs):
                continue
            doc = self.docs[idx]
            results.append({
                "id": doc.get("keyword", doc.get("id", "")),
                "question": doc.get("question", ""),
                "answer": doc.get("answer", ""),
                "score": round(score, 4),
                "applicable_value": doc.get("applicable_value", ""),
            })
        return results

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
