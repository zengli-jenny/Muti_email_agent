from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class AppConfig:
    base_dir: Path
    data_dir: Path
    skills_dir: Path
    knowledge_file: Path
    graph_file: Path
    business_data_file: Path
    memory_file: Path

    # LLM configuration
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = ""
    llm_temperature: float = 0.1

    # TCS API configuration
    tcs_base_url: str = ""
    tcs_token: str = ""
    use_mock_tcs: bool = False

    # Knowledge base (full)
    knowledge_full_file: Path = field(default_factory=lambda: Path(""))
    policy_dir: Path = field(default_factory=lambda: Path(""))
    policy_routing_file: Path = field(default_factory=lambda: Path(""))

    # ReAct configuration
    max_react_iterations: int = 7
    max_reflections: int = 2

    # Service
    service_host: str = "0.0.0.0"
    service_port: int = 8001

    @classmethod
    def from_base_dir(cls, base_dir: Path | None = None) -> "AppConfig":
        resolved_base = (base_dir or Path(__file__).resolve().parent.parent).resolve()
        data_dir = resolved_base / "data"
        skills_dir = resolved_base / "skills"
        return cls(
            base_dir=resolved_base,
            data_dir=data_dir,
            skills_dir=skills_dir,
            knowledge_file=data_dir / "knowledge_base.json",
            graph_file=data_dir / "catalog_graph.json",
            business_data_file=data_dir / "business_data.json",
            memory_file=data_dir / "memory.json",
            # LLM
            llm_base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
            llm_api_key=os.getenv("LLM_API_KEY", ""),
            llm_model=os.getenv("LLM_MODEL", "gpt-4o"),
            llm_temperature=float(os.getenv("LLM_TEMPERATURE", "0.1")),
            # TCS
            tcs_base_url=os.getenv("TCS_BASE_URL", "https://tcs.1000shores.cn"),
            tcs_token=os.getenv("TCS_TOKEN", ""),
            use_mock_tcs=os.getenv("USE_MOCK_TCS", "false").lower() == "true",
            # Knowledge & Policy
            knowledge_full_file=Path(os.getenv("KNOWLEDGE_BASE_PATH", str(data_dir / "knowledge_base_full.json"))),
            policy_dir=Path(os.getenv("POLICY_DIR", str(resolved_base / "标准流程"))),
            policy_routing_file=resolved_base / "政策路由.md",
            # ReAct
            max_react_iterations=int(os.getenv("MAX_REACT_ITERATIONS", "7")),
            max_reflections=int(os.getenv("MAX_REFLECTIONS", "2")),
            # Service
            service_host=os.getenv("SERVICE_HOST", "0.0.0.0"),
            service_port=int(os.getenv("SERVICE_PORT", "8001")),
        )
